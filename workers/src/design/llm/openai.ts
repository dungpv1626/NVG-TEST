/**
 * Client OpenAI — văn bản có lược đồ (Responses API) và sinh ảnh (`/v1/images/edits`).
 *
 * Nhánh thiết kế bằng AI (T10–T13, 08/09/2026). Cùng khuôn với `gemini.ts` và
 * `pollinations.ts`: KHÔNG nhận tên mô hình, chỉ nhận TÊN TUYẾN rồi hỏi `ModelRouter`; khoá
 * chỉ nằm ở header; không có vòng thử lại nội bộ — Workflow đọc cờ `retryable`.
 *
 * Địa chỉ HTTP đọc từ `route.endpoint` trong `config/models.yaml` (tuyến văn bản và tuyến ảnh
 * là hai địa chỉ khác nhau), không có gốc URL nào viết trong mã — cùng lý do với Pollinations.
 *
 * Đo bằng lời gọi thật trước khi tin bất kỳ chi tiết nào dưới đây; chỗ nào chưa đo thì ghi rõ.
 *
 *  · Văn bản: `POST /v1/responses` với `text.format = {type: 'json_schema', strict: true}`.
 *    Phản hồi có `output[]`; phần chữ nằm ở `output[].content[].type === 'output_text'`.
 *    Mô hình từ chối trả về `type: 'refusal'` — đó là lỗi KHÔNG thử lại, câu riêng.
 *    `status: 'incomplete'` với lý do `max_output_tokens` — đáng thử lại với ngân sách lớn hơn.
 *  · Ảnh: `POST /v1/images/edits` multipart, trường `image[]` nhận NHIỀU ảnh vào (ảnh khối +
 *    tờ mặt bằng), `prompt`, `model`. Phản hồi `data[0].b64_json`, không khai kiểu tệp →
 *    `sniffMime`. Mô hình `gpt-image-*` trả `usage.input_tokens/output_tokens`.
 *  · Không gửi `temperature` trừ khi lớp gọi khai: mô hình suy luận từ chối tham số này.
 */

import { classifyHttpFault, classifyNetworkFault } from './provider-faults';
import type { DataClass } from '@nvg/shared/design';
import { LlmCallFailed, type GenerateImagePart } from './gemini';
import { ALLOWED_IMAGE_INPUT, decodeBase64, extensionFor, sniffMime } from './image-bytes';
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

interface ResponsesReply {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: {
    type?: string;
    content?: { type?: string; text?: string; refusal?: string }[];
  }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

interface ImagesReply {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

// Hạn chờ lời gọi VĂN BẢN. Nâng từ 180 lên 300 giây ngày 12/09/2026: việc thật đo được
// 154,7 s và 163,9 s, tức biên chỉ 10% — và lượt `adbc2867` huỷ ở đúng giây 180 hai lần liền.
// Trần trên là hạn của BƯỚC Workflow (`MODEL_STEP.timeout`, xem `workflows/ai-design.ts`): một
// lượt 300 s cộng một lượt thử lại vẫn phải nằm trong hạn ấy.
const TEXT_TIMEOUT_MS = 300_000;
const IMAGE_TIMEOUT_MS = 240_000;

export class OpenAiClient implements TextModelClient, AiImageClient {
  constructor(private readonly router: ModelRouter) {}

  async complete(
    routeName: string,
    dataClass: DataClass,
    options: StructuredCallOptions,
  ): Promise<StructuredCallResult> {
    const route = this.router.resolve(routeName, dataClass);
    const endpoint = requireEndpoint(route, routeName);

    const content: unknown[] = (options.images ?? []).map((img) => ({
      type: 'input_image',
      image_url: `data:${img.mimeType};base64,${img.dataBase64}`,
      detail: 'high',
    }));
    content.push({ type: 'input_text', text: options.prompt });

    const body: Record<string, unknown> = {
      model: route.model,
      instructions: options.system,
      input: [{ role: 'user', content }],
      text: {
        format: {
          type: 'json_schema',
          name: 'nvg_design_output',
          strict: true,
          schema: schemaFor('openai', options.schema),
        },
      },
      max_output_tokens: options.maxOutputTokens ?? 16_384,
      // Không giữ lại nội dung lời gọi phía nhà cung cấp lâu hơn cần thiết (T12).
      store: false,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const started = Date.now();
    const reply = await this.call<ResponsesReply>(endpoint, route, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: TEXT_TIMEOUT_MS,
      what: 'mô hình ngôn ngữ',
    });
    const latencyMs = Date.now() - started;

    const message = reply.output?.find((o) => o.type === 'message');
    const refusal = message?.content?.find((c) => c.type === 'refusal');
    if (refusal) {
      throw new LlmCallFailed(
        `Mô hình từ chối trả lời cho bước "${routeName}". Kiểm tra lại lời dẫn; thử lại không đổi được kết quả.`,
        false,
      );
    }
    const text = message?.content?.find((c) => c.type === 'output_text')?.text;
    if (typeof text !== 'string') {
      const cut = reply.incomplete_details?.reason === 'max_output_tokens';
      throw new LlmCallFailed(
        `Mô hình không trả về nội dung cho bước "${routeName}" (trạng thái: ${reply.status ?? 'không rõ'}).`,
        cut,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        true,
      );
    }
    return {
      json,
      provider: route.provider,
      model: route.model,
      usage: {
        inputTokens: tokenCount(reply.usage?.input_tokens),
        outputTokens: tokenCount(reply.usage?.output_tokens),
      },
      latencyMs,
    };
  }

  async generateImage(
    routeName: string,
    dataClass: DataClass,
    options: AiImageOptions,
  ): Promise<AiImageResult> {
    const route = this.router.resolve(routeName, dataClass);
    for (const img of options.images) {
      if (!ALLOWED_IMAGE_INPUT.has(img.mimeType)) {
        throw new LlmCallFailed(
          `Ảnh vào có kiểu tệp không gửi được: ${img.mimeType}. Nhận PNG, JPEG hoặc WebP.`,
          false,
        );
      }
    }
    const prompt = `${options.system}\n\n${options.prompt}`.trim();
    if (!prompt) throw new LlmCallFailed(`Đầu ra "${routeName}" gọi với lời dẫn rỗng.`, false);

    // ── Hai đường khác hẳn nhau, và chọn nhầm là lỗi 400 chỉ lộ ra sau khi đã trả tiền ──
    //
    // OpenAI tách sinh ảnh làm hai đầu ra: `/v1/images/generations` nhận JSON và KHÔNG nhận
    // ảnh vào; `/v1/images/edits` nhận multipart và BẮT BUỘC có ít nhất một ảnh vào. Cho tới
    // 10/09/2026 tệp này luôn gửi multipart, nên đường CHỮ → ẢNH — đường mà tờ mặt bằng của
    // T21 đi, vì nó cố ý không có ảnh neo — gửi đi một biểu mẫu không có phần `image[]` nào và
    // nhận về 400.
    const started = Date.now();
    const noInputImages = options.images.length === 0;
    const endpoint = noInputImages
      ? requireEndpoint(route, routeName)
      : requireEditEndpoint(route, routeName);

    let reply: ImagesReply;
    if (noInputImages) {
      reply = await this.call<ImagesReply>(endpoint, route, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: route.model, prompt, n: 1 }),
        timeoutMs: IMAGE_TIMEOUT_MS,
        what: 'dịch vụ sinh ảnh',
      });
    } else {
      const form = new FormData();
      form.set('model', route.model);
      form.set('prompt', prompt);
      options.images.forEach((img, i) => {
        form.append(
          'image[]',
          new Blob([decodeBase64(img.dataBase64)], { type: img.mimeType }),
          `input-${i + 1}.${extensionFor(img.mimeType)}`,
        );
      });
      // KHÔNG tự đặt `Content-Type`: ranh giới multipart do runtime sinh, đặt tay là hỏng.
      reply = await this.call<ImagesReply>(endpoint, route, {
        headers: {},
        body: form,
        timeoutMs: IMAGE_TIMEOUT_MS,
        what: 'dịch vụ sinh ảnh',
      });
    }

    const b64 = reply.data?.[0]?.b64_json;
    if (!b64) {
      throw new LlmCallFailed(
        `Đầu ra "${routeName}" không trả về ảnh. Phản hồi có các khoá: ${Object.keys(reply).join(', ') || 'rỗng'}.`,
        false,
      );
    }
    return {
      mimeType: sniffMime(b64),
      dataBase64: b64,
      provider: route.provider,
      model: route.model,
      usage: {
        inputTokens: tokenCount(reply.usage?.input_tokens),
        outputTokens: tokenCount(reply.usage?.output_tokens),
      },
      latencyMs: Date.now() - started,
    };
  }

  private async call<T>(
    endpoint: string,
    route: ResolvedRoute,
    init: { headers: Record<string, string>; body: BodyInit; timeoutMs: number; what: string },
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...init.headers, Authorization: `Bearer ${route.apiKey}` },
        body: init.body,
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      const fault = classifyNetworkFault(error, init.what);
      throw new LlmCallFailed(
        `Không gọi được ${init.what}: ${error instanceof Error ? error.message : String(error)}`,
        fault.retryable,
        undefined,
        fault.userMessage,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const fault = classifyHttpFault(res.status, detail);
      throw new LlmCallFailed(
        `${init.what[0]!.toUpperCase()}${init.what.slice(1)} trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        fault.retryable,
        res.status,
        fault.userMessage,
      );
    }
    return (await res.json()) as T;
  }
}

/**
 * Địa chỉ ẢNH → ẢNH. Rơi về `endpoint` khi cấu hình chưa khai, để tuyến cũ không vỡ.
 *
 * Rơi về chứ không ném: trước 10/09/2026 mọi tuyến ảnh chỉ có một `endpoint` và nó trỏ thẳng
 * `/v1/images/edits`. Một cấu hình cũ vẫn phải chạy đúng như trước.
 */
function requireEditEndpoint(route: ResolvedRoute, routeName: string): string {
  return route.endpoint_edit ?? requireEndpoint(route, routeName);
}

function requireEndpoint(route: ResolvedRoute, routeName: string): string {
  if (!route.endpoint) {
    throw new LlmCallFailed(
      `Đầu ra "${routeName}" thiếu \`endpoint\` trong config/models.yaml.`,
      false,
    );
  }
  return route.endpoint;
}
