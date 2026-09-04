/**
 * Chấm công 3 khối (NS-04) — AFD 3.8 bước 2, mẫu bố cục Dashboard + Biểu mẫu (Webapp Flow 4.1, 4.4).
 *
 * Màn hình này là nơi ba khối gặp nhau, nên nó phải trả lời được ba câu, theo đúng thứ tự:
 *
 *   1. Tháng này khối nào đã ghi xong, khối nào chưa? → ba thẻ trạng thái ở trên cùng.
 *   2. Ai ghi và ai xác nhận khối đó? → ghi ngay trên thẻ, không bắt tra tài liệu.
 *   3. Chốt được chưa? → nút chốt chỉ bật khi CẢ BA khối đã xác nhận, và khi chưa đủ thì nói
 *      rõ còn thiếu khối nào, thay vì báo lỗi sau khi bấm.
 *
 * Chốt xong, số liệu sang Kế toán (NS-05) và không ai sửa được nữa nếu không nêu lý do — hàng
 * rào đó nằm trong CSDL, màn hình chỉ phản ánh lại.
 */

import { useState } from 'react';
import {
  TIMESHEET_PERIOD_STATUS_META,
  WORK_BLOCKS,
  WORK_BLOCK_LABELS,
  WORK_BLOCK_TIMEKEEPING,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import type { WorkBlock } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice, CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useConfirmTimesheetPeriod,
  useConsolidateTimesheets,
  useEmployees,
  useOpenTimesheetPeriod,
  useSaveAttendance,
  useSubmitTimesheetPeriod,
  useTimesheetPeriods,
  useTimesheets,
  useTransferTimesheets,
} from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { NsNav } from './ns-nav';

/** Kỳ mặc định là THÁNG TRƯỚC: đầu tháng mới là lúc người ta chốt công tháng vừa qua. */
function defaultPeriod(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

export function TimesheetPage() {
  const scope = useCompanyScope();
  const canEdit = useCan('NS', 'edit');
  const canApproveNs = useCan('NS', 'approve');
  const canApproveTc = useCan('TC', 'approve');

  const [{ year, month }, setPeriod] = useState(defaultPeriod);
  const { data: periods, isLoading, error, refetch } = useTimesheetPeriods(year, month);
  const { data: employees } = useEmployees();
  const { data: closed } = useTimesheets(year, month);

  const open = useOpenTimesheetPeriod();
  const save = useSaveAttendance();
  const submit = useSubmitTimesheetPeriod();
  const confirm = useConfirmTimesheetPeriod();
  const consolidate = useConsolidateTimesheets();
  const transfer = useTransferTimesheets();

  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entryBlock, setEntryBlock] = useState<WorkBlock | null>(null);
  const [workDate, setWorkDate] = useState('');
  const [hours, setHours] = useState('8');

  const byBlock = new Map((periods ?? []).map((p) => [p.source_type, p]));
  const missing = WORK_BLOCKS.filter((b) => byBlock.get(b)?.status !== 'da_xac_nhan');
  const allClosed = WORK_BLOCKS.every((b) => byBlock.get(b)?.status === 'da_chot');

  async function run(label: string, action: () => Promise<unknown>) {
    setPageError(null);
    setNotice(null);
    try {
      await action();
      setNotice(label);
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  /**
   * Ghi công cả khối cho MỘT ngày.
   *
   * Đây là cách công trường và xưởng ghi thật: chỉ huy trưởng điểm danh quân số của ngày hôm
   * đó, không ngồi nhập từng người một cho cả tháng. Ai nghỉ thì sửa lại dòng của người đó.
   */
  async function fillDay(block: WorkBlock) {
    const period = byBlock.get(block);
    if (!period) {
      setPageError('Chưa mở kỳ cho khối này. Bấm "Mở kỳ" trước.');
      return;
    }
    if (!workDate) {
      setPageError('Chưa chọn ngày công. Chọn ngày trước khi ghi.');
      return;
    }
    const list = (employees ?? []).filter((e) => e.block === block && e.status !== 'da_nghi');
    if (list.length === 0) {
      setPageError('Khối này chưa có nhân sự nào đang làm việc.');
      return;
    }

    await run(`Đã ghi công ngày ${formatDate(workDate)} cho ${list.length} người.`, () =>
      save.mutateAsync({
        periodId: period.id,
        entries: list.map((e) => ({
          employee_id: e.id,
          work_date: workDate,
          kind: 'lam_viec' as const,
          hours,
          construction_site_id: e.construction_site_id,
        })),
      }),
    );
  }

  return (
    <>
      <NsNav />
      <PageHeader
        title="Chấm công 3 khối"
        description="Văn phòng, công trường và xưởng ghi riêng; Hành chính – Nhân sự tổng hợp và chốt một lần."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Chấm công' }]}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Năm" className="w-28">
          <Input
            type="number"
            inputMode="numeric"
            value={year}
            min={2020}
            max={2100}
            onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) }))}
          />
        </Field>
        <Field label="Tháng" className="w-24">
          <Input
            type="number"
            inputMode="numeric"
            value={month}
            min={1}
            max={12}
            onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))}
          />
        </Field>
      </div>

      {/*
        Ở chế độ gộp "Toàn NVG" thì mọi nút ghi/mở kỳ đều tắt — kỳ chấm công thuộc về MỘT pháp
        nhân, gộp ba pháp nhân lại thì không biết mở cho ai. Nút xám mà không nói vì sao là
        đúng thứ Webapp Flow 6.5 cấm, nên nói ngay ở đầu màn hình thay vì để người dùng bấm.
      */}
      {scope.isAggregate && (
        <div className="mb-4">
          <BlockedNotice
            title="Đang xem gộp cả ba pháp nhân"
            detail="Kỳ chấm công thuộc về một pháp nhân cụ thể. Chọn NVC, NVO hoặc NVS ở bộ chọn pháp nhân góc trên bên trái để mở kỳ, ghi công và chốt kỳ; ở chế độ gộp chỉ xem được."
          />
        </div>
      )}

      {pageError && <ErrorState message={pageError} />}
      {notice && <p className="mb-4 rounded border border-border bg-bg-subtle p-3">{notice}</p>}

      {isLoading ? (
        <CardGridSkeleton count={3} />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {WORK_BLOCKS.map((block) => {
            const period = byBlock.get(block);
            const meta = period ? TIMESHEET_PERIOD_STATUS_META[period.status] : null;

            return (
              <section key={block} className="rounded border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{WORK_BLOCK_LABELS[block]}</h2>
                    <p className="mt-1 text-fg-subtle">{WORK_BLOCK_TIMEKEEPING[block]}</p>
                  </div>
                  {meta && <StatusLozenge status={meta.group} />}
                </div>

                <p className="mt-3">{meta ? meta.label : 'Chưa mở kỳ'}</p>
                {period?.confirmed_at && (
                  <p className="text-fg-subtle">
                    {period.confirmer?.full_name ?? 'Trưởng đơn vị'} xác nhận{' '}
                    {formatDateTime(period.confirmed_at)}
                  </p>
                )}
                {period?.closed_at && (
                  <p className="text-fg-subtle">Chốt {formatDateTime(period.closed_at)}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {!period && canEdit && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void run(`Đã mở kỳ cho khối ${WORK_BLOCK_LABELS[block]}.`, () =>
                          open.mutateAsync({
                            companyId: scope.companyId!,
                            year,
                            month,
                            sourceType: block,
                          }),
                        )
                      }
                      disabled={!scope.companyId || scope.isAggregate}
                    >
                      Mở kỳ
                    </Button>
                  )}

                  {period?.status === 'dang_ghi' && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setEntryBlock(entryBlock === block ? null : block)}
                      >
                        {entryBlock === block ? 'Đóng ô ghi công' : 'Ghi công'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void run('Đã gửi bảng công cho trưởng đơn vị xác nhận.', () =>
                            submit.mutateAsync({ periodId: period.id }),
                          )
                        }
                      >
                        Gửi xác nhận
                      </Button>
                    </>
                  )}

                  {period?.status === 'cho_xac_nhan' &&
                    (block === 'cong_truong' ? canApproveTc : canApproveNs) && (
                      <Button
                        onClick={() =>
                          void run('Đã xác nhận bảng công của khối này.', () =>
                            confirm.mutateAsync({ periodId: period.id }),
                          )
                        }
                      >
                        Xác nhận số liệu
                      </Button>
                    )}
                </div>

                {entryBlock === block && period?.status === 'dang_ghi' && (
                  <div className="mt-3 space-y-2 rounded border border-border bg-bg-subtle p-3">
                    <Field
                      label="Ngày công"
                      hint="Ghi cho toàn bộ nhân sự đang làm việc của khối; sửa lại dòng của người nghỉ sau."
                    >
                      <DateInput value={workDate} onChange={setWorkDate} />
                    </Field>
                    <Field label="Số giờ trong ngày">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={24}
                        step="0.5"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                      />
                    </Field>
                    <Button onClick={() => void fillDay(block)} disabled={save.isPending}>
                      {save.isPending ? 'Đang ghi…' : 'Ghi công cho cả khối'}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-6 rounded border border-border bg-bg-subtle p-4">
        <h2 className="font-semibold">Chốt kỳ và chuyển Kế toán</h2>
        {allClosed ? (
          <p className="mt-1 text-fg-subtle">
            Kỳ tháng {month}/{year} đã chốt. Số liệu đã sẵn sàng để tính lương.
          </p>
        ) : missing.length > 0 ? (
          <p className="mt-1 text-fg-subtle">
            Còn chờ xác nhận: {missing.map((b) => WORK_BLOCK_LABELS[b]).join(', ')}. Chốt được khi
            cả ba khối đã xác nhận.
          </p>
        ) : (
          <p className="mt-1 text-fg-subtle">
            Cả ba khối đã xác nhận. Chốt kỳ để chuyển số liệu sang Kế toán.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={missing.length > 0 || allClosed || !canEdit || !scope.companyId}
            onClick={() =>
              void run('Đã chốt kỳ chấm công và chuyển số liệu sang Kế toán.', () =>
                consolidate.mutateAsync({ companyId: scope.companyId!, year, month }),
              )
            }
          >
            Chốt kỳ chấm công
          </Button>

          {allClosed && (
            <Button
              variant="secondary"
              onClick={() =>
                void run('Đã xác nhận nhận số công của kỳ này.', () =>
                  transfer.mutateAsync({ companyId: scope.companyId!, year, month }),
                )
              }
            >
              Kế toán xác nhận đã nhận
            </Button>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Bảng công đã chốt</h2>
        {(closed ?? []).length === 0 ? (
          <EmptyState message="Kỳ này chưa chốt nên chưa có bảng công. Chốt kỳ để Kế toán nhận số liệu." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-left text-fg-subtle">
                  <th className="px-3 py-2">Nhân sự</th>
                  <th className="px-3 py-2">Khối</th>
                  <th className="px-3 py-2 text-right">Ngày công</th>
                  <th className="px-3 py-2 text-right">Tăng ca</th>
                  <th className="px-3 py-2 text-right">Nghỉ phép</th>
                  <th className="px-3 py-2 text-right">Nghỉ không phép</th>
                  <th className="px-3 py-2">Kế toán nhận</th>
                </tr>
              </thead>
              <tbody>
                {(closed ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">{t.employee?.full_name ?? '—'}</td>
                    <td className="px-3 py-2">{WORK_BLOCK_LABELS[t.source_type]}</td>
                    <td className="px-3 py-2 text-right">{t.workdays}</td>
                    <td className="px-3 py-2 text-right">{t.overtime_hours}</td>
                    <td className="px-3 py-2 text-right">{t.leave_days}</td>
                    <td className="px-3 py-2 text-right">{t.unpaid_absence_days}</td>
                    <td className="px-3 py-2">
                      {t.transferred_at ? formatDateTime(t.transferred_at) : 'Chưa'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
