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
import { LlmCallFailed } from './gemini';
import { ALLOWED_IMAGE_INPUT, decodeBase64, extensionFor, sniffMime } from './image-bytes';
import type { ModelRouter, ResolvedRoute } from './router';
import { schemaFor } from './schema-dialect';
import {
  outputBudget,
  requestTimeout,
  tokenCount,
  type AiImageClient,
  type AiImageOptions,
  type AiImageResult,
  type StructuredCallOptions,
  type StructuredCallResult,
  type TextModelClient,
  type TokenUsage,
} from './text-client';

interface ResponsesReply {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: {
    type?: string;
    content?: { type?: string; text?: string; refusal?: string }[];
  }[];
  /**
   * `output_tokens` ĐÃ BAO GỒM token suy nghĩ — nhà cung cấp tính tiền cả hai như nhau. Phần
   * tách nằm ở `output_tokens_details.reasoning_tokens`, và nó là con số duy nhất trả lời được
   * câu «lượt gọi này nghĩ hết bao nhiêu, viết được bao nhiêu».
   */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
}

interface ImagesReply {
  data?: { b64_json?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

// Hạn chờ lời gọi VĂN BẢN.
//
// 180 → 300 giây (12/09/2026): việc thật đo được 154,7 s và 163,9 s, biên chỉ 10%.
//
// 300 → 1.200 → **600 giây** (13/09/2026). 1.200 là mức ĐẶT TẠM cho một lượt đo cả-nhà-một-lượt;
// lượt ấy đo được 302,9 s và 381,6 s, trong đó 90–93% token đầu ra là phần suy nghĩ. Từ T38 mỗi lượt
// gọi chỉ xếp MỘT TẦNG và trả về một cây vài trăm token, nên 600 giây là gấp hơn ba lần lượt chậm
// nhất từng đo trên một việc lớn hơn nhiều — đủ chỗ thở mà không để một lượt treo giữ bước 20 phút.
//
// Trần trên là hạn của BƯỚC Workflow (`MODEL_STEP.timeout`, xem `workflows/ai-design.ts`): mọi
// lần thử cộng lại vẫn phải nằm trong hạn ấy — có phép thử canh quan hệ này.
const TEXT_TIMEOUT_MS = 600_000;
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

    const budget = outputBudget(route.max_output_tokens, options.maxOutputTokens, 16_384);
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
      // Trần token đầu ra: TUYẾN thắng nơi gọi, và `0` nghĩa là không đặt trần. Trước
      // 13/09/2026 chỗ này là hằng số 16.384 chôn trong mã, trong khi `max_output_tokens` của
      // tuyến đã có trong `config/models.yaml` và Gemini đã đọc nó — tức cấu hình khai ra mà
      // OpenAI lặng lẽ bỏ qua. Xem `outputBudget` để biết vì sao con số này thuộc về tuyến.
      ...(budget === null ? {} : { max_output_tokens: budget }),
      // Mức suy nghĩ, và nó CHỈ có mặt khi tuyến khai — xem `reasoning_effort` ở `router.ts`.
      // Không khai thì không gửi, để model dùng mặc định của chính nó.
      // Mức kỹ sư chọn cho lượt này thắng mức của tuyến (13/09/2026).
      ...((options.reasoningEffort ?? route.reasoning_effort)
        ? { reasoning: { effort: options.reasoningEffort ?? route.reasoning_effort } }
        : {}),
      // Không giữ lại nội dung lời gọi phía nhà cung cấp lâu hơn cần thiết (T12).
      store: false,
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const started = Date.now();
    const init = {
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: TEXT_TIMEOUT_MS,
      what: 'mô hình ngôn ngữ',
      ...(options.signal ? { cancel: options.signal } : {}),
    };
    // Có người đang theo dõi thì gọi ở chế độ TRUYỀN LUỒNG để đếm được chữ đang về. Bản trả về
    // cuối cùng (`response.completed`) có đúng hình dạng bản không truyền luồng, nên mọi phép kiểm
    // bên dưới dùng chung.
    const reply = options.onProgress
      ? await this.stream(endpoint, route, { ...body, stream: true }, init, options.onProgress)
      : await this.call<ResponsesReply>(endpoint, route, { ...init, body: JSON.stringify(body) });
    const latencyMs = Date.now() - started;
    // Số đo của lượt gọi, lấy NGAY khi bản trả về đã trong tay — trước mọi phép kiểm nội dung.
    // Mọi đường ném lỗi bên dưới đều mang nó theo, vì nhà cung cấp tính tiền theo token nó đã
    // sinh, không theo việc ta có đọc được hay không. Trước 13/09/2026 các đường ấy ném tay
    // không, nên ba lượt hỏng đắt nhất của nhánh AI ghi 0 token, 0 đồng và latency 0.
    const usage = {
      inputTokens: tokenCount(reply.usage?.input_tokens),
      outputTokens: tokenCount(reply.usage?.output_tokens),
    };
    // Phần NGHĨ tách khỏi phần VIẾT. Chỉ ghi ra nhật ký, chưa thành cột CSDL: biết con số trước
    // đã, rồi mới quyết có đáng một migration không. Đây là con số trả lời câu «vì sao một lượt
    // gọi mất năm phút» — đo 13/09/2026: câu trả lời JSON của một mặt bằng cỡ này chỉ nặng
    // ~1.500–2.500 token, mà lượt gọi tiêu hết 32.000.
    const reasoning = tokenCount(reply.usage?.output_tokens_details?.reasoning_tokens);
    // LUÔN ghi, kể cả khi nhà cung cấp không tách phần nghĩ: dòng này là nguồn số đo duy nhất khi
    // chưa đọc được bảng `design_ai_call`. Mở đầu bằng `[ĐO]` để lọc ra khỏi nhật ký bằng một
    // lệnh grep.
    console.log(
      `[ĐO] ${routeName} · ${route.model} · ${latencyMs} ms · vào ${usage.inputTokens ?? '?'} tok · ` +
        `ra ${usage.outputTokens ?? '?'} tok (nghĩ ${reasoning ?? '?'}) · ` +
        `trần ${budget === null ? 'KHÔNG ĐẶT' : budget} · trạng thái ${reply.status ?? '?'} · ` +
        `lời dẫn ${options.system.length + options.prompt.length} ký tự · ` +
        `lược đồ ${JSON.stringify(body.text).length} ký tự`,
    );

    const message = reply.output?.find((o) => o.type === 'message');
    const refusal = message?.content?.find((c) => c.type === 'refusal');
    if (refusal) {
      throw new LlmCallFailed(
        `Mô hình từ chối trả lời cho bước "${routeName}". Kiểm tra lại lời dẫn; thử lại không đổi được kết quả.`,
        false,
        undefined,
        undefined,
        usage,
        latencyMs,
      );
    }
    const text = message?.content?.find((c) => c.type === 'output_text')?.text;
    const cut =
      reply.status === 'incomplete' || reply.incomplete_details?.reason === 'max_output_tokens';
    if (typeof text !== 'string') {
      if (cut) throw this.budgetExhausted(routeName, budget, usage, latencyMs, reasoning);
      throw new LlmCallFailed(
        `Mô hình không trả về nội dung cho bước "${routeName}" (trạng thái: ${reply.status ?? 'không rõ'}).`,
        false,
        undefined,
        undefined,
        usage,
        latencyMs,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // Chuỗi cắt dở KHÔNG phải lỗi ngẫu nhiên: cùng ngân sách thì lượt sau cắt đúng chỗ ấy.
      // Đo 13/09/2026: một lượt `gpt-5` trả `incomplete`, lượt thử lại trả JSON cắt dở — hai hoá
      // đơn cho cùng một nguyên nhân. Chỉ khi KHÔNG bị cắt thì JSON hỏng mới đáng thử lại.
      if (cut) throw this.budgetExhausted(routeName, budget, usage, latencyMs, reasoning);
      throw new LlmCallFailed(
        `Mô hình trả về nội dung không phải JSON hợp lệ ở bước "${routeName}".`,
        true,
        undefined,
        undefined,
        usage,
        latencyMs,
      );
    }
    return { json, provider: route.provider, model: route.model, usage, latencyMs };
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

  /**
   * Hết ngân sách token đầu ra — lỗi TẤT ĐỊNH, không đáng thử lại.
   *
   * Thử lại với đúng ngân sách ấy là mua lần thứ hai đúng cái vừa hỏng (cùng lý lẽ với lượt bị
   * huỷ vì hết giờ, sửa 12/09/2026). Chương trình không tự nâng trần hộ: trần là cái van đánh
   * đổi tiền lấy chất lượng, và `max_output_tokens` của gpt-5 tính cả token NGHĨ, nên nâng nó là
   * quyết định của người trả tiền. Câu lỗi vì vậy phải nêu đúng tên chỗ vặn.
   */
  private budgetExhausted(
    routeName: string,
    budget: number | null,
    usage: TokenUsage,
    latencyMs: number,
    reasoning: number | null,
  ): LlmCallFailed {
    const cap =
      budget === null ? 'mức tối đa của model' : `${budget.toLocaleString('vi-VN')} token`;
    // Nói luôn phần NGHĨ khi biết được: «hết 32.000 token» một mình không chỉ ra chỗ vặn, còn
    // «hết 32.000, trong đó 30.000 là nghĩ» thì chỉ thẳng vào đúng cái van.
    const split =
      reasoning === null
        ? ''
        : ` Trong đó ${reasoning.toLocaleString('vi-VN')} token là phần suy nghĩ.`;
    return new LlmCallFailed(
      `Mô hình dùng hết ngân sách token đầu ra (${cap}) ở bước "${routeName}" nên bản trả về bị cắt dở.${split}`,
      false,
      undefined,
      'Mô hình chưa viết xong thì đã hết ngân sách chữ cho một lượt. Tăng `max_output_tokens` của tuyến trong config/models.yaml, hoặc hạ mức suy nghĩ của tuyến — token suy nghĩ cũng tính vào ngân sách đó.',
      usage,
      latencyMs,
    );
  }

  private async call<T>(
    endpoint: string,
    route: ResolvedRoute,
    init: {
      headers: Record<string, string>;
      body: BodyInit;
      timeoutMs: number;
      what: string;
      cancel?: AbortSignal;
    },
  ): Promise<T> {
    let res: Response;
    const sent = Date.now();
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...init.headers, Authorization: `Bearer ${route.apiKey}` },
        body: init.body,
        signal: requestTimeout(route, init.timeoutMs, init.cancel),
      });
    } catch (error) {
      const fault = classifyNetworkFault(error, init.what);
      const waited = Date.now() - sent;
      // Lượt chết trước khi có bản trả về thì KHÔNG có `usage` — nhà cung cấp không kịp nói đã
      // sinh bao nhiêu. Ít nhất phải để lại thời gian đã chờ, vì đó là thứ phân biệt «hỏng ngay»
      // với «chờ hai mươi phút rồi mới hỏng».
      console.log(`[ĐO] ${init.what} HỎNG sau ${waited} ms: ${String(error)}`);
      throw new LlmCallFailed(
        `Không gọi được ${init.what}: ${error instanceof Error ? error.message : String(error)}`,
        fault.retryable,
        undefined,
        fault.userMessage,
        undefined,
        waited,
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

  /**
   * Gọi Responses API ở chế độ truyền luồng (SSE) và dựng lại bản trả về cuối cùng.
   *
   * Chỉ đếm được KÝ TỰ phần trả lời trong lúc chạy: OpenAI không gửi số token giữa chừng và giấu
   * hẳn phần nghĩ — số token thật đọc ở sự kiện cuối (`response.completed` / `.incomplete`).
   */
  private async stream(
    endpoint: string,
    route: ResolvedRoute,
    body: Record<string, unknown>,
    init: {
      headers: Record<string, string>;
      timeoutMs: number;
      what: string;
      cancel?: AbortSignal;
    },
    onProgress: NonNullable<StructuredCallOptions['onProgress']>,
  ): Promise<ResponsesReply> {
    let res: Response;
    const sent = Date.now();
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { ...init.headers, Authorization: `Bearer ${route.apiKey}` },
        body: JSON.stringify(body),
        signal: requestTimeout(route, init.timeoutMs, init.cancel),
      });
    } catch (error) {
      const fault = classifyNetworkFault(error, init.what);
      throw new LlmCallFailed(
        `Không gọi được ${init.what}: ${error instanceof Error ? error.message : String(error)}`,
        fault.retryable,
        undefined,
        fault.userMessage,
        undefined,
        Date.now() - sent,
      );
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      const fault = classifyHttpFault(res.status, detail);
      throw new LlmCallFailed(
        `${init.what[0]!.toUpperCase()}${init.what.slice(1)} trả lỗi ${res.status}. ${detail.slice(0, 300)}`,
        fault.retryable,
        res.status,
        fault.userMessage,
      );
    }

    onProgress({ phase: 'thinking', outputChars: 0 });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let outputChars = 0;
    let final: ResponsesReply | null = null;
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
        if (!data || data === '[DONE]') continue;
        let event: {
          type?: string;
          delta?: string;
          response?: ResponsesReply;
          error?: { message?: string };
        };
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          outputChars += event.delta.length;
          onProgress({ phase: 'writing', outputChars });
        } else if (
          (event.type === 'response.completed' || event.type === 'response.incomplete') &&
          event.response
        ) {
          final = event.response;
        } else if (event.type === 'response.failed' || event.type === 'error') {
          throw new LlmCallFailed(
            `Mô hình ngôn ngữ báo lỗi giữa chừng: ${event.error?.message ?? event.response?.error?.message ?? 'không rõ'}`,
            true,
            undefined,
            undefined,
            undefined,
            Date.now() - sent,
          );
        }
      }
    }
    if (!final) {
      throw new LlmCallFailed(
        'Luồng trả lời của mô hình ngôn ngữ đóng mà không có bản trả về cuối cùng.',
        true,
        undefined,
        undefined,
        undefined,
        Date.now() - sent,
      );
    }
    return final;
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
