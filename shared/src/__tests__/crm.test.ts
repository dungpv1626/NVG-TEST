/**
 * Quy tắc nghiệp vụ CRM tính được ở tầng dùng chung.
 *
 * Đây là những quy tắc KHÔNG nằm trong CSDL, nên bộ test RLS không chạm tới — nếu sai thì
 * không có lưới nào đỡ. Trạng thái "quá hạn" của khiếu nại là ví dụ: nó quyết định hồ sơ nào
 * hiện màu đỏ trên danh sách và trên cảnh báo NEN-04.
 */

import { describe, expect, it } from 'vitest';
import { complaintDisplayStatus } from '../crm';

describe('complaintDisplayStatus', () => {
  // 10:00 sáng giờ Việt Nam ngày 25/08/2026.
  const now = new Date('2026-08-25T03:00:00Z');

  it('giữ nguyên trạng thái khi chưa tới hạn phản hồi', () => {
    expect(complaintDisplayStatus('in_progress', '2026-08-28', now)).toBe('in_progress');
    expect(complaintDisplayStatus('draft', '2026-09-30', now)).toBe('draft');
  });

  it('đúng ngày đến hạn thì CHƯA quá hạn — vẫn còn cả ngày để xử lý', () => {
    expect(complaintDisplayStatus('in_progress', '2026-08-25', now)).toBe('in_progress');
  });

  it('quá ngày đến hạn thì chuyển sang quá hạn', () => {
    expect(complaintDisplayStatus('in_progress', '2026-08-24', now)).toBe('overdue');
    expect(complaintDisplayStatus('in_progress', '2026-07-01', now)).toBe('overdue');
  });

  it('đã xử lý xong thì không bao giờ hiện quá hạn', () => {
    // Hồ sơ đóng lúc nào cũng là đóng — hạn phản hồi không còn ý nghĩa.
    expect(complaintDisplayStatus('completed', '2026-01-01', now)).toBe('completed');
  });

  it('không có hạn phản hồi thì giữ nguyên trạng thái', () => {
    expect(complaintDisplayStatus('in_progress', null, now)).toBe('in_progress');
    expect(complaintDisplayStatus('in_progress', undefined, now)).toBe('in_progress');
  });

  it('luôn trả về một trong 6 nhóm trạng thái chuẩn', () => {
    // Không được sinh ra trạng thái thứ 6: màu trạng thái chỉ có đúng 5 (CGD 6.4).
    const groups = ['draft', 'pending_approval', 'in_progress', 'completed', 'overdue'];
    for (const status of groups) {
      const result = complaintDisplayStatus(
        status as (typeof groups)[number] & Parameters<typeof complaintDisplayStatus>[0],
        '2026-01-01',
        now,
      );
      expect(groups).toContain(result);
    }
  });
});
