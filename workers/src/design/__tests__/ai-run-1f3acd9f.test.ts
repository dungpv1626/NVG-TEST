/**
 * Phương án 6 hồ sơ c815a6e6 (08/10/2026) — T157. Haan: «thang bộ lên tầng 2, vách quây kín 3 góc, một góc mở thì không
 * thể đi lại qua đó vì nằm ở giữa thang». Tầng 1 vào thang từ phòng khách ở đầu phía mặt tiền (thang U), nên ở tầng 2
 * người bước ra cũng ở đầu ấy; bản phác tầng 2 đặt phòng ngủ chắn đầu ấy, hành lang chỉ chạy dọc cạnh dài. Bộ đặt cửa
 * khi đó chỉ ƯU TIÊN đầu bước ra, không có thì mở ô thông ở cạnh dài — ngang vế bậc.
 *
 * Không gọi mô hình: ý định là `house_intent` đã lưu trong artifact (`fixtures/ai-run-1f3acd9f.json`).
 */

import { describe, expect, it } from 'vitest';
import type { AiFloorPlan } from '@nvg/shared/design';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouseBest,
  finalisePlan,
  planContext,
  programGenerator,
  promptsFor,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('1f3acd9f');
const input = {
  ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/** Cạnh của ô thang mà tâm mỗi lỗ mở của nó nằm trên: `y0` đầu mặt tiền, `y1` đầu sau, `x0` / `x1` hai cạnh dài. */
function stairExits(plan: AiFloorPlan, level: number): string[] {
  const storey = plan.levels.find((l) => l.level === level)!;
  const [x0, y0, x1, y1] = storey.rooms.find((r) => r.type === 'stair')!.rect as number[];
  const near = (a: number, b: number) => Math.abs(a - b) <= 20;
  const sides: string[] = [];
  for (const door of storey.doors ?? []) {
    const wall = storey.walls.find((w) => w.id === door.wall)!;
    const [ax, ay] = wall.a as number[];
    const [bx, by] = wall.b as number[];
    const length = Math.hypot(bx! - ax!, by! - ay!);
    const t = (door.at + door.w / 2) / length;
    const cx = ax! + (bx! - ax!) * t;
    const cy = ay! + (by! - ay!) * t;
    const alongX = cx > x0! && cx < x1!;
    const alongY = cy > y0! && cy < y1!;
    if (alongX && near(cy, y0!)) sides.push('y0');
    else if (alongX && near(cy, y1!)) sides.push('y1');
    else if (alongY && near(cx, x0!)) sides.push('x0');
    else if (alongY && near(cx, x1!)) sides.push('x1');
  }
  return sides;
}

describe('phương án 6 c815a6e6 — lối ra thang tầng trên ở đầu người bước ra (T157)', () => {
  it(
    'tầng 2 không mở ô thang ở cạnh dài; lối ra ở đúng đầu vế từ tầng 1 tới',
    { timeout: 180_000 },
    () => {
      const result = evaluateHouseBest(
        input,
        context,
        run.intents.round1 as HouseIntent,
        generator,
        promptsFor(context, prompts),
      );
      expect(result.ok).not.toBeNull();
      const program = { ...result.ok!.program, brief_ref: `sha256:${'b'.repeat(64)}` };
      const final = finalisePlan({
        levels: result.ok!.levels,
        context,
        program,
        programRef: `sha256:${'a'.repeat(64)}`,
        variant: input.variant,
        call: FAKE_CALL,
        route: 'ai_text_fake',
        promptVersion: prompts.version,
        resampledLevels: [],
        construction: input.construction,
        groups: input.groups,
        quality: input.quality,
        scoreRules: input.scoreRules,
        areaNorms: input.areaNorms ?? null,
        roomGroups: input.roomGroups,
        buildingType: run.digest.building_type,
      });
      const plan = final.payload as unknown as AiFloorPlan;
      const up = plan.levels.find((l) => l.level === 1)!.stairs![0]!.up;
      // Thang U: bước ra ở tầng trên cùng đầu với bậc 1 tầng dưới — `+y` bắt đầu ở `y0`, `-y` ở `y1`.
      const arrival = up === '+y' ? 'y0' : up === '-y' ? 'y1' : up === '+x' ? 'x0' : 'x1';
      const exits = stairExits(plan, 2);
      expect(exits.length).toBeGreaterThan(0);
      expect(exits.every((side) => side === arrival)).toBe(true);
    },
  );
});
