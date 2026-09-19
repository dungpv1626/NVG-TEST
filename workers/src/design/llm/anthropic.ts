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

import { classifyHttpFault, classifyNetworkFault } from './provider-faults';
import type { DataClass } from '@nvg/shared/design';
import { LlmCallFailed } from './gemini';
import type { ModelRouter, ResolvedRoute } from './router';
import { schemaFor } from './schema-dialect';
import {
  outputBudget,
  requestTimeout,
  tokenCount,
  type StructuredCallOptions,
  type StructuredCallResult,
  type TextModelClient,
} from './text-client';

/** Câu cho người đọc khi hết ngân sách — nêu đúng chỗ vặn, giống `llm/openai.ts`. */
const BUDGET_ADVICE =
  'Mô hình chưa viết xong thì đã hết ngân sách chữ cho một lượt. Tăng `max_output_tokens` của tuyến trong config/models.yaml, hoặc chọn model nghĩ ít hơn.';

/**
 * Trần `max_tokens` lớn nhất Messages API nhận cho Claude 5 (Opus 5, Sonnet 5: 128K) — giới hạn của
 * nhà cung cấp, không phải ngưỡng thiết kế. Chỉ dùng khi tuyến khai `max_output_tokens: 0`.
 */
const CLAUDE_MAX_OUTPUT_TOKENS = 128_000;

/** Phiên bản API — dữ liệu của giao thức, không phải tên mô hình; đổi hiếm và có chủ ý. */
const ANTHROPIC_VERSION = '2023-06-01';
// Nâng từ 180 lên 300 giây ngày 12/09/2026, cùng lý do như `openai.ts`: biên 10% trên việc
// thật là quá sát, và một lượt huỷ vẫn bị nhà cung cấp tính tiền phần đã sinh.
const TIMEOUT_MS = 300_000;

/**
 * Ở chế độ truyền luồng thì xin bản TÓM TẮT suy nghĩ: Claude 5 mặc định `display: "omitted"` —
 * luồng im lặng suốt phần nghĩ, và màn hình không phân biệt được «đang nghĩ» với «treo». Tóm tắt
 * không đổi cách tính tiền (tài liệu Anthropic: nghĩ bao nhiêu tính bấy nhiêu, hiện hay không).
 */
const THINKING_SUMMARY = { thinking: { type: 'adaptive', display: 'summarized' } } as const;

interface StreamEvent {
  type?: string;
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  delta?: { type?: string; text?: string; thinking?: string; stop_reason?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

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
      // Trần token đầu ra: TUYẾN thắng nơi gọi (`outputBudget`). Claude bắt buộc có `max_tokens`
      // nên `0` — «không đặt trần» — nghĩa là mức TỐI ĐA của model khi truyền luồng. Không truyền
      // luồng thì giữ 16.384: yêu cầu thường mà viết cả trăm nghìn token sẽ hết giờ HTTP giữa chừng.
      // Trước 17/09/2026 `0` cũng thành 16.384, nên tuyến phải đặt tay 32.000 — và lượt Sonnet 5
      // lúc 07:44 bị cắt đúng ở đó (32.000 token ra, 0,335 USD, không dùng được).
      max_tokens:
        outputBudget(route.max_output_tokens, options.maxOutputTokens, 16_384) ??
        (options.onProgress ? CLAUDE_MAX_OUTPUT_TOKENS : 16_384),
      system: options.system,
      messages: [{ role: 'user', content }],
      output_config: {
        format: { type: 'json_schema', schema: schemaFor('anthropic', options.schema) },
      },
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    // Mức suy nghĩ (13/09/2026): Claude 5 nhận `output_config.effort` (low…max), mặc định `high`.
    // Trước ngày ấy ô chọn trên màn hình không tới được Claude — chọn gì cũng thành `high`.
    const effort = options.reasoningEffort ?? route.reasoning_effort;
    if (effort && effort !== 'minimal') {
      (body.output_config as Record<string, unknown>).effort = effort;
    }

    const started = Date.now();
    const reply = options.onProgress
      ? await this.stream(route, { ...body, stream: true, ...THINKING_SUMMARY }, options)
      : await this.call(route, body, options.signal);
    const latencyMs = Date.now() - started;

    // Số đo lấy NGAY khi có bản trả về, và mọi đường ném lỗi bên dưới mang nó theo — cùng lý lẽ
    // với `llm/openai.ts`: nhà cung cấp tính tiền theo token đã sinh, không theo việc ta đọc được
    // hay không, nên một dòng `failed` ghi 0 token là một khoản chi biến mất khỏi sổ.
    const usage = {
      inputTokens: tokenCount(reply.usage?.input_tokens),
      outputTokens: tokenCount(reply.usage?.output_tokens),
    };
    // Hết `max_tokens` là lỗi TẤT ĐỊNH: cùng ngân sách thì lượt sau cắt đúng chỗ ấy. Trước
    // 13/09/2026 chỗ này khai `retryable = (stop_reason === 'max_tokens')`, tức mua lần thứ hai
    // đúng cái vừa hỏng — đo được trên tuyến OpenAI hôm ấy, và Claude cũng đi đúng đường này.
    const cut = reply.stop_reason === 'max_tokens';

    if (reply.stop_reason === 'refusal') {
      throw new LlmCallFailed(
        `Mô hình từ chối trả lời cho bước "${routeName}". Kiểm tra lại lời dẫn; thử lại không đổi được kết quả.`,
        false,
        undefined,
        undefined,
        usage,
        latencyMs,
      );
    }
    const text = reply.content?.find((c) => c.type === 'text')?.text;
    if (typeof text !== 'string') {
      throw new LlmCallFailed(
        cut
          ? `Mô hình dùng hết ngân sách token đầu ra ở bước "${routeName}" nên bản trả về bị cắt dở.`
          : `Mô hình không trả về nội dung cho bước "${routeName}" (lý do: ${reply.stop_reason ?? 'không rõ'}).`,
        false,
        undefined,
        cut ? BUDGET_ADVICE : undefined,
        usage,
        latencyMs,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LlmCallFailed(
        cut
          ? `Mô hình dùng hết ngân sách token đầu ra ở bước "${routeName}" nên JSON bị cắt dở.`
          : `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        // Cắt dở thì thử lại vô ích; JSON hỏng trên một bản trả ĐỦ thì lượt sau có thể khác.
        !cut,
        undefined,
        cut ? BUDGET_ADVICE : undefined,
        usage,
        latencyMs,
      );
    }
    return {
      json,
      provider: route.provider,
      model: route.model,
      usage,
      latencyMs,
    };
  }

  /**
   * Gọi ở chế độ truyền luồng (SSE) để màn hình thấy lượt gọi đang tiến tới đâu.
   *
   * Claude gửi số token vào ở `message_start` và số token ra ở `message_delta` CUỐI luồng — giữa
   * chừng chỉ đếm được ký tự: phần tóm tắt suy nghĩ (`thinking_delta`, nhờ
   * `display: "summarized"`) và phần trả lời (`text_delta`). Bản trả về cuối được ghép lại đúng
   * hình `MessagesReply`, nên mọi phép kiểm phía sau dùng chung với đường không truyền luồng.
   */
  private async stream(
    route: ResolvedRoute,
    body: unknown,
    options: StructuredCallOptions,
  ): Promise<MessagesReply> {
    const onProgress = options.onProgress!;
    const sent = Date.now();
    const res = await this.post(route, body, options.signal);
    if (!res.body) {
      throw new LlmCallFailed('Mô hình ngôn ngữ không mở được luồng trả lời.', true);
    }
    onProgress({ phase: 'thinking', outputChars: 0, thinkingChars: 0 });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let thinkingChars = 0;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let stopReason: string | undefined;
    let ended = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut = buffer.indexOf('\n\n');
      while (cut >= 0) {
        const chunk = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf('\n\n');
        const data = chunk
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        if (!data) continue;
        let event: StreamEvent;
        try {
          event = JSON.parse(data) as StreamEvent;
        } catch {
          continue;
        }
        if (event.type === 'message_start') {
          inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
          outputTokens = event.message?.usage?.output_tokens ?? outputTokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
            text += event.delta.text;
            onProgress({ phase: 'writing', outputChars: text.length, thinkingChars });
          } else if (
            event.delta?.type === 'thinking_delta' &&
            typeof event.delta.thinking === 'string'
          ) {
            thinkingChars += event.delta.thinking.length;
            onProgress({ phase: 'thinking', outputChars: text.length, thinkingChars });
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason ?? stopReason;
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          inputTokens = event.usage?.input_tokens ?? inputTokens;
        } else if (event.type === 'message_stop') {
          ended = true;
        } else if (event.type === 'error') {
          throw new LlmCallFailed(
            `Mô hình ngôn ngữ báo lỗi giữa chừng: ${event.error?.message ?? 'không rõ'}`,
            true,
            undefined,
            undefined,
            { inputTokens: tokenCount(inputTokens), outputTokens: tokenCount(outputTokens) },
            Date.now() - sent,
          );
        }
      }
    }
    if (!ended && stopReason === undefined) {
      throw new LlmCallFailed(
        'Luồng trả lời của mô hình ngôn ngữ đóng mà không có bản trả về cuối cùng.',
        true,
        undefined,
        undefined,
        { inputTokens: tokenCount(inputTokens), outputTokens: tokenCount(outputTokens) },
        Date.now() - sent,
      );
    }
    return {
      content: [{ type: 'text', text }],
      ...(stopReason ? { stop_reason: stopReason } : {}),
      usage: {
        ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
        ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
      },
    };
  }

  private async call(
    route: ResolvedRoute,
    body: unknown,
    cancel?: AbortSignal,
  ): Promise<MessagesReply> {
    const res = await this.post(route, body, cancel);
    return (await res.json()) as MessagesReply;
  }

  /** Gửi lời gọi, phân loại lỗi mạng và lỗi HTTP — dùng chung cho hai đường. */
  private async post(route: ResolvedRoute, body: unknown, cancel?: AbortSignal): Promise<Response> {
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
        signal: requestTimeout(route, TIMEOUT_MS, cancel),
      });
    } catch (error) {
      const fault = classifyNetworkFault(error, 'mô hình ngôn ngữ');
      throw new LlmCallFailed(
        `Không gọi được mô hình ngôn ngữ: ${error instanceof Error ? error.message : String(error)}`,
        fault.retryable,
        undefined,
        fault.userMessage,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Phân loại dùng chung — xem `provider-faults.ts`. 529 (quá tải) rơi vào nhánh 5xx nên vẫn
      // đáng thử lại; còn 429 thì phải đọc THÂN phản hồi mới biết là «gọi quá nhanh» hay «hết
      // tiền» — Anthropic báo hết tiền bằng câu «credit balance is too low», cũng mã 429.
      const fault = classifyHttpFault(res.status, detail);
      // Người dùng chỉ thấy `userMessage`; nguyên văn nhà cung cấp phải còn ở nhật ký Worker, nếu
      // không một lỗi 400 «không hợp lệ» không có cách nào biết trường nào sai (17/09/2026).
      console.error(`[anthropic] ${route.model} ${res.status}: ${detail.slice(0, 1000)}`);
      throw new LlmCallFailed(
        `Mô hình ngôn ngữ trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        fault.retryable,
        res.status,
        fault.userMessage,
      );
    }
    return res;
  }
}
