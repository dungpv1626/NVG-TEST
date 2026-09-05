/**
 * Đường chạy đồng bộ của Lớp 3 — sinh, liệt kê, chọn phương án (vướng mắc V-10).
 *
 * Kho artifact và Container đều là bản GIẢ trong bộ nhớ: bộ này canh cách điều phối
 * (lineage, bản hiệu lực, không giải lại), không canh bộ giải — bộ giải có `pipeline-e2e`.
 *
 * Bốn điều canh:
 *  1. Ba biến thể → ba mặt bằng, mỗi cái treo dưới đúng ý đồ của nó, ý đồ treo dưới chương
 *     trình. Chưa có bản hiệu lực thì chọn sẵn bản khả thi đầu tiên.
 *  2. Sinh lại với cùng chương trình KHÔNG gọi bộ giải lần nữa.
 *  3. Chọn phương án khác chuyển CẢ hai con trỏ (ý đồ + mặt bằng); mã của dự án khác bị từ chối.
 *  4. Vô nghiệm là kết quả hạng nhất: nằm trong danh sách kèm lời giải thích, không phải lỗi,
 *     và không bao giờ được chọn làm bản hiệu lực.
 */

import { describe, expect, it } from 'vitest';
import { artifactId, type FloorPlan, type SpaceProgram } from '@nvg/shared/design';
import type { ArtifactKind, PipelineStep } from '@nvg/shared/design';
import type { ArtifactScope } from '../artifacts';
import type { ComputeBackend, SolveRequest, SolveResponse } from '../compute-backend';
import { parseSiteContext } from '../layout/site-context';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import {
  chooseVariant,
  generateVariants,
  listVariants,
  VariantsPrerequisiteMissing,
  type VariantContext,
  type VariantRepo,
} from '../layout/variants';
import { summariseFloorPlan } from '../layout/summary';
import { testSiteContextYaml, testVocabularyYaml } from './program-fixtures';

const REF = `sha256:${'a'.repeat(64)}`;
type Space = SpaceProgram['spaces'][number];

function space(id: string, type: string, floor: number, extra: Partial<Space> = {}): Space {
  return {
    id,
    type,
    floor,
    min_area_m2: 6,
    target_area_m2: 12,
    max_area_m2: 30,
    ...extra,
  } as Space;
}

const program = (): SpaceProgram =>
  ({
    schema_version: '1.0.0',
    brief_ref: REF,
    spaces: [
      space('stair_1', 'stair', 1),
      space('circulation_1', 'circulation', 1),
      space('garage_1', 'garage', 1, { priority: 4 }),
      space('living_1', 'living', 1, { needs_daylight: true, priority: 1 }),
      space('kitchen_1', 'kitchen', 1, { needs_daylight: true, priority: 3 }),
      space('stair_2', 'stair', 2),
      space('circulation_2', 'circulation', 2),
      space('bedroom_1', 'bedroom', 2, { needs_daylight: true, priority: 2 }),
      space('bedroom_2', 'bedroom', 2, { needs_daylight: true, priority: 2 }),
      space('altar_room_1', 'altar_room', 2, { priority: 3 }),
    ],
  }) as SpaceProgram;

const brief = {
  schema_version: '1.0.0',
  project_id: '22222222-2222-4222-8222-222222222222',
  building_type: 'nha_pho',
  locality: 'hung_yen',
  site: { width_m: 5, depth_m: 18 },
  floors: 2,
  family: [{ role: 'vo_chong', count: 2 }],
};

/** Mặt bằng giả: mỗi phòng một dải ngang 5 m, đủ để tóm tắt và băm ra mã khác nhau theo ý đồ. */
function fakePlan(intentRef: string, spaces: Space[]): FloorPlan {
  const levels = [...new Set(spaces.map((s) => s.floor))].sort().map((level) => {
    let y = 0;
    const rooms = spaces
      .filter((s) => s.floor === level)
      .map((s) => {
        const depth = s.type === 'bedroom' ? 4 : 3;
        const polygon: [number, number][] = [
          [0, y],
          [5, y],
          [5, y + depth],
          [0, y + depth],
        ];
        y += depth;
        return { id: s.id, type: s.type, polygon, area_m2: 5 * depth, has_daylight: true };
      });
    return { level, height_m: level === 2 ? 3.9 : 3.6, rooms, voids: [], walls: [], openings: [] };
  });
  return {
    schema_version: '1.0.0',
    intent_ref: intentRef,
    rule_pack_version: '2026.08.1',
    site: { width_m: 5, depth_m: 18 },
    structural_grid: { axes_x_m: [0, 5], axes_y_m: [0, 18] },
    levels,
    cores: [],
    constraint_report: { status: 'pass', violations: [] },
  } as FloorPlan;
}

class FakeRepo implements VariantRepo {
  artifacts = new Map<string, { kind: ArtifactKind; payload: unknown; createdAt: string }>();
  heads = new Map<string, string>();
  edges: Array<{ from: string; to: string; step: PipelineStep; params: string }> = [];
  private tick = 0;

  async write(input: Parameters<VariantRepo['write']>[0]) {
    const id = await artifactId(input.payload);
    const reused = this.artifacts.has(id);
    if (!reused) {
      this.tick += 1;
      this.artifacts.set(id, {
        kind: input.kind,
        payload: input.payload,
        createdAt: new Date(2026, 8, 6, 0, 0, this.tick).toISOString(),
      });
    }
    for (const from of input.inputs ?? []) {
      const params = JSON.stringify(input.params ?? {});
      if (!this.edges.some((e) => e.from === from && e.to === id && e.step === input.step)) {
        this.edges.push({ from, to: id, step: input.step!, params });
      }
    }
    if (input.setHead !== false) await this.setHead(input.scope, input.kind, id);
    return { id, kind: input.kind, payloadUri: `mem://${id}`, reused };
  }
  async setHead(scope: ArtifactScope, kind: ArtifactKind, id: string) {
    this.heads.set(`${scope.projectId}/${scope.discipline}/${kind}`, id);
  }
  async head(projectId: string, discipline: string, kind: ArtifactKind) {
    const id = this.heads.get(`${projectId}/${discipline}/${kind}`);
    if (!id) return null;
    return { id, payload: this.artifacts.get(id)!.payload };
  }
  async get(id: string, _projectId: string) {
    const found = this.artifacts.get(id);
    return found ? { id, ...found } : null;
  }
  async findComputed(fromId: string, step: PipelineStep, params: unknown) {
    const key = JSON.stringify(params ?? {});
    return (
      this.edges.find((e) => e.from === fromId && e.step === step && e.params === key)?.to ?? null
    );
  }
  async edgesFrom(fromId: string, step: PipelineStep) {
    return this.edges.filter((e) => e.from === fromId && e.step === step).map((e) => e.to);
  }
  async lineage(id: string) {
    return this.edges
      .filter((e) => e.to === id)
      .map((e) => ({ fromId: e.from, step: e.step, paramsHash: e.params }));
  }
}

class FakeCompute implements ComputeBackend {
  readonly name = 'fake';
  calls = 0;
  /** Biến thể vô nghiệm theo mã, để canh đường vô nghiệm. */
  infeasible = new Set<string>();
  async health() {
    return true;
  }
  async solve(request: SolveRequest): Promise<SolveResponse> {
    this.calls += 1;
    const variant = (request.intent as { variant_id?: string }).variant_id ?? '';
    if (this.infeasible.has(variant)) {
      return {
        status: 'infeasible',
        report: {
          schema_version: '1.0.0',
          status: 'infeasible',
          rule_pack_version: '2026.08.1',
          conflict_set: [{ rule_id: 'min_room_width', involved: ['living_1'] }],
          human_message: 'Phòng khách không đủ bề rộng tối thiểu.',
          suggested_relaxations: [],
        },
        solve_time_ms: 3,
      };
    }
    return {
      status: 'ok',
      floor_plan: fakePlan(request.intent_ref, (request.program as SpaceProgram).spaces),
      solve_time_ms: 6,
    };
  }
  async exportDxf(): Promise<ArrayBuffer> {
    throw new Error('không dùng trong bộ này');
  }
  async exportSvg(): Promise<string> {
    throw new Error('không dùng trong bộ này');
  }
  async schedules(): Promise<unknown> {
    throw new Error('không dùng trong bộ này');
  }
  async exportXlsx(): Promise<ArrayBuffer> {
    throw new Error('không dùng trong bộ này');
  }
  async extract(): Promise<{ status: 'ok'; extraction: unknown }> {
    throw new Error('không dùng trong bộ này');
  }
  async buildKbRecord(): Promise<never> {
    throw new Error('không dùng trong bộ này');
  }
}

async function setup(compute = new FakeCompute()) {
  const repo = new FakeRepo();
  const scope: ArtifactScope = {
    tenantId: 't',
    companyId: 'c',
    projectId: brief.project_id,
    discipline: 'kien_truc',
    actorId: null,
  };
  const vocabulary = parseVocabulary(testVocabularyYaml());
  const viByType: Record<string, string> = {};
  for (const t of vocabulary.types) viByType[t.code] = t.vi;
  const ctx: VariantContext = {
    repo,
    compute,
    scope,
    siteContext: parseSiteContext(testSiteContextYaml()),
    viByType,
    groups: roomGroups(vocabulary),
  };
  const b = await repo.write({ scope, kind: 'design_brief', payload: brief });
  await repo.write({
    scope,
    kind: 'space_program',
    payload: program(),
    inputs: [b.id],
    step: 'layer2_program',
  });
  return { repo, compute, ctx };
}

describe('Sinh phương án mặt bằng — đường chạy đồng bộ', () => {
  it('ba biến thể → ba mặt bằng có lineage, bản khả thi đầu tiên được chọn sẵn', async () => {
    const { repo, compute, ctx } = await setup();
    const outcome = await generateVariants(ctx);

    expect(outcome.results.map((r) => r.variantId)).toEqual(['A', 'B', 'C']);
    expect(outcome.results.every((r) => r.kind === 'floor_plan')).toBe(true);
    expect(compute.calls).toBe(3);
    expect(outcome.headArtifactId).toBe(outcome.results[0]!.artifactId);
    expect(await repo.head(ctx.scope.projectId, 'kien_truc', 'layout_intent')).toMatchObject({
      id: outcome.results[0]!.intentArtifactId,
    });

    const listing = await listVariants(ctx);
    expect(listing.variants).toHaveLength(3);
    expect(listing.variants.map((v) => [v.variantId, v.isHead])).toEqual([
      ['A', true],
      ['B', false],
      ['C', false],
    ]);
    const a = listing.variants[0]!.summary!;
    expect(a.bedrooms).toBe(2);
    expect(a.altar_level).toBe(2);
    expect(a.garage_level).toBe(1);
    expect(a.levels.map((l) => l.height_m)).toEqual([3.6, 3.9]);
    // Nhãn theo tiếng Việt, đánh số khi cùng loại có nhiều phòng.
    expect(a.levels[1]!.rooms.map((r) => r.label)).toContain('Phòng ngủ 2');
  });

  it('sinh lại cùng chương trình thì không giải lại', async () => {
    const { compute, ctx } = await setup();
    await generateVariants(ctx);
    const again = await generateVariants(ctx);
    expect(compute.calls).toBe(3);
    expect(again.results.every((r) => r.reused)).toBe(true);
  });

  it('chọn phương án khác chuyển cả ý đồ lẫn mặt bằng; sinh lại không đổi lựa chọn', async () => {
    const { repo, ctx } = await setup();
    const first = await generateVariants(ctx);
    const b = first.results[1]!;
    await chooseVariant(ctx, b.artifactId);

    expect((await repo.head(ctx.scope.projectId, 'kien_truc', 'floor_plan'))?.id).toBe(
      b.artifactId,
    );
    expect((await repo.head(ctx.scope.projectId, 'kien_truc', 'layout_intent'))?.id).toBe(
      b.intentArtifactId,
    );
    const again = await generateVariants(ctx);
    expect(again.headArtifactId).toBe(b.artifactId);
    expect((await listVariants(ctx)).variants.find((v) => v.isHead)?.variantId).toBe('B');
  });

  it('không chọn được thứ không phải mặt bằng của dự án này', async () => {
    const { ctx } = await setup();
    await generateVariants(ctx);
    await expect(chooseVariant(ctx, REF)).rejects.toBeInstanceOf(VariantsPrerequisiteMissing);
  });

  it('vô nghiệm nằm trong danh sách kèm lời giải thích, không phải lỗi và không làm bản hiệu lực', async () => {
    const compute = new FakeCompute();
    compute.infeasible.add('A');
    const { ctx } = await setup(compute);
    const outcome = await generateVariants(ctx);

    expect(outcome.results[0]).toMatchObject({ variantId: 'A', kind: 'infeasibility_report' });
    expect(outcome.headArtifactId).toBe(outcome.results[1]!.artifactId);

    const listing = await listVariants(ctx);
    const a = listing.variants.find((v) => v.variantId === 'A')!;
    expect(a.status).toBe('infeasible');
    expect(a.infeasibility?.message).toMatch(/bề rộng/);
    expect(a.infeasibility?.conflictRules).toEqual(['min_room_width']);
    expect(a.isHead).toBe(false);
  });

  it('chưa chốt chương trình không gian thì nói rõ, không giải', async () => {
    const compute = new FakeCompute();
    const repo = new FakeRepo();
    const ctx: VariantContext = {
      repo,
      compute,
      scope: {
        tenantId: 't',
        companyId: 'c',
        projectId: 'p',
        discipline: 'kien_truc',
        actorId: null,
      },
      siteContext: parseSiteContext(testSiteContextYaml()),
      viByType: {},
      groups: {},
    };
    await expect(generateVariants(ctx)).rejects.toThrow(/đầu bài/);
    expect(compute.calls).toBe(0);
  });
});

describe('Bảng so sánh bằng ngôn ngữ khách', () => {
  it('tỉ lệ giao thông và số phòng ngủ đọc từ nhóm mã phòng, không viết cứng', () => {
    const plan = fakePlan(REF, program().spaces);
    const groups = roomGroups(parseVocabulary(testVocabularyYaml()));
    const summary = summariseFloorPlan(plan, {}, groups);
    // Tầng 1: thang 15 + hành lang 15 + gara 15 + khách 15 + bếp 15 = 75; tầng 2: 15+15+20+20+15 = 85.
    expect(summary.total_area_m2).toBe(160);
    expect(summary.circulation_share).toBeCloseTo(60 / 160, 3);
    expect(summary.bedrooms).toBe(2);
    // Không có nhóm thì không có con số — không đoán.
    expect(summariseFloorPlan(plan, {}, {}).circulation_share).toBe(0);
  });
});
