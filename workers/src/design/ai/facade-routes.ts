/**
 * Tuyến của bước «2. Mặt đứng» (T59) — gắn vào `aiApp` dưới `/facade`.
 *
 * Tách khỏi `routes.ts` (đã gần 2.000 dòng) nhưng cùng hàng rào: mọi tuyến tự hỏi quyền bộ môn trước
 * khi đọc bằng `ArtifactRepository` (service_role, vượt RLS); tuyến tốn tiền đòi quyền GHI.
 *
 *  · `POST /runs` — khởi động lượt chạy nền: một ý tưởng, theo phương án mặt bằng ĐANG HIỆU LỰC.
 *  · `GET /:projectId` — ý tưởng dạng JSON kèm bảng vật liệu đã dịch nhãn.
 *  · `GET /:projectId/sheet` · `/dxf` · `/anchor` — dựng LÚC ĐỌC, không lưu (cùng lý do với mặt bằng).
 */

import { Hono, type Context } from 'hono';
import {
  aiFacadeBriefSchema,
  aiFacadeReviewSchema,
  type AiFacadeBrief,
  type AiFacadeConcept,
  type AiFacadeImage,
  type AiFacadeReview,
  type AiFloorPlan,
  type DesignBrief,
} from '@nvg/shared/design';
import { ArtifactRepository } from '../artifacts';
import {
  aiDigestInputs,
  asUser,
  denyUnlessReadable,
  denyUnlessWritable,
  projectScope,
  PROJECT_NOT_VISIBLE,
} from '../auth-scope';
import { AI_DIGEST_DATA_CLASS, anonymiseForAi } from '../brief/anonymise';
import type { DesignEnv } from '../env';
import { constructionNorms } from '../kb/construction-data';
import { facadeVocabulary } from '../kb/facade-vocabulary-data';
import { facadeQuality } from './facade/quality-data';
import { scoreFacade, type FacadeScore } from './facade/score';
import { applyFacadeReview, FACADE_REVIEW_SCHEMA_VERSION } from './facade/review';
import { roomGroups } from '../kb/vocabulary';
import { roomVocabulary } from '../kb/vocabulary-data';
import { imageClientFor, modelRouter, textClientFor } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { decodeBase64 } from '../llm/image-bytes';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import { REASONING_EFFORTS, type ReasoningEffort } from '../llm/text-client';
import { facadeStepSpecs } from '../workflows/ai-facade-steps';
import type { AiDesignParams } from '../workflows/ai-design-steps';
import { ElevationSheetError } from './draw/elevation-sheet';
import {
  checkFacadeBriefCodes,
  facadeBriefIssueText,
  FACADE_BRIEF_SCHEMA_VERSION,
} from './facade/brief';
import { briefKeys, facadeLegend } from './facade/describe';
import { facadeFrame, mainDoorOf } from './facade/frame';
import { facadeAnchor, facadeDxf, facadeSheet, railingCmOf } from './facade';
import { usageSummary, withAiCall } from './call-log';
import { assembleFacadeImage, facadeImageCallOptions, facadeImagePrompt } from './facade/image';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { aiPrompts } from './prompts-data';
import { anchorMime, pngSize } from './sheet-image';
import { activeRun, attachWorkflow, createRun, finishRun } from './runs';
import { instanceIdOf } from '../workflows/rpc-stub';

export const facadeApp = new Hono<{ Bindings: DesignEnv }>();

const DISCIPLINE = 'kien_truc' as const;
const NOT_FOUND = 'Không tìm thấy ý tưởng mặt đứng này trong hồ sơ.';

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

type Ctx = Context<{ Bindings: DesignEnv }>;

/**
 * Đọc một ý tưởng mặt đứng sau khi đã hỏi quyền ĐỌC bộ môn. Trả `Response` khi phải dừng (chưa đăng
 * nhập, không thấy hồ sơ, không có quyền, không thấy artifact).
 */
async function readFacade(
  c: Ctx,
): Promise<{ concept: AiFacadeConcept; artifactId: string; createdAt: string } | Response> {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId') ?? '';
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã ý tưởng mặt đứng cần xem.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const artifact = await new ArtifactRepository(c.env).get(artifactId, projectId);
  if (!artifact || artifact.kind !== 'ai_facade_concept') return c.json({ error: NOT_FOUND }, 404);
  return {
    concept: artifact.payload as AiFacadeConcept,
    artifactId: artifact.id,
    createdAt: artifact.createdAt,
  };
}

/** Mã phương án mặt bằng đang hiệu lực — đọc dưới phiên người gọi, bỏ mốc trỏ vào phương án đã ẩn. */
async function planHeadOf(
  db: Awaited<ReturnType<typeof asUser>>,
  projectId: string,
): Promise<string | null> {
  const head = await db
    .from('design_head')
    .select('artifact_id')
    .eq('project_id', projectId)
    .eq('discipline', DISCIPLINE)
    .eq('kind', 'ai_floor_plan')
    .maybeSingle();
  const planRef = (head.data?.artifact_id as string | undefined) ?? null;
  if (!planRef) return null;
  const hidden = await db
    .from('design_artifact_hidden')
    .select('artifact_id')
    .eq('project_id', projectId)
    .eq('artifact_id', planRef)
    .maybeSingle();
  return hidden.data ? null : planRef;
}

/**
 * Danh mục cho các ô chọn của phiếu yêu cầu — mã, nhãn tiếng Việt, mã hex của màu. Màn hình không viết
 * cứng danh sách nào: sửa `kb/facade_vocabulary.yaml` là ô chọn đổi theo.
 *
 * Đăng ký TRƯỚC `/:projectId`: Hono khớp theo thứ tự, và `/vocabulary` cũng là một đoạn đường dẫn.
 */
facadeApp.get('/vocabulary', (c) => {
  if (!bearer(c.req.header('Authorization'))) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const vocab = facadeVocabulary();
  const list = (table: Record<string, { label_vi: string }>) =>
    Object.entries(table).map(([code, entry]) => ({ code, label: entry.label_vi }));
  const labels = (table: Record<string, string>) =>
    Object.entries(table).map(([code, label]) => ({ code, label }));
  const norms = constructionNorms();
  return c.json({
    roofTypes: labels(vocab.roofTypes),
    roofMaterials: list(vocab.roofMaterials),
    materials: list(vocab.materials),
    colours: Object.entries(vocab.colours).map(([code, entry]) => ({
      code,
      label: entry.label_vi,
      hex: entry.hex,
    })),
    railings: list(vocab.railings),
    doorMaterials: list(vocab.doorMaterials),
    doorTypes: list(vocab.doorTypes),
    glassTypes: list(vocab.glassTypes),
    garageDoorTypes: list(vocab.garageDoorTypes),
    fenceTypes: list(vocab.fenceTypes),
    gateTypes: labels(vocab.gateTypes),
    elements: labels(vocab.elements),
    // Mặc định khi kỹ sư để trống — hiện làm chữ gợi ý trong ô, để kỹ sư biết để trống nghĩa là gì.
    defaults: {
      groundRaiseCm: norms.facade ? Math.round(norms.facade.ground_floor_raise_m * 100) : null,
      parapetCm: norms.facade ? Math.round(norms.facade.parapet_height_m * 100) : null,
      doorHeightCm: Math.round((norms.openings.entrance?.height_m ?? 0) * 100) || null,
      railingHCm: Math.round(norms.outdoor.railing_h_m * 100) || null,
    },
  });
});

/**
 * Phiếu yêu cầu hiện hành, kèm những gì phiếu cần biết từ MẶT BẰNG đang chọn: bề rộng cửa (chỉ đọc —
 * bề rộng là của mặt bằng, T16), có sân trước không (ẩn nhóm cổng/rào), có ban công không.
 */
facadeApp.get('/brief/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const [head, planRef] = await Promise.all([
    repo.head(projectId, DISCIPLINE, 'ai_facade_brief'),
    planHeadOf(db, projectId),
  ]);
  // `head` không mang payload — đọc lại dòng artifact để lấy phiếu và thời điểm lưu.
  const brief = head ? await repo.get(head.id, projectId) : null;
  const briefPayload = (brief?.payload as AiFacadeBrief | undefined) ?? null;
  let plan: {
    artifactId: string;
    mainDoorW: number | null;
    sideDoorWs: number[];
    garageW: number | null;
    frontYard: boolean;
    balconies: number;
  } | null = null;
  if (planRef) {
    const artifact = await repo.get(planRef, projectId);
    if (artifact?.kind === 'ai_floor_plan') {
      const outdoor = new Set(roomGroups(roomVocabulary().vocabulary).outdoor ?? []);
      const frame = facadeFrame(artifact.payload as AiFloorPlan, constructionNorms(), outdoor);
      const main = mainDoorOf(frame.openings);
      plan = {
        artifactId: planRef,
        mainDoorW: main?.w ?? null,
        sideDoorWs: frame.openings.filter((o) => o.kind === 'door' && o !== main).map((o) => o.w),
        garageW: frame.openings.find((o) => o.kind === 'garage')?.w ?? null,
        frontYard: frame.frontYard,
        balconies: frame.balconies.length,
      };
    }
  }
  return c.json({
    artifactId: brief?.id ?? null,
    savedAt: briefPayload?.saved_at ?? brief?.createdAt ?? null,
    brief: briefPayload,
    plan,
  });
});

/**
 * Lưu phiếu yêu cầu — một artifact MỚI mỗi lần lưu, đặt head. Không gọi AI, không tốn tiền; nhưng đòi
 * quyền GHI như mọi thao tác đổi hồ sơ. Mã ngoài danh mục bị từ chối ở đây, để phiếu hỏng không bao
 * giờ tới được lượt gọi tính tiền.
 */
facadeApp.post('/brief/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const body = (await c.req.json()) as { brief?: unknown };
  const parsed = aiFacadeBriefSchema.safeParse({
    ...(body.brief as Record<string, unknown> | undefined),
    schema_version: FACADE_BRIEF_SCHEMA_VERSION,
    // Máy chủ đặt cả ba khoá này, không tin trình duyệt. `saved_at` còn giữ cho hai hồ sơ cùng điền
    // một phiếu giống hệt không đúc ra chung một mã artifact (mã là băm NỘI DUNG).
    saved_at: new Date().toISOString(),
    plan_ref: await planHeadOf(db, projectId),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: 'Phiếu yêu cầu chưa đúng nên chưa lưu được. Sửa những mục dưới đây rồi lưu lại.',
        issues: parsed.error.issues.slice(0, 10).map(facadeBriefIssueText),
      },
      400,
    );
  }
  const issues = checkFacadeBriefCodes(parsed.data, facadeVocabulary());
  if (issues.length) {
    return c.json({ error: 'Phiếu có mục không có trong danh mục.', issues }, 400);
  }
  const written = await new ArtifactRepository(c.env).write({
    scope: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    kind: 'ai_facade_brief',
    payload: parsed.data,
  });
  return c.json({ artifactId: written.id });
});

facadeApp.get('/:projectId', async (c) => {
  const read = await readFacade(c);
  if (read instanceof Response) return read;
  const { concept } = read;
  const vocab = facadeVocabulary();
  // Phiếu mà ý tưởng theo — để đánh dấu dòng nào là yêu cầu của kỹ sư, dòng nào AI đề xuất.
  const briefArtifact = concept.brief_ref
    ? await new ArtifactRepository(c.env).get(concept.brief_ref, c.req.param('projectId') ?? '')
    : null;
  const fromBrief = briefKeys(
    briefArtifact?.kind === 'ai_facade_brief' ? (briefArtifact.payload as AiFacadeBrief) : null,
  );
  // Điểm «giống cách NVG vẽ đến đâu» (T63). Chấm lúc ĐỌC chứ không lưu vào artifact: thước đo còn
  // đang lớn lên theo số hồ sơ đã đo, và một con số đóng băng trong artifact sẽ nói dối ngay lần
  // đầu thước đổi. Artifact bất biến, điểm thì không.
  const score = scoreFacade({
    concept,
    quality: facadeQuality(),
    vocab,
    railingCm: railingCmOf(concept),
  });
  return c.json({
    artifactId: read.artifactId,
    createdAt: read.createdAt,
    planRef: concept.plan_ref,
    style: concept.style,
    // Bảng vật liệu đã dịch nhãn — màn hình không phải tự nạp danh mục.
    legend: facadeLegend(concept, vocab).map((row) => ({
      ...row,
      fromBrief: fromBrief.has(row.key),
    })),
    briefRef: concept.brief_ref ?? null,
    palette: concept.palette,
    roofType: vocab.roofTypes[concept.roof.type] ?? concept.roof.type,
    pitchDeg: concept.roof.pitch_deg ?? null,
    gate: concept.gate
      ? {
          type: vocab.gateTypes[concept.gate.type] ?? concept.gate.type,
          w: concept.gate.w ?? null,
          h: concept.gate.h ?? null,
        }
      : null,
    fenceH: concept.fence?.h ?? null,
    openings: concept.openings_front.length,
    balconies: concept.balconies?.length ?? 0,
    elements: (concept.elevation.elements ?? []).map((e) => vocab.elements[e.kind] ?? e.kind),
    rationale: concept.rationale,
    generator: concept.generator,
    score,
    // Bản KỸ SƯ CHẤM LẠI gần nhất của ĐÚNG bản vẽ này (T63). Tìm qua cạnh lineage chứ không lọc
    // payload: `edgeTargets` trả mã và thời điểm mà không phải tải payload của từng bản chấm cũ.
    review: await latestReview(c, read.artifactId, score),
  });
});

/**
 * Bản chấm tay gần nhất của một bản mặt đứng, kèm điểm đã áp bản chấm ấy. `null` khi chưa ai chấm.
 *
 * Chỉ đọc payload của BẢN MỚI NHẤT. Mỗi lần chấm lại là một artifact mới, nên một hồ sơ dùng lâu
 * sẽ có hàng chục bản; đọc hết để tìm bản mới nhất là một chuỗi lượt đi kho lớn dần theo thói quen
 * dùng, không có gì báo.
 */
async function latestReview(
  c: Ctx,
  facadeId: string,
  score: FacadeScore,
): Promise<Record<string, unknown> | null> {
  const repo = new ArtifactRepository(c.env);
  const targets = await repo.edgeTargets(facadeId, 'ai_facade_review');
  const latest = targets.find((t) => t.kind === 'ai_facade_review');
  if (!latest) return null;
  const artifact = await repo.get(latest.id, c.req.param('projectId') ?? '');
  if (!artifact || artifact.kind !== 'ai_facade_review') return null;
  const review = artifact.payload as AiFacadeReview;
  return {
    artifactId: artifact.id,
    reviewedAt: review.reviewed_at,
    note: review.note,
    criteria: review.criteria,
    machinePercent: review.machine_percent,
    score: applyFacadeReview(score, review, facadeQuality()),
  };
}

/**
 * KỸ SƯ CHẤM LẠI một bản mặt đứng (T63) — KHÔNG gọi mô hình, không tốn tiền.
 *
 * Ghi thành artifact mới nối cạnh `ai_facade_review` từ chính bản vẽ được chấm, và KHÔNG đặt head:
 * «đang hiệu lực» của bộ môn kiến trúc là bản MẶT ĐỨNG, không phải bảng điểm của nó.
 */
facadeApp.post('/review/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const body = (await c.req.json()) as { artifactId?: string; review?: unknown };
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bản mặt đứng nào để chấm.' }, 400);

  const repo = new ArtifactRepository(c.env);
  const facade = await repo.get(body.artifactId, projectId);
  if (!facade || facade.kind !== 'ai_facade_concept') return c.json({ error: NOT_FOUND }, 404);

  // Máy chấm lại NGAY TẠI ĐÂY, không nhận con số từ trình duyệt: `machine_percent` là mốc để về
  // sau đối chiếu người với máy, nên nó phải là điểm máy thật của đúng bản vẽ này.
  const quality = facadeQuality();
  const reviewed = facade.payload as AiFacadeConcept;
  const machine = scoreFacade({
    concept: reviewed,
    quality,
    vocab: facadeVocabulary(),
    railingCm: railingCmOf(reviewed),
  });
  const known = new Set(quality.criteria.map((criterion) => criterion.code));

  const parsed = aiFacadeReviewSchema.safeParse({
    ...(body.review as Record<string, unknown> | undefined),
    schema_version: FACADE_REVIEW_SCHEMA_VERSION,
    facade_ref: facade.id,
    score_version: quality.scoreVersion,
    machine_percent: machine.percent,
    reviewed_at: new Date().toISOString(),
    reviewed_by: scope.actorId,
  });
  if (!parsed.success) {
    return c.json(
      {
        error: 'Bảng chấm chưa đúng. Kiểm tra lại các ô đã điền.',
        issues: parsed.error.issues
          .slice(0, 10)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      },
      400,
    );
  }
  const unknown = parsed.data.criteria.filter((row) => !known.has(row.code)).map((r) => r.code);
  if (unknown.length) {
    return c.json(
      { error: 'Bảng chấm có tiêu chí không có trong thước đo.', issues: unknown },
      400,
    );
  }

  const written = await repo.write({
    scope: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    kind: 'ai_facade_review',
    payload: parsed.data,
    inputs: [facade.id],
    step: 'ai_facade_review',
    setHead: false,
  });
  return c.json({ artifactId: written.id });
});

/** Tờ mặt đứng SVG. Cache ngắn, không `immutable`: tờ phụ thuộc cả mã bộ vẽ lẫn kb (xem `/plan/sheet`). */
facadeApp.get('/:projectId/sheet', async (c) => {
  const read = await readFacade(c);
  if (read instanceof Response) return read;
  try {
    const sheet = facadeSheet(read.concept);
    return new Response(sheet.svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        'X-Sheet-Scale': String(sheet.scale),
        'X-Sheet-Orientation': sheet.orientation,
      },
    });
  } catch (error) {
    if (error instanceof ElevationSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }
});

/** Mặt đứng dạng DXF — xuất MỘT CHIỀU (CLAUDE.md 8.6). */
facadeApp.get('/:projectId/dxf', async (c) => {
  const read = await readFacade(c);
  if (read instanceof Response) return read;
  const short = read.artifactId.replace(/^sha256:/, '').slice(0, 8);
  return new Response(facadeDxf(read.concept), {
    headers: {
      'Content-Type': 'application/dxf',
      'Content-Disposition': `attachment; filename="mat-dung-ai-${short}.dxf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
});

/**
 * ẢNH NEO mặt đứng — tuyến RIÊNG vì tờ trả về từ đây RỜI KHỎI HỆ THỐNG (ra nhà cung cấp mô hình ảnh ở
 * Đợt E), nên không mang khung tên — cùng luật với `/plan/:projectId/anchor` (T57).
 */
facadeApp.get('/:projectId/anchor', async (c) => {
  const read = await readFacade(c);
  if (read instanceof Response) return read;
  const anchor = facadeAnchor(read.concept);
  return new Response(anchor.svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'X-Anchor-Width': String(anchor.widthPx),
      'X-Anchor-Height': String(anchor.heightPx),
    },
  });
});

/**
 * Chọn một bản mặt đứng làm BẢN HIỆU LỰC (20/09/2026).
 *
 * Mỗi lượt chạy đúc một artifact mới và đặt luôn mốc, nên bản mới nhất mặc nhiên hiệu lực. Tuyến này
 * là đường quay lại: dựng xong bản thứ hai mà thấy bản đầu đẹp hơn thì chọn lại, không phải chạy lại
 * một lượt tính tiền để có thứ mình đã có.
 *
 * Mốc quyết định thứ đi tiếp: ảnh mặt đứng và bước Phối cảnh đọc `design_head`, không đọc «bản mới
 * nhất».
 */
facadeApp.post('/choose', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json()) as { projectId?: string; artifactId?: string };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bản mặt đứng nào.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  // `repo.get` tự kiểm artifact thuộc đúng hồ sơ: mã băm là danh tính toàn cục, và mã này đến từ
  // trình duyệt.
  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_facade_concept') {
    return c.json({ error: 'Không tìm thấy bản mặt đứng này trong hồ sơ.' }, 404);
  }
  await repo.setHead(
    {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId: body.projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    'ai_facade_concept',
    artifact.id,
  );
  return c.json({ artifactId: artifact.id });
});

/**
 * «Xoá» một bản mặt đứng khỏi dải chọn — THÔI HIỆN, không xoá dữ liệu.
 *
 * Cùng khuôn với `/ai/plan/hide`: artifact bất biến và có lineage (CLAUDE.md 8.2 nguyên tắc 3), nên
 * tờ vẽ đã tải, ảnh dựng từ nó và nhật ký chi phí vẫn đọc được. Bỏ dòng đánh dấu thì bản ấy trở lại.
 *
 * Bản ĐANG HIỆU LỰC thì gỡ luôn mốc: để lại một mốc trỏ vào thứ màn hình không còn hiện là cách chắc
 * chắn nhất làm bước Phối cảnh đọc nhầm mặt đứng.
 */
facadeApp.post('/hide', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json()) as {
    projectId?: string;
    artifactId?: string;
    hidden?: boolean;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bản mặt đứng nào.' }, 400);
  const hidden = body.hidden !== false;

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_facade_concept') {
    return c.json({ error: 'Không tìm thấy bản mặt đứng này trong hồ sơ.' }, 404);
  }

  if (!hidden) {
    const { error } = await db
      .from('design_artifact_hidden')
      .delete()
      .eq('artifact_id', artifact.id);
    if (error) return c.json({ error: 'Không đưa lại được bản mặt đứng vào danh sách.' }, 500);
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
  if (error) return c.json({ error: 'Không xoá được bản mặt đứng khỏi danh sách.' }, 500);

  await repo.clearHead(body.projectId, DISCIPLINE, 'ai_facade_concept', artifact.id);
  return c.json({ artifactId: artifact.id, hidden: true });
});

/**
 * Khởi động lượt «ý tưởng mặt đứng» — một ý tưởng, chạy nền qua Workflow.
 *
 * Mọi điều kiện tốn-tiền-được kiểm TRƯỚC khi mở instance: có khoá, tuyến bấm được, có đầu bài, ĐÃ CHỌN
 * một phương án mặt bằng, không có lượt mặt đứng nào đang chạy.
 */
facadeApp.post('/runs', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json()) as {
    projectId?: string;
    route?: string;
    reasoningEffort?: string;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
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

  if (!isSelectableRoute(aiModelCatalogue(modelRouter(c.env)), 'text', body.route)) {
    return c.json(
      { error: 'Model đã chọn không dùng được lúc này. Chọn model khác trong danh sách đang bật.' },
      409,
    );
  }
  if (!textClientFor(c.env, body.route)) {
    return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);
  }

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, DISCIPLINE, 'design_brief');
  if (!brief) {
    return c.json({ error: 'Chưa có đầu bài đã xác nhận. Xác nhận đầu bài trước.' }, 409);
  }
  // Mặt đứng dựng theo phương án ĐÃ CHỌN — đọc dưới phiên người bấm, bỏ mốc trỏ vào phương án đã ẩn.
  const planRef = await planHeadOf(db, body.projectId);
  if (!planRef) {
    return c.json({ error: 'Cần chọn một phương án mặt bằng trước khi dựng mặt đứng.' }, 409);
  }
  // Phiếu yêu cầu hiện hành (nếu kỹ sư đã lưu) — chốt mã ở đây, sửa phiếu giữa chừng không đổi lượt này.
  const facadeBrief = await repo.head(body.projectId, DISCIPLINE, 'ai_facade_brief');

  const running = await activeRun(repo.db, body.projectId, 'facade');
  if (running) {
    return c.json(
      {
        error: 'Đang có một lượt dựng mặt đứng chạy dở. Chờ lượt đó xong rồi chạy lại.',
        runId: running.id,
      },
      409,
    );
  }

  // Đầu bài đã lược danh tính dựng ở ĐÂY, dưới phiên người bấm (Workflow chỉ có service_role).
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
  const run = await createRun(repo.db, runScope, { stage: 'facade', steps: facadeStepSpecs() });
  const params: AiDesignParams = {
    runId: run.id,
    ...runScope,
    stage: 'facade',
    textRoute: body.route,
    reasoningEffort: effort,
    briefRef: brief.id,
    digest,
    rulePacks: { standards: false, experience: false },
    variants: [],
    planRef,
    facadeBriefRef: facadeBrief?.id ?? null,
  };
  try {
    const instanceId = instanceIdOf(await c.env.AI_DESIGN_PIPELINE.create({ params }));
    await attachWorkflow(repo.db, run.id, instanceId);
  } catch (error) {
    await finishRun(repo.db, run.id, {
      status: 'failed',
      error: 'Không mở được luồng chạy nền. Thử lại sau.',
    });
    throw error;
  }
  return c.json({ runId: run.id, planRef }, 202);
});

/** Trần ảnh neo sau khi giải mã — cùng mức với ảnh neo mặt bằng (`routes.ts`). */
const MAX_ANCHOR_BYTES = 4 * 1024 * 1024;
const MAX_ANCHOR_B64 = Math.ceil(MAX_ANCHOR_BYTES / 3) * 4;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vẽ ảnh mặt đứng CÓ VẬT LIỆU bằng mô hình ảnh, từ ảnh neo (T59 Đợt E).
 *
 * Cùng hàng rào với `POST /plan/:projectId/sheet-image` (T57), đọc chú thích ở đó:
 *  · đòi quyền GHI — lượt này tiêu tiền thật;
 *  · CHỈ nhận PNG, trần kích thước, và máy chủ dựng LẠI ảnh neo rồi đối chiếu cỡ khung — bắt nhầm
 *    lẫn (ảnh của ý tưởng khác, tấm cũ trong bộ nhớ);
 *  · `dataClass` khai CỨNG bằng 2 tại chỗ gọi; ảnh neo không có khung tên;
 *  · lời gọi mang ĐÚNG MỘT ảnh neo (`facadeImageCallOptions`).
 */
facadeApp.post('/:projectId/image', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const body = (await c.req.json()) as {
    artifactId?: string;
    route?: string;
    anchorBase64?: string;
  };
  if (!body.artifactId) return c.json({ error: 'Thiếu mã ý tưởng mặt đứng.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
  const anchorBase64 = body.anchorBase64;
  if (!anchorBase64) return c.json({ error: 'Thiếu ảnh neo của tờ mặt đứng.' }, 400);
  if (anchorBase64.length > MAX_ANCHOR_B64) {
    return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi vẽ lại.' }, 413);
  }
  if (anchorMime(anchorBase64) !== 'image/png') {
    return c.json({ error: 'Ảnh neo phải là tệp PNG.' }, 400);
  }

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
  if (!artifact || artifact.kind !== 'ai_facade_concept') return c.json({ error: NOT_FOUND }, 404);
  const concept = artifact.payload as AiFacadeConcept;

  // Dựng LẠI ảnh neo ở máy chủ để đối chiếu cỡ khung với tệp trình duyệt gửi lên.
  let anchor: ReturnType<typeof facadeAnchor>;
  try {
    anchor = facadeAnchor(concept);
  } catch (error) {
    if (error instanceof ElevationSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }
  const anchorBytes = decodeBase64(anchorBase64);
  if (anchorBytes.length > MAX_ANCHOR_BYTES) {
    return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi vẽ lại.' }, 413);
  }
  const size = pngSize(anchorBytes);
  if (!size || size.width !== anchor.widthPx || size.height !== anchor.heightPx) {
    return c.json(
      {
        error: `Ảnh neo không khớp tờ mặt đứng này (cần ${anchor.widthPx}×${anchor.heightPx} điểm ảnh). Mở lại trang rồi vẽ lại.`,
      },
      400,
    );
  }

  const prompts = aiPrompts();
  const prompt = facadeImagePrompt(concept, facadeVocabulary(), prompts);
  const publicRoute = router.publicRoutes().find((r) => r.route === body.route);
  const callScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId,
    discipline: DISCIPLINE,
    actorId: scope.actorId,
  };
  const meta = {
    route: body.route,
    // `purpose` riêng: tiền ảnh mặt đứng phải tách được khỏi tiền ảnh mặt bằng và tiền bước chữ.
    purpose: 'facade_image',
    dataClass: AI_DIGEST_DATA_CLASS,
    promptVersion: prompts.version,
  };

  let image;
  try {
    image = await withAiCall(
      repo.db,
      callScope,
      meta,
      {
        provider: router.providerOf(body.route) ?? 'unknown',
        model: publicRoute?.model ?? 'unknown',
        pricing: publicRoute?.pricing,
      },
      () =>
        client.generateImage(
          body.route!,
          AI_DIGEST_DATA_CLASS,
          facadeImageCallOptions(prompt, { mimeType: 'image/png', dataBase64: anchorBase64 }),
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
  let uri: string;
  try {
    uri = await createRenderStore(c.env).put(
      await renderKey(projectId, 'facade-image', bytes, mime),
      bytes,
      mime,
    );
  } catch (error) {
    // Lượt gọi đã tính tiền: nói rõ ảnh có nhưng không cất được.
    if (error instanceof RenderStoreError) {
      return c.json({ error: `Đã vẽ được ảnh nhưng không lưu được: ${error.message}` }, 502);
    }
    throw error;
  }
  const drawnSize = mime === 'image/png' ? pngSize(bytes) : null;

  const written = await repo.write({
    scope: callScope,
    kind: 'ai_facade_image',
    payload: assembleFacadeImage({
      facadeRef: artifact.id,
      uri,
      mime,
      widthPx: drawnSize?.width ?? null,
      heightPx: drawnSize?.height ?? null,
      prompt: prompt.prompt,
      anchor: {
        sha256: await sha256Hex(anchorBytes),
        bytes: anchorBytes.length,
        mime: 'image/png',
      },
      route: body.route,
      provider: image.provider,
      model: image.model,
      promptVersion: prompts.version,
      latencyMs: image.latencyMs,
    }),
    inputs: [artifact.id],
    step: 'ai_facade_image_draw',
    // Không đưa băm ảnh neo vào `params`: mô hình ảnh không tất định, dùng lại là trả tấm cũ.
    params: { route: body.route, prompt_version: prompts.version },
    // Không đặt head: vẽ lại là chuyện bình thường, tấm mới nhất chọn lúc đọc theo lineage.
    setHead: false,
  });

  return c.json({
    imageArtifactId: written.id,
    mime,
    watermark: prompts.facadeImage.watermark,
    promptVersion: prompts.version,
    usage: usageSummary(
      meta,
      { ...image, imageCount: 1, status: 'ok' },
      publicRoute?.pricing,
      !router.freeProviders.includes(image.provider),
    ),
  });
});

/**
 * Ảnh MỚI NHẤT của một ý tưởng mặt đứng — byte CHƯA đóng dấu (trình duyệt in nhãn).
 *
 * `no-cache` + `ETag` tự so tay, cùng lý do đã đo ở `/plan/:projectId/sheet-image`: địa chỉ trỏ «tấm
 * mới nhất» — một con trỏ đổi được — nên cache theo thời gian sẽ hiện lại tấm cũ sau khi vừa trả tiền
 * cho tấm mới.
 */
facadeApp.get('/:projectId/image', async (c) => {
  const read = await readFacade(c);
  if (read instanceof Response) return read;
  const projectId = c.req.param('projectId') ?? '';
  const repo = new ArtifactRepository(c.env);
  let found: { id: string; payload: AiFacadeImage } | null = null;
  for (const target of await repo.edgeTargets(read.artifactId, 'ai_facade_image_draw')) {
    if (target.kind !== 'ai_facade_image') continue;
    const artifact = await repo.get(target.id, projectId);
    if (artifact) {
      found = { id: artifact.id, payload: artifact.payload as AiFacadeImage };
      break;
    }
  }
  if (!found) return c.json({ error: 'Ý tưởng mặt đứng này chưa có ảnh do AI vẽ.' }, 404);

  if ((c.req.header('If-None-Match') ?? '') === `"${found.id}"`) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-cache', ETag: `"${found.id}"` },
    });
  }
  let bytes;
  try {
    bytes = (await createRenderStore(c.env).get(found.payload.uri)).bytes;
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': found.payload.mime,
      'Cache-Control': 'private, no-cache',
      ETag: `"${found.id}"`,
    },
  });
});
