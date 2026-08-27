/**
 * Chín màn hình của Module NS — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Vì sao cần: hàng rào nghiệp vụ đã được canh ở tầng CSDL (`db/src/__tests__/ns.test.ts`),
 * nhưng một màn hình vẫn có thể VỠ KHI VẼ mà không test nào bắt được — thiếu một nhãn trong
 * bảng tra, đọc một trường rỗng, gọi hook sai thứ tự. Loại lỗi đó chỉ lộ ra khi mở trình
 * duyệt, và mở trình duyệt thì phải đăng nhập.
 *
 * Ngoài việc "không vỡ", mỗi phép thử dưới đây khẳng định một điều NGƯỜI DÙNG thấy:
 *
 *  - Danh sách nhân sự KHÔNG có cột lương (PRD NS ranh giới).
 *  - Chi tiết nhân sự không hiện sẵn lương — phải bấm, vì mỗi lượt xem ghi nhật ký (NEN-07).
 *  - Màn hình Chấm công nói rõ CÒN THIẾU KHỐI NÀO thay vì để người dùng bấm rồi mới báo lỗi
 *    (Webapp Flow 6.5) — đúng quy tắc "cả ba khối xác nhận mới chốt được" của NS-04.
 *  - Giấy tờ quá hạn hiện nhãn CHỮ, không chỉ hiện màu (CGD 6.8).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  salaryRequested: false,
  periods: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Ngô Thị I', assignments: [], permissions: [] },
  }),
  useCan: () => true,
}));

vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({
    companyId: 'nvc-id',
    companyCode: 'NVC',
    isAggregate: false,
    isReady: true,
  }),
  withCompanyScope: <Q,>(q: Q) => q,
}));

vi.mock('@/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({
    data: [{ id: 'ct1', name: 'Nhà xưởng Long An' }],
    isLoading: false,
  }),
}));

const EMPLOYEE = {
  id: 'e1',
  company_id: 'nvc-id',
  code: 'NVC-NS-2026-0001',
  full_name: 'Trần Văn Bảy',
  user_id: null,
  block: 'cong_truong' as const,
  department: null,
  position: 'Giám sát hiện trường',
  manager_user_id: null,
  construction_site_id: 'ct1',
  status: 'thu_viec' as const,
  hire_date: '2026-07-01',
  probation_end_date: '2026-09-01',
  termination_date: null,
  phone: '0901234567',
  email: null,
  date_of_birth: null,
  address: null,
  salary_type: 'thang' as const,
  notes: null,
  created_at: '2026-07-01T03:00:00Z',
  site: { id: 'ct1', code: 'NVC-CT-01', name: 'Nhà xưởng Long An' },
  manager: { full_name: 'Lê Văn Năm' },
};

/** Một kỳ đã xác nhận, hai kỳ chưa — đúng tình huống "chưa chốt được" của NS-04. */
const PERIODS = [
  {
    id: 'p1',
    company_id: 'nvc-id',
    year: 2026,
    month: 7,
    source_type: 'van_phong' as const,
    status: 'da_xac_nhan' as const,
    confirmed_at: '2026-08-02T02:00:00Z',
    closed_at: null,
    notes: null,
    confirmer: { full_name: 'Ngô Thị I' },
  },
  {
    id: 'p2',
    company_id: 'nvc-id',
    year: 2026,
    month: 7,
    source_type: 'cong_truong' as const,
    status: 'cho_xac_nhan' as const,
    confirmed_at: null,
    closed_at: null,
    notes: null,
    confirmer: null,
  },
];

const mutation = () => ({ mutateAsync: vi.fn().mockResolvedValue('id'), isPending: false });

vi.mock('@/hooks/use-hr', () => ({
  useEmployees: () => ({ data: [EMPLOYEE], isLoading: false, error: null, refetch: vi.fn() }),
  useEmployee: () => ({ data: EMPLOYEE, isLoading: false, error: null }),
  useEmployeeSalary: (_id: string | undefined, enabled: boolean) => {
    state.salaryRequested = enabled;
    return {
      data: enabled
        ? {
            salary_type: 'thang',
            base_salary: '20000000',
            allowance: '1000000',
            insurance_salary: null,
          }
        : null,
      isLoading: false,
      error: null,
    };
  },
  useEmploymentContracts: () => ({
    data: [
      {
        id: 'hd1',
        employee_id: 'e1',
        code: null,
        type: 'thu_viec',
        status: 'dang_hieu_luc',
        start_date: '2026-07-01',
        end_date: '2026-09-01',
        signed_date: '2026-06-28',
        insurance_status: 'chua_tham_gia',
        insurance_from_date: null,
        insurance_to_date: null,
        notes: null,
      },
    ],
  }),
  useHrDocuments: () => ({
    data: [
      {
        id: 'gt1',
        company_id: 'nvc-id',
        employee_id: 'e1',
        labor_worker_id: null,
        type: 'chung_chi_an_toan',
        title: 'Chứng chỉ huấn luyện an toàn nhóm 3',
        issued_date: '2024-01-01',
        // Đã qua hạn — nhóm nguy hiểm nhất, phải hiện nhãn chữ.
        expiry_date: '2025-01-01',
        original_location: 'Tủ hồ sơ HCNS',
        last_reminded_stage: null,
        notes: null,
        employee: { id: 'e1', full_name: 'Trần Văn Bảy', code: 'NVC-NS-2026-0001' },
        worker: null,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAssets: () => ({
    data: [
      {
        id: 'ts1',
        company_id: 'nvc-id',
        code: 'TS-001',
        name: 'Máy tính xách tay Dell',
        serial_number: 'SN123',
        category: null,
        value: '18000000',
        purchase_date: null,
        condition: 'tot',
        current_holder_id: 'e1',
        location: null,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        holder: { id: 'e1', full_name: 'Trần Văn Bảy', code: 'NVC-NS-2026-0001' },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAssetEvents: () => ({ data: [] }),
  useTimesheets: () => ({ data: [], isLoading: false, error: null }),
  useTimesheetPeriods: () => ({ data: PERIODS, isLoading: false, error: null, refetch: vi.fn() }),
  useTimesheetEntries: () => ({ data: [] }),
  useLeaveRequests: () => ({
    data: [
      {
        id: 'np1',
        company_id: 'nvc-id',
        employee_id: 'e1',
        code: null,
        type: 'phep_nam',
        status: 'cho_duyet',
        from_date: '2026-09-10',
        to_date: '2026-09-12',
        day_count: '3',
        reason: 'Việc gia đình',
        decided_at: null,
        reject_reason: null,
        created_at: '2026-09-01T00:00:00Z',
        employee: { id: 'e1', full_name: 'Trần Văn Bảy', code: null },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useChecklists: () => ({ data: [] }),
  useRecruitmentPositions: () => ({
    data: [
      {
        id: 'td1',
        company_id: 'nvc-id',
        code: null,
        title: 'Kỹ sư giám sát',
        department: null,
        block: 'cong_truong',
        status: 'dang_tuyen',
        headcount: 2,
        hired_count: 0,
        needed_by_date: '2026-10-01',
        requirements: 'Ba năm kinh nghiệm',
        created_at: '2026-09-01T00:00:00Z',
        requester: { full_name: 'Lê Văn Năm' },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCandidates: () => ({
    data: [
      {
        id: 'uv1',
        recruitment_position_id: 'td1',
        full_name: 'Phạm Thị Sáu',
        phone: '0912345678',
        email: null,
        stage: 'sang_loc',
        applied_date: '2026-09-05',
        interview_at: null,
        evaluation: null,
        reject_reason: null,
        employee_id: null,
      },
    ],
    isLoading: false,
  }),
  usePayrollAdjustments: () => ({ data: [], isLoading: false }),
  useLaborWorkers: () => ({ data: [], isLoading: false }),
  useCreateEmployee: mutation,
  useUpdateEmployee: mutation,
  useCreateEmploymentContract: mutation,
  useCreateHrDocument: mutation,
  useOpenTimesheetPeriod: mutation,
  useSaveAttendance: mutation,
  useSubmitTimesheetPeriod: mutation,
  useConfirmTimesheetPeriod: mutation,
  useConsolidateTimesheets: mutation,
  useAdjustTimesheet: mutation,
  useTransferTimesheets: mutation,
  useCreateLeaveRequest: mutation,
  useSubmitLeaveRequest: mutation,
  useCancelLeaveRequest: mutation,
  useCreatePayrollAdjustment: mutation,
  useCreateAsset: mutation,
  useRecordAssetEvent: mutation,
  useStartOnboarding: mutation,
  useOffboardEmployee: mutation,
  useToggleChecklistItem: mutation,
  useCreateRecruitmentPosition: mutation,
  useSubmitRecruitmentApproval: mutation,
  useCreateCandidate: mutation,
  useMoveCandidate: mutation,
  useHireCandidate: mutation,
  useCreateLaborWorker: mutation,
}));

const { HrDashboardPage } = await import('../hr-dashboard');
const { EmployeeListPage } = await import('../employee-list');
const { EmployeeCreatePage } = await import('../employee-create');
const { EmployeeDetailPage } = await import('../employee-detail');
const { TimesheetPage } = await import('../timesheet-page');
const { LeavePage } = await import('../leave-page');
const { AssetPage } = await import('../asset-page');
const { HrDocumentPage } = await import('../document-page');
const { RecruitmentPage } = await import('../recruitment-page');

describe('Chín màn hình NS dựng được và nói đúng tiếng Việt', () => {
  it('Việc cần xử lý — nêu đúng ba nhóm việc của AFD 3.8', () => {
    renderWithApp(<HrDashboardPage />, { route: '/ns/viec-can-xu-ly' });
    expect(screen.getByRole('heading', { name: 'Việc cần xử lý' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Giấy tờ tới hạn' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sắp hết thử việc' })).toBeInTheDocument();
  });

  it('Danh sách nhân sự KHÔNG có cột lương (PRD NS ranh giới)', () => {
    renderWithApp(<EmployeeListPage />, { route: '/ns/nhan-su' });
    // Nhiều lần vì bố cục máy tính (bảng) và bố cục di động (thẻ) cùng nằm trong DOM.
    expect(screen.getAllByText('Trần Văn Bảy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Công trường').length).toBeGreaterThan(0);
    expect(screen.queryByText(/lương/i)).not.toBeInTheDocument();
  });

  it('Biểu mẫu thêm nhân sự nói rõ đâu là thông tin hạn chế', () => {
    renderWithApp(<EmployeeCreatePage />, { route: '/ns/nhan-su/tao-moi' });
    expect(screen.getByRole('heading', { name: 'Thông tin hạn chế' })).toBeInTheDocument();
    expect(screen.getByText(/mỗi lượt xem đều được ghi nhật ký/i)).toBeInTheDocument();
  });

  it('Chi tiết nhân sự KHÔNG hiện sẵn lương — phải bấm mới xem (NEN-07)', async () => {
    renderWithApp(<EmployeeDetailPage />, { route: '/ns/nhan-su/e1' });

    expect(screen.getByRole('heading', { name: 'Trần Văn Bảy' })).toBeInTheDocument();
    expect(screen.queryByText('20.000.000 đồng')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Xem mức lương' }));
    expect(screen.getByText('20.000.000 đồng')).toBeInTheDocument();
    expect(state.salaryRequested).toBe(true);
  });

  it('Chấm công — nói rõ CÒN THIẾU KHỐI NÀO và khoá nút chốt (NS-04, Webapp Flow 6.5)', () => {
    renderWithApp(<TimesheetPage />, { route: '/ns/cham-cong' });

    expect(screen.getByRole('heading', { name: 'Văn phòng' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Công trường' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Xưởng sản xuất' })).toBeInTheDocument();

    expect(screen.getByText(/Còn chờ xác nhận: Công trường, Xưởng sản xuất/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chốt kỳ chấm công' })).toBeDisabled();
  });

  it('Nghỉ phép — hiện đơn kèm nhãn chữ của trạng thái', () => {
    renderWithApp(<LeavePage />, { route: '/ns/nghi-phep' });
    // Chuỗi xuất hiện cả trong ô chọn loại nghỉ của biểu mẫu lẫn trong bảng đơn.
    expect(screen.getAllByText('Nghỉ phép năm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0);
  });

  it('Tài sản — hiện ai đang giữ ngay cạnh tên món', () => {
    renderWithApp(<AssetPage />, { route: '/ns/tai-san' });
    expect(screen.getByText('Máy tính xách tay Dell')).toBeInTheDocument();
    expect(screen.getByText('Trần Văn Bảy')).toBeInTheDocument();
    expect(screen.getByText('18.000.000 đồng')).toBeInTheDocument();
  });

  it('Giấy tờ — giấy đã hết hạn hiện nhãn CHỮ, không chỉ hiện màu (CGD 6.8)', () => {
    renderWithApp(<HrDocumentPage />, { route: '/ns/giay-to' });
    expect(screen.getByText('Chứng chỉ huấn luyện an toàn nhóm 3')).toBeInTheDocument();
    expect(screen.getAllByText('Đã hết hạn').length).toBeGreaterThan(0);
  });

  it('Tuyển dụng — bảng Kanban đủ các bước của NS-02', async () => {
    renderWithApp(<RecruitmentPage />, { route: '/ns/tuyen-dung' });
    expect(screen.getByText('Kỹ sư giám sát')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ứng viên' }));
    expect(screen.getAllByText('Sàng lọc CV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đã gửi thư mời').length).toBeGreaterThan(0);
    expect(screen.getByText('Phạm Thị Sáu')).toBeInTheDocument();
  });
});
