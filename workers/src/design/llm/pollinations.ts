/**
 * Client sinh ảnh qua Pollinations — nhà cung cấp của tuyến phối cảnh (`layer5_render`, TK-16).
 *
 * Lịch sử ngắn, ghi lại để không đi lại đường cũ: Gemini gói miễn phí trả `limit: 0` cho MỌI
 * mô hình sinh ảnh (không phải hết hạn mức trong ngày, mà là không cấp lượt nào). Hugging Face
 * chạy được nhưng hạn mức miễn phí chỉ khoảng 0,10 đô một tháng — bốn lần gọi để đo là hết.
 * Pollinations thay vào chỗ đó ngày 06/09/2026.
 *
 * Bốn điều đo được bằng lời gọi thật (ảnh khối tự dựng, prompt không mang dữ liệu NVG):
 *
 *  1. `POST /v1/images/edits`, `multipart/form-data` với ba trường `model`, `image`, `prompt`.
 *     Đây là ĐƯỜNG ẢNH → ẢNH. Đường `GET /image/{prompt}` cũng có nhưng là CHỮ → ẢNH: nó dựng
 *     một ngôi nhà khác chứ không dựng ngôi nhà đã giải, tức phá nguyên tắc bất biến 1
 *     (CLAUDE.md 8.2). Không dùng, kể cả khi rẻ hơn.
 *  2. Mô hình `kontext` khai `input_modalities: [text, image]` và có `/v1/images/edits` trong
 *     `supported_endpoints`. Danh sách mô hình lấy được ở `GET /v1/models` — tra ở đó trước
 *     khi đổi tên mô hình, đừng đoán.
 *  3. Phản hồi là JSON kiểu OpenAI: `data[0].b64_json`. Nó KHÔNG kèm kiểu tệp, và thực tế trả
 *     về JPEG chứ không phải PNG — nên kiểu tệp phải NHẬN DẠNG từ mấy byte đầu, xem `sniffMime`.
 *  4. ~18,5 giây cho một ảnh 1024×1024. Đó là lý do hạn chờ đặt rộng ở dưới.
 *
 * Cùng khuôn với `gemini.ts`: KHÔNG nhận tên mô hình, chỉ nhận TÊN BƯỚC rồi hỏi `ModelRouter`
 * — không có tham số nào đi vòng qua lớp chặn hạng dữ liệu, và khoá không bao giờ rời router.
 */

import type { DataClass } from '@nvg/shared/design';
import { classifyNetworkFault } from './provider-faults';
import { LlmCallFailed } from './gemini';
import { ALLOWED_IMAGE_INPUT, decodeBase64, sniffMime } from './image-bytes';
import type { ModelRouter, ResolvedRoute } from './router';

// Giữ lối xuất cũ: test và lớp gọi hiện có import `sniffMime` từ đây.
export { sniffMime } from './image-bytes';

/** Phản hồi kiểu OpenAI của `/v1/images/edits`. */
interface EditResponse {
  data?: { b64_json?: string }[];
  error?: unknown;
}

export class PollinationsImageClient {
  constructor(private readonly router: ModelRouter) {}

  /**
   * Dựng ảnh phối cảnh TỪ ảnh khối.
   *
   * `system` và `prompt` nối làm một chuỗi: mô hình sinh ảnh không có khái niệm "chỉ dẫn hệ
   * thống" tách riêng như mô hình ngôn ngữ. Thứ tự giữ nguyên — ràng buộc hình học trước,
   * phong cách sau — để phần "giữ nguyên khối" không bị đẩy xuống cuối lời dẫn.
   */
  async generateImage(
    routeName: string,
    dataClass: DataClass,
    options: { system: string; prompt: string; image: { mimeType: string; dataBase64: string } },
  ): Promise<{ mimeType: string; dataBase64: string }> {
    const route = this.router.resolve(routeName, dataClass);
    if (!route.endpoint) {
      throw new LlmCallFailed(
        `Đầu ra "${routeName}" thiếu \`endpoint\` trong config/models.yaml.`,
        false,
      );
    }
    if (!ALLOWED_IMAGE_INPUT.has(options.image.mimeType)) {
      throw new LlmCallFailed(
        `Ảnh khối có kiểu tệp không gửi được: ${options.image.mimeType}. Nhận PNG, JPEG hoặc WebP.`,
        false,
      );
    }
    const prompt = `${options.system}\n\n${options.prompt}`.trim();
    if (!prompt) {
      throw new LlmCallFailed(`Đầu ra "${routeName}" gọi với lời dẫn rỗng.`, false);
    }

    const form = new FormData();
    form.set('model', route.model);
    form.set('prompt', prompt);
    form.set(
      'image',
      new Blob([decodeBase64(options.image.dataBase64)], { type: options.image.mimeType }),
      `massing.${options.image.mimeType === 'image/png' ? 'png' : 'jpg'}`,
    );

    const body = await this.call(route, form);
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) {
      throw new LlmCallFailed(
        `Đầu ra "${routeName}" không trả về ảnh. Phản hồi có các khoá: ${Object.keys(body).join(', ') || 'rỗng'}.`,
        false,
      );
    }
    return { mimeType: sniffMime(b64), dataBase64: b64 };
  }

  private async call(route: ResolvedRoute, form: FormData): Promise<EditResponse> {
    let res: Response;
    try {
      res = await fetch(route.endpoint!, {
        method: 'POST',
        // KHÔNG tự đặt `Content-Type`: ranh giới multipart do runtime sinh, đặt tay là hỏng.
        headers: { Authorization: `Bearer ${route.apiKey}` },
        body: form,
        // Đo được ~18,5 giây cho một ảnh. Để rộng vì lời gọi còn phải xếp hàng khi nhà cung
        // cấp bận, và bỏ dở nửa chừng là mất lượt mà không có ảnh.
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      // Gồm cả hết giờ (`TimeoutError`) — đáng thử lại, khác hẳn lỗi yêu cầu sai.
      // `false`: Pollinations là tuyến MIỄN PHÍ, nên hết giờ ở đây không để lại một hoá đơn nào —
      // lý lẽ «đừng mua hai lần cùng một lượt sinh» của các tuyến trả phí không áp. Hàng đợi
      // miễn phí tắc tạm thời là chuyện thường, và thử lại một lượt không tốn gì.
      const fault = classifyNetworkFault(error, 'dịch vụ sinh ảnh', false);
      throw new LlmCallFailed(
        `Không gọi được dịch vụ sinh ảnh: ${error instanceof Error ? error.message : String(error)}`,
        fault.retryable,
        undefined,
        fault.userMessage,
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 429 (quá nhiều lời gọi) và 5xx đáng thử lại. 401/403 (khoá sai, hết quyền) và 400
      // (yêu cầu sai) thì thử lại vô ích — Workflow đọc đúng cờ này để quyết định.
      const retryable = res.status === 429 || res.status >= 500;
      throw new LlmCallFailed(
        `Dịch vụ sinh ảnh trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        retryable,
        res.status,
      );
    }
    return (await res.json()) as EditResponse;
  }
}
