/**
 * Bảng hướng dẫn ngắn của từng phần màn hình.
 *
 * Ba điều bị canh ở đây, và cả ba đều là điều kiện để chỉ dẫn thật sự đến được người dùng:
 * bảng phải MỞ ĐƯỢC bằng bàn phím lẫn chuột, phải ĐÓNG ĐƯỢC (nếu không nó che mất phần nội
 * dung ngay dưới), và nút phải có nhãn trợ năng nói rõ nó hướng dẫn cho phần nào — một trang
 * có tám dấu hỏi giống hệt nhau thì trình đọc màn hình không phân biệt được cái nào là cái nào.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionHelp } from '../section-help';
import { DESIGN_HELP } from '@/pages/tk/help-texts';

describe('SectionHelp', () => {
  it('mở ra các bước cần làm khi bấm, đóng lại khi bấm lần nữa', async () => {
    const user = userEvent.setup();
    render(<SectionHelp title="Khối ba chiều" steps={['Kéo chuột để xoay.']} note="Khối sơ bộ." />);

    const button = screen.getByRole('button', { name: 'Hướng dẫn: Khối ba chiều' });
    expect(screen.queryByText('Kéo chuột để xoay.')).not.toBeInTheDocument();

    await user.click(button);
    expect(screen.getByText('Kéo chuột để xoay.')).toBeInTheDocument();
    expect(screen.getByText('Khối sơ bộ.')).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByText('Kéo chuột để xoay.')).not.toBeInTheDocument();
  });

  it('phím Esc đóng bảng — không bắt phải tìm lại đúng nút vừa bấm', async () => {
    const user = userEvent.setup();
    render(<SectionHelp title="Bản vẽ mặt bằng" steps={['Chọn tầng.']} />);

    await user.click(screen.getByRole('button', { name: 'Hướng dẫn: Bản vẽ mặt bằng' }));
    expect(screen.getByText('Chọn tầng.')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Chọn tầng.')).not.toBeInTheDocument();
  });

  it('KHÔNG tự mở đè lên dữ liệu — chỉ báo «có hướng dẫn mới» tới lần đầu mở', async () => {
    // Bảng tự mở từng che cột Trạng thái / Thời hạn ở 16 danh sách (review UX, vấn đề 2).
    window.localStorage.clear();
    const user = userEvent.setup();
    const guide = { title: 'Đầu bài thiết kế', steps: ['Điền các mục còn trống.'] };

    const first = render(<SectionHelp {...guide} autoOpenKey="tk.dau-bai" />);
    expect(screen.queryByText('Điền các mục còn trống.')).not.toBeInTheDocument();
    expect(screen.getByTestId('huong-dan-moi')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Hướng dẫn: Đầu bài thiết kế/ }));
    expect(screen.getByText('Điền các mục còn trống.')).toBeInTheDocument();
    expect(screen.queryByTestId('huong-dan-moi')).not.toBeInTheDocument();
    first.unmount();

    render(<SectionHelp {...guide} autoOpenKey="tk.dau-bai" />);
    expect(screen.queryByTestId('huong-dan-moi')).not.toBeInTheDocument();
  });

  it('không khai autoOpenKey thì im lặng — bốn khối con không bật cùng lúc', () => {
    window.localStorage.clear();
    render(<SectionHelp title="Khối ba chiều" steps={['Kéo chuột để xoay.']} />);
    expect(screen.queryByText('Kéo chuột để xoay.')).not.toBeInTheDocument();
  });

  it('nút Đã hiểu đóng bảng', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    render(
      <SectionHelp
        title="Phương án kiến trúc"
        steps={['So sánh các phương án.']}
        autoOpenKey="tk.phuong-an"
      />,
    );
    await user.click(screen.getByRole('button', { name: /Hướng dẫn: Phương án kiến trúc/ }));
    expect(screen.getByText('So sánh các phương án.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(screen.queryByText('So sánh các phương án.')).not.toBeInTheDocument();
  });

  it('localStorage ném lỗi thì vẫn mở được, không làm hỏng màn hình', async () => {
    // Chế độ ẩn danh và trình duyệt chặn lưu dữ liệu trang đều NÉM chứ không trả rỗng.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bị chặn');
    });
    const user = userEvent.setup();
    render(
      <SectionHelp
        title="Khảo sát hiện trạng"
        steps={['Nhập kích thước.']}
        autoOpenKey="tk.khao-sat"
      />,
    );
    await user.click(screen.getByRole('button', { name: /Hướng dẫn: Khảo sát hiện trạng/ }));
    expect(screen.getByText('Nhập kích thước.')).toBeInTheDocument();
    spy.mockRestore();
    setSpy.mockRestore();
  });

  it('mọi mục hướng dẫn của Module Thiết kế đều ngắn và viết bằng tiếng Việt có dấu', () => {
    for (const [key, guide] of Object.entries(DESIGN_HELP)) {
      expect(guide.steps.length, key).toBeGreaterThan(0);
      // Ba bước là trần: dài hơn thì người dùng đóng bảng mà không đọc.
      expect(guide.steps.length, key).toBeLessThanOrEqual(3);
      for (const step of guide.steps) {
        expect(step.length, `${key}: "${step}"`).toBeLessThanOrEqual(120);
      }
      // Có dấu tiếng Việt ở đâu đó trong mục — bắt được bản dịch còn sót tiếng Anh.
      expect(`${guide.title} ${guide.steps.join(' ')}`).toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầ]/i);
    }
  });
});
