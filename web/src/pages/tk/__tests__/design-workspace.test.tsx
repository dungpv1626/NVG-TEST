/**
 * Vỏ Trang dự án thiết kế — canh đúng những chỗ bố cục hai cấp có thể hỏng lặng lẽ.
 *
 * Bố cục hai cấp là chỗ dễ sai nhất của màn hình này: một tab không có mặt trên thanh vẫn
 * phải mở được bằng đường dẫn, và khi mở thì thanh tab phải BIẾN MẤT chứ không đứng đó với
 * một tab "đang chọn" không đúng nội dung đang hiện.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import { DesignWorkspace } from '../design-workspace';

function shell(
  route = '/tk/du-an/p',
  related?: React.ComponentProps<typeof DesignWorkspace>['related'],
) {
  return renderWithApp(
    <DesignWorkspace
      breadcrumbs={[{ label: 'Thiết kế' }, { label: 'Nhà phố Nguyễn Văn A' }]}
      title="Nhà phố Nguyễn Văn A"
      code="NVO-TK-2026-2399"
      status="in_progress"
      deadline="2090-09-18"
      meta={['Nhà phố · 4 tầng']}
      actions={<button type="button">Bàn giao thi công</button>}
      primaryTabIds={['tong-quan', 'thay-doi']}
      tabs={[
        { id: 'tong-quan', label: 'Tổng quan', content: <p>Bảng tổng quan</p> },
        { id: 'thay-doi', label: 'Yêu cầu thay đổi', content: <p>Danh sách yêu cầu</p> },
        {
          id: 'dau-bai',
          label: 'Đầu bài thiết kế',
          subtitle: 'Chuẩn hoá yêu cầu khách hàng.',
          content: <p>Biểu mẫu đầu bài</p>,
        },
        {
          id: 'khao-sat',
          label: 'Khảo sát hiện trạng',
          content: <p>Biên bản khảo sát</p>,
        },
        {
          id: 'chuong-trinh-khong-gian',
          label: 'Chương trình không gian',
          content: <p>Danh sách phòng</p>,
        },
      ]}
      historyContent={<p>Nhật ký hồ sơ</p>}
      related={
        related ?? [
          { title: 'Hồ sơ liên quan', records: [{ label: 'Khách hàng', value: 'Công ty A' }] },
        ]
      }
    />,
    { route },
  );
}

describe('Vỏ Trang dự án thiết kế', () => {
  // Lựa chọn sáng/tối lưu ở `localStorage` và jsdom dùng chung một bộ nhớ cho cả tệp — không
  // xoá thì thứ tự chạy trở thành điều kiện ngầm của test đổi giao diện.
  beforeEach(() => window.localStorage.clear());

  it('thanh tab chỉ có tab cấp một, cộng Lịch sử', () => {
    shell();
    const strip = screen.getByRole('tablist');
    expect(
      within(strip)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Tổng quan', 'Yêu cầu thay đổi', 'Lịch sử']);
    // Đầu bài là màn hình con: không có mặt trên thanh, nhưng vẫn mở được bằng đường dẫn.
    expect(within(strip).queryByRole('tab', { name: 'Đầu bài thiết kế' })).toBeNull();
  });

  it('mở màn hình con bằng đường dẫn thì ẨN thanh tab và hiện lối quay lại', () => {
    shell('/tk/du-an/p?tab=dau-bai');
    expect(screen.getByText('Biểu mẫu đầu bài')).toBeInTheDocument();
    expect(screen.getByText('Chuẩn hoá yêu cầu khách hàng.')).toBeInTheDocument();
    // Còn thanh tab ở đây là nói dối trình đọc màn hình: nó sẽ đọc "tab 1 trên 3" trong khi
    // nội dung đang hiện không thuộc tab nào trong ba.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: /Tổng quan/ })).toBeInTheDocument();
  });

  it('bấm "Tổng quan" ở màn hình con quay về đúng tab, giữ nguyên đường dẫn hồ sơ', async () => {
    shell('/tk/du-an/p?tab=dau-bai');
    await userEvent.click(screen.getByRole('button', { name: /Tổng quan/ }));
    expect(screen.getByTestId('duong-dan-hien-tai')).toHaveTextContent('/tk/du-an/p?tab=tong-quan');
    expect(screen.getByText('Bảng tổng quan')).toBeInTheDocument();
  });

  it('màn hình con có nút sang bước tiếp theo — không phải quay ra Tổng quan', async () => {
    shell('/tk/du-an/p?tab=dau-bai');
    // Bước đầu: không có bước trước. Nút hiện ở đầu trang VÀ cuối trang (biểu mẫu dài).
    expect(screen.queryByRole('button', { name: /Bước trước/ })).toBeNull();
    const nexts = screen.getAllByRole('button', { name: 'Bước tiếp theo: Khảo sát hiện trạng' });
    expect(nexts).toHaveLength(2);

    await userEvent.click(nexts[1]!);
    expect(screen.getByTestId('duong-dan-hien-tai')).toHaveTextContent('/tk/du-an/p?tab=khao-sat');
    expect(screen.getByText('Biên bản khảo sát')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Bước trước: Đầu bài thiết kế' })).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Bước tiếp theo: Chương trình không gian' }),
    ).toHaveLength(2);
  });

  it('bước cuối không có nút đi tiếp', () => {
    shell('/tk/du-an/p?tab=chuong-trinh-khong-gian');
    expect(screen.queryByRole('button', { name: /Bước tiếp theo/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Bước trước: Khảo sát/ })).toHaveLength(2);
  });

  it('tab cấp một không có dải chuyển bước', () => {
    shell('/tk/du-an/p?tab=thay-doi');
    expect(screen.queryByRole('navigation', { name: /Chuyển bước/ })).toBeNull();
  });

  it('đổi tab bằng phím mũi tên, đúng mẫu ARIA tablist', async () => {
    shell();
    await userEvent.click(screen.getByRole('tab', { name: 'Tổng quan' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Yêu cầu thay đổi' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('hồ sơ liên quan vẫn hiện ở màn hình con (Webapp Flow 5.1)', () => {
    shell('/tk/du-an/p?tab=dau-bai');
    expect(screen.getByText('Công ty A')).toBeInTheDocument();
  });

  it('mọi nhóm hồ sơ liên quan đều rỗng thì KHÔNG dành chỗ cho cột phải', () => {
    // Trang gọi luôn truyền một nhóm «Hồ sơ liên quan», và nhóm đó rỗng khi dự án chưa nối
    // với cơ hội nào. Chỉ đếm số NHÓM thì cột 20rem vẫn được dành chỗ để hiện đúng một câu
    // «Chưa có hồ sơ liên quan» — một dải trắng 320px chạy dọc bên phải mọi màn hình con,
    // và nội dung bên trái bị bó lại vô cớ (Haan bắt được 07/09/2026).
    shell('/tk/du-an/p?tab=dau-bai', [{ title: 'Hồ sơ liên quan', records: [] }]);

    expect(screen.queryByRole('complementary', { name: 'Hồ sơ liên quan' })).toBeNull();
    const grid = screen.getByTestId('luoi-man-hinh-con');
    expect(grid.className).not.toContain('grid-cols');
  });

  it('có hồ sơ thật thì cột phải vẫn dựng', () => {
    shell('/tk/du-an/p?tab=dau-bai');
    expect(screen.getByRole('complementary', { name: 'Hồ sơ liên quan' })).toBeInTheDocument();
    const grid = screen.getByTestId('luoi-man-hinh-con');
    expect(grid.className).toContain('grid-cols');
  });

  it('tự mang bảng màu riêng kể cả khi dựng ngoài khung ứng dụng', () => {
    // Nút chuyển sáng/tối nằm ở thanh trên của khung (`app-shell`), không ở đây — kiểm ở
    // `layout/__tests__/tk-chrome.test.tsx`. Nhưng vỏ này vẫn phải tự đặt `data-tk-theme` cho
    // chính nó: đó là thứ DUY NHẤT quyết định bảng màu, và không có nó thì một màn hình dựng
    // riêng lẻ ra nền tối với chữ của chế độ sáng.
    const { container } = shell();
    expect(container.querySelector('[data-tk-theme]')).toHaveAttribute('data-tk-theme', 'toi');
  });

  it('trạng thái và hạn hiện bằng CHỮ, không chỉ bằng màu (CGD 6.8)', () => {
    shell();
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
    expect(screen.getByText(/Còn \d+ ngày/)).toBeInTheDocument();
  });
});
