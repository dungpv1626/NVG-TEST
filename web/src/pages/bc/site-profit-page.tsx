/**
 * Lãi / lỗ quản trị từng công trình (Đợt 3 — 3D, migration 0198).
 *
 * Khác báo cáo «Lãi/lỗ theo công trình» (BC-02): doanh thu hợp đồng GỒM phát sinh đã duyệt, và
 * mở từng công trình ra thấy chi phí theo nhóm + chứng từ chi đã phân bổ (truy ngược). Chi phí
 * thực tế lấy từ ngân sách công trình — cập nhật theo chứng từ chi, mua hàng, xuất kho như nay.
 *
 * Số QUẢN TRỊ, không thay sổ kế toán chính thức (KT-08). Mẫu D: chỉ Ban Giám đốc, Tài chính, KSNB
 * xem; hàm chặn cả lượt gọi và ghi nhật ký truy cập dữ liệu nhạy cảm.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { COST_GROUP_LABELS, EMPTY_STATES, formatCurrency, formatDate } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { BlockedNotice, EmptyState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { BcNav } from './bc-nav';

interface SiteProfitRow {
  construction_site_id: string;
  company_id: string;
  site_code: string;
  site_name: string;
  stage: string;
  contract_id: string | null;
  contract_code: string | null;
  contract_value: number | null;
  amendments_value: number;
  revenue_contract: number | null;
  accepted_revenue: number;
  collected_amount: number | null;
  budgeted_cost: number;
  actual_cost: number;
  committed_cost: number;
  profit_to_date: number | null;
  profit_forecast: number | null;
}

interface SiteProfitDetail {
  amendments: {
    id: string;
    code: string | null;
    title: string;
    stage: string;
    value_change: number;
    is_emergency: boolean;
  }[];
  cost_groups: { cost_group: string; budgeted: number; actual: number; committed: number }[];
  cost_documents: {
    payment_request_id: string;
    code: string | null;
    title: string;
    paid_date: string | null;
    cost_group: string;
    amount: number;
  }[];
  acceptances: { code: string; stage_name: string; value: number; accepted_date: string }[];
}

function Money({ value, strong }: { value: number | null; strong?: boolean }) {
  if (value === null) return <span className="text-fg-subtle">{EMPTY_STATES.notEnoughData}</span>;
  return (
    <span
      className={cn('tabular-nums', value < 0 && 'text-status-overdue', strong && 'font-semibold')}
    >
      {formatCurrency(value)}
    </span>
  );
}

function costLabel(group: string): string {
  return (COST_GROUP_LABELS as Record<string, string>)[group] ?? group;
}

function Detail({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useQuery<SiteProfitDetail, Error>({
    queryKey: ['site-profit-detail', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_profit_loss_detail', { p_site_id: siteId });
      if (error) throw new Error(error.message);
      return data as SiteProfitDetail;
    },
  });
  if (isLoading) return <TableSkeleton />;
  if (error || !data) return <p className="text-status-overdue">{toUserMessage(error)}</p>;
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <div>
        <p className="font-medium">Phát sinh đã duyệt</p>
        {data.amendments.length === 0 ? (
          <p className="text-sm text-fg-subtle">Không có phát sinh đã duyệt.</p>
        ) : (
          <ul className="text-sm">
            {data.amendments.map((a) => (
              <li key={a.id} className="flex gap-2 py-0.5">
                <span className="min-w-0 flex-1">
                  {a.code ? `${a.code} — ` : ''}
                  {a.title}
                  {a.is_emergency && <span className="text-fg-subtle"> (khẩn cấp)</span>}
                </span>
                <Money value={a.value_change} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 font-medium">Đã nghiệm thu với chủ đầu tư</p>
        {data.acceptances.length === 0 ? (
          <p className="text-sm text-fg-subtle">Chưa có biên bản nghiệm thu với chủ đầu tư.</p>
        ) : (
          <ul className="text-sm">
            {data.acceptances.map((a) => (
              <li key={a.code} className="flex gap-2 py-0.5">
                <span className="min-w-0 flex-1">
                  {a.code} — {a.stage_name} · {formatDate(a.accepted_date)}
                </span>
                <Money value={a.value} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium">Chi phí theo nhóm</p>
        {data.cost_groups.length === 0 ? (
          <p className="text-sm text-fg-subtle">Chưa có ngân sách / chi phí ghi cho công trình.</p>
        ) : (
          <ul className="text-sm">
            {data.cost_groups.map((g) => (
              <li key={g.cost_group} className="flex flex-wrap gap-x-3 py-0.5">
                <span className="min-w-0 flex-1">{costLabel(g.cost_group)}</span>
                <span className="text-fg-subtle">
                  thực tế <Money value={g.actual} /> · cam kết <Money value={g.committed} /> · ngân
                  sách <Money value={g.budgeted} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 font-medium">Chứng từ chi đã phân bổ cho công trình</p>
        {data.cost_documents.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            Chưa có đề nghị chi đã chi phân bổ cho công trình.
          </p>
        ) : (
          <ul className="text-sm">
            {data.cost_documents.map((d, i) => (
              <li key={`${d.payment_request_id}-${i}`} className="flex flex-wrap gap-x-2 py-0.5">
                <Link
                  to={`/kt/de-nghi-thanh-toan/${d.payment_request_id}`}
                  className="text-brand hover:underline"
                >
                  {d.code ?? 'Đề nghị chi'}
                </Link>
                <span className="min-w-0 flex-1">
                  {d.title} · {costLabel(d.cost_group)} · {formatDate(d.paid_date)}
                </span>
                <Money value={d.amount} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SiteProfitPage() {
  const scope = useCompanyScope();
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery<SiteProfitRow[], Error>({
    queryKey: ['site-profit-list', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_profit_loss_list', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SiteProfitRow[];
    },
    enabled: scope.isReady,
    // Mỗi lượt gọi ghi nhật ký truy cập — không tự gọi lại khi quay về cửa sổ.
    staleTime: 5 * 60 * 1000,
  });

  const rows = list.data ?? [];
  return (
    <>
      <BcNav />
      <PageHeader
        title="Lãi / lỗ quản trị từng công trình"
        breadcrumbs={[{ label: 'Báo cáo' }, { label: 'Lãi / lỗ quản trị' }]}
        description="Số quản trị, không thay sổ kế toán chính thức. Doanh thu hợp đồng gồm phát sinh đã duyệt; chi phí thực tế cập nhật theo chứng từ chi, mua hàng, xuất kho đã ghi vào ngân sách công trình."
      />
      {list.isLoading ? (
        <TableSkeleton />
      ) : list.error ? (
        <BlockedNotice title="Không xem được lãi / lỗ" detail={toUserMessage(list.error)} />
      ) : rows.length === 0 ? (
        <EmptyState message="Chưa có công trình nào trong phạm vi đang xem." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.construction_site_id}
              className="rounded-card bg-surface p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  to={`/tc/cong-trinh/${r.construction_site_id}`}
                  className="font-medium text-brand hover:underline"
                >
                  {r.site_code}
                </Link>
                <span className="min-w-0 flex-1">{r.site_name}</span>
                {scope.isAggregate && (
                  <span className="text-xs text-fg-subtle">{r.site_code.split('-')[0]}</span>
                )}
              </div>
              {r.contract_id === null ? (
                <p className="mt-1 text-sm text-fg-subtle">
                  Chưa gắn hợp đồng — chưa có doanh thu để tính lãi / lỗ.
                </p>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="text-fg-subtle">Doanh thu hợp đồng</dt>
                    <dd>
                      <Money value={r.revenue_contract} />
                      {r.amendments_value !== 0 && (
                        <span className="block text-xs text-fg-subtle">
                          gồm phát sinh {formatCurrency(r.amendments_value)}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Đã nghiệm thu</dt>
                    <dd>
                      <Money value={r.accepted_revenue} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Đã thu</dt>
                    <dd>
                      <Money value={r.collected_amount} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Chi phí thực tế</dt>
                    <dd>
                      <Money value={r.actual_cost} />
                      {r.committed_cost > 0 && (
                        <span className="block text-xs text-fg-subtle">
                          đã cam kết thêm {formatCurrency(r.committed_cost)}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Lãi / lỗ đến nay</dt>
                    <dd>
                      <Money value={r.profit_to_date} strong />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Lãi / lỗ dự kiến khi xong</dt>
                    <dd>
                      <Money value={r.profit_forecast} strong />
                    </dd>
                  </div>
                </dl>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() =>
                  setOpen((cur) => (cur === r.construction_site_id ? null : r.construction_site_id))
                }
              >
                {open === r.construction_site_id ? 'Thu gọn' : 'Xem phát sinh và chứng từ'}
              </Button>
              {open === r.construction_site_id && <Detail siteId={r.construction_site_id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
