/**
 * «Bảo lãnh và giữ lại» — `/kt/bao-lanh-giu-lai` (G3, 0248).
 *
 * Hai danh sách cho Kế toán / Giám đốc Tài chính:
 *   · Tiền giữ lại bảo hành — khoản phải thu riêng sinh lúc «Ghi công nợ» hồ sơ thanh toán; hạn thu hồi = ngày
 *     hết bảo hành muộn nhất của công trình. Thu bằng chứng từ thu ở màn hình Công nợ như mọi khoản phải thu.
 *   · Bảo lãnh hợp đồng — tạm ứng / thực hiện / bảo hành, cả hai chiều, sắp hết hạn đứng trên.
 */

import { Link } from 'react-router-dom';
import { daysUntil, formatCurrency, formatDate, toMoney } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  GUARANTEE_DIRECTION_LABELS,
  GUARANTEE_TYPE_LABELS,
  useAllContractGuarantees,
  useRetentionReceivables,
} from '@/hooks/use-contract-guarantees';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { GuaranteeStatusLabel } from '@/pages/hd/contract-guarantees-card';
import { KtNav } from './kt-nav';

function RetentionList() {
  const scope = useCompanyScope();
  const { data, isLoading, error, refetch } = useRetentionReceivables();
  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;
  const rows = data ?? [];
  const open = rows.filter((r) => toMoney(r.amount) > toMoney(r.settled_amount));
  const total = open.reduce((s, r) => s + toMoney(r.amount) - toMoney(r.settled_amount), 0n);
  if (rows.length === 0)
    return (
      <EmptyState message="Chưa có khoản tiền giữ lại nào. Khoản giữ lại sinh ra khi «Ghi công nợ» một hồ sơ thanh toán có ghi tiền chủ đầu tư giữ lại." />
    );
  return (
    <>
      <p className="mb-2 text-sm text-fg-subtle">
        Còn phải thu hồi {formatCurrency(total)} ở {open.length} khoản.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const left = toMoney(r.amount) - toMoney(r.settled_amount);
          const days = r.due_date ? daysUntil(r.due_date) : null;
          const status =
            left <= 0n
              ? { group: 'completed' as const, label: 'Đã thu hồi' }
              : days !== null && days < 0
                ? { group: 'overdue' as const, label: 'Quá hạn' }
                : days === 0
                  ? { group: 'in_progress' as const, label: 'Tới hạn hôm nay' }
                  : { group: 'draft' as const, label: 'Chưa tới hạn' };
          return (
            <li key={r.id} className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  {r.contract ? (
                    <Link
                      to={`/hd/hop-dong/${r.contract.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {r.contract.contract_number ?? r.contract.code}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.code}</span>
                  )}
                  <span className="block text-sm text-fg-subtle">
                    {r.party_name}
                    {r.site && (
                      <>
                        {' '}
                        · Công trình {r.site.code} — {r.site.name}
                      </>
                    )}
                    {scope.isAggregate && r.company && <> · {r.company.code}</>}
                  </span>
                </span>
                <span className="tabular-nums">
                  <strong>{formatCurrency(left > 0n ? left : 0n)}</strong>
                  <span className="text-fg-subtle"> / {formatCurrency(r.amount)}</span>
                </span>
                <StatusWithLabel status={status.group} label={status.label} />
              </div>
              <p className="mt-1 text-sm text-fg-subtle">
                {r.due_date
                  ? `Hạn thu hồi ${formatDate(r.due_date)} (ngày hết bảo hành)`
                  : 'Chưa có hạn — hạn tự điền khi công trình khai thời hạn bảo hành.'}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function GuaranteeList() {
  const scope = useCompanyScope();
  const { data, isLoading, error, refetch } = useAllContractGuarantees();
  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;
  const rows = [...(data ?? [])].sort((a, b) => {
    const openA = a.status === 'dang_hieu_luc' || a.status === 'het_han' ? 0 : 1;
    const openB = b.status === 'dang_hieu_luc' || b.status === 'het_han' ? 0 : 1;
    return openA - openB || a.valid_to.localeCompare(b.valid_to);
  });
  if (rows.length === 0)
    return (
      <EmptyState message="Chưa ghi bảo lãnh hợp đồng nào. Thêm bảo lãnh ở khối «Bảo lãnh và tiền giữ lại» trên trang hợp đồng." />
    );
  return (
    <ul className="space-y-2">
      {rows.map((g) => (
        <li key={g.id} className="rounded-card bg-surface p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{GUARANTEE_TYPE_LABELS[g.guarantee_type]}</span>
              {g.contract && (
                <>
                  {' · '}
                  <Link
                    to={`/hd/hop-dong/${g.contract_id}#bao-lanh`}
                    className="text-brand hover:underline"
                  >
                    {g.contract.contract_number ?? g.contract.code}
                  </Link>
                </>
              )}
              <span className="block text-sm text-fg-subtle">
                {GUARANTEE_DIRECTION_LABELS[g.direction]} · {g.bank_name}
                {g.guarantee_number && <> · số {g.guarantee_number}</>}
                {scope.isAggregate && g.company && <> · {g.company.code}</>}
              </span>
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(g.amount)}</span>
            <GuaranteeStatusLabel g={g} />
          </div>
          <p className="mt-1 text-sm text-fg-subtle">Hiệu lực đến {formatDate(g.valid_to)}</p>
        </li>
      ))}
    </ul>
  );
}

export function RetentionGuaranteePage() {
  return (
    <>
      <PageHeader
        title="Bảo lãnh và giữ lại"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Bảo lãnh và giữ lại' }]}
        description="Tiền chủ đầu tư giữ lại bảo hành chờ thu hồi, và bảo lãnh hợp đồng còn hiệu lực. Thu tiền giữ lại bằng chứng từ thu ở màn hình Công nợ."
      />
      <KtNav />
      <section aria-labelledby="giu-lai" className="mb-6">
        <h2 id="giu-lai" className="mb-2 font-semibold">
          Tiền giữ lại bảo hành
        </h2>
        <RetentionList />
      </section>
      <section aria-labelledby="bao-lanh-hd">
        <h2 id="bao-lanh-hd" className="mb-2 font-semibold">
          Bảo lãnh hợp đồng
        </h2>
        <GuaranteeList />
      </section>
    </>
  );
}
