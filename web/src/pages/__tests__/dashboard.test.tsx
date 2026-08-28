/**
 * Dashboard — trang mặc định của Tổng Giám đốc (Webapp Flow 3.10).
 *
 * Đây là chỗ đã sai thật hai lần trong quá trình dựng, nên là chỗ đáng canh nhất:
 *
 *  1. Thẻ đếm hồ sơ TRONG KỲ nhưng đường dẫn nó dẫn tới lại không mang theo kỳ → bấm vào thẻ ra
 *     một con số khác hẳn con số vừa bấm. Đúng thứ mẫu bố cục Dashboard cấm (Webapp Flow 4.1).
 *  2. Thẻ của module người dùng không có quyền xem vẫn hiện → vi phạm Webapp Flow 6.5, vốn yêu
 *     cầu ẨN chứ không phải hiện rồi báo lỗi khi bấm.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  can: {} as Record<string, Record<string, boolean>>,
  opportunities: [] as unknown[],
  contracts: [] as unknown[],
  approvals: [] as unknown[],
  cashFlow: [] as unknown[],
  receivables: [] as unknown[],
  rentals: [] as unknown[],
  timesheets: [] as unknown[],
  sitesBudgetStatus: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: {
      id: 'u1',
      fullName: 'Bùi Văn Thi',
      assignments: [
        { companyId: 'nvc-id', companyShortName: 'Nhà Việt Cons', roleLabel: 'Tổng Giám đốc' },
      ],
      permissions: Object.entries(state.can).map(([moduleCode, p]) => ({ moduleCode, ...p })),
    },
  }),
  useCan: (moduleCode: string, action = 'view') =>
    Boolean(state.can[moduleCode]?.[action === 'view' ? 'canView' : 'canCreate']),
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
vi.mock('@/hooks/use-companies', () => ({ useCompanyLookup: () => () => null }));
vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovals: () => ({ data: state.approvals }),
}));
vi.mock('@/hooks/use-opportunities', () => ({
  useOpportunities: () => ({ data: state.opportunities, isLoading: false }),
}));
vi.mock('@/hooks/use-contracts', () => ({
  useContracts: () => ({ data: state.contracts, isLoading: false }),
}));
vi.mock('@/hooks/use-bidding-projects', () => ({
  useBiddingProjects: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-design-projects', () => ({
  useDesignProjects: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-accounting', () => ({
  useCashFlow: () => ({ data: state.cashFlow, isLoading: false }),
  useReceivables: () => ({ data: state.receivables, isLoading: false }),
}));
vi.mock('@/hooks/use-sx', () => ({
  useRentalAgreements: () => ({ data: state.rentals, isLoading: false }),
}));
vi.mock('@/hooks/use-hr', () => ({
  useTimesheets: () => ({ data: state.timesheets, isLoading: false }),
}));
vi.mock('@/hooks/use-reports', () => ({
  useSitesBudgetStatus: () => ({ data: state.sitesBudgetStatus, isLoading: false, error: null }),
}));

const { DashboardPage } = await import('../dashboard');

const THIS_YEAR = new Date().getFullYear();

beforeEach(() => {
  state.can = {};
  state.opportunities = [];
  state.contracts = [];
  state.approvals = [];
  state.cashFlow = [];
  state.receivables = [];
  state.rentals = [];
  state.timesheets = [];
  state.sitesBudgetStatus = [];
});

function grantView(...modules: string[]) {
  for (const m of modules) state.can[m] = { canView: true, canCreate: false };
}

describe('Dashboard — chỉ hiện thứ vai trò được xem (Webapp Flow 6.5)', () => {
  it('không có quyền xem Hợp đồng thì KHÔNG có thẻ Hợp đồng', () => {
    grantView('CRM');
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByText('Cơ hội kinh doanh')).toBeInTheDocument();
    expect(screen.queryByText('Hợp đồng')).not.toBeInTheDocument();
  });

  it('vai trò không phê duyệt được thì nói rõ, không hiện con số rỗng', () => {
    grantView('CRM');
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText(/không có quyền phê duyệt/i)).toBeInTheDocument();
  });

  it('nút tạo nhanh chỉ hiện với vai trò được tạo hồ sơ', () => {
    state.can = { CRM: { canView: true, canCreate: false } };
    const { unmount } = renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.queryByRole('link', { name: /tạo cơ hội/i })).not.toBeInTheDocument();
    unmount();

    state.can = { CRM: { canView: true, canCreate: true } };
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByRole('link', { name: /tạo cơ hội/i })).toBeInTheDocument();
  });
});

describe('Dashboard — mỗi con số dẫn tới danh sách đã lọc SẴN ĐÚNG (Webapp Flow 4.1)', () => {
  it('liên kết mang theo CẢ trạng thái lẫn kỳ báo cáo đang xem', () => {
    grantView('CRM');
    state.opportunities = [
      { stage: 'khao_sat', estimated_value: '1000', created_at: `${THIS_YEAR}-08-20` },
      { stage: 'mat_co_hoi', estimated_value: '2000', created_at: `${THIS_YEAR}-08-21` },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard?ky=quy-nay' });

    const inProgress = screen.getByRole('link', { name: /Đang xử lý: 1/ });
    expect(inProgress).toHaveAttribute('href', '/crm/co-hoi?trang-thai=in_progress&ky=quy-nay');
  });

  it('thẻ Quá hạn dẫn tới đúng danh sách của từng phân hệ', () => {
    grantView('CRM');
    state.opportunities = [
      { stage: 'mat_co_hoi', estimated_value: null, created_at: `${THIS_YEAR}-03-01` },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByRole('link', { name: /Cơ hội kinh doanh: 1/ })).toHaveAttribute(
      'href',
      '/crm/co-hoi?trang-thai=overdue&ky=nam-nay',
    );
  });

  it('đổi kỳ báo cáo thì lưu trên thanh địa chỉ để quay lại không mất', async () => {
    grantView('CRM');
    const result = renderWithApp(<DashboardPage />, { route: '/dashboard' });

    await userEvent.click(screen.getByRole('button', { name: 'Tháng này' }));
    expect(result.getByTestId('duong-dan-hien-tai').textContent).toContain('ky=thang-nay');
  });
});

describe('Dashboard — nói thật về dữ liệu (PRD BC-06)', () => {
  /**
   * "0" và "chưa đo được" nhìn giống hệt nhau trên màn hình điều hành nhưng dẫn tới hai quyết
   * định trái ngược: một bên là "không có việc gì", một bên là "chưa biết".
   */
  it('kỳ không có hồ sơ nào thì nói rõ, không hiện số 0', () => {
    grantView('CRM');
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText('Chưa có hồ sơ nào trong kỳ này.')).toBeInTheDocument();
  });

  it('liệt kê thẳng phần chỉ số CHƯA có, thay vì dựng thẻ rỗng', () => {
    grantView('CRM');
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText('Phần chưa có trên Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Tồn kho vật tư/)).toBeInTheDocument();
  });

  it('tỷ lệ chốt hợp đồng: chưa có cơ hội nào KHÁC với chốt được 0%', () => {
    grantView('CRM');
    // Không có cơ hội nào trong kỳ → thẻ ở trạng thái rỗng, KHÔNG hiện "0%" gây hiểu nhầm.
    const { unmount } = renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    unmount();

    // Có cơ hội nhưng không chốt được cái nào → PHẢI hiện đúng 0%. Đây mới là nửa quan trọng:
    // hai tình huống này dẫn tới hai quyết định kinh doanh trái ngược nhau.
    state.opportunities = [
      { stage: 'khao_sat', estimated_value: '1000', created_at: `${THIS_YEAR}-05-01` },
      { stage: 'mat_co_hoi', estimated_value: '2000', created_at: `${THIS_YEAR}-05-02` },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

describe('Dashboard — việc chờ phê duyệt', () => {
  it('gộp về Hộp thư Phê duyệt và hiện tổng giá trị', () => {
    state.can = { CRM: { canView: true, canApprove: true } };
    state.approvals = [
      { id: 'a1', amount: '900000000' },
      { id: 'a2', amount: '100000000' },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    const link = screen.getByRole('link', { name: /2/ });
    expect(link).toHaveAttribute('href', '/viec-can-lam');
    expect(within(link).getByText(/1.000.000.000 đồng/)).toBeInTheDocument();
  });
});

describe('Dashboard — bốn thẻ KT/SX/NS lấp phần BC-01 còn thiếu', () => {
  it('không có quyền KT/SX/NS thì không hiện thẻ tương ứng', () => {
    grantView('CRM');
    renderWithApp(<DashboardPage />, { route: '/dashboard' });
    expect(screen.queryByText('Dòng tiền')).not.toBeInTheDocument();
    expect(screen.queryByText('Công nợ phải thu')).not.toBeInTheDocument();
    expect(screen.queryByText('Giàn giáo đang cho thuê')).not.toBeInTheDocument();
    expect(screen.queryByText('Chấm công đã chốt')).not.toBeInTheDocument();
  });

  it('thẻ Dòng tiền cộng số dư cuối kỳ của mọi pháp nhân và nêu số pháp nhân thiếu hụt', () => {
    grantView('KT');
    state.cashFlow = [
      { company_id: 'nvc-id', closing_balance: '500000000' },
      { company_id: 'nvo-id', closing_balance: '-200000000' },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByText('300.000.000 đồng')).toBeInTheDocument();
    expect(screen.getByText('1 pháp nhân dự kiến thiếu hụt')).toBeInTheDocument();
  });

  it('thẻ Công nợ phải thu chỉ cộng phần CÒN LẠI, bỏ khoản đã thu hết', () => {
    grantView('KT');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    state.receivables = [
      // Còn nợ và đã quá hạn — phải cộng vào tổng và đếm là quá hạn.
      { amount: '300000000', settled_amount: '100000000', due_date: yesterday },
      // Đã thu đủ — KHÔNG được cộng vào tổng còn phải thu.
      { amount: '150000000', settled_amount: '150000000', due_date: yesterday },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByText('200.000.000 đồng')).toBeInTheDocument();
    expect(screen.getByText('1 khoản đã quá hạn')).toBeInTheDocument();
  });

  it('thẻ Giàn giáo đang cho thuê chỉ đếm hợp đồng còn đang thuê', () => {
    grantView('SX');
    state.rentals = [
      { id: 'r1', status: 'dang_thue' },
      { id: 'r2', status: 'da_thu_hoi' },
      { id: 'r3', status: 'huy' },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    const link = screen.getByRole('link', { name: /1\s*hợp đồng/ });
    expect(link).toHaveAttribute('href', '/sx/tai-san-cho-thue');
  });

  it('thẻ Chấm công đã chốt đếm đúng số bảng công đã tải cho tháng này', () => {
    grantView('NS');
    state.timesheets = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    const link = screen.getByRole('link', { name: /3\s*nhân sự/ });
    expect(link).toHaveAttribute('href', '/ns/cham-cong');
  });
});

describe('Dashboard — thẻ Quá hạn gộp cả rủi ro ngoài 4 module gốc (BC-05)', () => {
  it('gộp công nợ quá hạn thu vào thẻ Quá hạn, không chỉ hiện riêng ở thẻ Công nợ', () => {
    grantView('KT');
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    state.receivables = [{ amount: '300000000', settled_amount: '100000000', due_date: yesterday }];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByRole('link', { name: /Công nợ phải thu: 1/ })).toHaveAttribute(
      'href',
      '/kt/cong-no',
    );
  });

  it('phê duyệt để lâu hơn ngưỡng thì gộp vào thẻ Quá hạn', () => {
    state.can = { CRM: { canView: true, canApprove: true } };
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
    const today = new Date().toISOString();
    state.approvals = [
      { id: 'a1', amount: '100000000', requested_at: fourDaysAgo },
      { id: 'a2', amount: '200000000', requested_at: today },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByRole('link', { name: /Chờ phê duyệt quá 3 ngày: 1/ })).toHaveAttribute(
      'href',
      '/viec-can-lam',
    );
  });

  it('vai trò không phê duyệt được thì KHÔNG hiện dòng phê duyệt để lâu dù có hồ sơ cũ', () => {
    grantView('CRM');
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
    state.approvals = [{ id: 'a1', amount: '100000000', requested_at: fourDaysAgo }];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.queryByText(/Chờ phê duyệt quá/)).not.toBeInTheDocument();
  });

  it('công trình vượt ngân sách (đã cam kết + đã phát sinh > ngân sách) gộp vào thẻ Quá hạn, dẫn tới danh sách Công trình đã lọc', () => {
    grantView('BC');
    state.sitesBudgetStatus = [
      // Vượt: đã phát sinh + đã cam kết (900tr) > ngân sách (800tr). `health` đến từ CSDL
      // (0071) — mock trực tiếp thay vì tự tính lại, đúng cách dashboard.tsx đọc.
      {
        construction_site_id: 's1',
        budgeted_cost: '800000000',
        actual_cost: '700000000',
        committed_cost: '200000000',
        health: 'vuot_ngan_sach',
      },
      // Trong ngân sách: không được đếm vào rủi ro.
      {
        construction_site_id: 's2',
        budgeted_cost: '800000000',
        actual_cost: '100000000',
        committed_cost: '0',
        health: 'trong_ngan_sach',
      },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.getByRole('link', { name: /Công trình vượt ngân sách: 1/ })).toHaveAttribute(
      'href',
      '/tc/cong-trinh?ngan-sach=vuot',
    );
  });

  it('vai trò không có quyền xem BC thì KHÔNG hiện dòng vượt ngân sách dù dữ liệu có công trình vượt', () => {
    grantView('CRM');
    state.sitesBudgetStatus = [
      {
        construction_site_id: 's1',
        budgeted_cost: '800000000',
        actual_cost: '900000000',
        committed_cost: '0',
        health: 'vuot_ngan_sach',
      },
    ];
    renderWithApp(<DashboardPage />, { route: '/dashboard' });

    expect(screen.queryByText(/vượt ngân sách/)).not.toBeInTheDocument();
  });
});
