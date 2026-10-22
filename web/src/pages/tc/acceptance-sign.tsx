/**
 * Ký hai bên + in biên bản nghiệm thu (Đợt 2 — 2D, migration 0192).
 *
 * Cùng khuôn biên bản thu hồi giàn giáo (0145): hai khung ký trên cùng điện thoại, hoặc bản giấy
 * đã ký quét bằng bộ quét dùng chung. Ký xong phần ký bị khoá; với biên bản khách hàng / tổ đội,
 * Kế toán được báo ngay — màn hình nói trước điều đó để người ký biết mình xác nhận gì.
 *
 * Bản in tự điền từ hồ sơ (`acceptance_document`): công trình, hạng mục, danh mục kiểm tra kèm
 * kết quả, tồn tại, giá trị, chữ ký. Kế toán in được cùng bản này dù không xem được phân hệ Thi công.
 */

import { useRef, useState, type FormEvent } from 'react';
import { ScanLine } from 'lucide-react';
import {
  ACCEPTANCE_TYPE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  type AcceptanceType,
  type MoneyValue,
} from '@nvg/shared';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import { toUserMessage } from '@/hooks/use-error-message';
import { fetchAcceptanceDocument, useSignAcceptance } from '@/hooks/use-acceptance-sign';
import { CHECKLIST_RESULT_LABELS } from '@/hooks/use-acceptance-checklists';
import { escapeHtml, openPrintReport } from '@/lib/print-report';

type SignMethod = 'man_hinh' | 'ban_giay';

const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  man_hinh: 'Ký trên màn hình',
  ban_giay: 'Quét bản giấy đã ký',
};

/** Tên bên kia theo loại nghiệm thu — dùng cho nhãn ô ký và bản in. */
export function counterpartLabel(type: AcceptanceType): string {
  return type === 'khach_hang'
    ? 'Đại diện chủ đầu tư'
    : type === 'thau_phu'
      ? 'Đại diện tổ đội'
      : 'Người kiểm tra';
}

export function SignAcceptanceForm({
  siteId,
  acceptance,
  onDone,
}: {
  siteId: string;
  acceptance: {
    id: string;
    code: string | null;
    acceptance_type: AcceptanceType;
    value: MoneyValue | null;
    counterpart_signed_by: string | null;
  };
  onDone: () => void;
}) {
  const sign = useSignAcceptance();
  const nvgPad = useRef<SignaturePadHandle>(null);
  const otherPad = useRef<SignaturePadHandle>(null);
  const [method, setMethod] = useState<SignMethod>('man_hinh');
  const [name, setName] = useState(acceptance.counterpart_signed_by ?? '');
  const [title, setTitle] = useState('');
  const [scan, setScan] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = counterpartLabel(acceptance.acceptance_type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(`Ghi họ tên ${other.toLowerCase()} ký biên bản.`);
      return;
    }
    try {
      const base = {
        siteId,
        acceptanceId: acceptance.id,
        counterpartName: name.trim(),
        counterpartTitle: title.trim() || null,
      };
      if (method === 'man_hinh') {
        const nvgSignature = await nvgPad.current?.toBlob();
        const counterpartSignature = await otherPad.current?.toBlob();
        if (!nvgSignature || !counterpartSignature) {
          setError('Cần đủ chữ ký của hai bên trong hai khung ký.');
          return;
        }
        await sign.mutateAsync({ ...base, method, nvgSignature, counterpartSignature });
      } else {
        if (!scan) {
          setError('Quét bản giấy đã có chữ ký hai bên trước khi xác nhận.');
          return;
        }
        await sign.mutateAsync({ ...base, method, paperScan: scan });
      }
      onDone();
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    }
  }

  const tellsAccounting =
    acceptance.acceptance_type === 'khach_hang'
      ? ` Kế toán được báo ngay để thu tiền${
          acceptance.value != null ? ` ${formatCurrency(acceptance.value)}` : ''
        } theo hợp đồng.`
      : acceptance.acceptance_type === 'thau_phu'
        ? ' Kế toán được báo ngay để thanh toán cho tổ đội.'
        : '';

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="mt-3 space-y-4 border-t border-border pt-3"
      aria-label={`Ký biên bản ${acceptance.code ?? ''}`}
    >
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Họ tên ${other.toLowerCase()}`} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={128} />
        </Field>
        <Field label="Chức vụ">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={128}
            placeholder={acceptance.acceptance_type === 'thau_phu' ? 'Tổ trưởng' : 'Chủ nhà'}
          />
        </Field>
      </div>
      <SegmentedControl
        options={['man_hinh', 'ban_giay'] as const}
        value={method}
        onChange={setMethod}
        getLabel={(m) => SIGN_METHOD_LABELS[m]}
      />
      {method === 'man_hinh' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SignaturePad ref={otherPad} label={`Chữ ký ${other.toLowerCase()}`} />
          <SignaturePad ref={nvgPad} label="Chữ ký người lập biên bản (Nhà Việt)" />
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" variant="secondary" onClick={() => setScanning(true)}>
            <ScanLine />
            {scan ? 'Quét lại bản giấy' : 'Quét bản giấy đã ký'}
          </Button>
          {scan && <p className="text-sm text-status-completed">Đã quét: {scan.name}</p>}
          <p className="text-xs text-fg-subtle">
            In biên bản, hai bên ký trên giấy, rồi chụp các trang — máy nắn thẳng thành một tệp PDF.
          </p>
        </div>
      )}
      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
        Ký xong, phần ký bị khoá và không sửa được nữa.{tellsAccounting}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={sign.isPending}>
          {sign.isPending ? 'Đang lưu chữ ký…' : 'Xác nhận ký biên bản'}
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Để sau
        </Button>
      </div>
      {scanning && (
        <DocumentScanner
          title="Quét biên bản đã ký"
          fileName={`bien-ban-${acceptance.code ?? acceptance.id}.pdf`}
          onCancel={() => setScanning(false)}
          onDone={(file) => {
            setScan(file);
            setScanning(false);
          }}
        />
      )}
    </form>
  );
}

/** Mở bản in biên bản — dùng chung cho Thi công và Kế toán. Ném lỗi khi không đọc được. */
export async function printAcceptance(acceptanceId: string): Promise<void> {
  const { doc, urls } = await fetchAcceptanceDocument(acceptanceId);
  const other = counterpartLabel(doc.acceptance_type);
  const sig = (path: string | null) =>
    path && urls[path]
      ? `<img src="${escapeHtml(urls[path]!)}" alt="" style="height:80px;max-width:100%;object-fit:contain" />`
      : '<div style="height:80px"></div>';
  const rows = doc.checklist
    .map(
      (r, i) => `<tr>
  <td class="num">${i + 1}</td>
  <td>${escapeHtml(r.label)}</td>
  <td>${escapeHtml(CHECKLIST_RESULT_LABELS[r.result])}</td>
  <td>${escapeHtml(r.note ?? '')}${r.photos > 0 ? ` <span class="muted">(${r.photos} ảnh)</span>` : ''}</td>
</tr>`,
    )
    .join('');
  const counterpartName =
    doc.counterpart_signer_name ?? doc.counterpart_signed_by ?? '(Ký, ghi rõ họ tên)';

  const body = `
<dl>
  <div><dt>Pháp nhân</dt><dd>${escapeHtml(doc.company.name)}</dd></div>
  <div><dt>Công trình</dt><dd>${escapeHtml(`${doc.site.code} — ${doc.site.name}`)}</dd></div>
  ${doc.site.address ? `<div><dt>Địa điểm</dt><dd>${escapeHtml(doc.site.address)}</dd></div>` : ''}
  <div><dt>Loại nghiệm thu</dt><dd>${escapeHtml(ACCEPTANCE_TYPE_LABELS[doc.acceptance_type])}</dd></div>
  ${doc.subcontractor_name ? `<div><dt>Tổ đội</dt><dd>${escapeHtml(doc.subcontractor_name)}</dd></div>` : ''}
  <div><dt>Ngày nghiệm thu</dt><dd>${escapeHtml(formatDate(doc.accepted_date))}</dd></div>
</dl>
<h2>Hạng mục nghiệm thu: ${escapeHtml(doc.stage_name)}</h2>
${doc.scope ? `<p style="white-space:pre-wrap">${escapeHtml(doc.scope)}</p>` : ''}
${doc.value != null ? `<p>Giá trị khối lượng được nghiệm thu: <strong>${escapeHtml(formatCurrency(doc.value))}</strong></p>` : ''}
${
  rows
    ? `<table><thead><tr><th class="num">TT</th><th>Nội dung kiểm tra</th><th>Kết quả</th><th>Ghi chú</th></tr></thead><tbody>${rows}</tbody></table>`
    : ''
}
<p>Tồn tại cần khắc phục: ${doc.outstanding_issues ? escapeHtml(doc.outstanding_issues) : 'Không có.'}</p>
<table style="margin-top:24px">
  <tr><th style="width:50%">${escapeHtml(other)}</th><th>Người lập biên bản (Nhà Việt)</th></tr>
  <tr><td>${sig(doc.counterpart_signature_path)}</td><td>${sig(doc.nvg_signature_path)}</td></tr>
  <tr><td>${escapeHtml(counterpartName)}${doc.counterpart_signer_title ? ` — ${escapeHtml(doc.counterpart_signer_title)}` : ''}</td>
      <td>${escapeHtml(doc.signer_name ?? doc.accepted_by_name ?? '(Ký, ghi rõ họ tên)')}</td></tr>
</table>
${
  doc.paper_scan_path
    ? `<p class="muted">Hai bên ký trên bản giấy — bản quét lưu trên hệ thống${
        urls[doc.paper_scan_path]
          ? `: <a href="${escapeHtml(urls[doc.paper_scan_path]!)}">mở bản quét</a>`
          : ''
      }.</p>`
    : ''
}
${doc.signed_at ? `<p class="muted">Hai bên đã ký lúc ${escapeHtml(formatDateTime(doc.signed_at))}.</p>` : '<p class="muted">Biên bản chưa ký.</p>'}`;
  openPrintReport(`Biên bản nghiệm thu ${doc.code ?? ''}`, body);
}
