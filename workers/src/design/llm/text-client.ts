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
