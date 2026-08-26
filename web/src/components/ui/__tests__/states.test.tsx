/**
 * Trạng thái rỗng / đang tải / lỗi.
 *
 * Ba màn hình này quyết định cảm giác "hệ thống có đang hoạt động không" nhiều hơn màn hình có
 * dữ liệu. Quy tắc bị canh: KHÔNG để trang trắng, KHÔNG dùng vòng xoay toàn màn hình, và KHÔNG
 * hiện chi tiết kỹ thuật cho người dùng (Webapp Flow 6.7, Content Guidelines 4.6–4.7).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState, ErrorState, TableSkeleton } from '../states';

describe('EmptyState', () => {
  it('nêu tình trạng và chỗ đặt được nút gợi ý bước tiếp theo', async () => {
    render(
      <EmptyState
        message="Chưa có hợp đồng nào."
        action={<button type="button">Soạn hợp đồng</button>}
      />,
    );
    expect(screen.getByText('Chưa có hợp đồng nào.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soạn hợp đồng' })).toBeInTheDocument();
  });

  it('không có nút thì vẫn phải nói rõ tình trạng, không để trắng', () => {
    render(<EmptyState message="Không có hồ sơ nào đang chờ phê duyệt." />);
    expect(screen.getByText('Không có hồ sơ nào đang chờ phê duyệt.')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('có lối thử lại, và bấm vào thì thật sự gọi lại', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Không tải được danh sách." onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  /**
   * Đây là quy tắc dễ vi phạm nhất khi vội: ném thẳng `error.message` của PostgREST ra màn hình.
   * Người dùng nhận được câu như 'new row violates row-level security policy for table "quotes"'
   * — vừa không hiểu, vừa lộ tên bảng và cấu trúc phân quyền ra ngoài.
   */
  it('KHÔNG hiện chi tiết kỹ thuật cho người dùng', () => {
    render(
      <ErrorState
        message="Không tải được danh sách. Kiểm tra kết nối mạng rồi thử lại."
        technicalDetail='new row violates row-level security policy for table "quotes"'
      />,
    );
    expect(screen.queryByText(/row-level security/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/quotes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Kiểm tra kết nối mạng/)).toBeInTheDocument();
  });
});

describe('TableSkeleton', () => {
  /**
   * Skeleton phải có ĐÚNG hình dạng nội dung sắp hiện, không phải một vòng xoay. Lý do ở Webapp
   * Flow 6.7: vòng xoay toàn màn hình che mất bố cục nên người dùng không đoán được sắp thấy gì,
   * và nếu mạng chậm thì nó đọc ra như máy treo.
   */
  it('dựng đúng số ô giữ chỗ theo số dòng và số cột sắp hiện', () => {
    const { container } = render(<TableSkeleton rows={3} columns={4} />);
    // Một hàng tiêu đề + 3 hàng dữ liệu, mỗi hàng 4 ô → 16 khối giữ chỗ.
    // Đếm theo khối giữ chỗ chứ không theo thẻ `<tr>`: skeleton dựng bằng `div` để khớp bố cục
    // dạng thẻ trên điện thoại, nên bám vào cấu trúc bảng là bám vào thứ có thể đổi bất cứ lúc nào.
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(16);
  });

  it('không dùng vai trò tiến trình kiểu vòng xoay toàn màn hình', () => {
    render(<TableSkeleton />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
