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
import { decodeBase64 } from '../llm/image-bytes';
import { gateLayer2, readCompletenessThreshold } from '../brief/gate';
import type { DesignEnv } from '../env';
import { briefFidelity } from '../kb/brief-fidelity-data';
import { constructionNorms } from '../kb/construction-data';
import { roomVocabulary } from '../kb/vocabulary-data';
import { roomGroups } from '../kb/vocabulary';
import { imageClientFor, modelRouter, textClientFor } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { nationalRulePack, nvgExperiencePack } from '../rules/rule-pack-data';
import { recordAiCall, usageSummary, withAiCall, type AiCallUsage } from './call-log';
import { createArtifactStore } from '../artifact-store';
import { planAnchor, planSheet } from './draw';
import { facadeApp } from './facade-routes';
import { perspectiveApp } from './perspective-routes';
import { planDxf } from './dxf';
import {
  formatPromptText,
  promptKey,
  purposeLabelVi,
  recordingClient,
  type PromptRecord,
} from './prompt-record';
import { PlanSheetError } from './draw/plan-sheet';
import { aiModelCatalogue, isSelectableRoute } from './models';
import {
  anchorMime,
  assembleSheetImage,
  pngSize,
  sheetImageCallOptions,
  sheetImagePrompt,
} from './sheet-image';
import { ruleMessages } from './plan-messages-data';
import { aiPrompts } from './prompts-data';
import { checkPlan } from './plan-check';
import { planQuality } from './plan-quality-data';
import { scoreForScreen } from './plan-score';
import { AiProgramRejected, generateAiProgram, type AiProgramRound } from './program';
import { REASONING_EFFORTS, type ReasoningEffort } from '../llm/text-client';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import {
  activeRun,
  attachWorkflow,
  createRun,
  finishRun,
  openLiveRun,
  RUN_CANCELLED,
  runCancelled,
  LIVE_STALE_MS,
  RUN_STALE_MS,
  runStalled,
  writeLiveRun,
} from './runs';
import { editStepSpecs, planStepSpecs, type AiDesignParams } from '../workflows/ai-design-steps';
import { selectedRulePack, type AiRulePackChoice } from './rule-packs';
import { reviewPlanRooms, reviewProgramAreas } from './rule-warnings';
import type {
  AiFloorPlan,
  AiPlanSheetImage,
  AiSpaceProgram,
  DesignBrief,
} from '@nvg/shared/design';

export const aiApp = new Hono<{ Bindings: DesignEnv }>();

// Bước «2. Mặt đứng» (T59) và «3. Phối cảnh» (T67) — tuyến ở tệp riêng.
aiApp.route('/facade', facadeApp);
aiApp.route('/perspective', perspectiveApp);

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
  const [brief, program, facade, images, plans, facades, imageSets] = await Promise.all([
    repo.head(projectId, DISCIPLINE, 'design_brief'),
    repo.head(projectId, DISCIPLINE, 'ai_space_program'),
    repo.head(projectId, DISCIPLINE, 'ai_facade_concept'),
    repo.head(projectId, DISCIPLINE, 'ai_image_set'),
    // Lấy dư rồi mới bỏ phần đã ẩn: xoá một phương án khỏi danh sách không được làm mất chỗ của
    // những phương án cũ hơn còn dùng.
    repo.listKind(projectId, DISCIPLINE, 'ai_floor_plan', 30),
    // Mọi ý tưởng mặt đứng đã đúc (20/09/2026, Haan: «tạo bản vẽ mới thì không lưu lại bản cũ để so
    // sánh → chưa tốt»). Artifact vốn đã bất biến nên bản cũ CHƯA BAO GIỜ mất — thiếu là ở đây: tuyến
    // này chỉ trả mốc hiệu lực, nên màn hình không có cách nào mở lại bản trước.
    repo.listKind(projectId, DISCIPLINE, 'ai_facade_concept', 30),
    // Mọi bộ ảnh phối cảnh đã đúc (T67 Đợt C) — cùng lý do với dải mặt đứng ở trên: artifact vốn
    // bất biến nên bộ cũ chưa bao giờ mất, thiếu là ở chỗ tuyến này chỉ trả mốc hiệu lực.
    repo.listKind(projectId, DISCIPLINE, 'ai_image_set', 30),
  ]);

  // Phương án kỹ sư đã xoá khỏi danh sách (`design_artifact_hidden`). Đọc dưới phiên người gọi:
  // cùng ba chiều quyền với mọi bảng của module.
  const hiddenRows = await db
    .from('design_artifact_hidden')
    .select('artifact_id')
    .eq('project_id', projectId)
    .eq('discipline', DISCIPLINE);
  const hidden = new Set((hiddenRows.data ?? []).map((row) => row.artifact_id as string));
  const visiblePlans = plans.filter((p) => !hidden.has(p.id)).slice(0, 12);
  const visibleFacades = facades.filter((f) => !hidden.has(f.id)).slice(0, 12);
  const visibleImageSets = imageSets.filter((s) => !hidden.has(s.id)).slice(0, 12);

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

  const headId = (planHead.data?.artifact_id as string | undefined) ?? null;

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
    plans: visiblePlans.map((p) => ({ artifactId: p.id, createdAt: p.createdAt })),
    // Phương án người dùng đã CHỌN. Ba phương án được đúc với `setHead: false`, nên khoá này
    // rỗng cho tới khi có người chọn — và bước mặt đứng chỉ mở khi nó có giá trị.
    // Mốc trỏ vào phương án đã ẩn thì coi như chưa chọn: tuyến ẩn đã gỡ mốc, đây là lưới an toàn
    // cho những dòng mốc có từ trước.
    planHeadArtifactId: headId && !hidden.has(headId) ? headId : null,
    facadeArtifactId: facade?.id ?? null,
    // Các bản mặt đứng còn hiện, mới nhất trước — để kỹ sư mở lại bản cũ mà so.
    facades: visibleFacades.map((f) => ({ artifactId: f.id, createdAt: f.createdAt })),
    // Mặt bằng mà mặt đứng hiện hành dựng theo (T59). Khác `planHeadArtifactId` nghĩa là kỹ sư đã đổi
    // phương án sau khi dựng mặt đứng — màn hình gắn nhãn «dựng theo phương án cũ».
    facadePlanRef: (facade?.payload as { plan_ref?: string } | undefined)?.plan_ref ?? null,
    imageSetArtifactId: images?.id ?? null,
    // Các bộ ảnh còn hiện, mới nhất trước — để kỹ sư mở lại bộ cũ mà so.
    imageSets: visibleImageSets.map((s) => ({ artifactId: s.id, createdAt: s.createdAt })),
    // Mặt đứng mà bộ ảnh hiện hành dựng theo. Khác `facadeArtifactId` nghĩa là kỹ sư đã dựng lại
    // mặt đứng sau khi có bộ ảnh — màn hình gắn nhãn «dựng theo mặt đứng cũ».
    imageSetFacadeRef: (images?.payload as { facade_ref?: string } | undefined)?.facade_ref ?? null,
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
/** Phần theo dõi trực tiếp của một lượt lập chương trình — trình duyệt đọc qua `/ai/runs/:id`. */
interface LiveProgram {
  model: string;
  route: string;
  effort: ReasoningEffort | null;
  startedAt: string;
  elapsedMs: number;
  /** Lượt đang chạy; rỗng khi đã xong. */
  current: {
    round: number;
    phase: 'thinking' | 'writing';
    outputChars: number;
    /** Ký tự tóm tắt suy nghĩ đã về — chỉ Claude gửi; `null` khi nhà cung cấp giấu phần nghĩ. */
    thinkingChars: number | null;
    startedAt: string;
  } | null;
  rounds: Array<AiProgramRound & { usage: AiCallUsage }>;
}

aiApp.post('/program', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    route?: string;
    rulePacks?: Partial<AiRulePackChoice>;
    /** Mức suy nghĩ cho lượt này; vắng = cấu hình tuyến. */
    reasoningEffort?: string;
    /** UUID trình duyệt sinh để hỏi tiến độ trong lúc chờ — xem `openLiveRun`. */
    progressId?: string;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);
  const reasoningEffort = (REASONING_EFFORTS as readonly string[]).includes(
    body.reasoningEffort ?? '',
  )
    ? (body.reasoningEffort as ReasoningEffort)
    : undefined;
  if (body.reasoningEffort && !reasoningEffort) {
    return c.json({ error: 'Mức suy nghĩ không hợp lệ — chọn Thấp, Vừa hoặc Cao.' }, 400);
  }
  const progressId =
    body.progressId && /^[0-9a-f-]{36}$/i.test(body.progressId) ? body.progressId : null;

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
  const rawClient = textClientFor(c.env, body.route);
  if (!rawClient) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);
  // Ghi nguyên văn từng lời gọi để kỹ sư xuất ra đọc lại (nút «Xuất prompt» ở nhật ký).
  const recorded = recordingClient(rawClient);
  const client = recorded.client;
  const promptStore = createArtifactStore(c.env);
  const requestAt = (index: number) => recorded.records[index];

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

  // ── Theo dõi trực tiếp và nút «Dừng» (13/09/2026) ─────────────────────────────────────
  // Trình duyệt hỏi mỗi 2 giây; ở đây ghi mỗi 2 giây và ngay khi một lượt xong. Số token chính
  // xác chỉ có sau từng lượt — giữa chừng chỉ đếm được ký tự trả lời đã về và thời gian đã chờ.
  // Mỗi lần ghi cũng đọc xem kỹ sư đã bấm «Dừng» chưa; bấm rồi thì huỷ lời gọi tới nhà cung cấp.
  const startedAt = Date.now();
  const live: LiveProgram = {
    model: publicRoute?.model ?? body.route,
    route: body.route,
    effort: reasoningEffort ?? null,
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs: 0,
    current: {
      round: 1,
      phase: 'thinking',
      outputChars: 0,
      thinkingChars: null,
      startedAt: new Date().toISOString(),
    },
    rounds: [],
  };
  const cancel = new AbortController();
  let rev = 1;
  const tracking = progressId
    ? await openLiveRun(repo.db, callScope, progressId, 'program', { live })
    : false;
  const flush = async () => {
    if (!tracking || !progressId) return;
    if (await runCancelled(repo.db, progressId)) {
      cancel.abort();
      return;
    }
    live.elapsedMs = Date.now() - startedAt;
    rev += 1;
    await writeLiveRun(repo.db, progressId, rev, { live });
  };
  const ticker = tracking ? setInterval(() => void flush(), 2000) : null;
  const stopTracking = () => {
    if (ticker) clearInterval(ticker);
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
      fidelity: briefFidelity(),
      quality: planQuality(),
      signal: cancel.signal,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      onCallProgress: (round, progress) => {
        live.current = {
          round,
          phase: progress.phase,
          outputChars: progress.outputChars,
          thinkingChars: progress.thinkingChars ?? null,
          startedAt:
            live.current?.round === round ? live.current.startedAt : new Date().toISOString(),
        };
      },
      onRoundDone: (verdict, call) => {
        live.rounds.push({
          ...verdict,
          usage: usageSummary(
            meta,
            { ...call, status: verdict.outcome === 'accepted' ? 'ok' : 'rejected' },
            publicRoute?.pricing,
            router.isBilled(call.provider),
          ),
        });
        live.current =
          verdict.outcome === 'accepted' || verdict.round >= 2
            ? null
            : {
                round: verdict.round + 1,
                phase: 'thinking',
                outputChars: 0,
                thinkingChars: null,
                startedAt: new Date().toISOString(),
              };
        void flush();
      },
    });
  } catch (error) {
    stopTracking();
    if (tracking && progressId) {
      live.elapsedMs = Date.now() - startedAt;
      live.current = null;
      const stopped = cancel.signal.aborted;
      await finishRun(repo.db, progressId, {
        status: 'failed',
        error: stopped ? RUN_CANCELLED : error instanceof Error ? error.message : String(error),
        partial: { live },
      }).catch(() => undefined);
      if (stopped) {
        // Lượt đã huỷ vẫn có thể đã tính tiền phần token sinh ra trước khi huỷ — nhà cung cấp
        // không báo số đo cho lượt bị cắt ngang, nên dòng nhật ký ghi rõ là đã dừng.
        await recordAiCall(
          repo.db,
          callScope,
          meta,
          {
            provider: router.providerOf(body.route) ?? 'unknown',
            model: publicRoute?.model ?? 'unknown',
            usage: { inputTokens: null, outputTokens: null },
            latencyMs: Date.now() - startedAt,
            status: 'failed',
            errorCode: 'cancelled',
            request: requestAt(recorded.records.length - 1),
          },
          publicRoute?.pricing,
          promptStore,
        );
        return c.json({ error: RUN_CANCELLED, cancelled: true, rounds: live.rounds }, 409);
      }
    }
    // Lượt gọi đã TỐN TIỀN dù kết quả bị bác — ghi nhật ký cả hai kiểu hỏng, không chỉ hỏng
    // nghiệp vụ. Thiếu vế này thì bảng chi phí thiếu đúng những lượt đắt nhất.
    if (error instanceof AiProgramRejected || error instanceof LlmCallFailed) {
      // `rejected` = mô hình trả về nhưng đề xuất không đạt kiểm (lỗi nghiệp vụ, trả 422);
      // `failed` = lời gọi tới nhà cung cấp hỏng. Cả hai đều ĐÃ TỐN TIỀN nên đều phải ghi.
      const rejected = error instanceof AiProgramRejected;
      const provider = router.providerOf(body.route) ?? 'unknown';
      const model = publicRoute?.model ?? 'unknown';
      // Bị bác: ghi TỪNG lượt đã gọi với đúng số token của nó. Hỏng mạng: một dòng, số token
      // và thời gian lấy từ chính lỗi (nhà cung cấp vẫn tính tiền phần đã sinh).
      const outcomes =
        rejected && (error as AiProgramRejected).calls.length > 0
          ? (error as AiProgramRejected).calls.map((call, index) => ({
              ...call,
              status: 'rejected' as const,
              errorCode: error.name,
              request: requestAt(index),
            }))
          : [
              {
                provider,
                model,
                usage: (error instanceof LlmCallFailed && error.usage) || {
                  inputTokens: null,
                  outputTokens: null,
                },
                latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || 0,
                status: (rejected ? 'rejected' : 'failed') as 'rejected' | 'failed',
                errorCode:
                  !rejected && error instanceof LlmCallFailed && error.status
                    ? `http_${error.status}`
                    : error.name,
                request: requestAt(recorded.records.length - 1),
              },
            ];
      for (const outcome of outcomes) {
        await recordAiCall(repo.db, callScope, meta, outcome, publicRoute?.pricing, promptStore);
      }
      const usage = outcomes.map((o) =>
        usageSummary(meta, o, publicRoute?.pricing, router.isBilled(o.provider)),
      );
      if (rejected) {
        return c.json(
          {
            error: error.message,
            findings: (error as AiProgramRejected).findings,
            rounds: (error as AiProgramRejected).rounds,
            usage,
          },
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
  stopTracking();
  if (tracking && progressId) {
    live.elapsedMs = Date.now() - startedAt;
    live.current = null;
    await finishRun(repo.db, progressId, {
      status: 'done',
      result: { artifactId: artifact.id },
      partial: { live },
    }).catch(() => undefined);
  }
  const usage: AiCallUsage[] = [];
  for (const [index, call] of result.calls.entries()) {
    // Lượt bị bộ kiểm bác vẫn là một dòng chi phí — ghi đúng là «bị bác», không phải «dùng được».
    const rejected = result.rounds[index]?.outcome === 'rejected';
    const outcome = {
      ...call,
      status: rejected ? ('rejected' as const) : ('ok' as const),
      ...(rejected ? { errorCode: 'checks' } : {}),
      artifactId: artifact.id,
      request: requestAt(index),
    };
    await recordAiCall(repo.db, callScope, meta, outcome, publicRoute?.pricing, promptStore);
    usage.push(usageSummary(meta, outcome, publicRoute?.pricing, router.isBilled(call.provider)));
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
    // Số token và tiền của TỪNG lượt gọi (lượt đầu, lượt sửa) — hiện ngay dưới kết quả.
    usage,
    // Kết quả kiểm từng lượt — lượt đầu bị bác vì sao, để sửa lời dẫn đúng chỗ.
    rounds: result.rounds,
    reasoningEffort: reasoningEffort ?? null,
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
 * Cả phương án mặt bằng dạng DXF (R12, mm, mọi tầng cạnh nhau) — dựng LÚC ĐỌC, không lưu, cùng lý do với
 * tờ SVG ở trên (Q-45a, 15/09/2026).
 *
 * Xuất MỘT CHIỀU: không có đường nhập ngược tệp đã sửa tay (CLAUDE.md 8.7). Tệp mang câu cảnh báo nhánh
 * AI trên từng tầng — đây là bản phác để người vẽ dựng tiếp trên CAD, không phải hồ sơ phát hành (T14).
 */
aiApp.get('/plan/:projectId/dxf', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã phương án cần xuất.' }, 400);

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

  const { dxf } = planDxf(artifact.payload as AiFloorPlan);
  const short = artifactId.replace(/^sha256:/, '').slice(0, 8);
  return new Response(dxf, {
    headers: {
      'Content-Type': 'application/dxf',
      'Content-Disposition': `attachment; filename="mat-bang-ai-${short}.dxf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
});

/**
 * ẢNH NEO của một tầng — tờ rút gọn để trình duyệt rasterise rồi GỬI CHO MÔ HÌNH ẢNH (T57).
 *
 * ⚠️ Tuyến RIÊNG, không phải một tham số `?variant=` của `/sheet`, và đây là chỗ ghi luật cho cả
 * đợt: **tờ trả về từ đây RỜI KHỎI HỆ THỐNG.** Nó đi qua trình duyệt rồi ra thẳng nhà cung cấp mô
 * hình ảnh, nên nó KHÔNG được mang dữ liệu hạng 1 — không khung tên, không mã hồ sơ, không tên
 * người. `config/models.yaml` xếp khung tên là hạng 1 và `llm/router.ts` chặn hạng 1 trước khi ra
 * mạng, nhưng chặn ấy đọc `dataClass` do lớp gọi khai, không đọc pixel.
 *
 * Với một tham số thì một chỗ gọi quên `&variant=anchor` sẽ lặng lẽ gửi tờ A3 có khung tên đi.
 * Với một đường dẫn riêng thì không có cách nào tới nhầm. Cái giá là thêm một khối kiểm quyền
 * chép lại — trả giá ấy có chủ đích.
 *
 * Cache ngắn và không `immutable`, cùng lý lẽ đã ghi ở `/sheet`: tờ phụ thuộc cả mã bộ vẽ lẫn
 * `kb/sheet_style.yaml`, hai thứ không nằm trong địa chỉ.
 */
aiApp.get('/plan/:projectId/anchor', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã phương án cần vẽ.' }, 400);
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
    const anchor = planAnchor(artifact.payload as AiFloorPlan, level);
    return new Response(anchor.svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        // Cỡ canvas do MÁY CHỦ khai, trình duyệt không tự đoán: `<img>` nạp một SVG khai cỡ bằng
        // điểm ảnh thì `naturalWidth` đọc được, nhưng chỉ ở một số trình duyệt — và đoán sai thì
        // tấm PNG ra không còn đúng một trong ba khung chuẩn nữa.
        'X-Anchor-Width': String(anchor.widthPx),
        'X-Anchor-Height': String(anchor.heightPx),
      },
    });
  } catch (error) {
    if (error instanceof PlanSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

/** Trần ảnh neo sau khi giải mã — tờ nét đen trắng 1536 px nặng 200–400 KB, nên đây là trần rộng
 * gấp mười lần chỗ cần. Nó chặn một lần gửi nhầm, không chặn một tờ lớn. */
const MAX_ANCHOR_BYTES = 4 * 1024 * 1024;
/** Độ dài chuỗi base64 tương ứng — kiểm TRƯỚC khi giải mã, để không cấp phát một mảng khổng lồ
 * rồi mới từ chối. */
const MAX_ANCHOR_B64 = Math.ceil(MAX_ANCHOR_BYTES / 3) * 4;

/**
 * Vẽ tờ mặt bằng CÓ NỘI THẤT bằng mô hình ảnh, từ ảnh neo (T57, 19/09/2026).
 *
 * ⚠️ Chỗ dễ hỏng nhất của cả tuyến nằm ở một dòng: `sheetImageCallOptions` phải mang ĐÚNG MỘT ảnh
 * vào. Gửi mảng rỗng thì lời gọi vẫn chạy, vẫn ra ảnh, vẫn tính tiền — và vẫn là T21, tức mô hình
 * vẽ một ngôi nhà KHÁC. Không màn hình nào lộ ra chuyện đó, nên nó có phép thử riêng canh.
 *
 * Đòi quyền GHI chứ không phải quyền đọc: lượt này tiêu tiền thật, và người chỉ được xem hồ sơ
 * không được phép tạo ra một hoá đơn.
 *
 * ⚠️ Byte ảnh neo do TRÌNH DUYỆT gửi lên, vì Worker không có canvas nên không tự rasterise được tờ
 * SVG. Máy chủ không có cách chứng minh tấm nhận về đúng là tờ nó vừa phát ra ở `/anchor`. Ba thứ
 * giảm nhẹ: `dataClass` khai CỨNG bằng 2 tại chỗ gọi, trần kích thước, và băm ảnh neo ghi vào
 * artifact để về sau còn truy được. Đường thoát thật là rasterise ở máy chủ — chưa làm.
 */
aiApp.post('/plan/:projectId/sheet-image', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const projectId = c.req.param('projectId');
  const body = (await c.req.json()) as {
    artifactId?: string;
    level?: number;
    route?: string;
    anchorBase64?: string;
  };
  if (!body.artifactId) return c.json({ error: 'Thiếu mã phương án mặt bằng.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
  const level = Number(body.level ?? 1);
  if (!Number.isInteger(level) || level < 1) {
    return c.json({ error: 'Số tầng không hợp lệ.' }, 400);
  }
  const anchorBase64 = body.anchorBase64;
  if (!anchorBase64) return c.json({ error: 'Thiếu ảnh neo của tờ mặt bằng.' }, 400);
  if (anchorBase64.length > MAX_ANCHOR_B64) {
    return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi vẽ lại.' }, 413);
  }
  // CHỈ nhận PNG, hẹp hơn hợp đồng (hợp đồng để ngỏ ba kiểu cho bộ dựng ảnh neo sau này). Bộ dựng
  // DUY NHẤT hiện có — `web/src/lib/rasterise.ts` — luôn xuất PNG, và chỉ PNG mới đọc được kích
  // thước bằng vài dòng ở `pngSize`. Nhận thêm hai kiểu nữa là mất phép kiểm ở dưới mà không đổi
  // lại được gì.
  if (anchorMime(anchorBase64) !== 'image/png') {
    return c.json({ error: 'Ảnh neo phải là tệp PNG.' }, 400);
  }
  const anchorMimeType = 'image/png';

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const router = modelRouter(c.env);
  if (!isSelectableRoute(aiModelCatalogue(router), 'image', body.route, AI_DIGEST_DATA_CLASS)) {
    return c.json(
      { error: 'Model vẽ ảnh đã chọn không dùng được lúc này. Chọn model khác trong danh sách.' },
      409,
    );
  }
  const client = imageClientFor(c.env, body.route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(body.artifactId, projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }
  const plan = artifact.payload as AiFloorPlan;

  // Phong cách đi theo lineage mặt bằng → chương trình → đầu bài, cùng đường `/review` đã đi.
  // Khác `/review` ở chỗ xử lý khi lineage GÃY: ở đó là 409 vì lineage dùng để KIỂM, còn ở đây
  // phong cách chỉ là một mệnh đề trang trí — thiếu thì bỏ câu ấy, không chặn cả tờ vẽ.
  const styleCode = await briefStyleOf(repo, projectId, plan);

  // Dựng LẠI ảnh neo ở máy chủ. Rẻ (hàm thuần, vài mili-giây) và trả về hai thứ không nhận từ
  // trình duyệt được: tỷ lệ để ghi vào khung tên, và cỡ khung để đối chiếu với tệp nhận về.
  let anchor: ReturnType<typeof planAnchor>;
  try {
    anchor = planAnchor(plan, level);
  } catch (error) {
    if (error instanceof PlanSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }

  const anchorBytes = decodeBase64(anchorBase64);
  if (anchorBytes.length > MAX_ANCHOR_BYTES) {
    return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi vẽ lại.' }, 413);
  }
  // ⚠️ Máy chủ KHÔNG rasterise được tờ SVG (không có canvas; và binding `IMAGES` của Cloudflare
  // nhận SVG nhưng không đổi nó thành ảnh — «does not resize SVG files and will ignore any
  // optimization parameters»). Nên nó không so được từng điểm ảnh.
  //
  // Đối chiếu KÍCH THƯỚC là thứ nó còn làm được, và nó bắt đúng loại sự cố đáng lo ở đây — không
  // phải một kẻ tấn công, mà một nhầm lẫn: gửi ảnh của tầng khác, của phương án khác, một tấm cũ
  // còn trong bộ nhớ, hay một ảnh chụp màn hình. Ba tầng có ba khung khác nhau khi hình bao khác
  // nhau, nên đây không phải phép kiểm hình thức.
  const size = pngSize(anchorBytes);
  if (!size || size.width !== anchor.widthPx || size.height !== anchor.heightPx) {
    return c.json(
      {
        error: `Ảnh neo không khớp tờ mặt bằng của tầng này (cần ${anchor.widthPx}×${anchor.heightPx} điểm ảnh). Mở lại trang rồi vẽ lại.`,
      },
      400,
    );
  }

  const prompts = aiPrompts();
  let prompt: ReturnType<typeof sheetImagePrompt>;
  try {
    prompt = sheetImagePrompt({
      plan,
      level,
      prompts,
      labels: roomLabels(),
      scale: anchor.scale,
      styleCode,
    });
  } catch (error) {
    if (error instanceof PlanSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }

  const publicRoute = router.publicRoutes().find((r) => r.route === body.route);
  const callScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId,
    discipline: DISCIPLINE,
    actorId: scope.actorId,
  };

  let image;
  try {
    image = await withAiCall(
      repo.db,
      callScope,
      {
        route: body.route,
        // `purpose` riêng, KHÔNG gộp với `plan`: tiền ảnh và tỷ lệ ảnh hỏng là hai con số phải
        // tách ra được khỏi tiền của bước chữ.
        purpose: 'plan_sheet_image',
        dataClass: AI_DIGEST_DATA_CLASS,
        promptVersion: prompts.version,
      },
      {
        provider: router.providerOf(body.route) ?? 'unknown',
        model: publicRoute?.model ?? 'unknown',
        pricing: publicRoute?.pricing,
      },
      () =>
        client.generateImage(
          body.route!,
          AI_DIGEST_DATA_CLASS,
          sheetImageCallOptions(prompt, {
            mimeType: anchorMimeType,
            dataBase64: anchorBase64,
          }),
        ),
      1,
    );
  } catch (error) {
    if (error instanceof LlmCallFailed) {
      return c.json({ error: error.userMessage ?? error.message }, error.retryable ? 503 : 502);
    }
    throw error;
  }

  const bytes = decodeBase64(image.dataBase64);
  const mime = image.mimeType;
  const store = createRenderStore(c.env);
  let uri: string;
  try {
    uri = await store.put(await renderKey(projectId, 'plan-sheet', bytes, mime), bytes, mime);
  } catch (error) {
    // Lượt gọi đã tính tiền rồi. Nói ra rằng ảnh có nhưng không cất được, đừng để câu lỗi nghe
    // như thể mô hình hỏng.
    if (error instanceof RenderStoreError) {
      return c.json({ error: `Đã vẽ được tờ nhưng không lưu được: ${error.message}` }, 502);
    }
    throw error;
  }

  // Cỡ tấm ảnh đọc từ chính tệp nhận về. Bản trước để trống hai trường này dù `pngSize` đã nằm sẵn
  // trong tệp — tức hợp đồng khai hai trường mà không ai ghi, và người đọc artifact về sau không
  // biết tờ mình đang cầm to bằng nào. Chỉ PNG đọc được; nhà cung cấp trả kiểu khác thì vẫn `null`.
  const drawnSize = mime === 'image/png' ? pngSize(bytes) : null;

  const written = await repo.write({
    scope: callScope,
    kind: 'ai_plan_sheet_image',
    payload: assembleSheetImage({
      planRef: artifact.id,
      level,
      uri,
      mime,
      widthPx: drawnSize?.width ?? null,
      heightPx: drawnSize?.height ?? null,
      prompt: prompt.prompt,
      styleCode,
      anchor: {
        sha256: await sha256Hex(anchorBytes),
        bytes: anchorBytes.length,
        mime: anchorMimeType,
      },
      route: body.route,
      provider: image.provider,
      model: image.model,
      promptVersion: prompts.version,
      latencyMs: image.latencyMs,
    }),
    inputs: [artifact.id],
    step: 'ai_plan_sheet',
    // Băm ảnh neo CỐ Ý không vào `params`: `params_hash` là chỗ nhận ra «đã tính rồi, dùng lại»,
    // mà mô hình ảnh không tất định — bật dùng lại ở đây là trả về tấm cũ cho một lần bấm mới.
    params: { route: body.route, prompt_version: prompts.version, level },
    // KHÔNG đặt head: một mặt bằng có nhiều tầng, và mỗi tầng vẽ lại được nhiều lần. `design_head`
    // chỉ giữ được MỘT dòng cho mỗi (hồ sơ, bộ môn, loại) nên nó không mô tả nổi tập hợp này.
    setHead: false,
  });

  return c.json({
    imageArtifactId: written.id,
    level,
    mime,
    watermark: prompts.sheetImage.watermark,
    promptVersion: prompts.version,
    // Tiền của CHÍNH lượt vừa chạy, trả ngay trong phản hồi: một tấm ảnh là một lần tiêu tiền,
    // và người bấm phải thấy con số ấy mà không phải mở bảng nhật ký.
    usage: usageSummary(
      {
        route: body.route,
        purpose: 'plan_sheet_image',
        dataClass: AI_DIGEST_DATA_CLASS,
        promptVersion: prompts.version,
      },
      { ...image, imageCount: 1, status: 'ok' },
      publicRoute?.pricing,
      !router.freeProviders.includes(image.provider),
    ),
  });
});

/**
 * Đọc lại tờ ảnh đã vẽ. Trả về chính byte trong kho — CHƯA đóng dấu.
 *
 * Nhãn cảnh báo đi bằng JSON và do trình duyệt in lên ảnh, cả khi xem lẫn khi tải về. KHÔNG đi
 * bằng header: câu tiếng Việt có dấu không qua header HTTP nguyên vẹn — cùng lý do đã ghi ở tuyến
 * `/sheet` bên trên.
 *
 * ⚠️ `no-cache`, KHÔNG phải `max-age`. Địa chỉ này trỏ tới «tấm MỚI NHẤT của tầng ấy» — một con
 * trỏ ĐỔI ĐƯỢC, vì vẽ lại cùng một tầng là chuyện bình thường và địa chỉ thì không đổi theo. Đặt
 * `max-age=300` như bản đầu là nói với trình duyệt rằng tấm cũ còn dùng được năm phút, và lỗi ấy
 * đã đo được ngày 19/09/2026: vẽ lại bằng model khác xong, màn hình hiện LẠI tấm cũ (695 KB thay
 * vì 2,48 MB) — người dùng vừa trả tiền cho một tấm rồi nhìn vào một tấm khác, không dấu hiệu nào.
 *
 * `no-cache` không có nghĩa là không lưu: trình duyệt vẫn giữ bản sao, chỉ phải hỏi lại mỗi lần.
 * `ETag` mang mã artifact ẢNH, và tuyến này TỰ so `If-None-Match` để trả 304 rỗng khi chưa có tấm
 * mới. Việc so ấy phải viết bằng tay — Workers không tự làm hộ cho một `Response` do mã dựng ra.
 * Trình duyệt gửi hay không gửi câu hỏi điều kiện là quyết định của nó; phần của máy chủ là trả
 * lời đúng khi được hỏi.
 */
aiApp.get('/plan/:projectId/sheet-image', async (c) => {
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
  const found = await latestSheetImage(repo, projectId, artifactId, level);
  if (!found) {
    return c.json({ error: 'Tầng này chưa có tờ ảnh do AI vẽ.' }, 404);
  }

  // So `ETag` Ở ĐÂY, bằng tay. Workers KHÔNG tự trả 304 cho một `Response` do mã dựng ra — bản
  // trước đặt `ETag` rồi tin là nền tảng lo nốt, nên mỗi lần mở lại trang là một lần tải lại cả
  // tấm ảnh (đo được: 2,48 MB). Mã artifact là băm nội dung nên so bằng chuỗi là đủ.
  if ((c.req.header('If-None-Match') ?? '') === `"${found.id}"`) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-cache', ETag: `"${found.id}"` },
    });
  }

  const store = createRenderStore(c.env);
  let image;
  try {
    image = await store.get(found.payload.uri);
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
  return new Response(image.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': found.payload.mime,
      'Cache-Control': 'private, no-cache',
      ETag: `"${found.id}"`,
    },
  });
});

/** Băm nội dung một mảng byte thành 64 ký tự hex — cùng phép băm `renderKey` dùng cho khoá kho. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mã phong cách của đầu bài mà phương án này bám theo — `null` khi lineage gãy.
 *
 * Không ném và không trả lỗi: phong cách chỉ thêm một câu vào lời dẫn, còn tờ vẽ thì vẫn dựng được
 * mà không có nó. Chặn cả lượt vẽ vì thiếu một mệnh đề trang trí là sai tỷ lệ hậu quả.
 */
async function briefStyleOf(
  repo: ArtifactRepository,
  projectId: string,
  plan: AiFloorPlan,
): Promise<string | null> {
  const program = await repo.get(plan.program_ref, projectId);
  if (!program || program.kind !== 'ai_space_program') return null;
  const brief = await repo.get((program.payload as AiSpaceProgram).brief_ref, projectId);
  if (!brief || brief.kind !== 'design_brief') return null;
  return (brief.payload as DesignBrief).style ?? null;
}

/**
 * Tờ ảnh MỚI NHẤT của một tầng.
 *
 * Mới nhất chứ không phải duy nhất: vẽ lại cùng một tầng là chuyện bình thường (mô hình ảnh không
 * tất định), và mỗi lần vẽ đúc một artifact mới nối vào cùng bản mặt bằng. Bản cũ vẫn ở đó —
 * artifact bất biến — nên «mới nhất» là một phép chọn lúc đọc, không phải một trạng thái được ghi
 * ở đâu cả.
 */
async function latestSheetImage(
  repo: ArtifactRepository,
  projectId: string,
  planArtifactId: string,
  level: number,
): Promise<{ id: string; payload: AiPlanSheetImage } | null> {
  // Đi từ MỚI NHẤT và dừng ngay khi khớp tầng. Số tầng nằm trong payload, mà payload thì ở kho đối
  // tượng — nên mỗi lần thử là một lượt đi mạng. Vẽ lại một tầng là chuyện bình thường, nên duyệt
  // hết danh sách sẽ tốn thêm một lượt tải cho MỖI lần vẽ lại đã từng có, và con số ấy lớn dần
  // theo thói quen dùng.
  const targets = await repo.edgeTargets(planArtifactId, 'ai_plan_sheet');
  for (const target of targets) {
    if (target.kind !== 'ai_plan_sheet_image') continue;
    const artifact = await repo.get(target.id, projectId);
    if (!artifact) continue;
    const payload = artifact.payload as AiPlanSheetImage;
    if (payload.level === level) return { id: artifact.id, payload };
  }
  return null;
}

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
    verticalTypes: new Set(groups.circulation ?? []),
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
      // T53: mã, loại và diện tích từng phòng — để kỹ sư gọi đúng phòng trong ô yêu cầu sửa (tờ vẽ không in mã).
      roomList: level.rooms.map((room) => ({
        id: room.id,
        type: room.type,
        area_m2: room.area_m2,
      })),
      // Không gian mở đã chia khu (T48) — màn hình nói bằng chữ điều tờ vẽ nói bằng nét đứt.
      openSpaces: level.rooms
        .filter((room) => (room.parts?.length ?? 0) > 1)
        .map((room) => ({
          id: room.id,
          parts: room.parts!.map((part) => ({ type: part.type, area_m2: part.area_m2 })),
        })),
      // Ý định mô hình khai (đã chuẩn hoá) và cách bộ giải chọn cây — T43. Rỗng ở artifact cũ.
      intent: level.intent ?? null,
      arrange: level.arrange ?? null,
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
    score: plan.score ? scoreForScreen(plan.score, planQuality()) : null,
    // T53: ngưỡng nhận của luồng tự động, và phương án này có sửa bằng ô yêu cầu được không.
    acceptPercent: planQuality().acceptPercent,
    editable: plan.levels.every((level) => level.tree),
    edit: plan.generator.edit ?? null,
  });
});

/**
 * Khởi động lượt xếp mặt bằng — một tới ba phương án, chạy nền qua Workflow.
 *
 * Trả về NGAY với mã lượt chạy. Mỗi phương án là MỘT lượt gọi cho cả nhà (T45) cộng tối đa ba lượt sửa;
 * giữ một kết nối HTTP mở chừng đó là cách chắc chắn để mất kết quả của những lượt gọi ĐÃ TÍNH TIỀN.
 *
 * Mọi điều kiện tốn-tiền-được kiểm TRƯỚC khi mở instance: có khoá, tuyến bấm được, có đầu bài đã
 * xác nhận và qua cổng, không có lượt nào của cùng giai đoạn đang chạy. Kiểm sau thì lượt gọi đầu
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
    /** Mức suy nghĩ cho mọi lượt gọi của lượt chạy này; vắng = cấu hình tuyến. */
    reasoningEffort?: string;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);
  const planEffort = (REASONING_EFFORTS as readonly string[]).includes(body.reasoningEffort ?? '')
    ? (body.reasoningEffort as ReasoningEffort)
    : null;
  if (body.reasoningEffort && !planEffort) {
    return c.json({ error: 'Mức suy nghĩ không hợp lệ — chọn Thấp, Vừa hoặc Cao.' }, 400);
  }

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

  // Đầu vào của mặt bằng là ĐẦU BÀI + KHẢO SÁT, không phải chương trình không gian (T45, Haan
  // 15/09/2026: «tạm bỏ qua thông tin từ chương trình không gian»). Cùng cổng với bước chương trình:
  // đầu bài tự mâu thuẫn ở mức nghiêm trọng thì không tốn một lượt gọi nào (T41).
  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, DISCIPLINE, 'design_brief');
  if (!brief) {
    return c.json(
      {
        error: 'Chưa có đầu bài đã xác nhận. Hoàn tất và xác nhận đầu bài trước khi xếp mặt bằng.',
      },
      409,
    );
  }
  const gate = gateLayer2(brief.payload, await readCompletenessThreshold(repo.db, scope.tenantId));
  if (!gate.allowed) return c.json({ error: gate.message }, 409);

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

  const strategies = aiPrompts().floorLevel.strategies;
  // `Math.round(NaN)` là NaN, và `slice(0, NaN)` trả mảng RỖNG: một thân lời gọi hỏng sẽ mở một
  // lượt chạy không có phương án nào và kết thúc bằng «hỏng» mà không ai hiểu vì sao.
  // Mặc định MỘT phương án (Haan, 13/09/2026): mỗi phương án là cả loạt lượt gọi tính tiền, và
  // kỹ sư chủ động chọn thêm khi muốn so sánh.
  const requested = Number(body.count ?? 1);
  const count = Number.isFinite(requested)
    ? Math.max(1, Math.min(strategies.length, Math.round(requested)))
    : 1;
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
    reasoningEffort: planEffort,
    briefRef: brief.id,
    digest,
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

/** Trần chữ yêu cầu sửa — khớp `generator.edit.instruction` của `ai-floor-plan`. */
const EDIT_INSTRUCTION_MAX = 2000;

/**
 * Kỹ sư sửa một phương án đã lưu bằng một câu yêu cầu (T53, 16/09/2026 — Haan: «có một ô chat để kĩ sư
 * đưa vào yêu cầu của họ sau khi review bản vẽ … ấn sửa lại»).
 *
 * Cùng hàng rào với `POST /plan/runs`: quyền ghi, model bật, khoá API, một lượt chạy mặt bằng mỗi lúc.
 * Khác ở ĐẦU VÀO: đầu bài đọc theo LINEAGE của bản gốc (mặt bằng → chương trình → đầu bài), không đọc
 * head — bản vẽ được sửa phải được đối chiếu với đúng đầu bài nó đã xếp theo. Kết quả là artifact MỚI trỏ
 * bản gốc; bản gốc không đổi (8.2 nguyên tắc 6).
 */
aiApp.post('/plan/edit', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    artifactId?: string;
    instruction?: string;
    route?: string;
    reasoningEffort?: string;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Thiếu mã phương án cần sửa.' }, 400);
  const instruction = (body.instruction ?? '').trim();
  if (instruction.length < 3) {
    return c.json({ error: 'Chưa có yêu cầu sửa. Ghi rõ phòng nào, đổi thế nào.' }, 400);
  }
  if (instruction.length > EDIT_INSTRUCTION_MAX) {
    return c.json(
      { error: `Yêu cầu sửa dài quá ${EDIT_INSTRUCTION_MAX} ký tự — tách thành nhiều lần sửa.` },
      400,
    );
  }
  if (!body.route) return c.json({ error: 'Chưa chọn model AI.' }, 400);
  const effort = (REASONING_EFFORTS as readonly string[]).includes(body.reasoningEffort ?? '')
    ? (body.reasoningEffort as ReasoningEffort)
    : null;
  if (body.reasoningEffort && !effort) {
    return c.json({ error: 'Mức suy nghĩ không hợp lệ — chọn Thấp, Vừa hoặc Cao.' }, 400);
  }
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
  const base = await repo.get(body.artifactId, body.projectId);
  if (!base || base.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }
  const plan = base.payload as AiFloorPlan;
  if (plan.levels.some((level) => !level.tree)) {
    return c.json(
      {
        error:
          'Phương án này tạo trước khi lưu cây chia nên không sửa trực tiếp được. Xếp lại mặt bằng rồi sửa.',
      },
      409,
    );
  }
  const program = await repo.get(plan.program_ref, body.projectId);
  if (!program || program.kind !== 'ai_space_program') {
    return c.json({ error: 'Không đọc được chương trình không gian của phương án này.' }, 409);
  }
  const briefRef = (program.payload as AiSpaceProgram).brief_ref;
  const brief = await repo.get(briefRef, body.projectId);
  if (!brief || brief.kind !== 'design_brief') {
    return c.json({ error: 'Không đọc được đầu bài mà phương án này bám theo.' }, 409);
  }

  const running = await activeRun(repo.db, body.projectId, 'plan');
  if (running) {
    return c.json(
      {
        error: 'Đang có một lượt xếp hoặc sửa mặt bằng chạy dở. Chờ lượt đó xong rồi sửa.',
        runId: running.id,
      },
      409,
    );
  }

  const strategy = aiPrompts().floorLevel.strategies.find((item) => item.id === plan.variant_id);
  const variant = {
    id: plan.variant_id,
    label: plan.variant_label ?? plan.variant_id,
    strategy: plan.strategy ?? strategy?.strategy ?? '',
  };
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
  const run = await createRun(repo.db, runScope, { stage: 'plan', steps: editStepSpecs() });
  const params: AiDesignParams = {
    runId: run.id,
    ...runScope,
    stage: 'plan',
    textRoute: body.route,
    reasoningEffort: effort,
    briefRef,
    digest,
    rulePacks: { standards: false, experience: false },
    variants: [variant],
    edit: { baseArtifactId: body.artifactId, instruction },
  };
  try {
    const instance = await c.env.AI_DESIGN_PIPELINE.create({ params });
    await attachWorkflow(repo.db, run.id, instance.id);
  } catch (error) {
    await finishRun(repo.db, run.id, {
      status: 'failed',
      error: 'Không mở được luồng chạy nền. Thử lại sau.',
    });
    throw error;
  }
  return c.json({ runId: run.id, variants: [{ id: variant.id, label: variant.label }] }, 202);
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
 * «Xoá» một phương án mặt bằng khỏi dải chọn (18/09/2026, Haan: danh sách phương án đang quá dài).
 *
 * THÔI HIỆN, không xoá dữ liệu: artifact bất biến và có lineage (CLAUDE.md 8.2 nguyên tắc 6), nên
 * mọi bản sửa dựng từ nó, tờ vẽ đã xuất và nhật ký chi phí vẫn đọc được. Bỏ dòng đánh dấu thì
 * phương án trở lại — bảng `design_artifact_hidden` mở cả INSERT lẫn DELETE cho người ghi được hồ sơ.
 *
 * Phương án ĐANG CHỌN thì gỡ luôn `design_head`: để lại một mốc trỏ vào thứ màn hình không còn hiện
 * là cách chắc chắn nhất làm bước mặt đứng đọc nhầm phương án.
 */
aiApp.post('/plan/hide', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const body = (await c.req.json()) as {
    projectId?: string;
    artifactId?: string;
    hidden?: boolean;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Chưa chọn phương án nào.' }, 400);
  const hidden = body.hidden !== false;

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng này trong hồ sơ.' }, 404);
  }

  if (!hidden) {
    const { error } = await db
      .from('design_artifact_hidden')
      .delete()
      .eq('artifact_id', artifact.id);
    if (error) return c.json({ error: 'Không đưa lại được phương án vào danh sách.' }, 500);
    return c.json({ artifactId: artifact.id, hidden: false });
  }

  const { error } = await db.from('design_artifact_hidden').upsert(
    {
      artifact_id: artifact.id,
      tenant_id: scope.tenantId,
      project_id: body.projectId,
      discipline: DISCIPLINE,
      hidden_by: scope.actorId,
    },
    { onConflict: 'artifact_id' },
  );
  if (error) return c.json({ error: 'Không xoá được phương án khỏi danh sách.' }, 500);

  await repo.clearHead(body.projectId, DISCIPLINE, 'ai_floor_plan', artifact.id);

  return c.json({ artifactId: artifact.id, hidden: true });
});

/**
 * Tiến độ một lượt chạy nền.
 *
 * Đọc dòng `design_ai_run` dưới phiên người gọi (RLS), rồi ĐỐI CHIẾU với trạng thái instance
 * Workflow. Vì sao cần vế thứ hai: nếu instance chết theo cách không kịp ghi gì (hết giờ nền
 * tảng, lỗi lúc khởi động), dòng sẽ nằm mãi ở `running` và màn hình quay một thanh chờ không
 * bao giờ dừng. Một lượt chạy hỏng phải nói là hỏng.
 */
/**
 * Nút «Dừng» của kỹ sư — đánh dấu lượt chạy là đã dừng. Tuyến đang chạy đọc dấu này trong lần
 * ghi tiến độ kế tiếp (≤ 2 giây) và huỷ lời gọi tới nhà cung cấp.
 *
 * Quyền: phải đọc được dòng (RLS) VÀ ghi được hồ sơ của nó. Ghi bằng khoá dịch vụ vì bảng không
 * mở quyền ghi cho trình duyệt.
 */
aiApp.post('/runs/:id/cancel', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const runId = c.req.param('id');
  const db = await asUser(c.env, token);
  const row = await db
    .from('design_ai_run')
    .select('id, project_id, tenant_id, status')
    .eq('id', runId)
    .maybeSingle();
  if (row.error) return c.json({ error: 'Không đọc được lượt chạy.' }, 500);
  if (!row.data) return c.json({ error: 'Không tìm thấy lượt chạy này.' }, 404);
  const denied = await denyUnlessWritable(
    db,
    row.data.tenant_id as string,
    row.data.project_id as string,
  );
  if (denied) return c.json({ error: denied.error }, denied.status);
  if (row.data.status !== 'running' && row.data.status !== 'queued') {
    return c.json({ stopped: false, status: row.data.status });
  }
  const repo = new ArtifactRepository(c.env);
  const { error } = await repo.db
    .from('design_ai_run')
    .update({ status: 'failed', error: RUN_CANCELLED, updated_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) return c.json({ error: 'Không dừng được lượt chạy.' }, 500);
  return c.json({ stopped: true });
});

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

  if (status === 'queued' || status === 'running') {
    // Hai kiểu chết, và kiểu thứ hai mới là kiểu hay gặp. `workflowDead` bắt instance TỰ KHAI
    // là hỏng. Nhưng một instance thành thây ma thì vẫn khai `running` mãi mãi — lúc ấy chỉ có
    // mốc cập nhật cuối nói được sự thật. Xem `RUN_STALE_MS`.
    const dead =
      workflowId && c.env.AI_DESIGN_PIPELINE
        ? await workflowDead(c.env.AI_DESIGN_PIPELINE, workflowId)
        : null;
    // Dòng có nhịp tim thì ba phút im lặng là đủ biết. Hai dạng nhịp, vì hai loại lượt chạy khác
    // nhau: `live` là bảng theo dõi trực tiếp của bước gọi model CHỮ (token, thời gian, nút Dừng);
    // `heartbeat` là nhịp trần của lượt vẽ ẢNH, nơi không có token nào chảy ra để mà hiện (T67).
    // Thiếu vế thứ hai thì một lượt phối cảnh chết phải đợi `RUN_STALE_MS` — hơn hai tiếng — mới
    // được tuyên bố là hỏng, và suốt hai tiếng ấy nó chặn luôn lượt sau. Đã xảy ra thật 20/09/2026.
    const partial = (row.data.progress as { partial?: Record<string, unknown> } | null)?.partial;
    const heartbeat = Boolean(partial?.live ?? partial?.heartbeat);
    const stalled = runStalled(
      row.data.updated_at as string | null,
      Date.now(),
      heartbeat ? LIVE_STALE_MS : RUN_STALE_MS,
    )
      ? 'Luồng chạy nền không còn tiến triển. Lượt chạy này coi như hỏng — chạy lại từ đầu.'
      : null;
    const reason = dead ?? stalled;
    if (reason) {
      status = 'failed';
      error = reason;
      const repo = new ArtifactRepository(c.env);
      await finishRun(repo.db, runId, { status: 'failed', error: reason });
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
        ? `Luồng chạy nền dừng vì lỗi: ${String(state.error)}`
        : 'Luồng chạy nền dừng vì lỗi.';
    }
    if (state.status === 'terminated') return 'Luồng chạy nền đã bị dừng.';
    return null;
  } catch {
    return null;
  }
}

// ── Nguyên văn lời gọi mô hình (13/09/2026) ─────────────────────────────────────────────────
//
// Haan: «tôi muốn biết bạn đã input những gì vào prompt cho model AI». Mỗi lượt gọi mô hình chữ
// lưu một bản ghi cạnh dòng nhật ký (`ai/prompt-record.ts`); hai tuyến dưới đây cho màn hình biết
// lượt nào có bản ghi và tải một bản ghi về dạng tệp chữ. Cả hai kiểm quyền ĐỌC hồ sơ dưới phiên
// người dùng trước khi dùng khoá kho: đầu bài trong lời gọi là dữ liệu của hồ sơ.

const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

aiApp.get('/calls/:projectId/prompts', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  try {
    const names = await createArtifactStore(c.env).list(`${projectId}/ai_calls`);
    const callIds = names
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .filter((id) => CALL_ID.test(id));
    return c.json({ callIds });
  } catch {
    return c.json({ error: 'Không đọc được danh sách lời gọi đã lưu.' }, 502);
  }
});

aiApp.get('/calls/:projectId/:callId/prompt', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const callId = c.req.param('callId');
  if (!CALL_ID.test(callId)) return c.json({ error: 'Mã lượt gọi không hợp lệ.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  // Dòng nhật ký đọc dưới RLS: lượt gọi của hồ sơ khác không lọt qua được dù đoán trúng mã.
  const row = await db
    .from('design_ai_call')
    .select(
      'id, created_at, purpose, provider, model, prompt_version, input_tokens, output_tokens, status',
    )
    .eq('id', callId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (row.error) return c.json({ error: 'Không đọc được nhật ký lượt gọi.' }, 500);
  if (!row.data) return c.json({ error: 'Không tìm thấy lượt gọi này trong hồ sơ.' }, 404);

  const store = createArtifactStore(c.env);
  let record: PromptRecord;
  try {
    record = JSON.parse(await store.get(store.uriOf(promptKey(projectId, callId)))) as PromptRecord;
  } catch {
    return c.json(
      {
        error:
          'Lượt gọi này không có bản ghi nguyên văn — nó chạy trước khi hệ thống bắt đầu lưu lời gọi.',
      },
      404,
    );
  }

  const data = row.data as Record<string, unknown>;
  const createdAt = String(data.created_at);
  const text = formatPromptText(record, {
    createdAt,
    purpose: String(data.purpose),
    purposeLabel: purposeLabelVi(String(data.purpose)),
    provider: String(data.provider),
    model: String(data.model),
    promptVersion: (data.prompt_version as string | null) ?? null,
    inputTokens: (data.input_tokens as number | null) ?? null,
    outputTokens: (data.output_tokens as number | null) ?? null,
    status: String(data.status),
  });
  const stamp = createdAt.replace(/[^0-9]/g, '').slice(0, 14);
  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="prompt-${String(data.purpose)}-${stamp}.txt"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
