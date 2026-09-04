/**
 * Đơn nghỉ phép (NS-05) — mẫu bố cục Danh sách kèm biểu mẫu ngắn (Webapp Flow 4.2, 4.4).
 *
 * Đơn KHÔNG được duyệt ở màn hình này: nó đi vào Hộp thư Phê duyệt dùng chung như mọi loại
 * phê duyệt khác (Webapp Flow 4.6). Ở đây chỉ lập đơn, gửi đi và theo dõi.
 *
 * Ngày nghỉ chỉ vào được bảng chấm công sau khi đơn ĐÃ DUYỆT — hàng rào nằm trong CSDL
 * (`save_attendance` từ chối "nghỉ có phép" không có đơn), nên không có cách nào lách bằng
 * cách ghi công trước rồi xin phép sau.
 */

import { useState } from 'react';
import {
  LEAVE_REQUEST_STATUS_META,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  formatDate,
  leaveDayCount,
} from '@nvg/shared';
import type { LeaveType } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import {
  useCancelLeaveRequest,
  useCreateLeaveRequest,
  useEmployees,
  useLeaveRequests,
  useSubmitLeaveRequest,
} from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { NsNav } from './ns-nav';

export function LeavePage() {
  const scope = useCompanyScope();
  const canCreate = useCan('NS', 'create');

  const { data, isLoading, error, refetch } = useLeaveRequests();
  const { data: employees } = useEmployees();
  const create = useCreateLeaveRequest();
  const submit = useSubmitLeaveRequest();
  const cancel = useCancelLeaveRequest();

  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<LeaveType>('phep_nam');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dayCount = fromDate && toDate ? leaveDayCount(fromDate, toDate) : 0;

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    setNotice(null);

    if (!scope.companyId || scope.isAggregate) {
      setPageError(
        'Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi lập đơn nghỉ phép.',
      );
      return;
    }
    if (dayCount <= 0) {
      setPageError('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
      return;
    }

    try {
      const id = await create.mutateAsync({
        companyId: scope.companyId,
        employeeId,
        type,
        fromDate,
        toDate,
        dayCount: String(dayCount),
        reason,
      });
      await submit.mutateAsync({ leaveId: id });
      setNotice('Đã gửi đơn nghỉ phép đi phê duyệt.');
      setEmployeeId('');
      setFromDate('');
      setToDate('');
      setReason('');
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <NsNav />
      <PageHeader
        title="Nghỉ phép"
        description="Đơn đã duyệt mới được ghi là ngày nghỉ có phép trên bảng chấm công."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Nghỉ phép' }]}
      />

      {pageError && <ErrorState message={pageError} />}
      {notice && <p className="mb-4 rounded border border-border bg-bg-subtle p-3">{notice}</p>}

      {canCreate && (
        <form
          onSubmit={submitForm}
          className="mb-6 grid gap-4 rounded border border-border bg-bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Nhân sự" required>
            <select
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            >
              <option value="">Chọn nhân sự</option>
              {(employees ?? [])
                .filter((e) => e.status !== 'da_nghi')
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Loại nghỉ" required>
            <select
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEAVE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Từ ngày" required>
            <DateInput value={fromDate} onChange={setFromDate} required />
          </Field>

          <Field label="Đến ngày" required>
            <DateInput value={toDate} onChange={setToDate} required />
          </Field>

          <Field
            label="Lý do"
            required
            hint={dayCount > 0 ? `Số ngày nghỉ: ${dayCount}` : undefined}
            className="sm:col-span-2"
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>

          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending || submit.isPending}>
              {create.isPending || submit.isPending ? 'Đang gửi…' : 'Gửi phê duyệt'}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có đơn nghỉ phép nào. Lập đơn để ngày nghỉ được ghi đúng trên bảng chấm công." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left text-fg-subtle">
                <th className="px-3 py-2">Nhân sự</th>
                <th className="px-3 py-2">Loại nghỉ</th>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2 text-right">Số ngày</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((l) => {
                const meta = LEAVE_REQUEST_STATUS_META[l.status];
                return (
                  <tr key={l.id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">{l.employee?.full_name ?? '—'}</td>
                    <td className="px-3 py-2">{LEAVE_TYPE_LABELS[l.type]}</td>
                    <td className="px-3 py-2">
                      {formatDate(l.from_date)} — {formatDate(l.to_date)}
                    </td>
                    <td className="px-3 py-2 text-right">{l.day_count}</td>
                    <td className="px-3 py-2">
                      <StatusWithLabel status={meta.group} label={meta.label} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(l.status === 'nhap' || l.status === 'cho_duyet') && canCreate && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setPageError(null);
                            void cancel
                              .mutateAsync({
                                leaveId: l.id,
                                reason: 'Người lập đơn xin hủy',
                              })
                              .catch((e) => setPageError(toUserMessage(e, 'edit')));
                          }}
                        >
                          Hủy đơn
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
