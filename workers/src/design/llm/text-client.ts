/**
 * Giao diện CHUNG cho mô hình văn bản và mô hình ảnh của nhánh thiết kế bằng AI (T10–T13,
 * 08/09/2026).
 *
 * Vì sao cần: tới 08/09/2026 mọi nơi gọi mô hình văn bản đều nhận kiểu cụ thể `GeminiClient`,
 * nên thêm OpenAI hay Anthropic là sửa từng nơi gọi. Nhánh AI mới cho người dùng CHỌN nhà cung
 * cấp ngay trên trang thiết kế, tức là cùng một đoạn mã phải gọi được cả ba — chỉ có một giao
 * diện chung mới làm được điều đó mà không rẽ nhánh `if (provider === …)` ở từng bước.
 *
 * Ba điều giữ nguyên từ `gemini.ts`, và là ranh giới của mọi client cài giao diện này:
 *
 *  1. KHÔNG nhận tên mô hình — chỉ nhận TÊN TUYẾN rồi hỏi `ModelRouter`. Không có tham số nào
 *     đi vòng qua lớp chặn hạng dữ liệu; khoá không bao giờ rời router.
 *  2. Đầu ra JSON luôn có lược đồ. Lược đồ đưa vào là bản ĐỘC LẬP nhà cung cấp (JSON Schema
 *     2020-12, có `$defs`/`$ref`); client tự đổi sang phương ngữ của mình bằng
 *     `schema-dialect.ts`, và KHÔNG validate hợp đồng — việc đó của lớp gọi.
 *  3. Phân loại lỗi bằng `LlmCallFailed.retryable`: 429 và 5xx đáng thử lại, còn lại thì không.
 */

import type { DataClass } from '@nvg/shared/design';
import type { GenerateImagePart } from './gemini';

export interface StructuredCallOptions {
  /** Chỉ dẫn hệ thống — vai trò và ràng buộc, KHÔNG chứa dữ liệu của lần gọi này. */
  system: string;
  prompt: string;
  /** Lược đồ đầu ra, phương ngữ ĐỘC LẬP nhà cung cấp. Client tự đổi. */
  schema: Record<string, unknown>;
  images?: GenerateImagePart[];
  maxOutputTokens?: number;
  /**
   * Nhiệt độ. Để trống thì client dùng mặc định của nhà cung cấp — mô hình suy luận thế hệ
   * mới của OpenAI và Anthropic từ chối tham số này, nên không tự điền 0 như `gemini.ts`.
   */
  temperature?: number;
  /**
   * Mức suy nghĩ kỹ sư chọn cho LƯỢT NÀY (13/09/2026) — thắng `reasoning_effort` /
   * `thinking_level` của tuyến. Vắng = dùng cấu hình tuyến. OpenAI đổi thành `reasoning.effort`,
   * Gemini 3 thành `thinkingLevel`; Anthropic chưa nhận (bỏ qua, màn hình nói ra).
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * Nhận tiến độ trong lúc mô hình đang trả lời. Có hàm này thì client NÀO đọc được luồng sẽ gọi
   * nhà cung cấp ở chế độ truyền luồng (hiện: OpenAI). Client không truyền luồng thì bỏ qua —
   * nơi gọi vẫn tự đếm thời gian.
   */
  onProgress?: (progress: CallProgress) => void;
  /** Huỷ lượt gọi đang chạy — nút «Dừng» của kỹ sư (13/09/2026). */
  signal?: AbortSignal;
}

export type ReasoningEffort = 'low' | 'medium' | 'high';

export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['low', 'medium', 'high'];

/**
 * Tiến độ một lượt gọi đang chạy. ⚠️ Số TOKEN chính xác chỉ có khi lượt gọi xong — nhà cung cấp
 * không báo giữa chừng, và OpenAI giấu hẳn phần nghĩ. Trong lúc chạy chỉ đếm được KÝ TỰ đã về.
 */
export interface CallProgress {
  /** `thinking` = chưa có chữ trả lời nào về; `writing` = đang nhận phần trả lời. */
  phase: 'thinking' | 'writing';
  /** Số ký tự phần trả lời (JSON) đã về. */
  outputChars: number;
  /**
   * Số ký tự phần suy nghĩ đã về — chỉ nhà cung cấp gửi bản TÓM TẮT suy nghĩ mới có (Claude với
   * `thinking.display: "summarized"`). OpenAI giấu hẳn phần nghĩ nên để trống.
   */
  thinkingChars?: number;
}

/** Số token đã dùng — `null` khi nhà cung cấp không trả về. Nguồn của cột chi phí. */
export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface StructuredCallResult {
  /** JSON đã phân tích, CHƯA validate hợp đồng. */
  json: unknown;
  provider: string;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface TextModelClient {
  complete(
    routeName: string,
    dataClass: DataClass,
    options: StructuredCallOptions,
  ): Promise<StructuredCallResult>;
}

export interface AiImageOptions {
  system: string;
  prompt: string;
  /** Ảnh vào — ảnh khối, tờ mặt bằng, ảnh trực giao… Rỗng chỉ với loại ảnh chữ → ảnh. */
  images: GenerateImagePart[];
  /**
   * Tín hiệu huỷ của nút «Dừng» (20/09/2026).
   *
   * Không có nó thì bấm Dừng giữa một lượt vẽ chỉ có tác dụng ở góc SAU — lượt đang bay vẫn chạy
   * hết bốn phút và vẫn tính tiền, trong khi màn hình đã nói «đang dừng». Thiếu đường này là lý do
   * bước Phối cảnh không có nút Dừng dùng được cho tới hôm nay.
   */
  signal?: AbortSignal;
}

export interface AiImageResult {
  mimeType: string;
  dataBase64: string;
  provider: string;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface AiImageClient {
  generateImage(
    routeName: string,
    dataClass: DataClass,
    options: AiImageOptions,
  ): Promise<AiImageResult>;
}

/** Đọc một con số từ phản hồi lỏng của nhà cung cấp; thiếu hay sai kiểu thì `null`. */
export function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Trần token đầu ra thực tế cho một lượt gọi — TUYẾN thắng nơi gọi.
 *
 * Một chỗ cho cả ba nhà cung cấp, vì bài học sinh ra nó là bài học chung: `maxOutputTokens` là
 * trần CHUNG cho token NGHĨ cộng token trả lời. Model nghĩ nhiều thì phần lớn ngân sách đi vào
 * phần nghĩ, JSON bị cắt giữa chừng, lượt gọi hỏng — và vẫn tính tiền đủ. Đo được hai lần trên
 * hai nhà cung cấp khác nhau:
 *
 *  · 11/09/2026 — `gemini-3.1-pro-preview` ở mức nghĩ mặc định tiêu 31.986/32.000 token rồi chỉ
 *    còn chỗ cho 2.113 ký tự JSON.
 *  · 13/09/2026 — `gpt-5` trên một biệt thự 26 phòng trả `status: incomplete` vì hết trần
 *    16.384, rồi lượt thử lại trả JSON cắt dở. Hai lượt tính tiền, không lượt nào dùng được.
 *
 * Trần ấy thuộc về TUYẾN chứ không thuộc nơi gọi: nơi gọi biết công việc cần bao nhiêu chữ,
 * nhưng chỉ tuyến mới biết model này nghĩ tốn bao nhiêu. `0` nghĩa là KHÔNG đặt trần — bỏ hẳn
 * trường khi gọi để nhà cung cấp dùng mức tối đa của model, dùng khi cần ĐO xem một bước thật
 * sự tiêu bao nhiêu.
 */
/**
 * Tín hiệu huỷ theo hạn chờ của tuyến. `request_timeout_s: 0` = KHÔNG đặt hạn (dùng khi đo —
 * tạm thời, 13/09/2026); vắng thì dùng hạn mặc định của client.
 */
export function requestTimeout(
  route: { request_timeout_s?: number },
  defaultMs: number,
  cancel?: AbortSignal,
): AbortSignal | undefined {
  const timeout =
    route.request_timeout_s === 0
      ? undefined
      : AbortSignal.timeout(
          route.request_timeout_s !== undefined ? route.request_timeout_s * 1000 : defaultMs,
        );
  if (!cancel) return timeout;
  if (!timeout) return cancel;
  return AbortSignal.any([timeout, cancel]);
}

export function outputBudget(
  routeCap: number | undefined,
  requested: number | undefined,
  fallback: number,
): number | null {
  if (routeCap === 0) return null;
  return routeCap ?? requested ?? fallback;
}
