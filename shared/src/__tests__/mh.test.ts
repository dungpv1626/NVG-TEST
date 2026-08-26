/**
 * Hàm nghiệp vụ thuần của Module MH — chạy trong bộ nhớ, không cần CSDL.
 *
 * Trọng tâm là `standardizeQuotationCost`: nó quyết định nhà cung cấp nào rẻ hơn, mà "rẻ
 * hơn" ở đây là con số đem ký đơn hàng. Công thức này còn được viết lần thứ hai bằng SQL
 * trong `compare_quotations`; `db/src/__tests__/mh.test.ts` đối chiếu hai bản với nhau.
 */

import { describe, expect, it } from 'vitest';
import {
  compareQuotations,
  deliveryProgress,
  purchaseRequestDisplayStatus,
  standardizeQuotationCost,
} from '../mh';

describe('standardizeQuotationCost — MH-04', () => {
  it('cộng hao hụt vào tiền hàng TRƯỚC khi tính thuế', () => {
    const result = standardizeQuotationCost({
      subtotal: 20_000_000n,
      wastageRateBp: 250, // 2,5%
      taxRateBp: 1000, // 10%
      shippingFee: 2_000_000n,
    });

    expect(result.wastageAmount).toBe(500_000n);
    expect(result.goodsWithWastage).toBe(20_500_000n);
    // Thuế tính trên 20,5 triệu chứ không phải 20 triệu: phần mua bù cũng chịu thuế.
    expect(result.taxAmount).toBe(2_050_000n);
    expect(result.landedTotal).toBe(24_550_000n);
  });

  it('không có thuế, hao hụt hay vận chuyển thì tổng bằng đúng tiền hàng', () => {
    expect(standardizeQuotationCost({ subtotal: 7_000_000n }).landedTotal).toBe(7_000_000n);
  });

  it('nhận chuỗi từ PostgREST và giữ nguyên độ chính xác ở con số rất lớn', () => {
    const huge = '9007199254740993000'; // vượt Number.MAX_SAFE_INTEGER
    const result = standardizeQuotationCost({ subtotal: huge, taxRateBp: 1000 });
    expect(result.landedTotal).toBe(9007199254740993000n + 900719925474099300n);
  });

  it('bỏ qua tỷ lệ âm thay vì trừ tiền của nhà cung cấp', () => {
    const result = standardizeQuotationCost({ subtotal: 1_000_000n, taxRateBp: -500 });
    expect(result.taxAmount).toBe(0n);
    expect(result.landedTotal).toBe(1_000_000n);
  });
});

describe('compareQuotations — MH-04', () => {
  const rows = [
    {
      id: 'a',
      supplierName: 'Nhà cung cấp A',
      subtotal: 20_000_000n,
      taxRateBp: 1000,
      wastageRateBp: 250,
      shippingFee: 2_000_000n,
      deliveryDays: 15,
      warrantyMonths: 6,
    },
    {
      id: 'b',
      supplierName: 'Nhà cung cấp B',
      subtotal: 25_000_000n,
      taxRateBp: 1000,
      deliveryDays: 3,
      warrantyMonths: 24,
    },
  ];

  it('xếp theo TỔNG CHI PHÍ, không theo đơn giá', () => {
    const result = compareQuotations(rows);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result[0]!.isLowestCost).toBe(true);
    expect(result[0]!.costGapVsLowest).toBe(0n);
    expect(result[1]!.costGapVsLowest).toBe(27_500_000n - 24_550_000n);
  });

  it('đánh dấu giao nhanh nhất và bảo hành dài nhất ở nhà cung cấp ĐẮT hơn — đúng tình huống MH-04 mô tả', () => {
    const result = compareQuotations(rows);
    const pricier = result.find((r) => r.id === 'b')!;
    expect(pricier.isLowestCost).toBe(false);
    expect(pricier.isFastestDelivery).toBe(true);
    expect(pricier.isLongestWarranty).toBe(true);
  });

  it('không có trường nào nói nên chọn ai', () => {
    const [first] = compareQuotations(rows);
    expect(Object.keys(first!)).not.toContain('recommended');
  });

  it('danh sách rỗng trả về danh sách rỗng, không lỗi', () => {
    expect(compareQuotations([])).toEqual([]);
  });

  it('hai báo giá bằng tiền nhau thì cùng hạng, xếp theo tên nhà cung cấp', () => {
    const result = compareQuotations([
      { id: 'y', supplierName: 'Xây dựng Z', subtotal: 1_000_000n },
      { id: 'x', supplierName: 'An Phát', subtotal: 1_000_000n },
    ]);
    expect(result.map((r) => r.id)).toEqual(['x', 'y']);
    expect(result.every((r) => r.isLowestCost)).toBe(true);
  });
});

describe('deliveryProgress — MH-06', () => {
  it('đếm theo mặt hàng đã nhận đủ, không cộng số lượng khác đơn vị lại với nhau', () => {
    const result = deliveryProgress([
      { orderedQuantity: 5000, deliveredQuantity: 5000 }, // 5.000 con bulông, đã đủ
      { orderedQuantity: 20, deliveredQuantity: 0 }, // 20 tấn thép, chưa về
    ]);
    // Cộng số lượng lại sẽ ra "đã xong 99,6%" trong khi toàn bộ thép còn chưa về.
    expect(result.completeLines).toBe(1);
    expect(result.lines).toBe(2);
    expect(result.ratio).toBeCloseTo(0.5);
    expect(result.isComplete).toBe(false);
  });

  it('đơn hàng không có dòng nào thì chưa hoàn thành và không có tỷ lệ', () => {
    const result = deliveryProgress([]);
    expect(result.ratio).toBeNull();
    expect(result.isComplete).toBe(false);
  });

  it('số lượng thập phân (tấn, mét) vẫn tính là đã đủ', () => {
    const result = deliveryProgress([{ orderedQuantity: '12.5', deliveredQuantity: '12.5' }]);
    expect(result.isComplete).toBe(true);
  });

  it('nhận đủ mọi mặt hàng mới là xong', () => {
    const result = deliveryProgress([
      { orderedQuantity: 100, deliveredQuantity: 100 },
      { orderedQuantity: 50, deliveredQuantity: 50 },
    ]);
    expect(result.isComplete).toBe(true);
    expect(result.ratio).toBe(1);
  });
});

describe('purchaseRequestDisplayStatus — MH-01', () => {
  const today = new Date('2026-08-26T10:00:00+07:00');

  it('quá ngày cần hàng mà chưa mua xong thì hiện Quá hạn', () => {
    expect(purchaseRequestDisplayStatus('da_duyet', '2026-08-01', today)).toBe('overdue');
  });

  it('chưa tới ngày cần hàng thì giữ nguyên nhóm trạng thái của bước', () => {
    expect(purchaseRequestDisplayStatus('da_duyet', '2026-09-30', today)).toBe('in_progress');
  });

  it('hồ sơ đã kết thúc không bao giờ là Quá hạn', () => {
    expect(purchaseRequestDisplayStatus('hoan_thanh', '2026-01-01', today)).toBe('completed');
    expect(purchaseRequestDisplayStatus('huy', '2026-01-01', today)).toBe('completed');
  });

  it('bản nháp quá ngày vẫn là bản nháp — chưa ai hứa gì với ai', () => {
    expect(purchaseRequestDisplayStatus('nhap', '2026-01-01', today)).toBe('draft');
    expect(purchaseRequestDisplayStatus('tu_choi', '2026-01-01', today)).toBe('draft');
  });

  it('không có ngày cần hàng thì không suy ra quá hạn', () => {
    expect(purchaseRequestDisplayStatus('cho_duyet', null, today)).toBe('pending_approval');
  });
});
