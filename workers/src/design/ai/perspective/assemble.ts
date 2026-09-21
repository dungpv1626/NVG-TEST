/**
 * Đúc payload artifact `ai_image_set` (T67) — phần THUẦN.
 *
 * Một lượt chạy = MỘT artifact mang cả bộ. Không tách mỗi góc một artifact: năm tấm chỉ có nghĩa
 * khi đứng cùng nhau (cùng một ngôi nhà, cùng một lần chạy), và tách ra thì không còn chỗ nào ghi
 * được «góc này thiếu vì lý do gì».
 *
 * `watermark_applied` luôn `false` và hợp đồng khai `const false` — byte trong kho CHƯA đóng dấu.
 * Worker không có canvas; nhãn do trình duyệt in lên, cả khi xem lẫn khi tải về.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL.
 */

import type { AiImageSet, AiImageSetView } from '@nvg/shared/design';
import { SET_ANCHOR_VIEW } from './views';

/** Phiên bản hợp đồng `ai-image-set` mà tệp này đúc ra. */
const SCHEMA_VERSION = '1.0.0';

/** Một tấm đã vẽ xong và đã cất vào kho. */
export interface DrawnView {
  view: AiImageSetView;
  uri: string;
  mime: string;
  widthPx: number | null;
  heightPx: number | null;
  /** URI những ảnh đã gửi kèm lượt vẽ này, đúng thứ tự đã gửi. */
  sourceRefs: string[];
  prompt: string;
  provider: string;
  model: string;
  latencyMs: number | null;
}

/** Tờ neo vector mà trình duyệt đã rasterise và gửi lên. */
export interface StoredAnchor {
  kind: 'elevation' | 'roof_plan';
  uri: string;
  sha256: string;
  bytes: number;
}

export interface AssembleImageSetInput {
  facadeRef: string;
  planRef: string;
  anchors: StoredAnchor[];
  drawn: DrawnView[];
  missing: Array<{ view: AiImageSetView; reason: string }>;
  peopleAndVehicles: boolean;
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export class ImageSetError extends Error {
  readonly retryable = false;
}

export function assembleImageSet(input: AssembleImageSetInput): AiImageSet {
  // Hợp đồng đòi ĐÚNG MỘT ảnh mang cờ `anchor`. Thiếu nó thì bộ ảnh không còn gốc để đối chiếu, và
  // chuyện ấy phải nổ ra ở đây chứ không nằm im trong một artifact đã ghi.
  const anchors = input.drawn.filter((d) => d.view === SET_ANCHOR_VIEW);
  if (anchors.length !== 1) {
    throw new ImageSetError(
      `Bộ ảnh phải có đúng một tấm "${SET_ANCHOR_VIEW}" làm gốc (đang có ${anchors.length}).`,
    );
  }
  const seen = new Set<AiImageSetView>();
  for (const drawn of input.drawn) {
    if (seen.has(drawn.view)) {
      throw new ImageSetError(`Bộ ảnh có hai tấm cùng góc "${drawn.view}".`);
    }
    seen.add(drawn.view);
  }
  // Một góc vừa có ảnh vừa nằm trong danh sách thiếu là hai câu trả lời ngược nhau trong cùng một
  // artifact — màn hình sẽ hiện một trong hai, tuỳ nó đọc chỗ nào trước.
  for (const gap of input.missing) {
    if (seen.has(gap.view)) {
      throw new ImageSetError(`Góc "${gap.view}" vừa có ảnh vừa được ghi là thiếu.`);
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    facade_ref: input.facadeRef,
    plan_ref: input.planRef,
    anchors: input.anchors.map((anchor) => ({
      kind: anchor.kind,
      uri: anchor.uri,
      sha256: anchor.sha256,
      bytes: anchor.bytes,
      mime: 'image/png' as const,
    })),
    options: { people_and_vehicles: input.peopleAndVehicles },
    images: input.drawn.map((drawn) => ({
      view: drawn.view,
      uri: drawn.uri,
      mime: drawn.mime as AiImageSet['images'][number]['mime'],
      width: drawn.widthPx,
      height: drawn.heightPx,
      anchor: drawn.view === SET_ANCHOR_VIEW,
      watermark_applied: false as const,
      source_refs: drawn.sourceRefs,
      prompt_excerpt: drawn.prompt.slice(0, 1200),
      provider: drawn.provider,
      model: drawn.model,
      prompt_version: input.promptVersion,
      latency_ms: drawn.latencyMs,
    })),
    ...(input.missing.length ? { missing: input.missing } : {}),
    generator: {
      kind: 'ai',
      provider: input.provider,
      model: input.model,
      route: input.route,
      prompt_version: input.promptVersion,
    },
  };
}
