import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExecCompanyTile } from '@/hooks/use-exec-overview';

const base = { area: 'Mảng', amount: null, note: null, items: [], link: '/ds' };
const state = vi.hoisted(() => ({ tiles: [] as unknown[] }));
const navigate = vi.fn();
const setSelectedCompany = vi.fn();

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/use-exec-overview', () => ({
  useExecOverviewByCompany: () => ({ isLoading: false, data: state.tiles }),
  useFinanceThisMonthByCompany: () => ({ data: new Map() }),
}));
vi.mock('@/hooks/use-approvals', () => ({ usePendingApprovals: () => ({ data: [{}, {}] }) }));
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: (pick: (s: { setSelectedCompany: typeof setSelectedCompany }) => unknown) =>
    pick({ setSelectedCompany }),
}));

const { ExecFocus } = await import('../exec-focus');

const tile = (t: Partial<ExecCompanyTile>): ExecCompanyTile =>
  ({
    ...base,
    company_id: 'c1',
    company_code: 'NVC',
    company_name: 'Nhà Việt Cons',
    key: 'k',
    label: 'L',
    level: 'ok',
    total: 0,
    ...t,
  }) as ExecCompanyTile;

describe('Tiêu điểm — nhìn ít mà ra vấn đề ngay', () => {
  it('một câu kết luận, chỉ dòng có vấn đề, việc cần xử lý đứng trước việc cần chú ý', () => {
    state.tiles = [
      tile({ key: 'a', label: 'Phê duyệt đang chờ', level: 'amber', total: 5 }),
      tile({ key: 'b', label: 'Giàn giáo quá hạn trả', level: 'ok' }),
      tile({
        key: 'c',
        label: 'Công trình trễ tiến độ',
        level: 'red',
        total: 1,
        company_id: 'c3',
        company_code: 'NVO',
        link: '/tc/cong-trinh?trang-thai=overdue',
      }),
    ];
    render(
      <MemoryRouter>
        <ExecFocus showPending />
      </MemoryRouter>,
    );
    expect(screen.getByText('1 việc cần xử lý ngay')).toBeTruthy();
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Công trình trễ tiến độ');
    expect(screen.queryByText('Giàn giáo quá hạn trả')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Công trình trễ tiến độ/ }));
    expect(setSelectedCompany).toHaveBeenCalledWith('c3');
    expect(navigate).toHaveBeenCalledWith('/tc/cong-trinh?trang-thai=overdue');
  });

  it('không có vấn đề thì nói rõ là ổn, không để khối trống', () => {
    state.tiles = [tile({ level: 'ok' })];
    render(
      <MemoryRouter>
        <ExecFocus showPending />
      </MemoryRouter>,
    );
    expect(screen.getByText('Không có việc nào quá hạn')).toBeTruthy();
  });
});
