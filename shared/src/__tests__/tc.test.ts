/**
 * Hàm nghiệp vụ thuần của Module TC.
 *
 * Ba hàm dưới đây quyết định một cảnh báo có bật hay không, một bước có đi được hay không,
 * và một hạng mục còn bảo hành hay đã hết — cả ba đều là chỗ sai một lần là cãi nhau với
 * chủ đầu tư, nên có test riêng thay vì tin rằng màn hình gọi đúng.
 */

import { describe, expect, it } from 'vitest';
import {
  BUDGET_WARNING_THRESHOLD,
  canMoveSiteStage,
  siteDisplayStatus,
  summarizeBudget,
  warrantyDaysLeft,
} from '../tc';

describe('TC — ngân sách so với thực tế (TC-05)', () => {
  it('cộng cả đã phát sinh lẫn đã cam kết khi tính phần còn được chi', () => {
    const s = summarizeBudget([
      { budgetedAmount: 1_000_000_000n, actualAmount: 400_000_000n, committedAmount: 200_000_000n },
    ]);
    expect(s.engaged).toBe(600_000_000n);
    expect(s.remaining).toBe(400_000_000n);
    expect(s.health).toBe('trong_ngan_sach');
  });

  it('cảnh báo SỚM khi phần đã cam kết đẩy tổng qua ngưỡng, dù chi phí thật còn thấp', () => {
    // Chi thật mới 10%, nhưng đơn hàng đã ký chiếm nốt 85% — tiền coi như đã tiêu.
    const s = summarizeBudget([
      { budgetedAmount: 1_000_000_000n, actualAmount: 100_000_000n, committedAmount: 850_000_000n },
    ]);
    expect(s.health).toBe('sap_vuot');
    expect(s.engagedRatio).toBeGreaterThanOrEqual(BUDGET_WARNING_THRESHOLD);
  });

  it('vượt ngân sách thì phần còn được chi là số âm, không cắt về 0', () => {
    const s = summarizeBudget([
      { budgetedAmount: 500_000_000n, actualAmount: 600_000_000n, committedAmount: 0n },
    ]);
    expect(s.health).toBe('vuot_ngan_sach');
    expect(s.remaining).toBe(-100_000_000n);
  });

  it('chi mà không có ngân sách nào được duyệt luôn là vượt', () => {
    const s = summarizeBudget([
      { budgetedAmount: 0n, actualAmount: 5_000_000n, committedAmount: 0n },
    ]);
    expect(s.health).toBe('vuot_ngan_sach');
    expect(s.engagedRatio).toBeNull();
  });

  it('chưa có ngân sách và chưa chi gì thì không phải là vượt', () => {
    const s = summarizeBudget([]);
    expect(s.health).toBe('trong_ngan_sach');
    expect(s.budgeted).toBe(0n);
  });

  it('nhận chuỗi từ PostgREST và không mất chính xác ở công trình vài trăm tỷ', () => {
    const s = summarizeBudget([
      { budgetedAmount: '500000000000', actualAmount: '1', committedAmount: '0' },
    ]);
    expect(s.budgeted).toBe(500_000_000_000n);
    expect(String(s.engaged)).toBe('1');
  });
});

describe('TC — thứ tự các bước của công trình', () => {
  it('không nhảy từ Chuẩn bị thẳng tới Kết thúc', () => {
    expect(canMoveSiteStage('chuan_bi', 'hoan_thanh')).toBe(false);
    expect(canMoveSiteStage('chuan_bi', 'dang_thi_cong')).toBe(true);
  });

  it('tạm dừng quay lại được đúng bước đang dở', () => {
    expect(canMoveSiteStage('tam_dung', 'dang_thi_cong')).toBe(true);
    expect(canMoveSiteStage('tam_dung', 'hoan_thanh')).toBe(false);
  });

  it('kết thúc rồi thì không đi đâu được nữa', () => {
    expect(canMoveSiteStage('hoan_thanh', 'bao_hanh')).toBe(false);
  });
});

describe('TC — trạng thái hiển thị của công trình', () => {
  it('quá mốc hoàn thành dự kiến mà chưa xong là quá hạn', () => {
    expect(siteDisplayStatus('dang_thi_cong', '2020-01-01')).toBe('overdue');
  });

  it('công trình đã kết thúc thì mốc cũ không còn là việc phải làm', () => {
    expect(siteDisplayStatus('hoan_thanh', '2020-01-01')).toBe('completed');
  });

  it('chưa đặt mốc thì lấy trạng thái của bước', () => {
    expect(siteDisplayStatus('chuan_bi', null)).toBe('draft');
    expect(siteDisplayStatus('bao_hanh', null)).toBe('in_progress');
  });
});

describe('TC — hạn bảo hành theo từng hạng mục (TC-07)', () => {
  const today = new Date('2026-08-26T10:00:00');

  it('đếm số ngày còn lại theo NGÀY, không theo giờ', () => {
    expect(warrantyDaysLeft('2026-08-27', today)).toBe(1);
    expect(warrantyDaysLeft('2026-08-26', today)).toBe(0);
  });

  it('hết hạn rồi thì trả số âm để màn hình nói rõ đã quá bao lâu', () => {
    expect(warrantyDaysLeft('2026-08-20', today)).toBe(-6);
  });

  it('chưa đặt hạn thì nói chưa biết, không mặc định là còn hạn', () => {
    expect(warrantyDaysLeft(null, today)).toBeNull();
    expect(warrantyDaysLeft('không phải ngày', today)).toBeNull();
  });
});
