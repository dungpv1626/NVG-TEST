/**
 * Chi tiết nhân sự — mẫu bố cục "Hồ sơ 360°" (Webapp Flow 4.3, AFD 7: Hồ sơ/Hợp đồng/Tài
 * sản/Chấm công).
 *
 * NS-01 đòi "hồ sơ điện tử duy nhất liên kết TOÀN BỘ quá trình từ ứng viên đến nghỉ việc".
 * Mỗi tab ở đây là một khúc của quá trình đó, cùng một hồ sơ chứ không phải các trang rời:
 * hợp đồng và bảo hiểm (NS-07), giấy tờ có hạn (NS-10), tài sản đang giữ (NS-08), số công đã
 * chốt (NS-04), và checklist tiếp nhận/bàn giao (NS-03, NS-11).
 *
 * ⚠️ Lương KHÔNG hiện sẵn. Có một nút riêng để xem, và mỗi lần bấm ghi một dòng vào
 * `sensitive_access_logs` (NEN-07). Nút chỉ hiện với vai trò được phép — người khác bấm cũng
 * bị CSDL từ chối, nhưng hiện rồi mới báo lỗi là đúng thứ Webapp Flow 6.5 cấm.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ASSET_CONDITION_LABELS,
  CHECKLIST_ITEM_GROUP_LABELS,
  CHECKLIST_KIND_LABELS,
  EMPLOYEE_STATUS_META,
  EMPLOYMENT_CONTRACT_STATUS_META,
  EMPLOYMENT_CONTRACT_TYPE_LABELS,
  HR_DOCUMENT_TYPE_LABELS,
  INSURANCE_STATUS_LABELS,
  LEAVE_REQUEST_STATUS_META,
  LEAVE_TYPE_LABELS,
  SALARY_TYPE_LABELS,
  WORK_BLOCK_LABELS,
  WORK_BLOCK_TIMEKEEPING,
  documentReminderStage,
  formatCurrency,
  formatDate,
} from '@nvg/shared';
import { EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import {
  useAssets,
  useChecklists,
  useEmployee,
  useEmployeeSalary,
  useEmploymentContracts,
  useHrDocuments,
  useLeaveRequests,
  useOffboardEmployee,
  useStartOnboarding,
  useTimesheets,
  useToggleChecklistItem,
} from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan } from '@/lib/auth';
import { ReminderTag } from './document-page';
import { NsNav } from './ns-nav';

/** Dòng dữ liệu "nhãn — giá trị" dùng lại trong nhiều tab. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  // Chuỗi RỖNG cũng phải hiện gạch ngang, không chỉ `null`: `formatCurrency` trả về chuỗi
  // rỗng khi không có số, và một ô trống trơn thì người đọc không phân biệt được "chưa nhập"
  // với "màn hình lỗi".
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2 last:border-b-0">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-right font-medium">{empty ? '—' : value}</span>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canEdit = useCan('NS', 'edit');
  // Hai hook phải chạy ở MỌI lần dựng: viết `useCan(…) || useCan(…)` thì hook thứ hai bị bỏ qua
  // khi hook đầu trả true, thứ tự hook đổi giữa hai lần dựng và React gán nhầm state.
  const canSeeNs = useCan('NS', 'view');
  const canSeeKt = useCan('KT', 'view');
  const canSeeSalary = canSeeNs || canSeeKt;

  const { data: employee, isLoading, error } = useEmployee(id);
  const { data: contracts } = useEmploymentContracts(id);
  const { data: documents } = useHrDocuments(id);
  const { data: assets } = useAssets(id);
  const { data: timesheets } = useTimesheets(new Date().getFullYear(), 1, id);
  const { data: leaves } = useLeaveRequests(id);
  const { data: checklists } = useChecklists(id);

  const [showSalary, setShowSalary] = useState(false);
  const salary = useEmployeeSalary(id, showSalary);

  const startOnboarding = useStartOnboarding();
  const offboard = useOffboardEmployee();
  const toggleItem = useToggleChecklistItem();

  const [terminationDate, setTerminationDate] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <ErrorState message={toUserMessage(error, 'view')} />;
  if (!employee) {
    return <ErrorState message="Không tìm thấy hồ sơ nhân sự này. Có thể hồ sơ đã được xóa." />;
  }

  const statusMeta = EMPLOYEE_STATUS_META[employee.status];

  async function runOffboard() {
    setPageError(null);
    if (!terminationDate) {
      setPageError('Chưa chọn ngày nghỉ việc. Chọn ngày để dựng danh sách bàn giao.');
      return;
    }
    try {
      await offboard.mutateAsync({ employeeId: employee!.id, terminationDate });
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  const profileTab = (
    <div className="max-w-2xl">
      <Row label="Khối làm việc" value={WORK_BLOCK_LABELS[employee.block]} />
      <Row label="Cách chấm công" value={WORK_BLOCK_TIMEKEEPING[employee.block]} />
      <Row label="Chức danh" value={employee.position} />
      <Row label="Phòng ban" value={employee.department} />
      {/*
        KHÔNG mặc định "Văn phòng" cho mọi người chưa gắn công trường: người khối công trường
        chưa được phân công là một việc CÒN THIẾU của Hành chính – Nhân sự, không phải người
        ngồi văn phòng. Nói nhầm chỗ này là giấu mất một việc phải làm.
      */}
      <Row
        label="Nơi làm việc"
        value={
          employee.site?.name ??
          (employee.block === 'van_phong' ? 'Văn phòng' : 'Chưa phân công nơi làm việc')
        }
      />
      <Row label="Quản lý trực tiếp" value={employee.manager?.full_name} />
      <Row label="Ngày vào làm" value={formatDate(employee.hire_date)} />
      <Row label="Hết hạn thử việc" value={formatDate(employee.probation_end_date)} />
      <Row label="Ngày nghỉ việc" value={formatDate(employee.termination_date)} />
      <Row label="Điện thoại" value={employee.phone} />
      <Row label="Hình thức trả lương" value={SALARY_TYPE_LABELS[employee.salary_type]} />

      <div className="mt-4 rounded border border-border bg-bg-subtle p-4">
        <h3 className="font-semibold">Mức lương</h3>
        <p className="mt-1 text-fg-subtle">
          Dữ liệu hạn chế. Mỗi lượt xem được ghi lại kèm tên người xem và thời điểm.
        </p>

        {canSeeSalary ? (
          showSalary ? (
            salary.isLoading ? (
              <Skeleton className="mt-3 h-6 w-40" />
            ) : salary.error ? (
              <p className="mt-3">{toUserMessage(salary.error, 'view')}</p>
            ) : (
              <div className="mt-3">
                <Row label="Lương thỏa thuận" value={formatCurrency(salary.data?.base_salary)} />
                <Row label="Phụ cấp" value={formatCurrency(salary.data?.allowance)} />
                <Row
                  label="Lương đóng bảo hiểm"
                  value={formatCurrency(salary.data?.insurance_salary)}
                />
              </div>
            )
          ) : (
            <Button variant="secondary" className="mt-3" onClick={() => setShowSalary(true)}>
              Xem mức lương
            </Button>
          )
        ) : (
          <p className="mt-3 text-fg-subtle">
            Vai trò hiện tại không được xem lương. Liên hệ Phòng Hành chính – Nhân sự nếu cần số
            liệu này.
          </p>
        )}
      </div>
    </div>
  );

  const contractTab =
    (contracts ?? []).length === 0 ? (
      <EmptyState message="Chưa có hợp đồng lao động nào. Thêm hợp đồng để theo dõi thời hạn và bảo hiểm." />
    ) : (
      <ul className="space-y-3">
        {(contracts ?? []).map((c) => (
          <li key={c.id} className="rounded border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{EMPLOYMENT_CONTRACT_TYPE_LABELS[c.type]}</span>
              <StatusWithLabel
                status={EMPLOYMENT_CONTRACT_STATUS_META[c.status].group}
                label={EMPLOYMENT_CONTRACT_STATUS_META[c.status].label}
              />
            </div>
            <div className="mt-2">
              <Row
                label="Hiệu lực"
                value={`${formatDate(c.start_date)} — ${c.end_date ? formatDate(c.end_date) : 'Không xác định thời hạn'}`}
              />
              <Row label="Ngày ký" value={formatDate(c.signed_date)} />
              <Row label="Bảo hiểm" value={INSURANCE_STATUS_LABELS[c.insurance_status]} />
            </div>
          </li>
        ))}
      </ul>
    );

  const documentTab =
    (documents ?? []).length === 0 ? (
      <EmptyState message="Chưa có giấy tờ nào được theo dõi. Thêm giấy tờ có thời hạn để hệ thống nhắc trước 90, 60, 30 và 7 ngày." />
    ) : (
      <ul className="space-y-2">
        {(documents ?? []).map((d) => {
          const stage = documentReminderStage(d.expiry_date);
          return (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
            >
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-fg-subtle">{HR_DOCUMENT_TYPE_LABELS[d.type]}</div>
              </div>
              <div className="text-right">
                <div>{d.expiry_date ? formatDate(d.expiry_date) : 'Không có hạn'}</div>
                {stage !== null && <ReminderTag stage={stage} />}
              </div>
            </li>
          );
        })}
      </ul>
    );

  const assetTab =
    (assets ?? []).length === 0 ? (
      <EmptyState message="Người này chưa giữ tài sản nào. Cấp phát tài sản ở màn hình Tài sản." />
    ) : (
      <ul className="space-y-2">
        {(assets ?? []).map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
          >
            <div>
              <div className="font-medium">{a.name}</div>
              <div className="text-fg-subtle">
                {a.code ?? 'Chưa có mã'}
                {a.serial_number ? ` · ${a.serial_number}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div>{ASSET_CONDITION_LABELS[a.condition]}</div>
              <div className="text-fg-subtle">{formatCurrency(a.value)}</div>
            </div>
          </li>
        ))}
      </ul>
    );

  const timesheetTab = (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-semibold">Bảng công đã chốt</h3>
        {(timesheets ?? []).length === 0 ? (
          <EmptyState message="Chưa có kỳ chấm công nào được chốt cho người này." />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-fg-subtle">
                <th className="px-3 py-2">Kỳ</th>
                <th className="px-3 py-2 text-right">Ngày công</th>
                <th className="px-3 py-2 text-right">Tăng ca</th>
                <th className="px-3 py-2 text-right">Nghỉ phép</th>
                <th className="px-3 py-2 text-right">Nghỉ không phép</th>
              </tr>
            </thead>
            <tbody>
              {(timesheets ?? []).map((t) => (
                <tr key={t.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">{`Tháng ${t.month}/${t.year}`}</td>
                  <td className="px-3 py-2 text-right">{t.workdays}</td>
                  <td className="px-3 py-2 text-right">{t.overtime_hours} giờ</td>
                  <td className="px-3 py-2 text-right">{t.leave_days}</td>
                  <td className="px-3 py-2 text-right">{t.unpaid_absence_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold">Đơn nghỉ phép</h3>
        {(leaves ?? []).length === 0 ? (
          <EmptyState message="Chưa có đơn nghỉ phép nào." />
        ) : (
          <ul className="space-y-2">
            {(leaves ?? []).map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
              >
                <div>
                  <div className="font-medium">{LEAVE_TYPE_LABELS[l.type]}</div>
                  <div className="text-fg-subtle">
                    {formatDate(l.from_date)} — {formatDate(l.to_date)} · {l.day_count} ngày
                  </div>
                </div>
                <StatusWithLabel
                  status={LEAVE_REQUEST_STATUS_META[l.status].group}
                  label={LEAVE_REQUEST_STATUS_META[l.status].label}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const handoverTab = (
    <div className="space-y-6">
      {pageError && <ErrorState message={pageError} />}

      {(checklists ?? []).map((c) => (
        <section key={c.id}>
          <h3 className="mb-2 font-semibold">
            {CHECKLIST_KIND_LABELS[c.kind]} · {formatDate(c.effective_date)}
          </h3>
          <ul className="space-y-1">
            {c.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2 rounded border border-border p-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={item.done_at !== null}
                  disabled={!canEdit || toggleItem.isPending}
                  aria-label={item.title}
                  onChange={(e) =>
                    void toggleItem.mutateAsync({
                      itemId: item.id,
                      done: e.target.checked,
                      userId: profile?.id ?? null,
                    })
                  }
                />
                <div>
                  <div className={item.done_at ? 'text-fg-subtle line-through' : ''}>
                    {item.title}
                  </div>
                  <div className="text-fg-subtle">
                    {CHECKLIST_ITEM_GROUP_LABELS[item.item_group]}
                    {item.done_by_user ? ` · ${item.done_by_user.full_name}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {canEdit && (
        <section className="space-y-3 rounded border border-border bg-bg-subtle p-4">
          <h3 className="font-semibold">Thao tác</h3>

          {!(checklists ?? []).some((c) => c.kind === 'tiep_nhan') && (
            <Button
              variant="secondary"
              onClick={() =>
                void startOnboarding
                  .mutateAsync({ employeeId: employee.id })
                  .catch((e) => setPageError(toUserMessage(e, 'edit')))
              }
            >
              Lập checklist tiếp nhận
            </Button>
          )}

          {employee.status !== 'da_nghi' && (
            <div className="space-y-2">
              <Field
                label="Ngày nghỉ việc"
                hint="Danh sách bàn giao được dựng theo đúng tài sản người này đang giữ."
              >
                <DateInput value={terminationDate} onChange={setTerminationDate} />
              </Field>
              <Button variant="secondary" onClick={() => void runOffboard()}>
                Ghi nhận nghỉ việc
              </Button>
            </div>
          )}
        </section>
      )}

      {(checklists ?? []).length === 0 && employee.status === 'da_nghi' && (
        <EmptyState message="Chưa có checklist nào cho hồ sơ này." />
      )}
    </div>
  );

  return (
    <>
      <NsNav />
      <EntityDetail
        breadcrumbs={[
          { label: 'Hành chính – Nhân sự' },
          { label: 'Hồ sơ nhân sự', to: '/ns/nhan-su' },
          { label: employee.full_name },
        ]}
        title={employee.full_name}
        code={employee.code ?? '—'}
        status={statusMeta.group}
        responsiblePerson={employee.manager?.full_name ?? null}
        deadline={employee.status === 'thu_viec' ? employee.probation_end_date : null}
        tabs={[
          { id: 'ho-so', label: 'Hồ sơ', content: profileTab },
          { id: 'hop-dong', label: 'Hợp đồng', content: contractTab, badge: contracts?.length },
          { id: 'giay-to', label: 'Giấy tờ', content: documentTab, badge: documents?.length },
          { id: 'tai-san', label: 'Tài sản', content: assetTab, badge: assets?.length },
          { id: 'cham-cong', label: 'Chấm công', content: timesheetTab },
          { id: 'ban-giao', label: 'Tiếp nhận, bàn giao', content: handoverTab },
        ]}
        // Panel ngữ cảnh chỉ chứa LIÊN KẾT tới hồ sơ ở module khác (Webapp Flow 5.1). Không
        // nhồi thêm thông tin đã có ở tab Hồ sơ cho panel đỡ trống — đọc hai lần cùng một
        // thứ ở hai chỗ là cách nhanh nhất để người dùng thôi nhìn panel này.
        related={
          employee.site
            ? [
                {
                  title: 'Liên kết',
                  records: [
                    {
                      label: 'Công trường',
                      value: employee.site.name,
                      to: `/tc/cong-trinh/${employee.site.id}`,
                    },
                  ],
                },
              ]
            : []
        }
      />
    </>
  );
}
