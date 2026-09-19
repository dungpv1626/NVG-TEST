/**
 * Client Anthropic — văn bản có lược đồ qua Messages API. Canh: khoá ở header `x-api-key`,
 * `anthropic-version` có mặt, `output_config.format` đúng hình, từ chối không thử lại, hết
 * token thì thử lại.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicClient } from '../llm/anthropic';
import { LlmCallFailed } from '../llm/gemini';
import { ModelRouter } from '../llm/router';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const SCHEMA = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };

function client() {
  return new AnthropicClient(
    new ModelRouter(
      {
        version: '1',
        routes: {
          ai_text_anthropic: {
            provider: 'anthropic',
            model: 'claude-test',
            endpoint: ENDPOINT,
            max_data_class: 2,
            enabled: true,
          },
        },
      },
      { anthropic: 'sk-ant-test' },
    ),
  );
}

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Client Anthropic', () => {
  it('gửi đúng hình Messages API, khoá và phiên bản ở header', async () => {
    const fetchMock = respond({
      content: [{ type: 'text', text: '{"a":"x"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    const out = await client().complete('ai_text_anthropic', 2, {
      system: 'Bạn là kiến trúc sư.',
      prompt: 'Lập chương trình.',
      schema: SCHEMA,
      images: [{ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' }],
      maxOutputTokens: 4096,
    });
    expect(out.json).toEqual({ a: 'x' });
    expect(out.usage).toEqual({ inputTokens: 50, outputTokens: 10 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'claude-test',
      max_tokens: 4096,
      system: 'Bạn là kiến trúc sư.',
    });
    expect(body.output_config.format).toMatchObject({ type: 'json_schema' });
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png' },
    });
    expect(body.messages[0].content[1]).toEqual({ type: 'text', text: 'Lập chương trình.' });
    expect(init.body as string).not.toContain('sk-ant-test');
  });

  it('từ chối → không thử lại; hết token → CŨNG không thử lại, và mang theo số đo', async () => {
    // Đảo hành vi cũ ngày 13/09/2026 theo phép đo trên tuyến OpenAI: cùng ngân sách thì lượt sau
    // cắt đúng chỗ ấy, nên thử lại là mua lần thứ hai đúng cái vừa hỏng. Claude đi cùng một
    // đường, nên sửa cùng lúc thay vì đợi nó cắn một lần nữa trên hoá đơn.
    respond({ content: [], stop_reason: 'refusal' });
    const refused = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(refused.retryable).toBe(false);

    respond({
      content: [{ type: 'text', text: '{"a":' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 9_000, output_tokens: 16_384 },
    });
    const cut = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(cut.retryable).toBe(false);
    // Lượt hỏng phải để lại số đo: một dòng `failed` ghi 0 token là một khoản chi biến mất.
    expect(cut.usage).toEqual({ inputTokens: 9_000, outputTokens: 16_384 });
    expect(cut.latencyMs).not.toBeUndefined();
    expect(cut.userMessage).toMatch(/max_output_tokens/);
  });

  it('JSON hỏng trên bản trả ĐỦ thì vẫn đáng thử lại — lượt sau có thể khác', async () => {
    respond({ content: [{ type: 'text', text: 'không phải JSON' }], stop_reason: 'end_turn' });
    const garbled = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(garbled.retryable).toBe(true);
  });

  it.each([
    [429, true],
    [529, true],
    [400, false],
  ])('phân loại HTTP %s → retryable %s', async (status, retryable) => {
    respond({ error: { type: 'x', message: 'y' } }, status);
    const err = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(err.retryable).toBe(retryable);
  });
});

describe('Client Anthropic — mức suy nghĩ và theo dõi trực tiếp (13/09/2026)', () => {
  function sse(events: object[]): Response {
    const text = events
      .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
      .join('');
    const bytes = new TextEncoder().encode(text);
    // Cắt đôi luồng giữa một sự kiện — bộ đọc phải ghép lại được.
    const half = Math.floor(bytes.length / 2);
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, half));
          controller.enqueue(bytes.slice(half));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }

  it('mức suy nghĩ đi vào `output_config.effort` — trước đây ô chọn không tới được Claude', async () => {
    const fetchMock = respond({
      content: [{ type: 'text', text: '{"a":"x"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 5 },
    });
    await client().complete('ai_text_anthropic', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      reasoningEffort: 'low',
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format).toMatchObject({ type: 'json_schema' });
    // Không truyền luồng thì không xin tóm tắt suy nghĩ, không bật `stream`.
    expect(body.stream).toBeUndefined();
    expect(body.thinking).toBeUndefined();
  });

  it('có `onProgress` thì truyền luồng: đếm ký tự suy nghĩ và trả lời, ghép bản cuối, lấy token cuối luồng', async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: 'message_start', message: { usage: { input_tokens: 8708, output_tokens: 1 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'Xếp thang giữa nhà.' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '{"a":' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '"x"}' } },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 18271 },
        },
        { type: 'message_stop' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const seen: { phase: string; outputChars: number; thinkingChars?: number }[] = [];
    const out = await client().complete('ai_text_anthropic', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      reasoningEffort: 'medium',
      onProgress: (progress) => seen.push(progress),
    });
    expect(out.json).toEqual({ a: 'x' });
    expect(out.usage).toEqual({ inputTokens: 8708, outputTokens: 18271 });
    expect(
      seen.some((p) => p.phase === 'thinking' && p.thinkingChars === 'Xếp thang giữa nhà.'.length),
    ).toBe(true);
    expect(seen.at(-1)).toMatchObject({ phase: 'writing', outputChars: '{"a":"x"}'.length });

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.stream).toBe(true);
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(body.output_config.effort).toBe('medium');
  });

  it('luồng đóng giữa chừng thì hỏng có số đo, không trả về nửa câu trả lời', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          { type: 'message_start', message: { usage: { input_tokens: 100 } } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"a":' } },
        ]),
      ),
    );
    const error = await client()
      .complete('ai_text_anthropic', 2, {
        system: 's',
        prompt: 'p',
        schema: SCHEMA,
        onProgress: () => {},
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmCallFailed);
    expect((error as LlmCallFailed).usage?.inputTokens).toBe(100);
  });

  describe('trần `max_tokens` khi tuyến khai 0 (không đặt trần)', () => {
    async function sentMaxTokens(stream: boolean) {
      const router = new ModelRouter(
        {
          version: '1',
          routes: {
            r: {
              provider: 'anthropic',
              model: 'claude-test',
              endpoint: ENDPOINT,
              max_data_class: 2,
              enabled: true,
              max_output_tokens: 0,
            },
          },
        },
        { anthropic: 'sk-ant-test' },
      );
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        if (body.stream) {
          const events = [
            { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"a":"x"}' } },
            {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn' },
              usage: { output_tokens: 3 },
            },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join('');
          return new Response(events, { status: 200 });
        }
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '{"a":"x"}' }],
            stop_reason: 'end_turn',
          }),
          { status: 200 },
        );
      });
      vi.stubGlobal('fetch', fetchMock);
      await new AnthropicClient(router).complete('r', 2, {
        system: 's',
        prompt: 'p',
        schema: SCHEMA,
        maxOutputTokens: 4096,
        ...(stream ? { onProgress: () => {} } : {}),
      });
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      return JSON.parse(init.body as string).max_tokens as number;
    }

    it('truyền luồng: mức tối đa của Claude 5 (128.000), không phải số nơi gọi xin', async () => {
      expect(await sentMaxTokens(true)).toBe(128_000);
    });

    it('không truyền luồng: 16.384 để yêu cầu thường không hết giờ HTTP', async () => {
      expect(await sentMaxTokens(false)).toBe(16_384);
    });
  });
});
