/**
 * `ai/edit/apply.ts` — thao tác sửa của kỹ sư trên phương án đã ghi (T53).
 *
 * Phương án nền: lượt đo 58688ead round4 (tầng 1 Haan chấm 16/09/2026) và 5aba737d round1 (gara kề
 * phòng khách). KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { aiFloorPlanSchema, type AiFloorPlan, type AiSpaceProgram } from '@nvg/shared/design';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyPlanEdits, type PlanEditOp } from '../ai/edit/apply';
import { prepareWalls } from '../ai/draw/walls';
import { planContext } from '../ai/plan';
import { doorLinks } from '../ai/plan-check';
import { FAKE_CALL, loadRun, prompts, realContextInput, savedPlan } from './ai-real-context';

const villa = savedPlan(loadRun('58688ead'), 'round4');
const garageVilla = savedPlan(loadRun('5aba737d'), 'round1');

function op(partial: Partial<PlanEditOp> & Pick<PlanEditOp, 'op' | 'level'>): PlanEditOp {
  return {
    room: null,
    from: null,
    to: null,
    a: null,
    b: null,
    place: null,
    area_m2: null,
    delta_m: null,
    on: null,
    request: null,
    ...partial,
  };
}

function apply(base: typeof villa, ops: PlanEditOp[]) {
  return applyPlanEdits({
    base: base.plan,
    program: base.program,
    ops,
    contextInput: base.input,
    context: planContext(base.input),
    call: FAKE_CALL,
    route: 'ai_text_fake',
    promptVersion: prompts.version,
  });
}

type Level = AiFloorPlan['levels'][number];
const room = (level: Level, id: string) => level.rooms.find((entry) => entry.id === id)!;
const area = (level: Level, id: string) => room(level, id).area_m2;

/** Cửa nối đúng hai phòng — suy từ hình học bằng chính bộ kiểm (`doorLinks`). */
function doorsBetween(level: Level, a: string, b: string) {
  const ids = new Set(
    doorLinks(level, prepareWalls(level.walls))
      .filter((link) => link.rooms.includes(a) && link.rooms.includes(b))
      .map((link) => link.id),
  );
  return (level.doors ?? []).filter((door) => ids.has(door.id));
}

describe('artifact đọc lại giữ nguyên phần T53', () => {
  it('ý định cả nhà (có bản phác) và thao tác đã áp không bị zod lược mất', () => {
    const edited = apply(villa, [op({ op: 'window', level: 1, room: 'bedroom_2', on: false })])
      .final!.payload;
    const withEdit = {
      ...edited,
      house_intent: villa.plan.house_intent,
      generator: {
        ...edited.generator,
        edit: { instruction: 'bỏ cửa sổ', base_ref: 'sha256:x', ops: [{ op: 'window', level: 1 }] },
      },
    };
    const parsed = aiFloorPlanSchema.parse(withEdit);
    expect(parsed.house_intent).toHaveProperty('sketches');
    expect(parsed.generator.edit?.ops[0]).toEqual({ op: 'window', level: 1 });
  });
});

describe('applyPlanEdits', () => {
  it('không thao tác nào: ra đúng phương án đã lưu, cùng điểm', () => {
    const result = apply(villa, []);
    expect(result.issues).toEqual([]);
    expect(result.final!.payload.score).toEqual(villa.plan.score);
    expect(result.final!.payload.levels.map((level) => level.rooms)).toEqual(
      villa.plan.levels.map((level) => level.rooms),
    );
  });

  it('dời cửa về đầu vách (start/end): cùng vách, vị trí khác, các tầng khác giữ nguyên', () => {
    const start = apply(villa, [
      op({ op: 'move_door', level: 1, room: 'bedroom_1', to: 'circulation_1', place: 'start' }),
    ]);
    const end = apply(villa, [
      op({ op: 'move_door', level: 1, room: 'bedroom_1', to: 'circulation_1', place: 'end' }),
    ]);
    expect(start.issues).toEqual([]);
    expect(end.issues).toEqual([]);
    const [s] = doorsBetween(start.final!.payload.levels[0]!, 'bedroom_1', 'circulation_1');
    const [e] = doorsBetween(end.final!.payload.levels[0]!, 'bedroom_1', 'circulation_1');
    expect(s && e).toBeTruthy();
    expect(s!.wall).toBe(e!.wall);
    expect(s!.at).not.toBe(e!.at);
    expect(start.final!.payload.levels[1]!.rooms).toEqual(villa.plan.levels[1]!.rooms);
    expect(start.applied[0]).toMatch(/bedroom_1.*circulation_1.*đầu vách/);
  });

  it('bỏ vách gara–phòng khách: ô thông gần suốt cạnh chung (Haan 16/09/2026)', () => {
    const result = apply(garageVilla, [
      op({ op: 'open_wall', level: 1, a: 'living_1', b: 'garage_1' }),
    ]);
    expect(result.issues).toEqual([]);
    const level = result.final!.payload.levels[0]!;
    const living = room(level, 'living_1').rect;
    const garage = room(level, 'garage_1').rect;
    const shared = Math.min(living[3]!, garage[3]!) - Math.max(living[1]!, garage[1]!);
    const openings = doorsBetween(level, 'living_1', 'garage_1').filter(
      (d) => d.kind === 'opening',
    );
    expect(openings).toHaveLength(1);
    expect(openings[0]!.w).toBeGreaterThanOrEqual(Math.floor(shared - 21));
  });

  it('dời vách: phòng a lớn lên, phòng b nhỏ đi', () => {
    const before = villa.plan.levels[0]!;
    const result = apply(villa, [
      op({ op: 'move_wall', level: 1, a: 'bedroom_1', b: 'wc_2', delta_m: 0.3 }),
    ]);
    expect(result.issues).toEqual([]);
    const after = result.final!.payload.levels[0]!;
    expect(area(after, 'bedroom_1')).toBeGreaterThan(area(before, 'bedroom_1'));
    expect(area(after, 'wc_2')).toBeLessThan(area(before, 'wc_2'));
  });

  it('bỏ cửa sổ một phòng: tầng bớt một cửa sổ', () => {
    const result = apply(villa, [op({ op: 'window', level: 1, room: 'bedroom_2', on: false })]);
    expect(result.issues).toEqual([]);
    const level = result.final!.payload.levels[0]!;
    expect(result.final!.payload.levels[0]!.windows!.length).toBeLessThan(
      villa.plan.levels[0]!.windows!.length,
    );
    expect(level.rooms.map((r) => r.id)).toContain('bedroom_1');
  });

  it('đổi diện tích: dời một vách chung — đổi được thì phòng lớn lên, không thì có lý do', () => {
    const before = villa.plan.levels[0]!;
    const tried = ['bedroom_1', 'bedroom_2', 'wc_1', 'storage_1'].map((id) => {
      const want = area(before, id) + 2;
      return {
        id,
        want,
        result: apply(villa, [op({ op: 'resize_room', level: 1, room: id, area_m2: want })]),
      };
    });
    for (const { id, want, result } of tried) {
      if (result.final) {
        expect(area(result.final.payload.levels[0]!, id)).toBeGreaterThan(area(before, id));
        expect(result.program.spaces.find((space) => space.id === id)!.target_area_m2).toBe(want);
        expect(room(result.final.payload.levels[0]!, 'stair_1').rect).toEqual(
          room(before, 'stair_1').rect,
        );
      } else {
        // Bị từ chối thì phải có lý do đọc được (không căn được, hoặc dời vách làm lệch thang…).
        expect(result.issues.length).toBeGreaterThan(0);
      }
    }
    // Ít nhất một phòng căn được — không thì thao tác này vô dụng trên nhà thật.
    expect(tried.some(({ result }) => result.final !== null)).toBe(true);
  });

  it('ô thang không đổi chỗ được — lý do tiếng Việt, không có phương án', () => {
    const result = apply(villa, [op({ op: 'swap_rooms', level: 1, a: 'stair_1', b: 'wc_2' })]);
    expect(result.final).toBeNull();
    expect(result.issues.join(' ')).toMatch(/ô thang/);
  });

  it('bỏ cửa duy nhất của một phòng: không lưu, nói rõ phòng ấy sẽ mất lối vào', () => {
    const doors = villa.plan.levels[0]!.tree!.doors.filter(
      (door) => door.a === 'bedroom_2' || door.b === 'bedroom_2',
    );
    expect(doors).toHaveLength(1);
    const other = doors[0]!.a === 'bedroom_2' ? doors[0]!.b : doors[0]!.a;
    const result = apply(villa, [op({ op: 'close_wall', level: 1, a: 'bedroom_2', b: other })]);
    expect(result.final).toBeNull();
    expect(result.issues.join(' ')).toMatch(/bedroom_2/);
  });

  it('mã phòng lạ: không áp gì, nói rõ mã nào', () => {
    const result = apply(villa, [op({ op: 'window', level: 1, room: 'phong_ngu_9', on: true })]);
    expect(result.final).toBeNull();
    expect(result.issues[0]).toMatch(/phong_ngu_9/);
  });
});

describe('cửa cổng tự thêm lúc xếp (`door_added`) được giữ khi sửa', () => {
  // Phương án THẬT 082293 (Claude Sonnet 5, 17/09/2026, 68,1%): cây chỉ khai 8 cửa, 5 cửa còn lại do cổng
  // thêm. Lượt sửa thật «đổi chỗ bếp và phòng ăn» hỏng với «thang không có cửa» vì dựng lại từ cây làm
  // mất cửa phòng ăn–thang.
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/ai-plan-082293.json', import.meta.url), 'utf8'),
  ) as { plan: AiFloorPlan; program: AiSpaceProgram };
  const real = {
    plan: fixture.plan,
    program: fixture.program,
    input: realContextInput(loadRun('58688ead').digest),
  };

  it('không thao tác: ra đúng điểm đã lưu', () => {
    const result = apply(real as typeof villa, []);
    expect(result.issues).toEqual([]);
    expect(result.final!.payload.score!.points).toBe(fixture.plan.score!.points);
  });

  it('đổi chỗ bếp–phòng ăn: thang giữ cửa; lý do còn lại là bố cục thật (bếp chỉ vào được qua gara)', () => {
    expect(
      fixture.plan.levels[0]!.tree!.doors.some(
        (door) => door.b === 'stair_1' || door.a === 'stair_1',
      ),
    ).toBe(false);
    const result = apply(real as typeof villa, [
      op({ op: 'swap_rooms', level: 1, a: 'kitchen_1', b: 'dining_1' }),
    ]);
    expect(result.issues.join(' ')).not.toMatch(/"stair_1" ở tầng 1 không có cửa/);
    expect(result.issues.join(' ')).toMatch(/"kitchen_1" bằng cách đi xuyên "garage_1"/);
  });
});
