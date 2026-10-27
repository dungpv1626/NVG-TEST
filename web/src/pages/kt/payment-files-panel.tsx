/**
 * «Chứng từ đính kèm» của đề nghị thanh toán (0228): hóa đơn, biên bản, phiếu giao hàng chụp / quét bằng bộ quét dùng
 * chung, hoặc tải tệp lên. Còn Nháp / bị trả về: người sửa được đề nghị thêm, gỡ. Đã duyệt / đã chi: Kế toán chỉ thêm
 * chứng từ chi. Các bước khác: chỉ xem — người duyệt duyệt đúng bộ lúc gửi.
 */

import { useRef, useState } from 'react';
import { FileText, FileUp, ScrollText, Trash2 } from 'lucide-react';
import { formatDateTime } from '@nvg/shared';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  PAYMENT_FILE_ACCEPT,
  PAYMENT_FILE_KIND_LABELS,
  paymentFileUrl,
  useDeletePaymentFile,
  usePaymentFiles,
  useUploadPaymentFiles,
  type PaymentFile,
  type PaymentFileKind,
} from '@/hooks/use-payment-files';

const SELECT_CLASS = 'h-9 rounded-field border border-border-strong bg-surface px-2 text-sm';
const DRAFT_KINDS: PaymentFileKind[] = ['hoa_don', 'chung_tu', 'khac'];

export function PaymentFilesPanel({
  requestId,
  requestCode,
  mode,
}: {
  requestId: string;
  requestCode: string;
  /** `draft`: thêm / gỡ mọi loại · `paid`: chỉ thêm chứng từ chi · `view`: chỉ xem. */
  mode: 'draft' | 'paid' | 'view';
}) {
  const { data: files = [], isLoading } = usePaymentFiles(requestId);
  const upload = useUploadPaymentFiles();
  const remove = useDeletePaymentFile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PaymentFileKind>(mode === 'paid' ? 'chi' : 'hoa_don');
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PaymentFile | null>(null);
  const canAdd = mode !== 'view';
  const effectiveKind: PaymentFileKind = mode === 'paid' ? 'chi' : kind;

  async function uploadFiles(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    setMessage(null);
    try {
      const { uploaded, skipped } = await upload.mutateAsync({
        requestId,
        files: list,
        kind: effectiveKind,
      });
      setMessage(
        `Đã đính kèm ${uploaded} tệp.` +
          (skipped.length ? ` Bỏ qua vì quá 25 MB: ${skipped.join(', ')}.` : ''),
      );
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function open(file: PaymentFile) {
    setError(null);
    try {
      window.open(await paymentFileUrl(file.storage_path), '_blank', 'noopener');
    } catch (e) {
      setError(toUserMessage(e));
    }
  }

  if (isLoading) return null;

  return (
    <section aria-labelledby="chung-tu-dinh-kem" className="rounded-card bg-surface p-4">
      {scanning && (
        <DocumentScanner
          title="Quét chứng từ"
          fileName={`${requestCode}-${effectiveKind === 'chi' ? 'chung-tu-chi' : 'chung-tu'}`}
          onDone={(file) => {
            setScanning(false);
            void uploadFiles([file]);
          }}
          onCancel={() => setScanning(false)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="chung-tu-dinh-kem" className="font-semibold">
          Chứng từ đính kèm{files.length > 0 && ` (${files.length})`}
        </h3>
        {canAdd && (
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'draft' && (
              <select
                aria-label="Loại chứng từ"
                className={SELECT_CLASS}
                value={kind}
                onChange={(e) => setKind(e.target.value as PaymentFileKind)}
              >
                {DRAFT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT_FILE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => setScanning(true)}
            >
              <ScrollText />
              {mode === 'paid' ? 'Quét chứng từ chi' : 'Quét chứng từ'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp />
              {upload.isPending ? 'Đang tải lên…' : 'Tải tệp lên'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={PAYMENT_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = '';
                void uploadFiles(list);
              }}
            />
          </div>
        )}
      </div>

      <p className="mt-1 text-sm text-fg-subtle">
        {mode === 'draft'
          ? 'Đính kèm hóa đơn, biên bản, phiếu giao hàng trước khi gửi phê duyệt — gửi rồi thì bộ chứng từ khoá lại.'
          : mode === 'paid'
            ? 'Đề nghị đã duyệt — chỉ thêm chứng từ chi (ủy nhiệm chi, phiếu chi).'
            : 'Bộ chứng từ đã khoá theo lúc gửi phê duyệt.'}
      </p>
      {message && (
        <p role="status" className="mt-2 text-sm text-status-completed">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <p className="mt-2 text-fg-subtle">Chưa có chứng từ nào được đính kèm.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-sm border border-border p-2"
            >
              <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <button
                type="button"
                onClick={() => void open(f)}
                className="min-w-0 flex-1 truncate text-left font-medium text-brand hover:underline"
              >
                {f.file_name}
              </button>
              <span className="text-sm text-fg-subtle">
                {PAYMENT_FILE_KIND_LABELS[f.kind]} · {f.creator?.full_name ?? 'Hệ thống'} ·{' '}
                {formatDateTime(f.created_at)}
              </span>
              {mode === 'draft' && (
                <button
                  type="button"
                  onClick={() => setDeleting(f)}
                  aria-label={`Gỡ ${f.file_name}`}
                  className="grid size-10 place-items-center rounded-sm text-fg-subtle hover:text-status-overdue"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Gỡ «${deleting.file_name}»?`}
          confirmLabel="Gỡ chứng từ"
          cancelLabel="Không gỡ"
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const target = deleting;
            setDeleting(null);
            remove.mutate(target, { onError: (e) => setError(toUserMessage(e, 'edit')) });
          }}
        >
          <p>Tệp bị xoá khỏi đề nghị và khỏi kho lưu trữ.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
