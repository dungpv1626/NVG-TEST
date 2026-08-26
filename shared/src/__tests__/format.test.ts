import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatWaiting,
  fromNvgInput,
  toNvgDateInput,
  toNvgTimeInput,
  formatNumber,
  formatPercent,
  formatPhone,
} from '../format';

// Định dạng chuẩn: Content Guidelines Mục 4.3.

describe('formatDate — dd/mm/yyyy', () => {
  it('định dạng đúng ví dụ trong tài liệu', () => {
    expect(formatDate('2026-08-23T03:00:00Z')).toBe('23/08/2026');
  });

  it('quy về múi giờ Việt Nam, không phải UTC', () => {
    // 22/08 lúc 18:00 UTC = 23/08 lúc 01:00 giờ Việt Nam
    expect(formatDate('2026-08-22T18:00:00Z')).toBe('23/08/2026');
  });

  it('trả chuỗi rỗng thay vì "Invalid Date" khi dữ liệu hỏng', () => {
    expect(formatDate('không phải ngày')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});

describe('formatDateTime — dd/mm/yyyy — hh:mm (24 giờ)', () => {
  it('dùng gạch ngang dài và giờ 24', () => {
    // 07:30 UTC = 14:30 giờ Việt Nam
    expect(formatDateTime('2026-08-23T07:30:00Z')).toBe('23/08/2026 — 14:30');
  });

  it('không dùng SA/CH', () => {
    expect(formatDateTime('2026-08-23T12:05:00Z')).toBe('23/08/2026 — 19:05');
  });
});

describe('formatNumber — 1.234.567,89', () => {
  it('chấm phân cách hàng nghìn, phẩy phân cách thập phân', () => {
    expect(formatNumber(1234567.89)).toBe('1.234.567,89');
  });

  it('không thêm phần thập phân thừa', () => {
    expect(formatNumber(1000)).toBe('1.000');
  });
});

describe('formatCurrency — bigint, đơn vị đồng, không thập phân', () => {
  it('định dạng đúng ví dụ trong tài liệu', () => {
    expect(formatCurrency(125_000_000n)).toBe('125.000.000 đồng');
  });

  it('hỗ trợ ký hiệu ₫', () => {
    expect(formatCurrency(125_000_000n, { symbol: true })).toBe('125.000.000 ₫');
  });

  it('nhận chuỗi vì Drizzle trả bigint dạng chuỗi', () => {
    expect(formatCurrency('125000000')).toBe('125.000.000 đồng');
  });

  it('không sinh phần thập phân cho VNĐ', () => {
    expect(formatCurrency(1234.56)).toBe('1.235 đồng');
  });

  it('xử lý được số rất lớn không mất chính xác (vượt Number.MAX_SAFE_INTEGER)', () => {
    expect(formatCurrency(9_007_199_254_740_993n)).toBe('9.007.199.254.740.993 đồng');
  });
});

describe('formatPercent — không khoảng trắng trước %', () => {
  it('định dạng đúng ví dụ trong tài liệu', () => {
    expect(formatPercent(8)).toBe('8%');
  });

  it('làm tròn phần thập phân', () => {
    expect(formatPercent(8.25)).toBe('8,3%');
  });
});

describe('formatPhone', () => {
  it('nhóm 3-3-4 cho số 10 chữ số', () => {
    expect(formatPhone('0901234567')).toBe('090 123 4567');
  });

  it('giữ nguyên đầu vào nếu không nhận dạng được', () => {
    expect(formatPhone('1900')).toBe('1900');
  });
});

describe('daysUntil / formatDeadline', () => {
  const now = '2026-08-25T03:00:00Z'; // 10:00 giờ Việt Nam

  it('đếm theo ngày lịch, không theo 24 giờ tròn', () => {
    expect(daysUntil('2026-08-26T00:30:00Z', now)).toBe(1);
  });

  it('trả số âm khi đã quá hạn', () => {
    expect(daysUntil('2026-08-22T03:00:00Z', now)).toBe(-3);
  });

  it('diễn đạt bình tĩnh, không giật gân (Content Guidelines 2.3)', () => {
    expect(formatDeadline('2026-08-25T10:00:00Z', now)).toBe('Đến hạn hôm nay');
    expect(formatDeadline('2026-08-26T03:00:00Z', now)).toBe('Còn 1 ngày');
    expect(formatDeadline('2026-08-28T03:00:00Z', now)).toBe('Còn 3 ngày');
    expect(formatDeadline('2026-08-24T03:00:00Z', now)).toBe('Quá hạn 1 ngày');
    expect(formatDeadline('2026-08-20T03:00:00Z', now)).toBe('Quá hạn 5 ngày');
  });
});

describe('formatWaiting', () => {
  const now = new Date('2026-08-25T03:00:00Z'); // 10:00 giờ Việt Nam

  it('nói về thời gian ĐÃ CHỜ, không phải thời hạn sắp tới', () => {
    expect(formatWaiting('2026-08-25T02:00:00Z', now)).toBe('Gửi hôm nay');
    expect(formatWaiting('2026-08-24T03:00:00Z', now)).toBe('Chờ 1 ngày');
    expect(formatWaiting('2026-08-20T03:00:00Z', now)).toBe('Chờ 5 ngày');
  });

  it('không đọc ra "Đến hạn hôm nay" cho hồ sơ vừa gửi', () => {
    // Chính lỗi đã gặp khi dùng nhầm formatDeadline cho thời điểm gửi phê duyệt.
    expect(formatDeadline('2026-08-25T02:00:00Z', now)).toBe('Đến hạn hôm nay');
    expect(formatWaiting('2026-08-25T02:00:00Z', now)).toBe('Gửi hôm nay');
  });

  it('trả chuỗi rỗng khi chưa có mốc thời gian', () => {
    expect(formatWaiting(null)).toBe('');
    expect(formatWaiting(undefined)).toBe('');
  });
});

describe('ô nhập ngày giờ theo múi giờ nghiệp vụ', () => {
  it('quy về giờ Việt Nam, không phải giờ UTC hay giờ máy', () => {
    // 25/08/2026 21:30 giờ Việt Nam = 14:30Z cùng ngày.
    const iso = '2026-08-25T14:30:00Z';
    expect(toNvgDateInput(iso)).toBe('2026-08-25');
    expect(toNvgTimeInput(iso)).toBe('21:30');
  });

  it('thời điểm sau 17:00Z vẫn thuộc NGÀY HÔM SAU ở Việt Nam', () => {
    // Chính chỗ `toISOString().slice(0, 10)` sai: UTC vẫn là ngày 25, Việt Nam đã sang 26.
    const iso = '2026-08-25T18:00:00Z';
    expect(iso.slice(0, 10)).toBe('2026-08-25');
    expect(toNvgDateInput(iso)).toBe('2026-08-26');
    expect(toNvgTimeInput(iso)).toBe('01:00');
  });

  it('fromNvgInput hiểu chuỗi người dùng nhập là GIỜ VIỆT NAM', () => {
    // 21:30 giờ Việt Nam phải lưu xuống thành 14:30Z, bất kể máy đặt múi giờ nào.
    expect(fromNvgInput('2026-08-25T21:30')).toBe('2026-08-25T14:30:00.000Z');
  });

  it('đi và về không làm lệch thời điểm', () => {
    const iso = '2026-08-25T14:30:00.000Z';
    const roundTrip = fromNvgInput(`${toNvgDateInput(iso)}T${toNvgTimeInput(iso)}`);
    expect(roundTrip).toBe(iso);
  });

  it('nửa đêm giờ Việt Nam không bị đẩy sang 24:00 hay lệch ngày', () => {
    const iso = '2026-08-25T17:00:00Z'; // đúng 00:00 ngày 26 giờ Việt Nam
    expect(toNvgDateInput(iso)).toBe('2026-08-26');
    expect(toNvgTimeInput(iso)).toBe('00:00');
    expect(fromNvgInput('2026-08-26T00:00')).toBe('2026-08-25T17:00:00.000Z');
  });

  it('giá trị rỗng cho ra rỗng, không cho ra "Invalid Date"', () => {
    expect(toNvgDateInput('')).toBe('');
    expect(toNvgTimeInput('không phải ngày')).toBe('');
    expect(fromNvgInput('')).toBeNull();
    expect(fromNvgInput(null)).toBeNull();
    expect(fromNvgInput('rác')).toBeNull();
  });
});
