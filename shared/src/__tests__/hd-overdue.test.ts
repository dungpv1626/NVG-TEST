import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractDisplayStatus } from '../hd';

describe('contractDisplayStatus — quá hạn theo ngày, không theo giờ', () => {
  afterEach(() => vi.useRealTimers());

  it('chính ngày hạn (08:00 giờ Việt Nam) chưa quá hạn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T01:00:00Z'));
    expect(contractDisplayStatus('da_duyet', '2026-10-22')).not.toBe('overdue');
  });

  it('qua ngày hạn thì quá hạn; hợp đồng đã kết thúc thì không', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T01:00:00Z'));
    expect(contractDisplayStatus('da_duyet', '2026-10-22')).toBe('overdue');
    expect(contractDisplayStatus('hoan_thanh', '2026-10-22')).not.toBe('overdue');
  });
});
