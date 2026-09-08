/**
 * Client Anthropic — văn bản có lược đồ qua Messages API. Anthropic KHÔNG sinh ảnh, nên
 * client này chỉ cài `TextModelClient`.
 *
 * Nhánh thiết kế bằng AI (T10–T13, 08/09/2026). Cùng khuôn với `gemini.ts`: KHÔNG nhận tên mô
 * hình, chỉ nhận TÊN TUYẾN rồi hỏi `ModelRouter`; khoá chỉ ở header `x-api-key`; không vòng thử
 * lại nội bộ. Gọi `fetch` thô thay vì kéo SDK vào Worker — SDK cầm khoá riêng và mở một đường
 * ra mạng không đi qua router, đúng thứ `router.ts` tồn tại để ngăn.
 *
 * Địa chỉ đọc từ `route.endpoint` (`https://api.anthropic.com/v1/messages`).
 *
 *  · Đầu ra có lược đồ: `output_config.format = {type: 'json_schema', schema}` (đường chính
 *    thức, kiểm 08/09/2026 trên tài liệu; PHẢI đo bằng lời gọi thật ở Đợt 1). Lược đồ cần
 *    `additionalProperties: false` và không nhận ràng buộc số/độ dài — xem `schema-dialect.ts`.
 *  · Ảnh vào là block `{type: 'image', source: {type: 'base64', media_type, data}}`.
 *  · `stop_reason === 'max_tokens'` → đáng thử lại với ngân sách lớn hơn; `'refusal'` → KHÔNG.
 *  · `usage.input_tokens/output_tokens` luôn có.
 */

import type { DataClass } from '@nvg/shared/design';
import { LlmCallFailed } from './gemini';
import type { ModelRouter, ResolvedRoute } from './router';
import { schemaFor } from './schema-dialect';
import {
  tokenCount,
  type StructuredCallOptions,
  type StructuredCallResult,
  type TextModelClient,
} from './text-client';

/** Phiên bản API — dữ liệu của giao thức, không phải tên mô hình; đổi hiếm và có chủ ý. */
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 180_000;

interface MessagesReply {
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

export class AnthropicClient implements TextModelClient {
  constructor(private readonly router: ModelRouter) {}

  async complete(
    routeName: string,
    dataClass: DataClass,
    options: StructuredCallOptions,
  ): Promise<StructuredCallResult> {
    const route = this.router.resolve(routeName, dataClass);
    if (!route.endpoint) {
      throw new LlmCallFailed(
        `Đầu ra "${routeName}" thiếu \`endpoint\` trong config/models.yaml.`,
        false,
      );
    }

    const content: unknown[] = (options.images ?? []).map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.dataBase64 },
    }));
    content.push({ type: 'text', text: options.prompt });

    const body: Record<string, unknown> = {
      model: route.model,
      max_tokens: options.maxOutputTokens ?? 16_384,
      system: options.system,
      messages: [{ role: 'user', content }],
      output_config: {
        format: { type: 'json_schema', schema: schemaFor('anthropic', options.schema) },
      },
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const started = Date.now();
    const reply = await this.call(route, body);
    const latencyMs = Date.now() - started;

    if (reply.stop_reason === 'refusal') {
      throw new LlmCallFailed(
        `Mô hình từ chối trả lời cho bước "${routeName}". Kiểm tra lại lời dẫn; thử lại không đổi được kết quả.`,
        false,
      );
    }
    const text = reply.content?.find((c) => c.type === 'text')?.text;
    if (typeof text !== 'string') {
      throw new LlmCallFailed(
        `Mô hình không trả về nội dung cho bước "${routeName}" (lý do: ${reply.stop_reason ?? 'không rõ'}).`,
        reply.stop_reason === 'max_tokens',
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        reply.stop_reason === 'max_tokens',
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

  private async call(route: ResolvedRoute, body: unknown): Promise<MessagesReply> {
    let res: Response;
    try {
      res = await fetch(route.endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': route.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
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
      // 429 (hết hạn mức tức thời) và 529 (quá tải) cùng 5xx đáng thử lại; 4xx còn lại thì không.
      const retryable = res.status === 429 || res.status >= 500;
      throw new LlmCallFailed(
        `Mô hình ngôn ngữ trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        retryable,
        res.status,
      );
    }
    return (await res.json()) as MessagesReply;
  }
}
