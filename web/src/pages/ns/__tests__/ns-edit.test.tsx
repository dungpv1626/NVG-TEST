/**
 * Ba chỗ hổng của phân hệ Nhân sự lấp 01/10/2026: bảng công từng người, lập hợp đồng lao
 * động, chuyển chính thức.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  saved: [] as unknown[],
  updates: [] as unknown[],
  contracts: [] as unknown[],
}));

vi.mock('@/hooks/use-sensitive-access', () => ({
  useSensitiveAccess: () => ({ data: { profit: false, finance: false, salary: true } }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Ngô Thị I', assignments: [], permissions: [] },
  }),
  useCan: () => true,
}));
vi.mock('@/hooks/use-active-users', () => ({ useActiveUsers: () => ({ data: [] }) }));

const EMPLOYEE = {
  id: 'e1',
  company_id: 'nvc',
  code: 'NVC-NS-2026-0003',
  full_name: 'Phạm Minh Thư',
  user_id: null,
  block: 'van_phong' as const,
  department: 'Phòng Hành chính – Nhân sự',
  position: 'Nhân viên hành chính',
  manager_user_id: null,
  construction_site_id: null,
  status: 'thu_viec' as const,
  hire_date: '2026-08-11',
  probation_end_date: '2026-10-10',
  termination_date: null,
  phone: null,
  email: null,
  date_of_birth: null,
  address: null,
  salary_type: 'thang' as const,
  notes: null,
  created_at: '2026-08-11T00:00:00Z',
  site: null,
  manager: null,
};

const mutation = (sink: unknown[]) => () => ({
  isPending: false,
  mutateAsync: async (input: unknown) => {
    sink.push(input);
    return 'id';
  },
});

vi.mock('@/hooks/use-hr', () => ({
  useEmployee: () => ({ data: EMPLOYEE, isLoading: false, error: null }),
  useEmploymentContracts: () => ({
    data: [
      {
        id: 'hd-tv',
        employee_id: 'e1',
        code: null,
        type: 'thu_viec',
        status: 'dang_hieu_luc',
        start_date: '2026-08-11',
        end_date: '2026-10-10',
        signed_date: null,
        insurance_status: 'chua_tham_gia',
        insurance_from_date: null,
        insurance_to_date: null,
        notes: null,
      },
    ],
  }),
  useHrDocuments: () => ({ data: [] }),
  useAssets: () => ({ data: [] }),
  useTimesheets: () => ({ data: [] }),
  useLeaveRequests: () => ({ data: [] }),
  useChecklists: () => ({ data: [] }),
  useEmployeeSalary: () => ({ data: null, isLoading: false, error: null }),
  useStartOnboarding: mutation([]),
  useOffboardEmployee: mutation([]),
  useToggleChecklistItem: mutation([]),
  useUpdateEmployee: mutation(state.updates),
  useCreateEmploymentContract: mutation(state.contracts),
  useSaveAttendance: mutation(state.saved),
  useTimesheetEntries: () => ({
    isLoading: false,
    error: null,
    data: [
      {
        id: 'c1',
        employee_id: 'e1',
        work_date: '2026-09-01',
        kind: 'lam_viec',
        hours: '8',
        overtime_hours: null,
        output_quantity: null,
        leave_request_id: null,
        notes: null,
        employee: null,
      },
      {
        id: 'c2',
        employee_id: 'e1',
        work_date: '2026-09-03',
        kind: 'nghi_co_phep',
        hours: null,
        overtime_hours: null,
        output_quantity: null,
        leave_request_id: 'np',
        notes: null,
        employee: null,
      },
      {
        id: 'c3',
        employee_id: 'e1',
        work_date: '2026-09-04',
        kind: 'nghi_khong_phep',
        hours: null,
        overtime_hours: null,
        output_quantity: null,
        leave_request_id: null,
        notes: null,
        employee: null,
      },
    ],
  }),
}));

const { EmployeeDetailPage } = await import('../employee-detail');
const { TimesheetGrid } = await import('../timesheet-grid');

beforeEach(() => {
  state.saved.length = 0;
  state.updates.length = 0;
  state.contracts.length = 0;
});

const PERIOD = {
  id: 'ky-9',
  company_id: 'nvc',
  year: 2026,
  month: 9,
  source_type: 'van_phong' as const,
  status: 'dang_ghi' as const,
  confirmed_at: null,
  closed_at: null,
  notes: null,
  confirmer: null,
};

describe('Bảng công chi tiết', () => {
  it('ô hiện giờ làm và ký hiệu P/K; cột tổng đếm đúng', () => {
    renderWithApp(<TimesheetGrid period={PERIOD} employees={[EMPLOYEE]} />);
    expect(screen.getByRole('button', { name: /01\/09\/2026: Làm việc, 8 giờ/ })).toHaveTextContent(
      '8',
    );
    expect(screen.getByRole('button', { name: /03\/09\/2026: Nghỉ có phép/ })).toHaveTextContent(
      'P',
    );
    expect(screen.getByRole('button', { name: /04\/09\/2026: Nghỉ không phép/ })).toHaveTextContent(
      'K',
    );
    // Tháng 9 có 30 cột ngày.
    expect(screen.getAllByRole('button', { name: /Phạm Minh Thư, \d\d\/09\/2026/ })).toHaveLength(
      30,
    );
  });

  it('bấm ô rồi lưu gửi đúng một dòng công cho người và ngày đó', async () => {
    const user = userEvent.setup();
    renderWithApp(<TimesheetGrid period={PERIOD} employees={[EMPLOYEE]} />);
    await user.click(screen.getByRole('button', { name: /05\/09\/2026: chưa ghi/ }));
    await user.selectOptions(screen.getByLabelText('Loại ngày công'), 'cong_tac');
    await user.click(screen.getByRole('button', { name: 'Lưu ngày công' }));
    expect(state.saved).toEqual([
      {
        periodId: 'ky-9',
        entries: [
          {
            employee_id: 'e1',
            work_date: '2026-09-05',
            kind: 'cong_tac',
            hours: '8',
            overtime_hours: null,
          },
        ],
      },
    ]);
  });

  it('kỳ đã gửi xác nhận thì ô không bấm được', () => {
    renderWithApp(
      <TimesheetGrid period={{ ...PERIOD, status: 'cho_xac_nhan' }} employees={[EMPLOYEE]} />,
    );
    expect(screen.getByRole('button', { name: /05\/09\/2026: chưa ghi/ })).toBeDisabled();
  });
});

describe('Hồ sơ nhân sự — chuyển chính thức và hợp đồng', () => {
  it('nút «Xem mức lương» theo quyền xem lương của CSDL, không theo quyền mở phân hệ', () => {
    renderWithApp(<EmployeeDetailPage />, { route: '/ns/nhan-su/e1' });
    expect(screen.getByRole('button', { name: 'Xem mức lương' })).toBeInTheDocument();
  });

  it('người thử việc có nút chính «Chuyển chính thức»; xác nhận xong mở biểu mẫu hợp đồng', async () => {
    const user = userEvent.setup();
    renderWithApp(<EmployeeDetailPage />, { route: '/ns/nhan-su/e1' });
    await user.click(screen.getByRole('button', { name: 'Chuyển chính thức' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Chuyển chính thức' }),
    );
    expect(state.updates).toEqual([{ id: 'e1', changes: { status: 'chinh_thuc' } }]);
    const form = await screen.findByRole('form', { name: 'Lập hợp đồng lao động' });
    expect(within(form).getByLabelText(/Loại hợp đồng/)).toHaveValue('xac_dinh_han');
    // Hợp đồng thử việc đang hiệu lực được đề nghị kết thúc khi lưu hợp đồng mới.
    expect(within(form).getByRole('checkbox')).toBeChecked();
  });

  it('hợp đồng xác định thời hạn thiếu ngày kết thúc thì không lưu, nói rõ vì sao', async () => {
    const user = userEvent.setup();
    renderWithApp(<EmployeeDetailPage />, {
      route: '/ns/nhan-su/e1?tab=hop-dong',
    });
    await user.click(screen.getByRole('button', { name: 'Thêm hợp đồng' }));
    const form = screen.getByRole('form', { name: 'Lập hợp đồng lao động' });
    await user.selectOptions(within(form).getByLabelText(/Loại hợp đồng/), 'xac_dinh_han');
    await user.type(within(form).getByLabelText(/Hiệu lực từ ngày/), '01/11/2026');
    await user.click(within(form).getByRole('button', { name: 'Lưu hợp đồng' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(/Chưa chọn ngày kết thúc/);
    expect(state.contracts).toHaveLength(0);
  });
});
