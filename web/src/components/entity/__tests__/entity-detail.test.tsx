/**
 * `EntityDetail` — mẫu bố cục quan trọng nhất (Webapp Flow 4.3), dùng cho ~12 màn hình Chi tiết.
 *
 * Quy tắc bị canh: các tab là những KHÍA CẠNH CỦA CÙNG MỘT hồ sơ, không phải các trang riêng.
 * Vì vậy đổi tab phải giữ nguyên URL gốc và chỉ đổi tham số `tab`. Nếu mỗi tab là một đường dẫn
 * khác nhau thì đường dẫn chia sẻ cho đồng nghiệp sẽ mở ra đúng tab mình đang xem — hỏng cả cách
 * người duyệt đối chiếu hồ sơ.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityDetail, type RelatedGroup } from '../entity-detail';
import { currentNavigationState, currentPath, renderWithApp } from '@/test/render';

vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({
    companyId: 'nvc-id',
    companyCode: 'NVC',
    isAggregate: false,
    isReady: true,
  }),
  withCompanyScope: <Q,>(q: Q) => q,
}));

function detail(related: RelatedGroup[] = []) {
  return (
    <EntityDetail
      breadcrumbs={[
        { label: 'Hợp đồng', to: '/hd/hop-dong' },
        { label: 'Hợp đồng nhà xưởng Long An' },
      ]}
      title="Hợp đồng nhà xưởng Long An"
      code="NVC-HD-2026-0001"
      status="in_progress"
      responsiblePerson="Lê Văn C"
      tabs={[
        { id: 'tong-quan', label: 'Tổng quan', content: <p>Nội dung tổng quan</p> },
        { id: 'dieu-khoan', label: 'Điều khoản', content: <p>Nội dung điều khoản</p> },
      ]}
      historyContent={<p>Nội dung lịch sử</p>}
      related={related}
    />
  );
}

describe('EntityDetail', () => {
  it('đổi tab GIỮ NGUYÊN đường dẫn gốc, chỉ đổi tham số tab', async () => {
    const result = renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    await userEvent.click(screen.getByRole('tab', { name: /Điều khoản/ }));

    const path = currentPath(result);
    expect(path.startsWith('/hd/hop-dong/abc')).toBe(true);
    expect(path).toContain('tab=dieu-khoan');
  });

  it('mở bằng đường dẫn có sẵn tham số tab thì vào đúng tab đó', () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc?tab=dieu-khoan' });
    expect(screen.getByText('Nội dung điều khoản')).toBeInTheDocument();
    expect(screen.queryByText('Nội dung tổng quan')).not.toBeInTheDocument();
  });

  /** NEN-03 và NEN-07: mọi hồ sơ phải truy được ai làm gì, khi nào. */
  it('tab Lịch sử LUÔN có mà không cần khai báo', async () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    await userEvent.click(screen.getByRole('tab', { name: 'Lịch sử' }));
    expect(screen.getByText('Nội dung lịch sử')).toBeInTheDocument();
  });

  it('ba thông tin cố định luôn hiện ở đầu trang (Webapp Flow 1.3)', () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    expect(screen.getByText('NVC-HD-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Lê Văn C')).toBeInTheDocument();
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
  });
});

describe('EntityDetail — breadcrumb theo đường đi thực tế (Webapp Flow 5.2)', () => {
  it('vào thẳng bằng URL (không có state) thì hiện breadcrumb mặc định của module', () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    expect(screen.getByRole('link', { name: 'Hợp đồng' })).toBeInTheDocument();
  });

  it('đến từ panel "Hồ sơ liên quan" của hồ sơ khác thì hiện ĐÚNG hồ sơ đó, không phải mắt xích module mặc định', () => {
    renderWithApp(detail(), {
      route: '/hd/hop-dong/abc',
      state: { from: { label: 'Nhà xưởng Khu công nghiệp Demo', to: '/tc/cong-trinh/site-1' } },
    });

    expect(
      screen.getByRole('link', { name: 'Nhà xưởng Khu công nghiệp Demo' }),
    ).toBeInTheDocument();
    // Mắt xích module mặc định ("Hợp đồng") không còn — breadcrumb chỉ còn đúng đường đi thực
    // tế, không cộng dồn cả hai.
    expect(screen.queryByRole('link', { name: 'Hợp đồng' })).not.toBeInTheDocument();
    // Hồ sơ hiện tại vẫn luôn là mắt xích cuối, dù đến từ đâu.
    expect(screen.getAllByText('Hợp đồng nhà xưởng Long An').length).toBeGreaterThan(0);
  });

  it('bấm một hồ sơ liên quan thì mang theo state.from đúng — trang đích biết đã đến từ hồ sơ NÀY', async () => {
    const result = renderWithApp(
      detail([
        {
          title: 'Công trình',
          records: [
            {
              label: 'Công trình',
              value: 'Nhà xưởng Khu công nghiệp Demo',
              to: '/tc/cong-trinh/site-1',
            },
          ],
        },
      ]),
      { route: '/hd/hop-dong/abc' },
    );

    // Panel ngữ cảnh dựng SONG SONG hai bản (khối cuối trang cho màn hình hẹp, panel bên phải
    // cho màn hình rộng — CSS quyết định bản nào hiện, cả hai đều có mặt trong DOM), nên cùng
    // một hồ sơ liên quan khớp hai lần — bấm bản nào cũng dẫn tới đúng một nơi.
    await userEvent.click(
      screen.getAllByRole('link', { name: 'Nhà xưởng Khu công nghiệp Demo' })[0]!,
    );

    expect(currentPath(result)).toBe('/tc/cong-trinh/site-1');
    expect(currentNavigationState(result)).toEqual({
      from: { label: 'Hợp đồng nhà xưởng Long An', to: '/hd/hop-dong/abc' },
    });
  });
});

describe('EntityDetail — điều hướng bằng bàn phím', () => {
  /**
   * Khai `role="tab"` là hứa với trình đọc màn hình rằng phím mũi tên chuyển được tab.
   * Test này canh đúng lời hứa đó.
   */
  it('phím mũi tên chuyển tab, và vòng lại đầu khi tới cuối', async () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    screen.getByRole('tab', { name: 'Tổng quan' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Nội dung điều khoản')).toBeInTheDocument();

    // Tổng quan → Điều khoản → Lịch sử → vòng về Tổng quan.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Nội dung lịch sử')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Nội dung tổng quan')).toBeInTheDocument();
  });

  it('phím Home và End nhảy tới tab đầu và tab cuối', async () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    screen.getByRole('tab', { name: 'Tổng quan' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByText('Nội dung lịch sử')).toBeInTheDocument();

    await userEvent.keyboard('{Home}');
    expect(screen.getByText('Nội dung tổng quan')).toBeInTheDocument();
  });

  /**
   * Roving tabindex: cả bộ tab chỉ chiếm MỘT chặng Tab. Không có nó, màn hình Chi tiết hợp đồng
   * với 6 tab bắt người dùng bàn phím bấm Tab sáu lần mới xuống được tới nội dung.
   */
  it('cả bộ tab chỉ chiếm một chặng Tab', () => {
    renderWithApp(detail(), { route: '/hd/hop-dong/abc' });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '-1')).toHaveLength(tabs.length - 1);
  });
});
