import { describe, expect, it } from 'vitest';
import { finishTime, maskTime } from '../date-time-input';

/** Gõ từng phím như người dùng: mỗi lần nhận chuỗi đã có + một chữ số. */
function type(keys: string): string {
  let value = '';
  for (const k of keys) value = maskTime(value + k);
  return value;
}

describe('Ô giờ — chỉ gõ số, máy chèn dấu «:»', () => {
  it('gõ 1430 ra 14:30 (lỗi thật 20/10/2026: từng ra 01:43)', () => {
    expect(type('1430')).toBe('14:30');
    expect(type('0905')).toBe('09:05');
    expect(type('2359')).toBe('23:59');
  });

  it('chữ số đầu từ 3 trở lên là giờ một chữ số: 930 → 09:30', () => {
    expect(type('930')).toBe('09:30');
    expect(type('745')).toBe('07:45');
  });

  it('rời ô với ba chữ số thì đệm số 0: 130 → 01:30', () => {
    expect(finishTime(type('130'))).toBe('01:30');
    expect(finishTime('14:30')).toBe('14:30');
  });

  it('gõ cả dấu «:» vẫn đúng', () => {
    expect(maskTime('14:30')).toBe('14:30');
  });
});
