/**
 * Hàm nghiệp vụ thuần của Module HD.
 *
 * Hai hàm dưới đây quyết định con số hiển thị cho Ban Giám đốc và quyết định một phát sinh
 * có được phép làm hay không — nên chúng có test riêng, không dựa vào việc màn hình gọi đúng.
 */

import { describe, expect, it } from 'vitest';
import { canExecuteAmendment, summarizeContractValue } from '../hd';

describe('HD — giá trị hợp đồng và công nợ (HD-03)', () => {
  it('cộng phát sinh đã duyệt vào giá trị gốc', () => {
    const s = summarizeContractValue(900_000_000n, 40_000_000n, 300_000_000n);
    expect(s.currentValue).toBe(940_000_000n);
    expect(s.outstanding).toBe(640_000_000n);
  });

  it('phát sinh giảm trừ khối lượng làm giá trị hợp đồng nhỏ lại', () => {
    const s = summarizeContractValue(900_000_000n, -50_000_000n, 0n);
    expect(s.currentValue).toBe(850_000_000n);
  });

  it('thu thừa KHÔNG thành công nợ âm — đó là việc của Kế toán, không phải công nợ', () => {
    const s = summarizeContractValue(100_000_000n, 0n, 120_000_000n);
    expect(s.outstanding).toBe(0n);
    expect(s.collected).toBe(120_000_000n);
  });

  it('coi rỗng là 0 để màn hình không phải tự đoán', () => {
    const s = summarizeContractValue(null, null, null);
    expect(s.currentValue).toBe(0n);
    expect(s.outstanding).toBe(0n);
  });

  it('nhận chuỗi từ PostgREST và không mất chính xác ở hợp đồng vài trăm tỷ', () => {
    // 500 tỷ đồng đã vượt Number.MAX_SAFE_INTEGER khi cộng bằng `number`.
    const s = summarizeContractValue('500000000000', '1', '0');
    expect(s.currentValue).toBe(500_000_000_001n);
    expect(String(s.currentValue)).toBe('500000000001');
  });
});

describe('HD — điều kiện thực hiện phát sinh (HD-04)', () => {
  const base = {
    stage: 'da_duyet' as const,
    customerConfirmedAt: '2026-09-01T00:00:00Z',
    isEmergency: false,
    emergencyAuthorizedBy: null,
  };

  it('đã duyệt VÀ khách xác nhận thì làm được', () => {
    expect(canExecuteAmendment(base)).toBe(true);
  });

  it('duyệt rồi nhưng khách chưa xác nhận thì KHÔNG — đây là chỗ hay gây tranh chấp', () => {
    expect(canExecuteAmendment({ ...base, customerConfirmedAt: null })).toBe(false);
  });

  it('khách xác nhận rồi nhưng chưa duyệt nội bộ thì cũng KHÔNG', () => {
    expect(canExecuteAmendment({ ...base, stage: 'de_xuat' })).toBe(false);
  });

  it('khẩn cấp CÓ người cho phép thì bỏ qua được xác nhận của khách', () => {
    expect(
      canExecuteAmendment({
        stage: 'de_xuat',
        customerConfirmedAt: null,
        isEmergency: true,
        emergencyAuthorizedBy: 'user-id',
      }),
    ).toBe(true);
  });

  it('khẩn cấp mà KHÔNG ghi người cho phép thì không — đó là lỗ hổng HD-04 viết ra để bịt', () => {
    expect(
      canExecuteAmendment({
        stage: 'de_xuat',
        customerConfirmedAt: null,
        isEmergency: true,
        emergencyAuthorizedBy: null,
      }),
    ).toBe(false);
  });
});
