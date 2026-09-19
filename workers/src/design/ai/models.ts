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
  /** Giá niêm yết mỗi triệu token vào/ra, USD — `null` khi cấu hình chưa khai. */
  inputPer1mUsd: number | null;
  outputPer1mUsd: number | null;
  /** `false` khi khoá của nhà cung cấp là gói miễn phí — tiền thật bằng 0. */
  billed: boolean;
  /** Nhận «mức suy nghĩ» theo lượt không — xem `PublicRoute.supportsEffort`. */
  supportsEffort: boolean;
}

export interface AiModelCatalogue {
  text: AiModelOption[];
  image: AiModelOption[];
  /**
   * Nhà cung cấp không phát sinh hoá đơn. Màn hình nhật ký đọc thẳng `design_ai_call` qua RLS
   * và cần danh sách này để tính tiền thật của từng dòng (cột `cost_usd` là giá niêm yết).
   */
  freeProviders: string[];
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
    inputPer1mUsd: route.pricing?.input_per_1m_usd ?? null,
    outputPer1mUsd: route.pricing?.output_per_1m_usd ?? null,
    billed: route.billed,
    supportsEffort: route.supportsEffort,
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
    freeProviders: router.freeProviders,
  };
}

/** Tên tuyến người dùng gửi lên có nằm trong danh mục của LOẠI đó không. */
/**
 * @param dataClass Hạng dữ liệu lượt gọi sẽ gửi. Tuyến gói miễn phí chỉ nhận hạng 3 (đã ẩn
 *   danh); chọn nó cho một bước gửi hạng 2 thì router cũng chặn, nhưng chặn ở đây trả được câu
 *   409 đọc được thay vì một lỗi chính sách giữa chừng.
 */
export function isSelectableRoute(
  catalogue: AiModelCatalogue,
  kind: 'text' | 'image',
  route: string,
  dataClass: DataClass = 2,
): boolean {
  return catalogue[kind].some((o) => o.route === route && o.enabled && dataClass >= o.maxDataClass);
}
