/**
 * Bộ tuyến của NHÁNH AI — gắn vào `designApp` dưới tiền tố `/design/ai`.
 *
 * Tệp riêng, không nằm trong `design/index.ts`, và đó là điều quan trọng nhất về nó. Nhánh AI
 * thay thế bộ giải nội bộ (T15–T19, 09/09/2026): khi nhánh này làm tốt, bộ giải sẽ bị xoá.
 * Muốn xoá được thì nhánh AI không được import gì từ `program/`, `layout/`, `render/`,
 * `compute-backend.ts` — mà `index.ts` import tất cả những thứ đó.
 *
 * Ranh giới ấy do kiểm thử canh, không do trí nhớ: `__tests__/ai-independence.test.ts` đọc
 * từng dòng `import` của `ai/**` và đỏ khi có tệp nào trỏ sang bộ giải.
 *
 * Được phép dùng: hạ tầng chung (`auth-scope`, `artifacts`, `llm/`, `rules/`, `kb/`,
 * `brief/anonymise`, `shared/`). Đó là những thứ ở lại sau khi bộ giải ra đi.
 */

import { Hono } from 'hono';
import { ArtifactRepository } from '../artifacts';
import {
  aiDigestInputs,
  asUser,
  denyUnlessReadable,
  denyUnlessWritable,
  projectScope,
  PROJECT_NOT_VISIBLE,
  roomLabels,
} from '../auth-scope';
import { AI_DIGEST_DATA_CLASS, anonymiseForAi } from '../brief/anonymise';
import { gateLayer2, readCompletenessThreshold } from '../brief/gate';
import type { DesignEnv } from '../env';
import { constructionNorms } from '../kb/construction-data';
import { roomVocabulary } from '../kb/vocabulary-data';
import { roomGroups } from '../kb/vocabulary';
import { modelRouter, textClientFor } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { recordAiCall } from './call-log';
import { planSheet } from './draw';
import { PlanSheetError } from './draw/plan-sheet';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { ruleMessages } from './plan-messages-data';
import { aiPrompts } from './prompts-data';
import { checkPlan } from './plan-check';
import { AiProgramRejected, generateAiProgram } from './program';
import { activeRun, attachWorkflow, createRun, finishRun } from './runs';
import { planStepSpecs, type AiDesignParams } from '../workflows/ai-design-steps';
import { selectedRulePack, type AiRulePackChoice } from './rule-packs';
import { reviewPlanRooms, reviewProgramAreas } from './rule-warnings';
import type { AiFloorPlan, AiSpaceProgram, DesignBrief } from '@nvg/shared/design';

export const aiApp = new Hono<{ Bindings: DesignEnv }>();

/** Bộ môn duy nhất nhánh AI sinh ra ở giai đoạn 1 — kiến trúc. */
const DISCIPLINE = 'kien_truc' as const;

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

/**
 * Danh mục model cho ô chọn trên trang thiết kế.
 *
 * Trả TÊN TUYẾN kèm nhãn — không bao giờ trả khoá. Tuyến bật mà chưa có khoá vẫn được liệt kê
 * kèm lý do để giao diện mờ nó và nói vì sao (AFD 6.5). Mặc định đọc từ `design_setting` của
 * tenant qua RLS của chính người gọi, nên không cần truyền mã dự án.
 */
aiApp.get('/models', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const db = await asUser(c.env, token);

  const catalogue = aiModelCatalogue(modelRouter(c.env));
  const settings = await db
    .from('design_setting')
    .select('key, value')
    .in('key', ['ai_text_route_default', 'ai_image_route_default']);
  // Danh mục không phụ thuộc RLS, nên phải tự chặn token hỏng: PostgREST trả 401 thì người gọi
  // chưa đăng nhập, không phải "tenant chưa cấu hình mặc định".
  if (settings.error && settings.status === 401) {
    return c.json({ error: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi mở lại trang.' }, 401);
  }
  const valueOf = (key: string): string | null => {
    const row = (settings.data ?? []).find((r) => r.key === key);
    return typeof row?.value === 'string' ? row.value : null;
  };
  // Mặc định chỉ có nghĩa khi nó trỏ vào một tuyến đang bấm được; không thì để trình duyệt
  // chọn tuyến bật đầu tiên — đừng trỏ người dùng vào một lựa chọn mờ.
  const pickDefault = (kind: 'text' | 'image', key: string) => {
    const wanted = valueOf(key);
    const usable = catalogue[kind].filter((o) => o.enabled);
    return usable.find((o) => o.route === wanted)?.route ?? usable[0]?.route ?? null;
  };
  return c.json({
    ...catalogue,
    defaults: {
      text: pickDefault('text', 'ai_text_route_default'),
      image: pickDefault('image', 'ai_image_route_default'),
    },
  });
});

export interface AiRunView {
  id: string;
  stage: 'program' | 'plan' | 'facade' | 'images';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: unknown;
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trạng thái toàn bộ nhánh AI của một dự án — một lượt gọi cho cả bốn bước.
 *
 * Vì sao gộp thay vì bốn endpoint: màn hình «Thiết kế AI» là một dải bước nối nhau, và thứ
 * người dùng cần biết ngay khi mở là bước nào đã có kết quả, bước nào đang chạy. Bốn lượt gọi
 * rời sẽ vẽ dải bước ấy thành bốn thời điểm khác nhau.
 *
 * Chỉ trả MÃ artifact và siêu dữ liệu, không trả nội dung: mặt bằng và bộ ảnh nặng, và mỗi
 * bước có endpoint riêng để đọc chi tiết khi người dùng mở đúng bước đó.
 */
aiApp.get('/state/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  // `ArtifactRepository` đọc bằng service_role nên VƯỢT RLS — phải tự hỏi quyền đọc bộ môn
  // trước, `projectScope` không trả lời câu hỏi đó (xem `denyUnlessReadable`).
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const [brief, program, facade, images, plans] = await Promise.all([
    repo.head(projectId, DISCIPLINE, 'design_brief'),
    repo.head(projectId, DISCIPLINE, 'ai_space_program'),
    repo.head(projectId, DISCIPLINE, 'ai_facade_concept'),
    repo.head(projectId, DISCIPLINE, 'ai_image_set'),
    repo.listKind(projectId, DISCIPLINE, 'ai_floor_plan', 12),
  ]);

  // Phương án mặt bằng ĐANG HIỆU LỰC. Đọc thẳng `design_head` thay vì `repo.head`: ở đây chỉ
  // cần mã, còn `repo.head` kéo cả payload từ kho về để rồi bỏ đi.
  const planHead = await db
    .from('design_head')
    .select('artifact_id')
    .eq('project_id', projectId)
    .eq('discipline', DISCIPLINE)
    .eq('kind', 'ai_floor_plan')
    .maybeSingle();

  // Lượt chạy MỚI NHẤT của từng giai đoạn. Đọc dưới phiên người gọi: bảng `design_ai_run` chỉ
  // mở SELECT qua `rls_design_readable`, ghi thì chỉ Worker làm được.
  const runs = await db
    .from('design_ai_run')
    .select('id, stage, status, progress, result, error, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(24);

  const latest: Record<string, AiRunView> = {};
  for (const row of runs.data ?? []) {
    const stage = row.stage as AiRunView['stage'];
    if (latest[stage]) continue;
    latest[stage] = {
      id: row.id as string,
      stage,
      status: row.status as AiRunView['status'],
      progress: row.progress,
      result: row.result,
      error: (row.error as string | null) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  return c.json({
    // Đầu bài là điều kiện vào của cả nhánh: chưa xác nhận thì không bước nào chạy được.
    briefArtifactId: brief?.id ?? null,
    program: program ? { artifactId: program.id, payload: program.payload } : null,
    plans: plans.map((p) => ({ artifactId: p.id, createdAt: p.createdAt })),
    // Phương án người dùng đã CHỌN. Ba phương án được đúc với `setHead: false`, nên khoá này
    // rỗng cho tới khi có người chọn — và bước mặt đứng chỉ mở khi nó có giá trị.
    planHeadArtifactId: (planHead.data?.artifact_id as string | undefined) ?? null,
    facadeArtifactId: facade?.id ?? null,
    imageSetArtifactId: images?.id ?? null,
    runs: latest,
    roomLabels: roomLabels(),
  });
});

/**
 * Lập chương trình không gian bằng AI — bước 1 của nhánh.
 *
 * ĐỒNG BỘ, không qua Workflow. Đo 08/09/2026: một lượt mất 17–158 giây tuỳ model, nằm trong
 * mức người dùng chờ được trước một thanh chờ. Ba bước sau (mặt bằng, mặt đứng, bộ ảnh) dài
 * hơn hẳn và chạy nền.
 *
 * Đặt `design_head` cho `ai_space_program`: đây là bản chương trình mà bước mặt bằng đọc.
 * Nó KHÔNG đụng tới head của `space_program` — chương trình của bộ giải, một dòng khác.
 */
aiApp.post('/program', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    route?: string;
    rulePacks?: Partial<AiRulePackChoice>;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);

  // Mặc định TẮT cả hai gói (T20, 09/09/2026 — Haan). Trình duyệt không gửi gì thì mô hình
  // thiết kế tự do và không có cảnh báo nào; kỹ sư chủ động tích khi muốn áp.
  const choice: AiRulePackChoice = {
    standards: body.rulePacks?.standards === true,
    experience: body.rulePacks?.experience === true,
  };
  const rules = selectedRulePack(choice, {
    standards: nationalRulePack(),
    experience: nvgExperiencePack(),
  });

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const router = modelRouter(c.env);
  if (!isSelectableRoute(aiModelCatalogue(router), 'text', body.route)) {
    return c.json(
      {
        error: 'Model đã chọn không dùng được lúc này. Chọn model khác trong danh sách đang bật.',
      },
      409,
    );
  }
  const client = textClientFor(c.env, body.route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, DISCIPLINE, 'design_brief');
  if (!brief) {
    return c.json(
      { error: 'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước.' },
      409,
    );
  }
  const gate = gateLayer2(brief.payload, await readCompletenessThreshold(repo.db, scope.tenantId));
  if (!gate.allowed) return c.json({ error: gate.message }, 409);

  // Chữ tự do và khảo sát đọc dưới PHIÊN NGƯỜI DÙNG (RLS) — không dùng service_role để gom
  // dữ liệu mà chính người gọi không được xem.
  const digest = anonymiseForAi(
    await aiDigestInputs(db, body.projectId, brief.payload as DesignBrief),
  );
  const labels = roomLabels();
  const publicRoute = router.publicRoutes().find((r) => r.route === body.route);
  const callScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId: body.projectId,
    discipline: DISCIPLINE,
    actorId: scope.actorId,
  };
  const meta = {
    route: body.route,
    purpose: 'program',
    dataClass: AI_DIGEST_DATA_CLASS,
    promptVersion: aiPrompts().version,
  };

  let result: Awaited<ReturnType<typeof generateAiProgram>>;
  try {
    result = await generateAiProgram({
      digest,
      briefRef: brief.id,
      route: body.route,
      client,
      prompts: aiPrompts(),
      vocabulary: roomVocabulary(),
      labels,
      construction: constructionNorms(),
      rules,
    });
  } catch (error) {
    // Lượt gọi đã TỐN TIỀN dù kết quả bị bác — ghi nhật ký cả hai kiểu hỏng, không chỉ hỏng
    // nghiệp vụ. Thiếu vế này thì bảng chi phí thiếu đúng những lượt đắt nhất.
    if (error instanceof AiProgramRejected || error instanceof LlmCallFailed) {
      // `rejected` = mô hình trả về nhưng đề xuất không đạt kiểm (lỗi nghiệp vụ, trả 422);
      // `failed` = lời gọi tới nhà cung cấp hỏng. Cả hai đều ĐÃ TỐN TIỀN nên đều phải ghi.
      const rejected = error instanceof AiProgramRejected;
      await recordAiCall(
        repo.db,
        callScope,
        meta,
        {
          provider: router.providerOf(body.route) ?? 'unknown',
          model: publicRoute?.model ?? 'unknown',
          usage: { inputTokens: null, outputTokens: null },
          latencyMs: 0,
          status: rejected ? 'rejected' : 'failed',
          errorCode:
            !rejected && error instanceof LlmCallFailed && error.status
              ? `http_${error.status}`
              : error.name,
        },
        publicRoute?.pricing,
      );
      if (rejected) {
        return c.json(
          { error: error.message, findings: (error as AiProgramRejected).findings },
          422,
        );
      }
    }
    throw error;
  }

  const artifact = await repo.write({
    scope: callScope,
    kind: 'ai_space_program',
    payload: result.payload,
    inputs: [brief.id],
    step: 'ai_program_propose',
    params: { route: body.route, prompt_version: aiPrompts().version },
    setHead: true,
  });
  for (const call of result.calls) {
    await recordAiCall(
      repo.db,
      callScope,
      meta,
      { ...call, status: 'ok', artifactId: artifact.id },
      publicRoute?.pricing,
    );
  }

  // Cảnh báo quy chuẩn tính LÚC TRẢ VỀ, không lưu vào artifact: ngưỡng ở `rules/` đổi được,
  // và một cảnh báo đóng băng trong artifact sẽ nói về gói quy tắc của ngày hôm đúc nó.
  // Đối chiếu bằng ĐÚNG gói kỹ sư đã tích — cùng bộ số đã gửi cho mô hình, nên cảnh báo không
  // bao giờ nói về một ngưỡng mà mô hình chưa từng được biết.
  const review = reviewProgramAreas({
    spaces: result.payload.spaces,
    buildingType: digest.building_type,
    rules,
    labels,
    groups: roomGroups(roomVocabulary().vocabulary),
    messages: ruleMessages(),
  });

  return c.json({
    artifactId: artifact.id,
    reused: artifact.reused,
    program: result.payload,
    roomLabels: labels,
    rationale: result.rationale,
    assumptions: result.assumptions,
    notes: result.notes,
    buildable: result.buildable,
    repaired: result.repaired,
    // Gói nào đã áp — màn hình phải nói ra, vì «không có cảnh báo» với gói tắt và với gói bật
    // là hai chuyện hoàn toàn khác nhau.
    rulePacks: choice,
    warnings: review.warnings,
    checkedRules: review.checked,
    // Danh sách quy tắc CHƯA đối chiếu được — phần quan trọng nhất của khối này. Cảnh báo rỗng
    // chỉ có nghĩa "không lệch trong số thứ đo được ở bước này", không phải "đạt quy chuẩn".
    uncheckedRules: review.unchecked,
  });
});

/**
 * Tờ mặt bằng của một tầng, dạng SVG — vẽ LÚC ĐỌC, không lưu.
 *
 * Vì sao không lưu: tờ vẽ là hàm thuần của artifact cộng `kb/sheet_style.yaml`, dựng hết
 * khoảng 5 ms. Lưu nó là tạo bản sao thứ hai của cùng dữ liệu, và bản sao ấy sẽ cũ đi mỗi lần
 * quy ước trình bày đổi — đúng thứ bất biến artifact tồn tại để tránh (CLAUDE.md 8.8 điểm 1).
 *
 * ⚠️ Cache NGẮN, KHÔNG `immutable`, dù địa chỉ có mang mã băm artifact. Tờ vẽ không chỉ phụ
 * thuộc artifact: nó còn phụ thuộc mã bộ vẽ và `kb/sheet_style.yaml`, hai thứ KHÔNG nằm trong
 * địa chỉ. Đánh dấu bất biến một năm thì một lần sửa cỡ chữ sẽ không tới được người đang mở
 * trình duyệt, mà cũng không có gì báo. `private` để proxy dùng chung không giữ bản sao — đây
 * là bản vẽ của một hồ sơ cụ thể, RLS quyết ai xem được.
 *
 * Trả SVG chứ không trả JSON có chuỗi SVG bên trong: trình duyệt nạp bằng `<img>`, nên kịch
 * bản nhúng trong tệp — nếu mô hình có chèn được — cũng không chạy.
 */
aiApp.get('/plan/:projectId/sheet', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã phương án cần xem.' }, 400);
  const level = Number(c.req.query('level') ?? '1');
  if (!Number.isInteger(level) || level < 1) {
    return c.json({ error: 'Số tầng không hợp lệ.' }, 400);
  }

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(artifactId, projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }

  try {
    const sheet = planSheet(artifact.payload as AiFloorPlan, level);
    return new Response(sheet.svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        // Tỷ lệ và hướng giấy do bộ vẽ CHỌN, nên màn hình phải hỏi mới biết mà in ra chip
        // «Tỷ lệ 1:50». Thân phản hồi là SVG nên không cài thêm trường được.
        //
        // Ghi chú của bộ vẽ (chỗ đã kẹp, đã hạ tỷ lệ) CỐ Ý không nhét vào header: câu tiếng
        // Việt có dấu không đi qua header HTTP nguyên vẹn, và một con số đếm thì màn hình
        // không làm gì được. Chúng đi cùng findings ở endpoint JSON của Đợt 3.
        'X-Sheet-Scale': String(sheet.scale),
        'X-Sheet-Orientation': sheet.orientation,
      },
    });
  } catch (error) {
    if (error instanceof PlanSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

/**
 * Đọc lại một phương án mặt bằng: kiểm, cảnh báo và ghi chú bộ vẽ — TÍNH LÚC ĐỌC.
 *
 * Không lưu ba thứ này vào artifact, và đó là quyết định có lý do: bộ kiểm, gói quy tắc và bộ
 * vẽ đều đổi được, còn artifact thì bất biến. Một danh sách cảnh báo đóng băng trong artifact sẽ
 * nói về gói quy tắc của ngày hôm đúc nó, và không có gì báo cho người đọc biết điều đó.
 *
 * Gói quy tắc nhận theo tham số truy vấn: cảnh báo là một LĂNG KÍNH người đọc chọn, không phải
 * thuộc tính của bản vẽ (T20). Không tích gì — mặc định — thì không có cảnh báo nào, và câu trả
 * về nói rõ đã áp gói nào để «không có cảnh báo» không bị đọc thành «đạt quy chuẩn».
 */
aiApp.get('/plan/:projectId/review', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã phương án cần xem.' }, 400);
  const choice: AiRulePackChoice = {
    standards: c.req.query('standards') === '1',
    experience: c.req.query('experience') === '1',
  };

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(artifactId, projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }
  const plan = artifact.payload as AiFloorPlan;

  // Chương trình không gian mà phương án bám theo — bộ kiểm so hai bên với nhau, nên phải đọc
  // đúng bản đã dùng lúc xếp, không phải bản đang hiệu lực hôm nay.
  const program = await repo.get(plan.program_ref, projectId);
  if (!program || program.kind !== 'ai_space_program') {
    return c.json(
      { error: 'Không đọc được chương trình không gian mà phương án này bám theo.' },
      409,
    );
  }

  // Loại nhà không nằm trong artifact mặt bằng — nó là dữ liệu ĐẦU BÀI, và mặt bằng không chép
  // lại dữ liệu đã có chỗ khác (CLAUDE.md 5.2, một nguồn duy nhất). Đi theo lineage: mặt bằng →
  // chương trình → đầu bài. Đọc lại head đầu bài thì sai: đầu bài có thể đã sửa sau lúc xếp.
  const briefRef = (program.payload as AiSpaceProgram).brief_ref;
  const brief = await repo.get(briefRef, projectId);
  if (!brief || brief.kind !== 'design_brief') {
    return c.json({ error: 'Không đọc được đầu bài mà phương án này bám theo.' }, 409);
  }
  const buildingType = (brief.payload as DesignBrief).building_type;

  const vocabulary = roomVocabulary();
  const groups = roomGroups(vocabulary.vocabulary);
  const labels = roomLabels();
  const check = checkPlan({
    plan,
    program: program.payload as AiSpaceProgram,
    buildable: null,
    doorExemptTypes: new Set(groups.no_door_required ?? []),
  });
  const review = reviewPlanRooms({
    levels: plan.levels,
    buildingType,
    rules: selectedRulePack(choice, {
      standards: nationalRulePack(),
      experience: nvgExperiencePack(),
    }),
    labels,
    groups,
    messages: ruleMessages(),
  });

  // Ghi chú của bộ vẽ (nhãn phòng phải bỏ, lỗ mở đã kẹp, tờ vượt khổ) chỉ biết được khi DỰNG
  // tờ vẽ. Dựng cả bộ tầng ở đây tốn vài mili-giây và bỏ chuỗi SVG đi — đổi lại màn hình nói
  // được đúng những chỗ chương trình đã tự xử lý, thay vì để người dùng tự phát hiện.
  const levels = plan.levels.map((level) => {
    const sheet = planSheet(plan, level.level);
    return {
      level: level.level,
      name: level.name,
      scale: sheet.scale,
      orientation: sheet.orientation,
      notes: sheet.notes,
      rooms: level.rooms.length,
    };
  });

  return c.json({
    artifactId: artifact.id,
    createdAt: artifact.createdAt,
    variantId: plan.variant_id,
    variantLabel: plan.variant_label,
    strategy: plan.strategy ?? null,
    rationale: plan.rationale,
    generator: plan.generator,
    wallsDerived: plan.generator.walls_derived === true,
    levels,
    roomLabels: labels,
    // Lỗi CHẶN còn lại: phương án vẫn được lưu (người dùng quyết chạy lại hay không), nhưng
    // phải hiện đỏ. Im lặng ở đây là để người đọc tin một bản vẽ chưa đáng tin.
    blocking: check.blocking,
    findings: check.findings,
    rulePacks: choice,
    warnings: review.warnings,
    checkedRules: review.checked,
    uncheckedRules: review.unchecked,
  });
});

/**
 * Khởi động lượt xếp mặt bằng — ba phương án, chạy nền qua Workflow.
 *
 * Trả về NGAY với mã lượt chạy. Một phương án mất 1,5–3 phút nên ba phương án là 2–9 phút tuỳ
 * song song tới đâu; giữ một kết nối HTTP mở chừng đó là cách chắc chắn để mất kết quả của
 * những lượt gọi ĐÃ TÍNH TIỀN.
 *
 * Mọi điều kiện tốn-tiền-được kiểm TRƯỚC khi mở instance: có khoá, tuyến bấm được, có chương
 * trình không gian, không có lượt nào của cùng giai đoạn đang chạy. Kiểm sau thì lượt gọi đầu
 * tiên đã đi rồi mới biết là không dùng được.
 */
aiApp.post('/plan/runs', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    route?: string;
    rulePacks?: Partial<AiRulePackChoice>;
    count?: number;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);

  if (!c.env.AI_DESIGN_PIPELINE) {
    return c.json(
      {
        error:
          'Chưa cấu hình luồng chạy nền của nhánh AI. Workflow chỉ chạy trong runtime Workers — dùng `wrangler dev` thay vì gọi trực tiếp.',
        retryable: false,
      },
      503,
    );
  }

  const choice: AiRulePackChoice = {
    standards: body.rulePacks?.standards === true,
    experience: body.rulePacks?.experience === true,
  };

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const router = modelRouter(c.env);
  if (!isSelectableRoute(aiModelCatalogue(router), 'text', body.route)) {
    return c.json(
      {
        error: 'Model đã chọn không dùng được lúc này. Chọn model khác trong danh sách đang bật.',
      },
      409,
    );
  }
  if (!textClientFor(c.env, body.route)) {
    return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);
  }

  const repo = new ArtifactRepository(c.env);
  const program = await repo.head(body.projectId, DISCIPLINE, 'ai_space_program');
  if (!program) {
    return c.json(
      {
        error:
          'Chưa có chương trình không gian của nhánh AI. Chạy bước «Chương trình không gian» trước khi xếp mặt bằng.',
      },
      409,
    );
  }

  // Đầu bài đi theo LINEAGE, không lấy bản đang hiệu lực. Đầu bài sửa sau lúc lập chương trình
  // thì bản hiệu lực hôm nay có thể khai số tầng hoặc kích thước thửa khác hẳn danh mục phòng mà
  // mặt bằng buộc phải xếp đúng — và mô hình sẽ nhận hai nguồn nói ngược nhau mà không có gì báo.
  const briefRef = (program.payload as AiSpaceProgram).brief_ref;
  const brief = await repo.get(briefRef, body.projectId);
  if (!brief || brief.kind !== 'design_brief') {
    return c.json(
      {
        error:
          'Không đọc được đầu bài mà chương trình không gian bám theo. Lập lại chương trình không gian.',
      },
      409,
    );
  }

  // Một giai đoạn chỉ một lượt chạy: hai lượt song song đúc ra hai bộ phương án cho cùng một
  // bước và nhân đôi tiền cho cùng một câu hỏi.
  const running = await activeRun(repo.db, body.projectId, 'plan');
  if (running) {
    return c.json(
      {
        error: 'Đang có một lượt xếp mặt bằng chạy dở. Chờ lượt đó xong rồi chạy lại.',
        runId: running.id,
      },
      409,
    );
  }

  const strategies = aiPrompts().floorPlan.strategies;
  // `Math.round(NaN)` là NaN, và `slice(0, NaN)` trả mảng RỖNG: một thân lời gọi hỏng sẽ mở một
  // lượt chạy không có phương án nào và kết thúc bằng «hỏng» mà không ai hiểu vì sao.
  const requested = Number(body.count ?? 3);
  const count = Number.isFinite(requested)
    ? Math.max(1, Math.min(strategies.length, Math.round(requested)))
    : Math.min(3, strategies.length);
  const variants = strategies.slice(0, count).map((item) => ({
    id: item.id,
    label: item.label,
    strategy: item.strategy,
  }));

  // Đầu bài đã lược danh tính dựng ở ĐÂY, dưới phiên người bấm: dựng nó phải đọc tên và điện
  // thoại khách hàng để lược đi, và Workflow chỉ có khoá `service_role` (vượt RLS).
  const digest = anonymiseForAi(
    await aiDigestInputs(db, body.projectId, brief.payload as DesignBrief),
  );

  const runScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId: body.projectId,
    discipline: DISCIPLINE,
    actorId: scope.actorId,
  };
  const run = await createRun(repo.db, runScope, {
    stage: 'plan',
    steps: planStepSpecs(variants),
  });

  const params: AiDesignParams = {
    runId: run.id,
    ...runScope,
    stage: 'plan',
    textRoute: body.route,
    briefRef: brief.id,
    programRef: program.id,
    digest,
    program: program.payload as AiSpaceProgram,
    rulePacks: choice,
    variants,
  };

  try {
    const instance = await c.env.AI_DESIGN_PIPELINE.create({ params });
    await attachWorkflow(repo.db, run.id, instance.id);
  } catch (error) {
    // Dòng tiến độ đã mở mà instance không mở được: chốt nó lại ngay, nếu không màn hình sẽ
    // hiện một lượt chạy «đang chờ» vĩnh viễn và chặn luôn lượt sau (điều kiện 409 ở trên).
    await finishRun(repo.db, run.id, {
      status: 'failed',
      error: 'Không mở được luồng chạy nền. Thử lại sau.',
    });
    throw error;
  }

  return c.json(
    { runId: run.id, variants: variants.map((v) => ({ id: v.id, label: v.label })) },
    202,
  );
});

/**
 * Chọn một phương án làm bản đang hiệu lực — bước mặt đứng đọc bản này.
 *
 * Ba phương án cùng loại artifact nên Workflow đúc chúng với `setHead: false`: đặt head theo
 * phương án ghi xong sau cùng thì «đang hiệu lực» là kết quả của một cuộc chạy đua. Head do
 * người chọn, và đó đúng là ranh giới «con người quyết định cuối cùng» (PRD 2.3).
 */
aiApp.post('/plan/choose', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as { projectId?: string; artifactId?: string };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Chưa chọn phương án nào.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  // `repo.get` tự kiểm artifact thuộc đúng dự án: mã băm là danh tính toàn cục, và mã này đến
  // từ trình duyệt.
  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }

  await repo.setHead(
    {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId: body.projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    'ai_floor_plan',
    artifact.id,
  );
  return c.json({ artifactId: artifact.id });
});

/**
 * Tiến độ một lượt chạy nền.
 *
 * Đọc dòng `design_ai_run` dưới phiên người gọi (RLS), rồi ĐỐI CHIẾU với trạng thái instance
 * Workflow. Vì sao cần vế thứ hai: nếu instance chết theo cách không kịp ghi gì (hết giờ nền
 * tảng, lỗi lúc khởi động), dòng sẽ nằm mãi ở `running` và màn hình quay một thanh chờ không
 * bao giờ dừng. Một lượt chạy hỏng phải nói là hỏng.
 */
aiApp.get('/runs/:id', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const runId = c.req.param('id');
  const db = await asUser(c.env, token);
  const row = await db
    .from('design_ai_run')
    .select('id, stage, status, progress, result, error, workflow_id, created_at, updated_at')
    .eq('id', runId)
    .maybeSingle();
  if (row.error) return c.json({ error: 'Không đọc được tiến độ lượt chạy.' }, 500);
  if (!row.data) return c.json({ error: 'Không tìm thấy lượt chạy này.' }, 404);

  let status = row.data.status as AiRunView['status'];
  let error = (row.data.error as string | null) ?? null;
  const workflowId = row.data.workflow_id as string | null;

  if ((status === 'queued' || status === 'running') && workflowId && c.env.AI_DESIGN_PIPELINE) {
    const dead = await workflowDead(c.env.AI_DESIGN_PIPELINE, workflowId);
    if (dead) {
      status = 'failed';
      error = dead;
      const repo = new ArtifactRepository(c.env);
      await finishRun(repo.db, runId, { status: 'failed', error: dead });
    }
  }

  return c.json({
    id: row.data.id as string,
    stage: row.data.stage as AiRunView['stage'],
    status,
    progress: row.data.progress,
    result: row.data.result,
    error,
    createdAt: row.data.created_at as string,
    updatedAt: row.data.updated_at as string,
  } satisfies AiRunView);
});

/**
 * Instance Workflow đã chết chưa — trả câu giải thích tiếng Việt, hoặc `null` khi còn sống.
 *
 * Không đọc được trạng thái thì coi như CÒN SỐNG: một lỗi mạng tạm thời không được biến một
 * lượt chạy đang tốt thành «hỏng», vì dấu hỏng là chốt và không tự mở lại.
 */
async function workflowDead(workflow: Workflow, instanceId: string): Promise<string | null> {
  try {
    const instance = await workflow.get(instanceId);
    const state = await instance.status();
    if (state.status === 'errored') {
      return typeof state.error === 'string' && state.error
        ? `Luồng chạy nền dừng vì lỗi: ${state.error}`
        : 'Luồng chạy nền dừng vì lỗi.';
    }
    if (state.status === 'terminated') return 'Luồng chạy nền đã bị dừng.';
    return null;
  } catch {
    return null;
  }
}
