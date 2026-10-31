/**
 * «Bộ ý tưởng cho khách» B1 + B2 — đầu bài có vừa lô không, sơ đồ công năng từng tầng (`ai/concept-zoning.ts`,
 * `ai/concept-zoning-svg.ts`, `kb/concept_zoning.yaml`). Đầu bài thật đã ghi; KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { AiBriefDigest } from '@nvg/shared/design';
import { conceptZoning } from '../ai/concept-zoning';
import { conceptZoningSvg, ZONING_CAPTION } from '../ai/concept-zoning-svg';
import { planContext } from '../ai/plan';
import { conceptZoningCodes, parseConceptZoning } from '../kb/concept-zoning';
import { parseVocabulary } from '../kb/vocabulary';
import { loadRun, read, realContextInput } from './ai-real-context';

const table = parseConceptZoning(read('kb/concept_zoning.yaml'));

/** Cùng cách tuyến dựng: quy cách theo loại nhà + loại thang (như `preflightContextInput`). */
function zoningOf(digest: AiBriefDigest, labels?: Record<string, string>) {
  const input = realContextInput(digest, {
    stairShape: true,
    houseProfile: true,
    openSetback: true,
  });
  return conceptZoning({
    table,
    knowledge: planContext(input).knowledge,
    construction: input.construction,
    digest,
    labels: labels ?? input.labels,
    ...(input.areaNorms ? { areaNorms: input.areaNorms } : {}),
  });
}

const FONT = "'Be Vietnam Pro', sans-serif";
const AT01 = loadRun('7fe3cf7b').digest; // nhà ống 4 × 15 m, 3 tầng (T189)
const VILLA = loadRun('46d6eff3').digest; // biệt thự 15 × 20 m (9272)
const THU5 = loadRun('4eade9b1').digest; // nhà phố 5 × 18 m, 4 tầng
const AT02 = loadRun('edee9252').digest; // lô góc 6 × 16 m, 4 tầng (30/10/2026)

describe('bảng dải là dữ liệu', () => {
  it('mọi mã loại phòng trong bảng có trong từ điển phòng', () => {
    const codes = new Set(
      parseVocabulary(read('kb/room_vocabulary.yaml')).types.map((t) => t.code),
    );
    expect(conceptZoningCodes(table).filter((code) => !codes.has(code))).toEqual([]);
  });
});

describe('đầu bài có vừa lô không', () => {
  it('AT01 4 × 15 m: tầng 1 không vừa, thiếu ≈ 1,3–1,4 m (T189: 15,35 m trên 14 m)', () => {
    const z = zoningOf(AT01);
    expect(z.verdict).toBe('over');
    const ground = z.floors[0]!;
    expect(ground.verdict).toBe('over');
    expect(ground.haveM).toBe(14);
    expect(ground.shortfallM).toBeGreaterThanOrEqual(1.25);
    expect(ground.shortfallM).toBeLessThanOrEqual(1.45);
    expect(z.shortfallM).toBe(ground.shortfallM);
    expect(z.messages[0]).toMatch(/^Đầu bài chưa vừa lô: tầng 1 .* thiếu khoảng 1,3 m/);
    // Gợi ý tính lại thật: bỏ / dời giếng trời là đủ cho tầng 1.
    expect(z.suggestions.some((s) => /giếng trời/i.test(s) && s.includes('khi đó vừa'))).toBe(true);
    // Thứ tự từ mặt đường vào: để xe đứng hàng đầu, bếp – ăn hàng cuối.
    const labels = ground.rows.map((r) => r.cells.map((c) => c.label).join('|'));
    expect(labels[0]).toContain('Để xe');
    expect(labels[labels.length - 1]).toMatch(/Bếp/);
  });

  it('biệt thự 15 × 20 m (9272): vừa', () => {
    const z = zoningOf(VILLA);
    expect(z.verdict).toBe('fits');
    expect(z.shortfallM).toBe(0);
    expect(z.suggestions).toEqual([]);
  });

  it('THU5 nhà phố 5 × 18 m: vừa hoặc chật, không «không vừa»', () => {
    const z = zoningOf(THU5);
    expect(['fits', 'tight']).toContain(z.verdict);
    expect(z.floors.every((f) => f.verdict !== 'over')).toBe(true);
  });

  it('đột biến: nới lô AT01 thêm 1 m bề ngang thì hết thiếu', () => {
    const wide = { ...AT01, site: { ...AT01.site, width_m: (AT01.site.width_m ?? 0) + 1 } };
    expect(zoningOf(AT01).verdict).toBe('over');
    expect(zoningOf(wide).verdict).not.toBe('over');
  });

  it('đột biến: bỏ giếng trời tầng 1 của AT01 thì tầng 1 vừa', () => {
    const noWell = {
      ...AT01,
      required_spaces: AT01.required_spaces!.filter((s) => s.type !== 'light_well'),
    };
    expect(zoningOf(noWell).floors[0]!.verdict).not.toBe('over');
  });

  it('tầng trên không có phòng dải trước (AT02 tầng 2): phòng ngủ ra mặt tiền, WC không sát mặt đường', () => {
    const z = zoningOf(AT02);
    const upper = z.floors[1]!;
    const front = upper.rows[0]!.cells.map((c) => c.type);
    expect(front).not.toContain('wc');
    expect(front.some((t) => t === 'bedroom' || t === 'study')).toBe(true);
    // Trong dải giữa: hàng có ô thang đứng trước hàng WC.
    const order = upper.rows.map((r) => r.cells.map((c) => c.type));
    const stairRow = order.findIndex((types) => types.includes('stair'));
    const wcRows = order.flatMap((types, i) => (types.includes('wc') ? [i] : []));
    expect(wcRows.every((i) => i > stairRow)).toBe(true);
  });

  it('đột biến: bỏ «promote_when_front_empty» thì WC tầng 2 AT02 quay lại sát mặt đường', () => {
    const plain = parseConceptZoning(
      read('kb/concept_zoning.yaml')
        .replace(/^promote_when_front_empty:.*$/m, 'promote_when_front_empty: []')
        .replace(/^row_lead_types:.*$/m, 'row_lead_types: []'),
    );
    const input = realContextInput(AT02, {
      stairShape: true,
      houseProfile: true,
      openSetback: true,
    });
    const z = conceptZoning({
      table: plain,
      knowledge: planContext(input).knowledge,
      construction: input.construction,
      digest: AT02,
      labels: input.labels,
    });
    expect(z.floors[1]!.rows[0]!.cells.map((c) => c.type)).toContain('wc');
  });

  it('bảng dải đổi thì thứ tự đổi theo — không viết trong mã', () => {
    const flipped = parseConceptZoning(
      read('kb/concept_zoning.yaml')
        .replace(
          'types: [garage, porch, shop, living, master_bedroom, balcony]',
          'types: [porch, shop, master_bedroom, balcony]',
        )
        .replace(
          'types: [kitchen, dining, bedroom, study, altar_room, laundry, terrace, courtyard]',
          'types: [kitchen, dining, bedroom, study, altar_room, laundry, terrace, courtyard, garage, living]',
        ),
    );
    const input = realContextInput(AT01, { stairShape: true, houseProfile: true });
    const z = conceptZoning({
      table: flipped,
      knowledge: planContext(input).knowledge,
      construction: input.construction,
      digest: AT01,
      labels: input.labels,
    });
    const first = z.floors[0]!.rows[0]!.cells.map((c) => c.label);
    expect(first).not.toContain('Để xe');
  });
});

describe('tờ sơ đồ công năng', () => {
  it('có câu chú thích, tên tầng, mặt đường; không in số đo nào', () => {
    const svg = conceptZoningSvg(zoningOf(AT01), table, FONT);
    expect(svg).toContain(ZONING_CAPTION);
    expect(svg).toContain('Tầng 1');
    expect(svg).toContain('Mặt đường');
    expect(svg).toContain('Chưa vừa lô');
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    expect(texts.length).toBeGreaterThan(10);
    for (const t of texts) expect(t).not.toMatch(/\d\s*(m²|m\b|cm|mm)/);
  });

  it('tất định: cùng đầu bài, cùng chuỗi', () => {
    expect(conceptZoningSvg(zoningOf(VILLA), table, FONT)).toBe(
      conceptZoningSvg(zoningOf(VILLA), table, FONT),
    );
  });

  it('thoát ký tự trong tên phòng', () => {
    const input = realContextInput(AT01, { stairShape: true, houseProfile: true });
    const svg = conceptZoningSvg(
      zoningOf(AT01, { ...input.labels, living: '<script>alert(1)</script> & "x"' }),
      table,
      FONT,
    );
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
