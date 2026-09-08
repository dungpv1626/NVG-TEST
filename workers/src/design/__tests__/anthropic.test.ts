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

  it('từ chối → không thử lại; hết token → thử lại', async () => {
    respond({ content: [], stop_reason: 'refusal' });
    const refused = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(refused.retryable).toBe(false);

    respond({ content: [{ type: 'text', text: '{"a":' }], stop_reason: 'max_tokens' });
    const cut = (await client()
      .complete('ai_text_anthropic', 2, { system: 's', prompt: 'p', schema: SCHEMA })
      .catch((e: unknown) => e)) as LlmCallFailed;
    expect(cut.retryable).toBe(true);
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
