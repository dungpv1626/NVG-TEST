/**
 * Tab Tổng quan — canh hai thứ dễ hỏng lặng lẽ nhất của một màn hình toàn số liệu:
 *
 *  1. **Ô chưa có dữ liệu không được hiện `0`.** "0 phương án" đọc như đã chạy xong và không
 *     ra kết quả nào, chứ không đọc như chưa chạy (CLAUDE.md 5.2).
 *  2. **Thẻ công cụ phải trỏ đúng màn hình con.** Trỏ sai thì thẻ vẫn bấm được, vẫn mở ra một
 *     màn hình có thật, và không ai để ý cho tới lúc dùng thật.
 *
 * Phần suy trạng thái sáu bước kiểm riêng ở `overview-steps.test.ts` — nó là hàm thuần, không cần DOM.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

const empty = { data: undefined, isLoading: false };

vi.mock('@/hooks/use-design-projects', () => ({
  useDesignBriefs: () => empty,
  useDesignVersions: () => empty,
  useDisciplineTasks: () => empty,
  useChangeRequests: () => empty,
  useDesignSync: () => empty,
  useDesignProjects: () => empty,
}));
vi.mock('@/hooks/use-ai-design', () => ({ useAiDesignState: () => empty }));
vi.mock('@/hooks/use-design-surveys', () => ({ useDesignSurveys: () => empty }));
vi.mock('@/hooks/use-survey-photos', () => ({ useSurveyPhotos: () => empty }));
vi.mock('@/hooks/use-estimates', () => ({ useEstimates: () => empty }));
vi.mock('@/hooks/use-contracts', () => ({ useContractForSource: () => empty }));

const { OverviewPanel } = await import('../overview/overview-panel');

const PROJECT = {
  id: 'p1',
  code: 'NVO-TK-2026-2399',
  company_id: 'c1',
  name: 'Nhà phố Nguyễn Văn A',
  stage: 'phuong_an',
  handover_deadline: '2090-09-18',
  handed_over_at: null,
  responsible_user_id: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  customer: { id: 'k1', name: 'Công ty TNHH Kiểm Thử NVO' },
  responsible: { full_name: 'Đỗ Văn K' },
  opportunity: null,
  opportunity_id: null,
  site_address: 'Quận Hà Đông, Hà Nội',
  stopped_reason: null,
  notes: null,
} as never;

function panel() {
  return renderWithApp(
    <OverviewPanel project={PROJECT} readOnly={false} onSaveNotes={() => {}} />,
    { route: '/tk/du-an/p1' },
  );
}

describe('Tab Tổng quan của dự án thiết kế', () => {
  it('bốn thẻ công cụ đều có mặt và trỏ đúng màn hình con', () => {
    panel();
    // Tìm TRONG khu thẻ công cụ, không trên cả trang: dải tiến trình cũng có liên kết trùng
    // tên với thẻ (cùng bước, cùng đích), nên tìm trên cả trang sẽ bắt được hai phần tử.
    const cards = within(screen.getByRole('region', { name: 'Bộ công cụ thiết kế' }));
    const expected: [string, string][] = [
      ['Đầu bài thiết kế', '?tab=dau-bai'],
      ['Khảo sát hiện trạng', '?tab=khao-sat'],
      ['AI Design', '?tab=thiet-ke-ai'],
      // Thẻ này phải mở màn hình BA BỘ MÔN (TK-04).
      ['Hồ sơ kỹ thuật', '?tab=ho-so-ky-thuat'],
    ];
    for (const [name, href] of expected) {
      expect(cards.getByRole('link', { name: new RegExp(name) })).toHaveAttribute(
        'href',
        `/tk/du-an/p1${href}`,
      );
    }
  });

  it('chưa có dữ liệu thì NÓI RA, không hiện số 0', () => {
    const { container } = panel();
    expect(screen.getByText(/Chưa lập đầu bài/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có biên bản khảo sát nào/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa có phương án mặt bằng nào/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa phân công bộ môn nào/)).toBeInTheDocument();
    // Không một chỗ nào trên trang được hiện con số 0 đứng một mình.
    expect(container.textContent).not.toMatch(/(^|[^\d])0($|[^\d%])/);
  });

  it('dải tiến trình có đủ sáu bước và bước nào cũng mở được', () => {
    panel();
    const track = screen.getByRole('list', { name: 'Sáu bước của quy trình thiết kế' });
    expect(within(track).getAllByRole('link')).toHaveLength(6);
  });

  it('thông tin dự án lấy từ hồ sơ thật, khách hàng bấm được', () => {
    panel();
    expect(screen.getByText('Quận Hà Đông, Hà Nội')).toBeInTheDocument();
    // Khách hàng xuất hiện ở CẢ hai chỗ theo bản mẫu §5.5c và §5.5d — một là bảng thông tin,
    // một là lối đi sang module khác. Hai chỗ phải trỏ cùng một hồ sơ.
    const links = screen.getAllByRole('link', { name: /Công ty TNHH Kiểm Thử NVO|Khách hàng/ });
    const toCustomer = links.filter((a) => a.getAttribute('href') === '/crm/khach-hang/k1');
    expect(toCustomer.length).toBeGreaterThan(0);
  });

  it('nhân sự tham gia lấy người chịu trách nhiệm thật, không dựng người giả', () => {
    panel();
    expect(screen.getByText('Đỗ Văn K')).toBeInTheDocument();
    expect(screen.getByText('Kiến trúc sư chủ trì')).toBeInTheDocument();
  });
});
