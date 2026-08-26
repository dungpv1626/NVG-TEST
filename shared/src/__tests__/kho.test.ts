/**
 * Hàm nghiệp vụ thuần của Module KHO — chạy trong bộ nhớ, không cần CSDL.
 *
 * Trọng tâm là hai chỗ dễ sai lặng lẽ: mã vật tư (KHO-02 — sai là sinh mã trùng) và cảnh báo
 * tồn kho (KHO-08 — sai là hoặc báo động giả suốt ngày, hoặc im lặng cho tới lúc hết hàng).
 */

import { describe, expect, it } from 'vitest';
import { buildMaterialCode } from '../codes';
import {
  SLOW_MOVING_DAYS,
  inventoryValue,
  isUsableScaffolding,
  stockAlerts,
  summarizeStocktake,
  stocktakeStatusMeta,
} from '../kho';

describe('buildMaterialCode — KHO-02', () => {
  it('ghép theo đúng thứ tự nhóm – viết tắt – quy cách', () => {
    expect(buildMaterialCode('THEP', 'ONG', 'D49x2.0')).toBe('THEP-ONG-D49X2.0');
  });

  it('bỏ dấu tiếng Việt để cùng một vật tư không ra hai mã', () => {
    // Người này gõ có dấu, người kia gõ không dấu — nếu ra hai mã thì đúng cái KHO-02 chặn
    // lại đã xảy ra ngay ở ô nhập.
    expect(buildMaterialCode('Thép', 'Hộp', '50x50')).toBe(
      buildMaterialCode('THEP', 'HOP', '50x50'),
    );
    expect(buildMaterialCode('Thép', 'Hộp', '50x50')).toBe('THEP-HOP-50X50');
  });

  it('xử lý được chữ Đ, thứ mà bỏ dấu thông thường không tách ra', () => {
    expect(buildMaterialCode('DIEN', 'Đèn', 'LED18W')).toBe('DIEN-DEN-LED18W');
  });

  it('bỏ khoảng trắng giữa chừng — mã in ra tem không có dấu cách', () => {
    expect(buildMaterialCode('CCDC', 'May Han', '250A')).toBe('CCDC-MAYHAN-250A');
  });

  it('thiếu quy cách thì bỏ luôn phần đó, không để lại dấu nối thừa', () => {
    expect(buildMaterialCode('KHAC', 'BULONG', '')).toBe('KHAC-BULONG');
  });
});

describe('stockAlerts — KHO-08', () => {
  const today = new Date('2026-08-26T10:00:00+07:00');

  it('hết hàng là cảnh báo riêng, không gộp vào "sắp hết"', () => {
    expect(stockAlerts({ quantityOnHand: 0, minQuantity: 100 }, today)).toEqual(['het_hang']);
  });

  it('chạm mức tối thiểu thì báo sắp hết', () => {
    expect(stockAlerts({ quantityOnHand: 100, minQuantity: 100 }, today)).toEqual(['sap_het']);
    expect(stockAlerts({ quantityOnHand: 101, minQuantity: 100 }, today)).toEqual([]);
  });

  it('không đặt mức tối thiểu thì không báo sắp hết — không đoán hộ người dùng', () => {
    expect(stockAlerts({ quantityOnHand: 5, minQuantity: null }, today)).toEqual([]);
  });

  it('vừa sắp hết vừa nằm im lâu thì báo cả hai — hai việc phải làm khác nhau', () => {
    const alerts = stockAlerts(
      {
        quantityOnHand: 10,
        minQuantity: 50,
        lastMovementAt: '2026-01-01T00:00:00+07:00',
      },
      today,
    );
    expect(alerts).toEqual(['sap_het', 'ton_lau']);
  });

  it(`đúng ${SLOW_MOVING_DAYS} ngày không phát sinh thì bắt đầu báo tồn lâu`, () => {
    const boundary = new Date(today.getTime() - SLOW_MOVING_DAYS * 86_400_000);
    expect(
      stockAlerts({ quantityOnHand: 10, lastMovementAt: boundary.toISOString() }, today),
    ).toEqual(['ton_lau']);

    const oneDayShort = new Date(today.getTime() - (SLOW_MOVING_DAYS - 1) * 86_400_000);
    expect(
      stockAlerts({ quantityOnHand: 10, lastMovementAt: oneDayShort.toISOString() }, today),
    ).toEqual([]);
  });

  it('hết hàng thì không báo kèm "tồn lâu" — không còn gì để mà tồn', () => {
    expect(
      stockAlerts({ quantityOnHand: 0, lastMovementAt: '2025-01-01T00:00:00+07:00' }, today),
    ).toEqual(['het_hang']);
  });
});

describe('isUsableScaffolding — KHO-06', () => {
  it('chỉ hàng mới và còn dùng được mới tính vào lượng cho thuê', () => {
    expect(isUsableScaffolding('moi')).toBe(true);
    expect(isUsableScaffolding('con_dung_duoc')).toBe(true);
    expect(isUsableScaffolding('hong_cho_sua')).toBe(false);
    expect(isUsableScaffolding('cho_thanh_ly')).toBe(false);
  });
});

describe('summarizeStocktake — KHO-07', () => {
  it('đếm số dòng đã đếm và số dòng lệch, không kết luận nguyên nhân', () => {
    const result = summarizeStocktake([
      { materialId: 'a', bookQuantity: 1000, countedQuantity: 980 },
      { materialId: 'b', bookQuantity: 200, countedQuantity: 200 },
      { materialId: 'c', bookQuantity: 50, countedQuantity: null },
    ]);
    expect(result.totalLines).toBe(3);
    expect(result.countedLines).toBe(2);
    expect(result.varianceLines).toBe(1);
    expect(result.totalAbsVariance).toBe(20);
    expect(result.isComplete).toBe(false);
  });

  it('đếm thừa cũng là chênh lệch, không chỉ đếm thiếu', () => {
    const result = summarizeStocktake([
      { materialId: 'a', bookQuantity: 100, countedQuantity: 130 },
    ]);
    expect(result.varianceLines).toBe(1);
    expect(result.totalAbsVariance).toBe(30);
    expect(result.isComplete).toBe(true);
  });

  it('kho trống thì chưa hoàn thành, không phải đã xong', () => {
    expect(summarizeStocktake([]).isComplete).toBe(false);
  });
});

describe('inventoryValue', () => {
  it('giữ nguyên độ chính xác ở số lượng thập phân và đơn giá lớn', () => {
    expect(
      inventoryValue([
        { quantityOnHand: '12.5', averageCost: 20_000n },
        { quantityOnHand: 1000, averageCost: '22000' },
      ]),
    ).toBe(250_000n + 22_000_000n);
  });

  it('danh sách rỗng là 0 đồng', () => {
    expect(inventoryValue([])).toBe(0n);
  });
});

/**
 * Tra nhãn trạng thái kiểm kê phải chịu được giá trị giao diện CHƯA BIẾT.
 *
 * Đây là lỗi có thật, gặp ngay khi thêm `khop_so` vào cơ sở dữ liệu: bản giao diện đang chạy
 * tra `STOCKTAKE_STATUS_META[status]` ra `undefined`, đọc tiếp `.statusGroup` và cả trang vỡ
 * thành màn hình trắng kèm stack trace. CSDL và giao diện deploy riêng nên luôn có quãng một
 * bên mới hơn — không thể coi là chuyện hiếm.
 */
describe('stocktakeStatusMeta', () => {
  it('trả đúng nhãn cho trạng thái đã biết', () => {
    expect(stocktakeStatusMeta('dang_kiem').label).toBe('Đang kiểm đếm');
    expect(stocktakeStatusMeta('khop_so').statusGroup).toBe('completed');
  });

  it('trạng thái lạ KHÔNG làm vỡ trang — vẫn có nhóm màu và nhãn để hiện', () => {
    const meta = stocktakeStatusMeta('trang_thai_chua_co_trong_ban_nay');
    expect(meta.statusGroup).toBe('in_progress');
    expect(meta.label).toBe('trang_thai_chua_co_trong_ban_nay');
  });
});
