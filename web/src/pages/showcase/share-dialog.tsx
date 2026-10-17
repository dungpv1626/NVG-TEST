/**
 * Gửi bộ mẫu cho khách: link xem trực tuyến có THỜI HẠN do người gửi đặt (chủ dự án chốt).
 *
 * Gửi từ đầu mối / cơ hội / khách hàng thì ghi luôn một dòng nhật ký chăm sóc, hẹn hỏi lại khách
 * thích mẫu nào — để «đã gửi mẫu» không nằm riêng trong Zalo.
 */

import { useState } from 'react';
import { formatDate, toNvgDateInput } from '@nvg/shared';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/hooks/use-error-message';
import { shareUrl, useCreateShare, type ShareSubject } from '@/hooks/use-showcase';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toNvgDateInput(d);
}

const QUICK = [
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
];

export function ShareDialog({
  itemIds,
  subject,
  forName,
  onClose,
  onCreated,
}: {
  itemIds: string[];
  subject: ShareSubject;
  forName: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const scope = useCompanyScope();
  const create = useCreateShare();
  const [title, setTitle] = useState(forName ? `Mẫu công trình gửi ${forName}` : '');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState(addDays(14));
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setError(null);
    if (!until) return setError('Chọn thời hạn của link.');
    try {
      // Hết hạn vào cuối ngày đã chọn, giờ Việt Nam.
      const expiresAt = new Date(`${until}T23:59:59+07:00`).toISOString();
      const res = await create.mutateAsync({
        itemIds,
        expiresAt,
        title: title.trim() || null,
        note: note.trim() || null,
        companyId: scope.isAggregate ? null : scope.companyId,
        subject,
      });
      const hasSubject = subject.leadId ?? subject.opportunityId ?? subject.customerId;
      if (hasSubject) {
        await supabase.from('contact_logs').insert({
          lead_id: subject.leadId ?? null,
          opportunity_id: subject.opportunityId ?? null,
          customer_id: subject.customerId ?? null,
          company_id: scope.companyId,
          channel: 'khac',
          content: `Gửi link ${itemIds.length} mẫu công trình (xem tới ${formatDate(until)}).`,
          next_action: 'Hỏi khách thích mẫu nào',
          next_action_at: addDays(2),
        });
      }
      setLink(shareUrl(res.token));
      onCreated();
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  if (link) {
    return (
      <ConfirmDialog
        title="Đã tạo link xem mẫu"
        confirmLabel={copied ? 'Đã chép link' : 'Chép link'}
        cancelLabel="Đóng"
        onConfirm={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
        onCancel={onClose}
      >
        <p className="break-all rounded-sm bg-surface-sunken px-3 py-2 font-mono text-sm">{link}</p>
        <p className="mt-2 text-fg-subtle">
          Gửi link qua Zalo / tin nhắn. Khách xem không cần đăng nhập, tới hết ngày{' '}
          {formatDate(until)}. Theo dõi khách đã mở chưa, hoặc thu hồi sớm, ở tab «Link đã gửi».
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={`Gửi ${itemIds.length} mẫu cho khách`}
      confirmLabel="Tạo link"
      pending={create.isPending}
      focusConfirm={false}
      onConfirm={() => void submit()}
      onCancel={onClose}
    >
      <div className="space-y-3">
        <Field label="Tiêu đề trang khách xem" optional>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Lời nhắn cho khách" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
          />
        </Field>
        <Field label="Link dùng được tới hết ngày" required group>
          <div className="space-y-2">
            <DateInput value={until} min={addDays(1)} onChange={setUntil} />
            <div className="flex gap-1">
              {QUICK.map((q) => (
                <button
                  key={q.days}
                  type="button"
                  onClick={() => setUntil(addDays(q.days))}
                  className="min-h-10 rounded-sm border border-border px-2 text-xs hover:bg-surface-hover sm:min-h-8"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </Field>
        <p className="text-xs text-fg-subtle">
          Trang khách xem chỉ có ảnh và thông số — không có giá, không có tên chủ nhà, chỉ ghi khu
          vực.
        </p>
        {error && (
          <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
