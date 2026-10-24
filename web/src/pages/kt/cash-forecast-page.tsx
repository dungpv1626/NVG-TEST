/**
 * Dòng tiền theo tuần — 4 hoặc 8 tuần tới (Đợt 3 — 3C, migration 0197).
 *
 * Tiêu chí của đợt: «Giám đốc Tài chính thấy tuần thiếu tiền trước khi tới». Mỗi tuần: thu dự
 * kiến (công nợ phải thu, đợt thu của hợp đồng đã ký), chi dự kiến (đề nghị chi đã duyệt chưa
 * chi, công nợ phải trả), chênh lệch, số dư cuối tuần. Tuần số dư âm hiện «Thiếu tiền».
 *
 * Số dư chỉ tính khi Tài chính đã nhập số dư đầu kỳ (màn hình Dòng tiền) cho mọi pháp nhân đang
 * xem — không có thì ghi «Chưa có số dư đầu kỳ» và chỉ hiện thu, chi (CLAUDE.md 5.2). Màn hình
 * không kết luận hoãn khoản nào (PRD 2.3).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  buildCashForecast,
  formatCurrency,
  formatDate,
  toNvgDateInput,
  type CashForecastItem,
  type CashForecastKind,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { KtNav } from './kt-nav';

const KIND_LABELS: Record<CashForecastKind, string> = {
  opening: 'Số dư đầu kỳ',
  da_thu: 'Đã thu',
  da_chi: 'Đã chi',
  thu_cong_no: 'Thu công nợ',
  thu_dot: 'Đợt thu hợp đồng',
  chi_de_nghi: 'Đề nghị chi đã duyệt',
  chi_cong_no: 'Trả công nợ',
};

function useCashForecastItems() {
  const scope = useCompanyScope();
  return useQuery<CashForecastItem[], Error>({
    queryKey: ['cash-forecast-items', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_flow_forecast_items', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CashForecastItem[];
    },
    enabled: scope.isReady,
  });
}

function Money({ value, className }: { value: bigint; className?: string }) {
  return (
    <span className={cn('tabular-nums', value < 0n && 'text-status-overdue', className)}>
      {formatCurrency(value)}
    </span>
  );
}

export function CashForecastPage() {
  const [weekOption, setWeekOption] = useState<'4' | '8'>('8');
  const weeks = Number(weekOption);
  const { data, isLoading, error, refetch } = useCashForecastItems();
  const today = toNvgDateInput(new Date());

  const forecast = data ? buildCashForecast(data, { today, weeks }) : null;
  const shortWeeks = forecast?.weeks.filter((w) => w.shortage) ?? [];

  return (
    <>
      <PageHeader
        title="Dòng tiền theo tuần"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Dòng tiền theo tuần' }]}
        description="Thu và chi dự kiến từng tuần từ số có trên hệ thống: công nợ, đợt thu của hợp đồng đã ký, đề nghị chi đã duyệt chưa chi."
      />
      <KtNav />
      <SegmentedControl
        options={['4', '8'] as const}
        value={weekOption}
        onChange={setWeekOption}
        getLabel={(w) => `${w} tuần`}
        className="mb-4"
      />
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : forecast ? (
        <>
          <section className="mb-4 rounded-card bg-surface p-4">
            {forecast.openingToday !== null ? (
              <p>
                Số dư ước tính hôm nay:{' '}
                <Money value={forecast.openingToday} className="text-lg font-semibold" />
                <span className="block text-sm text-fg-subtle">
                  = số dư đầu kỳ nhập tay ngày{' '}
                  {forecast.openingDates.map((d) => formatDate(d)).join(', ')} + đã thu − đã chi từ
                  ngày đó. Khoản thu chi ngoài hệ thống không có trong số này.
                </span>
              </p>
            ) : (
              <p>
                <strong>Chưa có số dư đầu kỳ</strong>
                {forecast.companiesWithoutOpening.length > 0 &&
                  forecast.openingDates.length > 0 &&
                  ' của một số pháp nhân đang xem'}
                {' — '}
                chỉ hiện thu, chi từng tuần, không tính số dư.{' '}
                <Link to="/kt/dong-tien" className="text-brand underline">
                  Nhập số dư ở màn hình Dòng tiền
                </Link>
              </p>
            )}
            <p className="mt-2">
              {shortWeeks.length > 0 ? (
                <span className="font-medium text-status-overdue">
                  {forecast.openingToday !== null
                    ? `${shortWeeks.length} tuần thiếu tiền, sớm nhất tuần ${formatDate(shortWeeks[0]!.start)}.`
                    : `${shortWeeks.length} tuần chi nhiều hơn thu, sớm nhất tuần ${formatDate(shortWeeks[0]!.start)}.`}
                </span>
              ) : (
                <span className="text-fg-subtle">
                  Không tuần nào {forecast.openingToday !== null ? 'thiếu tiền' : 'chi vượt thu'}{' '}
                  trong {weeks} tuần tới.
                </span>
              )}
            </p>
            {forecast.undatedCount > 0 && (
              <p className="mt-1 text-sm text-fg-subtle">
                {forecast.undatedCount} khoản chưa có ngày nên chưa xếp vào tuần nào: thu{' '}
                {formatCurrency(forecast.undatedInflow)}, chi{' '}
                {formatCurrency(forecast.undatedOutflow)}.
              </p>
            )}
          </section>

          <ul className="space-y-2">
            {forecast.weeks.map((w) => (
              <li
                key={w.start}
                className={cn(
                  'rounded-lg border bg-surface p-4',
                  w.shortage ? 'border-status-overdue' : 'border-border',
                )}
              >
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium">
                      {w.index === 0 ? 'Tuần này' : `Tuần ${w.index + 1}`} · {formatDate(w.start)} –{' '}
                      {formatDate(w.end)}
                    </span>
                    {w.shortage && (
                      <StatusWithLabel
                        status="overdue"
                        label={forecast.openingToday !== null ? 'Thiếu tiền' : 'Chi vượt thu'}
                      />
                    )}
                    <span className="ms-auto grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-4">
                      <span>
                        Thu <Money value={w.inflow} />
                      </span>
                      <span>
                        Chi <Money value={w.outflow} />
                      </span>
                      <span>
                        Chênh lệch <Money value={w.net} />
                      </span>
                      <span>
                        Số dư{' '}
                        {w.closing !== null ? (
                          <Money value={w.closing} className="font-semibold" />
                        ) : (
                          <span className="text-fg-subtle">chưa có số dư</span>
                        )}
                      </span>
                    </span>
                  </summary>
                  {w.items.length === 0 ? (
                    <p className="mt-2 text-sm text-fg-subtle">Không có khoản nào trong tuần.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border text-sm">
                      {w.items.map((i, idx) => (
                        <li key={`${i.ref_id}-${idx}`} className="flex flex-wrap gap-x-3 py-1.5">
                          <span className="text-fg-subtle">{KIND_LABELS[i.kind]}</span>
                          <span className="min-w-0 flex-1">{i.label}</span>
                          <span className="text-fg-subtle">
                            {i.item_date && i.item_date < w.start
                              ? `quá hạn từ ${formatDate(i.item_date)}`
                              : formatDate(i.item_date)}
                          </span>
                          <Money
                            value={i.kind.startsWith('chi') ? -BigInt(i.amount) : BigInt(i.amount)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
