/**
 * Báo cáo lãi/lỗ theo công trình (PRD BC-02) — Module BC mức đầy đủ.
 *
 * KHÔNG phải màn hình Danh sách (mẫu 2): đây là báo cáo tổng hợp, mỗi dòng là một PHÉP TÍNH
 * (doanh thu − chi phí) chứ không phải một hồ sơ có vòng đời trạng thái riêng — cùng lý do
 * `budget-panel.tsx` (TC-05) dựng bảng riêng thay vì dùng `EntityTable`.
 *
 * Truy vết chứng từ gốc (PRD Mục 7, BC-02 "truy ngược tới chứng từ gốc"): bấm vào tên công
 * trình mở đúng tab Ngân sách của Chi tiết công trình (`BudgetPanel`, đã có sẵn từ TC-05) —
 * ở đó liệt kê TỪNG mã chi phí và (khi Module MH/KT phát triển thêm phần truy vết chứng từ
 * theo dòng) sẽ dẫn tiếp tới từng đề nghị thanh toán. Không dựng lại bảng chứng từ ở đây.
 *
 * `project_profit_loss` chặn CẢ HÀM cho vai trò không có quyền `profit` (Mẫu D) — mọi lỗi từ
 * hook này đều là lỗi VƯỢT QUYỀN, không phải lỗi tạm thời, nên luôn hiện `BlockedNotice`
 * (không có nút "Thử lại": thử lại không đổi được kết quả).
 */

import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BUTTONS, formatCurrency } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { BlockedNotice, EmptyState, TableSkeleton } from '@/components/ui/states';
import { useCompanyLookup } from '@/hooks/use-companies';
import { toUserMessage } from '@/hooks/use-error-message';
import { useProfitLossReport, type ProfitLossRow } from '@/hooks/use-reports';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';
import { BcNav } from './bc-nav';

function sum(rows: ProfitLossRow[], key: keyof ProfitLossRow): bigint {
  return rows.reduce((total, r) => {
    const v = r[key];
    return total + (v === null || v === undefined ? 0n : BigInt(v));
  }, 0n);
}

/** Doanh thu/lãi lỗ nêu rõ Lãi hay Lỗ bằng CHỮ — màu không phải cách truyền đạt duy nhất (CGD 6.8). */
function ProfitAmount({ value }: { value: bigint | string | number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-fg-subtle">Chưa gắn hợp đồng</span>;
  }
  const n = typeof value === 'bigint' ? value : BigInt(value);
  const isLoss = n < 0n;
  return (
    <span className={cn('font-semibold', isLoss ? 'text-status-overdue' : 'text-status-completed')}>
      {isLoss ? 'Lỗ ' : 'Lãi '}
      {formatCurrency(isLoss ? -n : n)}
    </span>
  );
}

/** Xuất CSV (mở được bằng Excel) — BOM UTF-8 để Excel đọc đúng tiếng Việt có dấu (BC-06). */
function exportCsv(rows: ProfitLossRow[], companyOf: ReturnType<typeof useCompanyLookup>) {
  const header = [
    'Mã công trình',
    'Tên công trình',
    'Pháp nhân',
    'Doanh thu hợp đồng',
    'Giá vốn thực tế',
    'Đã cam kết',
    'Lãi/lỗ dự kiến',
    'Lãi/lỗ thực tế',
  ];
  const lines = rows.map((r) =>
    [
      r.site_code,
      r.site_name,
      companyOf(r.company_id)?.code ?? '',
      r.contract_value ?? '',
      r.actual_cost,
      r.committed_cost,
      r.target_profit,
      r.profit_actual ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const csv = [header.join(','), ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bao-cao-lai-lo-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProfitLossReportPage() {
  const scope = useCompanyScope();
  const { data, isLoading, error } = useProfitLossReport();
  const companyOf = useCompanyLookup(scope.isAggregate);

  return (
    <>
      <PageHeader
        title="Báo cáo lãi/lỗ theo công trình"
        description="Doanh thu hợp đồng so với chi phí đã phát sinh và đã cam kết — BC-02"
        breadcrumbs={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Lãi/lỗ theo công trình' },
        ]}
        actions={
          data &&
          data.length > 0 && (
            <Button variant="secondary" onClick={() => exportCsv(data, companyOf)}>
              <Download className="size-4" aria-hidden />
              {BUTTONS.exportExcel}
            </Button>
          )
        }
      />

      <BcNav />

      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : error ? (
        <BlockedNotice title="Không xem được báo cáo này" detail={toUserMessage(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="Chưa có công trình nào có ngân sách để tính lãi/lỗ. Ngân sách được lập từ bản dự toán đã phê duyệt ở gói thầu hoặc dự án thiết kế nguồn." />
      ) : (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface-sunken p-4">
            <p className="mb-3 font-medium">Toàn danh mục ({data.length} công trình)</p>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-fg-subtle">Doanh thu hợp đồng</dt>
                <dd className="mt-0.5">{formatCurrency(sum(data, 'contract_value'))}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Giá vốn thực tế</dt>
                <dd className="mt-0.5">{formatCurrency(sum(data, 'actual_cost'))}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Lãi/lỗ dự kiến (theo dự toán)</dt>
                <dd className="mt-0.5">
                  <ProfitAmount value={sum(data, 'target_profit')} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Lãi/lỗ thực tế tới hiện tại</dt>
                <dd className="mt-0.5">
                  <ProfitAmount value={sum(data, 'profit_actual')} />
                </dd>
              </div>
            </dl>
          </section>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
            <table className="w-full min-w-[64rem] border-collapse">
              <caption className="sr-only">Lãi/lỗ theo từng công trình</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-subtle">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Công trình
                  </th>
                  {scope.isAggregate && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Pháp nhân
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Doanh thu
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Giá vốn thực tế
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Đã cam kết
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Lãi/lỗ dự kiến
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Lãi/lỗ thực tế
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr
                    key={row.construction_site_id}
                    className="border-b border-border last:border-0"
                  >
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Link
                        to={`/tc/cong-trinh/${row.construction_site_id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {row.site_name}
                      </Link>
                      <span className="block text-xs text-fg-subtle">{row.site_code}</span>
                    </th>
                    {scope.isAggregate && (
                      <td className="px-3 py-2">{companyOf(row.company_id)?.code ?? '—'}</td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.contract_value === null ? (
                        <span className="text-fg-subtle">Chưa gắn hợp đồng</span>
                      ) : (
                        formatCurrency(row.contract_value)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(row.actual_cost)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(row.committed_cost)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <ProfitAmount value={row.target_profit} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <ProfitAmount value={row.profit_actual} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-fg-subtle">
            Lãi/lỗ dự kiến lấy từ bản dự toán đã duyệt lúc lập ngân sách, không đổi theo thời gian.
            Lãi/lỗ thực tế = doanh thu hợp đồng − chi phí ĐÃ PHÁT SINH tới hiện tại, chưa trừ phần
            còn phải chi. Bấm vào tên công trình để xem chi tiết từng mã chi phí và truy ngược tới
            chứng từ gốc.
          </p>
        </div>
      )}
    </>
  );
}
