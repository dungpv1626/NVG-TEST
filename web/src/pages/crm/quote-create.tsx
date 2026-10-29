/**
 * Lập phiên bản báo giá (PRD CRM-04, CRM-05) — mẫu bố cục 4 "Biểu mẫu" (Webapp Flow 4.4).
 *
 * MỘT TRANG, không chia bước. Lưu xong chuyển thẳng về tab Báo giá của cơ hội để thấy ngay phiên bản
 * vừa lập (Webapp Flow 4.4).
 *
 * Từ 0239 báo giá lập bằng BẢNG HẠNG MỤC (hạng mục · đơn vị · khối lượng · đơn giá → thành tiền), kèm
 * thuế suất (đơn giá đã gồm / chưa gồm thuế) và giảm giá. Tổng hiện ngay trên biểu mẫu bằng
 * `computeQuoteTotals`, nhưng số lưu là của CSDL (`quotes_sync_totals`) — cùng một phép tính.
 *
 * Số phiên bản và mã báo giá KHÔNG nhập ở đây: CSDL cấp khi lưu, nên hai người soạn cùng lúc
 * không thể ra hai bản trùng số (NEN-05).
 */

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import {
  BUTTONS,
  computeQuoteTotals,
  ERRORS,
  formatCurrency,
  lineAmount,
  moneyToVietnameseWords,
  parseQuantity,
  QUOTE_STAGES,
  QUOTE_VAT_RATES,
  quantityToDb,
} from '@nvg/shared';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { FormLayout, FormSection } from '@/components/ui/form-page';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { FIELD_BOX, TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useOpportunity } from '@/hooks/use-opportunities';
import { useCreateQuoteVersion, useQuotes } from '@/hooks/use-quotes';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useCan } from '@/lib/auth';

/** Bỏ mọi ký tự không phải số — người dùng gõ "1.500.000.000" vẫn nhận đúng. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

interface ItemDraft {
  key: number;
  description: string;
  unit: string;
  /** Như người dùng gõ («12,5»). */
  quantity: string;
  /** Chuỗi chữ số đồng. */
  unitPrice: string;
}

type VatMode = 'included' | 'excluded';
const VAT_MODES = ['excluded', 'included'] as const;
const VAT_MODE_LABELS: Record<VatMode, string> = {
  excluded: 'Đơn giá chưa gồm thuế',
  included: 'Đơn giá đã gồm thuế',
};

const emptyItem = (key: number): ItemDraft => ({
  key,
  description: '',
  unit: '',
  quantity: '',
  unitPrice: '',
});

export function QuoteCreatePage() {
  const { id: opportunityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canEdit = useCan('CRM', 'edit');

  const { data: opportunity, isLoading, error } = useOpportunity(opportunityId);
  const { data: quotes } = useQuotes(opportunityId);
  const createVersion = useCreateQuoteVersion();

  const nextKey = useRef(2);
  const [items, setItems] = useState<ItemDraft[]>([emptyItem(1)]);
  const [vatRate, setVatRate] = useState('');
  const [vatMode, setVatMode] = useState<VatMode>('excluded');
  const [form, setForm] = useState({
    discountAmount: '',
    discountReason: '',
    validUntil: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Hàng rào chống mất dữ liệu áp cho MỌI lối ra khỏi trang, không riêng nút Hủy
  // (Webapp Flow 6.3).
  const releaseUnsavedGuard = useUnsavedChangesGuard(dirty);

  const discountAmount = digitsOnly(form.discountAmount);
  const hasDiscount = discountAmount !== '' && BigInt(discountAmount) > 0n;

  // Thành tiền từng dòng; dòng chưa đọc được khối lượng / đơn giá thì để trống, không đoán.
  const lines = items.map((item) => {
    const qty = parseQuantity(item.quantity);
    const amount = qty !== null && item.unitPrice !== '' ? lineAmount(qty, item.unitPrice) : null;
    return { item, qty, amount };
  });
  const filledLines = lines.filter(
    (l) => l.item.description.trim() !== '' || l.item.unitPrice !== '' || l.item.quantity !== '',
  );
  const subtotal = lines.reduce((s, l) => s + (l.amount ?? 0n), 0n);
  const totals = computeQuoteTotals({
    subtotal,
    discount: hasDiscount ? discountAmount : 0,
    vatRate: vatRate || null,
    vatIncluded: vatMode === 'included',
  });

  const nextVersion = useMemo(
    () => (quotes?.length ? Math.max(...quotes.map((q) => q.version)) + 1 : 1),
    [quotes],
  );

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }
  function updateItem(key: number, field: keyof Omit<ItemDraft, 'key'>, value: string) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
    setDirty(true);
  }
  function addItem() {
    setItems((list) => [...list, emptyItem(nextKey.current++)]);
    setDirty(true);
  }
  function removeItem(key: number) {
    setItems((list) => (list.length > 1 ? list.filter((i) => i.key !== key) : list));
    setDirty(true);
  }

  const backToQuotes = `/crm/co-hoi/${opportunityId}?tab=bao-gia`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (filledLines.length === 0) {
      return setFormError('Vui lòng nhập ít nhất một hạng mục.');
    }
    for (const [n, l] of filledLines.entries()) {
      const label = `hạng mục ${n + 1}`;
      if (!l.item.description.trim()) return setFormError(ERRORS.requiredField(`tên ${label}`));
      if (l.qty === null) {
        return setFormError(`Khối lượng của ${label} chưa đúng dạng số (ví dụ 12,5).`);
      }
      if (l.item.unitPrice === '') return setFormError(ERRORS.requiredField(`đơn giá ${label}`));
    }
    if (totals.subtotal <= 0n) {
      return setFormError('Tổng các hạng mục phải lớn hơn 0 đồng.');
    }
    if (hasDiscount && totals.discount > totals.subtotal) {
      return setFormError('Mức giảm giá không được lớn hơn tổng các hạng mục.');
    }
    // CRM-05: căn cứ giảm giá là thứ người phê duyệt cần để quyết định — chặn ngay ở biểu mẫu
    // thay vì để CSDL báo lỗi sau khi người dùng đã bấm gửi phê duyệt.
    if (hasDiscount && !form.discountReason.trim()) {
      return setFormError(ERRORS.requiredField('lý do giảm giá'));
    }

    try {
      await createVersion.mutateAsync({
        opportunityId: opportunityId!,
        companyId: opportunity!.company_id,
        items: filledLines.map((l) => ({
          description: l.item.description.trim(),
          unit: l.item.unit.trim() || null,
          quantity: quantityToDb(l.qty!),
          unitPrice: l.item.unitPrice,
        })),
        discountAmount: hasDiscount ? discountAmount : null,
        discountReason: hasDiscount ? form.discountReason.trim() : null,
        vatRate: vatRate || null,
        vatIncluded: vatRate ? vatMode === 'included' : null,
        validUntil: form.validUntil || null,
        notes: form.notes.trim() || null,
      });
      setDirty(false);
      releaseUnsavedGuard();
      void navigate(backToQuotes, { replace: true });
    } catch (err) {
      setFormError(toUserMessage(err, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    void navigate(backToQuotes);
  }

  const breadcrumbs = [
    { label: 'Khách hàng & Cơ hội' },
    { label: 'Cơ hội kinh doanh', to: '/crm/co-hoi' },
    { label: opportunity?.name ?? 'Cơ hội', to: `/crm/co-hoi/${opportunityId}` },
    { label: 'Lập báo giá' },
  ];

  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!opportunity) {
    return (
      <RecordNotFound
        entity="cơ hội kinh doanh"
        listPath="/crm/co-hoi"
        listLabel="Quay lại danh sách cơ hội"
      />
    );
  }

  // Điều hướng phản ánh phân quyền (Webapp Flow 6.5) — nhưng vẫn chặn ở đây, vì người dùng
  // có thể vào thẳng bằng đường dẫn.
  const blockedReason = !canEdit
    ? 'Vai trò hiện tại không có quyền lập báo giá.'
    : opportunity.handed_over_at
      ? 'Cơ hội đã bàn giao nên không lập thêm báo giá được.'
      : !QUOTE_STAGES.includes(opportunity.stage)
        ? 'Cơ hội chưa sang bước Báo giá nên chưa lập báo giá được — báo cáo khảo sát phải được Ban Giám đốc duyệt trước (hoặc ghi lý do bỏ qua khảo sát).'
        : null;

  if (blockedReason) {
    return (
      <>
        <PageHeader title="Lập báo giá" breadcrumbs={breadcrumbs} />
        <div className="max-w-2xl rounded-card bg-surface p-6">
          <p className="font-medium">{blockedReason}</p>
          <p className="mt-1 text-fg-subtle">
            Liên hệ người chịu trách nhiệm cơ hội nếu cần bổ sung báo giá.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={nextVersion === 1 ? 'Lập báo giá' : `Lập báo giá — phiên bản ${nextVersion}`}
        breadcrumbs={breadcrumbs}
      />

      <form onSubmit={handleSubmit} noValidate>
        {/* v2 (màn 2.6): khuôn biểu mẫu + «Sau khi lưu» — đúng luồng đang chạy (nháp → phê duyệt →
            gửi khách → cơ hội tự sang Đàm phán, 0162). */}
        <FormLayout
          afterSave={[
            'Báo giá lưu ở trạng thái Nháp; tổng do hệ thống tính từ các hạng mục.',
            'Gửi phê duyệt ở tab Báo giá của cơ hội; có giảm giá thì Tổng Giám đốc duyệt.',
            'Đã duyệt thì tải PDF, gửi Zalo hoặc email cho khách; gửi xong cơ hội tự sang Đàm phán.',
          ]}
        >
          {nextVersion > 1 && (
            <p className="rounded-field bg-pill px-3 py-2 text-ink-subtle">
              Phiên bản {nextVersion - 1} sẽ chuyển thành bản cũ khi lưu. Phiên bản mới bắt đầu ở
              trạng thái nháp và phải được phê duyệt lại trước khi gửi khách hàng.
            </p>
          )}

          <FormSection
            n={1}
            title="Hạng mục báo giá"
            description="Thành tiền = khối lượng × đơn giá. Phần thập phân của khối lượng gõ sau dấu phẩy (12,5)."
            columns={1}
          >
            <ol className="space-y-3">
              {lines.map(({ item, amount }, idx) => (
                <li
                  key={item.key}
                  className="grid gap-2 rounded-field border border-border p-3 lg:grid-cols-[1.75rem_minmax(0,1fr)_5.5rem_7rem_10rem_9rem_2.75rem] lg:items-end lg:border-0 lg:p-0"
                >
                  <span className="text-sm font-medium text-fg-subtle lg:pb-3">{idx + 1}.</span>
                  <Field label="Hạng mục" required>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                      placeholder="Ví dụ: Bê tông móng mác 250"
                      autoFocus={idx === 0}
                    />
                  </Field>
                  <Field label="Đơn vị">
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(item.key, 'unit', e.target.value)}
                      placeholder="m3"
                    />
                  </Field>
                  <Field label="Khối lượng" required>
                    <Input
                      value={item.quantity}
                      inputMode="decimal"
                      onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                      placeholder="0"
                      className="text-right"
                    />
                  </Field>
                  <Field label="Đơn giá (đồng)" required>
                    <MoneyInput
                      value={item.unitPrice}
                      onChange={(v) => updateItem(item.key, 'unitPrice', v)}
                      placeholder="0"
                    />
                  </Field>
                  <div className="flex items-baseline justify-between gap-2 lg:block lg:pb-3 lg:text-right">
                    <span className="text-xs text-fg-subtle lg:hidden">Thành tiền</span>
                    <span className="font-medium tabular-nums">
                      {amount !== null ? formatCurrency(amount) : '—'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    aria-label={`Xoá hạng mục ${idx + 1}`}
                    disabled={items.length === 1}
                    onClick={() => removeItem(item.key)}
                    className="justify-self-end lg:mb-1.5"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={addItem}>
                <Plus aria-hidden /> Thêm hạng mục
              </Button>
            </div>
          </FormSection>

          <FormSection n={2} title="Giảm giá và thuế">
            <Field
              label="Mức giảm giá"
              hint="Khác 0 thì báo giá phải qua phê duyệt của Tổng Giám đốc."
            >
              <MoneyInput
                value={form.discountAmount}
                onChange={(v) => update('discountAmount', v)}
                placeholder="Không giảm giá"
              />
            </Field>

            <Field label="Thuế giá trị gia tăng">
              <select
                value={vatRate}
                onChange={(e) => {
                  setVatRate(e.target.value);
                  setDirty(true);
                }}
                className={FIELD_BOX}
              >
                <option value="">Không ghi thuế</option>
                {QUOTE_VAT_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </Field>

            {vatRate && (
              <Field label="Đơn giá trong bảng" group className="sm:col-span-2">
                <SegmentedControl
                  options={VAT_MODES}
                  value={vatMode}
                  onChange={(v) => {
                    setVatMode(v);
                    setDirty(true);
                  }}
                  getLabel={(v) => VAT_MODE_LABELS[v]}
                />
              </Field>
            )}

            {hasDiscount && (
              <Field label="Lý do giảm giá" required className="sm:col-span-2">
                <textarea
                  value={form.discountReason}
                  onChange={(e) => update('discountReason', e.target.value)}
                  rows={2}
                  placeholder="Nêu căn cứ: cạnh tranh giá, khách hàng cũ, khối lượng lớn…"
                  className={TEXTAREA_BOX}
                />
              </Field>
            )}

            <dl
              className="space-y-1 rounded-field bg-pill px-4 py-3 sm:col-span-2"
              aria-live="polite"
            >
              <TotalRow label="Tổng các hạng mục" value={formatCurrency(totals.subtotal)} />
              {hasDiscount && (
                <TotalRow label="Giảm giá" value={`− ${formatCurrency(totals.discount)}`} />
              )}
              {totals.vat !== null && (
                <TotalRow
                  label={
                    vatMode === 'included'
                      ? `Trong đó thuế giá trị gia tăng ${vatRate}%`
                      : `Thuế giá trị gia tăng ${vatRate}%`
                  }
                  value={formatCurrency(totals.vat)}
                />
              )}
              <TotalRow label="Tổng cộng" value={formatCurrency(totals.total)} strong />
              {totals.total > 0n && (
                <p className="text-right text-xs text-fg-subtle">
                  Bằng chữ: {moneyToVietnameseWords(totals.total)}
                </p>
              )}
            </dl>
          </FormSection>

          <FormSection n={3} title="Phạm vi và hiệu lực">
            <Field label="Hiệu lực đến">
              <DateInput value={form.validUntil} onChange={(v) => update('validUntil', v)} />
            </Field>

            <Field
              label="Phạm vi và điều kiện"
              className="sm:col-span-2"
              hint="In lên văn bản báo giá gửi khách."
            >
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={3}
                placeholder="Phạm vi công việc, vật tư sử dụng, điều kiện thi công, điểm cần lưu ý"
                className={TEXTAREA_BOX}
              />
            </Field>
          </FormSection>

          {formError && (
            <p
              role="alert"
              className="rounded-field bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={createVersion.isPending}>
              {createVersion.isPending ? 'Đang lưu…' : BUTTONS.saveDraft}
            </Button>
            <Button type="button" variant="subtle" onClick={handleCancel}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </FormLayout>
      </form>
    </>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={strong ? 'flex justify-between gap-4 font-semibold' : 'flex justify-between gap-4'}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
