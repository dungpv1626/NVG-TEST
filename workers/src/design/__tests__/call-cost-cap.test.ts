/**
 * Trần TỪNG lời gọi mô hình (T176, 28/10/2026).
 *
 * Sự cố: lời gọi «Xếp mặt bằng» bằng Claude Opus 5.5 (hồ sơ NVO-TK-2026-9272) chạy 20 phút, 7.754 token vào /
 * 128.000 token ra (toàn bộ là suy nghĩ), 2,59 USD — mức của lượt là 0,8 USD. Mức T164 chỉ xét trước lời gọi
 * SỬA. Các phép thử dưới đây dùng client / `fetch` giả, KHÔNG gọi nhà cung cấp nào.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callBudget, callCostUsd, estimateInputTokens } from '@nvg/shared/design';
import { CallCostCapReached, costCapMessage, costCappedClient } from '../ai/cost-cap';
import { AnthropicClient } from '../llm/anthropic';
import { GeminiClient } from '../llm/gemini';
import { OpenAiClient } from '../llm/openai';
import { classifyHttpFault } from '../llm/provider-faults';
import { ModelRouter, parseModelConfig } from '../llm/router';
import type { StructuredCallOptions, TextModelClient } from '../llm/text-client';

const OPUS = { inputPer1mUsd: 4, outputPer1mUsd: 20 };

describe('callBudget — chi phí tối đa của MỘT lời gọi', () => {
  it('sự cố 28/10: mức 0,8, giá Opus 5.5, giới hạn 128.000 → hạ cho vừa, tối đa ≤ phần còn lại', () => {
    // Giới hạn cũ: 7.754 × 4 + 128.000 × 20 = 2,59 USD cho một lời gọi.
    expect(callCostUsd(7754, 128_000, OPUS)).toBeCloseTo(2.591, 3);
    const out = callBudget({
      capUsd: 0.8,
      spentUsd: 0,
      inputTokens: 7754,
      routeOutputTokens: 128_000,
      prices: OPUS,
      minOutputTokens: 8000,
    });
    expect(out.kind).toBe('go');
    if (out.kind !== 'go') return;
    expect(out.lowered).toBe(true);
    // floor((0,8 − 0,031016) / 0,00002) = 38.449
    expect(out.outputTokens).toBe(38_449);
    expect(out.maxCallUsd).toBeLessThanOrEqual(0.8);
  });

  it('đã tiêu một phần: giới hạn hạ theo phần CÒN LẠI', () => {
    const out = callBudget({
      capUsd: 0.8,
      spentUsd: 0.5,
      inputTokens: 7754,
      routeOutputTokens: 22_000,
      prices: OPUS,
      minOutputTokens: 8000,
    });
    expect(out).toMatchObject({ kind: 'go', lowered: true, outputTokens: 13_449 });
    if (out.kind === 'go') expect(0.5 + out.maxCallUsd!).toBeLessThanOrEqual(0.8);
  });

  it('vừa mức thì giữ giới hạn của tuyến', () => {
    expect(
      callBudget({
        capUsd: 0.8,
        spentUsd: 0,
        inputTokens: 7754,
        routeOutputTokens: 22_000,
        prices: OPUS,
        minOutputTokens: 8000,
      }),
    ).toMatchObject({ kind: 'go', lowered: false, outputTokens: 22_000 });
  });

  it('còn quá ít: dừng TRƯỚC khi gọi', () => {
    const out = callBudget({
      capUsd: 0.8,
      spentUsd: 0.7,
      inputTokens: 7754,
      routeOutputTokens: 22_000,
      prices: OPUS,
      minOutputTokens: 8000,
    });
    expect(out.kind).toBe('stop');
    if (out.kind === 'stop') {
      expect(out.outputTokens).toBeLessThan(8000);
      expect(out.minCallUsd).toBeCloseTo(callCostUsd(7754, 8000, OPUS), 9);
    }
  });

  it('tuyến không có giá hoặc mức trống: theo tuyến, không hạ', () => {
    expect(
      callBudget({
        capUsd: 0.8,
        spentUsd: 5,
        inputTokens: 7754,
        routeOutputTokens: 22_000,
        prices: null,
        minOutputTokens: 8000,
      }),
    ).toEqual({ kind: 'go', outputTokens: 22_000, lowered: false, maxCallUsd: null });
    expect(
      callBudget({
        capUsd: null,
        spentUsd: 5,
        inputTokens: 7754,
        routeOutputTokens: 22_000,
        prices: OPUS,
        minOutputTokens: 8000,
      }),
    ).toMatchObject({ kind: 'go', lowered: false, outputTokens: 22_000 });
  });

  it('ước token vào theo ký tự — làm tròn lên', () => {
    expect(estimateInputTokens(10, 2.5)).toBe(4);
    expect(estimateInputTokens(11, 2.5)).toBe(5);
  });
});

const OPTIONS: StructuredCallOptions = {
  system: 's'.repeat(1000),
  prompt: 'p'.repeat(18_000),
  schema: { type: 'object' },
};

function fakeInner(seen: StructuredCallOptions[]): TextModelClient {
  return {
    async complete(_route, _cls, options) {
      seen.push(options);
      return {
        json: {},
        provider: 'fake',
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  };
}

const GUARD = {
  routeOf: () => ({
    pricing: { input_per_1m_usd: 4, output_per_1m_usd: 20 },
    maxOutputTokens: 128_000,
  }),
  settings: { chars_per_token: 2.5, min_output_tokens: 8000 },
};

describe('costCappedClient — bọc client trước mỗi lời gọi', () => {
  it('lời gọi ĐẦU cũng bị hạ (T164 không chặn lời gọi đầu)', async () => {
    const seen: StructuredCallOptions[] = [];
    const client = costCappedClient(fakeInner(seen), { ...GUARD, capUsd: 0.8, spent: () => [] });
    await client.complete('r', 2, OPTIONS);
    expect(seen[0]!.outputCap).toBeDefined();
    // ~7.608 token vào ước → ≈ 38.478 token ra
    const worst = callCostUsd(
      estimateInputTokens(1000 + 18_000 + 17, 2.5),
      seen[0]!.outputCap!,
      OPUS,
    );
    expect(worst).toBeLessThanOrEqual(0.8);
  });

  it('còn quá ít: ném CallCostCapReached, không gọi client trong', async () => {
    const seen: StructuredCallOptions[] = [];
    const client = costCappedClient(fakeInner(seen), {
      ...GUARD,
      capUsd: 0.8,
      spent: () => [0.4, 0.35],
    });
    const error = await client.complete('r', 2, OPTIONS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CallCostCapReached);
    expect((error as CallCostCapReached).stop).toMatchObject({
      capUsd: 0.8,
      spentUsd: 0.75,
      reason: 'call',
    });
    expect(costCapMessage((error as CallCostCapReached).stop)).toMatch(
      /^Đã dừng trước lời gọi kế tiếp .*0,80 USD .*0,75 USD/,
    );
    expect(seen).toHaveLength(0);
  });

  it('tuyến không có giá / lời gọi trước không tính được tiền / mức trống: như cũ, không hạ', async () => {
    const seen: StructuredCallOptions[] = [];
    await costCappedClient(fakeInner(seen), {
      ...GUARD,
      routeOf: () => ({ maxOutputTokens: 128_000 }),
      capUsd: 0.01,
      spent: () => [],
    }).complete('r', 2, OPTIONS);
    await costCappedClient(fakeInner(seen), {
      ...GUARD,
      capUsd: 0.01,
      spent: () => [null],
    }).complete('r', 2, OPTIONS);
    await costCappedClient(fakeInner(seen), {
      ...GUARD,
      capUsd: null,
      spent: () => [5],
    }).complete('r', 2, OPTIONS);
    await costCappedClient(fakeInner(seen), {
      ...GUARD,
      settings: null,
      capUsd: 0.01,
      spent: () => [],
    }).complete('r', 2, OPTIONS);
    expect(seen.map((o) => o.outputCap)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

// ---------------------------------------------------------------------------
// Client nhà cung cấp nhận giới hạn của lời gọi
// ---------------------------------------------------------------------------

afterEach(() => vi.unstubAllGlobals());

function routerWith(
  provider: string,
  maxOutputTokens: number,
  extra: Record<string, unknown> = {},
) {
  return new ModelRouter(
    {
      version: '1',
      routes: {
        r: {
          provider,
          model: 'm',
          max_data_class: 2,
          enabled: true,
          max_output_tokens: maxOutputTokens,
          ...extra,
        },
      },
    },
    { [provider]: 'khoá-giả' },
  );
}

function sentBody(reply: unknown): {
  mock: ReturnType<typeof vi.fn>;
  body: () => Record<string, unknown>;
} {
  const mock = vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 }));
  vi.stubGlobal('fetch', mock);
  return {
    mock,
    body: () =>
      JSON.parse((mock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
  };
}

const SCHEMA = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };

describe('client nhận `outputCap` — chỉ hạ, không nâng', () => {
  it('OpenAI: `max_output_tokens` = số nhỏ hơn giữa tuyến và lời gọi', async () => {
    const reply = {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":"x"}' }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const router = routerWith('openai', 24_000, {
      endpoint: 'https://api.openai.com/v1/responses',
    });
    let sent = sentBody(reply);
    await new OpenAiClient(router).complete('r', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      outputCap: 9000,
    });
    expect(sent.body().max_output_tokens).toBe(9000);
    sent = sentBody(reply);
    await new OpenAiClient(router).complete('r', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      outputCap: 90_000,
    });
    expect(sent.body().max_output_tokens).toBe(24_000);
  });

  it('Anthropic: `max_tokens` hạ cả khi tuyến khai 0 (mức tối đa 128.000 khi truyền luồng)', async () => {
    const reply = { content: [{ type: 'text', text: '{"a":"x"}' }], stop_reason: 'end_turn' };
    const router = routerWith('anthropic', 0, {
      endpoint: 'https://api.anthropic.com/v1/messages',
    });
    const sent = sentBody(reply);
    await new AnthropicClient(router).complete('r', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      outputCap: 12_345,
    });
    expect(sent.body().max_tokens).toBe(12_345);
  });

  it('Gemini: `maxOutputTokens` = số nhỏ hơn', async () => {
    const reply = {
      candidates: [{ content: { parts: [{ text: '{"a":"x"}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    };
    const router = routerWith('gemini_paid', 24_000);
    const sent = sentBody(reply);
    await new GeminiClient(router).complete('r', 2, {
      system: 's',
      prompt: 'p',
      schema: SCHEMA,
      outputCap: 10_000,
    });
    expect((sent.body().generationConfig as Record<string, unknown>).maxOutputTokens).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Cấu hình: không tuyến chữ nào được để không trần
// ---------------------------------------------------------------------------

const CONFIG = parseModelConfig(
  readFileSync(fileURLToPath(new URL('../../../../config/models.yaml', import.meta.url)), 'utf8'),
);

/** Token vào cho phép trong phép tính trần (lượt sự cố: 7.754). */
const INPUT_ALLOWANCE = 10_000;

describe('config/models.yaml — trần mọi tuyến `ai_text_*` (T176)', () => {
  const text = Object.entries(CONFIG.routes).filter(([name]) => name.startsWith('ai_text_'));

  it('có tuyến để canh', () => {
    expect(text.length).toBeGreaterThan(10);
  });

  it.each(text)('%s: `max_output_tokens` > 0 và có giá', (_name, route) => {
    expect(route.max_output_tokens).toBeGreaterThan(0);
    expect(route.pricing?.input_per_1m_usd).toBeGreaterThan(0);
    expect(route.pricing?.output_per_1m_usd).toBeGreaterThan(0);
  });

  it.each(text.filter(([, r]) => r.provider === 'anthropic'))(
    '%s: một lời gọi không vượt ~0,5 USD, mức suy nghĩ hữu hạn',
    (_name, route) => {
      const usd = callCostUsd(INPUT_ALLOWANCE, route.max_output_tokens!, {
        inputPer1mUsd: route.pricing!.input_per_1m_usd!,
        outputPer1mUsd: route.pricing!.output_per_1m_usd!,
      });
      expect(usd).toBeLessThanOrEqual(0.5);
      expect(['low', 'medium']).toContain(route.reasoning_effort);
    },
  );

  it('tham số trần từng lời gọi có khai', () => {
    expect(CONFIG.billing?.call_cap?.chars_per_token).toBeGreaterThan(0);
    expect(CONFIG.billing?.call_cap?.min_output_tokens).toBeGreaterThan(0);
    // Số tối thiểu không được cao hơn giới hạn của tuyến nào, nếu không tuyến ấy không bao giờ được gọi khi có mức.
    for (const [, route] of text) {
      expect(route.max_output_tokens!).toBeGreaterThanOrEqual(
        CONFIG.billing!.call_cap!.min_output_tokens,
      );
    }
  });

  it('khai sai `call_cap` thì không nạp tệp', () => {
    const bad = (callCap: string) =>
      `version: '1'\nbilling:\n  call_cap: ${callCap}\nroutes:\n  a: { provider: openai, model: m, max_data_class: 2, enabled: true }\n`;
    expect(() => parseModelConfig(bad('{ chars_per_token: 0, min_output_tokens: 8000 }'))).toThrow(
      /call_cap/,
    );
    expect(() => parseModelConfig(bad('{ chars_per_token: 2.5, min_output_tokens: 0 }'))).toThrow(
      /call_cap/,
    );
  });
});

// ---------------------------------------------------------------------------
// Câu báo lỗi 429 đúng nghĩa
// ---------------------------------------------------------------------------

describe('429 của Gemini: gói miễn phí / hạn mức theo thời gian / hết tín dụng', () => {
  const FREE_TIER =
    'You exceeded your current quota, please check your plan and billing details. For more information on this ' +
    'error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. * Quota exceeded for metric: ' +
    'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro';
  const RATE =
    'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: ' +
    'generativelanguage.googleapis.com/generate_content_paid_tier_input_token_count, limit: 2000000, model: ' +
    'gemini-3.1-pro\nPlease retry in 21.5s. "quotaId": "GenerateContentPaidTierInputTokensPerModelPerMinute"';
  const CREDIT =
    '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Your prepayment credits are depleted."}}';

  it('(a) free tier, limit 0 → bật thanh toán / dùng khoá trả phí, không thử lại', () => {
    const fault = classifyHttpFault(429, FREE_TIER);
    expect(fault.retryable).toBe(false);
    expect(fault.userMessage).toMatch(/gói miễn phí \(chưa bật thanh toán\)/);
    expect(fault.userMessage).toMatch(/Quản trị hệ thống/);
    expect(fault.userMessage).not.toMatch(/hết tín dụng/);
  });

  it('(b) hạn mức theo phút / ngày → thử lại sau', () => {
    const fault = classifyHttpFault(429, RATE);
    expect(fault.retryable).toBe(true);
    expect(fault.userMessage).toMatch(/chạm hạn mức gọi/);
    // Free tier mà hạn mức khác 0 (chạm hạn mức ngày) cũng là (b), không phải (a).
    expect(classifyHttpFault(429, FREE_TIER.replace('limit: 0', 'limit: 250')).userMessage).toMatch(
      /chạm hạn mức gọi/,
    );
  });

  it('(c) hết tín dụng thật → giữ câu cũ', () => {
    expect(classifyHttpFault(429, CREDIT).userMessage).toMatch(/hết tín dụng/);
    expect(
      classifyHttpFault(
        429,
        '{"error":{"message":"You exceeded your current quota, please check your plan and billing details.","type":"insufficient_quota"}}',
      ).userMessage,
    ).toMatch(/hết tín dụng/);
  });
});
