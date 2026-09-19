/**
 * Chi phí của một lượt gọi AI — thứ hiện thẳng lên màn hình cho kỹ sư.
 *
 * Canh hai chỗ dễ nói sai: tiền THẬT của khoá gói miễn phí là 0 (nhưng giá niêm yết vẫn phải
 * hiện), và tuyến chưa có giá thì là «không biết», không phải 0.
 */

import { describe, expect, it } from 'vitest';
import { costUsd, usageSummary } from '../ai/call-log';

const META = { route: 'ai_text_openai_fast', purpose: 'program', dataClass: 2 as const };

describe('costUsd', () => {
  it('tính theo giá mỗi triệu token vào và ra', () => {
    expect(
      costUsd(
        { input_per_1m_usd: 0.25, output_per_1m_usd: 2 },
        { inputTokens: 12_000, outputTokens: 3_000 },
      ),
    ).toBe(0.009);
  });

  it('không có giá, hoặc không có số token → không biết, không phải 0', () => {
    expect(costUsd(undefined, { inputTokens: 100, outputTokens: 100 })).toBeNull();
    expect(
      costUsd(
        { input_per_1m_usd: 1, output_per_1m_usd: 1 },
        { inputTokens: null, outputTokens: null },
      ),
    ).toBeNull();
  });
});

describe('usageSummary', () => {
  const outcome = {
    provider: 'openai',
    model: 'gpt-5-mini',
    usage: { inputTokens: 12_000, outputTokens: 3_000 },
    latencyMs: 4_210.6,
    status: 'ok' as const,
  };
  const pricing = { input_per_1m_usd: 0.25, output_per_1m_usd: 2 };

  it('khoá trả phí: tiền thật bằng giá niêm yết', () => {
    const u = usageSummary(META, outcome, pricing, true);
    expect(u).toMatchObject({
      inputTokens: 12_000,
      outputTokens: 3_000,
      costUsd: 0.009,
      listCostUsd: 0.009,
      billed: true,
      latencyMs: 4211,
    });
  });

  it('khoá gói miễn phí: tiền thật 0, vẫn giữ giá nếu trả phí', () => {
    const u = usageSummary(META, { ...outcome, provider: 'gemini' }, pricing, false);
    expect(u.costUsd).toBe(0);
    expect(u.listCostUsd).toBe(0.009);
    expect(u.billed).toBe(false);
  });

  it('khoá trả phí mà tuyến chưa có giá → tiền thật cũng là «không biết»', () => {
    const u = usageSummary(META, outcome, undefined, true);
    expect(u.costUsd).toBeNull();
    expect(u.listCostUsd).toBeNull();
  });
});
