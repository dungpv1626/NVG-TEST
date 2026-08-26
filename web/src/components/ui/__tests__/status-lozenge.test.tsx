/**
 * Nhãn trạng thái — thành phần xuất hiện ở NHIỀU màn hình nhất trong toàn hệ thống.
 *
 * Quy tắc bị canh ở đây không phải chuyện thẩm mỹ: Content Guidelines 6.8 và Webapp Flow 6.4 cấm
 * dùng màu làm cách DUY NHẤT truyền đạt thông tin. Người mù màu đỏ–lục chiếm khoảng 8% nam giới;
 * với họ "Hoàn thành" và "Quá hạn" là hai chấm giống hệt nhau nếu không có chữ đi kèm.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { STATUS_GROUPS, STATUS_META } from '@nvg/shared';
import { StatusLozenge } from '../status-lozenge';

describe('StatusLozenge', () => {
  it.each(STATUS_GROUPS)('nhóm "%s" luôn hiện CHỮ, không chỉ có màu', (status) => {
    render(<StatusLozenge status={status} />);
    expect(screen.getByText(STATUS_META[status].label)).toBeInTheDocument();
  });

  it('dùng đúng nhãn chuẩn của Content Guidelines 5.1, không tự đặt tên khác', () => {
    render(<StatusLozenge status="pending_approval" />);
    // "Chờ duyệt" là nhãn chuẩn; "Đang chờ phê duyệt" hay "Pending" đều sai quy ước.
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
  });

  it('kèm giải thích ý nghĩa để người mới không phải đoán', () => {
    render(<StatusLozenge status="overdue" />);
    expect(screen.getByText('Quá hạn')).toHaveAttribute('title', STATUS_META.overdue.meaning);
  });
});
