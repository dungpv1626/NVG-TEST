import { describe, expect, it } from 'vitest';
import { ERRORS, dashboardGreeting, shortNameFromFullName } from '../content';

/**
 * Lời chào Dashboard là ngoại lệ cá nhân hoá DUY NHẤT của hệ thống (Content Guidelines 4.2),
 * nên nó là chỗ duy nhất được phép gọi tên người dùng — và vì thế phải gọi cho đúng.
 */
describe('shortNameFromFullName', () => {
  it('gọi bằng TỪ CUỐI, không kèm chữ đệm', () => {
    // Đây là lỗi đã có thật: lấy hai từ cuối ra "Thị Hà" — không ai được gọi như vậy.
    expect(shortNameFromFullName('Bùi Thị Hà')).toBe('Hà');
    expect(shortNameFromFullName('Bùi Văn Thi')).toBe('Thi');
    expect(shortNameFromFullName('Nguyễn Văn A')).toBe('A');
  });

  it('họ tên một từ thì giữ nguyên', () => {
    expect(shortNameFromFullName('Phượng')).toBe('Phượng');
  });

  it('khoảng trắng thừa không lọt vào lời chào', () => {
    expect(shortNameFromFullName('  Trần   Thị   B  ')).toBe('B');
  });

  it('thiếu họ tên thì trả rỗng, không ném lỗi và không ra chữ "undefined"', () => {
    expect(shortNameFromFullName(null)).toBe('');
    expect(shortNameFromFullName(undefined)).toBe('');
    expect(shortNameFromFullName('   ')).toBe('');
  });

  it('ghép vào lời chào ra câu đọc được', () => {
    expect(dashboardGreeting(shortNameFromFullName('Bùi Thị Hà'))).toBe(
      'Chào Hà, đây là việc cần làm hôm nay',
    );
  });
});

describe('ERRORS.noModuleAccess', () => {
  it('nói rõ là THIẾU QUYỀN và ai xử lý được, không chỉ "không đủ quyền"', () => {
    const message = ERRORS.noModuleAccess('Kho');
    expect(message).toContain('chưa có quyền');
    expect(message).toContain('Kho');
    // Content Guidelines 4.6: lỗi vượt quyền phải chỉ ra đầu mối xử lý.
    expect(message).toContain('quản trị hệ thống');
  });

  it('không dùng đại từ nhân xưng (Content Guidelines 4.2)', () => {
    expect(ERRORS.noModuleAccess('Kho')).not.toMatch(/\b(bạn|anh|chị)\b/i);
  });
});
