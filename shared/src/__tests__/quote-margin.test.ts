import { describe, expect, it } from 'vitest';
import { marginWarning, quoteKindsAvailable, quotesForScope } from '../quote-items';

describe('loại báo giá (0244)', () => {
  it('NVS không tách loại; NVC / NVO theo các bản đang hiệu lực, gương quotes_assign_version', () => {
    expect(quoteKindsAvailable('NVS', [])).toEqual([]);
    expect(quoteKindsAvailable('NVO', [])).toEqual(['thiet_ke', 'thi_cong', 'tron_goi']);
    expect(quoteKindsAvailable('NVO', ['thiet_ke'])).toEqual(['thiet_ke', 'thi_cong']);
    expect(quoteKindsAvailable('NVC', ['tron_goi'])).toEqual(['tron_goi']);
    // Báo giá chung cũ không chặn loại nào — bản mới thay nó.
    expect(quoteKindsAvailable('NVO', [null])).toEqual(['thiet_ke', 'thi_cong', 'tron_goi']);
  });

  it('nguồn hợp đồng: đúng loại trước, rồi báo giá chung; loại khác bị bỏ', () => {
    const list = [
      { id: 'a', scope_kind: 'thi_cong' },
      { id: 'b', scope_kind: null },
      { id: 'c', scope_kind: 'thiet_ke' },
    ];
    expect(quotesForScope(list, 'thiet_ke').map((q) => q.id)).toEqual(['c', 'b']);
    expect(quotesForScope(list, null).map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('cảnh báo lợi nhuận tối thiểu (0244)', () => {
  const base = {
    seesCost: true,
    marginPercent: 5,
    minMargin: 10,
    costComplete: true,
    routedToCeo: true,
    needsCeo: true,
  };

  it('người xem được giá vốn thấy con số', () => {
    expect(marginWarning(base)).toBe(
      'Lợi nhuận 5% dưới mức tối thiểu 10% của pháp nhân — chỉ Tổng Giám đốc duyệt được.',
    );
    expect(marginWarning({ ...base, costComplete: false, marginPercent: null })).toMatch(
      /^Chưa đủ giá vốn để kiểm mức lợi nhuận tối thiểu 10%/,
    );
    expect(marginWarning({ ...base, needsCeo: false })).toBeNull();
  });

  it('người không xem được giá vốn chỉ biết đã chuyển Tổng Giám đốc, không thấy số', () => {
    const w = marginWarning({ ...base, seesCost: false, marginPercent: null, minMargin: null });
    expect(w).not.toMatch(/\d/);
    expect(w).toMatch(/Tổng Giám đốc/);
    expect(marginWarning({ ...base, seesCost: false, routedToCeo: false })).toBeNull();
  });
});
