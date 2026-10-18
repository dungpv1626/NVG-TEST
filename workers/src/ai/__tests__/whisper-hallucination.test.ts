import { describe, expect, it } from 'vitest';
import { stripWhisperHallucinations } from '../whisper-hallucination';

describe('Lọc câu Whisper tự bịa', () => {
  it('câu kết video gặp thật 18/10/2026 → rỗng (không nghe rõ)', () => {
    for (const t of [
      'Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn',
      'Hãy subscribe cho kênh La La School Để không bỏ lỡ những video hấp dẫn Hãy subscribe cho kênh La La School Để không bỏ lỡ những video hấp dẫn',
      'Cảm ơn các bạn đã theo dõi.',
    ]) {
      expect(stripWhisperHallucinations(t)).toBe('');
    }
  });

  it('lời thật giữ nguyên; lời thật xen câu bịa thì chỉ bỏ câu bịa', () => {
    const real = 'Khách cần nhà xưởng hai nghìn mét vuông ở khu công nghiệp Phố Nối.';
    expect(stripWhisperHallucinations(real)).toBe(real);
    expect(stripWhisperHallucinations(`${real} Hãy subscribe cho kênh Ghiền Mì Gõ`)).toBe(real);
  });

  it('chữ «đăng ký» trong lời khách vẫn giữ khi không phải câu kêu gọi kênh', () => {
    const t = 'Khách đã đăng ký kinh doanh hộ gia đình tại nhà.';
    expect(stripWhisperHallucinations(t)).toBe(t);
  });
});
