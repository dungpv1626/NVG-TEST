/**
 * Hai tiêu chí T113 trên đúng phương án Haan chấm (lượt thật 182665ea, 02/10/2026): «giao thông tầng 1 quá lớn,
 * đang có độ rộng 2,5 m — thừa và không hợp lý» (C12) và «ban công tầng 2 phân bổ chưa thẩm mỹ, đúng kiểu làm cho
 * có để tuân thủ đề bài» (D5). Thước cũ cho phương án này đủ điểm ở cả hai chỗ.
 */

import { describe, expect, it } from 'vitest';
import type { AiFloorPlan, AiSpaceProgram } from '@nvg/shared/design';
import { parseMandatoryRules } from '../ai/mandatory';
import { scorePlan } from '../ai/plan-score';
import { loadRun, read, realContextInput } from './ai-real-context';

const saved = JSON.parse(read('workers/src/design/__tests__/fixtures/ai-plan-182665ea.json')) as {
  plan: AiFloorPlan;
  program: AiSpaceProgram;
};
const input = realContextInput(loadRun('182665ea').digest);
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));

const score = (plan: AiFloorPlan) =>
  scorePlan({
    plan,
    program: saved.program,
    buildingType: 'biet_thu',
    quality: input.quality,
    rules: input.scoreRules,
    groups: input.roomGroups,
    passage: input.groups.passage ?? null,
    areaNorms: input.areaNorms ?? null,
    balconyFace: mandatory.balconyOnOpenFace,
  });
const of = (plan: AiFloorPlan, code: string) => score(plan).criteria.find((c) => c.code === code)!;
const clone = () => structuredClone(saved.plan);

describe('T113 — C12 hành lang rộng quá mức', () => {
  it('bắt dải hành lang tầng 1 rộng 2,4 m, trừ hết', () => {
    const c12 = of(saved.plan, 'C12');
    expect(c12.value).toBe(2.4);
    expect(c12.score).toBe(0);
    expect(c12.refs).toEqual(['circulation_1']);
  });

  it('thu dải ấy về 1,4 m thì dải rộng nhất còn lại là hành lang tầng 2 1,55 m — gần đủ điểm', () => {
    const plan = clone();
    const hall = plan.levels[0]!.rooms.find((room) => room.id === 'circulation_1')!;
    const [x0 = 0, y0 = 0, x1 = 0] = hall.rect;
    hall.rect = [x0, y0, x1, y0 + 140] as typeof hall.rect;
    const c12 = of(plan, 'C12');
    expect(c12.refs).toEqual(['circulation_3']);
    expect(c12.value).toBeCloseTo(1.55, 2);
    expect(c12.score).toBeGreaterThan(0.9);
    expect(c12.score).toBeLessThan(1);
  });

  it('sảnh gần vuông không xét — chỉ hành lang dạng dải', () => {
    const plan = clone();
    for (const level of plan.levels)
      level.rooms = level.rooms.filter(
        (room) => room.type !== 'circulation' || room.id === 'circulation_2',
      );
    // circulation_2 1,29 × 2,89 m: dài chưa tới 3 lần bề rộng.
    expect(of(plan, 'C12').score).toBeNull();
  });
});

describe('T113 — D5 ban công bố trí lệch', () => {
  it('bắt cả hai ban công tầng 2: ôm góc chữ L, chạy quá cạnh phòng, cùng thuộc phòng ngủ chính', () => {
    const d5 = of(saved.plan, 'D5');
    expect(d5.value).toBe(2);
    expect(d5.score).toBe(0);
    expect([...d5.refs].sort()).toEqual(['balcony_1', 'balcony_2']);
  });

  it('chỉ còn ban công mặt trước bám đúng cạnh phòng ngủ chính → đủ điểm', () => {
    const plan = clone();
    const level = plan.levels.find((l) => l.level === 2)!;
    level.rooms = level.rooms.filter((room) => room.id !== 'balcony_2');
    level.doors = (level.doors ?? []).filter((door) => !JSON.stringify(door).includes('balcony_2'));
    const d5 = of(plan, 'D5');
    // Phòng ngủ 3 cùng mặt trước chưa có ban công, nhưng phòng ngủ chính chỉ giữ MỘT ban công — cùng bậc thì không
    // phải sai ưu tiên.
    expect(d5.value).toBe(0);
  });
});
