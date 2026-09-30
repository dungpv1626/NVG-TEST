/**
 * Tab Báo giá của Chi tiết Đề nghị mua — bảng so sánh chuẩn hóa (MH-04).
 *
 * PRD MH-04 nguyên văn: "lập bảng so sánh đã chuẩn hóa (đơn giá, thuế, vận chuyển, hao hụt,
 * thời hạn giao, điều kiện thanh toán, bảo hành) — KHÔNG CHỈ so sánh giá thấp nhất mà so
 * sánh tổng chi phí và rủi ro".
 *
 * Bảng dưới đây làm đúng hai vế đó và dừng lại ở đó:
 *  - Bốn cột tiền được quy về một mặt bằng, xếp hạng theo TỔNG CHI PHÍ.
 *  - Ba cột rủi ro (giao, thanh toán, bảo hành) để nguyên, KHÔNG quy thành tiền — quy đổi
 *    được thì phần mềm đã ngầm chọn hộ, đúng thứ "Ranh giới KHÔNG làm" của PRD cấm.
 * Không có dòng nào ghi "nên chọn nhà cung cấp này". Người mua chọn, và nếu chọn không phải
 * báo giá rẻ nhất thì CSDL bắt nêu căn cứ.
 *
 * Bảng này chứa báo giá của các nhà cung cấp KHÔNG được chọn — nội dung thương thảo (NEN-07).
 * Vai trò không được xem giá vốn sẽ nhận lỗi từ CSDL, và màn hình hiện lời giải thích thay
 * cho bảng chứ không tự đoán trước bằng vai trò ở trình duyệt.
 */

import { useState } from 'react';
import { Check, Truck, ShieldCheck } from 'lucide-react';
import {
  QUOTATION_STATUS_LABELS,
  SUPPLIER_CLASS_LABELS,
  formatCurrency,
  formatDate,
  type MoneyValue,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  usePurchaseRequestItems,
  useQuotationComparison,
  useQuotations,
  useSaveQuotation,
  useSelectQuotation,
  useSuppliers,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';

/** Phần trăm → điểm cơ bản. 10% ở ô nhập thành 1000 khi lưu. */
function toBasisPoints(percent: unknown): number {
  const value = Number(percent ?? 0);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function QuotationPanel({
  requestId,
  companyId,
  canWork,
  isOpenForQuotes,
}: {
  requestId: string;
  companyId: string;
  /** Có quyền sửa phân hệ Mua hàng — Ban công trường chỉ xem. */
  canWork: boolean;
  /** Đề nghị đang ở bước nhận báo giá (đã duyệt / đang mua). */
  isOpenForQuotes: boolean;
}) {
  const promptDialog = usePromptDialog();
  const { data: quotations, isLoading, error } = useQuotations(requestId);
  const { data: requestItems } = usePurchaseRequestItems(requestId);
  const { data: suppliers } = useSuppliers();
  const comparison = useQuotationComparison(requestId, (quotations?.length ?? 0) > 0);
  const saveQuotation = useSaveQuotation();
  const selectQuotation = useSelectQuotation();

  const [isFormOpen, setFormOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={3} columns={6} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const rows = quotations ?? [];
  const selected = rows.find((q) => q.status === 'duoc_chon');
  const canAddQuote = canWork && isOpenForQuotes && !selected;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPanelError(null);
    const form = event.currentTarget;
    const values = new FormData(form);

    const items = (requestItems ?? [])
      .map((item) => ({
        purchaseRequestItemId: item.id,
        itemCode: item.item_code,
        name: item.name,
        specification: item.specification,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(values.get(`price_${item.id}`) ?? 0),
      }))
      .filter((item) => item.unitPrice > 0);

    if (items.length === 0) {
      setPanelError(
        'Chưa nhập đơn giá cho mặt hàng nào. Báo giá không có dòng hàng thì không so sánh được.',
      );
      return;
    }

    try {
      await saveQuotation.mutateAsync({
        requestId,
        companyId,
        supplierId: String(values.get('supplier_id') ?? ''),
        quotedDate: String(values.get('quoted_date') ?? '') || null,
        validUntil: String(values.get('valid_until') ?? '') || null,
        taxRateBp: toBasisPoints(values.get('tax_rate')),
        wastageRateBp: toBasisPoints(values.get('wastage_rate')),
        shippingFee: Number(values.get('shipping_fee') ?? 0),
        deliveryDays: Number(values.get('delivery_days') ?? 0) || null,
        paymentTermDays: Number(values.get('payment_term_days') ?? 0) || null,
        warrantyMonths: Number(values.get('warranty_months') ?? 0) || null,
        items,
      });
      form.reset();
      setFormOpen(false);
    } catch (e) {
      setPanelError(toUserMessage(e, 'create'));
    }
  }

  async function choose(quotationId: string, isLowest: boolean) {
    setPanelError(null);
    let reason: string | null = null;
    if (!isLowest) {
      reason = await promptDialog.ask({
        title: 'Chọn báo giá không rẻ nhất?',
        label: 'Căn cứ chọn',
        detail:
          'Báo giá này không phải báo giá có tổng chi phí thấp nhất. Căn cứ được lưu cùng hồ sơ để người duyệt và Kế toán đọc lại.',
        placeholder: 'Tiến độ giao, bảo hành, điều kiện thanh toán, chất lượng đã kiểm chứng…',
        confirmLabel: 'Chọn nhà cung cấp này',
      });
      if (reason === null) return;
    }
    try {
      await selectQuotation.mutateAsync({
        quotationId,
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

      {rows.length === 0 ? (
        <EmptyState
          message={
            isOpenForQuotes
              ? 'Chưa có báo giá nào. Gửi yêu cầu báo giá tới ít nhất hai nhà cung cấp để có cơ sở so sánh.'
              : 'Chưa nhận báo giá. Đề nghị mua phải được phê duyệt trước khi hỏi giá nhà cung cấp.'
          }
        />
      ) : comparison.error ? (
        // Không phải lỗi kỹ thuật: đây là ranh giới NEN-07 đang làm đúng việc của nó.
        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <p className="font-medium">Bảng so sánh báo giá không mở cho vai trò hiện tại</p>
          <p className="mt-1 text-fg-muted">
            Báo giá của các nhà cung cấp không được chọn là nội dung thương thảo, chỉ Ban Giám đốc,
            Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng đọc được. Báo giá đã chọn vẫn hiển thị
            trong tab Đơn hàng.
          </p>
        </div>
      ) : comparison.isLoading ? (
        <TableSkeleton rows={3} columns={8} />
      ) : (
        <QuotationComparisonTable
          rows={comparison.data ?? []}
          canChoose={canWork && isOpenForQuotes && !selected}
          choosing={selectQuotation.isPending}
          onChoose={(id, isLowest) => void choose(id, isLowest)}
        />
      )}

      {selected?.selection_reason && (
        <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
          <span className="font-medium">Căn cứ chọn {selected.supplier?.name}: </span>
          {selected.selection_reason}
        </p>
      )}

      {canAddQuote && (
        <>
          <Button variant="secondary" onClick={() => setFormOpen((open) => !open)}>
            {isFormOpen ? 'Đóng biểu mẫu' : 'Nhập báo giá nhận được'}
          </Button>

          {isFormOpen && (
            <form
              onSubmit={(e) => void submit(e)}
              className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Nhà cung cấp" required className="lg:col-span-2">
                  <select
                    name="supplier_id"
                    required
                    className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                  >
                    <option value="">Chọn nhà cung cấp</option>
                    {(suppliers ?? [])
                      .filter((s) => s.supplier_class !== 'ngung_giao_dich')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Ngày báo giá">
                  <DateInput name="quoted_date" />
                </Field>
                <Field label="Hiệu lực đến">
                  <DateInput name="valid_until" />
                </Field>
                <Field label="Thuế suất (%)">
                  <Input
                    name="tax_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={10}
                  />
                </Field>
                <Field label="Hao hụt dự kiến (%)" hint="Phần phải mua bù, tính vào tổng chi phí.">
                  <Input
                    name="wastage_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={0}
                  />
                </Field>
                <Field label="Phí vận chuyển (đồng)">
                  <MoneyInput name="shipping_fee" defaultValue="0" />
                </Field>
                <Field label="Thời hạn giao (ngày)">
                  <Input name="delivery_days" type="number" min="0" step="1" />
                </Field>
                <Field label="Được nợ (ngày)">
                  <Input name="payment_term_days" type="number" min="0" step="1" />
                </Field>
                <Field label="Bảo hành (tháng)">
                  <Input name="warranty_months" type="number" min="0" step="1" />
                </Field>
              </div>

              <div>
                <p className="mb-2 font-medium">Đơn giá từng mặt hàng</p>
                <div className="space-y-3">
                  {(requestItems ?? []).map((item) => (
                    <Field
                      key={item.id}
                      label={`${item.name}${item.specification ? ` — ${item.specification}` : ''}`}
                      hint={`Số lượng cần: ${Number(item.quantity)} ${item.unit}`}
                    >
                      <MoneyInput
                        name={`price_${item.id}`}
                        placeholder="Đơn giá nhà cung cấp báo (đồng)"
                      />
                    </Field>
                  ))}
                </div>
              </div>

              <Button type="submit" variant="primary" disabled={saveQuotation.isPending}>
                Lưu báo giá
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

type ComparisonRow = NonNullable<ReturnType<typeof useQuotationComparison>['data']>[number];

/**
 * Bảng so sánh XOAY NGANG: mỗi nhà cung cấp một cột, mỗi tiêu chí một dòng — đúng cách bảng so
 * sánh báo giá được lập trên Excel ở phòng Mua hàng, và vừa khổ màn hình với 2–4 báo giá. Bảng
 * cũ (mỗi báo giá một dòng, 12 cột) phải cuộn ngang ở khổ 1440, cột Trạng thái và nút chọn
 * nằm khuất bên phải — đúng hai thứ người mua cần nhìn.
 *
 * Nhóm tiền quy về một mặt bằng và xếp hạng theo TỔNG CHI PHÍ; nhóm rủi ro (giao, được nợ, bảo
 * hành) để nguyên, không quy thành tiền — quy đổi được thì phần mềm đã ngầm chọn hộ (PRD MH-04).
 */
function QuotationComparisonTable({
  rows,
  canChoose,
  choosing,
  onChoose,
}: {
  rows: readonly ComparisonRow[];
  canChoose: boolean;
  choosing: boolean;
  onChoose: (quotationId: string, isLowest: boolean) => void;
}) {
  const money = (label: string, pick: (r: ComparisonRow) => MoneyValue) => ({
    label,
    render: (r: ComparisonRow) => formatCurrency(pick(r)),
    numeric: true,
  });
  const lines: {
    label: string;
    render: (r: ComparisonRow) => React.ReactNode;
    numeric?: boolean;
    strong?: boolean;
  }[] = [
    money('Tiền hàng', (r) => r.goods_subtotal),
    money('Hao hụt', (r) => r.wastage_amount),
    money('Thuế', (r) => r.tax_amount),
    money('Vận chuyển', (r) => r.shipping_fee),
    {
      label: 'Tổng chi phí',
      numeric: true,
      strong: true,
      render: (r) => (
        <>
          {formatCurrency(r.landed_total)}
          {r.cost_rank === 1 && (
            <span className="block text-xs font-normal text-fg-subtle">Tổng chi phí thấp nhất</span>
          )}
        </>
      ),
    },
    {
      label: 'Chênh lệch so với thấp nhất',
      numeric: true,
      render: (r) => (r.cost_rank === 1 ? EM_DASH : `+${formatCurrency(r.cost_gap_vs_lowest)}`),
    },
    {
      label: 'Thời hạn giao',
      render: (r) =>
        r.delivery_days != null ? (
          <span className="inline-flex items-center gap-1">
            <Truck className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            {r.delivery_days} ngày
          </span>
        ) : (
          EM_DASH
        ),
    },
    {
      label: 'Được nợ',
      render: (r) => (r.payment_term_days != null ? `${r.payment_term_days} ngày` : EM_DASH),
    },
    {
      label: 'Bảo hành',
      render: (r) =>
        r.warranty_months != null ? (
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            {r.warranty_months} tháng
          </span>
        ) : (
          EM_DASH
        ),
    },
  ];
  const chosenCell = (r: ComparisonRow) => (r.status === 'duoc_chon' ? 'bg-brand-subtle/60' : '');

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table
        className="w-full border-collapse text-left"
        style={{ minWidth: `${12 + rows.length * 12}rem` }}
      >
        <caption className="sr-only">
          Bảng so sánh báo giá đã chuẩn hóa theo tổng chi phí và điều kiện giao hàng
        </caption>
        <thead>
          <tr className="border-b border-border align-top">
            <th scope="col" className="w-48 px-4 py-3 text-xs font-medium text-fg-subtle">
              Tiêu chí
            </th>
            {rows.map((r) => (
              <th
                key={r.quotation_id}
                scope="col"
                className={`px-4 py-3 text-right font-normal ${chosenCell(r)}`}
              >
                <span className="block font-semibold">{r.supplier_name}</span>
                <span className="block text-xs text-fg-subtle">
                  {SUPPLIER_CLASS_LABELS[r.supplier_class]}
                  {r.quoted_date ? ` · Báo giá ${formatDate(r.quoted_date)}` : ''}
                </span>
                <span className="mt-1 block text-sm">
                  {r.status === 'duoc_chon' ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-status-completed">
                      <Check className="size-4 shrink-0" aria-hidden />
                      {QUOTATION_STATUS_LABELS.duoc_chon}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{QUOTATION_STATUS_LABELS[r.status]}</span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.label}
              className={`border-b border-border last:border-0 ${line.strong ? 'bg-surface-sunken' : ''}`}
            >
              <th scope="row" className="px-4 py-2 font-normal text-fg-muted">
                {line.label}
              </th>
              {rows.map((r) => (
                <td
                  key={r.quotation_id}
                  className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${
                    line.strong ? 'font-semibold' : ''
                  } ${chosenCell(r)}`}
                >
                  {line.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {canChoose && (
            <tr>
              <th scope="row" className="px-4 py-3 font-normal text-fg-muted">
                <span className="sr-only">Thao tác</span>
              </th>
              {rows.map((r) => (
                <td key={r.quotation_id} className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    disabled={choosing}
                    onClick={() => onChoose(r.quotation_id, r.cost_rank === 1)}
                  >
                    Chọn nhà cung cấp này
                  </Button>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
