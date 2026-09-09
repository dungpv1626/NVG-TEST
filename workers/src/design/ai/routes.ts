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
import { modelRouter, textClientFor } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { recordAiCall } from './call-log';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { ruleMessages } from './plan-messages-data';
import { aiPrompts } from './prompts-data';
import { AiProgramRejected, generateAiProgram } from './program';
import { selectedRulePack, type AiRulePackChoice } from './rule-packs';
import { reviewProgramAreas } from './rule-warnings';
import type { DesignBrief } from '@nvg/shared/design';

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
