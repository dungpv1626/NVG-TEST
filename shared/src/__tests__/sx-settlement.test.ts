import { describe, expect, it } from 'vitest';
import { rentalSettlementPreview } from '../sx';

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
