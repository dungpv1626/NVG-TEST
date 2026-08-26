/**
 * Lập phiên bản báo giá (PRD CRM-04, CRM-05) — mẫu bố cục 4 "Biểu mẫu" (Webapp Flow 4.4).
 *
 * Dưới ~10 trường nên để MỘT TRANG, không chia bước. Lưu xong chuyển thẳng về tab Báo giá
 * của cơ hội để thấy ngay phiên bản vừa lập (Webapp Flow 4.4).
 *
 * Số phiên bản và mã báo giá KHÔNG nhập ở đây: CSDL cấp khi lưu, nên hai người soạn cùng lúc
 * không thể ra hai bản trùng số (NEN-05).
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BUTTONS, ERRORS, formatCurrency } from '@nvg/shared';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
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

export function QuoteCreatePage() {
  const { id: opportunityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canEdit = useCan('CRM', 'edit');

  const { data: opportunity, isLoading, error } = useOpportunity(opportunityId);
  const { data: quotes } = useQuotes(opportunityId);
  const createVersion = useCreateQuoteVersion();

  const [form, setForm] = useState({
    totalValue: '',
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

  const totalValue = digitsOnly(form.totalValue);
  const discountAmount = digitsOnly(form.discountAmount);
  const hasDiscount = discountAmount !== '' && BigInt(discountAmount) > 0n;

  const nextVersion = useMemo(
    () => (quotes?.length ? Math.max(...quotes.map((q) => q.version)) + 1 : 1),
    [quotes],
  );

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setDirty(true);
  }

  const backToQuotes = `/crm/co-hoi/${opportunityId}?tab=bao-gia`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!totalValue || BigInt(totalValue) <= 0n) {
      return setFormError(ERRORS.requiredField('giá trị báo giá'));
    }
    if (hasDiscount && BigInt(discountAmount) > BigInt(totalValue)) {
      return setFormError('Mức giảm giá không được lớn hơn giá trị báo giá.');
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
        totalValue,
        discountAmount: hasDiscount ? discountAmount : null,
        discountReason: hasDiscount ? form.discountReason.trim() : null,
        validUntil: form.validUntil || null,
        notes: form.notes.trim() || null,
      });
      setDirty(false);
      releaseUnsavedGuard();
      navigate(backToQuotes, { replace: true });
    } catch (err) {
      setFormError(toUserMessage(err, 'create'));
    }
  }

  function handleCancel() {
    // KHÔNG hỏi ở đây: `useUnsavedChangesGuard` đã chặn mọi lần chuyển trang, kể cả
    // lần này. Hỏi thêm một lần nữa là bắt người dùng xác nhận hai lần cho một việc.
    navigate(backToQuotes);
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
      : null;

  if (blockedReason) {
    return (
      <>
        <PageHeader title="Lập báo giá" breadcrumbs={breadcrumbs} />
        <div className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card">
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

      <form
        onSubmit={handleSubmit}
        noValidate
        className="max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-card"
      >
        {nextVersion > 1 && (
          <p className="mb-4 rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
            Phiên bản {nextVersion - 1} sẽ chuyển thành bản cũ khi lưu. Phiên bản mới bắt đầu ở
            trạng thái nháp và phải được phê duyệt lại trước khi gửi khách hàng.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Giá trị báo giá" required>
            <MoneyInput
              value={form.totalValue}
              onChange={(v) => update('totalValue', v)}
              placeholder="Đơn vị: đồng"
              required
              autoFocus
            />
            {totalValue && (
              <span className="block text-xs text-fg-subtle">{formatCurrency(totalValue)}</span>
            )}
          </Field>

          <Field
            label="Mức giảm giá"
            hint="Khác 0 thì báo giá phải qua phê duyệt của Tổng Giám đốc (CRM-05)."
          >
            <MoneyInput
              value={form.discountAmount}
              onChange={(v) => update('discountAmount', v)}
              placeholder="Không giảm giá"
            />
            {hasDiscount && (
              <span className="block text-xs text-fg-subtle">{formatCurrency(discountAmount)}</span>
            )}
          </Field>

          {hasDiscount && (
            <Field label="Lý do giảm giá" required className="sm:col-span-2">
              <textarea
                value={form.discountReason}
                onChange={(e) => update('discountReason', e.target.value)}
                rows={2}
                placeholder="Nêu căn cứ: cạnh tranh giá, khách hàng cũ, khối lượng lớn…"
                className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
              />
            </Field>
          )}

          <Field label="Hiệu lực đến">
            <DateInput value={form.validUntil} onChange={(v) => update('validUntil', v)} />
          </Field>

          <Field label="Ghi chú" className="sm:col-span-2">
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              placeholder="Phạm vi công việc, điều kiện thanh toán, điểm cần lưu ý khi thương thảo"
              className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
            />
          </Field>
        </div>

        {formError && (
          <p
            role="alert"
            className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
          >
            {formError}
          </p>
        )}

        <div className="mt-6 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={createVersion.isPending}>
            {createVersion.isPending ? 'Đang lưu…' : BUTTONS.saveDraft}
          </Button>
          <Button type="button" variant="subtle" onClick={handleCancel}>
            {BUTTONS.cancel}
          </Button>
        </div>
      </form>
    </>
  );
}
