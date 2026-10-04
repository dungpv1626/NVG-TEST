/**
 * Tuyến bản vẽ KỸ SƯ tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4) — gắn ở `/design/ai/uploads`.
 *
 *  · `POST /:projectId`                — tải lên một bản (PNG đã chuẩn hoá ở trình duyệt). Không gọi AI.
 *  · `GET  /:projectId?drawing=`       — danh sách bản đã tải, mới nhất trước.
 *  · `GET  /:projectId/:uploadId/file` — chính tệp đã tải.
 *  · `POST /:projectId/:uploadId/image`— vẽ ảnh mặt bằng có nội thất / mặt đứng có vật liệu TỪ bản ấy.
 *  · `GET  /:projectId/:uploadId/image`— tấm mới nhất đã vẽ từ bản ấy.
 *
 * Ảnh vẽ ra dùng LẠI hai loại artifact của bản AI (`ai_plan_sheet_image`, `ai_facade_image`) với
 * `upload_ref` thay cho mã mặt bằng / ý tưởng, và cùng hai bước lineage — màn hình đọc ảnh một kiểu.
 *
 * Dữ liệu hạng 1 (T12): bản vẽ thật hay mang khung tên. Người tải lên phải xác nhận đã cắt, máy chủ
 * từ chối khi thiếu; lời dẫn vẫn dặn mô hình không chép chữ nào của khung tên.
 */

import { Hono } from 'hono';
import type {
  AiFacadeImage,
  AiPlanSheetImage,
  AiUploadedDrawing,
  DesignBrief,
} from '@nvg/shared/design';
import { facadeBriefFromBrief } from '@nvg/shared/design';
import { ArtifactRepository } from '../artifacts';
import {
  asUser,
  denyUnlessReadable,
  denyUnlessWritable,
  projectScope,
  PROJECT_NOT_VISIBLE,
} from '../auth-scope';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import type { DesignEnv } from '../env';
import { facadeVocabulary } from '../kb/facade-vocabulary-data';
import { imageClientFor, modelRouter } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { decodeBase64, encodeBase64 } from '../llm/image-bytes';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import { usageSummary, withAiCall } from './call-log';
import { facadeBriefOfArtifact } from './facade/brief';
import { assembleFacadeImage, facadeImageCallOptions } from './facade/image';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { aiPrompts } from './prompts-data';
import { anchorMime, assembleSheetImage, pngSize, sheetImageCallOptions } from './sheet-image';
import {
  assembleUploadedDrawing,
  checkUploadedPng,
  checkUploadRequest,
  MAX_UPLOAD_BYTES,
  uploadFacadePrompt,
  uploadPlanPrompt,
} from './upload';

export const uploadApp = new Hono<{ Bindings: DesignEnv }>();

const DISCIPLINE = 'kien_truc' as const;
const NOT_FOUND = 'Không tìm thấy bản vẽ đã tải lên này trong hồ sơ.';
const MAX_UPLOAD_B64 = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4;

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

/** Băm nội dung một mảng byte thành 64 ký tự hex. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bước lineage và loại artifact ảnh theo từng loại bản vẽ. */
const IMAGE_OF = {
  plan: { step: 'ai_plan_sheet', kind: 'ai_plan_sheet_image', purpose: 'plan_sheet_image' },
  facade: { step: 'ai_facade_image_draw', kind: 'ai_facade_image', purpose: 'facade_image' },
} as const;

uploadApp.post('/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const body = (await c.req.json()) as {
    drawing?: string;
    level?: number | null;
    note?: string | null;
    identityCleared?: boolean;
    imageBase64?: string;
  };
  const request = checkUploadRequest(body);
  if (!request.ok) return c.json({ error: request.error }, 400);
  const { drawing, level } = request;
  const imageBase64 = body.imageBase64;
  if (!imageBase64) return c.json({ error: 'Thiếu tệp bản vẽ.' }, 400);
  if (imageBase64.length > MAX_UPLOAD_B64) {
    return c.json({ error: 'Bản vẽ quá lớn sau khi chuẩn hoá (tối đa 6 MB).' }, 413);
  }
  if (anchorMime(imageBase64) !== 'image/png') {
    return c.json({ error: 'Bản vẽ phải được chuẩn hoá thành tệp PNG trước khi gửi.' }, 400);
  }
  const bytes = decodeBase64(imageBase64);
  const checked = checkUploadedPng(bytes);
  if (!checked.ok) return c.json({ error: checked.error }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  let uri: string;
  try {
    uri = await createRenderStore(c.env).put(
      await renderKey(projectId, 'upload', bytes, 'image/png'),
      bytes,
      'image/png',
    );
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }

  const written = await new ArtifactRepository(c.env).write({
    scope: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    kind: 'ai_uploaded_drawing',
    payload: assembleUploadedDrawing({
      drawing,
      level,
      uri,
      width: checked.width,
      height: checked.height,
      sha256: await sha256Hex(bytes),
      bytes: bytes.length,
      note: body.note ?? null,
    }),
    // Nhiều bản cho nhiều tầng và nhiều lần sửa — `design_head` chỉ giữ một dòng mỗi loại.
    setHead: false,
  });
  return c.json({ uploadId: written.id });
});

uploadApp.get('/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const drawing = c.req.query('drawing');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const rows = await repo.listKind(projectId, DISCIPLINE, 'ai_uploaded_drawing', 30);
  const items = [];
  for (const row of rows) {
    const artifact = await repo.get(row.id, projectId);
    if (!artifact) continue;
    const payload = artifact.payload as AiUploadedDrawing;
    if (drawing && payload.drawing !== drawing) continue;
    const image = (await repo.edgeTargets(row.id, IMAGE_OF[payload.drawing].step)).find(
      (t) => t.kind === IMAGE_OF[payload.drawing].kind,
    );
    items.push({
      uploadId: row.id,
      createdAt: row.createdAt,
      drawing: payload.drawing,
      level: payload.level,
      note: payload.note ?? null,
      width: payload.width,
      height: payload.height,
      imageArtifactId: image?.id ?? null,
    });
  }
  return c.json({ items });
});

/** Đọc một bản đã tải sau khi hỏi quyền. `Response` = phải dừng. */
async function readUpload(
  c: { env: DesignEnv; req: { header(name: string): string | undefined } },
  projectId: string,
  uploadId: string,
  write: boolean,
) {
  const token = bearer(c.req.header('Authorization'));
  if (!token)
    return { ok: false as const, stop: { error: 'Chưa đăng nhập.', status: 401 as const } };
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope)
    return { ok: false as const, stop: { error: PROJECT_NOT_VISIBLE, status: 404 as const } };
  const denied = write
    ? await denyUnlessWritable(db, scope.tenantId, projectId)
    : await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return { ok: false as const, stop: { error: denied.error, status: denied.status } };
  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(uploadId, projectId);
  if (!artifact || artifact.kind !== 'ai_uploaded_drawing') {
    return { ok: false as const, stop: { error: NOT_FOUND, status: 404 as const } };
  }
  return {
    ok: true as const,
    scope,
    repo,
    upload: { id: artifact.id, payload: artifact.payload as AiUploadedDrawing },
  };
}

uploadApp.get('/:projectId/:uploadId/file', async (c) => {
  const read = await readUpload(c, c.req.param('projectId'), c.req.param('uploadId'), false);
  if (!read.ok) return c.json({ error: read.stop.error }, read.stop.status);
  try {
    const image = await createRenderStore(c.env).get(read.upload.payload.uri);
    // Mã artifact là băm nội dung — tệp dưới địa chỉ này không bao giờ đổi.
    return new Response(image.bytes as unknown as BodyInit, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400' },
    });
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
});

/**
 * Vẽ ảnh TỪ bản kỹ sư. Đòi quyền GHI: lượt này tiêu tiền thật.
 *
 * Ảnh neo là chính tệp đã lưu — máy chủ tự đọc từ kho, không nhận lại byte từ trình duyệt, nên khác
 * hai tuyến ảnh của bản AI, ở đây máy chủ BIẾT chắc mô hình nhận đúng tấm nào (`anchor.sha256`).
 */
uploadApp.post('/:projectId/:uploadId/image', async (c) => {
  const projectId = c.req.param('projectId');
  const body = (await c.req.json()) as { route?: string };
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
  const read = await readUpload(c, projectId, c.req.param('uploadId'), true);
  if (!read.ok) return c.json({ error: read.stop.error }, read.stop.status);
  const { scope, repo, upload } = read;

  const router = modelRouter(c.env);
  if (!isSelectableRoute(aiModelCatalogue(router), 'image', body.route, AI_DIGEST_DATA_CLASS)) {
    return c.json(
      { error: 'Model vẽ ảnh đã chọn không dùng được lúc này. Chọn model khác trong danh sách.' },
      409,
    );
  }
  const client = imageClientFor(c.env, body.route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  // Đầu bài đã xác nhận: phong cách (mặt bằng) và phần Mặt đứng (mặt đứng). Chưa có thì vẫn vẽ —
  // phong cách và vật liệu chỉ là mệnh đề dẫn hướng, bản vẽ mới là thứ quyết định.
  const briefHead = await repo.head(projectId, DISCIPLINE, 'design_brief');
  const brief = briefHead ? (briefHead.payload as DesignBrief) : null;
  const prompts = aiPrompts();
  const kind = upload.payload.drawing;
  const prompt =
    kind === 'plan'
      ? uploadPlanPrompt({
          level: upload.payload.level ?? 1,
          styleCode: brief?.style ?? null,
          prompts,
        })
      : uploadFacadePrompt({
          facadeBrief: brief
            ? (facadeBriefOfArtifact({ kind: 'design_brief', payload: brief }) ??
              facadeBriefFromBrief(undefined, brief.style))
            : null,
          vocab: facadeVocabulary(),
          prompts,
        });

  const store = createRenderStore(c.env);
  let source;
  try {
    source = await store.get(upload.payload.uri);
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
  const anchorBytes = new Uint8Array(source.bytes);
  const anchor = { mimeType: 'image/png', dataBase64: encodeBase64(anchorBytes) };

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
    // Cùng `purpose` với ảnh vẽ từ bản AI: tiền ảnh mặt bằng là tiền ảnh mặt bằng, nguồn nào cũng vậy.
    purpose: IMAGE_OF[kind].purpose,
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
          kind === 'plan'
            ? sheetImageCallOptions(prompt, anchor)
            : facadeImageCallOptions(prompt, anchor),
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
    uri = await store.put(
      await renderKey(projectId, kind === 'plan' ? 'plan-sheet' : 'facade-image', bytes, mime),
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
  const common = {
    uploadRef: upload.id,
    uri,
    mime,
    widthPx: drawnSize?.width ?? null,
    heightPx: drawnSize?.height ?? null,
    prompt: prompt.prompt,
    anchor: { sha256: upload.payload.sha256, bytes: anchorBytes.length, mime: 'image/png' },
    route: body.route,
    provider: image.provider,
    model: image.model,
    promptVersion: prompts.version,
    latencyMs: image.latencyMs,
  };
  const written =
    kind === 'plan'
      ? await repo.write({
          scope: callScope,
          kind: 'ai_plan_sheet_image',
          payload: assembleSheetImage({
            ...common,
            planRef: null,
            level: upload.payload.level ?? 1,
            styleCode: brief?.style ?? null,
          }),
          inputs: [upload.id],
          step: 'ai_plan_sheet',
          params: { route: body.route, prompt_version: prompts.version },
          setHead: false,
        })
      : await repo.write({
          scope: callScope,
          kind: 'ai_facade_image',
          payload: assembleFacadeImage({ ...common, facadeRef: null }),
          inputs: [upload.id],
          step: 'ai_facade_image_draw',
          params: { route: body.route, prompt_version: prompts.version },
          setHead: false,
        });

  return c.json({
    imageArtifactId: written.id,
    mime,
    watermark: kind === 'plan' ? prompts.sheetImage.watermark : prompts.facadeImage.watermark,
    promptVersion: prompts.version,
    usage: usageSummary(
      meta,
      { ...image, imageCount: 1, status: 'ok' },
      publicRoute?.pricing,
      !router.freeProviders.includes(image.provider),
    ),
  });
});

/** Tấm MỚI NHẤT vẽ từ một bản đã tải. `no-cache` + `ETag` tự so, cùng lý do tuyến ảnh của bản AI. */
uploadApp.get('/:projectId/:uploadId/image', async (c) => {
  const projectId = c.req.param('projectId');
  const read = await readUpload(c, projectId, c.req.param('uploadId'), false);
  if (!read.ok) return c.json({ error: read.stop.error }, read.stop.status);
  const { repo, upload } = read;
  const kind = upload.payload.drawing;
  const target = (await repo.edgeTargets(upload.id, IMAGE_OF[kind].step)).find(
    (t) => t.kind === IMAGE_OF[kind].kind,
  );
  if (!target) return c.json({ error: 'Bản vẽ này chưa có ảnh do AI vẽ.' }, 404);
  if ((c.req.header('If-None-Match') ?? '') === `"${target.id}"`) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-cache', ETag: `"${target.id}"` },
    });
  }
  const artifact = await repo.get(target.id, projectId);
  if (!artifact) return c.json({ error: 'Bản vẽ này chưa có ảnh do AI vẽ.' }, 404);
  const payload = artifact.payload as AiPlanSheetImage | AiFacadeImage;
  try {
    const image = await createRenderStore(c.env).get(payload.uri);
    return new Response(image.bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': payload.mime,
        'Cache-Control': 'private, no-cache',
        ETag: `"${target.id}"`,
      },
    });
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
});
