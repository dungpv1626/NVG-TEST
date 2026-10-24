/**
 * Tab Báo giá của Chi tiết Đề nghị mua — bảng so giá nhà cung cấp (MH-04, Đợt 4 — 4B).
 *
 * PRD MH-04: «không chỉ so sánh giá thấp nhất mà so sánh tổng chi phí và rủi ro». Bảng đặt các
 * báo giá cạnh nhau (`QuotationBoardTable`): tổng chi phí xếp hạng, giao, vận chuyển, hoá đơn VAT,
 * điều kiện, đơn giá từng mặt hàng cạnh giá lần mua trước. Người mua chọn; chọn không rẻ nhất thì
 * CSDL bắt nêu căn cứ (`select_quotation`). Máy không có dòng «nên chọn».
 *
 * Từ Đợt 4 báo giá nhập được ngay khi đề nghị còn Nháp / Chờ duyệt — người duyệt thấy bảng này
 * trong Hộp thư Phê duyệt. Đơn hàng vẫn chỉ lập sau khi đề nghị được duyệt.
 *
 * Bảng chứa báo giá không được chọn — nội dung thương thảo (NEN-07). Vai trò không xem giá vốn nhận
 * lỗi từ CSDL; màn hình hiện lời giải thích thay cho bảng.
 */

import { useState } from 'react';
import { ScanLine, Upload } from 'lucide-react';
import { formatNumber, toNvgDateInput } from '@nvg/shared';
import { DocumentScanner } from '@/components/scan/document-scanner';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { useSelectQuotation, useSuppliers } from '@/hooks/use-purchasing';
import {
  useQuotationBoard,
  useSaveQuotationBoard,
  type BoardQuotation,
  type QuotationBoard,
} from '@/hooks/use-purchase-pool';
import { toUserMessage } from '@/hooks/use-error-message';
import { QuotationBoardTable } from './quotation-board';

/** Phần trăm gõ tay (`10`, `8,5`) → điểm cơ bản. */
function toBasisPoints(text: string): number {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function intOrNull(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
}

export function QuotationPanel({
  requestId,
  canWork,
  isOpenForQuotes,
}: {
  requestId: string;
  /** Có quyền sửa phân hệ Mua hàng — Ban công trường chỉ xem. */
  canWork: boolean;
  /** Đề nghị còn nhận báo giá (Nháp → Đang mua). */
  isOpenForQuotes: boolean;
}) {
  const promptDialog = usePromptDialog();
  const { data: board, isLoading, error } = useQuotationBoard(requestId);
  const selectQuotation = useSelectQuotation();
  const [isFormOpen, setFormOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={4} columns={5} />;
  if (error) {
    // Không phải lỗi kỹ thuật: ranh giới NEN-07 đang làm đúng việc của nó.
    return (
      <div className="rounded-card bg-surface-sunken p-4">
        <p className="font-medium">Bảng so giá không mở cho vai trò hiện tại</p>
        <p className="mt-1 text-fg-subtle">
          Báo giá của các nhà cung cấp là nội dung thương thảo, chỉ Ban Giám đốc, Tài chính, Dự án –
          Đấu thầu, Thiết kế và Mua hàng đọc được. Báo giá đã chọn hiển thị trong tab Đơn hàng.
        </p>
      </div>
    );
  }

  const quotes = board?.quotations ?? [];
  const selected = quotes.find((q) => q.status === 'duoc_chon');
  const canEdit = canWork && isOpenForQuotes && !selected;

  async function choose(q: BoardQuotation) {
    setPanelError(null);
    let reason: string | null = null;
    if (q.cost_rank !== 1) {
      reason = await promptDialog.ask({
        title: 'Chọn báo giá không rẻ nhất?',
        label: 'Căn cứ chọn',
        detail:
          'Báo giá này không có tổng chi phí thấp nhất. Căn cứ được lưu cùng hồ sơ để người duyệt và Kế toán đọc lại.',
        placeholder: 'Tiến độ giao, hoá đơn VAT, bảo hành, chất lượng đã kiểm chứng…',
        confirmLabel: 'Chọn nhà cung cấp này',
      });
      if (reason === null) return;
    }
    try {
      await selectQuotation.mutateAsync({
        quotationId: q.quotation_id,
        requestId,
        reason: reason ?? undefined,
      });
    } catch (e) {
      setPanelError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {promptDialog.dialog}
      {panelError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {panelError}
        </p>
      )}

      {quotes.length === 0 ? (
        <EmptyState
          message={
            isOpenForQuotes
              ? 'Chưa có báo giá nào. Hỏi giá ít nhất hai nhà cung cấp để có cơ sở so sánh — có thể nhập ngay khi đề nghị còn chờ duyệt.'
              : 'Đề nghị đã đóng, không nhận báo giá.'
          }
        />
      ) : (
        <QuotationBoardTable
          board={board!}
          canChoose={canEdit}
          choosing={selectQuotation.isPending}
          onChoose={(q) => void choose(q)}
        />
      )}

      {canEdit && (
        <>
          <Button onClick={() => setFormOpen((open) => !open)}>
            {isFormOpen ? 'Đóng biểu mẫu' : 'Nhập / sửa báo giá nhà cung cấp'}
          </Button>
          {isFormOpen && board && (
            <QuotationForm requestId={requestId} board={board} onSaved={() => setFormOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}

function QuotationForm({
  requestId,
  board,
  onSaved,
}: {
  requestId: string;
  board: QuotationBoard;
  onSaved: () => void;
}) {
  const { data: suppliers } = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const existing = board.quotations.find((q) => q.supplier_id === supplierId);

  return (
    <div className="space-y-4 rounded-card bg-surface-sunken p-4">
      <Field label="Nhà cung cấp" required>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="h-10 w-full rounded-sm border border-border-strong bg-surface px-3 sm:max-w-md"
        >
          <option value="">Chọn nhà cung cấp</option>
          {(suppliers ?? [])
            .filter((s) => s.supplier_class !== 'ngung_giao_dich')
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {board.quotations.some((q) => q.supplier_id === s.id) ? ' (đã có báo giá)' : ''}
              </option>
            ))}
        </select>
      </Field>
      {supplierId && (
        <QuotationFields
          // Đổi nhà cung cấp thì dựng lại ô với giá trị của báo giá đó (nếu có).
          key={supplierId}
          requestId={requestId}
          supplierId={supplierId}
          board={board}
          existing={existing}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function QuotationFields({
  requestId,
  supplierId,
  board,
  existing,
  onSaved,
}: {
  requestId: string;
  supplierId: string;
  board: QuotationBoard;
  existing: BoardQuotation | undefined;
  onSaved: () => void;
}) {
  const save = useSaveQuotationBoard();
  const [quotedDate, setQuotedDate] = useState(existing?.quoted_date ?? toNvgDateInput(new Date()));
  const [validUntil, setValidUntil] = useState(existing?.valid_until ?? '');
  const [tax, setTax] = useState(existing ? formatNumber(existing.tax_rate_bp / 100) : '10');
  const [wastage, setWastage] = useState(
    existing ? formatNumber(existing.wastage_rate_bp / 100) : '0',
  );
  const [shipping, setShipping] = useState(existing ? String(existing.shipping_fee) : '0');
  const [deliveryDays, setDeliveryDays] = useState(existing?.delivery_days?.toString() ?? '');
  const [paymentDays, setPaymentDays] = useState(existing?.payment_term_days?.toString() ?? '');
  const [warranty, setWarranty] = useState(existing?.warranty_months?.toString() ?? '');
  const [vat, setVat] = useState(
    existing?.has_vat_invoice == null ? '' : existing.has_vat_invoice ? 'co' : 'khong',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      board.lines.map((l) => [
        l.request_item_id,
        existing && l.prices[existing.quotation_id] != null
          ? String(l.prices[existing.quotation_id])
          : '',
      ]),
    ),
  );
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!Object.values(prices).some((p) => p && p !== '0')) {
      setError('Chưa nhập đơn giá cho mặt hàng nào. Báo giá không có dòng hàng thì không so được.');
      return;
    }
    try {
      await save.mutateAsync({
        requestId,
        supplierId,
        header: {
          quoted_date: quotedDate || null,
          valid_until: validUntil || null,
          tax_rate_bp: toBasisPoints(tax),
          wastage_rate_bp: toBasisPoints(wastage),
          shipping_fee: shipping || '0',
          delivery_days: intOrNull(deliveryDays),
          payment_term_days: intOrNull(paymentDays),
          warranty_months: intOrNull(warranty),
          has_vat_invoice: vat === '' ? null : vat === 'co',
          notes: notes.trim() || null,
        },
        prices,
        file,
      });
      onSaved();
    } catch (e) {
      setError(toUserMessage(e, existing ? 'edit' : 'create'));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {scanning && (
        <DocumentScanner
          title="Quét báo giá giấy của nhà cung cấp"
          fileName="bao-gia"
          onDone={(f) => {
            setFile(f);
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ngày báo giá">
          <DateInput value={quotedDate} onChange={setQuotedDate} />
        </Field>
        <Field label="Hiệu lực đến">
          <DateInput value={validUntil} onChange={setValidUntil} />
        </Field>
        <Field label="Thuế suất (%)">
          <Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
        </Field>
        <Field label="Hao hụt dự kiến (%)" hint="Phần phải mua bù, tính vào tổng chi phí.">
          <Input inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} />
        </Field>
        <Field label="Phí vận chuyển (đồng)">
          <MoneyInput value={shipping} onChange={setShipping} />
        </Field>
        <Field label="Thời hạn giao (ngày)">
          <Input
            inputMode="numeric"
            value={deliveryDays}
            onChange={(e) => setDeliveryDays(e.target.value)}
          />
        </Field>
        <Field label="Có hoá đơn VAT">
          <select
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface px-3"
          >
            <option value="">Chưa hỏi</option>
            <option value="co">Có</option>
            <option value="khong">Không</option>
          </select>
        </Field>
        <Field label="Được nợ (ngày)">
          <Input
            inputMode="numeric"
            value={paymentDays}
            onChange={(e) => setPaymentDays(e.target.value)}
          />
        </Field>
        <Field label="Bảo hành (tháng)">
          <Input
            inputMode="numeric"
            value={warranty}
            onChange={(e) => setWarranty(e.target.value)}
          />
        </Field>
        <Field label="Ghi chú" className="sm:col-span-2 lg:col-span-3">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Điều kiện giao, chất lượng, mẫu đã xem…"
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 font-medium">Đơn giá từng mặt hàng</p>
        <p className="mb-2 text-xs text-fg-subtle">
          Để trống mặt hàng nhà cung cấp không báo. Báo giá thiếu mặt hàng không chọn được.
        </p>
        <div className="space-y-3">
          {board.lines.map((line) => (
            <Field
              key={line.request_item_id}
              label={`${line.name}${line.specification ? ` — ${line.specification}` : ''}`}
              hint={`Số lượng cần: ${formatNumber(Number(line.quantity))} ${line.unit}`}
            >
              <MoneyInput
                value={prices[line.request_item_id] ?? ''}
                onChange={(v) => setPrices((p) => ({ ...p, [line.request_item_id]: v }))}
                placeholder={`Đơn giá (đồng / ${line.unit})`}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium">Tệp báo giá</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setScanning(true)}>
            <ScanLine className="size-4" aria-hidden />
            Quét báo giá giấy
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 hover:bg-surface-hover">
            <Upload className="size-4" aria-hidden />
            Chọn tệp (PDF, ảnh)
            <input
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <span className="text-fg-subtle">
            {file
              ? `Sẽ lưu: ${file.name}`
              : existing?.document_path
                ? 'Đã có tệp — chọn tệp mới để thay'
                : 'Chưa có tệp'}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={save.isPending}>
        Lưu báo giá
      </Button>
    </form>
  );
}
