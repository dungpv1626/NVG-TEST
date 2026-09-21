/**
 * Tuyến của bước «3. Phối cảnh» (T67) — gắn vào `aiApp` dưới `/perspective`.
 *
 * Cùng hàng rào với hai bước trước: mọi tuyến tự hỏi quyền bộ môn trước khi đọc bằng
 * `ArtifactRepository` (service_role, vượt RLS); tuyến tốn tiền đòi quyền GHI.
 *
 *  · `POST /runs` — nhận tờ neo trình duyệt đã rasterise, đối chiếu cỡ khung, cất vào kho, rồi mở
 *    lượt chạy nền. Đây là chỗ DUY NHẤT byte không tin được đi vào hệ thống.
 *  · `GET /:projectId` — bộ ảnh dạng JSON, kèm nhãn tiếng Việt của từng góc.
 *  · `GET /:projectId/view/:view` — byte của một góc, CHƯA đóng dấu (trình duyệt in nhãn).
 */

import { Hono, type Context } from 'hono';
import type {
  AiFacadeConcept,
  AiFloorPlan,
  AiImageSet,
  AiImageSetView,
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
} from '../auth-scope';
import { AI_DIGEST_DATA_CLASS, anonymiseForAi } from '../brief/anonymise';
import type { DesignEnv } from '../env';
import { imageClientFor, modelRouter } from '../llm/factory';
import { decodeBase64 } from '../llm/image-bytes';
import { createRenderStore, renderKey, RenderStoreError } from '../render-store';
import type { AiDesignParams } from '../workflows/ai-design-steps';
import {
  drawViewStep,
  perspectiveStepSpecs,
  writeImageSetStep,
} from '../workflows/ai-perspective-steps';
import type { DrawnView } from './perspective/assemble';
import { facadeVocabulary } from '../kb/facade-vocabulary-data';
import { LlmCallFailed } from '../llm/gemini';
import { facadeAnchor } from './facade';
import { roofPlanAnchor } from './perspective';
import { ElevationSheetError } from './draw/elevation-sheet';
import { PlanSheetError } from './draw/plan-sheet';
import { aiModelCatalogue, isSelectableRoute } from './models';
import { perspectivePlan, redrawAloneRefusal, type AnchorKind } from './perspective/views';
import { aiPrompts } from './prompts-data';
import { anchorMime, pngSize } from './sheet-image';
import { activeRun, attachWorkflow, createRun, finishRun } from './runs';

export const perspectiveApp = new Hono<{ Bindings: DesignEnv }>();

const DISCIPLINE = 'kien_truc' as const;
const NOT_FOUND = 'Không tìm thấy bộ ảnh phối cảnh này trong hồ sơ.';

/** Trần một tờ neo sau khi giải mã — cùng mức với ảnh neo mặt bằng và mặt đứng. */
const MAX_ANCHOR_BYTES = 4 * 1024 * 1024;
const MAX_ANCHOR_B64 = Math.ceil(MAX_ANCHOR_BYTES / 3) * 4;

type Ctx = Context<{ Bindings: DesignEnv }>;

function bearer(header: string | undefined): string | null {
  return header?.replace(/^Bearer\s+/i, '') || null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Khởi động lượt «bộ ảnh phối cảnh».
 *
 * Mọi điều kiện TỐN-TIỀN-ĐƯỢC kiểm trước khi mở instance: có khoá ảnh, tuyến bấm được ở hạng 2, có
 * đầu bài, có ý tưởng mặt đứng, tờ neo khớp tờ máy chủ dựng lại, và không có lượt phối cảnh nào
 * đang chạy.
 */
perspectiveApp.post('/runs', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json()) as {
    projectId?: string;
    artifactId?: string;
    route?: string;
    peopleAndVehicles?: boolean;
    anchors?: Array<{ kind?: string; base64?: string }>;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);
  if (!body.artifactId) return c.json({ error: 'Thiếu mã ý tưởng mặt đứng.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
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
  if (!isSelectableRoute(aiModelCatalogue(router), 'image', body.route, AI_DIGEST_DATA_CLASS)) {
    return c.json(
      { error: 'Model vẽ ảnh đã chọn không dùng được lúc này. Chọn model khác trong danh sách.' },
      409,
    );
  }
  if (!imageClientFor(c.env, body.route)) {
    return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);
  }

  const repo = new ArtifactRepository(c.env);
  const brief = await repo.head(body.projectId, DISCIPLINE, 'design_brief');
  if (!brief) {
    return c.json({ error: 'Chưa có đầu bài đã xác nhận. Xác nhận đầu bài trước.' }, 409);
  }
  const facade = await repo.get(body.artifactId, body.projectId);
  if (!facade || facade.kind !== 'ai_facade_concept') {
    return c.json({ error: 'Không tìm thấy ý tưởng mặt đứng này trong hồ sơ.' }, 404);
  }
  const concept = facade.payload as AiFacadeConcept;
  // Mặt bằng lấy từ CHÍNH ý tưởng mặt đứng, không đọc lại mốc hiệu lực: bộ ảnh phải nói về đúng
  // ngôi nhà mà tờ mặt đứng vẽ. Kỹ sư đổi phương án sau đó thì bước này đã bị chặn ở màn hình bằng
  // nhãn «dựng theo phương án cũ», và đọc mốc ở đây sẽ lặng lẽ trộn hai ngôi nhà.
  const planRef = concept.plan_ref;

  const running = await activeRun(repo.db, body.projectId, 'images');
  if (running) {
    return c.json(
      {
        error: 'Đang có một lượt dựng phối cảnh chạy dở. Chờ lượt đó xong rồi chạy lại.',
        runId: running.id,
      },
      409,
    );
  }

  const planArtifact = await repo.get(planRef, body.projectId);
  if (!planArtifact || planArtifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng mà mặt đứng dựng theo.' }, 404);
  }
  const stored = await storeAnchors(
    c,
    body.anchors ?? [],
    concept,
    planArtifact.payload as AiFloorPlan,
    brief.payload as DesignBrief,
    body.projectId,
  );
  if (stored instanceof Response) return stored;

  const prompts = aiPrompts();
  const plan = perspectivePlan(
    concept,
    stored.map((a) => a.kind),
  );

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
  const run = await createRun(repo.db, runScope, {
    stage: 'images',
    steps: perspectiveStepSpecs(
      plan.steps.map((s) => s.view),
      prompts,
    ),
  });
  const params: AiDesignParams = {
    runId: run.id,
    ...runScope,
    stage: 'images',
    // Lượt phối cảnh không gọi model chữ. Giữ trường vì nó là bắt buộc của `AiDesignParams`, và
    // đặt bằng chính tuyến ảnh để một dòng nhật ký lạc chỗ vẫn chỉ đúng về tuyến đã dùng.
    textRoute: body.route,
    imageRoute: body.route,
    briefRef: brief.id,
    digest,
    rulePacks: { standards: false, experience: false },
    variants: [],
    planRef,
    facadeRef: facade.id,
    peopleAndVehicles: body.peopleAndVehicles !== false,
    anchors: stored,
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
  return c.json(
    {
      runId: run.id,
      views: plan.steps.map((s) => s.view),
      skipped: plan.skipped,
    },
    202,
  );
});

/**
 * Nhận tờ neo trình duyệt gửi lên, đối chiếu với tờ máy chủ dựng lại, rồi cất vào kho.
 *
 * Ba phép chặn, đúng thứ tự tăng dần độ đắt: trần kích thước (rẻ), nhận diện PNG (rẻ), rồi dựng
 * lại tờ ở máy chủ và so cỡ khung (đắt nhất, nhưng là phép duy nhất bắt được «ảnh của ý tưởng
 * khác» và «tấm cũ còn trong bộ nhớ trình duyệt»).
 *
 * ⚠️ Tờ `roof_plan` của Đợt B chưa có bộ dựng ở máy chủ, nên hiện bị TỪ CHỐI thay vì nhận mà không
 * đối chiếu được. Nhận một tờ không kiểm được là bỏ đúng cái phép chặn quan trọng nhất.
 */
async function storeAnchors(
  c: Ctx,
  anchors: ReadonlyArray<{ kind?: string; base64?: string }>,
  concept: AiFacadeConcept,
  plan: AiFloorPlan,
  brief: DesignBrief | null,
  projectId: string,
): Promise<Array<{ kind: AnchorKind; uri: string; sha256: string; bytes: number }> | Response> {
  if (!anchors.length) return c.json({ error: 'Thiếu ảnh neo của tờ mặt đứng.' }, 400);
  const store = createRenderStore(c.env);
  const out: Array<{ kind: AnchorKind; uri: string; sha256: string; bytes: number }> = [];

  for (const anchor of anchors) {
    const kind = anchor.kind;
    if (kind !== 'elevation' && kind !== 'roof_plan') {
      return c.json({ error: `Loại ảnh neo "${kind}" chưa dùng được.` }, 400);
    }
    const base64 = anchor.base64;
    if (!base64) return c.json({ error: 'Thiếu ảnh neo của tờ mặt đứng.' }, 400);
    if (base64.length > MAX_ANCHOR_B64) {
      return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi chạy lại.' }, 413);
    }
    if (anchorMime(base64) !== 'image/png') {
      return c.json({ error: 'Ảnh neo phải là tệp PNG.' }, 400);
    }

    // Dựng LẠI ở máy chủ bằng ĐÚNG hàm đã phát tờ ấy ra — phép đối chiếu chỉ có nghĩa khi hai đầu
    // dùng chung một bộ vẽ.
    let built;
    try {
      built = kind === 'elevation' ? facadeAnchor(concept) : roofPlanAnchor(plan, concept, brief);
    } catch (error) {
      if (error instanceof ElevationSheetError || error instanceof PlanSheetError) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
    const bytes = decodeBase64(base64);
    if (bytes.length > MAX_ANCHOR_BYTES) {
      return c.json({ error: 'Ảnh neo quá lớn. Mở lại trang rồi chạy lại.' }, 413);
    }
    const size = pngSize(bytes);
    if (!size || size.width !== built.widthPx || size.height !== built.heightPx) {
      const what = kind === 'elevation' ? 'tờ mặt đứng' : 'tờ mặt bằng mái';
      return c.json(
        {
          error: `Ảnh neo không khớp ${what} của hồ sơ này (cần ${built.widthPx}×${built.heightPx} điểm ảnh). Mở lại trang rồi chạy lại.`,
        },
        400,
      );
    }

    try {
      const uri = await store.put(
        await renderKey(projectId, 'perspective-anchor', bytes, 'image/png'),
        bytes,
        'image/png',
      );
      out.push({
        kind,
        uri,
        sha256: await sha256Hex(bytes),
        bytes: bytes.length,
      });
    } catch (error) {
      if (error instanceof RenderStoreError) {
        return c.json({ error: `Không cất được ảnh neo: ${error.message}` }, 502);
      }
      throw error;
    }
  }
  return out;
}

/**
 * Tờ MẶT BẰNG MÁI dạng SVG — dựng LÚC ĐỌC, không lưu, cùng lý do với tờ mặt đứng.
 *
 * Trình duyệt tải tờ này, rasterise, rồi gửi lại ở `POST /runs`; máy chủ dựng lại bằng CÙNG hàm và
 * đối chiếu cỡ khung. Đăng ký TRƯỚC `/:projectId` — Hono khớp theo thứ tự, và `roof-anchor` cũng là
 * một đoạn đường dẫn.
 *
 * Chỉ đòi quyền ĐỌC: tờ này dựng từ toạ độ đã lưu, không gọi mô hình, không tốn đồng nào.
 */
perspectiveApp.get('/:projectId/roof-anchor', async (c) => {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId');
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã ý tưởng mặt đứng.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const repo = new ArtifactRepository(c.env);
  const facade = await repo.get(artifactId, projectId);
  if (!facade || facade.kind !== 'ai_facade_concept') {
    return c.json({ error: 'Không tìm thấy ý tưởng mặt đứng này trong hồ sơ.' }, 404);
  }
  const concept = facade.payload as AiFacadeConcept;
  const planArtifact = await repo.get(concept.plan_ref, projectId);
  if (!planArtifact || planArtifact.kind !== 'ai_floor_plan') {
    return c.json({ error: 'Không tìm thấy phương án mặt bằng mà mặt đứng dựng theo.' }, 404);
  }

  // Đầu bài lấy ở ĐÂY nữa, không chỉ ở tuyến chạy: tờ phát ra và tờ dựng lại để đối chiếu phải
  // có cùng ranh thửa, nếu không phép so cỡ khung bác đúng tờ hợp lệ mà nó vừa phát (T68).
  const briefArtifact = await repo.head(projectId, DISCIPLINE, 'design_brief');

  let sheet;
  try {
    sheet = roofPlanAnchor(
      planArtifact.payload as AiFloorPlan,
      concept,
      (briefArtifact?.payload as DesignBrief | undefined) ?? null,
    );
  } catch (error) {
    if (error instanceof PlanSheetError) return c.json({ error: error.message }, 404);
    throw error;
  }
  return new Response(sheet.svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, no-cache',
      'X-Anchor-Width': String(sheet.widthPx),
      'X-Anchor-Height': String(sheet.heightPx),
    },
  });
});

/**
 * Ba bước mở đầu mà mọi tuyến GHI của bước này đều làm: đọc khoá, hỏi quyền GHI, mở kho artifact.
 *
 * Gộp lại vì ba tuyến `choose`, `hide`, `redraw` lặp y hệt nhau, và lặp một phép kiểm quyền là mở
 * đường cho một lần sửa chỉ động vào hai trong ba chỗ.
 */
async function writableProject(c: Ctx): Promise<
  | Response
  | {
      scope: NonNullable<Awaited<ReturnType<typeof projectScope>>>;
      db: Awaited<ReturnType<typeof asUser>>;
      repo: ArtifactRepository;
      body: {
        projectId: string;
        artifactId?: string;
        hidden?: boolean;
        view?: string;
        route?: string;
      };
    }
> {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const body = (await c.req.json()) as {
    projectId?: string;
    artifactId?: string;
    hidden?: boolean;
    view?: string;
    route?: string;
  };
  if (!body.projectId) return c.json({ error: 'Thiếu mã hồ sơ thiết kế.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, body.projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessWritable(db, scope.tenantId, body.projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);
  return {
    scope,
    db,
    repo: new ArtifactRepository(c.env),
    body: { ...body, projectId: body.projectId },
  };
}

/** Đọc một bộ ảnh sau khi đã hỏi quyền ĐỌC bộ môn. */
async function readSet(
  c: Ctx,
): Promise<{ set: AiImageSet; artifactId: string; createdAt: string } | Response> {
  const token = bearer(c.req.header('Authorization'));
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);
  const projectId = c.req.param('projectId') ?? '';
  const artifactId = c.req.query('artifactId');
  if (!artifactId) return c.json({ error: 'Thiếu mã bộ ảnh cần xem.' }, 400);

  const db = await asUser(c.env, token);
  const scope = await projectScope(db, projectId);
  if (!scope) return c.json({ error: PROJECT_NOT_VISIBLE }, 404);
  const denied = await denyUnlessReadable(db, scope.tenantId, projectId);
  if (denied) return c.json({ error: denied.error }, denied.status);

  const artifact = await new ArtifactRepository(c.env).get(artifactId, projectId);
  if (!artifact || artifact.kind !== 'ai_image_set') return c.json({ error: NOT_FOUND }, 404);
  return {
    set: artifact.payload as AiImageSet,
    artifactId: artifact.id,
    createdAt: artifact.createdAt,
  };
}

/**
 * Bộ ảnh dạng JSON — KHÔNG trả `uri`.
 *
 * Địa chỉ trong kho là đường đi vòng qua phép kiểm quyền: byte phải lấy qua `/view/:view`. Trả
 * `uri` ra ngoài là mở một cửa thứ hai mà không ai nhớ khoá.
 */
perspectiveApp.get('/:projectId', async (c) => {
  const read = await readSet(c);
  if (read instanceof Response) return read;
  const views = aiPrompts().perspective.views;
  return c.json({
    artifactId: read.artifactId,
    createdAt: read.createdAt,
    facadeRef: read.set.facade_ref,
    planRef: read.set.plan_ref,
    peopleAndVehicles: read.set.options?.people_and_vehicles ?? null,
    images: read.set.images.map((image) => ({
      view: image.view,
      label: views[image.view]?.labelVi ?? image.view,
      anchor: image.anchor,
      width: image.width ?? null,
      height: image.height ?? null,
    })),
    missing: (read.set.missing ?? []).map((gap) => ({
      view: gap.view,
      label: views[gap.view]?.labelVi ?? gap.view,
      reason: gap.reason,
    })),
    watermark: aiPrompts().perspective.watermark,
  });
});

/** Byte của MỘT góc — chưa đóng dấu; `ETag` là mã artifact cộng tên góc. */
perspectiveApp.get('/:projectId/view/:view', async (c) => {
  const read = await readSet(c);
  if (read instanceof Response) return read;
  const view = c.req.param('view') as AiImageSetView;
  const image = read.set.images.find((item) => item.view === view);
  if (!image) return c.json({ error: 'Bộ ảnh này không có góc đó.' }, 404);

  const etag = `"${read.artifactId}:${view}"`;
  if ((c.req.header('If-None-Match') ?? '') === etag) {
    return new Response(null, {
      status: 304,
      headers: { 'Cache-Control': 'private, no-cache', ETag: etag },
    });
  }
  let bytes;
  try {
    bytes = (await createRenderStore(c.env).get(image.uri)).bytes;
  } catch (error) {
    if (error instanceof RenderStoreError) return c.json({ error: error.message }, 502);
    throw error;
  }
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': image.mime,
      'Cache-Control': 'private, no-cache',
      ETag: etag,
    },
  });
});

/**
 * Chọn một bộ ảnh làm BỘ HIỆU LỰC — đường quay lại, cùng khuôn `/facade/choose` (T64).
 *
 * Dựng bộ thứ hai rồi thấy bộ đầu đẹp hơn thì chọn lại, không phải trả tiền một lượt chạy nữa cho
 * thứ mình đã có.
 */
perspectiveApp.post('/choose', async (c) => {
  const gate = await writableProject(c);
  if (gate instanceof Response) return gate;
  const { scope, body, repo } = gate;
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bộ ảnh nào.' }, 400);

  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_image_set') return c.json({ error: NOT_FOUND }, 404);
  await repo.setHead(
    {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      projectId: body.projectId,
      discipline: DISCIPLINE,
      actorId: scope.actorId,
    },
    'ai_image_set',
    artifact.id,
  );
  return c.json({ artifactId: artifact.id });
});

/**
 * «Xoá» một bộ ảnh khỏi dải chọn — THÔI HIỆN, không xoá dữ liệu.
 *
 * Cùng khuôn `/facade/hide`: artifact bất biến, bỏ dòng đánh dấu thì bộ ấy trở lại. Bộ đang hiệu
 * lực thì gỡ luôn mốc — để lại một mốc trỏ vào thứ màn hình không còn hiện là cách chắc chắn nhất
 * để một bộ ảnh đã bỏ đi vẫn hiện ở chỗ khác.
 */
perspectiveApp.post('/hide', async (c) => {
  const gate = await writableProject(c);
  if (gate instanceof Response) return gate;
  const { scope, body, repo, db } = gate;
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bộ ảnh nào.' }, 400);
  const hidden = body.hidden !== false;

  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_image_set') return c.json({ error: NOT_FOUND }, 404);

  if (!hidden) {
    const { error } = await db
      .from('design_artifact_hidden')
      .delete()
      .eq('artifact_id', artifact.id);
    if (error) return c.json({ error: 'Không đưa lại được bộ ảnh vào danh sách.' }, 500);
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
  if (error) return c.json({ error: 'Không xoá được bộ ảnh khỏi danh sách.' }, 500);

  await repo.clearHead(body.projectId, DISCIPLINE, 'ai_image_set', artifact.id);
  return c.json({ artifactId: artifact.id, hidden: true });
});

/**
 * Vẽ lại ĐÚNG MỘT góc của một bộ ảnh (T67 Đợt C).
 *
 * ── Vì sao không phải «chạy lại cả bộ» ────────────────────────────────────────────────────
 * Một góc không ưng thì trả tiền lại cho bốn góc đang dùng được là vô lý. Artifact bất biến nên
 * không sửa tại chỗ được — nhưng mã artifact là mã BĂM NỘI DUNG, và bốn góc kia giữ nguyên `uri`,
 * nên bộ mới chỉ tốn đúng một lượt gọi. Byte của bốn tấm kia KHÔNG được sinh lại.
 *
 * ── `front_day` KHÔNG vẽ lại lẻ được, và đó là ràng buộc chứ không phải thiếu sót ─────────
 * Bốn góc còn lại dựng ảnh→ảnh TỪ CHÍNH tấm ban ngày. Thay nó mà giữ bốn tấm kia là để lại một bộ
 * năm ảnh của HAI ngôi nhà — đúng thứ cả bước này sinh ra để tránh. Muốn đổi tấm ấy thì chạy lại
 * cả bộ.
 *
 * Tuyến này ĐỒNG BỘ, khác `POST /runs`: một lượt gọi thì giữ kết nối được, và không cần tờ neo mới
 * — mọi thứ cần đã nằm trong kho từ lượt chạy trước.
 */
perspectiveApp.post('/redraw', async (c) => {
  const gate = await writableProject(c);
  if (gate instanceof Response) return gate;
  const { scope, body, repo } = gate;
  if (!body.artifactId) return c.json({ error: 'Chưa chọn bộ ảnh nào.' }, 400);
  if (!body.view) return c.json({ error: 'Chưa chọn góc cần vẽ lại.' }, 400);
  if (!body.route) return c.json({ error: 'Chưa chọn model vẽ ảnh.' }, 400);
  const refusal = redrawAloneRefusal(body.view as AiImageSetView);
  if (refusal) return c.json({ error: refusal }, 409);

  const router = modelRouter(c.env);
  if (!isSelectableRoute(aiModelCatalogue(router), 'image', body.route, AI_DIGEST_DATA_CLASS)) {
    return c.json(
      { error: 'Model vẽ ảnh đã chọn không dùng được lúc này. Chọn model khác trong danh sách.' },
      409,
    );
  }
  const client = imageClientFor(c.env, body.route);
  if (!client) return c.json({ error: 'Chưa cấu hình khoá API cho model đã chọn.' }, 503);

  const artifact = await repo.get(body.artifactId, body.projectId);
  if (!artifact || artifact.kind !== 'ai_image_set') return c.json({ error: NOT_FOUND }, 404);
  const set = artifact.payload as AiImageSet;

  const [facade, brief] = await Promise.all([
    repo.get(set.facade_ref, body.projectId),
    repo.head(body.projectId, DISCIPLINE, 'design_brief'),
  ]);
  if (!facade || facade.kind !== 'ai_facade_concept') {
    return c.json({ error: 'Không tìm thấy ý tưởng mặt đứng mà bộ ảnh dựng theo.' }, 404);
  }
  if (!brief) return c.json({ error: 'Chưa có đầu bài đã xác nhận.' }, 409);
  const concept = facade.payload as AiFacadeConcept;

  // Danh sách góc dựng lại từ CHÍNH hàm của lượt chạy, không viết lại: góc nào cầm ảnh nào là một
  // quyết định, và hai bản của nó là hai cơ hội để chúng lệch nhau.
  const plan = perspectivePlan(
    concept,
    set.anchors.map((a) => a.kind),
  );
  const step = plan.steps.find((s) => s.view === body.view);
  if (!step) {
    const skipped = plan.skipped.find((s) => s.view === body.view);
    return c.json({ error: skipped?.reason ?? 'Bộ ảnh này không có góc đó.' }, 409);
  }

  const digest = anonymiseForAi(
    await aiDigestInputs(gate.db, body.projectId, brief.payload as DesignBrief),
  );
  const params: AiDesignParams = {
    runId: '',
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    projectId: body.projectId,
    actorId: scope.actorId,
    discipline: DISCIPLINE,
    stage: 'images',
    textRoute: body.route,
    imageRoute: body.route,
    briefRef: brief.id,
    digest,
    rulePacks: { standards: false, experience: false },
    variants: [],
    planRef: set.plan_ref,
    facadeRef: set.facade_ref,
    // Lựa chọn của LƯỢT CHẠY cũ, đọc từ chính artifact: một tấm vẽ lại không được lặng lẽ đổi từ
    // «không có người» sang «có người» chỉ vì mặc định của tuyến khác thế.
    peopleAndVehicles: set.options?.people_and_vehicles ?? true,
    anchors: set.anchors.map((a) => ({ ...a })),
  };
  const publicRoute = router.publicRoutes().find((r) => r.route === body.route);
  const deps = {
    client,
    prompts: aiPrompts(),
    vocab: facadeVocabulary(),
    repo,
    store: createRenderStore(c.env),
    ...(publicRoute?.pricing ? { pricing: publicRoute.pricing } : {}),
    provider: router.providerOf(body.route) ?? 'unknown',
    model: publicRoute?.model ?? 'unknown',
  };

  // Bốn tấm kia đi vào đúng dạng `DrawnView` để `resolveSources` tìm được `front_day`.
  const kept: DrawnView[] = set.images
    .filter((image) => image.view !== body.view)
    .map((image) => ({
      view: image.view,
      uri: image.uri,
      mime: image.mime,
      widthPx: image.width ?? null,
      heightPx: image.height ?? null,
      sourceRefs: [...(image.source_refs ?? [])],
      prompt: image.prompt_excerpt ?? '',
      provider: image.provider ?? 'unknown',
      model: image.model ?? 'unknown',
      latencyMs: image.latency_ms ?? null,
    }));

  let drawn;
  try {
    drawn = await drawViewStep(deps, params, step, set.anchors, kept);
  } catch (error) {
    if (error instanceof LlmCallFailed) {
      return c.json({ error: error.userMessage ?? error.message }, error.retryable ? 503 : 502);
    }
    if (error instanceof RenderStoreError) {
      return c.json({ error: `Đã vẽ được ảnh nhưng không lưu được: ${error.message}` }, 502);
    }
    throw error;
  }

  const written = await writeImageSetStep(
    deps,
    params,
    set.anchors,
    [...kept, drawn],
    // Góc vừa vẽ được thì không còn thiếu nữa.
    (set.missing ?? []).filter((gap) => gap.view !== body.view),
  );
  return c.json({ artifactId: written.artifactId, view: drawn.view, reused: written.reused });
});
