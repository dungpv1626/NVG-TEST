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
  tile(nvc, { key: 'rentals_overdue', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  tile(nvs, { key: 'rentals_overdue', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  tile(nvo, { key: 'rentals_overdue', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
  // Chỉ NVO có vấn đề.
  tile(nvc, { key: 'sites_late', level: 'ok', label: 'Công trình trễ tiến độ' }),
  tile(nvs, { key: 'sites_late', level: 'ok', label: 'Công trình trễ tiến độ' }),
  tile(nvo, {
    key: 'sites_late',
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

vi.mock('recharts', async (original) => ({
  ...(await original<typeof import('recharts')>()),
  // jsdom không đo được kích thước — biểu đồ vẽ rỗng; chỉ cần khung có nhãn đọc được.
  ResponsiveContainer: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/charts/money-chart', () => ({
  MoneyChart: ({ summary }: { summary: string }) => <div role="img" aria-label={summary} />,
}));

describe('Tổng quan điều hành — ba công ty bằng hình', () => {
  it('thẻ sức khoẻ, bản đồ cảnh báo mảng × công ty, biểu đồ theo công ty', () => {
    render(
      <MemoryRouter>
        <ExecOverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/NVO đang có việc cần xử lý/)).toBeTruthy();

    // Thẻ sức khoẻ: vòng tròn có câu tóm tắt đọc được, không chỉ màu.
    const health = screen.getByRole('region', { name: 'Sức khoẻ từng công ty' });
    expect(
      within(health).getByRole('img', { name: /Nhà Việt One: 1 mảng cần xử lý/ }),
    ).toBeTruthy();
    expect(within(health).getByText('Cho thuê')).toBeTruthy();

    // Bản đồ: hàng nặng nhất lên đầu; ô có vấn đề là nút có số, ô ổn có nhãn «ổn».
    const map = screen.getByRole('table', { name: 'Cảnh báo theo mảng và công ty' });
    const rowHeaders = within(map)
      .getAllByRole('rowheader')
      .map((h) => h.textContent);
    expect(rowHeaders[0]).toBe('Tiến độ');
    expect(
      within(map).getByRole('img', { name: /Nhà Việt Cons — Giàn giáo quá hạn trả: ổn/ }),
    ).toBeTruthy();

    // Biểu đồ theo công ty có câu tóm tắt.
    expect(screen.getByRole('img', { name: /Tài chính tháng này theo công ty/ })).toBeTruthy();
  });

  it('bấm ô của một công ty: chọn đúng pháp nhân đó rồi mở danh sách đã lọc', () => {
    render(
      <MemoryRouter>
        <ExecOverviewPage />
      </MemoryRouter>,
    );
    const cell = screen.getByRole('button', {
      name: /Nhà Việt One — Công trình trễ tiến độ: 2 hồ sơ/,
    });
    fireEvent.mouseEnter(cell);
    // Rê vào ô: hồ sơ cụ thể hiện ra.
    expect(screen.getByRole('link', { name: 'Nhà phố Q7' }).getAttribute('href')).toBe(
      '/tc/cong-trinh/9',
    );
    fireEvent.click(cell);
    expect(setSelectedCompany).toHaveBeenCalledWith('c3');
    expect(navigate).toHaveBeenCalledWith('/tc/cong-trinh?trang-thai=overdue');
  });
});
