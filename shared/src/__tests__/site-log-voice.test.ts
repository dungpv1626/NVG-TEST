import { describe, expect, it } from 'vitest';
import { composeSiteLogContent, normalizeSiteLogDraft } from '../site-log-voice';

describe('nhật ký giọng nói — ghép mục và chuẩn hoá đầu ra máy (2B)', () => {
  it('ghép theo thứ tự cố định, bỏ mục rỗng', () => {
    const draft = normalizeSiteLogDraft({
      safety: 'Bình thường',
      work_done: '- Xong cốp pha tầng 2\n- Buộc thép 70%',
      materials: '  ',
      issues: '- Thiếu dây buộc',
    });
    expect(composeSiteLogContent(draft)).toBe(
      'Việc đã làm:\n- Xong cốp pha tầng 2\n- Buộc thép 70%\nVướng mắc:\n- Thiếu dây buộc\nAn toàn: Bình thường',
    );
  });

  it('mục không được nói tới là rỗng, không bịa; quân số chỉ nhận số nguyên hợp lệ', () => {
    expect(normalizeSiteLogDraft(null)).toEqual({
      work_done: '',
      materials: '',
      issues: '',
      safety: '',
      weather: '',
      workforce_count: null,
    });
    expect(normalizeSiteLogDraft({ workforce_count: 12 }).workforce_count).toBe(12);
    expect(normalizeSiteLogDraft({ workforce_count: '12' }).workforce_count).toBeNull();
    expect(normalizeSiteLogDraft({ workforce_count: 2.5 }).workforce_count).toBeNull();
    expect(normalizeSiteLogDraft({ workforce_count: -1 }).workforce_count).toBeNull();
    expect(composeSiteLogContent(normalizeSiteLogDraft({ weather: 'Nắng' }))).toBe('');
  });
});
