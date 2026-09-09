/**
 * Nạp dự án DEMO của Module Thiết kế AI — NVO-028 "Nhà anh Tuấn" (11-design-flow 11.6).
 *
 * Dữ liệu BỊA, hạng 3: lô 5 × 18 m, bốn tầng, ba thế hệ. Không chạm hồ sơ khách nào.
 * Đây là đầu vào của kịch bản mười cảnh (`doc/design/14-phuong-an-demo.md` 14.2).
 *
 * Chạy từ gốc repo, cần Container đang chạy và `.env` có khoá `service_role`:
 *
 *     set -a; . ./.env; set +a
 *     DESIGN_COMPUTE_URL=http://localhost:8080 npx tsx workers/scripts/seed-demo-design.ts
 *
 * `DEMO_FLOORS=5` mô phỏng cảnh 7 (khách đổi ý từ bốn lên năm tầng): đầu bài mới, chương trình
 * mới, ba phương án mới — đợt cũ vẫn còn nguyên trong lịch sử để so sánh.
 *
 * Idempotent: chạy lại thì cập nhật dự án theo mã, artifact cùng nội dung dùng lại (mã băm).
 *
 * Vì sao không đi qua `runLayer2`/`siteContextTable`: các mô-đun `*-data.ts` nhúng YAML bằng
 * import của bản dựng Worker, không chạy được dưới Node thuần. Ở đây đọc thẳng tệp — cùng
 * cách `__tests__/program-fixtures.ts` làm.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { BRIEF_FORM, type DesignBrief } from '@nvg/shared/design';
import { ArtifactRepository, type ArtifactScope } from '../src/design/artifacts';
import { buildBriefPayload } from '../src/design/brief/payload';
import { HttpComputeBackend } from '../src/design/compute-backend';
import type { DesignEnv } from '../src/design/env';
import { parseVocabulary, roomGroups } from '../src/design/kb/vocabulary';
import { parseSiteContext } from '../src/design/layout/site-context';
import { generateVariants, listVariants } from '../src/design/layout/variants';
import { buildSpaceProgram } from '../src/design/program/engine';
import { parseSpaceNorms } from '../src/design/program/norms';
import { mergePacks, parseRuleFile, RulePack } from '../src/design/rules/rule-pack';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf-8');

const RULE_FILES = [
  'rules/base/00-meta.yaml',
  'rules/base/10-dimensions.yaml',
  'rules/base/20-daylight-access.yaml',
  'rules/base/30-adjacency.yaml',
  'rules/base/40-vertical.yaml',
  'rules/base/50-massing.yaml',
];

export const DEMO_PROJECT_CODE = 'NVO-TK-2026-0028';

/** Đầu bài NVO-028 — đúng ví dụ minh hoạ của tài liệu, không phải dự án có thật. */
export function demoStructured(projectId: string, floors = 4): Record<string, unknown> {
  return {
    schema_version: '1.0.0',
    project_id: projectId,
    building_type: 'nha_pho',
    locality: 'hung_yen',
    site: {
      shape: 'chu_nhat',
      width_m: 5,
      depth_m: 18,
      area_m2: 90,
      orientation: 'DN',
      access_sides: ['front'],
      adjacent: { front: 'duong_lon', left: 'nha_hang_xom', right: 'hem_2m', back: 'nha_hang_xom' },
      legal_docs_available: true,
    },
    floors,
    family: [
      { role: 'ong_ba', count: 2 },
      { role: 'vo_chong', count: 2 },
      { role: 'con', count: 2 },
    ],
    required_spaces: [
      { type: 'garage', floor: 1 },
      { type: 'living', floor: 1 },
      { type: 'kitchen', floor: 1 },
      { type: 'dining', floor: 1 },
      { type: 'altar_room', floor: floors },
      { type: 'laundry', floor: floors },
    ],
    style: 'hien_dai',
    budget_range_vnd: [2_000_000_000, 3_000_000_000],
    priorities: ['natural_light', 'feng_shui', 'area_efficiency'],
    decision_maker: { name: 'Anh Tuấn', relationship: 'chủ nhà' },
  };
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const computeUrl = process.env.DESIGN_COMPUTE_URL ?? 'http://localhost:8080';
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY — nạp .env trước.');
  }
  const env: DesignEnv = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    DESIGN_COMPUTE_URL: computeUrl,
  };
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const company = await admin.from('companies').select('id, tenant_id').eq('code', 'NVO').single();
  if (company.error) throw new Error(company.error.message);

  // Người chịu trách nhiệm: một tài khoản có quyền TK, để màn hình không đọc "—".
  const responsible = await admin
    .from('users')
    .select('id, full_name, roles!inner(code)')
    .eq('roles.code', 'TKE')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  const project = await admin
    .from('design_projects')
    .upsert(
      {
        company_id: company.data.id,
        code: DEMO_PROJECT_CODE,
        name: 'Nhà anh Tuấn — nhà phố (demo)',
        stage: 'phuong_an',
        responsible_user_id: (responsible.data?.id as string | undefined) ?? null,
        site_address: 'Lô 5 × 18 m, hướng Đông Nam, hẻm 2 m bên phải (dữ liệu minh hoạ)',
        notes:
          'Dự án minh hoạ theo doc/design/11-design-flow.md mục 11.6. Dữ liệu bịa, không chạm hồ sơ khách.',
        deleted_at: null,
      },
      { onConflict: 'code' },
    )
    .select('id')
    .single();
  if (project.error) throw new Error(project.error.message);
  const projectId = project.data.id as string;

  // `DEMO_RESET=1`: xoá sạch artifact, lineage, bản hiệu lực và đầu bài của dự án demo để nạp
  // lại từ đầu (dữ liệu bịa, hạng 3 — không phải hồ sơ khách).
  if (process.env.DEMO_RESET === '1') {
    for (const [table, column] of [
      ['design_head', 'project_id'],
      ['design_artifact_edge', 'from_id'],
    ] as const) {
      if (column === 'from_id') {
        const ids = await admin.from('design_artifact').select('id').eq('project_id', projectId);
        const list = (ids.data ?? []).map((r) => r.id as string);
        if (list.length) await admin.from('design_artifact_edge').delete().in('from_id', list);
      } else {
        await admin.from(table).delete().eq(column, projectId);
      }
    }
    await admin.from('design_artifact').delete().eq('project_id', projectId);
    await admin.from('design_briefs').delete().eq('design_project_id', projectId);
    console.log('Đã xoá dữ liệu cũ của dự án demo.');
  }

  // Một biên bản khảo sát hiện trạng, để tab Khảo sát có chỗ đính ảnh (cảnh 2).
  const survey = await admin
    .from('design_surveys')
    .select('id')
    .eq('design_project_id', projectId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (!survey.data) {
    const created = await admin.from('design_surveys').insert({
      company_id: company.data.id,
      design_project_id: projectId,
      surveyed_at: new Date().toISOString(),
      land_width: 5,
      land_depth: 18,
      land_area: 90,
      orientation: 'Đông Nam',
      measurement_notes: 'Đo thực địa 5,02 × 18,05 m; cốt nền cao hơn vỉa hè 0,35 m.',
      surrounding_notes: 'Mặt trước đường 7 m; bên phải hẻm 2 m; bên trái và sau giáp nhà 3 tầng.',
      usage_notes:
        'Ông bà ở tầng 2; phòng thờ tầng trên cùng; cần chỗ để hai xe máy và một ô tô nhỏ.',
    });
    if (created.error) throw new Error(created.error.message);
  }

  const scope: ArtifactScope = {
    tenantId: company.data.tenant_id as string,
    companyId: company.data.id as string,
    projectId,
    discipline: 'kien_truc',
    actorId: null,
  };
  const repo = new ArtifactRepository(env);

  // Lớp 1 — đúc đầu bài đúng đường `/brief/confirm` đi: qua `buildBriefPayload` để điểm
  // đầy đủ và danh sách thiếu được tính bằng cùng một hàm.
  const floors = Number.parseInt(process.env.DEMO_FLOORS ?? '4', 10) || 4;
  const built = buildBriefPayload({
    structured: demoStructured(projectId, floors),
    projectId,
    projectCode: DEMO_PROJECT_CODE,
  });
  const briefArtifact = await repo.write({
    scope,
    kind: 'design_brief',
    payload: built.payload,
    step: 'layer1_brief',
    params: { form_config_version: BRIEF_FORM.version },
  });

  // Đầu bài đã xác nhận là BẤT BIẾN (trigger đóng băng): đổi số tầng là lập PHIÊN BẢN MỚI, bản
  // cũ giữ nguyên làm căn cứ đối chiếu — đúng đường "Điều chỉnh đầu bài" của giao diện.
  const current = await admin
    .from('design_briefs')
    .select('id, version, artifact_id')
    .eq('design_project_id', projectId)
    .eq('is_current_version', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!current.data || current.data.artifact_id !== briefArtifact.id) {
    if (current.data) {
      const retired = await admin
        .from('design_briefs')
        .update({ is_current_version: false })
        .eq('id', current.data.id);
      if (retired.error) throw new Error(retired.error.message);
    }
    const inserted = await admin.from('design_briefs').insert({
      company_id: company.data.id,
      design_project_id: projectId,
      version: ((current.data?.version as number | undefined) ?? 0) + 1,
      is_current_version: true,
      structured: built.payload,
      confirmed_at: new Date().toISOString(),
      artifact_id: briefArtifact.id,
      design_task: `Thiết kế nhà phố ${floors} tầng cho gia đình ba thế hệ, sáu người.`,
      change_reason: current.data ? `Khách đổi ý: ${floors} tầng` : 'Bản đầu tiên',
    });
    if (inserted.error) throw new Error(inserted.error.message);
  }

  // Lớp 2 — chương trình không gian, cùng engine tất định của tuyến `/program/generate`.
  const rules = new RulePack(
    mergePacks(
      RULE_FILES.flatMap((f) => parseRuleFile(read(f), f)),
      [],
    ),
    true,
  );
  const program = buildSpaceProgram({
    brief: built.payload as DesignBrief,
    briefRef: briefArtifact.id,
    rules,
    norms: parseSpaceNorms(read('kb/space_norms.yaml')),
  });
  await repo.write({
    scope,
    kind: 'space_program',
    payload: program.payload,
    inputs: [briefArtifact.id],
    step: 'layer2_program',
    params: program.params,
  });

  // Lớp 3 — ba phương án, đúng đường `/floor-plan/generate`.
  const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
  const viByType: Record<string, string> = {};
  for (const t of vocabulary.types) viByType[t.code] = t.vi;
  const ctx = {
    repo,
    compute: new HttpComputeBackend(computeUrl),
    scope,
    siteContext: parseSiteContext(read('kb/site_context.yaml')),
    viByType,
    groups: roomGroups(vocabulary),
  };
  const outcome = await generateVariants(ctx, { timeBudgetS: 20 });
  const listing = await listVariants(ctx);

  console.log(`Dự án ${DEMO_PROJECT_CODE}: ${projectId}`);
  console.log(`Đầu bài: ${briefArtifact.id} · độ đầy đủ ${built.completenessScore}`);
  for (const v of listing.variants) {
    console.log(
      `Phương án ${v.variantId}: ${v.status}${v.isHead ? ' (đang hiệu lực)' : ''} — ` +
        (v.summary
          ? `${v.summary.total_area_m2} m², ${v.summary.bedrooms} phòng ngủ, giao thông ${Math.round(v.summary.circulation_share * 100)}%`
          : (v.infeasibility?.message ?? '')),
    );
  }
  console.log(`Giải: ${outcome.results.map((r) => `${r.variantId}=${r.solveTimeMs}ms`).join(' ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
