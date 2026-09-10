/**
 * Danh mục model cho ô chọn trên trang thiết kế — phần thuần, kiểm thử được không cần HTTP.
 *
 * Người dùng chọn TÊN TUYẾN, không chọn tên mô hình (hàng rào 2 của nhánh AI). Tuyến bật mà
 * chưa có khoá vẫn được liệt kê kèm lý do, để giao diện MỜ nó và nói vì sao — không hiện rồi
 * báo lỗi khi bấm (AFD 6.5), cũng không giấu hẳn khiến người ta tưởng tính năng không tồn tại.
 */

import type { DataClass } from '@nvg/shared/design';
import type { ModelRouter, PublicRoute } from '../llm/router';

export interface AiModelOption {
  route: string;
  provider: string;
  label: string;
  model: string;
  /** Hạng dữ liệu nhạy cảm nhất tuyến nhận — 2 cho tuyến trả phí, 3 cho Pollinations. */
  maxDataClass: DataClass;
  /** Bật trong cấu hình VÀ có khoá — bấm được. */
  enabled: boolean;
  /** Vì sao không bấm được. Rỗng khi `enabled`. */
  unavailableReason: string | null;
  /**
   * Giá một tấm ảnh, USD — CHỈ tuyến ảnh có.
   *
   * `null` khi cấu hình chưa khai giá, và màn hình phải hiện «Chưa đủ dữ liệu» chứ KHÔNG hiện
   * `0` (CLAUDE.md 5.2). Ba tuyến `_fast` cố ý để trống giá, nên đây là trạng thái thật chứ
   * không phải thiếu sót.
   */
  imageUsd: number | null;
}

export interface AiModelCatalogue {
  text: AiModelOption[];
  image: AiModelOption[];
}

export const TEXT_ROUTE_PREFIX = 'ai_text_';
export const IMAGE_ROUTE_PREFIX = 'ai_image_';

function option(route: PublicRoute): AiModelOption {
  const reason = !route.enabled
    ? 'Tuyến đang tắt trong cấu hình.'
    : !route.hasKey
      ? 'Chưa cấu hình khoá API của nhà cung cấp này.'
      : null;
  return {
    route: route.route,
    provider: route.provider,
    label: route.label,
    model: route.model,
    maxDataClass: route.maxDataClass,
    enabled: reason === null,
    unavailableReason: reason,
    imageUsd: route.pricing?.image_usd ?? null,
  };
}

export function aiModelCatalogue(router: ModelRouter): AiModelCatalogue {
  const routes = router.publicRoutes();
  return {
    text: routes.filter((r) => r.route.startsWith(TEXT_ROUTE_PREFIX)).map(option),
    // CHỈ tuyến `ai_image_*`. Tuyến phối cảnh cũ của bộ giải (`layer5_render`) cố ý không có
    // mặt ở đây: nhánh AI không được import gì từ `render/` để bộ giải xoá được mà nhánh này
    // không vỡ (T15, 09/09/2026 — có kiểm thử canh ở `ai-independence.test.ts`).
    image: routes.filter((r) => r.route.startsWith(IMAGE_ROUTE_PREFIX)).map(option),
  };
}

/** Tên tuyến người dùng gửi lên có nằm trong danh mục của LOẠI đó không. */
export function isSelectableRoute(
  catalogue: AiModelCatalogue,
  kind: 'text' | 'image',
  route: string,
): boolean {
  return catalogue[kind].some((o) => o.route === route && o.enabled);
}
