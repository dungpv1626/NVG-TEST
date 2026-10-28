/**
 * Điền sẵn đầu bài: đề xuất của mô hình chỉ qua được khi đúng câu, đúng mã lựa chọn, đúng khoảng số — và được
 * đổi sang đúng kiểu lưu. Đề xuất sai bị loại kèm lý do, không sửa đoán.
 */

import { describe, expect, it } from 'vitest';
import { BRIEF_FORM } from '../brief-form-data';
import { normalizePrefill, prefillConflicts, prefillQuestions } from '../brief-prefill';

const s = (path: string, value: string) => ({ path, value, quote: 'câu gốc' });

describe('brief-prefill', () => {
  it('danh mục câu chỉ gồm ô đơn — không bảng gia đình, không đa giác, không ô chữ cũ', () => {
    const paths = prefillQuestions(BRIEF_FORM).map((q) => q.path);
    expect(paths).toContain('site.width_m');
    expect(paths).toContain('building_type');
    expect(paths).not.toContain('family');
    expect(paths).not.toContain('site.boundary_m');
    expect(paths.some((p) => p.startsWith('legacy.'))).toBe(false);
  });

  it('đổi kiểu theo ô: mã chọn, chọn nhiều, có / không, số theo value_scale', () => {
    const { accepted, rejected } = normalizePrefill(BRIEF_FORM, [
      s('building_type', 'nha_pho'),
      s('site.harsh_sun_sides', 'front, back'),
      s('site.legal_docs_available', 'true'),
      s('site.width_m', '5,5'),
      s('site.max_density', '80'),
    ]);
    expect(rejected).toEqual([]);
    const by = Object.fromEntries(accepted.map((a) => [a.path, a]));
    expect(by['building_type']!.value).toBe('nha_pho');
    expect(by['building_type']!.display).toBe('Nhà phố');
    expect(by['site.harsh_sun_sides']!.value).toEqual(['front', 'back']);
    expect(by['site.legal_docs_available']!.value).toBe(true);
    expect(by['site.width_m']!.value).toBe(5.5);
    // Biểu mẫu hỏi %, đầu bài lưu tỉ lệ.
    expect(by['site.max_density']!.value).toBe(0.8);
  });

  it('loại câu lạ, mã lạ, số ngoài khoảng, chữ không phải số, câu trùng, ô bảng', () => {
    const { accepted, rejected } = normalizePrefill(BRIEF_FORM, [
      s('khong_co_cau_nay', 'x'),
      s('building_type', 'chung_cu'),
      s('floors', '40'),
      s('site.width_m', 'khoảng 5'),
      s('style', 'hien_dai'),
      s('style', 'toi_gian'),
      s('family', 'ong ba'),
    ]);
    expect(accepted.map((a) => a.path)).toEqual(['style']);
    expect(rejected.map((r) => r.path)).toEqual([
      'khong_co_cau_nay',
      'building_type',
      'floors',
      'site.width_m',
      'style',
      'family',
    ]);
  });

  it('gọt mảnh JSON lọt vào giá trị («: 3,»), loại chỗ đã lược và ô tên người (test case thật 27/10/2026)', () => {
    const { accepted, rejected } = normalizePrefill(BRIEF_FORM, [
      s('floors', ': 3,'),
      s('site.max_density', ': 85,'),
      s('lifestyle.reduced_mobility', ': true,'),
      s('decision_maker.name', 'anh [đã lược]'),
      s('household.taboos', 'Không đặt bếp đối diện [đã lược]'),
    ]);
    expect(accepted.map((a) => [a.path, a.value])).toEqual([
      ['floors', 3],
      ['site.max_density', 0.85],
      ['lifestyle.reduced_mobility', true],
    ]);
    expect(rejected.map((r) => r.path)).toEqual(['decision_maker.name', 'household.taboos']);
    expect(prefillQuestions(BRIEF_FORM).map((q) => q.path)).not.toContain('decision_maker.name');
  });

  it('câu đã có câu trả lời là xung đột — giao diện không chọn sẵn', () => {
    const { accepted } = normalizePrefill(BRIEF_FORM, [s('style', 'hien_dai'), s('floors', '3')]);
    expect([...prefillConflicts({ style: 'tan_co_dien' }, accepted)]).toEqual(['style']);
  });
});
