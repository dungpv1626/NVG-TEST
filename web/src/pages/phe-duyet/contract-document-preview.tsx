/**
 * Văn bản hợp đồng ngay trong Hộp thư Phê duyệt (Đợt 1 — 1E, khối nền K2).
 *
 * Chủ dự án chốt «gửi sếp duyệt kèm văn bản»: người duyệt đọc đúng bản Word sẽ ký (bản ghi ở
 * `contracts.submitted_document_id` lúc gửi — 0176), không phải mở hợp đồng rồi tìm. Xem tại chỗ
 * bằng docx-preview (nạp khi bấm), hoặc tải về mở bằng Word.
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DOCUMENT_BUCKET, downloadFile } from '@/hooks/use-contract-templates';
import { toUserMessage } from '@/hooks/use-error-message';
import { saveBlob } from '@/lib/docx-template';
import { supabase } from '@/lib/supabase';

interface SubmittedDocument {
  id: string;
  version: number;
  storage_path: string;
  file_name: string;
  missing_fields: string[];
  created_at: string;
}

export function ContractDocumentPreview({ contractId }: { contractId: string }) {
  const { data: doc, isLoading } = useQuery<SubmittedDocument | null>({
    queryKey: ['contracts', 'submitted-document', contractId],
    queryFn: async () => {
      const { data: c, error } = await supabase
        .from('contracts')
        .select('submitted_document_id')
        .eq('id', contractId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const docId = (c as { submitted_document_id: string | null } | null)?.submitted_document_id;
      if (!docId) return null;
      const { data, error: docError } = await supabase
        .from('contract_documents')
        .select('id, version, storage_path, file_name, missing_fields, created_at')
        .eq('id', docId)
        .maybeSingle();
      if (docError) throw new Error(docError.message);
      return (data ?? null) as SubmittedDocument | null;
    },
  });
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewRef.current;
    if (!blob || !el) return;
    let cancelled = false;
    el.replaceChildren();
    void import('docx-preview').then(({ renderAsync }) => {
      if (cancelled) return;
      void renderAsync(blob, el, undefined, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: true,
        breakPages: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (isLoading) return null;
  if (!doc) {
    return (
      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
        Hợp đồng gửi không kèm văn bản — pháp nhân chưa có mẫu Word cho loại hợp đồng này.
      </p>
    );
  }

  async function load(): Promise<Blob | null> {
    setError(null);
    setBusy(true);
    try {
      const b = blob ?? (await downloadFile(DOCUMENT_BUCKET, doc!.storage_path));
      setBlob(b);
      return b;
    } catch (e) {
      setError(toUserMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border px-3 py-2">
        <FileText className="size-4 text-fg-subtle" aria-hidden />
        <span className="font-medium">Văn bản gửi duyệt — bản {doc.version}</span>
        <span className="text-xs text-fg-subtle">lập {formatDateTime(doc.created_at)}</span>
        {doc.missing_fields.length > 0 && (
          <span className="text-xs text-status-pending">
            {doc.missing_fields.length} ô để trống điền tay
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {!blob && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
              {busy ? 'Đang mở…' : 'Xem văn bản'}
            </Button>
          )}
          <Button
            size="sm"
            variant="subtle"
            disabled={busy}
            onClick={() => void load().then((b) => b && saveBlob(b, doc.file_name))}
          >
            <Download />
            Tải về
          </Button>
        </span>
      </div>
      {error && (
        <p role="alert" className="text-status-overdue">
          {error}
        </p>
      )}
      {blob && (
        <div
          ref={viewRef}
          className="max-h-[32rem] overflow-auto rounded-sm border border-border bg-surface-sunken"
        />
      )}
    </div>
  );
}
