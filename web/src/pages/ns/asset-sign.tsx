/**
 * Ký nhận tài sản trên điện thoại (Đợt 5 — 5F, migration 0206) — cùng cách ký của biên bản thu
 * hồi giàn giáo / nghiệm thu: người nhận (hoặc người trả) vẽ chữ ký lên máy của Hành chính, ghi
 * tên; chữ ký vào kho `asset-signatures`, `sign_asset_event` ghi một lần, không sửa.
 */

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { toUserMessage } from '@/hooks/use-error-message';
import type { AssetEventRecord } from '@/hooks/use-hr';
import { supabase } from '@/lib/supabase';

const SIGNABLE = new Set(['cap_phat', 'dieu_chuyen', 'thu_hoi']);

export function AssetSignLine({
  event,
  companyId,
  canEdit,
  defaultSigner,
}: {
  event: AssetEventRecord;
  companyId: string;
  canEdit: boolean;
  defaultSigner: string;
}) {
  const queryClient = useQueryClient();
  const pad = useRef<SignaturePadHandle>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultSigner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!SIGNABLE.has(event.type)) return null;
  if (event.signed_at) {
    return (
      <p className="mt-1 text-sm text-status-completed">
        Đã ký nhận: {event.receiver_signer_name} — {formatDateTime(event.signed_at)}
      </p>
    );
  }
  if (!canEdit) {
    return <p className="mt-1 text-sm text-status-pending">Chưa ký nhận</p>;
  }
  if (!open) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-status-pending">Chưa ký nhận</span>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <PenLine className="size-4" aria-hidden />
          Ký nhận
        </Button>
      </div>
    );
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError('Vui lòng ghi tên người ký nhận.');
      return;
    }
    const blob = await pad.current?.toBlob();
    if (!blob) {
      setError('Chưa có chữ ký — ký vào khung rồi lưu.');
      return;
    }
    setBusy(true);
    try {
      const path = `${companyId}/${event.asset_id}/${event.id}/${crypto.randomUUID()}.png`;
      const up = await supabase.storage
        .from('asset-signatures')
        .upload(path, blob, { contentType: 'image/png', upsert: false });
      if (up.error) throw new Error('Không tải được chữ ký lên. Kiểm tra mạng rồi ký lại.');
      const { error: e } = await supabase.rpc('sign_asset_event', {
        p_event_id: event.id,
        p_signer_name: name.trim(),
        p_signature_path: path,
      });
      if (e) throw e;
      await queryClient.invalidateQueries({ queryKey: ['asset-events'] });
      setOpen(false);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-sm bg-surface-sunken p-3">
      <Field label="Tên người ký nhận" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <SignaturePad ref={pad} label="Chữ ký người nhận" />
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Lưu chữ ký
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Hủy
        </Button>
      </div>
    </div>
  );
}
