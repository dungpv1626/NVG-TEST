/**
 * T94 (B2 bước 1, Haan duyệt 27/09/2026): biến thể chương trình tự thử trước khi bác — chia lại diện tích
 * mục tiêu, phòng cùng loại cùng mục tiêu, chèn dải hành lang vào đường cắt sạch. Phát lại 105 vòng thật:
 * gốc 0 mặt bằng, với biến thể 6 (5 qua ngưỡng), 19 vòng đi xa hơn, 0 vòng lùi. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouse,
  evaluateHouseBest,
  mergeRevision,
  planContext,
  programGenerator,
  retryPlan,
} from '../ai/plan';
import {
  cleanCuts,
  equalizeByType,
  insertHall,
  retargetIntent,
  roomMinimums,
} from '../ai/plan-variants';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const room = (id: string, type: string, level: number, target: number) => ({
  id,
  type,
  level,
  target_area_m2: target,
  ensuite_of: null,
});
const house = (rooms: ReturnType<typeof room>[]): HouseIntent =>
  ({ rooms, relationships: [], sketches: [] }) as unknown as HouseIntent;
const opts = {
  floors: 1,
  briefRows: [
    { type: 'bedroom', floor: 1, area_m2: 20 },
    { type: 'bedroom', floor: 1, area_m2: 15 },
    { type: 'living', floor: null, area_m2: 30 },
  ],
  norms: new Map([
    ['bedroom', { min: 9, max: 30 }],
    ['living', { min: 12, max: 70 }],
    ['wc', { min: 2.5, max: 8 }],
  ]),
};

describe('chia lại diện tích mục tiêu', () => {
  const intent = house([
    room('living_1', 'living', 1, 60),
    room('bedroom_1', 'bedroom', 1, 21),
    room('bedroom_2', 'bedroom', 1, 15),
    room('wc_1', 'wc', 1, 4),
    room('stair_1', 'stair', 1, 8),
  ]);

  it('mức tối thiểu: sàn đầu bài ghép lớn với lớn, không có thì mức nghề', () => {
    const mins = roomMinimums(intent, opts);
    expect(mins.get('bedroom_1')).toBe(20);
    expect(mins.get('bedroom_2')).toBe(15);
    expect(mins.get('living_1')).toBe(30);
    expect(mins.get('wc_1')).toBe(2.5);
  });

  it('giữ tổng mục tiêu mô hình khai, rải phần dư theo tỉ lệ mức tối thiểu; ô thang giữ nguyên', () => {
    const next = retargetIntent(intent, opts)!;
    const target = (id: string) => next.rooms.find((r) => r.id === id)!.target_area_m2;
    const flexBefore = 60 + 21 + 15 + 4;
    const flexAfter = ['living_1', 'bedroom_1', 'bedroom_2', 'wc_1'].reduce(
      (s, id) => s + target(id),
      0,
    );
    expect(flexAfter).toBeCloseTo(flexBefore, 0);
    // Phòng khách không còn ôm hết phần dư; phòng ngủ nhỏ được thêm.
    expect(target('living_1')).toBeLessThan(60);
    expect(target('bedroom_2')).toBeGreaterThan(15);
    expect(target('stair_1')).toBe(8);
  });

  it('phòng cùng loại cùng tầng nhận cùng mục tiêu — mức lớn nhất của loại', () => {
    const next = equalizeByType(intent, opts)!;
    expect(next.rooms.filter((r) => r.type === 'bedroom').map((r) => r.target_area_m2)).toEqual([
      20, 20,
    ]);
    expect(next.rooms.find((r) => r.id === 'living_1')!.target_area_m2).toBe(30);
  });
});

describe('chèn dải hành lang vào đường cắt sạch', () => {
  const rows = ['a a b b', 'a a b b', 'c c c d', 'c c c d'];

  it('đường cắt sạch là đường không phòng nào vắt qua', () => {
    expect(cleanCuts(rows)).toEqual({ h: [2], v: [] });
  });

  it('chèn dải 2 ô, giữ nguyên thứ tự và phòng hai bên', () => {
    expect(insertHall(rows, { axis: 'h', at: 2 }, 'hall')).toEqual([
      'a a b b',
      'a a b b',
      'hall hall hall hall',
      'hall hall hall hall',
      'c c c d',
      'c c c d',
    ]);
  });
});

describe('phát lại lượt thật — biến thể ra mặt bằng mà gốc không ra', () => {
  const evaluate = (id: string, round: number) => {
    const run = loadRun(id);
    const input = {
      ...realContextInput(run.digest),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
    };
    const ctx = planContext(input);
    const gen = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
    let prev: HouseIntent | null = null;
    let intent = run.intents.round1 as HouseIntent;
    for (let r = 1; r <= round; r += 1) {
      const answer = run.intents[`round${r}`] as HouseIntent;
      intent = prev ? mergeRevision(prev, answer) : answer;
      if (r < round) {
        const e = evaluateHouseBest(input, ctx, intent, gen, prompts);
        prev = retryPlan({ intent, issues: [] }, e).previous ?? intent;
      }
    }
    return {
      base: evaluateHouse(input, ctx, intent, gen, prompts),
      best: evaluateHouseBest(input, ctx, intent, gen, prompts),
    };
  };
  const variantNote = (e: ReturnType<typeof evaluateHouse>) =>
    [
      ...(e.ok ? e.ok.levels[0]!.notes.map((n) => n.message) : []),
      ...e.rejections.flatMap((r) => r.notes ?? []),
    ].join(' ');

  it('5aba737d vòng 1: gốc hỏng; phòng cùng loại cùng mục tiêu → mặt bằng 74,8 %, qua ngưỡng', () => {
    const { base, best } = evaluate('5aba737d', 1);
    expect(base.ok).toBeNull();
    expect(best.ok).not.toBeNull();
    expect(best.ok!.score.percent).toBeGreaterThanOrEqual(65);
    expect(variantNote(best)).toMatch(/phòng cùng loại cùng tầng nhận cùng diện tích mục tiêu/);
  });

  it('4a521f52 vòng 1: biến thể diện tích mục tiêu → mặt bằng', () => {
    const { base, best } = evaluate('4a521f52', 1);
    expect(base.ok).toBeNull();
    expect(best.ok).not.toBeNull();
    // Thước T96 đổi thứ hạng: trước là «chia lại theo tỉ lệ», nay «cùng loại cùng mục tiêu» thắng.
    expect(variantNote(best)).toMatch(/chia lại diện tích mục tiêu|cùng diện tích mục tiêu/);
  });

  it('3ff10f75 vòng 1: chèn dải hành lang tầng 1 → tầng 1 qua, lỗi còn ở tầng 2', () => {
    const { base, best } = evaluate('3ff10f75', 1);
    expect(base.rejections.map((r) => r.level)).toContain(1);
    expect(best.rejections.map((r) => r.level)).not.toContain(1);
    expect(variantNote(best)).toMatch(/tầng 1: chèn dải hành lang/);
  });
});
