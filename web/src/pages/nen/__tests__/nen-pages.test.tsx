/**
 * Sáu màn hình của phân hệ Quản trị hệ thống — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Mỗi phép thử dưới đây giữ một ranh giới đã ghi thành quyết định, chứ không chỉ kiểm
 * "màn hình không vỡ":
 *
 *  - Tham số chưa cấu hình hiện CHỮ, không hiện số 0 (PRD v1.4 Mục 2.3). Đây là ranh giới dễ
 *    mất nhất: chỉ cần một `?? 0` là ô trống nhìn thấy được biến thành con số trông như đã
 *    duyệt.
 *  - Bảng thời hạn xử lý rỗng phải NÓI RÕ ai quyết và điều gì chưa chạy được, thay vì hiện
 *    một danh sách trắng đọc như lỗi.
 *  - Hạn mức rỗng nghĩa là KHÔNG GIỚI HẠN, không phải bằng không — hiện sai chỗ này là đảo
 *    ngược quyền của Tổng Giám đốc.
 *  - Một người giữ nhiều vai trò ở nhiều pháp nhân phải hiện ĐỦ (PRD NEN-02).
 *  - Nhật ký không có đường sửa hay xóa từ giao diện (NEN-07).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Quản trị viên', assignments: [], permissions: [] },
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

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({
    data: [
      {
        id: 'nvc-id',
        code: 'NVC',
        short_name: 'Nhà Việt Cons',
        is_transactional: true,
        display_order: 1,
      },
      {
        id: 'nvs-id',
        code: 'NVS',
        short_name: 'Nhà Việt Steel',
        is_transactional: true,
        display_order: 2,
      },
    ],
    isLoading: false,
  }),
  useCompanyLookup: () => (id: string | null | undefined) =>
    id === 'nvc-id'
      ? { id: 'nvc-id', code: 'NVC', short_name: 'Nhà Việt Cons' }
      : id === 'nvs-id'
        ? { id: 'nvs-id', code: 'NVS', short_name: 'Nhà Việt Steel' }
        : null,
}));

vi.mock('@/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({
    data: [{ id: 'ct1', code: 'NVC-CT-0001', name: 'Nhà xưởng Long An', company_id: 'nvc-id' }],
    isLoading: false,
  }),
}));

const idle = { isPending: false, mutateAsync: vi.fn() };

const adminState = vi.hoisted(() => ({
  parameters: [] as unknown[],
  limits: [] as unknown[],
  slas: [] as unknown[],
  users: [] as unknown[],
  assignments: [] as unknown[],
  audits: [] as unknown[],
  sensitives: [] as unknown[],
}));

vi.mock('@/hooks/use-admin', () => ({
  useSystemParameters: () => ({
    data: adminState.parameters,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useParameterHistory: () => ({ data: [], isLoading: false }),
  useSaveSystemParameter: () => idle,
  useApprovalLimits: () => ({
    data: adminState.limits,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSaveApprovalLimit: () => idle,
  useSlaDefinitions: () => ({
    data: adminState.slas,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateSla: () => idle,
  useSaveSla: () => idle,
  useRoles: () => ({
    data: [{ id: 'r-mh', code: 'MH', label: 'Trưởng phòng Mua hàng', site_scoped: false }],
  }),
  useAdminUsers: () => ({
    data: adminState.users,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSetUserActive: () => idle,
  useSiteAssignments: () => ({
    data: adminState.assignments,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateSiteAssignment: () => idle,
  useEndSiteAssignment: () => idle,
  useAuditLogs: () => ({
    data: adminState.audits,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSensitiveAccessLogs: () => ({
    data: adminState.sensitives,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const { ParameterPage } = await import('../parameter-page');
const { ApprovalLimitPage } = await import('../approval-limit-page');
const { SlaPage } = await import('../sla-page');
const { UserAdminPage } = await import('../user-admin-page');
const { SiteAssignmentPage } = await import('../site-assignment-page');
const { AuditLogPage } = await import('../audit-log-page');

describe('Tham số hệ thống — rỗng không được hiện thành 0', () => {
  it('tham số chưa có giá trị hiện «Chưa cấu hình», không hiện số 0', () => {
    adminState.parameters = [
      {
        id: 'p1',
        param_key: 'defect_rate_threshold',
        scope_type: 'global',
        scope_id: null,
        value: null,
        unit: 'tỷ lệ',
        label: 'Ngưỡng tỷ lệ lỗi sản xuất cho phép',
        description: 'Khảo sát xác định chưa có số liệu chuẩn.',
        is_sensitive: false,
        is_active: true,
        effective_from: '2026-09-05',
      },
    ];

    renderWithApp(<ParameterPage />);

    expect(screen.getByText('Chưa cấu hình')).toBeInTheDocument();
    // Không có ô nào đọc ra "0 tỷ lệ" — đó chính là cách ô trống biến thành số sai.
    expect(screen.queryByText('0 tỷ lệ')).not.toBeInTheDocument();
  });

  it('tham số dạng bảng giá hiện số mục, không đổ nguyên khối JSON vào ô hẹp', () => {
    adminState.parameters = [
      {
        id: 'p2',
        param_key: 'compensation_price_table',
        scope_type: 'global',
        scope_id: null,
        value: { GG01: 120000, GG02: 95000 },
        unit: 'đồng',
        label: 'Bảng giá bồi thường giàn giáo',
        description: null,
        is_sensitive: false,
        is_active: true,
        effective_from: '2026-09-05',
      },
    ];

    renderWithApp(<ParameterPage />);

    expect(screen.getByText('Bảng 2 mục')).toBeInTheDocument();
    expect(screen.queryByText(/GG01/)).not.toBeInTheDocument();
  });

  it('số thập phân hiện theo chuẩn tiếng Việt — dấu PHẨY, không phải dấu chấm', () => {
    adminState.parameters = [
      {
        id: 'p4',
        param_key: 'budget_warning_threshold',
        scope_type: 'global',
        scope_id: null,
        value: 0.9,
        unit: 'tỷ lệ',
        label: 'Ngưỡng cảnh báo sắp vượt ngân sách công trình',
        description: null,
        is_sensitive: false,
        is_active: true,
        effective_from: '2026-09-05',
      },
    ];

    renderWithApp(<ParameterPage />);

    expect(screen.getByText('0,9 tỷ lệ')).toBeInTheDocument();
    expect(screen.queryByText('0.9 tỷ lệ')).not.toBeInTheDocument();
  });

  it('tham số có số thật hiện kèm đơn vị', () => {
    adminState.parameters = [
      {
        id: 'p3',
        param_key: 'hours_per_workday',
        scope_type: 'global',
        scope_id: null,
        value: 8,
        unit: 'giờ',
        label: 'Số giờ quy đổi một ngày công',
        description: null,
        is_sensitive: false,
        is_active: true,
        effective_from: '2026-09-05',
      },
    ];

    renderWithApp(<ParameterPage />);

    expect(screen.getByText('8 giờ')).toBeInTheDocument();
  });
});

describe('Thời hạn xử lý — bảng rỗng là câu trả lời, không phải lỗi', () => {
  it('chưa có dòng nào thì nói rõ Ban Giám đốc quyết và điều gì chưa chạy được', () => {
    adminState.slas = [];

    renderWithApp(<SlaPage />);

    expect(screen.getByText('Chưa có thời hạn nào được ban hành.')).toBeInTheDocument();
    // Hai chỗ nhắc Ban Giám đốc: câu giải thích và câu hướng dẫn thêm dòng.
    expect(screen.getAllByText(/Ban Giám đốc/).length).toBeGreaterThan(0);
    expect(screen.getByText(/chưa có căn cứ để chạy/)).toBeInTheDocument();
    // Không được bịa ra một đồng hồ đếm ngược nào khi chưa ai cam kết.
    expect(screen.queryByText(/0 giờ/)).not.toBeInTheDocument();
  });

  it('có dòng thì hiện số giờ kèm cách đọc theo ngày', () => {
    adminState.slas = [
      {
        id: 's1',
        request_type: 'payment_request',
        responsible_role_id: 'r-mh',
        company_id: null,
        target_hours: 48,
        label: 'Kế toán kiểm chứng từ',
        is_active: true,
        role: { code: 'MH', label: 'Trưởng phòng Mua hàng' },
      },
    ];

    renderWithApp(<SlaPage />);

    expect(screen.getByText('48 giờ (2 ngày)')).toBeInTheDocument();
    expect(screen.getByText('Mọi pháp nhân')).toBeInTheDocument();
  });
});

describe('Hạn mức phê duyệt — rỗng nghĩa là không giới hạn', () => {
  it('hạn mức rỗng hiện «Không giới hạn», không hiện 0 đồng', () => {
    adminState.limits = [
      {
        id: 'l1',
        role_id: 'r-tgd',
        subject: 'payment_request',
        max_amount: null,
        step: 2,
        company_id: null,
        is_active: true,
        role: { code: 'TGD', label: 'Tổng Giám đốc' },
      },
    ];

    renderWithApp(<ApprovalLimitPage />);

    expect(screen.getByText('Không giới hạn')).toBeInTheDocument();
    expect(screen.queryByText(/^0 đồng$/)).not.toBeInTheDocument();
  });

  it('nói rõ mức đang chạy là mức tạm, chưa phải quy chế của Nhà Việt Group', () => {
    adminState.limits = [];

    renderWithApp(<ApprovalLimitPage />);

    expect(screen.getByText(/mức tạm của tài liệu/)).toBeInTheDocument();
  });
});

describe('Người dùng — một người giữ nhiều vai trò ở nhiều pháp nhân', () => {
  it('liệt kê đủ từng cặp pháp nhân – vai trò (NEN-02)', () => {
    adminState.users = [
      {
        id: 'u9',
        full_name: 'Nguyễn Thị Phượng',
        email: 'phuong@nhavietgroup.test',
        phone: '0901234567',
        job_title: 'Phó Giám đốc Xưởng',
        is_active: true,
        user_companies: [
          {
            id: 'uc1',
            company_id: 'nvs-id',
            is_primary: true,
            role: {
              id: 'r-sx',
              code: 'SX',
              label: 'Xưởng sản xuất – Cho thuê',
              site_scoped: false,
            },
          },
          {
            id: 'uc2',
            company_id: 'nvc-id',
            is_primary: false,
            role: { id: 'r-kho', code: 'KHO', label: 'Thủ kho', site_scoped: false },
          },
        ],
      },
    ];

    renderWithApp(<UserAdminPage />);

    // Bảng dựng hai bản: thẻ cho điện thoại và bảng cho máy tính (Webapp Flow 4.8).
    expect(
      screen.getAllByText('NVS · Xưởng sản xuất – Cho thuê · NVC · Thủ kho').length,
    ).toBeGreaterThan(0);
  });

  it('tài khoản đã ngừng vẫn còn trong danh sách — thu hồi quyền, không xóa hồ sơ', () => {
    adminState.users = [
      {
        id: 'u10',
        full_name: 'Lê Văn Cũ',
        email: 'cu@nhavietgroup.test',
        phone: null,
        job_title: null,
        is_active: false,
        user_companies: [],
      },
    ];

    renderWithApp(<UserAdminPage />);

    expect(screen.getAllByText('Lê Văn Cũ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Đã ngừng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa gán vai trò').length).toBeGreaterThan(0);
  });
});

describe('Phân công công trường — quên phân công dẫn tới thấy ít đi', () => {
  it('chưa có phân công nào thì nói rõ hệ quả, không để trang trắng', () => {
    adminState.assignments = [];

    renderWithApp(<SiteAssignmentPage />);

    expect(screen.getByText(/sẽ không thấy công trình nào/)).toBeInTheDocument();
  });

  it('phân công đã kết thúc vẫn hiện, kèm khoảng thời gian', () => {
    adminState.assignments = [
      {
        id: 'a1',
        user_id: 'u9',
        construction_site_id: 'ct1',
        site_role: 'Chỉ huy trưởng',
        assigned_from: '2026-07-01',
        assigned_to: '2026-08-31',
        assigned_user: { full_name: 'Nguyễn Công Minh' },
        site: { code: 'NVC-CT-0001', name: 'Nhà xưởng Long An', company_id: 'nvc-id' },
      },
    ];

    renderWithApp(<SiteAssignmentPage />);

    expect(screen.getByText('01/07/2026 — 31/08/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kết thúc' })).not.toBeInTheDocument();
  });
});

describe('Nhật ký — chỉ đọc', () => {
  it('không có nút sửa hay xóa nào trên nhật ký thao tác (NEN-07)', () => {
    adminState.audits = [
      {
        id: 'g1',
        action: 'update',
        entity_type: 'contracts',
        entity_id: 'c1',
        reason: 'Điều chỉnh giá trị hợp đồng',
        created_at: '2026-09-10T03:00:00.000Z',
        actor: { full_name: 'Trần Văn Bảy' },
      },
    ];

    renderWithApp(<AuditLogPage />);

    expect(screen.getByText('Chỉnh sửa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xóa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chỉnh sửa/ })).not.toBeInTheDocument();
  });

  it('không để lọt tên bảng hay mã thao tác tiếng Anh ra giao diện (CLAUDE.md 4.1)', async () => {
    adminState.audits = [];
    adminState.sensitives = [
      {
        id: 'n1',
        sensitive_kind: 'cost',
        entity_type: 'construction_sites',
        entity_id: 'ct1',
        action: 'view',
        created_at: '2026-09-20T05:06:00.000Z',
        actor: { full_name: 'Quản trị hệ thống' },
      },
    ];

    renderWithApp(<AuditLogPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Truy cập dữ liệu nhạy cảm' }));

    expect(screen.getByText('Công trình')).toBeInTheDocument();
    expect(screen.getByText('Xem')).toBeInTheDocument();
    expect(screen.queryByText('construction_sites')).not.toBeInTheDocument();
    expect(screen.queryByText('view')).not.toBeInTheDocument();
  });
});
