/**
 * Pipeline giả chạy từ đầu tới cuối — điều kiện ra của Mốc 1.
 *
 * "Chạy được một pipeline giả từ đầu đến cuối bằng stub, mọi artifact có mã băm và lineage;
 * truy vấn được bản nào đang hiệu lực cho một dự án" (`doc/design/08-milestones.md`).
 *
 * Test này đi qua CẢ HAI runtime thật: Worker (`ArtifactRepository`, kho Supabase Storage,
 * bảng artifact có RLS) và Container (bộ giải CP-SAT trong Docker). Đó là chủ ý — khung
 * xương chỉ có giá trị khi ranh giới giữa hai runtime thật sự thông, và ranh giới là thứ
 * duy nhất không kiểm được bằng bài kiểm thử một phía.
 *
 * Bỏ qua khi chưa dựng Container:
 *     docker run --rm -d -p 8080:8080 nvg-design-compute
 *     DESIGN_COMPUTE_URL=http://localhost:8080 npx vitest run --project logic \
 *       workers/src/design/__tests__/pipeline-e2e.test.ts
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ARTIFACT_ID_PATTERN, artifactId } from '@nvg/shared/design';
import { ArtifactRepository, type ArtifactScope } from '../artifacts';
import { HttpComputeBackend } from '../compute-backend';
import type { DesignEnv } from '../env';
import { solveFloorPlan, buildArchModel, layoutIntent, stubRenderResult } from '../workflows/steps';
import { buildSpaceProgram } from '../program/engine';
import { chooseVariant, generateVariants, listVariants } from '../layout/variants';
import { parseSiteContext } from '../layout/site-context';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { testSiteContextYaml, testVocabularyYaml } from './program-fixtures';
import { testNorms, testRulePack } from './program-fixtures';

const computeUrl = process.env.DESIGN_COMPUTE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ready = Boolean(computeUrl && supabaseUrl && serviceKey);
const describeE2e = ready ? describe : describe.skip;

const TEST_PREFIX = '[TEST]';

describeE2e('Pipeline khung xương — đầu bài tới ảnh phối cảnh', () => {
  let env: DesignEnv;
  let repo: ArtifactRepository;
  let admin: SupabaseClient;
  let scope: ArtifactScope;
  let brief: Record<string, unknown>;

  beforeAll(async () => {
    env = {
      SUPABASE_URL: supabaseUrl!,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey!,
      DESIGN_COMPUTE_URL: computeUrl,
    };
    repo = new ArtifactRepository(env);
    admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });

    const tenant = await admin.from('tenants').select('id').eq('code', 'nvg').single();
    const company = await admin.from('companies').select('id').eq('code', 'NVO').single();
    const project = await admin
      .from('design_projects')
      .insert({
        company_id: company.data!.id,
        code: `NVO-TK-2090-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: `${TEST_PREFIX} Pipeline khung xương`,
        stage: 'dau_bai',
      })
      .select('id')
      .single();
    if (project.error) throw new Error(project.error.message);

    scope = {
      tenantId: tenant.data!.id,
      companyId: company.data!.id,
      projectId: project.data.id,
      discipline: 'kien_truc',
      actorId: null,
    };

    // Đầu bài phải có thành phần gia đình, không chỉ kích thước lô.
    //
    // Không khai gia đình thì Lớp 2 không suy ra phòng ngủ nào, và ra một toà nhà ba tầng mà
    // tầng hai tầng ba chỉ có khu vệ sinh. Bộ giải trả vô nghiệm cho thứ đó là ĐÚNG — nhưng
    // đây là phép thử của pipeline, không phải phép thử của một đầu bài vô lý.
    brief = {
      schema_version: '1.0.0',
      project_id: project.data.id,
      building_type: 'nha_pho',
      locality: 'hung_yen',
      site: { width_m: 5, depth_m: 18 },
      floors: 3,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 2 },
      ],
    };
  });

  it('chạy sáu bước, mọi artifact có mã băm và cạnh lineage', async () => {
    const briefArtifact = await repo.write({ scope, kind: 'design_brief', payload: brief });
    expect(briefArtifact.id).toMatch(ARTIFACT_ID_PATTERN);

    const program = buildSpaceProgram({
      brief: brief as never,
      briefRef: briefArtifact.id,
      rules: testRulePack(),
      norms: testNorms(),
    });
    const programArtifact = await repo.write({
      scope,
      kind: 'space_program',
      payload: program.payload,
      inputs: [briefArtifact.id],
      step: 'layer2_program',
      params: { stub: true },
    });

    const intent = layoutIntent(program.payload, programArtifact.id);
    const intentArtifact = await repo.write({
      scope,
      kind: 'layout_intent',
      payload: intent.payload,
      inputs: [programArtifact.id],
      step: 'layer3a_intent',
      params: { stub: true },
    });

    // Bước DUY NHẤT không phải stub: bộ giải thật trong Container.
    const solved = await solveFloorPlan(new HttpComputeBackend(computeUrl!), {
      intent: intent.payload,
      intentRef: intentArtifact.id,
      program: program.payload,
      site: { width_m: 5, depth_m: 18 },
      buildingType: 'nha_pho',
      locality: 'hung_yen',
      timeBudgetS: 30,
    });
    expect(solved.status, JSON.stringify(solved.payload).slice(0, 400)).toBe('ok');
    if (solved.status !== 'ok') return;

    const planArtifact = await repo.write({
      scope,
      kind: 'floor_plan',
      payload: solved.payload,
      inputs: [intentArtifact.id],
      step: 'layer3b_solve',
      params: { locality: 'hung_yen', timeBudgetS: 30 },
    });

    const arch = buildArchModel(solved.payload, planArtifact.id);
    const archArtifact = await repo.write({
      scope,
      kind: 'arch_model',
      payload: arch.payload,
      inputs: [planArtifact.id],
      step: 'layer4_arch',
      params: { stub: true },
    });

    const renderArtifact = await repo.write({
      scope,
      kind: 'render_result',
      payload: stubRenderResult().payload,
      inputs: [archArtifact.id],
      step: 'layer5_render',
      params: { stub: true },
    });

    // Đồ thị phụ thuộc phải đi ngược được về đúng một bước cha ở mỗi mắt xích.
    const lineage = await repo.lineage(planArtifact.id);
    expect(lineage).toHaveLength(1);
    expect(lineage[0]!.fromId).toBe(intentArtifact.id);
    expect(lineage[0]!.step).toBe('layer3b_solve');

    // Bản nào đang hiệu lực — câu hỏi mà cả module sinh ra để trả lời.
    const head = await repo.head(scope.projectId, 'kien_truc', 'floor_plan');
    expect(head?.id).toBe(planArtifact.id);

    // Payload đọc lại từ kho phải khớp với thứ đã ghi (đi qua Supabase Storage thật).
    expect(await artifactId(head!.payload)).toBe(planArtifact.id);

    expect(renderArtifact.id).toMatch(ARTIFACT_ID_PATTERN);
  });

  it('cùng đầu vào và cùng cấu hình → cùng mã băm, không tính lại', async () => {
    // Đây là tính chất idempotent của 02-architecture 2.5. Không có nó thì mỗi lần mở lại một
    // phương án cũ là một lần chạy bộ giải và một dòng artifact mới.
    const first = await repo.write({ scope, kind: 'design_brief', payload: brief });
    const second = await repo.write({ scope, kind: 'design_brief', payload: brief });

    expect(second.id).toBe(first.id);
    expect(second.reused).toBe(true);
    expect(second.payloadUri).toBe(first.payloadUri);

    const { count } = await admin
      .from('design_artifact')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', scope.projectId)
      .eq('kind', 'design_brief');
    expect(count).toBe(1);
  });

  it('tra được kết quả đã tính của một bước qua đồ thị phụ thuộc', async () => {
    const briefArtifact = await repo.write({ scope, kind: 'design_brief', payload: brief });
    const found = await repo.findComputed(briefArtifact.id, 'layer2_program', { stub: true });
    expect(found).toMatch(ARTIFACT_ID_PATTERN);

    // Đổi cấu hình thì KHÔNG được trả về kết quả cũ — đó là ý nghĩa của params_hash.
    const other = await repo.findComputed(briefArtifact.id, 'layer2_program', { stub: false });
    expect(other).toBeNull();
  });

  it('bộ giải vô nghiệm trả lời giải thích đọc được, không phải lỗi', async () => {
    const impossible = structuredClone(
      buildSpaceProgram({
        brief: brief as never,
        briefRef: `sha256:${'a'.repeat(64)}`,
        rules: testRulePack(),
        norms: testNorms(),
      }).payload,
    );
    for (const space of impossible.spaces) {
      space.min_area_m2 = 60;
      space.max_area_m2 = 90;
    }
    const intent = layoutIntent(impossible, `sha256:${'a'.repeat(64)}`);

    const solved = await solveFloorPlan(new HttpComputeBackend(computeUrl!), {
      intent: intent.payload,
      intentRef: `sha256:${'b'.repeat(64)}`,
      program: impossible,
      site: { width_m: 5, depth_m: 18 },
      buildingType: 'nha_pho',
      locality: 'hung_yen',
      timeBudgetS: 20,
    });

    expect(solved.status).toBe('infeasible');
    const report = solved.payload as { human_message: string; conflict_set: unknown[] };
    expect(report.human_message).toMatch(/không thể đồng thời/i);
    expect(report.conflict_set.length).toBeGreaterThan(0);
  });
});

describeE2e('Đường chạy đồng bộ của Lớp 3 — trên kho artifact và Container thật (V-10)', () => {
  it('sinh ba phương án, liệt kê theo lineage, chọn phương án khác', async () => {
    const env: DesignEnv = {
      SUPABASE_URL: supabaseUrl!,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey!,
      DESIGN_COMPUTE_URL: computeUrl,
    };
    const repo = new ArtifactRepository(env);
    const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });
    const tenant = await admin.from('tenants').select('id').eq('code', 'nvg').single();
    const company = await admin.from('companies').select('id').eq('code', 'NVO').single();
    const project = await admin
      .from('design_projects')
      .insert({
        company_id: company.data!.id,
        code: `NVO-TK-2090-${Math.floor(Math.random() * 9000 + 1000)}`,
        name: `${TEST_PREFIX} Ba phương án mặt bằng`,
        stage: 'dau_bai',
      })
      .select('id')
      .single();
    if (project.error) throw new Error(project.error.message);

    const scope: ArtifactScope = {
      tenantId: tenant.data!.id,
      companyId: company.data!.id,
      projectId: project.data.id,
      discipline: 'kien_truc',
      actorId: null,
    };
    const brief = {
      schema_version: '1.0.0',
      project_id: project.data.id,
      building_type: 'nha_pho',
      locality: 'hung_yen',
      site: { width_m: 5, depth_m: 18 },
      floors: 3,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 2 },
      ],
    };
    const briefArtifact = await repo.write({ scope, kind: 'design_brief', payload: brief });
    const program = buildSpaceProgram({
      brief: brief as never,
      briefRef: briefArtifact.id,
      rules: testRulePack(),
      norms: testNorms(),
    });
    await repo.write({
      scope,
      kind: 'space_program',
      payload: program.payload,
      inputs: [briefArtifact.id],
      step: 'layer2_program',
      params: { stub: true },
    });

    const vocabulary = parseVocabulary(testVocabularyYaml());
    const viByType: Record<string, string> = {};
    for (const t of vocabulary.types) viByType[t.code] = t.vi;
    const ctx = {
      repo,
      compute: new HttpComputeBackend(computeUrl!),
      scope,
      siteContext: parseSiteContext(testSiteContextYaml()),
      viByType,
      groups: roomGroups(vocabulary),
    };

    const outcome = await generateVariants(ctx, { timeBudgetS: 20 });
    expect(outcome.results.map((r) => r.variantId)).toEqual(['A', 'B', 'C']);
    const feasible = outcome.results.filter((r) => r.kind === 'floor_plan');
    expect(feasible.length, JSON.stringify(outcome.results)).toBeGreaterThan(0);
    expect(outcome.headArtifactId).toBe(feasible[0]!.artifactId);

    const listing = await listVariants(ctx);
    expect(listing.variants).toHaveLength(3);
    const head = listing.variants.find((v) => v.isHead)!;
    expect(head.summary!.levels.map((l) => l.height_m)).toEqual([3.6, 3.6, 3.9]);
    expect(head.summary!.total_area_m2).toBeGreaterThan(0);

    // Sinh lại: không giải lại, không đổi bản đang chọn.
    const again = await generateVariants(ctx, { timeBudgetS: 20 });
    expect(again.results.every((r) => r.reused)).toBe(true);

    const other = listing.variants.find((v) => v.status === 'ok' && !v.isHead);
    if (other) {
      await chooseVariant(ctx, other.artifactId);
      expect((await listVariants(ctx)).variants.find((v) => v.isHead)?.artifactId).toBe(
        other.artifactId,
      );
    }
  }, 120_000);
});
