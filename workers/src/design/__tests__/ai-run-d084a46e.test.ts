/**
 * Phương án d084a46e hồ sơ c815a6e6 (12/10/2026, gpt-6-sol, bản demo nvg-api trước T157) — T160. Haan 13/10/2026: «về
 * bố trí phòng là khá tốt, nhưng về kích thước chi tiết + thang bộ + công năng + thẩm mỹ là chưa tốt».
 *
 * Không gọi mô hình: `round1` là `house_intent` đã lưu trong artifact; `hand_level2` là bản phác tầng 2 sửa tay để có
 * hành lang trước đầu bước ra (xem `_note` của tệp ghi).
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
import { planGraph } from '../ai/plan-check';
import { stairLayout } from '../ai/stair-geometry';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';
import type { HouseModelKnowledge } from '../ai/plan';

const run = loadRun('d084a46e');
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const inputOf = (digest: typeof run.digest) => ({
  ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory,
});

type Rect = [number, number, number, number];
const rectOf = (plan: AiFloorPlan, level: number, id: string): Rect => {
  const room = plan.levels.find((l) => l.level === level)!.rooms.find((r) => r.id === id);
  expect(room, id).toBeDefined();
  return room!.rect as Rect;
};

describe('phương án d084a46e c815a6e6 — kích thước chi tiết (T160)', () => {
  it(
    'ý định đã lưu: tầng 2 bị phòng ngủ chính chắn đầu bước ra (T157) — tầng 1 vào thang từ đầu sau thì cả nhà qua (T161)',
    { timeout: 180_000 },
    () => {
      // Bản phác của mô hình: thang tầng 1 giáp phòng khách ở đầu trước, hành lang ở đầu sau; tầng 2 phòng ngủ chính ở
      // đầu trước, hành lang ở đầu sau. Bộ xếp tầng 1 chọn đầu trước (cửa sẵn có) nên thang U bước ra tầng 2 vào phòng
      // ngủ — cổng bác. Bước quay lui T161 cho tầng 1 vào từ đầu sau: tầng 2 bước ra đúng hành lang.
      const input = inputOf(run.digest);
      const context = planContext(input);
      const result = evaluateHouseBest(
        input,
        context,
        run.intents.round1 as HouseIntent,
        generator,
        promptsFor(context, prompts),
      );
      expect(result.ok, JSON.stringify(result.rejections).slice(0, 400)).not.toBeNull();
      const [ground, upper] = result.ok!.levels.map((l) => l.level);
      const stair = ground!.stairs![0]!;
      expect(stair.up).toBe('-y');
      const stairUpper = upper!.rooms.find((r) => r.type === 'stair')!.rect as Rect;
      const hall = upper!.rooms.find((r) => r.id === 'circulation_6')!.rect as Rect;
      // Hành lang tầng 2 giáp trọn đầu sau (y1) của ô thang.
      expect(hall[1] - stairUpper[3]).toBeLessThan(15);
      expect(hall[0]).toBeLessThanOrEqual(stairUpper[0]);
      expect(hall[2]).toBeGreaterThanOrEqual(stairUpper[2]);
    },
  );

  it(
    'gia chủ chọn ban công chính mở từ giao thông chung: ban công riêng của phòng ngủ chính bị bác; chọn phòng ngủ chính thì qua (T161)',
    { timeout: 180_000 },
    () => {
      const withAccess = (access: string) => {
        const digest = {
          ...run.digest,
          balconies: { ...run.digest.balconies!, main_front_access: access },
        } as typeof run.digest;
        const input = inputOf(digest);
        const context = planContext(input);
        return evaluateHouseBest(
          input,
          context,
          run.intents.round1 as HouseIntent,
          generator,
          promptsFor(context, prompts),
        );
      };
      // Mô hình khai `balcony_1` là ban công riêng (`ensuite_of`) của phòng ngủ chính — cửa mở từ phòng ngủ.
      const shared = withAccess('chung');
      expect(shared.ok).toBeNull();
      expect(shared.rejections.flatMap((r) => r.messages).join(' ')).toContain(
        'ban công chính mặt tiền mở từ sảnh',
      );
      // Lỗi đi vào lượt sửa kèm câu nhắc (mã nằm trong REVISABLE_CODES).
      expect(shared.hints.join(' ')).toContain('main front balcony to open from');
      const master = withAccess('phong_ngu_chinh');
      expect(master.ok, JSON.stringify(master.rejections).slice(0, 400)).not.toBeNull();
    },
  );

  it(
    'gia chủ khai độ sâu ban công chính: nông hơn quá dung sai thì bị bác, đủ sâu thì qua (T161)',
    { timeout: 180_000 },
    () => {
      const withDepth = (depth: number) => {
        // Độ sâu chỉ đòi khi mặt trước không khai độ đua — bỏ độ đua mặt trước của đầu bài thật.
        const balconies = run.digest.balconies!;
        const digest = {
          ...run.digest,
          balconies: {
            ...balconies,
            projection_by_side: { ...balconies.projection_by_side, front: 0 },
            main_front_depth_m: depth,
          },
        } as typeof run.digest;
        const input = inputOf(digest);
        const context = planContext(input);
        return evaluateHouseBest(
          input,
          context,
          run.intents.round1 as HouseIntent,
          generator,
          promptsFor(context, prompts),
        );
      };
      const deep = withDepth(3);
      expect(deep.rejections.flatMap((r) => r.messages).join(' ')).toContain('chỉ sâu');
      expect(deep.hints.join(' ')).toContain('main front balcony at least 3 m deep');
      const shallow = withDepth(1.2);
      expect(shallow.ok, JSON.stringify(shallow.rejections).slice(0, 400)).not.toBeNull();
    },
  );

  it('lượt đầu đã biết chỗ người lên / xuống ô thang theo loại thang (T161)', () => {
    // Trước T161 mô hình chỉ biết loại và cỡ ô thang, nên vẽ phòng ngủ chính chắn đầu bước ra (tầng 2 của d084a46e).
    const expected = {
      chu_u: 'one_short_end',
      chu_u_rong: 'one_short_end',
      ba_ve: 'one_short_end',
      thang_thang: 'both_short_ends',
      chu_l: 'short_end_and_long_side',
    } as const;
    for (const [shape, arrival] of Object.entries(expected)) {
      const digest = {
        ...run.digest,
        vertical: { ...run.digest.vertical!, stair_shape: shape },
      } as typeof run.digest;
      const knowledge = planContext(inputOf(digest)).modelKnowledge as HouseModelKnowledge;
      expect(knowledge.stair_min_m?.arrival, shape).toBe(arrival);
    }
  });

  it(
    'mô hình thang cũ (như bộ phát lại toàn kho): biến thể thu hẹp hành lang thắng khi so điểm không tính A1',
    { timeout: 180_000 },
    () => {
      // Không thông số loại thang thì cổng T157 không xét đầu bước ra, ý định đã lưu xếp được cả nhà. Hành lang dải rộng
      // nhất của bản ấy: 1,58 m nếu so điểm có tính A1 (A1 phạt chính phần thu hẹp), 1,49 m khi không tính.
      const input = {
        ...realContextInput(run.digest, { openSetback: true, houseProfile: true }),
        mandatory,
      };
      const context = planContext(input);
      const result = evaluateHouseBest(
        input,
        context,
        run.intents.round1 as HouseIntent,
        generator,
        promptsFor(context, prompts),
      );
      expect(result.ok).not.toBeNull();
      expect(result.ok!.levels[0]!.notes.map((note) => note.code)).toContain('corridor_trimmed');
    },
  );

  it(
    'bản phác tầng 2 có hành lang trước thang: hành lang 1,5 m, WC khép kín gọn + tủ đồ, chiếu nghỉ đúng thiết kế, chấm sảnh và ban công',
    { timeout: 180_000 },
    () => {
      // Phần hành lang trước thang lấy từ phòng ngủ chính — hạ mức 23 → 18 m² để bản phác tay qua cổng diện tích.
      const digest = {
        ...run.digest,
        required_spaces: run.digest.required_spaces.map((space) =>
          space.type === 'master_bedroom' ? { ...space, area_m2: 18 } : space,
        ),
      };
      const input = inputOf(digest);
      const context = planContext(input);
      const result = evaluateHouseBest(
        input,
        context,
        run.intents.hand_level2 as HouseIntent,
        generator,
        promptsFor(context, prompts),
      );
      expect(result.ok, JSON.stringify(result.rejections).slice(0, 400)).not.toBeNull();
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

      // Haan: «giao thông để rộng quá (2150) — thu lại còn khoảng 1.5m, phần diện tích còn lại bù vào phòng giặt phơi
      // và WC». Bản đã lưu: hành lang sau thang tầng 2 sâu 2,04 m lọt lòng, giặt phơi 5,16 m², WC 3,21 m².
      const hall = rectOf(plan, 2, 'circulation_6');
      expect(hall[3] - hall[1]).toBeLessThanOrEqual(155);
      const laundry = rectOf(plan, 2, 'laundry_1');
      const wc = rectOf(plan, 2, 'wc_4');
      const area = (r: Rect) => ((r[2] - r[0]) * (r[3] - r[1])) / 10_000;
      expect(area(laundry) + area(wc)).toBeGreaterThan(5.16 + 3.21 + 1);
      // Tầng 1: hành lang mô hình vẽ thành hai ô nối nhau (1,84 m) cũng thu về khung biệt thự.
      for (const id of ['circulation_4', 'circulation_1']) {
        const r = rectOf(plan, 1, id);
        expect(r[2] - r[0], id).toBeLessThanOrEqual(155);
      }

      // Haan: «WC trong phòng ngủ đang dài quá (5m6)» → WC tối đa 2,7 m theo tim, phần dư thành tủ đồ mở từ phòng ngủ.
      const ensuite = rectOf(plan, 1, 'wc_1');
      expect(Math.max(ensuite[2] - ensuite[0], ensuite[3] - ensuite[1])).toBeLessThanOrEqual(270);
      const ground = plan.levels.find((l) => l.level === 1)!;
      const closet = ground.rooms.find((r) => r.type === 'closet');
      expect(closet).toBeDefined();
      const graph = planGraph(plan);
      expect([...(graph.neighbours.get(closet!.id) ?? [])]).toContain('bedroom_2');

      // «chiếu nghỉ thì quá rộng»: ô thang 4,89 m cho thang cần 4,1 m — chiếu nghỉ vẽ đúng 1,5 m, phần dư là sàn ở đầu bậc 1.
      const stair = ground.stairs![0]!;
      const layout = stairLayout(
        {
          shape: stair.shape!,
          risers: stair.treads!,
          going: stair.going!,
          flightWidth: stair.flight_width!,
          landing: stair.landing!,
          gap: stair.gap ?? 0,
        },
        stair.rect as Rect,
        stair.up,
      );
      const landing = layout.pieces.find((piece) => piece.landing)!;
      const ys = landing.poly.map((p) => p[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(stair.landing!, 0);

      // Ba tiêu chí mới chỉ trừ điểm (Haan chọn): sảnh 16,9 m² sau thang, ban công mặt tiền mở từ phòng riêng, ban công
      // hông 12,7 m² lớn hơn ban công mặt tiền.
      const criteria = new Map(
        (
          plan as unknown as {
            score: { criteria: { code: string; value: number | null; refs: string[] }[] };
          }
        ).score.criteria.map((c) => [c.code, c]),
      );
      expect(criteria.get('C14')?.value).toBeCloseTo(16.9, 1);
      expect(criteria.get('C14')?.refs).toContain('circulation_2');
      expect(criteria.get('D6')?.refs).toEqual(['balcony_1']);
      expect(criteria.get('D7')?.refs).toEqual(['balcony_2']);
    },
  );
});
