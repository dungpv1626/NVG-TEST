/**
 * Client gọi Gemini — lớp DUY NHẤT trong hệ thống chạm tới mạng của nhà cung cấp mô hình.
 *
 * Nguồn: doc/design/05-tech-stack.md mục 5.6.
 *
 * Ba việc lớp này làm, và vì sao gộp vào một chỗ:
 *
 *  1. **Không nhận tên mô hình.** Nó chỉ nhận TÊN BƯỚC (`layer2_program`,
 *     `kb_label_normalize`…) rồi hỏi `ModelRouter`. Không có tham số `model` nào để truyền
 *     vào — có tham số đó là có đường đi vòng qua lớp chặn hạng dữ liệu.
 *  2. **Đầu ra JSON luôn có lược đồ.** Gemini nhận `responseSchema` và tự ép cấu trúc; đó
 *     rẻ hơn nhiều so với việc phân tích văn bản tự do rồi sửa lỗi định dạng ở phía mình.
 *  3. **Phân loại lỗi.** 429 và 5xx đáng thử lại; 4xx còn lại là lỗi yêu cầu, thử lại vô ích.
 *     Workflow đọc đúng cờ `retryable` này để quyết định, nên phân loại sai ở đây là đốt bốn
 *     lượt thử vào một yêu cầu sai cấu trúc.
 */

import type { DataClass } from '@nvg/shared/design';
import type { ModelRouter, ResolvedRoute } from './router';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Lỗi phía nhà cung cấp mô hình. `retryable` quyết định Workflow có thử lại hay không. */
export class LlmCallFailed extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmCallFailed';
  }
}

/** Một ảnh gửi kèm lời gọi — nhị phân mã hoá base64, không tiền tố `data:`. */
export interface GenerateImagePart {
  mimeType: string;
  dataBase64: string;
}

export interface GenerateOptions {
  /** Chỉ dẫn hệ thống — vai trò và ràng buộc, KHÔNG chứa dữ liệu của lần gọi này. */
  system?: string;
  prompt: string;
  /** Lược đồ đầu ra. Gemini nhận tập con của JSON Schema (không có `$ref`, `oneOf`). */
  schema: Record<string, unknown>;
  /**
   * Nhiệt độ. Mặc định 0 vì gần như mọi bước của engine cần kết quả LẶP LẠI ĐƯỢC: cùng đầu
   * vào ra cùng artifact là ràng buộc của mục 8.8, và nhiệt độ cao phá thẳng vào đó.
   */
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Ảnh gửi kèm — bước đọc ảnh trích lục/sổ đỏ (`site_boundary_extract`) là lời gọi ĐẦU TIÊN
   * dùng trường này. Vắng mặt (mặc định) thì `parts` giống hệt trước khi có trường này, nên
   * mọi lời gọi chỉ-chữ hiện có không cần sửa gì.
   */
  images?: GenerateImagePart[];
}

export class GeminiClient {
  constructor(private readonly router: ModelRouter) {}

  /**
   * Gọi mô hình và trả về JSON đã phân tích.
   *
   * KHÔNG validate theo hợp đồng ở đây: hợp đồng nào áp cho đầu ra nào là việc của lớp gọi,
   * và gộp vào đây sẽ buộc client phải biết về `contracts/` — một phụ thuộc ngược.
   */
  async generateJson<T>(
    routeName: string,
    dataClass: DataClass,
    options: GenerateOptions,
  ): Promise<T> {
    const route = this.router.resolve(routeName, dataClass);

    const parts = [
      ...(options.images ?? []).map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.dataBase64 },
      })),
      { text: options.prompt },
    ];

    const body = {
      contents: [{ role: 'user', parts }],
      ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: options.schema,
        temperature: options.temperature ?? 0,
        maxOutputTokens: options.maxOutputTokens ?? 8192,
      },
    };

    const data = await this.call<GeminiGenerateResponse>(route, 'generateContent', body);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      // Hết token giữa chừng cũng rơi vào đây; nói rõ lý do thay vì "không đọc được".
      const reason = data.candidates?.[0]?.finishReason ?? 'không rõ';
      throw new LlmCallFailed(
        `Mô hình không trả về nội dung cho bước "${routeName}" (lý do: ${reason}).`,
        reason === 'MAX_TOKENS',
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        true,
      );
    }
  }

  /**
   * Sinh ẢNH từ ảnh + chữ (tuyến `layer5_render`). Mô hình sinh ảnh của Gemini trả ảnh trong
   * `inlineData` của một part; không có part ảnh nào thì là lỗi đọc được, không phải ảnh rỗng.
   */
  async generateImage(
    routeName: string,
    dataClass: DataClass,
    options: { system: string; prompt: string; image: GenerateImagePart },
  ): Promise<{ mimeType: string; dataBase64: string }> {
    const route = this.router.resolve(routeName, dataClass);
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: options.image.mimeType, data: options.image.dataBase64 } },
            { text: options.prompt },
          ],
        },
      ],
      systemInstruction: { parts: [{ text: options.system }] },
      generationConfig: { responseModalities: ['IMAGE'] },
    };
    const data = await this.call<GeminiGenerateResponse>(route, 'generateContent', body);
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const reason = data.candidates?.[0]?.finishReason ?? 'không rõ';
      throw new LlmCallFailed(
        `Mô hình không trả về ảnh cho bước "${routeName}" (lý do: ${reason}).`,
        false,
      );
    }
    return { mimeType: part.inlineData.mimeType ?? 'image/png', dataBase64: part.inlineData.data };
  }

  /**
   * Nhúng một đoạn văn bản thành vector.
   *
   * ⚠️ Tự chuẩn hoá về độ dài 1 SAU khi nhận. Mô hình trả vector đã chuẩn hoá ở số chiều mặc
   * định, nhưng khi cắt bớt chiều qua `outputDimensionality` thì KHÔNG chuẩn hoá lại (đo được
   * 29/08/2026: chuẩn 0,692 ở 1536 chiều). Cột `vector` trong Postgres so bằng khoảng cách
   * cosin, mà cosin thì bỏ qua độ dài — nên bỏ bước này KHÔNG làm kết quả sai ngay, nó chỉ
   * chờ tới ngày ai đó đổi sang tích vô hướng hoặc khoảng cách Euclid rồi mới sai âm thầm.
   */
  async embed(routeName: string, dataClass: DataClass, text: string): Promise<number[]> {
    const route = this.router.resolve(routeName, dataClass);
    if (!route.output_dimensions) {
      throw new LlmCallFailed(
        `Đầu ra "${routeName}" thiếu \`output_dimensions\` trong config/models.yaml — số chiều phải khớp bề rộng cột vector trong cơ sở dữ liệu.`,
        false,
      );
    }

    const data = await this.call<{ embedding?: { values?: number[] } }>(route, 'embedContent', {
      model: `models/${route.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: route.output_dimensions,
    });

    const values = data.embedding?.values;
    if (!Array.isArray(values) || values.length !== route.output_dimensions) {
      throw new LlmCallFailed(
        `Vector nhúng trả về ${values?.length ?? 0} chiều, cấu hình khai ${route.output_dimensions}.`,
        false,
      );
    }
    return normalise(values);
  }

  private async call<T>(
    route: ResolvedRoute,
    method: 'generateContent' | 'embedContent',
    body: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${API_ROOT}/${route.model}:${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': route.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new LlmCallFailed(
        `Không gọi được mô hình ngôn ngữ: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 429 = hết hạn mức trong khoảng thời gian, không phải yêu cầu sai → chờ rồi thử lại.
      const retryable = res.status === 429 || res.status >= 500;
      throw new LlmCallFailed(
        `Mô hình ngôn ngữ trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        retryable,
        res.status,
      );
    }
    return (await res.json()) as T;
  }
}

interface GeminiGenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
    finishReason?: string;
  }[];
}

/** Chuẩn hoá vector về độ dài 1. Vector toàn số 0 giữ nguyên — chia cho 0 sẽ ra NaN. */
export function normalise(values: number[]): number[] {
  const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return length > 0 ? values.map((v) => v / length) : values;
}
