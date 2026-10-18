import { describe, expect, it } from 'vitest';
import { filledSiteDetails, SURVEY_SITE_FORMS, surveySiteForm } from '../survey-forms';

describe('Phiếu khảo sát riêng từng pháp nhân (0181)', () => {
  it('ba pháp nhân giao dịch đều có phiếu; mã tổng hợp NVG thì không', () => {
    for (const code of ['NVC', 'NVO', 'NVS']) expect(surveySiteForm(code)).not.toBeNull();
    expect(surveySiteForm('NVG')).toBeNull();
    expect(surveySiteForm(null)).toBeNull();
  });

  it('khoá trong một phiếu không trùng nhau — trùng là hai ô ghi đè cùng một giá trị', () => {
    for (const form of Object.values(SURVEY_SITE_FORMS)) {
      const keys = form.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('chỉ trả ô đã điền, theo thứ tự phiếu; ô phiếu đã bỏ vẫn hiện (nhãn = khoá) ở cuối', () => {
    const out = filledSiteDetails('NVC', {
      ghi_chu_cu: 'Dữ liệu của ô đã bỏ',
      crane: ' Cầu trục 10 tấn ',
      area: '',
      frame: 'Khẩu độ 30 m',
    });
    expect(out.map((d) => d.key)).toEqual(['frame', 'crane', 'ghi_chu_cu']);
    expect(out[1]).toMatchObject({ label: 'Cầu trục', value: 'Cầu trục 10 tấn' });
    expect(out[2]!.label).toBe('ghi_chu_cu');
  });
});
