/**
 * Khung mặt đứng dựng THẲNG TỪ ĐẦU BÀI khi chưa có mặt bằng (B3 «bộ ý tưởng cho khách», 30/10/2026).
 *
 * Canh:
 *  · cùng kiểu `FacadeFrame` với khung từ mặt bằng — bề ngang theo ô xây được, cao độ theo kb, lỗ mở theo nếp;
 *  · mọi số đo lấy từ `kb/construction_norms.yaml` (không số nào viết trong mã);
 *  · chỉ suy từ câu ĐÃ trả lời (không khai ô tô thì không có gara, không khai ban công mặt tiền thì không có);
 *  · ghép → ý tưởng qua hợp đồng với `plan_ref: null`, `source: brief`; tờ mặt đứng vẽ được không cần mặt bằng;
 *  · hai bước của lượt chạy nền chạy được khi lượt không chốt mặt bằng, lineage trỏ về ĐẦU BÀI;
 *  · phối cảnh lấy chiều sâu / sân từ đầu bài khi ý tưởng không có mặt bằng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình — client giả.
 */

import {
  aiFacadeConceptSchema,
  type AiBriefDigest,
  type AiFacadeProposal,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { renderElevationAnchor, renderElevationSheet } from '../ai/draw/elevation-sheet';
import { parseSheetStyle } from '../ai/draw/style';
import { checkFacade } from '../ai/facade/check';
import { facadeLegend } from '../ai/facade/describe';
import { FacadeFrameError, mainDoorOf } from '../ai/facade/frame';
import { facadeFrameFromBrief } from '../ai/facade/frame-brief';
import { mergeFacade } from '../ai/facade/merge';
import { parseFacadeQuality } from '../ai/facade/quality';
import { perspectiveContext } from '../ai/perspective/context';
import { perspectivePlan } from '../ai/perspective/views';
import type { ConstructionNorms } from '../kb/construction';
import type { TextModelClient } from '../llm/text-client';
import type { AiDesignParams } from '../workflows/ai-design-steps';
import {
  proposeFacadeStep,
  writeFacadeStep,
  type FacadeStepDeps,
} from '../workflows/ai-facade-steps';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';
import {
  facadeDetailKb,
  facadeVocab,
  norms,
  outdoor,
  TOWNHOUSE_PROPOSAL,
} from './ai-facade-fixtures';
import { FAKE_CALL, prompts, read } from './ai-real-context';

const cm = (m: number) => Math.round(m * 100);
const rules = norms.facade!.from_brief!;
const entrance = norms.openings.entrance!;
const win = norms.openings.window!;

/** Nhà phố 5 × 18 m, 3 tầng, MỘT ô tô vào từ mặt tiền, ban công mặt tiền bắt buộc. */
const townhouse = (): AiBriefDigest => ({
  ...digestOf(TOWNHOUSE),
  parking: { cars: 1, motorbikes: 2 },
  balconies: { required_sides: ['front'], optional_sides: [], projection_by_side: { front: 1.2 } },
});

/** Biệt thự 15 × 20 m, lùi trước 4 m, 2 tầng, không ô tô, không khai ban công. */
const villa = (): AiBriefDigest => digestOf(VILLA);

/** Ý tưởng mô hình không có mảng trang trí — khung từ đầu bài không có toạ độ của mặt bằng mẫu. */
const PROPOSAL: AiFacadeProposal = { ...TOWNHOUSE_PROPOSAL, elements: [] };

describe('Khung từ đầu bài — nhà phố 5 × 18 m có ô tô và ban công mặt tiền', () => {
  const frame = facadeFrameFromBrief(townhouse(), norms);

  it('bề ngang = ô xây được, cao độ theo kb: tầng trên cùng cao hơn', () => {
    expect([frame.x0, frame.x1, frame.width]).toEqual([0, 500, 500]);
    expect(frame.levels.map(({ level, z, h }) => [level, z, h])).toEqual([
      [1, 0, cm(norms.levels.storey_height_m)],
      [2, cm(norms.levels.storey_height_m), cm(norms.levels.storey_height_m)],
      [3, 2 * cm(norms.levels.storey_height_m), cm(norms.levels.top_storey_height_m)],
    ]);
    expect(frame.roofZ).toBe(
      2 * cm(norms.levels.storey_height_m) + cm(norms.levels.top_storey_height_m),
    );
    expect(frame.groundZ).toBe(-cm(norms.facade!.ground_floor_raise_m));
    expect(frame.frontYard).toBe(false);
  });

  it('mặt tiền một khoang có ô tô: tầng 1 chỉ cửa để xe — người vào qua gara, không có cửa chính', () => {
    const ground = frame.openings.filter((o) => o.level === 1);
    expect(ground.map((o) => o.kind)).toEqual(['garage']);
    // Bề rộng theo tỉ lệ khoang, kẹp trong cận đo được của `openings.entrance`.
    expect(ground[0]!.w).toBe(
      Math.min(
        Math.max(500 * entrance.share_of_wall!, cm(entrance.width_m!)),
        cm(entrance.max_width_m!),
      ),
    );
    expect(mainDoorOf(frame.openings)).toBeNull();
  });

  it('ban công mặt tiền bắt buộc: mỗi tầng trên một dải suốt bề ngang và một cửa ra ban công', () => {
    expect(frame.balconies.map((b) => [b.level, b.x0, b.x1])).toEqual([
      [2, 0, 500],
      [3, 0, 500],
    ]);
    const upper = frame.openings.filter((o) => o.level > 1);
    expect(upper.map((o) => [o.level, o.kind, o.w])).toEqual([
      [2, 'door', cm(entrance.width_m!)],
      [3, 'door', cm(entrance.width_m!)],
    ]);
  });

  it('lỗ mở nằm gọn trong thân tầng và không chồng nhau', () => {
    for (const o of frame.openings) {
      expect(o.x).toBeGreaterThanOrEqual(frame.x0);
      expect(o.x + o.w).toBeLessThanOrEqual(frame.x1);
      const level = frame.levels.find((l) => l.level === o.level)!;
      expect(o.sill + o.h).toBeLessThanOrEqual(level.h);
    }
  });

  it('cốt nền đầu bài khai thì dùng số ấy, không dùng mặc định kb', () => {
    const raised = facadeFrameFromBrief(
      { ...townhouse(), entrance: { floor_above_road_m: 0.75 } } as AiBriefDigest,
      norms,
    );
    expect(raised.groundZ).toBe(-75);
  });
});

describe('Khung từ đầu bài — biệt thự 15 × 20 m', () => {
  const frame = facadeFrameFromBrief(villa(), norms);
  const bays = Math.round(1500 / cm(rules.bay_width_m));

  it('lùi trước 4 m thì có sân trước; mặt tiền chia khoang theo kb', () => {
    expect(frame.frontYard).toBe(true);
    expect(frame.width).toBe(1500);
    expect(frame.openings.filter((o) => o.level === 1)).toHaveLength(bays);
    expect(frame.openings.filter((o) => o.level === 2)).toHaveLength(bays);
  });

  it('không ô tô: tầng 1 có đúng một cửa chính, còn lại cửa sổ; không khai ban công thì không có', () => {
    const ground = frame.openings.filter((o) => o.level === 1);
    expect(ground.filter((o) => o.kind === 'door')).toHaveLength(1);
    expect(ground.filter((o) => o.kind === 'garage')).toHaveLength(0);
    expect(mainDoorOf(frame.openings)?.w).toBe(cm(entrance.width_m!));
    for (const o of ground.filter((g) => g.kind === 'window')) {
      expect(o.sill).toBe(cm(win.sill_m!));
      expect(o.h).toBe(cm(win.height_m!));
      expect(o.w).toBeLessThanOrEqual(cm(win.max_width_m!));
    }
    expect(frame.balconies).toEqual([]);
  });

  it('lối vào chính KHÔNG ở mặt tiền thì không vẽ cửa chính ra đường', () => {
    const side = facadeFrameFromBrief(
      { ...villa(), site: { ...villa().site, main_entrance_side: 'left' } },
      norms,
    );
    expect(side.openings.filter((o) => o.kind === 'door')).toHaveLength(0);
  });
});

describe('Khung từ đầu bài — chỗ không dựng được', () => {
  it('kb thiếu mục from_brief thì nói rõ, không tự dựng số', () => {
    const bare: ConstructionNorms = {
      ...norms,
      facade: { ground_floor_raise_m: 0.45, parapet_height_m: 0.9 },
    };
    expect(() => facadeFrameFromBrief(villa(), bare)).toThrow(FacadeFrameError);
  });

  it('khoảng lùi ăn hết thửa thì nói rõ', () => {
    const eaten = {
      ...villa(),
      site: { ...villa().site, setback_required_m: { front: 20, back: 0, left: 0, right: 0 } },
    } as AiBriefDigest;
    expect(() => facadeFrameFromBrief(eaten, norms)).toThrow(/không còn phần đất xây được/);
  });
});

describe('Ghép, kiểm và phối cảnh trên khung từ đầu bài', () => {
  const frame = facadeFrameFromBrief(townhouse(), norms);
  const concept = mergeFacade(frame, PROPOSAL, facadeVocab, {
    planRef: null,
    source: 'brief',
    generator: {
      kind: 'ai',
      provider: 'fake',
      model: 'fake-1',
      route: 'ai_text_fake',
      prompt_version: '1',
    },
  });

  it('ý tưởng qua hợp đồng với plan_ref rỗng và source brief', () => {
    const parsed = aiFacadeConceptSchema.safeParse(concept);
    expect(parsed.success).toBe(true);
    expect(concept.plan_ref).toBeNull();
    expect(concept.source).toBe('brief');
    expect(checkFacade(PROPOSAL, frame, facadeVocab)).toEqual([]);
  });

  it('tờ mặt đứng và ảnh neo vẽ được không cần mặt bằng (không lưới trục)', () => {
    const options = {
      style: parseSheetStyle(read('kb/sheet_style.yaml')),
      detail: facadeDetailKb,
      vocab: facadeVocab,
      plan: null,
      railingHeightCm: cm(norms.outdoor.railing_h_m),
      legend: facadeLegend(concept, facadeVocab),
      openingStyles: { main: null, side: null, garage: null },
    };
    expect(renderElevationSheet(concept, options).svg).toContain('<svg');
    expect(renderElevationAnchor(concept, options).widthPx).toBeGreaterThan(0);
  });

  it('ý tưởng dựng từ mặt bằng KHÔNG mang khoá source — mã băm của lượt cũ không đổi', () => {
    const fromPlan = mergeFacade(frame, PROPOSAL, facadeVocab, {
      planRef: `sha256:${'a'.repeat(64)}`,
      generator: concept.generator,
    });
    expect('source' in fromPlan).toBe(false);
  });

  it('phối cảnh không có mặt bằng: đủ năm góc, góc nghiêng / trên cao dựng từ tấm ban ngày', () => {
    const plan = perspectivePlan(concept, ['elevation']);
    expect(plan.skipped).toEqual([]);
    expect(plan.steps.map((s) => s.view)).toEqual([
      'front_day',
      'front_night',
      'balcony_close',
      'oblique',
      'aerial',
    ]);
    for (const step of plan.steps.slice(1)) {
      expect(step.sources).toEqual([{ image: 'front_day' }]);
    }
  });

  it('phối cảnh không có mặt bằng: chiều sâu và sân lấy từ ô xây được của đầu bài', () => {
    const ctx = perspectiveContext(villa(), null, {
      ...concept,
      elevation: { ...concept.elevation, width: 1500 },
    });
    expect(ctx.depthM).toBe(16);
    expect(ctx.yard).toEqual({ frontM: 4, backM: 0, leftM: 0, rightM: 0 });
  });
});

const PARAMS: AiDesignParams = {
  runId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  companyId: '00000000-0000-4000-8000-000000000003',
  projectId: '00000000-0000-4000-8000-000000000004',
  actorId: null,
  discipline: 'kien_truc',
  stage: 'facade',
  textRoute: 'ai_text_fake',
  briefRef: `sha256:${'c'.repeat(64)}`,
  digest: townhouse(),
  rulePacks: { standards: false, experience: false },
  variants: [],
  planRef: null,
  facadeBriefRef: null,
};

function stepDeps(answer: unknown) {
  const inserts: Record<string, unknown>[] = [];
  const writes: Record<string, unknown>[] = [];
  const client: TextModelClient = {
    async complete() {
      return { json: answer, ...FAKE_CALL, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
  const repo = {
    db: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
      }),
    },
    // Đầu bài không có phần mặt đứng: `facadeBriefOfArtifact` trả `null` → lượt chạy không kèm phiếu.
    get: async (id: string) =>
      id === PARAMS.briefRef
        ? { id, kind: 'design_brief', payload: TOWNHOUSE, createdAt: '' }
        : null,
    write: async (input: Record<string, unknown>) => {
      writes.push(input);
      return { id: `sha256:${'f'.repeat(64)}`, reused: false };
    },
  };
  const deps = {
    client,
    prompts,
    construction: norms,
    outdoor,
    vocab: facadeVocab,
    quality: parseFacadeQuality(read('kb/facade_quality.yaml')),
    repo,
    provider: 'fake',
    model: 'fake-1',
  } as unknown as FacadeStepDeps;
  return { deps, inserts, writes };
}

describe('Hai bước của lượt chạy nền khi CHƯA có mặt bằng', () => {
  it('đề xuất: lời dẫn mang khung từ đầu bài, ghi nhật ký «ok»', async () => {
    const { deps, inserts } = stepDeps(PROPOSAL);
    const outcome = await proposeFacadeStep(deps, PARAMS, 1, null);
    expect(outcome.proposalJson).not.toBeNull();
    expect(inserts[0]).toMatchObject({ purpose: 'facade', status: 'ok', data_class: 2 });
  });

  it('ghi: ý tưởng đúng hợp đồng, plan_ref rỗng, source brief, cha là ĐẦU BÀI (một lần)', async () => {
    const { deps, writes } = stepDeps(PROPOSAL);
    await writeFacadeStep(deps, PARAMS, JSON.stringify(PROPOSAL), FAKE_CALL, 1);
    const [write] = writes;
    expect(write).toMatchObject({ kind: 'ai_facade_concept', inputs: [PARAMS.briefRef] });
    const payload = aiFacadeConceptSchema.parse(write?.payload);
    expect(payload.plan_ref).toBeNull();
    expect(payload.source).toBe('brief');
    expect(payload.openings_front).toEqual(facadeFrameFromBrief(townhouse(), norms).openings);
  });
});
