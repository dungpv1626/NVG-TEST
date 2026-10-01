/**
 * Sửa hồ sơ nhân sự (NS-01) — biểu mẫu ngắn ngay trong tab Hồ sơ.
 *
 * Trước 01/10/2026 hồ sơ lập xong là không sửa được trên giao diện: người thử việc xong không
 * chuyển được sang chính thức, đổi số điện thoại cũng phải nhờ quản trị. Chỉ gồm thông tin
 * thường; ba thứ cố ý KHÔNG có ở đây:
 *   · lương và căn cước — dữ liệu hạn chế, sửa ở đúng luồng có ghi nhật ký;
 *   · «Đã nghỉ việc» — đi qua «Ghi nhận nghỉ việc» để dựng danh sách bàn giao;
 *   · khối làm việc — đổi khối là đổi người ghi và người xác nhận công, làm lệch kỳ đang ghi.
 */

import { useState } from 'react';
import { EMPLOYEE_STATUS_META, type EmployeeStatus } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useActiveUsers } from '@/hooks/use-active-users';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUpdateEmployee, type EmployeeRecord } from '@/hooks/use-hr';

const EDITABLE_STATUSES: EmployeeStatus[] = ['thu_viec', 'chinh_thuc', 'tam_nghi'];

const SELECT_CLASS = 'h-9 w-full rounded-sm border border-border-strong bg-surface px-3';

export function EmployeeEditForm({
  employee,
  onDone,
}: {
  employee: EmployeeRecord;
  onDone: () => void;
}) {
  const update = useUpdateEmployee();
  const { data: users } = useActiveUsers();
  const [position, setPosition] = useState(employee.position);
  const [department, setDepartment] = useState(employee.department ?? '');
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [email, setEmail] = useState(employee.email ?? '');
  const [managerId, setManagerId] = useState(employee.manager_user_id ?? '');
  const [status, setStatus] = useState<EmployeeStatus>(employee.status);
  const [probationEnd, setProbationEnd] = useState(employee.probation_end_date ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!position.trim()) {
      setError('Chưa nhập chức danh.');
      return;
    }
    try {
      await update.mutateAsync({
        id: employee.id,
        changes: {
          position: position.trim(),
          department: department.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          manager_user_id: managerId || null,
          status,
          probation_end_date: probationEnd || null,
        },
      });
      onDone();
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="max-w-2xl space-y-3 rounded border border-border bg-surface p-4"
      aria-label="Sửa hồ sơ nhân sự"
    >
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Chức danh" required>
          <Input value={position} onChange={(e) => setPosition(e.target.value)} required />
        </Field>
        <Field label="Phòng ban">
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
        </Field>
        <Field label="Điện thoại">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Thư điện tử">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
        </Field>
        <Field label="Quản lý trực tiếp">
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Chưa phân công</option>
            {/* Người đang được gán luôn có mặt, kể cả khi danh sách chưa tải xong hoặc người đó
                đã ngừng hoạt động — không thì ô hiện «Chưa phân công» và lưu là xoá mất. */}
            {employee.manager_user_id &&
              !(users ?? []).some((u) => u.id === employee.manager_user_id) && (
                <option value={employee.manager_user_id}>
                  {employee.manager?.full_name ?? 'Người quản lý hiện tại'}
                </option>
              )}
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Tình trạng"
          hint="Nghỉ việc ghi ở tab Tiếp nhận, bàn giao để dựng danh sách bàn giao."
        >
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
            className={SELECT_CLASS}
          >
            {EDITABLE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </Field>
        {status === 'thu_viec' && (
          <Field label="Hết hạn thử việc">
            <DateInput value={probationEnd} onChange={setProbationEnd} />
          </Field>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={update.isPending}>
          {update.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
