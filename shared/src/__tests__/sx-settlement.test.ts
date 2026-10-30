import { describe, expect, it } from 'vitest';
import {
  compensationFromTable,
  parseCompensationTable,
  rentalAgreementDisplayStatus,
  rentalDaysSoFar,
  rentalSettlementPreview,
} from '../sx';

describe('rentalSettlementPreview — bản soi của settle_rental_agreement', () => {
  it('cọc lớn hơn phần còn phải thu: cấn trừ hết phải thu, phần cọc thừa hoàn khách', () => {
    const p = rentalSettlementPreview({
      deposit: 80_000,
      returns: [{ amount: 50_000, signed: true }],
      receivables: [{ direction: 'phai_thu', amount: 50_000, settled: 0 }],
    });
    expect(p).toMatchObject({
      outstanding: 50_000,
      depositOffset: 50_000,
      remainingDue: 0,
      refund: 30_000,
    });
    expect(p.mismatch).toBe(false);
  });

  it('cọc nhỏ hơn: cấn trừ hết cọc, phần còn lại vẫn phải thu', () => {
    const p = rentalSettlementPreview({
      deposit: '20000',
      returns: [
        { amount: '30000', signed: true },
        { amount: '40000', signed: true },
      ],
      receivables: [
        { direction: 'phai_thu', amount: '30000', settled: '30000' },
        { direction: 'phai_thu', amount: '40000', settled: '0' },
      ],
    });
    expect(p).toMatchObject({
      collected: 30_000,
      outstanding: 40_000,
      depositOffset: 20_000,
      remainingDue: 20_000,
      refund: 0,
    });
  });

  it('biên bản chưa ký chưa thành phải thu và được đếm riêng; khoản hoàn cọc không tính vào phải thu', () => {
    const p = rentalSettlementPreview({
      deposit: 0,
      returns: [
        { amount: 10_000, signed: true },
        { amount: 5_000, signed: false },
      ],
      receivables: [
        { direction: 'phai_thu', amount: 10_000, settled: 0 },
        { direction: 'phai_tra', amount: 99_000, settled: 0 },
      ],
    });
    expect(p).toMatchObject({
      billed: 15_000,
      receivable: 10_000,
      unsignedCount: 1,
      mismatch: false,
    });
  });

  it('tổng biên bản đã ký lệch tổng phải thu thì báo lệch', () => {
    const p = rentalSettlementPreview({
      deposit: 0,
      returns: [{ amount: 10_000, signed: true }],
      receivables: [],
    });
    expect(p.mismatch).toBe(true);
  });
});

describe('Số ngày thuê và quá hạn theo NGÀY giờ Việt Nam (chạy thử NVS 30/10/2026)', () => {
  // 30/10/2026 08:00 giờ Việt Nam.
  const now = new Date('2026-10-30T01:00:00Z');
  it('đơn chưa tới ngày bắt đầu: 0 ngày, không phải 1', () => {
    expect(rentalDaysSoFar('2026-11-05', null, now)).toBe(0);
  });
  it('bắt đầu hôm nay là ngày thứ 1; trả thực tế tính cả hai đầu', () => {
    expect(rentalDaysSoFar('2026-10-30', null, now)).toBe(1);
    expect(rentalDaysSoFar('2026-10-01', '2026-10-30', now)).toBe(30);
  });
  it('chính ngày hẹn trả chưa quá hạn, hôm sau mới quá hạn', () => {
    expect(rentalAgreementDisplayStatus('dang_thue', '2026-10-30', now)).not.toBe('overdue');
    expect(rentalAgreementDisplayStatus('dang_thue', '2026-10-29', now)).toBe('overdue');
  });
});

describe('Bồi thường theo bảng giá (compensation_price_table)', () => {
  const table = parseCompensationTable({
    'GIANGIAO-NEM-150': { mat: 450000, hong: 150000 },
    'SAI-DANG': { mat: 'x' },
  });
  it('bỏ dòng sai dạng, không đoán giá', () => {
    expect(Object.keys(table)).toEqual(['GIANGIAO-NEM-150']);
    expect(parseCompensationTable(null)).toEqual({});
  });
  it('hỏng × giá hỏng + mất × giá mất', () => {
    expect(compensationFromTable(table['GIANGIAO-NEM-150'], 5, 2)).toBe(5 * 150000 + 2 * 450000);
  });
  it('mã chưa có trong bảng: null, để người thu hồi nhập tay', () => {
    expect(compensationFromTable(table['KHONG-CO'], 5, 2)).toBeNull();
  });
});
