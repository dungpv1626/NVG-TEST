/**
 * Lớp 5 — phối cảnh tham khảo từ ẢNH KHỐI (TK-16), tuyến `layer5_render`.
 *
 * Hai tầng (14-phuong-an-demo 14.5, Q-15): ảnh khối chụp từ trình xem ba chiều LUÔN có; ảnh
 * Gemini chỉ khi tuyến bật và có khoá trả phí. Tuyến tắt hay hết hạn mức thì trả về trạng thái
 * đọc được, KHÔNG phải lỗi — tính năng AI là phụ trợ, không được chặn luồng chính (PRD 5.1).
 *
 * Lời dẫn và nhãn cảnh báo là DỮ LIỆU ở `kb/render_prompts.yaml`. Nhãn do mã chèn lên ảnh ở
 * phía hiển thị (`render-panel.tsx`), và `watermark_applied` chỉ được đặt `true` sau bước đó.
 */

import type { DataClass } from '@nvg/shared/design';
import { DataClassViolation, ModelNotConfigured, type ModelRouter } from '../llm/router';
import { LlmCallFailed } from '../llm/gemini';

export interface RenderPrompts {
  version: string;
  system: string;
  styles: Record<string, { vi: string; prompt: string }>;
  watermark: string;
}

/** Ảnh khối là hình học đã giải, không mang dữ liệu nhận dạng — hạng 3 (config/models.yaml). */
export const MASSING_IMAGE_DATA_CLASS: DataClass = 3;
export const RENDER_ROUTE = 'layer5_render';

export interface RenderImageClient {
  /** Gọi mô hình sinh ảnh; trả về ảnh PNG/JPEG dạng base64 kèm mimeType. */
  generateImage(
    routeName: string,
    dataClass: DataClass,
    options: { system: string; prompt: string; image: { mimeType: string; dataBase64: string } },
  ): Promise<{ mimeType: string; dataBase64: string }>;
}

export type RenderOutcome =
  | { status: 'rendered'; mimeType: string; dataBase64: string; style: string; watermark: string }
  | { status: 'unavailable'; reason: string; style: string; watermark: string };

export function parseRenderPrompts(raw: unknown): RenderPrompts {
  const r = (raw ?? {}) as Partial<RenderPrompts>;
  if (!r.system || !r.styles || !r.watermark) {
    throw new Error('kb/render_prompts.yaml thiếu system, styles hoặc watermark.');
  }
  return {
    version: String(r.version ?? '0'),
    system: r.system,
    styles: r.styles,
    watermark: r.watermark,
  };
}

/** Tách data URL `data:image/png;base64,...` thành phần gửi cho mô hình. */
export function parseImageDataUrl(
  dataUrl: string,
): { mimeType: string; dataBase64: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1]!, dataBase64: match[2]! };
}

export async function renderFromMassing(args: {
  router: ModelRouter;
  client: RenderImageClient | undefined;
  prompts: RenderPrompts;
  image: { mimeType: string; dataBase64: string };
  style: string | null | undefined;
}): Promise<RenderOutcome> {
  const { prompts } = args;
  const styleKey = args.style && prompts.styles[args.style] ? args.style : 'hien_dai';
  const style = prompts.styles[styleKey];
  const base = { style: styleKey, watermark: prompts.watermark };
  if (!style)
    return { status: 'unavailable', reason: 'Chưa có lời dẫn cho phong cách này.', ...base };

  // Chính sách hạng dữ liệu kiểm trước, độc lập với việc tuyến có bật hay không.
  if (!args.router.allows(RENDER_ROUTE, MASSING_IMAGE_DATA_CLASS)) {
    return {
      status: 'unavailable',
      reason: 'Tuyến phối cảnh không được nhận ảnh khối theo chính sách hạng dữ liệu.',
      ...base,
    };
  }
  if (!args.client) {
    return {
      status: 'unavailable',
      reason: 'Chưa có khoá Gemini. Ảnh khối vẫn dùng được làm ảnh tham khảo.',
      ...base,
    };
  }
  try {
    const image = await args.client.generateImage(RENDER_ROUTE, MASSING_IMAGE_DATA_CLASS, {
      system: prompts.system,
      prompt: style.prompt,
      image: args.image,
    });
    return { status: 'rendered', ...image, ...base };
  } catch (error) {
    if (error instanceof ModelNotConfigured) {
      return {
        status: 'unavailable',
        reason:
          'Tuyến phối cảnh đang tắt — khoá Gemini gói miễn phí không có hạn mức sinh ảnh. Bật khi có khoá trả phí (config/models.yaml, layer5_render).',
        ...base,
      };
    }
    if (error instanceof DataClassViolation) {
      return { status: 'unavailable', reason: error.message, ...base };
    }
    if (error instanceof LlmCallFailed) {
      return {
        status: 'unavailable',
        reason: `Không dựng được ảnh lúc này: ${error.message} Ảnh khối vẫn dùng được làm ảnh tham khảo.`,
        ...base,
      };
    }
    throw error;
  }
}
