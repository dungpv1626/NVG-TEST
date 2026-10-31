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
 * «Bảng vật liệu chung» (9.18.0, «Cách 3»): hồ sơ có ý tưởng mặt đứng hiện hành của ĐÚNG đầu bài đang xác nhận thì lời
 * dẫn mang màu / vật liệu của nó; tuyến nhận ảnh vào (`ModelRouter.acceptsInputImages`) thì kèm MỘT ảnh mặt ngoài làm
 * mẫu (góc phối cảnh theo `room_image.shared_palette.reference_views`, không có thì ảnh mặt đứng). Artifact ghi lại
 * mặt đứng và ảnh mẫu đã dùng (`shared_palette`), lineage thêm hai cạnh ấy.
 * `AI_FAKE=1` hoặc `AI_FAKE=room_image` trong `.dev.vars` → client giả trả một tấm PNG mẫu, không tốn tiền.
 *
 *  · `GET /:projectId` — phòng vẽ được của đầu bài + các tấm đã vẽ (mới nhất trước).
 *  · `POST /:projectId` — vẽ một tấm cho MỘT phòng.
 *  · `GET /:projectId/image/:imageId` — byte của một tấm.
 */

import { Hono } from 'hono';
import type {
  AiFacadeConcept,
  AiFacadeImage,
  AiImageSet,
  AiRoomImage,
  DesignBrief,
} from '@nvg/shared/design';
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
import { facadeVocabulary } from '../kb/facade-vocabulary-data';
import { aiFakeOn, fakeImageClient, FAKE_PROVIDER } from '../llm/fake-image';
import { imageClientFor, modelRouter } from '../llm/factory';
import { LlmCallFailed } from '../llm/gemini';
import { decodeBase64, encodeBase64 } from '../llm/image-bytes';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import { usageSummary, withAiCall } from './call-log';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { aiPrompts } from './prompts-data';
import {
  assembleRoomImage,
  briefRooms,
  deriveSharedPalette,
  roomImageCallOptions,
  roomImagePrompt,
  sharedPaletteText,
  type BriefRoom,
  type PaletteReference,
  type SharedPalette,
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

/**
 * Bậc lineage tối đa khi hỏi «mặt đứng này có dựng từ đầu bài đang xác nhận không». Mặt đứng từ đầu bài là con trực
 * tiếp; mặt đứng từ mặt bằng đi qua mặt bằng → chương trình không gian → … → đầu bài. Chặn để một chuỗi lạ không thành
 * vòng đọc CSDL dài; quá bậc thì coi như KHÔNG thuộc (thiếu bảng chung, không dùng nhầm mặt đứng cũ).
 */
const LINEAGE_DEPTH_MAX = 6;

async function descendsFrom(repo: ArtifactRepository, id: string, ancestor: string) {
  let frontier = [id];
  const seen = new Set(frontier);
  for (let depth = 0; depth < LINEAGE_DEPTH_MAX && frontier.length; depth += 1) {
    const parents = (await Promise.all(frontier.map((x) => repo.lineage(x)))).flat();
    if (parents.some((edge) => edge.fromId === ancestor)) return true;
    frontier = parents.map((edge) => edge.fromId).filter((x) => !seen.has(x));
    for (const x of frontier) seen.add(x);
  }
  return false;
}

interface PaletteContext {
  palette: SharedPalette;
  /** Ảnh mặt ngoài có thể gửi kèm — chưa tải byte. */
  reference: Omit<PaletteReference, 'image'> & { mime: string };
}

/**
 * Ý tưởng mặt đứng hiện hành của ĐÚNG đầu bài đang xác nhận → bảng vật liệu chung + ảnh mẫu có thể kèm. Ưu tiên mặt
 * đứng mà bộ phối cảnh hiện hành đã dựng theo (ảnh khách thấy là một nhà); không có thì mặt đứng hiện hành. Không có
 * mặt đứng nào của đầu bài này → `null` (lời dẫn như trước).
 */
async function paletteContext(
  repo: ArtifactRepository,
  projectId: string,
  briefId: string,
): Promise<{ palette: SharedPalette; reference: PaletteContext['reference'] | null } | null> {
  const [setHead, facadeHead] = await Promise.all([
    repo.head(projectId, DISCIPLINE, 'ai_image_set'),
    repo.head(projectId, DISCIPLINE, 'ai_facade_concept'),
  ]);
  const set = setHead ? { id: setHead.id, payload: setHead.payload as AiImageSet } : null;
  const candidates: string[] = [
    ...(set?.payload.facade_ref ? [set.payload.facade_ref] : []),
    ...(facadeHead ? [facadeHead.id] : []),
  ];
  let facade: { id: string; concept: AiFacadeConcept } | null = null;
  for (const id of [...new Set(candidates)]) {
    if (!(await descendsFrom(repo, id, briefId))) continue;
    const artifact =
      facadeHead && facadeHead.id === id
        ? { kind: 'ai_facade_concept' as const, payload: facadeHead.payload }
        : await repo.get(id, projectId);
    if (!artifact || artifact.kind !== 'ai_facade_concept') continue;
    facade = { id, concept: artifact.payload as AiFacadeConcept };
    break;
  }
  if (!facade) return null;

  const prompts = aiPrompts();
  const palette = deriveSharedPalette({
    facadeRef: facade.id,
    concept: facade.concept,
    vocabulary: facadeVocabulary(),
    prompts,
  });

  let reference: PaletteContext['reference'] | null = null;
  if (set && set.payload.facade_ref === facade.id) {
    for (const view of prompts.roomImage.sharedPalette.referenceViews) {
      const image = set.payload.images.find((img) => img.view === view);
      if (image) {
        reference = {
          artifactRef: set.id,
          kind: 'ai_image_set',
          view,
          uri: image.uri,
          mime: image.mime,
        };
        break;
      }
    }
  }
  if (!reference) {
    for (const target of await repo.edgeTargets(facade.id, 'ai_facade_image_draw')) {
      if (target.kind !== 'ai_facade_image') continue;
      const artifact = await repo.get(target.id, projectId);
      if (!artifact) continue;
      const payload = artifact.payload as AiFacadeImage;
      reference = {
        artifactRef: artifact.id,
        kind: 'ai_facade_image',
        view: null,
        uri: payload.uri,
        mime: payload.mime,
      };
      break;
    }
  }
  return { palette, reference };
}

/** Bảng chung cho màn hình: nhãn tiếng Việt từ `kb/facade_vocabulary.yaml` và `room_image.shared_palette`. */
function paletteForScreen(context: Awaited<ReturnType<typeof paletteContext>>) {
  if (!context) return null;
  const { palette, reference } = context;
  if (palette.colours.length === 0 && palette.materials.length === 0) return null;
  const vocabulary = facadeVocabulary();
  const prompts = aiPrompts();
  return {
    facadeArtifactId: palette.facadeRef,
    colours: palette.colours.map((c) => ({
      role: c.role,
      roleLabel: prompts.roomImage.sharedPalette.colourRoles[c.role].labelVi,
      label: c.colour ? (vocabulary.colours[c.colour]?.label_vi ?? null) : null,
      hex: c.hex,
    })),
    materials: palette.materials.map(
      (m) =>
        vocabulary.materials[m.code]?.label_vi ??
        vocabulary.roofMaterials[m.code]?.label_vi ??
        m.code,
    ),
    reference: reference
      ? {
          kind: reference.kind,
          viewLabel: reference.view
            ? (prompts.perspective.views[reference.view]?.labelVi ?? null)
            : null,
        }
      : null,
  };
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
    return c.json({
      briefArtifactId: null,
      rooms: [],
      images: [],
      simulated: false,
      sharedPalette: null,
      referenceRoutes: [],
    });
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
    sharedPalette: paletteForScreen(await paletteContext(repo, projectId, context.brief.id)),
    // Tuyến nào kèm được ảnh mẫu — màn hình nói rõ model đang chọn có kèm hay chỉ gửi chữ.
    referenceRoutes: modelRouter(c.env)
      .publicRoutes()
      .filter((r) => modelRouter(c.env).acceptsInputImages(r.route))
      .map((r) => r.route),
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
  const shared = await paletteContext(repo, projectId, context.brief.id);
  // Ảnh mẫu chỉ khi tuyến nhận ảnh vào; tải hỏng thì gửi chữ — ảnh mẫu là phụ, không chặn lượt vẽ.
  let reference: PaletteReference | null = null;
  if (shared?.reference && router.acceptsInputImages(route)) {
    try {
      const stored = await createRenderStore(c.env).get(shared.reference.uri);
      const { mime, ...rest } = shared.reference;
      reference = {
        ...rest,
        image: { mimeType: mime, dataBase64: encodeBase64(new Uint8Array(stored.bytes)) },
      };
    } catch (error) {
      if (!(error instanceof RenderStoreError)) throw error;
    }
  }
  const palette = shared?.palette ?? null;
  const prompt = roomImagePrompt({
    digest: context.digest,
    room,
    prompts,
    styleCode,
    paletteText: sharedPaletteText({
      palette,
      vocabulary: facadeVocabulary(),
      prompts,
      withReference: reference !== null,
    }),
  });
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
      () =>
        client.generateImage(route, AI_DIGEST_DATA_CLASS, roomImageCallOptions(prompt, reference)),
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
      palette,
      reference,
    }),
    // Lineage nói được tấm này theo mặt đứng nào và ảnh mẫu nào.
    inputs: [
      ...new Set([
        context.brief.id,
        ...(palette ? [palette.facadeRef] : []),
        ...(reference ? [reference.artifactRef] : []),
      ]),
    ],
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
    sharedPalette: palette !== null,
    referenceAttached: reference !== null,
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
