import { describe, expect, it } from 'vitest';
import { suggestContractTerms } from '../hd-term-suggest';

const quote = {
  code: 'NVC-BG-2026-1088-V2',
  version: 2,
  total_value: '2920000000',
  discount_amount: '50000000',
  discount_reason: 'Khách hàng cũ',
  notes: 'Thi công nhà xưởng 1.200 m²',
  sent_to_customer_at: '2026-10-21T08:07:00Z',
};
const survey = {
  surveyed_at: '2026-10-20T03:00:00Z',
  needs: 'Mở rộng xưởng',
  schedule_note: 'Xong trước Tết',
};

describe('suggestContractTerms', () => {
  it('giá trị lấy đúng số của báo giá, nhắc giảm giá ở ghi chú', () => {
    const { gia_tri } = suggestContractTerms(quote, null);
    expect(gia_tri?.amount).toBe('2920000000');
    expect(gia_tri?.description).toContain('NVC-BG-2026-1088-V2');
    expect(gia_tri?.notes).toContain('Khách hàng cũ');
  });

  it('phạm vi ghép ghi chú báo giá và yêu cầu khảo sát', () => {
    const { pham_vi } = suggestContractTerms(quote, survey);
    expect(pham_vi?.description).toContain('1.200 m²');
    expect(pham_vi?.description).toContain('Mở rộng xưởng');
    expect(pham_vi?.notes).toContain('Xong trước Tết');
  });

  it('không có nguồn thì không bịa gợi ý', () => {
    expect(suggestContractTerms(null, null)).toEqual({ pham_vi: null, gia_tri: null });
    const empty = suggestContractTerms({ ...quote, notes: null, total_value: null }, null);
    expect(empty).toEqual({ pham_vi: null, gia_tri: null });
  });

  it('không gợi ý tiến độ thanh toán', () => {
    expect(Object.keys(suggestContractTerms(quote, survey))).not.toContain('tien_do_thanh_toan');
  });
});
