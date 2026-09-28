/**
 * Luật bố trí BẮT BUỘC của Haan (T71, 23/09/2026) — `rules/nvg-mandatory.yaml`, `ai/mandatory.ts`.
 *
 * Nguyên văn yêu cầu: «Bếp không được nằm dưới nhà vệ sinh → bắt buộc» · «Phòng thờ ko nằm dưới nhà
 * vệ sinh, ko đối diện hoặc giáp nhà vệ sinh» (Haan chọn: cả ba chặn) · «Ban công phải thoáng: cạnh
 * dài hướng ra mặt ngoài đồng thời là mặt thoáng» · WC «không bắt buộc trùng 100 %, nhưng ưu tiên
 * thẳng trục kỹ thuật đứng, chỉ lệch khi cần».
 *
 * Bộ này canh:
 *  1. Mỗi luật có ca VI PHẠM và ca SÁT BIÊN không vi phạm (hai phòng cách một bức tường không chồng).
 *  2. Không gian mở đo theo KHU: WC trên phần phòng khách của một không gian có bếp thì không sai.
 *  3. Tuyến sửa của kỹ sư chỉ tha vi phạm ĐÃ CÓ, không tha vi phạm mới.
 *  4. Bộ xếp xếp phương án WC thẳng trục trước phương án lệch, dù điểm thấp hơn.
 *  5. Trên ý định thật đã ghi, lượt bị bác nêu ĐÚNG luật bị vi phạm — để lượt sửa của mô hình nhắm trúng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import type { AiFloorPlan, AiFloorPlanLevel, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { compareRanked } from '../ai/arrange';
import {
  mandatoryContext,
  mandatoryKey,
  mandatoryViolations,
  offAxisNotes,
  parseMandatoryRules,
  zonesOf,
  MandatoryRulesError,
} from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator } from '../ai/plan';
import { checkPlan } from '../ai/plan-check';
import { REVISABLE_CODES } from '../ai/arrange/issues';
import { TOWNHOUSE_PLAN, VILLA_PLAN } from './ai-plan-fixtures';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const rules = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));

type Level = AiFloorPlanLevel;
type Room = Level['rooms'][number];

const room = (id: string, type: string, r: [number, number, number, number], extra = {}): Room =>
  ({
    id,
    type,
    rect: r,
    area_m2: ((r[2] - r[0]) * (r[3] - r[1])) / 10000,
    ...extra,
  }) as Room;

function programOf(levels: readonly Level[], targets: Record<string, number> = {}): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'3'.repeat(64)}`,
    spaces: levels.flatMap((level) =>
      level.rooms.flatMap((r) => [
        {
          id: r.id,
          type: r.type,
          level: level.level,
          target_area_m2: targets[r.id] ?? r.area_m2,
          ensuite_of: null,
          why: null,
        },
        ...(r.also ?? []).map((id) => ({
          id,
          type: id.replace(/_\d+$/, ''),
          level: level.level,
          target_area_m2: targets[id] ?? 1,
          ensuite_of: null,
          why: null,
        })),
      ]),
    ),
    rationale: '',
    assumptions: [],
    generator: {
      kind: 'ai',
      provider: 'fixture',
      model: 'x',
      route: 'x',
      prompt_version: '0',
      repaired: false,
    },
  } as AiSpaceProgram;
}

/** Tầng chữ nhật 10 × 4 m, không tường — đủ cho luật đứng và luật giáp (đo trên chữ nhật phòng). */
function bare(level: number, rooms: Room[]): Level {
  return {
    level,
    name: `Tầng ${level}`,
    h: 360,
    outline: [
      [0, 0],
      [1000, 0],
      [1000, 400],
      [0, 400],
    ],
    walls: [],
    rooms,
    doors: [],
  } as unknown as Level;
}

const ctxFor = (levels: readonly Level[], targets?: Record<string, number>) =>
  mandatoryContext(rules, programOf(levels, targets), { stackReachCm: 150 });
const codes = (levels: readonly Level[], targets?: Record<string, number>) =>
  mandatoryViolations(levels, ctxFor(levels, targets)).map((issue) => `${issue.code}:${issue.ref}`);

describe('rules/nvg-mandatory.yaml', () => {
  it('nạp được, mọi luật chặn trừ WC thẳng trục (Haan: ưu tiên, không bắt buộc)', () => {
    expect(rules.kitchenUnderWc?.blocking).toBe(true);
    expect(rules.altarUnderWc?.blocking).toBe(true);
    expect(rules.altarBesideWc?.blocking).toBe(true);
    expect(rules.altarFacingWc?.blocking).toBe(true);
    expect(rules.balconyOnOpenFace?.blocking).toBe(true);
    expect(rules.wcStack?.prefer).toBe(true);
  });

  it('khai luật mà quên «blocking» thì từ chối nạp — không đoán hộ «chặn hay nhắc»', () => {
    expect(() => parseMandatoryRules('kitchen_under_wc: { overlap_min_cm2: 100 }')).toThrow(
      MandatoryRulesError,
    );
  });

  it('mọi mã chặn đều được gửi lại cho mô hình sửa, và có dòng gợi ý', () => {
    for (const code of [
      'wc_over_kitchen',
      'wc_over_altar',
      'altar_beside_wc',
      'altar_facing_wc',
      'balcony_off_open_face',
    ]) {
      expect(REVISABLE_CODES.has(code), code).toBe(true);
      expect(prompts.floorLevel.hints[code], code).toBeTruthy();
    }
  });
});

describe('bếp và phòng thờ không nằm dưới WC', () => {
  it('WC tầng 2 chồng lên bếp tầng 1 — bác', () => {
    const levels = [
      bare(1, [room('kitchen_1', 'kitchen', [11, 11, 389, 389])]),
      bare(2, [room('wc_2', 'wc', [11, 11, 200, 200])]),
    ];
    expect(codes(levels)).toEqual(['wc_over_kitchen:wc_2']);
  });

  it('cách nhau một bức tường (11 cm, như biệt thự mẫu) — không tính là chồng', () => {
    const levels = [
      bare(1, [room('kitchen_1', 'kitchen', [11, 211, 389, 389])]),
      bare(2, [room('wc_2', 'wc', [11, 11, 389, 200])]),
    ];
    expect(codes(levels)).toEqual([]);
  });

  it('WC tầng 2 chồng lên phòng thờ tầng 1 — bác', () => {
    const levels = [
      bare(1, [room('altar_room_1', 'altar_room', [11, 11, 389, 389])]),
      bare(2, [room('wc_2', 'wc', [300, 11, 500, 200])]),
    ];
    expect(codes(levels)).toEqual(['wc_over_altar:wc_2']);
  });

  it('chỉ so TẦNG NGAY DƯỚI: WC tầng 3 trên bếp tầng 1 (tầng 2 xen giữa) không phải luật này', () => {
    const levels = [
      bare(1, [room('kitchen_1', 'kitchen', [11, 11, 389, 389])]),
      bare(2, [room('bedroom_2', 'bedroom', [11, 11, 389, 389])]),
      bare(3, [room('wc_3', 'wc', [11, 11, 200, 200])]),
    ];
    expect(codes(levels)).toEqual([]);
  });

  it('không gian mở đo theo KHU: WC trên phần phòng khách không sai, trên phần bếp thì sai', () => {
    const ground = bare(1, [
      room('living_1', 'living', [11, 11, 989, 389], { also: ['kitchen_1'] }),
    ]);
    const targets = { living_1: 25, kitchen_1: 12 };
    const zones = zonesOf(ground.rooms, ctxFor([ground], targets));
    const kitchen = zones.find((zone) => zone.type === 'kitchen')!.rect;
    const living = zones.find((zone) => zone.type === 'living')!.rect;
    const over = (r: typeof kitchen, id: string) =>
      bare(2, [room(id, 'wc', [r.x0 + 20, r.y0 + 20, r.x0 + 150, r.y0 + 150])]);
    expect(codes([ground, over(living, 'wc_a')], targets)).toEqual([]);
    expect(codes([ground, over(kitchen, 'wc_b')], targets)).toEqual(['wc_over_kitchen:wc_b']);
  });

  it('nhà phố mẫu: WC tầng 2 đặt ngay trên bếp tầng 1 — bị bắt', () => {
    const levels = TOWNHOUSE_PLAN.levels;
    expect(codes(levels)).toContain('wc_over_kitchen:wc_2');
  });

  it('biệt thự mẫu: không vi phạm luật nào', () => {
    expect(codes(VILLA_PLAN.levels)).toEqual([]);
  });
});

describe('phòng thờ không giáp, không đối diện WC', () => {
  it('chung một bức tường — bác', () => {
    const levels = [
      bare(1, [
        room('altar_room_1', 'altar_room', [11, 11, 389, 389]),
        room('wc_1', 'wc', [400, 11, 589, 389]),
      ]),
    ];
    expect(codes(levels)).toEqual(['altar_beside_wc:altar_room_1']);
  });

  it('chỉ chạm góc — không phải giáp', () => {
    const levels = [
      bare(1, [
        room('altar_room_1', 'altar_room', [11, 11, 389, 189]),
        room('wc_1', 'wc', [400, 200, 589, 389]),
      ]),
    ];
    expect(codes(levels)).toEqual([]);
  });

  /** Phòng thờ — hành lang — WC, hai cửa mở vào hành lang trên hai vách song song. */
  function facingLevel(wcDoorAt: number): Level {
    const wall = (id: string, x: number) => ({ id, a: [x, 0], b: [x, 400], t: 11, k: 'p' });
    const door = (id: string, wallId: string, at: number, w: number) => ({
      id,
      wall: wallId,
      at,
      w,
      kind: 'single',
      hinge: 'a',
      side: 'l',
    });
    return {
      ...bare(1, [
        room('altar_room_1', 'altar_room', [11, 11, 389, 389]),
        room('circulation_1', 'circulation', [400, 11, 600, 389]),
        room('wc_1', 'wc', [611, 11, 989, 389]),
      ]),
      walls: [wall('pa', 394.5), wall('pw', 605.5)],
      doors: [door('da', 'pa', 150, 80), door('dw', 'pw', wcDoorAt, 70)],
    } as unknown as Level;
  }

  it('hai cửa nhìn thẳng sang nhau qua hành lang — bác', () => {
    expect(codes([facingLevel(150)])).toEqual(['altar_facing_wc:altar_room_1']);
  });

  it('cửa WC lệch 1,45 m dọc hành lang — không đối diện', () => {
    expect(codes([facingLevel(300)])).toEqual([]);
  });
});

describe('ban công quay cạnh dài ra mặt thoáng', () => {
  const withFaces = (rooms: Room[], faces: string[]): Level =>
    ({ ...bare(2, rooms), outline_faces: faces }) as unknown as Level;
  // Cạnh 0 là y = 0 (mặt trước), cạnh 1 là x = 1000 (bên phải), cạnh 2 mặt sau, cạnh 3 bên trái.

  it('cạnh dài nằm trên mặt trước thoáng — đạt', () => {
    const level = withFaces(
      [room('balcony_2', 'balcony', [11, 11, 389, 130])],
      ['open', 'boundary', 'open', 'boundary'],
    );
    expect(codes([level])).toEqual([]);
  });

  it('chỉ cạnh NGẮN chạm mặt thoáng, cạnh dài chạy dọc tường nhà bên — bác', () => {
    const level = withFaces(
      [room('balcony_2', 'balcony', [11, 11, 130, 389])],
      ['open', 'boundary', 'open', 'boundary'],
    );
    expect(codes([level])).toEqual(['balcony_off_open_face:balcony_2']);
  });

  it('ban công lọt giữa nhà — bác', () => {
    const level = withFaces(
      [room('balcony_2', 'balcony', [300, 150, 700, 250])],
      ['open', 'open', 'open', 'open'],
    );
    expect(codes([level])).toEqual(['balcony_off_open_face:balcony_2']);
  });

  // T91 (Haan 27/09/2026): chỉ ban công DÀI (cạnh dài > 1,5 lần cạnh ngắn) bị chặn; gần vuông thì chỉ
  // lưu ý (không chặn) và tiêu chí điểm D3 trừ điểm.
  const offFace = (w: number, h: number) => {
    const level = withFaces(
      [room('balcony_2', 'balcony', [300, 150, 300 + w, 150 + h])],
      ['boundary', 'boundary', 'boundary', 'boundary'],
    );
    return mandatoryViolations([level], ctxFor([level])).map((issue) => issue.level);
  };

  it('ban công trong sàn gần vuông (tỉ lệ ≤ 1,5) không quay ra mặt thoáng — chỉ lưu ý, không chặn', () => {
    expect(offFace(200, 200)).toEqual(['finding']);
    expect(offFace(150, 100)).toEqual(['finding']);
  });

  it('ban công trong sàn dài (tỉ lệ > 1,5) không quay cạnh dài ra mặt thoáng — chặn', () => {
    expect(offFace(160, 100)).toEqual(['blocking']);
    expect(rules.balconyOnOpenFace?.longRatio).toBe(1.5);
  });

  it('tầng không có mặt thoáng khai sẵn (artifact rất cũ) — không đoán, không kiểm', () => {
    expect(codes([bare(2, [room('balcony_2', 'balcony', [300, 150, 700, 250])])])).toEqual([]);
  });
});

describe('WC chung ưu tiên thẳng trục — không chặn', () => {
  it('WC chung lệch trục chỉ thành ghi chú nói rõ lệch bao nhiêu mét', () => {
    const levels = [
      bare(1, [room('wc_1', 'wc', [11, 11, 200, 200])]),
      bare(2, [room('wc_2', 'wc', [700, 11, 889, 200])]),
    ];
    expect(codes(levels)).toEqual([]);
    const notes = offAxisNotes(levels, ctxFor(levels));
    expect(notes.map((note) => note.code)).toEqual(['wc_off_axis']);
    expect(notes[0]!.message).toContain('6,89 m');
  });

  it('WC khép kín không vào luật thẳng trục (Haan: chỉ «ưu tiên», đo ở điểm E2)', () => {
    const levels = [
      bare(1, [room('wc_1', 'wc', [11, 11, 200, 200])]),
      bare(2, [
        room('bedroom_2', 'bedroom', [400, 11, 989, 389]),
        room('wc_2', 'wc', [700, 11, 889, 200]),
      ]),
    ];
    const program = programOf(levels);
    program.spaces.find((space) => space.id === 'wc_2')!.ensuite_of = 'bedroom_2';
    const ctx = mandatoryContext(rules, program, { stackReachCm: 150 });
    expect(offAxisNotes(levels, ctx)).toEqual([]);
  });

  it('bộ xếp: phương án thẳng trục thắng phương án lệch dù điểm thấp hơn', () => {
    const make = (stacked: boolean, total: number) => ({
      stacked,
      total,
      fit: { total: 0 },
      candidate: { penalty: 0, key: stacked ? 'a' : 'b' },
    });
    const ranked = [make(false, 90), make(true, 40)].sort(compareRanked);
    expect(ranked[0]!.stacked).toBe(true);
  });

  it('bộ xếp chia lại tầng: cách chia giữ ban công đúng mặt bản phác thắng, dù điểm thấp hơn (T92)', () => {
    const make = (balconiesKept: boolean, total: number) => ({
      stacked: true,
      atSketch: true,
      balconiesKept,
      total,
      fit: { total: 0 },
      candidate: { penalty: 0, key: balconiesKept ? 'a' : 'b' },
    });
    const ranked = [make(false, 90), make(true, 40)].sort(compareRanked);
    expect(ranked[0]!.balconiesKept).toBe(true);
  });
});

describe('cổng cuối và tuyến sửa của kỹ sư', () => {
  const plan = TOWNHOUSE_PLAN as AiFloorPlan;
  const program = programOf(plan.levels);
  const ctx = mandatoryContext(rules, program, { stackReachCm: 150 });
  const base = {
    plan,
    program,
    doorExemptTypes: new Set(['balcony', 'terrace', 'light_well', 'courtyard', 'porch']),
    verticalTypes: new Set(['stair', 'core']),
  };

  it('không truyền luật (tuyến xem lại artifact cũ) — không kiểm', () => {
    const codesOf = checkPlan(base).blocking.map((issue) => issue.code);
    expect(codesOf).not.toContain('wc_over_kitchen');
  });

  it('truyền luật — WC trên bếp chặn phương án', () => {
    const blocking = checkPlan({ ...base, mandatory: ctx }).blocking.map((issue) => issue.code);
    expect(blocking).toContain('wc_over_kitchen');
  });

  it('vi phạm ĐÃ CÓ trong phương án đang lưu thì hạ xuống ghi chú; vi phạm khác vẫn chặn', () => {
    const existing = mandatoryViolations(plan.levels, ctx);
    const relaxed = checkPlan({
      ...base,
      mandatory: ctx,
      relaxMandatory: new Set(existing.map(mandatoryKey)),
    });
    expect(relaxed.blocking.map((issue) => issue.code)).not.toContain('wc_over_kitchen');
    expect(relaxed.findings.map((issue) => issue.code)).toContain('wc_over_kitchen');

    const other = checkPlan({
      ...base,
      mandatory: ctx,
      relaxMandatory: new Set(['wc_over_kitchen|phong_khac']),
    });
    expect(other.blocking.map((issue) => issue.code)).toContain('wc_over_kitchen');
  });
});

describe('ý định thật đã ghi (lượt đo 5aba737d) — bị bác thì nói đúng luật', () => {
  it('ban công vẽ lọt trong nhà: lượt bị bác, lý do và dòng gợi ý gửi mô hình đều nhắc ban công', () => {
    const run = loadRun('5aba737d');
    const input = { ...realContextInput(run.digest), mandatory: rules };
    const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
    const evaluation = evaluateHouse(
      input,
      planContext(input),
      run.intents.round1!,
      generator,
      prompts,
    );
    expect(evaluation.ok).toBeNull();
    const messages = evaluation.rejections.flatMap((rejection) => rejection.messages);
    expect(messages.some((message) => message.startsWith('Ban công'))).toBe(true);
    expect(evaluation.hints.some((hint) => hint.includes('balcony'))).toBe(true);
  });
});
