/**
 * Báo cáo công trường — danh sách cho Trưởng phòng Thi công / Ban Giám đốc và trang một báo cáo (T4,
 * migration 0242).
 *
 * Danh sách (mẫu Danh sách, AFD 4.2): báo cáo đã gửi, mới nhất trước, kèm khối «Chưa gửi báo cáo tuần
 * này» lấy từ bảng theo dõi — Trưởng phòng thấy công trình nào chưa báo mà không cần gọi. Phạm vi do RLS
 * quyết: chỉ huy trưởng chỉ thấy công trình được giao. Lãnh đạo đọc bằng quyền XEM phân hệ Thi công.
 */

import { Link, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import {
  SITE_REPORT_KIND_LABELS,
  formatDate,
  formatDateTime,
  toNvgDateInput,
  weekStartOf,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useSiteBoard } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSiteReport, useSiteReports } from '@/hooks/use-site-plan';
import { useCompanyScope } from '@/lib/company-scope';
import { SiteReportView, periodLabel, printSiteReport, reportTitle } from './site-report-view';
import { TcNav } from './tc-nav';

export function SiteReportListPage() {
  const scope = useCompanyScope();
  const companyId = scope.isAggregate ? null : scope.companyId;
  const { data, isLoading, error, refetch } = useSiteReports({ companyId });
  const { data: board } = useSiteBoard();
  const thisWeek = weekStartOf(toNvgDateInput(new Date()));
  const rows = data ?? [];

  const sentThisWeek = new Set(
    rows
      .filter((r) => r.kind === 'tuan' && r.period_start === thisWeek)
      .map((r) => r.construction_site_id),
  );
  const notSent = (board ?? []).filter(
    (s) => s.stage === 'dang_thi_cong' && !sentThisWeek.has(s.site_id),
  );

  return (
    <>
      <PageHeader
        title="Báo cáo công trường"
        breadcrumbs={[{ label: 'Thi công & Ngân sách' }, { label: 'Báo cáo công trường' }]}
        description="Báo cáo tuần / tháng do chỉ huy trưởng gửi — máy tổng hợp từ nhật ký, kế hoạch tuần, mốc, đề nghị, tồn tại và điểm danh."
      />
      <TcNav />

      {notSent.length > 0 && (
        <section className="mb-4 rounded-card bg-surface p-4">
          <h2 className="mb-2 font-semibold">
            Chưa gửi báo cáo tuần này ({formatDate(thisWeek)}) — {notSent.length} công trình
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {notSent.map((s) => (
              <li key={s.site_id}>
                <Link
                  to={`/tc/cong-trinh/${s.site_id}?tab=bao-cao`}
                  className="inline-flex min-h-10 items-center rounded-full bg-pill px-3 hover:underline"
                >
                  {s.code} · {s.responsible_name ?? 'chưa có chỉ huy trưởng'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message="Chưa có báo cáo nào được gửi. Chỉ huy trưởng gửi báo cáo ở tab «Báo cáo tuần» của công trình." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link to={`/tc/bao-cao/${r.id}`} className="font-medium text-brand hover:underline">
                  {SITE_REPORT_KIND_LABELS[r.kind]} {periodLabel(r).replace(/^(tuần|tháng) /, '')}
                </Link>
                <span className="text-sm text-fg-subtle">{r.code}</span>
                {scope.isAggregate && r.company && (
                  <span className="text-sm text-fg-subtle">Pháp nhân: {r.company.code}</span>
                )}
              </div>
              <p className="text-sm">{r.site ? `${r.site.code} — ${r.site.name}` : 'Công trình'}</p>
              <p className="text-sm text-fg-subtle">
                Gửi {formatDateTime(r.sent_at)}
                {r.sender ? ` · ${r.sender.full_name}` : ''}
              </p>
              {r.problems && (
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  <span className="font-medium">Cần văn phòng xử lý: </span>
                  {r.problems}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function SiteReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useSiteReport(id);
  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data)
    return (
      <RecordNotFound
        entity="báo cáo công trường"
        listPath="/tc/bao-cao"
        listLabel="Quay lại danh sách báo cáo"
      />
    );

  return (
    <>
      <PageHeader
        title={reportTitle(data.data)}
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: 'Báo cáo công trường', to: '/tc/bao-cao' },
          { label: data.code },
        ]}
        description={`${data.data.site.name} · gửi ${formatDateTime(data.sent_at)}${
          data.sender ? ` bởi ${data.sender.full_name}` : ''
        } · số liệu chụp lúc gửi, không đổi về sau.`}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to={`/tc/cong-trinh/${data.construction_site_id}?tab=bao-cao`}>
                Mở công trình
              </Link>
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                printSiteReport(data.data, data, {
                  code: data.code,
                  sentAt: data.sent_at,
                  sender: data.sender?.full_name ?? null,
                })
              }
            >
              <Printer className="size-4" aria-hidden />
              In báo cáo
            </Button>
          </>
        }
      />
      <SiteReportView data={data.data} comments={data} />
    </>
  );
}
