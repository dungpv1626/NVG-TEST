/**
 * Phần NGHIỆP VỤ của lượt chạy nền «bộ ảnh phối cảnh» (T67) — không import gì của Cloudflare, nên
 * `vitest` gọi thẳng được với client mô hình giả. Cùng khuôn với `ai-facade-steps.ts`:
 *
 *  · một hàm = một bước Workflow, gọi mô hình ĐÚNG MỘT LẦN — Workflow thử lại cả bước khi hỏng, và
 *    gộp hai góc vào một bước là một lần rớt mạng mua lại góc trước;
 *  · lượt gọi nào cũng ghi `design_ai_call` ngay trong bước đã gọi, kể cả lượt hỏng (CLAUDE.md 6.4);
 *  · dữ liệu đi giữa các bước là chuỗi JSON.
 *
 * ── Khác hai giai đoạn trước ở một chỗ ────────────────────────────────────────────────────
 * Các góc KHÔNG độc lập. `front_day` là gốc màu và vật liệu của bốn góc còn lại, nên nó chạy trước
 * và các bước sau nhận URI của nó. Hỏng `front_day` thì cả bộ dừng — vẽ tiếp bốn tấm không có gốc
 * là trả tiền cho bốn ngôi nhà khác nhau (bài học T21).
 */

import type { AiFacadeConcept, AiFloorPlan, AiImageSetView } from '@nvg/shared/design';
import type { ArtifactRepository } from '../artifacts';
import type { FacadeVocabulary } from '../kb/facade-vocabulary';
import type { GenerateImagePart } from '../llm/gemini';
import type { RoutePricing } from '../llm/router';
import type { AiImageClient } from '../llm/text-client';
import type { RenderStore } from '../render-store';
import { renderKey } from '../render-store';
import { recordAiCall, type AiCallOutcome } from '../ai/call-log';
import { facadeLook } from '../ai/facade/image';
import { assembleImageSet, type DrawnView, type StoredAnchor } from '../ai/perspective/assemble';
import { perspectiveContext } from '../ai/perspective/context';
import { perspectivePrompt } from '../ai/perspective/prompt';
import type { ViewSource, ViewStep } from '../ai/perspective/views';
import type { AiPrompts } from '../ai/prompts';
import { pngSize } from '../ai/sheet-image';
import { AI_DIGEST_DATA_CLASS } from '../brief/anonymise';
import { LlmCallFailed } from '../llm/gemini';
import type { AiDesignParams } from './ai-design-steps';

export interface PerspectiveStepDeps {
  client: AiImageClient;
  prompts: AiPrompts;
  vocab: FacadeVocabulary;
  repo: ArtifactRepository;
  /** Kho nhị phân — đọc tờ neo trình duyệt đã gửi lên, ghi ảnh mô hình trả về. */
  store: RenderStore;
  pricing?: RoutePricing;
  provider: string;
  model: string;
}

/** Mã bước Workflow của một góc. Ổn định theo góc, không theo thứ tự — thứ tự đổi thì bước vẫn khớp. */
export function perspectiveStepId(view: AiImageSetView): string {
  return `perspective:${view}`;
}

export const PERSPECTIVE_WRITE_STEP = 'perspective:write';

/**
 * Danh sách bước khai TRƯỚC khi chạy, để màn hình hiện đủ tiến trình ngay từ giây đầu.
 *
 * Nhận `views` chứ không tự dựng: góc nào chạy là quyết định của `perspectivePlan()`, và khai ở
 * đây một danh sách thứ hai là mở đường cho hai danh sách lệch nhau.
 */
export function perspectiveStepSpecs(views: readonly AiImageSetView[], labels: AiPrompts) {
  return [
    ...views.map((view) => ({
      id: perspectiveStepId(view),
      label: `Vẽ ${(labels.perspective.views[view]?.labelVi ?? view).toLocaleLowerCase('vi')}`,
    })),
    { id: PERSPECTIVE_WRITE_STEP, label: 'Lưu bộ ảnh phối cảnh' },
  ];
}

/** Hai artifact mà mọi bước đều đọc — đọc lại mỗi bước, rẻ và tất định. */
async function inputsOf(
  deps: PerspectiveStepDeps,
  params: AiDesignParams,
): Promise<{ concept: AiFacadeConcept; plan: AiFloorPlan }> {
  if (!params.facadeRef) throw new Error('Lượt chạy phối cảnh thiếu mã ý tưởng mặt đứng.');
  if (!params.planRef) throw new Error('Lượt chạy phối cảnh thiếu mã phương án mặt bằng.');
  const [facade, plan] = await Promise.all([
    deps.repo.get(params.facadeRef, params.projectId),
    deps.repo.get(params.planRef, params.projectId),
  ]);
  if (!facade || facade.kind !== 'ai_facade_concept') {
    throw new Error('Không tìm thấy ý tưởng mặt đứng mà bộ ảnh dựng theo.');
  }
  if (!plan || plan.kind !== 'ai_floor_plan') {
    throw new Error('Không tìm thấy phương án mặt bằng mà bộ ảnh dựng theo.');
  }
  return { concept: facade.payload as AiFacadeConcept, plan: plan.payload as AiFloorPlan };
}

/**
 * Đổi danh sách nguồn của một góc thành URI thật.
 *
 * Tách khỏi phần tải byte để kiểm thử được: đây là chỗ một tấm có thể LẶNG LẼ biến mất khỏi lời
 * gọi — tờ neo không có trong danh sách đã gửi lên, hay góc gốc chưa vẽ xong. Cả hai trường hợp
 * lời gọi vẫn chạy, vẫn tính tiền, và vẽ một ngôi nhà khác.
 */
export function resolveSources(
  sources: readonly ViewSource[],
  anchors: readonly StoredAnchor[],
  drawn: readonly DrawnView[],
): string[] {
  return sources.map((source) => {
    if ('anchor' in source) {
      const found = anchors.find((a) => a.kind === source.anchor);
      if (!found) throw new Error(`Lượt chạy thiếu tờ neo "${source.anchor}".`);
      return found.uri;
    }
    const found = drawn.find((d) => d.view === source.image);
    if (!found) throw new Error(`Góc "${source.image}" chưa vẽ xong nên chưa làm tham chiếu được.`);
    return found.uri;
  });
}

/**
 * Vẽ MỘT góc. KHÔNG bắt lỗi của lời gọi: góc hỏng là việc của lớp gọi quyết định (dừng cả bộ nếu
 * là `front_day`, ghi vào `missing[]` nếu là góc phụ). Chỉ bảo đảm nhật ký được ghi trước khi ném.
 */
export async function drawViewStep(
  deps: PerspectiveStepDeps,
  params: AiDesignParams,
  step: ViewStep,
  anchors: readonly StoredAnchor[],
  drawn: readonly DrawnView[],
  /** Tín hiệu của nút «Dừng» — huỷ CẢ lời gọi đang bay, không chỉ chặn góc sau. */
  signal?: AbortSignal,
): Promise<DrawnView> {
  const { concept, plan } = await inputsOf(deps, params);
  const prompt = perspectivePrompt({
    view: step.view,
    context: perspectiveContext(params.digest, plan, concept),
    look: facadeLook(concept, deps.vocab, deps.prompts),
    prompts: deps.prompts,
    peopleAndVehicles: params.peopleAndVehicles ?? true,
  });

  const sourceRefs = resolveSources(step.sources, anchors, drawn);
  const images: GenerateImagePart[] = [];
  for (const uri of sourceRefs) {
    const image = await deps.store.get(uri);
    images.push({ mimeType: image.mime, dataBase64: toBase64(new Uint8Array(image.bytes)) });
  }
  // Mọi góc phải mang ít nhất một ảnh vào. Mảng rỗng vẫn ra ảnh và vẫn tính tiền — không màn hình
  // nào lộ ra, nên nó phải có lưới ở đây chứ không chỉ trong phép thử của `perspectivePlan`.
  if (images.length === 0) {
    throw new Error(`Góc "${step.view}" không có ảnh tham chiếu nào để gửi.`);
  }

  const started = Date.now();
  let result;
  try {
    result = await deps.client.generateImage(params.imageRoute!, AI_DIGEST_DATA_CLASS, {
      system: prompt.system,
      prompt: prompt.prompt,
      images,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    // Lượt hỏng vẫn có thể đã tính tiền: ghi một dòng, lấy token từ chính lỗi.
    await logCall(deps, params, step.view, {
      provider: deps.provider,
      model: deps.model,
      usage: (error instanceof LlmCallFailed && error.usage) || {
        inputTokens: null,
        outputTokens: null,
      },
      latencyMs: (error instanceof LlmCallFailed && error.latencyMs) || Date.now() - started,
      imageCount: 0,
      status: 'failed',
      // Bấm «Dừng» cũng là một lượt HỎNG có thể đã tính tiền — ghi đúng lý do thay vì tên lỗi của
      // runtime, để dòng nhật ký đọc ra được là người dừng chứ không phải nhà cung cấp lỗi.
      errorCode: signal?.aborted ? 'cancelled' : error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
  await logCall(deps, params, step.view, { ...result, imageCount: 1, status: 'ok' });

  const bytes = decodeBase64(result.dataBase64);
  const uri = await deps.store.put(
    await renderKey(params.projectId, 'perspective', bytes, result.mimeType),
    bytes,
    result.mimeType,
  );
  const size = result.mimeType === 'image/png' ? pngSize(bytes) : null;

  return {
    view: step.view,
    uri,
    mime: result.mimeType,
    widthPx: size?.width ?? null,
    heightPx: size?.height ?? null,
    sourceRefs,
    prompt: prompt.prompt,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

/** `purpose` riêng CHO TỪNG GÓC: tiền của một góc phải tách được khỏi tiền của góc khác. */
async function logCall(
  deps: PerspectiveStepDeps,
  params: AiDesignParams,
  view: AiImageSetView,
  outcome: AiCallOutcome,
): Promise<void> {
  await recordAiCall(
    deps.repo.db,
    {
      tenantId: params.tenantId,
      companyId: params.companyId,
      projectId: params.projectId,
      discipline: params.discipline,
      actorId: params.actorId,
    },
    {
      route: params.imageRoute!,
      purpose: `perspective_${view}`,
      dataClass: AI_DIGEST_DATA_CLASS,
      promptVersion: deps.prompts.version,
    },
    outcome,
    deps.pricing,
  );
}

/** Chuỗi base64 → byte. Worker có `atob`, và tệp này cố ý không phụ thuộc API riêng Cloudflare. */
function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Byte → base64, theo từng khối.
 *
 * `String.fromCharCode(...bytes)` trên một tấm PNG 1–2 MB là hàng triệu đối số trong một lời gọi —
 * tràn ngăn xếp, và tràn ở đây nghĩa là mất một lượt ĐÃ TRẢ TIỀN chứ không phải một lỗi nhìn thấy
 * lúc phát triển.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Ghép cả bộ rồi đúc artifact — đặt head: bộ mới nhất là bộ đang hiệu lực. */
export async function writeImageSetStep(
  deps: PerspectiveStepDeps,
  params: AiDesignParams,
  anchors: readonly StoredAnchor[],
  drawn: readonly DrawnView[],
  missing: readonly { view: AiImageSetView; reason: string }[],
): Promise<{ artifactId: string; reused: boolean; views: AiImageSetView[] }> {
  const payload = assembleImageSet({
    facadeRef: params.facadeRef!,
    planRef: params.planRef!,
    anchors: [...anchors],
    drawn: [...drawn],
    missing: [...missing],
    peopleAndVehicles: params.peopleAndVehicles ?? true,
    route: params.imageRoute!,
    provider: deps.provider,
    model: deps.model,
    promptVersion: deps.prompts.version,
  });
  const written = await deps.repo.write({
    scope: {
      tenantId: params.tenantId,
      companyId: params.companyId,
      projectId: params.projectId,
      discipline: params.discipline,
      actorId: params.actorId,
    },
    kind: 'ai_image_set',
    payload,
    // Mặt bằng là đầu vào thứ hai: bộ ảnh nói về chiều sâu nhà, thứ chỉ mặt bằng biết.
    inputs: [params.facadeRef!, params.planRef!],
    step: 'ai_image_render',
    params: { route: params.imageRoute!, prompt_version: deps.prompts.version },
  });
  return {
    artifactId: written.id,
    reused: written.reused,
    views: payload.images.map((image) => image.view),
  };
}
