/**
 * Bản XEM TRƯỚC thu nhỏ của ảnh do mô hình vẽ — cho ảnh bìa thẻ hồ sơ AI Design (Haan, 08/10/2026).
 *
 * Vì sao cần: ảnh phối cảnh lưu trong kho là PNG cỡ gốc ~2,7 MB (đo trên bản demo 08/10/2026), tờ
 * mặt bằng nội thất 1,3–2,4 MB. Worker trả trong 0,4 s nhưng trình duyệt còn phải tải hết chừng ấy
 * byte để hiện trong một khung rộng vài trăm điểm ảnh — Haan đo ~4 s mỗi thẻ.
 *
 * Thu nhỏ bằng Images binding của Cloudflare (`env.IMAGES`), không bằng thư viện trong Worker: giải
 * mã và nén lại ảnh vài MB là việc nặng CPU. Biến đổi tính phí theo «biến đổi duy nhất mỗi tháng»
 * (cùng ảnh + cùng tham số chỉ tính một lần), nên chỉ cho một tập độ rộng cố định — tham số tuỳ ý
 * từ trình duyệt sẽ nhân số biến đổi lên vô hạn.
 *
 * Byte trả về VẪN CHƯA đóng dấu — hợp đồng `ai-image-set` giữ nguyên: nhãn do trình duyệt in.
 * Binding vắng hay biến đổi hỏng thì trả ảnh gốc: chậm hơn nhưng không mất ảnh.
 */

import { AI_PREVIEW_WIDTH } from '@nvg/shared/design';
import { pngSize } from './sheet-image';

/** Độ rộng xem trước được phép. Thêm số mới là thêm một biến đổi tính phí cho mỗi ảnh. */
export const PREVIEW_WIDTHS = [AI_PREVIEW_WIDTH] as const;

/**
 * Đọc `?w=`: vắng → `null` (ảnh gốc); không thuộc `PREVIEW_WIDTHS` → `'invalid'` để tuyến trả 400,
 * không lặng lẽ đổi sang ảnh gốc mà người gọi không biết.
 */
export function readPreviewWidth(raw: string | undefined): number | null | 'invalid' {
  if (raw === undefined || raw === '') return null;
  const width = Number(raw);
  return (PREVIEW_WIDTHS as readonly number[]).includes(width) ? width : 'invalid';
}

/** `ETag` của bản xem trước khác bản gốc — hai thứ byte khác nhau không được trả 304 lẫn cho nhau. */
export function previewEtag(base: string, width: number | null): string {
  return width ? `"${base}@w${width}"` : `"${base}"`;
}

export async function imageResponse(
  images: ImagesBinding | undefined,
  source: ArrayBuffer | Uint8Array,
  mime: string,
  etagBase: string,
  width: number | null,
): Promise<Response> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const original = (): Response =>
    new Response(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, no-cache',
        ETag: previewEtag(etagBase, null),
      },
    });

  if (!width || !images) return original();
  // Ảnh đã nhỏ hơn khung thì không phóng to — trả nguyên, khỏi tốn một lượt biến đổi.
  const size = pngSize(bytes);
  if (size && size.width <= width) return original();

  try {
    const stream = new Response(bytes as unknown as BodyInit).body!;
    const result = await images
      .input(stream)
      .transform({ width })
      .output({ format: 'image/webp', quality: 82 });
    return result.response({
      headers: { 'Cache-Control': 'private, no-cache', ETag: previewEtag(etagBase, width) },
    });
  } catch (error) {
    console.warn('[image-preview] không thu nhỏ được, trả ảnh gốc', error);
    return original();
  }
}
