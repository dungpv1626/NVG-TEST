/**
 * Dòng tiền — KT-06.
 *
 * Bảng này đặt cạnh nhau bốn thứ mà Trưởng Tài chính hiện đang phải cộng bằng tay từ bốn
 * nguồn: số dư đầu kỳ, kế hoạch thu – chi, công nợ đến hạn, và các khoản ĐÃ DUYỆT NHƯNG CHƯA
 * CHI. Vế cuối là chỗ hay bị bỏ sót nhất, và cũng là vế làm bảng dòng tiền lập bằng tay luôn
 * đẹp hơn thực tế.
 *
 * ⚠️ Số dư đầu kỳ do người nhập, KHÔNG lấy tự động: hệ thống không kết nối ngân hàng điện tử
 * (PRD Mục 9), nên một con số "số dư" tự sinh ở đây sẽ là con số bịa.
 *
 * Màn hình CỐ Ý không kết luận "đủ tiền" hay "nên hoãn khoản nào" — PRD 2.3 để việc đó cho
 * người có thẩm quyền; ở đây chỉ đặt các con số cạnh nhau và chỉ ra chỗ âm.
 */

import { useState } from 'react';
import { CASH_FLOW_PERIOD_TYPE_LABELS, formatCurrency, toMoney } from '@nvg/shared';
import type { CashFlowPeriodType } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useCashFlow, useCashFlowPlans, useSaveCashFlowPlan } from '@/hooks/use-accounting';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { KtNav } from './kt-nav';

/** Ngày đầu và ngày cuối của tháng hiện tại, dạng `yyyy-MM-dd`. */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(first), to: iso(last) };
}

export function CashFlowPage() {
  const canEdit = useCan('KT', 'edit');
  const scope = useCompanyScope();
  const initial = currentMonthRange();

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [isFormOpen, setFormOpen] = useState(false);
  const [opening, setOpening] = useState('');
  const [plannedIn, setPlannedIn] = useState('');
  const [plannedOut, setPlannedOut] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  const { data, isLoading, error } = useCashFlow(from, to);
  const { data: plans } = useCashFlowPlans();
  const savePlan = useSaveCashFlowPlan();

  async function submitPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!scope.companyId || scope.isAggregate) return;
    try {
      await savePlan.mutateAsync({
        values: {
          company_id: scope.companyId,
          period_type: (values.get('period_type') as CashFlowPeriodType) ?? 'thang',
          period_start: String(values.get('period_start') ?? ''),
          period_end: String(values.get('period_end') ?? ''),
          opening_balance: opening || '0',
          balance_note: String(values.get('balance_note') ?? '') || null,
          planned_in: plannedIn || '0',
          planned_out: plannedOut || '0',
        },
      });
      form.reset();
      setOpening('');
      setPlannedIn('');
      setPlannedOut('');
      setFormOpen(false);
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KtNav />
      <PageHeader
        title="Dòng tiền"
        description="Số dư, kế hoạch thu – chi, công nợ đến hạn và khoản đã duyệt chưa chi."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Dòng tiền' }]}
        actions={
          canEdit && !scope.isAggregate ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Lập kế hoạch kỳ'}
            </Button>
          ) : undefined
        }
      />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}

      <div className="mb-4 grid max-w-md gap-4 sm:grid-cols-2">
        <Field label="Từ ngày">
          <DateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="Đến ngày">
          <DateInput value={to} onChange={setTo} />
        </Field>
      </div>

      {isFormOpen && (
        <form
          onSubmit={(e) => void submitPlan(e)}
          className="mb-4 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Kỳ kế hoạch" required>
            <select
              name="period_type"
              defaultValue="thang"
              className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
            >
              <option value="thang">{CASH_FLOW_PERIOD_TYPE_LABELS.thang}</option>
              <option value="tuan">{CASH_FLOW_PERIOD_TYPE_LABELS.tuan}</option>
            </select>
          </Field>
          <Field label="Từ ngày" required>
            <DateInput name="period_start" required />
          </Field>
          <Field label="Đến ngày" required>
            <DateInput name="period_end" required />
          </Field>
          <Field
            label="Số dư đầu kỳ (đồng)"
            required
            hint="Nhập tay từ sao kê. Hệ thống không kết nối ngân hàng điện tử."
          >
            <MoneyInput value={opening} onChange={setOpening} required />
          </Field>
          <Field label="Dự kiến thu (đồng)">
            <MoneyInput value={plannedIn} onChange={setPlannedIn} />
          </Field>
          <Field label="Dự kiến chi (đồng)">
            <MoneyInput value={plannedOut} onChange={setPlannedOut} />
          </Field>
          <Field
            label="Nguồn số dư"
            className="lg:col-span-3"
            hint="Ghi rõ lấy từ đâu và tại thời điểm nào, để lần sau đọc lại còn đối chiếu được."
          >
            <Input name="balance_note" maxLength={200} />
          </Field>
          <div className="lg:col-span-3">
            <Button type="submit" variant="primary" disabled={savePlan.isPending}>
              Lưu kế hoạch
            </Button>
          </div>
        </form>
      )}

      {isLoading && <CardGridSkeleton count={2} />}
      {error && <ErrorState message={toUserMessage(error)} />}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <EmptyState message="Chưa có số liệu dòng tiền cho kỳ đã chọn. Lập kế hoạch kỳ để có số dư đầu kỳ, hoặc chọn khoảng thời gian khác." />
      )}

      {!isLoading &&
        !error &&
        (data ?? []).map((row) => {
          const shortfall = toMoney(row.closing_balance) < 0n;
          return (
            <section
              key={row.company_id}
              className="mb-4 rounded-lg border border-border bg-surface p-4"
            >
              <h2 className="mb-3 font-semibold">
                {row.company_name} ({row.company_code})
              </h2>
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  { label: 'Số dư đầu kỳ', value: row.opening_balance },
                  { label: 'Dự kiến thu', value: row.planned_in },
                  { label: 'Công nợ đến hạn thu', value: row.receivables_due },
                  { label: 'Dự kiến chi', value: row.planned_out },
                  { label: 'Công nợ đến hạn trả', value: row.payables_due },
                  { label: 'Đã duyệt chưa chi', value: row.approved_payments },
                ].map((cell) => (
                  <div key={cell.label}>
                    <dt className="text-fg-muted">{cell.label}</dt>
                    <dd className="tabular-nums font-medium">{formatCurrency(cell.value)}</dd>
                  </div>
                ))}
              </dl>

              <p
                className={
                  shortfall
                    ? 'mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue'
                    : 'mt-3 rounded-sm bg-surface-sunken px-3 py-2'
                }
              >
                Số dư cuối kỳ dự kiến:{' '}
                <strong className="tabular-nums">{formatCurrency(row.closing_balance)}</strong>
                {shortfall
                  ? ' — thiếu hụt. Cân nhắc giãn lịch chi hoặc đẩy nhanh thu, quyết định thuộc về Trưởng Tài chính.'
                  : ''}
              </p>
            </section>
          );
        })}

      {(plans ?? []).length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 font-semibold">Kế hoạch đã lập</h2>
          <ul className="space-y-2">
            {(plans ?? []).map((plan) => (
              <li key={plan.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {CASH_FLOW_PERIOD_TYPE_LABELS[plan.period_type]} · {plan.period_start} →{' '}
                  {plan.period_end}
                  {plan.balance_note ? ` · ${plan.balance_note}` : ''}
                </span>
                <span className="tabular-nums text-fg-muted">
                  Đầu kỳ {formatCurrency(plan.opening_balance)} · Thu{' '}
                  {formatCurrency(plan.planned_in)} · Chi {formatCurrency(plan.planned_out)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
