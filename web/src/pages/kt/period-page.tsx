/**
 * Kỳ kế toán — KT-09: "khóa dữ liệu sau khi chốt kỳ; mọi điều chỉnh sau khi đã khóa phải ghi
 * rõ nguyên nhân và người phê duyệt".
 *
 * Khóa kỳ ở đây KHÔNG phải một nhãn hiển thị: sau khi khóa, cơ sở dữ liệu từ chối mọi khoản
 * chi mang ngày nằm trong kỳ. Muốn điều chỉnh thì mở lại kỳ, và mở lại bắt buộc nêu nguyên
 * nhân kèm tên người mở — chính là câu chữ của KT-09.
 *
 * Chỉ có kỳ THÁNG. KT-09 nói "tháng/quý/năm", nhưng quý và năm là tập hợp các tháng đã khóa:
 * khóa quý bằng cách khóa ba tháng thì không có chuyện tháng 7 còn mở trong khi quý 3 đã đóng.
 */

import { useState } from 'react';
import {
  ACCOUNTING_PERIOD_STATUS_META,
  accountingPeriodLabel,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useAccountingPeriods,
  useCloseAccountingPeriod,
  useCreateAccountingPeriod,
  useReopenAccountingPeriod,
} from '@/hooks/use-accounting';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { KtNav } from './kt-nav';

/** Ngày đầu và ngày cuối của một kỳ `yyyy-MM`. */
function monthRange(periodCode: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodCode);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(year, month, 0).getDate();
  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`,
  };
}

export function AccountingPeriodPage() {
  const promptDialog = usePromptDialog();
  const canCreate = useCan('KT', 'create');
  const canApprove = useCan('KT', 'approve');
  const scope = useCompanyScope();

  const { data, isLoading, error } = useAccountingPeriods();
  const create = useCreateAccountingPeriod();
  const close = useCloseAccountingPeriod();
  const reopen = useReopenAccountingPeriod();

  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    setNotice(null);
    const form = event.currentTarget;
    const code = String(new FormData(form).get('period_code') ?? '').trim();
    const range = monthRange(code);
    if (!range) {
      setPageError('Mã kỳ phải có dạng 2026-08. Nhập lại theo đúng dạng năm-tháng.');
      return;
    }
    if (!scope.companyId || scope.isAggregate) {
      setPageError(
        'Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi mở kỳ kế toán.',
      );
      return;
    }
    try {
      await create.mutateAsync({
        companyId: scope.companyId,
        periodCode: code,
        periodStart: range.start,
        periodEnd: range.end,
      });
      form.reset();
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  async function closePeriod(id: string, label: string) {
    setPageError(null);
    setNotice(null);
    try {
      const locked = await close.mutateAsync({ periodId: id });
      setNotice(`Đã khóa ${label}. ${locked} khoản chi trong kỳ chuyển sang chỉ xem.`);
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  async function reopenPeriod(id: string) {
    const reason = await promptDialog.ask({
      title: 'Mở lại kỳ kế toán đã khóa?',
      label: 'Nguyên nhân mở lại',
      detail: 'Chứng từ trong kỳ sửa được trở lại. Nguyên nhân được ghi vào lịch sử của kỳ.',
      confirmLabel: 'Mở lại kỳ',
      danger: true,
    });
    if (reason === null) return;
    setPageError(null);
    setNotice(null);
    try {
      await reopen.mutateAsync({ periodId: id, reason: reason.trim() });
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      {promptDialog.dialog}
      <KtNav />
      <PageHeader
        title="Kỳ kế toán"
        description="Chốt sổ theo tháng. Kỳ đã khóa không ghi thêm khoản chi mang ngày trong kỳ."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Kỳ kế toán' }]}
      />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}
      {notice && (
        <p className="mb-3 rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed">
          {notice}
        </p>
      )}

      {canCreate && !scope.isAggregate && (
        <form
          onSubmit={(e) => void submit(e)}
          className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <Field label="Mở kỳ mới" hint="Dạng năm-tháng, ví dụ 2026-08.">
            <Input name="period_code" required placeholder="2026-08" maxLength={7} />
          </Field>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            Mở kỳ
          </Button>
        </form>
      )}

      {isLoading && <CardGridSkeleton count={3} />}
      {error && <ErrorState message={toUserMessage(error)} />}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <EmptyState message="Chưa khai báo kỳ kế toán nào. Chưa có kỳ thì chưa có gì bị khóa — mở kỳ theo tháng để chốt sổ được." />
      )}

      <ul className="space-y-2">
        {(data ?? []).map((period) => {
          const meta = ACCOUNTING_PERIOD_STATUS_META[period.status];
          const label = accountingPeriodLabel(period.period_code);
          return (
            <li
              key={period.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {label}
                  <StatusLozenge status={meta.statusGroup} />
                </p>
                <p className="text-fg-muted">
                  {formatDate(period.period_start)} → {formatDate(period.period_end)} ·{' '}
                  {meta.description}
                </p>
                {period.closed_at && (
                  <p className="text-fg-muted">
                    Khóa lúc {formatDateTime(period.closed_at)}
                    {period.closer ? ` bởi ${period.closer.full_name}` : ''}
                  </p>
                )}
                {period.reopen_reason && (
                  <p className="text-fg-muted">
                    Mở lại: {period.reopen_reason}
                    {period.reopener ? ` — ${period.reopener.full_name}` : ''}
                  </p>
                )}
              </div>

              {canApprove && (
                <div className="flex gap-2">
                  {period.status === 'dang_mo' ? (
                    <Button
                      variant="primary"
                      disabled={close.isPending}
                      onClick={() => void closePeriod(period.id, label)}
                    >
                      Khóa kỳ
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={reopen.isPending}
                      onClick={() => void reopenPeriod(period.id)}
                    >
                      Mở lại kỳ
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-fg-muted">
        Không khóa được kỳ khi trong kỳ còn khoản đã chi mà chưa hạch toán — khóa lúc đó là chốt sổ
        trên một kỳ còn dở, và những khoản đó sẽ mắc kẹt cho tới khi có người mở lại.
      </p>
    </>
  );
}
