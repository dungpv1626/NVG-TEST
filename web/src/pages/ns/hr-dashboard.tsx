/**
 * Việc cần xử lý của Hành chính – Nhân sự — AFD 3.8 bước 1, mẫu bố cục Dashboard (Webapp Flow 4.1).
 *
 * Đây là màn hình mở đầu ngày làm việc của HCNS, nên nó chỉ chứa thứ CÓ VIỆC PHẢI LÀM, không
 * chứa thống kê để ngắm:
 *
 *  - Giấy tờ sắp hết hạn và đã hết hạn (NS-10) — việc đi đòi giấy.
 *  - Kỳ chấm công đang chờ thao tác (NS-04) — việc gửi xác nhận hoặc chốt.
 *  - Nhân sự sắp hết hạn thử việc (NS-03) — việc nhắc đánh giá TRƯỚC thời hạn.
 *
 * Mỗi thẻ bấm được và dẫn thẳng tới màn hình xử lý (Webapp Flow 4.1) — thẻ không có lối đi
 * tiếp là thẻ vô dụng, đúng tinh thần Content Guidelines 3.4 về thông báo.
 */

import { Link } from 'react-router-dom';
import {
  TIMESHEET_PERIOD_STATUS_META,
  WORK_BLOCK_LABELS,
  documentReminderStage,
  formatDate,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { useEmployees, useHrDocuments, useTimesheetPeriods } from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { cn } from '@/lib/utils';
import { ReminderTag } from './document-page';
import { NsNav } from './ns-nav';

/** Kỳ đang được theo dõi là THÁNG TRƯỚC — trùng cách chọn mặc định của màn hình Chấm công. */
function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

/** Số ngày còn lại tới một mốc, âm nghĩa là đã qua. */
function daysLeft(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  return Math.ceil(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86_400_000,
  );
}

export function HrDashboardPage() {
  const { year, month } = currentPeriod();
  const { data: documents, isLoading: loadingDocs, error: docsError } = useHrDocuments();
  const { data: periods, isLoading: loadingPeriods } = useTimesheetPeriods(year, month);
  const { data: employees, isLoading: loadingEmployees } = useEmployees();

  const expiring = (documents ?? [])
    .map((d) => ({ doc: d, stage: documentReminderStage(d.expiry_date) }))
    .filter((x) => x.stage !== null)
    .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));

  const pendingPeriods = (periods ?? []).filter((p) => p.status !== 'da_chot');

  const probation = (employees ?? [])
    .filter((e) => e.status === 'thu_viec' && e.probation_end_date)
    .map((e) => ({ employee: e, days: daysLeft(e.probation_end_date!) }))
    .filter((x) => x.days <= 30)
    .sort((a, b) => a.days - b.days);

  const isLoading = loadingDocs || loadingPeriods || loadingEmployees;

  return (
    <>
      <NsNav />
      <PageHeader
        title="Việc cần xử lý"
        description="Giấy tờ tới hạn, bảng chấm công đang chờ, và nhân sự sắp hết thử việc."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Việc cần xử lý' }]}
      />

      {docsError && <ErrorState message={toUserMessage(docsError, 'view')} />}

      {isLoading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Giấy tờ tới hạn</h2>
              <Link to="/ns/giay-to" className="text-brand">
                Mở danh sách
              </Link>
            </div>

            {expiring.length === 0 ? (
              <EmptyState message="Không có giấy tờ nào tới hạn trong 90 ngày tới." />
            ) : (
              <ul className="mt-3 space-y-2">
                {expiring.slice(0, 8).map(({ doc, stage }) => (
                  <li key={doc.id} className="border-b border-border pb-2 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{doc.title}</span>
                      <ReminderTag stage={stage} />
                    </div>
                    <div className="text-fg-subtle">
                      {doc.employee?.full_name ?? doc.worker?.full_name ?? 'Nhân sự'} ·{' '}
                      {stage === 0
                        ? `hết hạn ${formatDate(doc.expiry_date)}`
                        : `hết hạn ${formatDate(doc.expiry_date)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                Chấm công tháng {month}/{year}
              </h2>
              <Link to="/ns/cham-cong" className="text-brand">
                Mở chấm công
              </Link>
            </div>

            {pendingPeriods.length === 0 ? (
              <EmptyState
                message={
                  (periods ?? []).length === 0
                    ? 'Chưa mở kỳ chấm công nào cho tháng này.'
                    : 'Cả ba khối đã chốt xong kỳ này.'
                }
              />
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingPeriods.map((p) => {
                  const meta = TIMESHEET_PERIOD_STATUS_META[p.status];
                  return (
                    <li key={p.id} className="border-b border-border pb-2 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{WORK_BLOCK_LABELS[p.source_type]}</span>
                        <StatusWithLabel status={meta.group} label={meta.label} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Sắp hết thử việc</h2>
              <Link to="/ns/nhan-su" className="text-brand">
                Mở hồ sơ nhân sự
              </Link>
            </div>

            {probation.length === 0 ? (
              <EmptyState message="Không có ai tới hạn đánh giá thử việc trong 30 ngày tới." />
            ) : (
              <ul className="mt-3 space-y-2">
                {probation.map(({ employee, days }) => (
                  <li key={employee.id} className="border-b border-border pb-2 last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/ns/nhan-su/${employee.id}`} className="font-medium text-brand">
                        {employee.full_name}
                      </Link>
                      {/*
                        Hạn đánh giá thử việc là CẢNH BÁO chứ không phải trạng thái hồ sơ, nên
                        dùng nhãn chữ có màu như hạn giấy tờ — không mượn nhãn "Chờ duyệt".
                      */}
                      <span
                        className={cn(
                          'font-medium',
                          days < 0 ? 'text-status-overdue' : 'text-status-pending',
                        )}
                      >
                        {days < 0 ? `Quá hạn ${-days} ngày` : `Còn ${days} ngày`}
                      </span>
                    </div>
                    <div className="text-fg-subtle">
                      Hết hạn thử việc {formatDate(employee.probation_end_date)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
