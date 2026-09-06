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
import { ruleCatalogue, summariseFloorPlan } from '../layout/summary';
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
/**
 * Mặt bằng giả.
 *
 * `rulePackVersion` mang phiên bản bộ giải vào NỘI DUNG: hai lần giải bằng hai phiên bản mã
 * khác nhau phải cho ra hai artifact khác mã băm, đúng như ngoài đời (bản có lối vào nhà và
 * bản không có). Nếu để giống hệt nhau thì mọi bài về bộ nhớ đệm đều xanh vì lý do sai — hai
 * lần ghi ra cùng một mã băm, chứ không phải vì cơ chế làm đúng.
 */
function fakePlan(intentRef: string, spaces: Space[], rulePackVersion = '2026.08.1'): FloorPlan {
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
    rule_pack_version: rulePackVersion,
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
  async listKind(projectId: string, _discipline: string, kind: ArtifactKind, limit = 10) {
    return [...this.artifacts.entries()]
      .filter(([, a]) => a.kind === kind)
      .map(([id, a]) => ({ id, createdAt: a.createdAt }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
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
  /** Dấu vân mã hình học — đổi giá trị này mô phỏng việc dựng lại ảnh Docker sau khi sửa mã. */
  solverVersion: string | null = 'test-solver';
  async health() {
    return { reachable: true, solverVersion: this.solverVersion };
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
      floor_plan: fakePlan(
        request.intent_ref,
        (request.program as SpaceProgram).spaces,
        this.solverVersion ?? 'khong-ro',
      ),
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
  async exportGlb(): Promise<ArrayBuffer> {
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
    // Lớp 4 tất định đi liền sau mỗi mặt bằng khả thi, và bản hiệu lực của nó đi theo mặt bằng.
    for (const r of outcome.results) {
      expect(await repo.edgesFrom(r.artifactId, 'layer4_arch')).toHaveLength(1);
    }
    const archHead = await repo.head(ctx.scope.projectId, 'kien_truc', 'arch_model');
    expect(archHead).not.toBeNull();
    expect((archHead!.payload as { floorplan_ref: string }).floorplan_ref).toBe(
      outcome.results[0]!.artifactId,
    );

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

  it('đổi mã hình học của Container thì GIẢI LẠI, không dùng lại mặt bằng cũ', async () => {
    // Bài học 06/09/2026: khoá bộ nhớ đệm trước đây chỉ có (địa phương, ngân sách thời gian,
    // biến thể) — không có mã nguồn của Container. Nên sửa xong chỗ đặt cửa vào nhà, dựng lại
    // ảnh Docker rồi chạy lại, bộ giải báo 0ms và trả về đúng mặt bằng cũ KHÔNG có lối vào.
    // Hỏng im lặng: không lỗi, không cảnh báo, chỉ là bản vá không tới được người xem.
    const { compute, ctx } = await setup();
    await generateVariants(ctx);
    expect(compute.calls).toBe(3);

    compute.solverVersion = 'sau-khi-sua-bo-dung-tuong';
    await generateVariants(ctx);
    // Điều được canh là bộ giải CÓ CHẠY LẠI. Cờ `reused` thì không: nó nói artifact cùng mã
    // băm đã tồn tại, và với một bộ giải giả trả về y hệt thì nó vẫn đúng — đó chính là điều
    // cơ chế băm nội dung phải làm.
    expect(compute.calls).toBe(6);
  });

  it('giải lại vì đổi mã hình học KHÔNG làm bảng so sánh mọc thêm cột', async () => {
    // Cùng một ý đồ, hai lần giải bằng hai phiên bản mã khác nhau → hai mặt bằng treo dưới
    // cùng một nút lineage. Trả cả hai ra màn hình thì bảng so sánh có năm cột cho ba biến
    // thể, hai cột cùng tên "Phương án A" với đúng những con số ấy (đo được 06/09/2026).
    const { compute, ctx } = await setup();
    await generateVariants(ctx);
    compute.solverVersion = 'phien-ban-khac';
    await generateVariants(ctx);

    const listing = await listVariants(ctx);
    expect(listing.variants.map((v) => v.variantId)).toEqual(['A', 'B', 'C']);
  });

  it('giải lại cùng biến thể thì bản đang hiệu lực chuyển sang bản mới của chính nó', async () => {
    // Không chuyển thì màn hình nửa nọ nửa kia: thẻ tóm tắt lấy bản mới, tờ bản vẽ vẽ bản cũ
    // (đo được 06/09/2026 — thẻ ghi phòng khách 16 m², bản vẽ ghi 20 m²). Lựa chọn của kiến
    // trúc sư là BIẾN THỂ A/B/C và nó không đổi; thứ đổi là bản tính của chính biến thể ấy.
    const { compute, ctx } = await setup();
    const first = await generateVariants(ctx);
    const headBefore = first.headArtifactId;
    expect(headBefore).toBeTruthy();

    compute.solverVersion = 'sau-khi-sua-bo-dung-tuong';
    const second = await generateVariants(ctx);
    expect(second.headArtifactId).not.toBe(headBefore);

    const listing = await listVariants(ctx);
    const head = listing.variants.find((v) => v.isHead);
    expect(head?.artifactId).toBe(second.headArtifactId);
    // …và biến thể được chọn vẫn là biến thể cũ.
    expect(head?.variantId).toBe(first.results.find((r) => r.artifactId === headBefore)?.variantId);
  });

  it('Container không nói ra được phiên bản thì giải lại, KHÔNG đoán là vẫn như cũ', async () => {
    const { compute, ctx } = await setup();
    await generateVariants(ctx);
    compute.solverVersion = null;
    await generateVariants(ctx);
    expect(compute.calls).toBe(6);
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
    expect(
      (
        (await repo.head(ctx.scope.projectId, 'kien_truc', 'arch_model'))?.payload as {
          floorplan_ref: string;
        }
      ).floorplan_ref,
    ).toBe(b.artifactId);
    const again = await generateVariants(ctx);
    expect(again.headArtifactId).toBe(b.artifactId);
    expect((await listVariants(ctx)).variants.find((v) => v.isHead)?.variantId).toBe('B');
  });

  it('đổi chương trình không gian: đợt trước vẫn còn để so sánh, đợt mới là hiện hành', async () => {
    const { repo, ctx } = await setup();
    const first = await generateVariants(ctx);

    // Khách đổi ý: thêm phòng ngủ ở tầng 3 → chương trình mới → giải lại.
    const changed = program();
    changed.spaces.push(space('bedroom_3', 'bedroom', 3, { needs_daylight: true }));
    changed.spaces.push(space('stair_3', 'stair', 3));
    changed.spaces.push(space('circulation_3', 'circulation', 3));
    const brief = await repo.head(ctx.scope.projectId, 'kien_truc', 'design_brief');
    await repo.write({
      scope: ctx.scope,
      kind: 'space_program',
      payload: changed,
      inputs: [brief!.id],
      step: 'layer2_program',
      params: { v: 2 },
    });
    const second = await generateVariants(ctx);
    expect(second.programArtifactId).not.toBe(first.programArtifactId);

    const listing = await listVariants(ctx);
    expect(listing.variants.map((v) => v.variantId)).toEqual(['A', 'B', 'C']);
    expect(listing.previous).toHaveLength(1);
    expect(listing.previous[0]!.programArtifactId).toBe(first.programArtifactId);
    expect(listing.previous[0]!.variants.map((v) => v.artifactId)).toEqual(
      first.results.map((r) => r.artifactId),
    );
    // Bản hiệu lực CHUYỂN sang đợt mới, giữ nguyên chữ cái phương án đã chọn.
    //
    // Đây không phải "lặng lẽ đổi lựa chọn của kiến trúc sư" — cùng lý lẽ đã ghi cho trường
    // hợp giải lại cùng một ý đồ: lựa chọn của họ là phương án A/B/C, và chữ cái đó giữ
    // nguyên; thứ thay đổi là bản tính của chính phương án ấy, lần này vì chương trình không
    // gian đã đổi. Giữ bản cũ mới là hại: nó là hậu duệ của một chương trình đã bị thay, nên
    // màn hình vẽ một công trình khác công trình đang được yêu cầu, và không có gì nói ra
    // điều đó. Đo được 06/09/2026 trên dự án demo: đầu bài lên 5 tầng, bản vẽ hiệu lực ở lại
    // 4 tầng, phát hiện được chỉ bằng cách đếm số nút chọn tầng.
    const headLetter = second.results.find((r) => r.artifactId === listing.headArtifactId);
    const firstHeadLetter = first.results.find((r) => r.artifactId === first.headArtifactId);
    expect(listing.headArtifactId).not.toBe(first.headArtifactId);
    expect(headLetter?.variantId).toBe(firstHeadLetter?.variantId);
    expect(listing.headStale).toBe(false);
  });

  it('bản hiệu lực thuộc chương trình cũ mà chưa sinh lại thì bị khai là lạc hậu', async () => {
    const { repo, ctx } = await setup();
    await generateVariants(ctx);

    // Chốt một chương trình không gian mới nhưng KHÔNG sinh lại phương án — đúng trạng thái
    // đã xảy ra thật. Con trỏ bản hiệu lực không tự đổi ở tuyến ĐỌC, nên phải nói ra.
    const changed = program();
    changed.spaces.push(space('bedroom_3', 'bedroom', 3, { needs_daylight: true }));
    changed.spaces.push(space('stair_3', 'stair', 3));
    changed.spaces.push(space('circulation_3', 'circulation', 3));
    const brief = await repo.head(ctx.scope.projectId, 'kien_truc', 'design_brief');
    await repo.write({
      scope: ctx.scope,
      kind: 'space_program',
      payload: changed,
      inputs: [brief!.id],
      step: 'layer2_program',
      params: { v: 2 },
    });

    const listing = await listVariants(ctx);
    expect(listing.headStale).toBe(true);
    // Và tuyến đọc KHÔNG tự sửa: mở một màn hình không phải là một thao tác.
    expect(listing.headArtifactId).not.toBeNull();
    expect(listing.variants.some((v) => v.artifactId === listing.headArtifactId)).toBe(false);
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

describe('Nguồn quy tắc đi kèm kết quả kiểm tra ràng buộc', () => {
  const RULES = [
    {
      id: 'corridor_min_width',
      applies_to: ['nha_pho', 'biet_thu'],
      scope: 'floor',
      predicate: 'min_dimension',
      severity: 'error' as const,
      source: 'QCVN 01:2021/BXD',
      params: {},
    },
    {
      id: 'altar_on_top',
      applies_to: ['nha_pho'],
      scope: 'building',
      predicate: 'floor_preference',
      severity: 'warning' as const,
      source: 'kinh nghiệm NVG',
      params: {},
    },
    {
      id: 'garden_setback',
      applies_to: ['nha_vuon'],
      scope: 'building',
      predicate: 'setback',
      severity: 'error' as const,
      source: 'QCVN 01:2021/BXD',
      params: {},
    },
  ];

  function planWith(violations: { rule_id: string; severity: 'error' | 'warning' }[]) {
    const plan = fakePlan(REF, program().spaces);
    return {
      ...plan,
      constraint_report: {
        status: violations.length ? ('warning' as const) : ('pass' as const),
        violations: violations.map((v) => ({ ...v, message: `vi phạm ${v.rule_id}` })),
      },
    };
  }

  it('mẫu số chỉ đếm quy tắc áp cho ĐÚNG loại công trình', () => {
    // `garden_setback` chỉ áp cho nhà vườn — đếm nó vào mẫu số của một dự án nhà phố là báo
    // cáo hệ thống đã kiểm một quy tắc chưa từng chạy.
    expect(ruleCatalogue(RULES, 'nha_pho').checked).toBe(2);
    expect(ruleCatalogue(RULES, 'nha_vuon').checked).toBe(1);
  });

  it('mỗi vi phạm mang nguồn nguyên văn và cờ chặn phát hành', () => {
    const summary = summariseFloorPlan(
      planWith([{ rule_id: 'altar_on_top', severity: 'warning' }]),
      {},
      {},
      ruleCatalogue(RULES, 'nha_pho'),
    );
    expect(summary.rulesChecked).toBe(2);
    expect(summary.rulesPassed).toBe(1);
    expect(summary.violations[0]).toMatchObject({
      source: 'kinh nghiệm NVG',
      blocking: false,
    });
  });

  it('quy tắc không tra được thì nguồn RỖNG, không suy từ mức độ nghiêm trọng', () => {
    const summary = summariseFloorPlan(
      planWith([{ rule_id: 'khong_co_trong_goi', severity: 'error' }]),
      {},
      {},
      ruleCatalogue(RULES, 'nha_pho'),
    );
    expect(summary.violations[0]!.source).toBeNull();
    expect(summary.violations[0]!.blocking).toBe(true);
  });

  it('không có gói quy tắc thì mẫu số bằng 0, không bịa một con số', () => {
    const summary = summariseFloorPlan(planWith([]), {}, {});
    expect(summary.rulesChecked).toBe(0);
    expect(summary.rulesPassed).toBe(0);
  });

  it('số quy tắc đạt không bao giờ âm dù gói và bản vẽ lệch phiên bản', () => {
    const summary = summariseFloorPlan(
      planWith([
        { rule_id: 'a', severity: 'error' },
        { rule_id: 'b', severity: 'error' },
        { rule_id: 'c', severity: 'error' },
      ]),
      {},
      {},
      ruleCatalogue(RULES, 'nha_vuon'),
    );
    expect(summary.rulesPassed).toBe(0);
  });
});
