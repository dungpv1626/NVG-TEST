import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExecCompanyTile } from '@/hooks/use-exec-overview';

const COMPANIES = [
  { company_id: 'c1', company_code: 'NVC', company_name: 'Nhà Việt Cons' },
  { company_id: 'c2', company_code: 'NVS', company_name: 'Nhà Việt Steel' },
  { company_id: 'c3', company_code: 'NVO', company_name: 'Nhà Việt One' },
];

const tile = (
  company: (typeof COMPANIES)[number],
  t: Partial<ExecCompanyTile> & Pick<ExecCompanyTile, 'key' | 'level' | 'label'>,
): ExecCompanyTile => ({
  ...company,
  area: 'Mảng',
  total: 0,
  amount: null,
  link: '/danh-sach',
  note: null,
  items: [],
  ...t,
});

const [nvc, nvs, nvo] = COMPANIES as [
  (typeof COMPANIES)[number],
  (typeof COMPANIES)[number],
  (typeof COMPANIES)[number],
];

const tiles: ExecCompanyTile[] = [
  // Mảng ổn ở cả ba công ty — gom xuống một dòng.
  tile(nvc, { key: 'rentals', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  tile(nvs, { key: 'rentals', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  tile(nvo, { key: 'rentals', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  // Chỉ NVO có vấn đề.
  tile(nvc, { key: 'sites', level: 'ok', label: 'Công trình trễ tiến độ' }),
  tile(nvs, { key: 'sites', level: 'ok', label: 'Công trình trễ tiến độ' }),
  tile(nvo, {
    key: 'sites',
    level: 'red',
    label: 'Công trình trễ tiến độ',
    total: 2,
    link: '/tc/cong-trinh?trang-thai=overdue',
    items: [
      {
        code: 'CT-9',
        title: 'Nhà phố Q7',
        detail: 'Kế hoạch xong 01/10/2026',
        link: '/tc/cong-trinh/9',
      },
    ],
  }),
];

const setSelectedCompany = vi.fn();
const navigate = vi.fn();

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/use-exec-overview', () => ({
  useExecOverviewByCompany: () => ({
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    data: tiles,
  }),
  useCompanyPulse: () => ({
    isLoading: false,
    data: [
      {
        ...nvs,
        metric: 'rentals_active',
        label: 'Hợp đồng thuê giàn giáo đang chạy',
        total: 4,
        amount: null,
      },
    ],
  }),
  useFinanceThisMonthByCompany: () => ({ isLoading: false, error: null, data: new Map() }),
}));
vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovals: () => ({ isLoading: false, data: [] }),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { fullName: 'Bùi Văn Thi', assignments: [{ roleCode: 'TGD' }] } }),
}));
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: (pick: (s: { setSelectedCompany: typeof setSelectedCompany }) => unknown) =>
    pick({ setSelectedCompany }),
}));

const { ExecOverviewPage } = await import('../tong-quan');

describe('Tổng quan điều hành — ba công ty cạnh nhau', () => {
  it('nói công ty nào có vấn đề, cột theo công ty, mảng ổn gom một dòng', () => {
    render(
      <MemoryRouter>
        <ExecOverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Nhà Việt One đang có việc cần xử lý/)).toBeTruthy();

    const matrix = screen.getByRole('region', { name: 'Cảnh báo theo công ty' });
    const headers = within(matrix)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers.join(' ')).toContain('Nhà Việt Cons');
    expect(headers.join(' ')).toContain('Nhà Việt One');

    // Chỉ hàng có vấn đề hiện trong bảng; mảng ổn nằm ở dòng gom.
    expect(within(matrix).getAllByRole('row')).toHaveLength(2);
    expect(within(matrix).getByText(/1 mảng đang ổn ở cả 3 công ty/)).toBeTruthy();
    expect(within(matrix).getByText('cần xử lý')).toBeTruthy();

    // Hoạt động từng công ty hiện đúng chỉ số của công ty đó.
    const pulse = screen.getByRole('region', { name: 'Hoạt động từng công ty' });
    expect(within(pulse).getByText('Hợp đồng thuê giàn giáo đang chạy')).toBeTruthy();

    const attention = screen.getByRole('region', { name: 'Hồ sơ cần chú ý' });
    expect(within(attention).getByText('NVO')).toBeTruthy();
  });

  it('bấm ô của một công ty: chọn đúng pháp nhân đó rồi mở danh sách đã lọc', () => {
    render(
      <MemoryRouter>
        <ExecOverviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /2 cần xử lý/ }));
    expect(setSelectedCompany).toHaveBeenCalledWith('c3');
    expect(navigate).toHaveBeenCalledWith('/tc/cong-trinh?trang-thai=overdue');
  });
});
