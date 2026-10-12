/**
 * Lượt e1c432f4 hồ sơ c815a6e6 (11/10/2026, claude-opus-5-5, bản demo phát hành trước T157) — T158. Haan: «phần thang bộ
 * vẫn bị lỗi vách ngăn bao đường lên/xuống». Tầng 1 bản phác đặt kho chắn đầu bậc 1, hành lang chạy dọc cạnh dài: bộ đặt
 * cửa mở ô thông ở cạnh dài, ngang vế đang lên — đúng lỗi T105 đã gọi tên (`stair_entry_long_side`) nhưng lý do ấy chỉ
 * xếp ứng viên sau, mọi ứng viên vướng thì cây ít tệ nhất vẫn qua. Tầng 2 WC chắn đầu bước ra (T157 đã chặn, bản demo
 * lúc ấy chưa có).
 *
 * Không gọi mô hình: ý định là `house_intent` đã lưu trong artifact (`fixtures/ai-run-e1c432f4.json`).
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
import { renderPlanSheet } from '../ai/draw/plan-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { parseFacadeDetail } from '../kb/facade-detail';
import { drawingLabelsOf, parseVocabulary } from '../kb/vocabulary';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('e1c432f4');
const input = {
  ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/** Cạnh của ô thang mà tâm mỗi lỗ mở của nó nằm trên: `y0` đầu mặt tiền, `y1` đầu sau, `x0` / `x1` hai cạnh bên. */
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

/** Khoảng (theo trục dọc cạnh) mà các lỗ mở trên cạnh `side` của ô thang tầng `level` chiếm. */
function exitSpans(plan: AiFloorPlan, level: number, side: string): Array<[number, number]> {
  const storey = plan.levels.find((l) => l.level === level)!;
  const [x0, y0, x1, y1] = storey.rooms.find((r) => r.type === 'stair')!.rect as number[];
  const vertical = side.startsWith('x');
  const fixed = side === 'x0' ? x0! : side === 'x1' ? x1! : side === 'y0' ? y0! : y1!;
  const [lo, hi] = vertical ? [y0!, y1!] : [x0!, x1!];
  const spans: Array<[number, number]> = [];
  for (const door of storey.doors ?? []) {
    const wall = storey.walls.find((w) => w.id === door.wall)!;
    const [ax, ay] = wall.a as number[];
    const [bx, by] = wall.b as number[];
    const length = Math.hypot(bx! - ax!, by! - ay!);
    const at = (t: number) => [ax! + ((bx! - ax!) * t) / length, ay! + ((by! - ay!) * t) / length];
    const s = at(door.at);
    const e = at(door.at + door.w);
    const across = vertical ? [s[0]!, e[0]!] : [s[1]!, e[1]!];
    const along = vertical ? [s[1]!, e[1]!] : [s[0]!, e[0]!];
    if (across.some((v) => Math.abs(v - fixed) > 20)) continue;
    const from = Math.min(...along);
    const to = Math.max(...along);
    if (to > lo && from < hi) spans.push([from, to]);
  }
  return spans;
}

describe('lượt e1c432f4 c815a6e6 — lối vào thang tầng 1 ở đầu bậc 1 (T158)', () => {
  it(
    'tầng 1 không mở ô thang ở cạnh dài; tầng 2 bước ra ở cùng đầu (thang U)',
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

      // Giữ bố cục mô hình vẽ (Haan, sau phát lại đầu của T158: «bếp và phòng ăn sắp lại không hợp lý … có thể giữ lại
      // hướng thang, chỉ cần điều chỉnh vách và không gian hành lang ở điểm lên xuống thang»): hướng thang như bản đã
      // lưu, mọi phòng của bản đã lưu vẫn ở gần đúng chỗ cũ, thêm đúng một sảnh khoét từ phòng chắn.
      const saved = (
        JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-e1c432f4.json')) as {
          saved_level1: { stair_up: string; rooms: Record<string, number[]> };
        }
      ).saved_level1;
      const groundLevel = plan.levels.find((l) => l.level === 1)!;
      expect(groundLevel.stairs![0]!.up).toBe(saved.stair_up);
      for (const [id, rect] of Object.entries(saved.rooms)) {
        const now = groundLevel.rooms.find((room) => room.id === id)?.rect as number[] | undefined;
        expect(now, id).toBeDefined();
        const ix = Math.min(now![2]!, rect[2]!) - Math.max(now![0]!, rect[0]!);
        const iy = Math.min(now![3]!, rect[3]!) - Math.max(now![1]!, rect[1]!);
        const area = (r: number[]) => (r[2]! - r[0]!) * (r[3]! - r[1]!);
        expect(Math.max(0, ix) * Math.max(0, iy), id).toBeGreaterThan(
          0.6 * Math.min(area(now!), area(rect)),
        );
      }
      const extra = groundLevel.rooms.filter((room) => !(room.id in saved.rooms));
      expect(extra.map((room) => room.type)).toEqual(['circulation']);
      expect(
        result
          .ok!.levels.find((l) => l.level.level === 1)!
          .notes?.some((note) => note.code === 'stair_landing_carved'),
      ).toBe(true);
      const up = plan.levels.find((l) => l.level === 1)!.stairs![0]!.up;
      // Bậc 1 ở đầu ngắn xuất phát theo chiều lên; thang U bước ra tầng trên cũng ở đầu ấy.
      const start = up === '+y' ? 'y0' : up === '-y' ? 'y1' : up === '+x' ? 'x0' : 'x1';
      for (const level of [1, 2]) {
        const exits = stairExits(plan, level);
        expect(exits.length, `tầng ${level}`).toBeGreaterThan(0);
        expect(
          exits.every((side) => side === start),
          `tầng ${level}: ${exits.join(', ')}`,
        ).toBe(true);
      }

      // Tầng 2: lỗ mở nằm trên VẾ TỚI, không giữa cạnh — vế đầu cùng đầu ấy là khoảng thông xuống tầng 1 (T158).
      const ground = plan.levels.find((l) => l.level === 1)!.stairs![0]!;
      const [sx0, sy0, sx1, sy1] = plan.levels
        .find((l) => l.level === 2)!
        .rooms.find((r) => r.type === 'stair')!.rect as number[];
      const vertical = start.startsWith('x');
      const lo = vertical ? sy0! : sx0!;
      const hi = vertical ? sy1! : sx1!;
      const half = (hi - lo - (ground.gap ?? 0)) / 2;
      // Vế đầu ở đầu toạ độ nhỏ khi `up` là +x / −y (góc xuất phát của tờ vẽ), ngược lại ở đầu lớn.
      const firstLow = ground.up === '+x' || ground.up === '-y';
      const first: [number, number] = firstLow ? [lo, lo + half] : [hi - half, hi];
      const arrival: [number, number] = firstLow ? [hi - half, hi] : [lo, lo + half];
      const [span] = exitSpans(plan, 2, start);
      expect(span).toBeDefined();
      const overlap = (a: [number, number], b: [number, number]) =>
        Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
      // Không mở ra khoảng thông tầng (chừa 5 cm cho má tường), và phủ gần trọn bề rộng vế tới.
      expect(overlap(span!, first)).toBeLessThanOrEqual(5);
      expect(overlap(span!, arrival)).toBeGreaterThanOrEqual(
        Math.min(span![1] - span![0], half) - 30,
      );

      // «XUỐNG» ở tầng trên đứng cạnh bậc CUỐI (chỗ bắt đầu đi xuống), không cạnh bậc 1 (chân thang tầng dưới).
      const svg = renderPlanSheet(plan, 2, {
        style: parseSheetStyle(read('kb/sheet_style.yaml')),
        labels: drawingLabelsOf(parseVocabulary(read('kb/room_vocabulary.yaml'))),
        detail: parseFacadeDetail(read('kb/facade_detail.yaml')),
      }).svg;
      // Chỉ chữ của thang (`tst` nhãn, `tsn` số bậc) — bóng trục cũng có chữ «1».
      const textAt = (text: string): [number, number] => {
        const match = new RegExp(
          `<text x="([\\d.]+)" y="([\\d.]+)" class="ts[tn]">${text}</text>`,
        ).exec(svg);
        expect(match, text).not.toBeNull();
        return [Number(match![1]), Number(match![2])];
      };
      const down = textAt('XUỐNG');
      const dist = (a: [number, number], b: [number, number]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]);
      expect(dist(down, textAt(String(ground.treads! - 1)))).toBeLessThan(dist(down, textAt('1')));
    },
  );
});
