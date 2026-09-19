/**
 * Lớp 5 — phối cảnh tham khảo từ ẢNH KHỐI (TK-16), tuyến `layer5_render`.
 *
 * Hai tầng (14-phuong-an-demo 14.5, Q-15): ảnh khối chụp từ trình xem ba chiều LUÔN có; ảnh
 * dựng bằng mô hình sinh ảnh chỉ khi tuyến bật và có khoá. Tuyến tắt hay hết hạn mức thì trả
 * về trạng thái đọc được, KHÔNG phải lỗi — tính năng AI là phụ trợ, không chặn luồng chính
 * (PRD 5.1).
 *
 * KHÔNG nhắc tên nhà cung cấp trong mã này: nhà cung cấp là DỮ LIỆU (`provider` của tuyến
 * `layer5_render` trong config/models.yaml), và tuyến này đã đổi nhà cung cấp hai lần rồi.
 * Câu chữ nào gọi đích danh một hãng là câu chữ sẽ nói dối vào lần đổi thứ ba.
 *
 * Lời dẫn và nhãn cảnh báo là DỮ LIỆU ở `kb/render_prompts.yaml`. Nhãn do mã chèn lên ảnh ở
 * phía hiển thị (`render-panel.tsx`), và `watermark_applied` chỉ được đặt `true` sau bước đó.
 */

import type { DataClass } from '@nvg/shared/design';
import { DataClassViolation, ModelNotConfigured, type ModelRouter } from '../llm/router';
import { LlmCallFailed } from '../llm/gemini';

export interface RenderView {
  /** Mã khung hình, dùng cả ở giao diện lẫn thân yêu cầu. */
  id: string;
  /** Nhãn tiếng Việt hiện trên màn hình. */
  vi: string;
  /**
   * Ảnh khối chụp từ góc nào. Bộ từ vựng lấy đúng `camera` của
   * `contracts/render-request.schema.json` — không đặt bộ thứ hai.
   */
  camera: string;
  /** Phần lời dẫn riêng của khung hình: ánh sáng, thời điểm trong ngày, hướng nhìn. */
  prompt: string;
}

/** Từ vựng dựng câu ngữ cảnh thửa đất. Xem chú thích trong `kb/render_prompts.yaml`. */
export interface RenderContextVocabulary {
  building_type: Record<string, string>;
  sides: Record<string, string>;
  adjacent: Record<string, string>;
  single_frontage: string;
  extra_frontage: string;
}

export interface RenderPrompts {
  version: string;
  system: string;
  styles: Record<string, { vi: string; prompt: string }>;
  views: RenderView[];
  context: RenderContextVocabulary;
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
  | {
      status: 'rendered';
      mimeType: string;
      dataBase64: string;
      style: string;
      view: string;
      watermark: string;
    }
  | { status: 'unavailable'; reason: string; style: string; view: string; watermark: string };

export function parseRenderPrompts(raw: unknown): RenderPrompts {
  const r = (raw ?? {}) as Partial<RenderPrompts>;
  if (!r.system || !r.styles || !r.watermark || !r.views?.length || !r.context) {
    throw new Error('kb/render_prompts.yaml thiếu system, styles, views, context hoặc watermark.');
  }
  return {
    version: String(r.version ?? '0'),
    system: r.system,
    styles: r.styles,
    views: r.views,
    context: r.context,
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

/**
 * Phần đầu bài mà tuyến phối cảnh đọc được — và ĐỌC ĐƯỢC ĐÚNG NGẦN NÀY.
 *
 * Kiểu hẹp có chủ đích, không nhận nguyên `DesignBrief`: mọi trường ở đây đều là con số hình
 * học hoặc mã danh mục, không có một chữ nào do khách viết. Đó là thứ giữ lời gọi ở hạng dữ
 * liệu 3 (config/models.yaml). Nhận cả đầu bài thì chỉ cần một lần ai đó nhét `notes` vào lời
 * dẫn là dữ liệu hạng 1 ra thẳng dịch vụ ngoài mà không ai nhận ra.
 */
export interface RenderSite {
  building_type?: string | null;
  floors?: number | null;
  site?: {
    width_m?: number | null;
    depth_m?: number | null;
    adjacent?: Record<string, string | null>;
    access_sides?: string[];
  } | null;
}

/**
 * Câu ngữ cảnh gửi kèm ảnh khối — dựng TẤT ĐỊNH từ đầu bài, không hỏi mô hình ngôn ngữ.
 *
 * Vì sao cần: ảnh khối là một khối đứng một mình trên nền lưới. Mô hình không có cách nào biết
 * hai bên đã có nhà xây sát, nên nó mặc định dựng công trình đứng tự do — và thường cho nó hai
 * mặt tiền, tức biến nhà phố kẹp giữa thành lô góc.
 *
 * `openFaces` là danh sách mặt thoáng do `siteFaces()` tính từ `kb/site_context.yaml` — dùng
 * lại đúng phép tra bảng mà bộ giải đã dùng, không cài lần thứ hai ở đây.
 */
export function describeSite(
  brief: RenderSite | null | undefined,
  openFaces: readonly string[],
  vocabulary: RenderContextVocabulary,
): string {
  const parts: string[] = [];

  const kind = brief?.building_type ? vocabulary.building_type[brief.building_type] : undefined;
  const width = brief?.site?.width_m;
  const depth = brief?.site?.depth_m;
  const size =
    typeof width === 'number' && typeof depth === 'number'
      ? `, on a plot ${width.toFixed(1)} m wide and ${depth.toFixed(1)} m deep`
      : '';
  const floors = typeof brief?.floors === 'number' ? `, ${brief.floors} storeys` : '';
  if (kind) parts.push(`The building is ${kind}${size}${floors}.`);

  // Chỉ mô tả mặt nào ĐÃ KHAI hiện trạng. Mặt bỏ trống thì im lặng — bịa ra "vacant plot" cho
  // một mặt chưa ai điền là đưa thông tin sai vào ảnh mà không có gì báo.
  for (const [face, label] of Object.entries(vocabulary.sides)) {
    const code = brief?.site?.adjacent?.[face];
    const phrase = code ? vocabulary.adjacent[code] : undefined;
    if (phrase) parts.push(`${label} ${phrase}.`);
  }

  // Hai mặt bên đều bị che = nhà phố kẹp giữa. Đây là câu vá lỗi "hai mặt tiền".
  const sidesClosed = !openFaces.includes('left') && !openFaces.includes('right');
  parts.push(sidesClosed ? vocabulary.single_frontage : vocabulary.extra_frontage);
  return parts.join(' ');
}

export async function renderFromMassing(args: {
  router: ModelRouter;
  client: RenderImageClient | undefined;
  prompts: RenderPrompts;
  image: { mimeType: string; dataBase64: string };
  style: string | null | undefined;
  /** Mã khung hình (`views[].id`). Thiếu hoặc không có thật thì lấy khung hình đầu tiên. */
  view?: string | null;
  /** Câu ngữ cảnh thửa đất do `describeSite()` dựng. Vắng mặt thì lời dẫn không có vế này. */
  siteContext?: string | null;
}): Promise<RenderOutcome> {
  const { prompts } = args;
  const styleKey = args.style && prompts.styles[args.style] ? args.style : 'hien_dai';
  const style = prompts.styles[styleKey];
  const view = prompts.views.find((v) => v.id === args.view) ?? prompts.views[0]!;
  const base = { style: styleKey, view: view.id, watermark: prompts.watermark };
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
      reason: 'Chưa cấu hình dịch vụ dựng ảnh. Ảnh khối vẫn dùng được làm ảnh tham khảo.',
      ...base,
    };
  }
  try {
    // Thứ tự có chủ đích: ràng buộc chung → ngữ cảnh thửa đất → phong cách → ánh sáng khung
    // hình. Phần nào đứng sau thì mô hình bám yếu hơn, nên hai vế "giữ nguyên khối" và "chỉ
    // một mặt tiền" phải nằm trên cùng.
    const prompt = [args.siteContext, style.prompt, view.prompt]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ');
    const image = await args.client.generateImage(RENDER_ROUTE, MASSING_IMAGE_DATA_CLASS, {
      system: prompts.system,
      prompt,
      image: args.image,
    });
    return { status: 'rendered', ...image, ...base };
  } catch (error) {
    if (error instanceof ModelNotConfigured || error instanceof LlmCallFailed) {
      // Chi tiết kỹ thuật CHỈ vào log, không ra màn hình (CGD 5.5 — không hiện mã HTTP hay
      // chữ nguyên văn của nhà cung cấp). Đo được 06/09/2026: lỗi 402 của Hugging Face trả
      // về một câu tiếng Anh về việc mua thêm tín dụng — thứ mà kiến trúc sư vừa không đọc
      // được vừa không xử lý được.
      console.error(`[${RENDER_ROUTE}] ${error.message}`);
      return { status: 'unavailable', reason: readableReason(error), ...base };
    }
    if (error instanceof DataClassViolation) {
      return { status: 'unavailable', reason: error.message, ...base };
    }
    throw error;
  }
}

/**
 * Câu tiếng Việt cho người dùng, theo mẫu `[việc gì không làm được] + [vì sao / ai xử lý được]`
 * (CGD 5.5). Ba tình huống đo được, phân biệt vì cách xử lý của chúng khác hẳn nhau.
 */
const TAIL = 'Ảnh khối vẫn dùng được làm ảnh tham khảo.';

function readableReason(error: ModelNotConfigured | LlmCallFailed): string {
  if (error instanceof ModelNotConfigured) {
    return `Chưa dựng được ảnh phối cảnh: dịch vụ dựng ảnh chưa được cấu hình. Quản trị hệ thống bật lại trong cấu hình mô hình. ${TAIL}`;
  }
  if (error.status === 401) {
    return `Chưa dựng được ảnh phối cảnh: khoá của dịch vụ dựng ảnh không còn hiệu lực. Quản trị hệ thống cấp lại khoá. ${TAIL}`;
  }
  if (error.status === 402 || error.status === 403) {
    return `Chưa dựng được ảnh phối cảnh: tài khoản dịch vụ dựng ảnh đã hết hạn mức. Quản trị hệ thống nạp thêm hạn mức. ${TAIL}`;
  }
  if (error.retryable) {
    return `Chưa dựng được ảnh phối cảnh: dịch vụ đang quá tải. Thử lại sau ít phút. ${TAIL}`;
  }
  return `Chưa dựng được ảnh phối cảnh. Báo Quản trị hệ thống nếu lặp lại. ${TAIL}`;
}
