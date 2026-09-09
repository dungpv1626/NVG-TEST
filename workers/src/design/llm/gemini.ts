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
import { schemaFor } from './schema-dialect';
import {
  tokenCount,
  type AiImageClient,
  type AiImageOptions,
  type AiImageResult,
  type StructuredCallOptions,
  type StructuredCallResult,
  type TextModelClient,
} from './text-client';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Lỗi phía nhà cung cấp mô hình. `retryable` quyết định Workflow có thử lại hay không. */
export class LlmCallFailed extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    /**
     * Câu dành cho NGƯỜI DÙNG khi `message` mang chi tiết kỹ thuật của nhà cung cấp. Vắng thì
     * `designApp.onError` tự chọn: lỗi do client tự chẩn (không có mã HTTP, không thử lại —
     * từ chối, không ra ảnh, lời dẫn rỗng…) đã là câu tiếng Việt sạch nên hiện nguyên;
     * còn lại dùng câu chung.
     */
    readonly userMessage?: string,
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

/**
 * Hạn chờ một lượt gọi.
 *
 * 120 giây là đủ cho mọi bước cũ (chuẩn hoá nhãn, ý đồ bố cục, mô tả mặt tiền — vài trăm token
 * đầu ra). KHÔNG đủ cho bước mô hình tự vẽ tờ mặt bằng: đo 09/09/2026, Gemini Flash vẽ nhà ba
 * tầng vượt 122 giây và bị chính mình cắt ngang — mất trọn lượt gọi đã tính tiền mà không thu
 * được gì. 500 giây là mức Haan chốt (09/09/2026) sau lần hỏng đó.
 *
 * ⚠️ Hạn này dài tới mức người dùng sẽ tưởng trang treo. Đó là lý do bước vẽ cần chạy nền
 * (Đợt 5), không phải lý do để rút ngắn hạn và nhận về lỗi hết giờ.
 */
const TIMEOUT_MS = 500_000;

export class GeminiClient implements TextModelClient, AiImageClient {
  constructor(private readonly router: ModelRouter) {}

  /**
   * Giao diện chung của nhánh AI (`text-client.ts`): nhận lược đồ ĐỘC LẬP nhà cung cấp và tự
   * đổi sang phương ngữ `responseSchema`; trả kèm số token để ghi chi phí.
   *
   * `generateJson` ở dưới giữ nguyên chữ ký cho năm nơi gọi cũ — chúng đã viết lược đồ theo
   * phương ngữ Gemini từ đầu, nên không đi qua bộ đổi.
   */
  async complete(
    routeName: string,
    dataClass: DataClass,
    options: StructuredCallOptions,
  ): Promise<StructuredCallResult> {
    const route = this.router.resolve(routeName, dataClass);
    const started = Date.now();
    const { data, text } = await this.structured(route, routeName, {
      ...options,
      schema: schemaFor('gemini', options.schema),
    });
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Nói VÌ SAO, không chỉ "không hợp lệ". Nguyên nhân thường gặp nhất là hết ngân sách token
      // giữa chừng: mô hình trả về một chuỗi JSON bị cắt cụt, và câu lỗi chung khiến người đọc
      // đi tìm lỗi ở lược đồ. `finishReason` cùng số token đã dùng trả lời ngay chỗ đó.
      const usage = geminiUsage(data);
      const reason = data.candidates?.[0]?.finishReason ?? 'không rõ';
      const truncated = reason === 'MAX_TOKENS';
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}" ` +
          `(lý do dừng: ${reason}; đã sinh ${usage.outputTokens ?? '?'} token, ` +
          `dài ${text.length} ký tự).` +
          (truncated
            ? ' Kết quả bị cắt vì hết ngân sách token — tăng `maxOutputTokens` hoặc yêu cầu nội dung ngắn hơn.'
            : ''),
        true,
      );
    }
    return {
      json,
      provider: route.provider,
      model: route.model,
      usage: geminiUsage(data),
      latencyMs: Date.now() - started,
    };
  }

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
    const { text } = await this.structured(route, routeName, options);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        true,
      );
    }
  }

  /** Phần chung của `generateJson` và `complete`: dựng lời gọi, đọc phần chữ trả về. */
  private async structured(
    route: ResolvedRoute,
    routeName: string,
    options: GenerateOptions,
  ): Promise<{ data: GeminiGenerateResponse; text: string }> {
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
    // Dòng Gemini 3 chèn phần suy nghĩ vào `parts`; phần đó có thể KHÔNG mang `text`. Lấy cứng
    // `parts[0]` thì gặp hôm nào mô hình tách phần suy nghĩ ra sẽ đọc thành "không có nội dung".
    const text = data.candidates?.[0]?.content?.parts?.find(
      (p) => typeof p.text === 'string',
    )?.text;
    if (typeof text !== 'string') {
      // Hết token giữa chừng cũng rơi vào đây; nói rõ lý do thay vì "không đọc được".
      const reason = data.candidates?.[0]?.finishReason ?? 'không rõ';
      throw new LlmCallFailed(
        `Mô hình không trả về nội dung cho bước "${routeName}" (lý do: ${reason}).`,
        reason === 'MAX_TOKENS',
      );
    }
    return { data, text };
  }

  /**
   * Sinh ẢNH từ ảnh + chữ (tuyến `layer5_render`). Mô hình sinh ảnh của Gemini trả ảnh trong
   * `inlineData` của một part; không có part ảnh nào thì là lỗi đọc được, không phải ảnh rỗng.
   */
  async generateImage(
    routeName: string,
    dataClass: DataClass,
    options: { system: string; prompt: string; image: GenerateImagePart } | AiImageOptions,
  ): Promise<AiImageResult> {
    const route = this.router.resolve(routeName, dataClass);
    // Hai hình dạng đầu vào: `image` (tuyến phối cảnh cũ, một ảnh khối) và `images[]` (nhánh
    // AI, nhiều ảnh vào). Cùng một lời gọi — chỉ khác số part ảnh.
    const images = 'images' in options ? options.images : [options.image];
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            ...images.map((img) => ({
              inlineData: { mimeType: img.mimeType, data: img.dataBase64 },
            })),
            { text: options.prompt },
          ],
        },
      ],
      systemInstruction: { parts: [{ text: options.system }] },
      generationConfig: { responseModalities: ['IMAGE'] },
    };
    const started = Date.now();
    const data = await this.call<GeminiGenerateResponse>(route, 'generateContent', body);
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const reason = data.candidates?.[0]?.finishReason ?? 'không rõ';
      throw new LlmCallFailed(
        `Mô hình không trả về ảnh cho bước "${routeName}" (lý do: ${reason}).`,
        false,
      );
    }
    return {
      mimeType: part.inlineData.mimeType ?? 'image/png',
      dataBase64: part.inlineData.data,
      provider: route.provider,
      model: route.model,
      usage: geminiUsage(data),
      latencyMs: Date.now() - started,
    };
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
        signal: AbortSignal.timeout(TIMEOUT_MS),
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
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /** Token SUY LUẬN của Gemini 2.5+ — tính giá như token ra, nên phải cộng vào chi phí. */
    thoughtsTokenCount?: number;
  };
}

function geminiUsage(data: GeminiGenerateResponse): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const out = tokenCount(data.usageMetadata?.candidatesTokenCount);
  const thoughts = tokenCount(data.usageMetadata?.thoughtsTokenCount) ?? 0;
  return {
    inputTokens: tokenCount(data.usageMetadata?.promptTokenCount),
    outputTokens: out === null ? null : out + thoughts,
  };
}

/** Chuẩn hoá vector về độ dài 1. Vector toàn số 0 giữ nguyên — chia cho 0 sẽ ra NaN. */
export function normalise(values: number[]): number[] {
  const length = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return length > 0 ? values.map((v) => v / length) : values;
}
