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
import {
  solveFloorPlan,
  stubArchModel,
  stubLayoutIntent,
  stubRenderResult,
  stubSpaceProgram,
} from '../workflows/steps';

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

    brief = {
      schema_version: '1.0.0',
      project_id: project.data.id,
      building_type: 'nha_pho',
      locality: 'thai_binh',
      site: { width_m: 5, depth_m: 18 },
      floors: 3,
    };
  });

  it('chạy sáu bước, mọi artifact có mã băm và cạnh lineage', async () => {
    const briefArtifact = await repo.write({ scope, kind: 'design_brief', payload: brief });
    expect(briefArtifact.id).toMatch(ARTIFACT_ID_PATTERN);

    const program = stubSpaceProgram(brief as never, briefArtifact.id);
    const programArtifact = await repo.write({
      scope,
      kind: 'space_program',
      payload: program.payload,
      inputs: [briefArtifact.id],
      step: 'layer2_program',
      params: { stub: true },
    });

    const intent = stubLayoutIntent(program.payload, programArtifact.id);
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
      locality: 'thai_binh',
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
      params: { locality: 'thai_binh', timeBudgetS: 30 },
    });

    const arch = stubArchModel(solved.payload, planArtifact.id);
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
      stubSpaceProgram(brief as never, `sha256:${'a'.repeat(64)}`).payload,
    );
    for (const space of impossible.spaces) {
      space.min_area_m2 = 60;
      space.max_area_m2 = 90;
    }
    const intent = stubLayoutIntent(impossible, `sha256:${'a'.repeat(64)}`);

    const solved = await solveFloorPlan(new HttpComputeBackend(computeUrl!), {
      intent: intent.payload,
      intentRef: `sha256:${'b'.repeat(64)}`,
      program: impossible,
      site: { width_m: 5, depth_m: 18 },
      locality: 'thai_binh',
      timeBudgetS: 20,
    });

    expect(solved.status).toBe('infeasible');
    const report = solved.payload as { human_message: string; conflict_set: unknown[] };
    expect(report.human_message).toMatch(/không thể đồng thời/i);
    expect(report.conflict_set.length).toBeGreaterThan(0);
  });
});
