/**
 * Ghi nhận hợp đồng đã ký (0187): số hợp đồng, ngày ký và BẢN ĐÃ KÝ (ảnh chụp / PDF).
 *
 * Ban Giám đốc thường không vào hệ thống — nhân viên đưa văn bản cho sếp ký trực tiếp (anh Dũng
 * 22/10/2026). Nên người chịu trách nhiệm hợp đồng ghi nhận được, với điều kiện tải bản đã ký lên
 * làm căn cứ; Ban Giám đốc vẫn ghi nhận được, bản chụp không bắt buộc. CSDL kiểm cùng điều kiện
 * (`contracts_stage_permissions`).
 */

import { useRef, useState } from 'react';
import { Paperclip, ScanLine } from 'lucide-react';
import { toNvgDateInput } from '@nvg/shared';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { uploadSignedScan } from '@/hooks/use-contract-scan';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSignContract } from '@/hooks/use-contracts';

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';

export function SignContractDialog({
  contractId,
  isApprover,
  opensSite,
  onClose,
}: {
  contractId: string;
  /** Ban Giám đốc — bản chụp không bắt buộc. */
  isApprover: boolean;
  /** Hợp đồng thi công: ký xong hệ thống tự mở công trình (0187). */
  opensSite: boolean;
  onClose: (signed: boolean) => void;
}) {
  const sign = useSignContract();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(toNvgDateInput(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function confirm() {
    setError(null);
    if (!number.trim()) return setError('Nhập số hợp đồng theo văn bản đã ký.');
    if (!date) return setError('Nhập ngày ký.');
    if (!isApprover && !file)
      return setError('Tải lên bản hợp đồng đã ký (ảnh chụp hoặc PDF) làm căn cứ.');
    setBusy(true);
    try {
      const path = file ? await uploadSignedScan(contractId, file) : null;
      await sign.mutateAsync({
        contractId,
        contractNumber: number.trim(),
        signedDate: date,
        signedScanPath: path,
      });
      onClose(true);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title="Ghi nhận hợp đồng đã ký"
      confirmLabel={busy ? 'Đang ghi nhận…' : 'Ghi nhận đã ký'}
      pending={busy}
      focusConfirm={false}
      onCancel={() => onClose(false)}
      onConfirm={() => void confirm()}
    >
      {scanning && (
        <DocumentScanner
          title="Quét bản hợp đồng đã ký"
          fileName={`Hop-dong-${number.trim().replace(/[^\w-]+/g, '-') || 'da-ky'}`}
          onDone={(f) => {
            setFile(f);
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      )}
      <p className="mb-3 text-sm text-fg-subtle">
        Ghi theo văn bản hai bên đã ký.
        {opensSite
          ? ' Ghi nhận xong, hệ thống tự mở công trình ở bước Chuẩn bị và báo Thi công.'
          : ''}
        {!isApprover ? ' Ban Giám đốc được báo kèm bản đã ký.' : ''}
      </p>
      <div className="space-y-3">
        <Field label="Số hợp đồng" required>
          <Input
            value={number}
            autoFocus
            placeholder="235/2026/HĐTC-NVC"
            onChange={(e) => setNumber(e.target.value)}
          />
        </Field>
        <Field label="Ngày ký" required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field
          label="Bản hợp đồng đã ký (ảnh chụp hoặc PDF)"
          required={!isApprover}
          optional={isApprover}
          hint="Quét bằng điện thoại: chụp từng trang, kéo 4 góc cho khớp mép giấy — các trang ghép thành một PDF. Đã có tệp PDF thì chọn tệp."
        >
          {/* Ô chọn tệp gốc của trình duyệt tự sinh chữ theo ngôn ngữ máy («Choose file») — ẩn
              đi, dùng nút tiếng Việt (CLAUDE.md 4.1), như phần đính kèm khảo sát. */}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setScanning(true)}>
              <ScanLine className="size-4" aria-hidden /> Quét bản đã ký
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" aria-hidden /> Chọn tệp
            </Button>
            <span className="text-sm text-fg-subtle">{file ? file.name : 'Chưa chọn tệp'}</span>
          </div>
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-status-overdue">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
