/**
 * Bộ đo chất lượng chương trình không gian — canh không cho tụt hạng.
 *
 * Nguồn: yêu cầu 07/09/2026 của Haan ("biệt thự lớn mà phòng bếp 6 m² nghe rất vô lý").
 *
 * Khác mọi tệp kiểm thử khác của Lớp 2: nó không kiểm một hành vi cụ thể, nó chấm ĐIỂM cho
 * kết quả trên một bộ đầu bài đại diện. Lý do phải có nó: mọi kiểm thử đơn lẻ đều xanh vào
 * đúng ngày engine cho ra bếp 6 m² — không phép kiểm nào nhìn được QUAN HỆ giữa các con số,
 * mà cái vô lý thì nằm ở đó.
 *
 * Mốc đo được trước khi sửa (07/09/2026): 20 lỗi / 7 đầu bài. Sau: 0.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSpaceProgram } from '../program/engine';
import {
  checkPlausibility,
  parsePlausibilityRules,
  PlausibilityError,
} from '../program/plausibility';
import { testNorms, testRulePack } from './program-fixtures';
import { CORPUS } from './program-corpus';
import type { ProgramIntent } from '@nvg/shared/design';

const norms = testNorms();
const rules = testRulePack();
const RULES = parsePlausibilityRules(
  readFileSync(
    fileURLToPath(new URL('../../../../kb/program_plausibility.yaml', import.meta.url)),
    'utf-8',
  ),
);
const REF = `sha256:${'a'.repeat(64)}`;

const run = (brief: (typeof CORPUS)[number]['brief'], intent?: ProgramIntent) =>
  buildSpaceProgram({ brief, briefRef: REF, rules, norms, intent });

/** Ý đồ "cực đoan": mọi loại phòng cùng một bậc. Không mô hình nào nên trả về thế này. */
const uniform = (level: 'generous' | 'modest'): ProgramIntent => ({
  schema_version: '1.0.0',
  emphasis: Object.keys(norms.spaces).map((space_type) => ({ space_type, level })),
  rationale: 'Kiểm thử.',
});

describe('Chương trình không gian phải HỢP LÝ, không chỉ hợp lệ', () => {
  for (const { name, brief } of CORPUS) {
    it(name, () => {
      const { payload } = run(brief);
      const found = checkPlausibility(payload, RULES);
      const errors = found.filter((f) => f.severity === 'error');
      // In ra nguyên văn câu tiếng Việt khi đỏ: người đọc kết quả cần biết CHỖ NÀO vô lý,
      // không phải một con số đếm.
      expect(errors.map((f) => f.message)).toEqual([]);
    });
  }

  it('không đầu bài nào trong bộ sinh ra cảnh báo mức nhẹ', () => {
    const all = CORPUS.flatMap(({ brief }) => checkPlausibility(run(brief).payload, RULES));
    expect(all.map((f) => `${f.severity}: ${f.message}`)).toEqual([]);
  });
});

describe('Diện tích khách khai là TỐI THIỂU (T41)', () => {
  it('khai nhỏ hơn chuẩn nghề thì KHÔNG ghim phòng về con số đó', () => {
    // «Bếp tối thiểu 1 m²» không phải lời khách muốn một cái bếp 1 m². Trước 13/09/2026 con
    // số khách khai đứng thành diện tích cố định, nên bếp bị giữ ở tối thiểu và bước soát phải
    // miễn cho nó. Nay nó chỉ là một cận dưới — thua chuẩn nghề — và bếp nhận phần sàn như mọi
    // phòng khác.
    const { brief } = CORPUS[0]!;
    const withTinyKitchen = {
      ...brief,
      required_spaces: [
        ...(brief.required_spaces ?? []).filter((s) => s.type !== 'kitchen'),
        { type: 'kitchen', area_m2: 1 },
      ],
    } as typeof brief;
    const { payload, warnings } = run(withTinyKitchen);
    const kitchen = payload.spaces.find((s) => s.type === 'kitchen')!;
    expect(kitchen.min_source).not.toBe('brief');
    expect(kitchen.target_area_m2!).toBeGreaterThan(kitchen.min_area_m2);
    expect(warnings.filter((w) => w.startsWith('Bếp chỉ được'))).toEqual([]);
  });

  it('khai lớn hơn chuẩn nghề thì con số của khách thành tối thiểu, và nói ra nguồn', () => {
    const { brief } = CORPUS[0]!;
    const withBigKitchen = {
      ...brief,
      required_spaces: [
        ...(brief.required_spaces ?? []).filter((s) => s.type !== 'kitchen'),
        { type: 'kitchen', area_m2: 16 },
      ],
    } as typeof brief;
    const kitchen = run(withBigKitchen).payload.spaces.find((s) => s.type === 'kitchen')!;
    expect(kitchen.min_area_m2).toBe(16);
    expect(kitchen.min_source).toBe('brief');
    expect(kitchen.target_source).toBe('program');
    expect(kitchen.target_area_m2!).toBeGreaterThanOrEqual(16);
  });
});

describe('Đề xuất của AI không đẩy được chương trình thành vô lý', () => {
  /*
   * Đây là hàng rào quan trọng nhất của Lớp 2a, và nó là lý do đầu ra của mô hình chỉ có BA
   * BẬC chứ không phải một hệ số hay một con số mét vuông.
   *
   * Mô hình ngôn ngữ là thứ không kiểm soát được nội dung trả về: nó có thể "nhiệt tình" gán
   * `generous` cho tất cả, hoặc `modest` cho tất cả, và không có lý do gì để tin nó luôn cân
   * đối. Nên phép kiểm không hỏi "mô hình có trả lời hợp lý không" — nó hỏi
   * **"trả lời thế nào thì kết quả cũng phải hợp lý"**.
   *
   * Ba lớp giữ điều đó: ba bậc rời rạc · hệ số của ba bậc do `kb/space_norms.yaml` quyết ·
   * tối thiểu quy chuẩn và trần nghề kẹp hai đầu.
   */
  for (const level of ['generous', 'modest'] as const) {
    it(`mọi phòng cùng bậc "${level}" vẫn cho ra chương trình hợp lý`, () => {
      const messages = CORPUS.flatMap(({ name, brief }) =>
        checkPlausibility(run(brief, uniform(level)).payload, RULES)
          .filter((f) => f.severity === 'error')
          .map((f) => `${name} — ${f.message}`),
      );
      expect(messages).toEqual([]);
    });
  }

  it('bậc nhấn mạnh đổi TỈ LỆ giữa các phòng, không phá cận dưới và cận trên', () => {
    const { brief } = CORPUS[3]!;
    const plain = run(brief).payload;
    const pushed = run(brief, {
      schema_version: '1.0.0',
      emphasis: [{ space_type: 'kitchen', level: 'generous' }],
      rationale: 'Kiểm thử.',
    }).payload;

    const kitchen = (p: typeof plain) => p.spaces.find((s) => s.type === 'kitchen')!;
    expect(kitchen(pushed).target_area_m2!).toBeGreaterThan(kitchen(plain).target_area_m2!);
    // Nhưng KHÔNG vượt trần nghề, và không kéo phòng khác xuống dưới tối thiểu quy chuẩn.
    for (const s of pushed.spaces) {
      expect(s.target_area_m2!).toBeGreaterThanOrEqual(s.min_area_m2! - 0.05);
    }
    expect(kitchen(pushed).target_area_m2!).toBeLessThanOrEqual(28);
  });

  it('mã phòng ngủ do AI đề xuất KHÔNG làm căn nhà mọc thêm phòng ngủ', () => {
    // Lời gọi thật đầu tiên (07/09/2026) trả về đúng `bedroom` và `master_bedroom` trong
    // `add_spaces`. Hai mã đó luôn suy từ thành phần gia đình; thêm lần nữa là cộng thêm một
    // phòng mà không ai đặt, và không có triệu chứng nào ngoài chương trình phình ra.
    const { brief } = CORPUS[3]!;
    const before = run(brief).payload.spaces.filter((s) => s.type.endsWith('bedroom')).length;
    const after = buildSpaceProgram({
      brief,
      briefRef: REF,
      rules,
      norms,
      extraSpaces: ['bedroom', 'master_bedroom'],
    }).payload.spaces.filter((s) => s.type.endsWith('bedroom')).length;
    expect(after).toBe(before);
  });
});

describe('Bộ đo bắt được đúng cái nó sinh ra để bắt', () => {
  // Không có nhóm này thì một bộ đo hỏng (đọc nhầm trường, so nhầm chiều) vẫn xanh, và cả
  // tệp trên thành một hàng rào không chắn gì.
  const program = (spaces: unknown[], usable: number) =>
    ({
      schema_version: '1.0.0',
      brief_ref: REF,
      spaces,
      adjacency: [],
      floor_allocation: [{ floor: 1, usable_area_m2: usable, allocated_area_m2: usable }],
      reference_projects: [],
      priors_applied: false,
    }) as never;

  const space = (over: Record<string, unknown>) => ({
    id: 'x_1',
    type: 'kitchen',
    floor: 1,
    min_area_m2: 6,
    target_area_m2: 6,
    max_area_m2: 18,
    priority: 2,
    needs_daylight: true,
    needs_facade: false,
    needs_ventilation: true,
    ...over,
  });

  it('bắt được ĐÚNG ca Haan báo: bếp nằm tại tối thiểu trong một căn lớn', () => {
    const found = checkPlausibility(program([space({})], 180), RULES);
    expect(found.map((f) => f.id)).toContain('khong_phong_nao_bi_ep_ve_toi_thieu');
    expect(found.map((f) => f.id)).toContain('bep_tuong_xung_quy_mo');
    // Câu phải đọc được, và phải mang con số — không phải một mã lỗi.
    const message = found.find((f) => f.id === 'bep_tuong_xung_quy_mo')!.message;
    expect(message).toContain('Bếp');
    expect(message).toContain('6');
    expect(message).not.toContain('kitchen');
  });

  it('bắt được phòng ngủ chính nhỏ hơn phòng ngủ thường', () => {
    const found = checkPlausibility(
      program(
        [
          space({ id: 'm_1', type: 'master_bedroom', min_area_m2: 14, target_area_m2: 18 }),
          space({ id: 'b_1', type: 'bedroom', min_area_m2: 9, target_area_m2: 24 }),
        ],
        180,
      ),
      RULES,
    );
    expect(found.map((f) => f.id)).toContain('phong_ngu_chinh_khong_nho_hon_phong_ngu_thuong');
  });

  it('bắt được một mã không gian bị thêm từ hai nguồn', () => {
    const found = checkPlausibility(
      program(
        [space({ id: 'k_1', target_area_m2: 16 }), space({ id: 'k_2', target_area_m2: 16 })],
        180,
      ),
      RULES,
    );
    expect(found.map((f) => f.id)).toContain('khong_trung_lap_khong_gian_don');
  });

  it('bắt được tầng bỏ trống quá nhiều', () => {
    const found = checkPlausibility(
      {
        ...(program([space({ target_area_m2: 16 })], 180) as never as Record<string, unknown>),
        floor_allocation: [{ floor: 1, usable_area_m2: 180, allocated_area_m2: 100 }],
      } as never,
      RULES,
    );
    expect(found.map((f) => f.id)).toContain('tang_khong_bo_trong_qua_nhieu');
  });

  it('mã soát lạ làm hỏng lúc NẠP, không đi qua im lặng', () => {
    // Một phép soát khai sai kiểu mà vẫn nạp được là tệ hơn không có: tệp trông như đang canh.
    expect(() =>
      parsePlausibilityRules(
        'version: "1"\nchecks:\n  - id: x\n    kind: khong_co_that\n    severity: error\n    message: y\n',
      ),
    ).toThrow(PlausibilityError);
  });
});
