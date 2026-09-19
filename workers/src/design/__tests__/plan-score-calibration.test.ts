/**
 * HIỆU CHUẨN thước chấm trên hai hồ sơ THẬT của NVG — phép nghiệm thu mạnh nhất có được.
 *
 * P1 (nhà vườn 2 tầng, 03/2026) và P2 (liền kề 5 tầng, 08/2026) là hai mặt bằng **đã xây, đã
 * duyệt**. Một cái thước chấm chúng thấp là cái thước sai, không phải hai ngôi nhà sai. Và mọi chỗ
 * bị trừ phải giải thích được bằng MỘT DÒNG trong `phong_do_duoc.csv` — nếu không thì đó là thước
 * đang đo cái gì khác.
 *
 * ── Vì sao tệp này đo NGƯỠNG, không đo phép đo hình học ──────────────────────────────
 *
 * `phong_do_duoc.csv` có kích thước và diện tích đo được, nhưng KHÔNG có toạ độ. Dựng lại toạ độ
 * cho P1 và P2 để chạy qua `plan-score.ts` thì thứ được hiệu chuẩn là BỐ CỤC TÔI ĐOÁN, không phải
 * bố cục NVO đã vẽ — và ba trong bốn tiêu chí tôi tự nghĩ ra đã bị chính bộ đo này phủ định, nên
 * đoán thêm là đúng cái lỗi vừa học. Vì vậy:
 *
 *   · tệp này đưa GIÁ TRỊ ĐO THẬT vào `scoreOf()` và kiểm ngưỡng của `kb/plan_quality.yaml`;
 *   · `plan-score.test.ts` kiểm phép đo hình học trên hai fixture viết tay, nơi toạ độ là của tôi
 *     nên kiểm được từng con số.
 *
 * Hai tệp, hai câu hỏi, không tệp nào trả lời hộ tệp kia.
 *
 * ── Chỗ KHÔNG hiệu chuẩn được từ tệp CSV, nói thẳng ra ──────────────────────────────
 *
 * A1 (lệch diện tích so yêu cầu) — hồ sơ đã xây không còn giữ bản yêu cầu gốc của khách; chỉ NVO
 * trả lời được. A2 — cổng dữ liệu đã bảo đảm. C1 và C3 (đường đi) cần cấu trúc đồ thị mà CSV không
 * mang; ghi chú của CSV gợi ý cả hai đều đạt, nhưng gợi ý không phải phép đo. E4 cần hộp kỹ thuật
 * khai thành phòng, còn trên hồ sơ thật nó là một hộp 0,2 × 0,9 m VẼ TRONG khu vệ sinh.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { criterionFor, parsePlanQuality, type CriterionSpec } from '../ai/plan-quality';
import { scoreOf } from '../ai/plan-score';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const quality = parsePlanQuality(read('../../../../kb/plan_quality.yaml'));
const groups = roomGroups(parseVocabulary(read('../../../../kb/room_vocabulary.yaml')));

/**
 * Gói quy tắc bộ chấm đọc: kinh nghiệm + đo được, KHÔNG phụ thuộc ô tích của kỹ sư.
 *
 * Dựng từ chính hai tệp trên đĩa thay vì viết ngưỡng vào đây: nếu ai đó chỉnh
 * `room_min_dimension_wc` thì phép thử này phải đổi kết quả theo, vì đó đúng là câu nó đang hỏi.
 */
const rules = new RulePack(
  [
    ...parseRuleFile(read('../../../../rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('../../../../rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);

const spec = (code: string, buildingType: string): CriterionSpec => {
  const found = quality.criteria.find((entry) => entry.code === code);
  if (!found) throw new Error(`Thước chấm không có tiêu chí ${code}`);
  return criterionFor(found, buildingType);
};

/**
 * Một phòng ĐO ĐƯỢC trên hồ sơ thật — mỗi dòng là một dòng của `phong_do_duoc.csv`.
 *
 * `short`/`long` là cạnh ngắn và cạnh dài lọt lòng, mét. `area` là diện tích ĐO, m² (không phải
 * diện tích ghi trên nhãn bản vẽ — 2 trong 17 phòng tường kín có nhãn lệch tới 30%, và chính đó là
 * lỗi gõ tay mà cổng G5 đi kèm). `daylight` là cột `mat_thoang_truc_tiep`.
 */
interface Measured {
  id: string;
  type: string;
  level: number;
  short: number;
  long: number | null;
  area: number;
  daylight?: boolean;
  /** Mã phòng khác mà chính chữ nhật này phục vụ — cột `merged_functions`. */
  also?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 — nhà vườn 2 tầng, NVO 03/2026
// ─────────────────────────────────────────────────────────────────────────────

const P1: Measured[] = [
  {
    id: 'kitchen_1',
    type: 'kitchen',
    level: 1,
    short: 3.585,
    long: 4.28,
    area: 15.3,
    daylight: true,
    also: ['dining_1'],
  },
  { id: 'wc_1', type: 'wc', level: 1, short: 1.4, long: 2.92, area: 4.1, daylight: true },
  {
    id: 'bedroom_1',
    type: 'bedroom',
    level: 1,
    short: 2.48,
    long: 4.28,
    area: 10.6,
    daylight: true,
  },
  { id: 'living_1', type: 'living', level: 1, short: 3.58, long: 4.39, area: 15.7, daylight: true },
  { id: 'hoc_dem_1', type: 'circulation', level: 1, short: 1.25, long: 1.5, area: 1.9 },
  { id: 'stair_1', type: 'stair', level: 1, short: 2.72, long: 3.58, area: 9.7, also: ['hall_1'] },
  { id: 'porch_1', type: 'porch', level: 1, short: 1.8, long: 3.58, area: 6.4 },
  { id: 'porch_2', type: 'porch', level: 1, short: 1.2, long: 3.87, area: 4.6 },
  {
    id: 'bedroom_3a',
    type: 'bedroom',
    level: 2,
    short: 2.39,
    long: 4.39,
    area: 10.5,
    daylight: true,
  },
  { id: 'wc_2', type: 'wc', level: 2, short: 1.4, long: 2.91, area: 4.1, daylight: true },
  {
    id: 'master_2',
    type: 'master_bedroom',
    level: 2,
    short: 3.66,
    long: 4.28,
    area: 15.7,
    daylight: true,
  },
  {
    id: 'bedroom_4',
    type: 'bedroom',
    level: 2,
    short: 2.39,
    long: 4.39,
    area: 10.5,
    daylight: true,
  },
  {
    id: 'altar_2',
    type: 'altar_room',
    level: 2,
    short: 2.39,
    long: 2.97,
    area: 7.1,
    daylight: true,
  },
  { id: 'hall_2', type: 'circulation', level: 2, short: 1.24, long: null, area: 8.2 },
  { id: 'stair_2', type: 'stair', level: 2, short: 2.45, long: 2.5, area: 6.1 },
  { id: 'balcony_r', type: 'balcony', level: 2, short: 1.03, long: 5.0, area: 5.2, daylight: true },
  {
    id: 'balcony_m',
    type: 'balcony',
    level: 2,
    short: 1.03,
    long: 3.87,
    area: 5.6,
    daylight: true,
  },
  { id: 'light_well', type: 'light_well', level: 3, short: 0.55, long: 1.55, area: 1.0 },
];

/** 21 bậc, chiều cao bậc ≈ 171 mm (ghi chú dòng «ô thang + sảnh» của P1). */
const P1_RISER_M = 0.171;

// ─────────────────────────────────────────────────────────────────────────────
// P2 — liền kề 5 tầng + tum, NVO 08/2026
// ─────────────────────────────────────────────────────────────────────────────

const P2: Measured[] = [
  { id: 'shop_1', type: 'shop', level: 1, short: 4.78, long: 10.64, area: 50.9, daylight: true },
  { id: 'wc_11', type: 'wc', level: 1, short: 1.13, long: 2.77, area: 3.1 },
  { id: 'kho_1', type: 'storage', level: 1, short: 0.86, long: 2.6, area: 2.2 },
  {
    id: 'hall_1',
    type: 'circulation',
    level: 1,
    short: 1.92,
    long: 3.7,
    area: 7.1,
    daylight: true,
  },
  { id: 'core_1', type: 'core', level: 1, short: 2.0, long: 3.47, area: 6.9 },
  { id: 'shop_2', type: 'shop', level: 2, short: 4.78, long: 10.64, area: 50.9, daylight: true },
  {
    id: 'hall_2',
    type: 'circulation',
    level: 2,
    short: 1.92,
    long: 3.6,
    area: 6.9,
    daylight: true,
  },
  { id: 'balcony_2l', type: 'balcony', level: 2, short: 1.08, long: 5.0, area: 6, daylight: true },
  { id: 'balcony_2r', type: 'balcony', level: 2, short: 1.06, long: 4.6, area: 6, daylight: true },
  { id: 'wc_32', type: 'wc', level: 3, short: 1.3, long: 2.39, area: 3.1 },
  { id: 'vanity_3', type: 'vanity', level: 3, short: 1.05, long: 1.3, area: 1.4 },
  {
    id: 'bedroom_33',
    type: 'bedroom',
    level: 3,
    short: 2.57,
    long: 3.55,
    area: 9.1,
    daylight: false,
  },
  {
    id: 'bedroom_32',
    type: 'bedroom',
    level: 3,
    short: 2.71,
    long: 3.57,
    area: 9.7,
    daylight: false,
  },
  {
    id: 'master_31',
    type: 'master_bedroom',
    level: 3,
    short: 3.12,
    long: 4.82,
    area: 15.0,
    daylight: true,
  },
  { id: 'wc_31', type: 'wc', level: 3, short: 1.54, long: 2.95, area: 4.5 },
  { id: 'hall_3', type: 'circulation', level: 3, short: 1.1, long: 7.0, area: 7.7 },
  { id: 'landing_3', type: 'circulation', level: 3, short: 1.94, long: 3.6, area: 7.0 },
  { id: 'core_3', type: 'core', level: 3, short: 2.84, long: 3.47, area: 9.9 },
  { id: 'balcony_3l', type: 'balcony', level: 3, short: 1.08, long: 5.0, area: 6, daylight: true },
  { id: 'balcony_3r', type: 'balcony', level: 3, short: 1.06, long: 4.6, area: 6, daylight: true },
  { id: 'wc_51', type: 'wc', level: 5, short: 1.3, long: 2.78, area: 3.6 },
  {
    id: 'kitchen_5',
    type: 'kitchen',
    level: 5,
    short: 4.49,
    long: 4.78,
    area: 21.5,
    also: ['dining_5'],
  },
  {
    id: 'living_5',
    type: 'living',
    level: 5,
    short: 4.6,
    long: 4.78,
    area: 22.0,
    daylight: true,
    also: ['altar_5'],
  },
  { id: 'landing_5', type: 'circulation', level: 5, short: 1.92, long: 5.2, area: 10.0 },
  { id: 'balcony_5l', type: 'balcony', level: 5, short: 1.08, long: 5.0, area: 6, daylight: true },
  {
    id: 'balcony_5r',
    type: 'balcony',
    level: 5,
    short: 1.77,
    long: 4.6,
    area: 8.1,
    daylight: true,
  },
  { id: 'technical_6', type: 'technical', level: 6, short: 1.75, long: 1.9, area: 3.3 },
];

/** Mặt bậc ≈ 258 mm, chiều cao bậc ≈ 156 mm (ghi chú dòng lõi thang của P2 tầng 3). */
const P2_RISER_M = 0.156;

// ─────────────────────────────────────────────────────────────────────────────
// Phép đo lại đúng công thức của từng tiêu chí, trên số ĐO THẬT
// ─────────────────────────────────────────────────────────────────────────────

const inGroup = (group: string, type: string): boolean => (groups[group] ?? []).includes(type);

/** B1 — số phòng có cạnh ngắn dưới ngưỡng của mã phòng. Ngưỡng đọc từ `rules/`. */
function b1(rooms: Measured[], buildingType: string): Measured[] {
  return rooms.filter((room) => {
    const limit = rules.minDimension(buildingType, room.type);
    return limit !== null && room.short + 0.05 < limit;
  });
}

/** B2 — số phòng vượt tỷ lệ dài/rộng tối đa của mã phòng. */
function b2(rooms: Measured[], buildingType: string): Measured[] {
  return rooms.filter((room) => {
    const limit = rules.aspectRatioMax(buildingType, room.type);
    if (limit === null || room.long === null) return false;
    return room.long / room.short > limit + 0.05;
  });
}

/** C2 — giao thông trên sàn LỌT LÒNG: phòng ngoài trời không vào tử số lẫn mẫu số. */
function c2(rooms: Measured[]): number {
  const indoor = rooms.filter((room) => !inGroup('outdoor', room.type));
  const floor = indoor.reduce((sum, room) => sum + room.area, 0);
  const moving = indoor
    .filter((room) => inGroup('circulation', room.type))
    .reduce((sum, room) => sum + room.area, 0);
  return moving / floor;
}

/** C4 — bề rộng lọt lòng nhỏ nhất của hành lang và sảnh tầng. */
function c4(rooms: Measured[]): number {
  return Math.min(...rooms.filter((room) => room.type === 'circulation').map((room) => room.short));
}

/** A4 — tỷ lệ tầng có phòng ngủ mà có khu vệ sinh. */
function a4(rooms: Measured[]): number {
  const levels = [...new Set(rooms.filter((r) => inGroup('sleeping', r.type)).map((r) => r.level))];
  const withWc = levels.filter((level) =>
    rooms.some((room) => room.level === level && room.type === 'wc'),
  );
  return withWc.length / levels.length;
}

/** D1 — tỷ lệ phòng cần mặt thoáng mà CÓ mặt thoáng, theo tập phòng của loại hình. */
function d1(rooms: Measured[], spec: CriterionSpec): number {
  const wanted =
    spec.rooms === 'living_and_master'
      ? rooms.filter((room) => room.type === 'living' || room.type === 'master_bedroom')
      : rooms.filter((room) => inGroup('habitable', room.type));
  return wanted.filter((room) => room.daylight === true).length / wanted.length;
}

describe('P1 — nhà vườn đã xây, đã duyệt: thước phải chấm cao', () => {
  const type = 'nha_vuon';

  it('B1 và B2 — không phòng nào dưới ngưỡng kích thước hay vượt tỷ lệ', () => {
    expect(b1(P1, type).map((room) => room.id)).toEqual([]);
    expect(b2(P1, type).map((room) => room.id)).toEqual([]);
    expect(scoreOf(spec('B1', type), 0)).toBe(1);
    expect(scoreOf(spec('B2', type), 0)).toBe(1);
  });

  it('C2 — tỷ lệ giao thông 0,217 nằm trong khoảng của nhà vườn (0,18–0,25)', () => {
    const value = c2(P1);
    expect(value).toBeCloseTo(0.2167, 3);
    expect(scoreOf(spec('C2', type), value)).toBe(1);
    // Khoảng của nhà vườn CHẶT hơn khoảng chung (0,18–0,36). Thiếu phép ghi đè theo loại hình thì
    // con số này vẫn đạt, nhưng một nhà vườn 0,30 cũng đạt — mà bộ đo nói nhà vườn không như vậy.
    expect(spec('C2', 'nha_pho').high).toBe(0.36);
    expect(spec('C2', type).high).toBe(0.25);
  });

  it('C4 — hành lang hẹp nhất 1,24 m, trên ngưỡng 1,1', () => {
    expect(c4(P1)).toBeCloseTo(1.24, 2);
    expect(scoreOf(spec('C4', type), 1.24)).toBe(1);
  });

  it('A4 — cả hai tầng có phòng ngủ đều có khu vệ sinh', () => {
    expect(a4(P1)).toBe(1);
    expect(scoreOf(spec('A4', type), 1)).toBe(1);
  });

  it('D1 — mọi phòng ở đều có mặt thoáng trực tiếp', () => {
    const value = d1(P1, spec('D1', type));
    expect(value).toBe(1);
    expect(scoreOf(spec('D1', type), value)).toBe(1);
  });

  it('B4 — chiều cao bậc 171 mm nằm trong khoảng xây được', () => {
    expect(scoreOf(spec('B4', type), P1_RISER_M)).toBe(1);
  });

  it('E2 — khu vệ sinh tầng 2 lệch 1,2 m so tầng dưới, dưới ngưỡng 1,5 m', () => {
    // Ghi chú nguyên văn dòng «WC 2» của P1: «lệch WC1 ≈1.2 m theo phương đứng».
    expect(1.2).toBeLessThanOrEqual(spec('E2', type).params.khoang_cach_m!);
    expect(scoreOf(spec('E2', type), 1)).toBe(1);
  });
});

describe('P2 — liền kề đã xây, đã duyệt: một chỗ bị trừ, và nó giải thích được', () => {
  const type = 'nha_pho';

  it('B1 và B2 — ĐÚNG MỘT phòng bị trừ, cùng một khu vệ sinh hình thang', () => {
    // Dòng CSV: `P2,KT/01,nha_pho,1,WC 1.1,wc,,1.13,2.77,3.1,3.1,-1.0,tuong,khong_ro,hình thang
    // 1.02–1.24`. Phương án đã nói trước chỗ này (5.2b): «chấp nhận WC hình thang P2 KHÔNG đạt —
    // đó là kết luận thật, không phải lỗi của thước». Phép thử ghim nó lại để sau này không ai nới
    // ngưỡng cho nó qua mà không thấy.
    expect(b1(P2, type).map((room) => room.id)).toEqual(['wc_11']);
    expect(b2(P2, type).map((room) => room.id)).toEqual(['wc_11']);
    // Một phòng vi phạm trên thang 0 → 2 là NỬA điểm, không phải trừ hết.
    expect(scoreOf(spec('B1', type), 1)).toBe(0.5);
    expect(scoreOf(spec('B2', type), 1)).toBe(0.5);
  });

  it('không phòng nào KHÁC bị trừ — kể cả kho 0,86 m và hốc lavabo 1,05 m', () => {
    // Hai con số này là lý do hai việc của Đợt A′ tồn tại: hạ ngưỡng kho 1,0 → 0,85 theo số đo, và
    // thêm mã `vanity` để quy tắc `circulation ≥ 1,1 m` không bắt oan hốc lavabo.
    const flagged = new Set(b1(P2, type).map((room) => room.id));
    expect(flagged.has('kho_1')).toBe(false);
    expect(flagged.has('vanity_3')).toBe(false);
    expect(rules.minDimension(type, 'storage')).toBe(0.85);
    expect(rules.minDimension(type, 'vanity')).toBeNull();
  });

  it('C2 — tỷ lệ giao thông 0,217 nằm trong khoảng của nhà phố (0,18–0,36)', () => {
    const value = c2(P2);
    expect(value).toBeCloseTo(0.217, 3);
    expect(scoreOf(spec('C2', type), value)).toBe(1);
  });

  it('C4 — hành lang hẹp nhất đúng 1,10 m, vừa đủ ngưỡng', () => {
    expect(c4(P2)).toBeCloseTo(1.1, 2);
    expect(scoreOf(spec('C4', type), 1.1)).toBe(1);
  });

  it('A4 — tầng duy nhất có phòng ngủ thì có hai khu vệ sinh', () => {
    expect(a4(P2)).toBe(1);
  });

  it('D1 — phòng khách và phòng ngủ chính đều có mặt thoáng, dù hai phòng ngủ phụ thì không', () => {
    // Đây là phép hiệu chuẩn QUAN TRỌNG NHẤT của nhóm D, và là lý do quy tắc QCVN kiểu bao trùm bị
    // gỡ ở Đợt A′: `bedroom_requires_daylight` áp cho MỌI phòng ngủ sẽ bắt 2 trên 7 phòng ngủ thật
    // của hồ sơ này — một công trình đã xây và đã được duyệt.
    const direct = P2.filter((room) => inGroup('sleeping', room.type) && room.daylight === true);
    const indirect = P2.filter((room) => inGroup('sleeping', room.type) && room.daylight === false);
    expect(indirect.map((room) => room.id)).toEqual(['bedroom_33', 'bedroom_32']);
    expect(direct.length).toBeGreaterThan(0);

    const value = d1(P2, spec('D1', type));
    expect(value).toBe(1);
    expect(scoreOf(spec('D1', type), value)).toBe(1);

    // Và nếu đem ngưỡng của nhà vườn (mọi phòng ở) áp cho nhà phố thì nó TRỪ ĐIỂM oan — phép thử
    // ghim chiều này lại, vì đó là chỗ dễ «dọn cho gọn» nhất.
    const wrong = d1(P2, spec('D1', 'nha_vuon'));
    expect(wrong).toBeLessThan(1);
    expect(scoreOf(spec('D1', 'nha_vuon'), wrong)).toBeLessThan(1);
  });

  it('B4 — chiều cao bậc 156 mm nằm trong khoảng xây được', () => {
    expect(scoreOf(spec('B4', type), P2_RISER_M)).toBe(1);
  });
});

describe('chỗ KHÔNG hiệu chuẩn được từ hồ sơ, và thước phải NÓI RA', () => {
  it('A1 mang `n: 0` — ngưỡng hoàn toàn là suy luận', () => {
    // Hồ sơ đã xây không còn giữ bản yêu cầu gốc của khách, nên không có gì để so. Đây là 1 trong
    // 3 tiêu chí chấm được của nhóm A, tức ≈8,3 điểm dựa trên ngưỡng chưa ai đo (T31).
    expect(spec('A1', 'nha_pho').n).toBe(0);
    expect(spec('A1', 'nha_pho').label).toContain('CHUNG');
  });

  it('A2 do CỔNG bảo đảm nên không tính điểm', () => {
    expect(spec('A2', 'nha_pho').enforcedByGate).toBe('room_wrong_level');
  });

  it('vế `2h + b` của B4 chưa đo được, và tệp thước nói rõ vì sao', () => {
    // Hợp đồng mặt bằng không mang mặt bậc. Bộ đo cho hai giá trị thật (P1 ≈ 0,607 · P2 ≈ 0,57)
    // nhưng suy mặt bậc từ chữ nhật ô thang là ba tầng phỏng đoán chồng lên nhau.
    const yaml = read('../../../../kb/plan_quality.yaml');
    expect(yaml).toContain('2h + b');
    expect(yaml).toContain('Chưa đủ dữ liệu');
  });

  it('bốn tiêu chí đã bỏ vẫn nằm trong tệp kèm lý do — để không ai dựng lại', () => {
    expect(quality.boKhoi.map((entry) => entry.code).sort()).toEqual(['B3', 'D2', 'E1', 'E3']);
    for (const entry of quality.boKhoi) expect(entry.lyDo.length).toBeGreaterThan(20);
  });

  it('n của mọi tiêu chí [ĐO] không vượt quá số mẫu thật sự có (6 mặt bằng)', () => {
    // CLAUDE.md 8.8 điểm 7 đòi n ≥ 15 cho «định mức và phân bố». Bộ đo này có n tối đa 6, nên mọi
    // ngưỡng là CHỈ DẤU — và phép thử này chặn đường ai đó ghi một con số n to hơn sự thật.
    for (const criterion of quality.criteria) {
      expect(criterion.n, criterion.code).toBeLessThanOrEqual(6);
    }
  });
});
