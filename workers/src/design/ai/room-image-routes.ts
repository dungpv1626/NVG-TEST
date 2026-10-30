/**
 * Tuyến ẢNH NỘI THẤT TỪNG PHÒNG vẽ thẳng từ đầu bài (B3b «bộ ý tưởng cho khách», anh Dũng 30/10/2026) — gắn
 * vào `aiApp` dưới `/room-image`.
 *
 * Cùng hàng rào với ảnh mặt bằng có nội thất (`POST /plan/:projectId/sheet-image`, T57) và ảnh mặt đứng:
 *  · mọi tuyến tự hỏi quyền bộ môn trước khi đọc bằng `ArtifactRepository` (service_role, vượt RLS);
 *    tuyến vẽ (tốn tiền) đòi quyền GHI;
 *  · `dataClass` khai CỨNG bằng 2; đầu bài đã lược danh tính dựng dưới phiên người bấm;
 *  · mỗi lượt gọi — thành hay hỏng, thật hay giả lập — ghi một dòng `design_ai_call` (`purpose: room_image`);
 *  · ảnh hiện NGUYÊN BẢN, không in dấu (T154).
 *
 * Không có ảnh neo (chưa có mặt bằng), nên đây là lời gọi CHỮ → ẢNH: tuyến chỉ một-ảnh-vào (Pollinations) bị từ chối.
 * `AI_FAKE=1` hoặc `AI_FAKE=room_image` trong `.dev.vars` → client giả trả một tấm PNG mẫu, không tốn tiền.
 *
 *  · `GET /:projectId` — phòng vẽ được của đầu bài + các tấm đã vẽ (mới nhất trước).
 *  · `POST /:projectId` — vẽ một tấm cho MỘT phòng.
 *  · `GET /:projectId/image/:imageId` — byte của một tấm.
 */

import { Hono } from 'hono';
import type { AiRoomImage, DesignBrief } from '@nvg/shared/design';
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
import type { DesignEnv } from '../env';
import { aiFakeOn, fakeImageClient, FAKE_PROVIDER } from '../llm/fake-image';
import { imageClientFor, modelRouter } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { decodeBase64 } from '../llm/image-bytes';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import { usageSummary, withAiCall } from './call-log';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { aiPrompts } from './prompts-data';
import {
  assembleRoomImage,
  briefRooms,
  roomImageCallOptions,
  roomImagePrompt,
  type BriefRoom,
} from './room-image';
import { pngSize } from './sheet-image';

export const roomImageApp = new Hono<{ Bindings: DesignEnv }>();

const DISCIPLINE = 'kien_truc' as const;
const PURPOSE = 'room_image';
/** Tên chức năng trong `AI_FAKE`. */
const FAKE_NAME = 'room_image';
/** Số tấm đọc lại tối đa cho bộ sưu tập — mỗi tấm là một lượt đọc kho. */
const GALLERY_MAX = 24;

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

/** Đầu bài đã xác nhận + bản lược danh tính + danh sách phòng vẽ được, dưới phiên người gọi. */
async function briefContext(
  db: Awaited<ReturnType<typeof asUser>>,
  repo: ArtifactRepository,
  projectId: string,
) {
  const brief = await repo.head(projectId, DISCIPLINE, 'design_brief');
  if (!brief) return null;
  const digest = anonymiseForAi(await aiDigestInputs(db, projectId, brief.payload as DesignBrief));
  return { brief, digest, rooms: briefRooms(digest, aiPrompts()) };
}

roomImageApp.get('/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const context = await briefContext(db, repo, projectId);
  if (!context) {
    return c.json({ briefArtifactId: null, rooms: [], images: [], simulated: false });
  }
  const labels = roomLabels();
  const images: Array<{
    artifactId: string;
    createdAt: string;
    roomKey: string;
    roomType: string;
    route: string;
    provider: string;
  }> = [];
  // Mới nhất trước. Tấm vẽ theo đầu bài CŨ không hiện: khoá phòng gắn với thứ tự của đúng bản đầu bài ấy.
  for (const target of (await repo.edgeTargets(context.brief.id, 'ai_room_image_draw')).slice(
    0,
    GALLERY_MAX,
  )) {
    if (target.kind !== 'ai_room_image') continue;
    const artifact = await repo.get(target.id, projectId);
    if (!artifact) continue;
    const payload = artifact.payload as AiRoomImage;
    images.push({
      artifactId: artifact.id,
      createdAt: artifact.createdAt,
      roomKey: payload.room.key,
      roomType: payload.room.type,
      route: payload.generator.route,
      provider: payload.generator.provider,
    });
  }
  return c.json({
    briefArtifactId: context.brief.id,
    rooms: context.rooms.map((room) => ({ ...room, label: labels[room.type] ?? room.type })),
    images,
    // Màn hình nói rõ lượt vẽ đang giả lập — không để người bấm tưởng đã trả tiền cho một tấm mẫu.
    simulated: aiFakeOn(c.env, FAKE_NAME),
  });
});

roomImageApp.post('/:projectId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const body = (await c.req.json()) as { roomKey?: string; route?: string };
  if (!body.roomKey) return c.json({ error: 'Chưa chọn phòng cần vẽ.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
  const route = body.route;

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const fake = aiFakeOn(c.env, FAKE_NAME);
  const router = modelRouter(c.env);
  const catalogue = aiModelCatalogue(router);
  // Giả lập vẫn đòi TÊN tuyến có thật trong danh mục ảnh — chỉ bỏ điều kiện có khoá.
  const known = fake
    ? catalogue.image.some((o) => o.route === route && AI_DIGEST_DATA_CLASS >= o.maxDataClass)
    : isSelectableRoute(catalogue, 'image', route, AI_DIGEST_DATA_CLASS);
  if (!known) {
    return c.json(
      { error: 'Model vẽ ảnh đã chọn không dùng được lúc này. Chọn model khác trong danh sách.' },
      409,
    );
  }
  if (!fake && router.providerOf(route) === 'pollinations') {
    return c.json(
      {
        error:
          'Model này chỉ vẽ lại từ một ảnh có sẵn, mà ảnh phòng vẽ từ đầu bài không có ảnh vào. Chọn model OpenAI hoặc Gemini.',
      },
      409,
    );
  }
  const client = fake ? fakeImageClient() : imageClientFor(c.env, route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  const repo = new ArtifactRepository(c.env);
  const context = await briefContext(db, repo, projectId);
  if (!context) {
    return c.json({ error: 'Chưa có đầu bài đã xác nhận. Xác nhận đầu bài trước.' }, 409);
  }
  const room: BriefRoom | undefined = context.rooms.find((r) => r.key === body.roomKey);
  if (!room) {
    return c.json(
      { error: 'Phòng này không còn trong đầu bài đã xác nhận. Tải lại trang rồi chọn lại.' },
      409,
    );
  }

  const prompts = aiPrompts();
  const styleCode = context.digest.style ?? null;
  const prompt = roomImagePrompt({ digest: context.digest, room, prompts, styleCode });
  const publicRoute = router.publicRoutes().find((r) => r.route === route);
  const callScope = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId,
    discipline: DISCIPLINE,
    actorId: scope.actorId,
  };
  const meta = {
    route,
    // `purpose` riêng: tiền ảnh phòng tách được khỏi ảnh mặt bằng, ảnh mặt đứng và bước chữ — và là chỗ
    // màn hình lấy trung bình tiền thật để báo giá ước tính trên nút.
    purpose: PURPOSE,
    dataClass: AI_DIGEST_DATA_CLASS,
    promptVersion: prompts.version,
  };
  // Giả lập: không giá (tiền rỗng, không phải 0 đồng giả) để không lẫn vào trung bình tiền thật.
  const pricing = fake ? undefined : publicRoute?.pricing;

  let image;
  try {
    image = await withAiCall(
      repo.db,
      callScope,
      meta,
      {
        provider: fake ? FAKE_PROVIDER : (router.providerOf(route) ?? 'unknown'),
        model: publicRoute?.model ?? 'unknown',
        pricing,
      },
      () => client.generateImage(route, AI_DIGEST_DATA_CLASS, roomImageCallOptions(prompt)),
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
      await renderKey(projectId, 'room-image', bytes, mime),
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
    kind: 'ai_room_image',
    payload: assembleRoomImage({
      briefRef: context.brief.id,
      room,
      styleCode,
      uri,
      mime,
      widthPx: drawnSize?.width ?? null,
      heightPx: drawnSize?.height ?? null,
      prompt: prompt.prompt,
      route,
      provider: image.provider,
      model: image.model,
      promptVersion: prompts.version,
      latencyMs: image.latencyMs,
    }),
    inputs: [context.brief.id],
    step: 'ai_room_image_draw',
    // Không đưa phòng vào `params` để dùng lại: mô hình ảnh không tất định, bấm lại là muốn tấm MỚI.
    params: { route, prompt_version: prompts.version, room: room.key },
    // Không đặt head: nhiều phòng, mỗi phòng vẽ lại nhiều lần — bộ sưu tập chọn lúc đọc theo lineage.
    setHead: false,
  });

  return c.json({
    imageArtifactId: written.id,
    roomKey: room.key,
    mime,
    simulated: fake,
    promptVersion: prompts.version,
    usage: usageSummary(
      meta,
      { ...image, imageCount: 1, status: 'ok' },
      pricing,
      !fake && !router.freeProviders.includes(image.provider),
    ),
  });
});

/** Byte của một tấm. `no-cache` + `ETag` = mã artifact (bất biến), cùng cách các tuyến ảnh khác. */
roomImageApp.get('/:projectId/image/:imageId', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const imageId = c.req.param('imageId');
  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const etag = `"${imageId}"`;
  if ((c.req.header('If-None-Match') ?? '') === etag) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-cache', ETag: etag },
    });
  }
  const repo = new ArtifactRepository(c.env);
  const artifact = await repo.get(imageId, projectId);
  if (!artifact || artifact.kind !== 'ai_room_image') {
    return c.json({ error: 'Không tìm thấy ảnh phòng này trong hồ sơ.' }, 404);
  }
  const payload = artifact.payload as AiRoomImage;
  let bytes;
  try {
    bytes = (await createRenderStore(c.env).get(payload.uri)).bytes;
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
  return new Response(bytes as unknown as BodyInit, {
    headers: { 'Content-Type': payload.mime, 'Cache-Control': 'private, no-cache', ETag: etag },
  });
});
