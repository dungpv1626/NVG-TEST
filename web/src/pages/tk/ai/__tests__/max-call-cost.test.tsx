/**
 * «Tối đa ≈ X USD mỗi lời gọi» trong hộp hỏi trước khi xếp mặt bằng (T176). Cùng hàm `callBudget` mà Worker dùng
 * để hạ giới hạn token ra — hộp hỏi 28/10/2026 ước «≈ 0,491 USD» trong khi một lời gọi Opus 5.5 tiêu 2,59 USD.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { callBudget } from '@nvg/shared/design';
import { maxCallCost, maxMeasuredInputTokens } from '../run-cost-estimate';
import { RunCostNotice } from '../ai-plan-step';

const OPUS = { inputPer1mUsd: 4, outputPer1mUsd: 20 };

describe('maxCallCost', () => {
  it('không có mức: giới hạn của tuyến × giá', () => {
    const out = maxCallCost({
      ...OPUS,
      maxOutputTokens: 22_000,
      inputTokens: 7754,
      capUsd: null,
      minOutputTokens: 8000,
    });
    expect(out).toEqual({
      usd: (7754 * 4 + 22_000 * 20) / 1e6,
      lowered: false,
      inputKnown: true,
      outputTokens: 22_000,
    });
  });

  it('có mức thấp hơn: hạ — trùng đúng số Worker tính cho lời gọi đầu', () => {
    const out = maxCallCost({
      ...OPUS,
      maxOutputTokens: 128_000,
      inputTokens: 7754,
      capUsd: 0.8,
      minOutputTokens: 8000,
    });
    const worker = callBudget({
      capUsd: 0.8,
      spentUsd: 0,
      inputTokens: 7754,
      routeOutputTokens: 128_000,
      prices: OPUS,
      minOutputTokens: 8000,
    });
    expect(out?.lowered).toBe(true);
    expect(out?.outputTokens).toBe(worker.outputTokens);
    expect(out!.usd).toBeLessThanOrEqual(0.8);
  });

  it('chưa có giá: không có số', () => {
    expect(
      maxCallCost({
        inputPer1mUsd: null,
        outputPer1mUsd: 20,
        maxOutputTokens: 22_000,
        inputTokens: null,
        capUsd: 0.8,
        minOutputTokens: 8000,
      }),
    ).toBeNull();
  });

  it('token vào lớn nhất theo nhóm mục đích', () => {
    const row = (purpose: string, inputTokens: number | null) => ({
      projectId: 'p',
      createdAt: '2026-10-28T00:00:00Z',
      route: 'r',
      purpose,
      status: 'ok' as const,
      inputTokens,
      outputTokens: 1,
      costUsd: 0.1,
    });
    expect(
      maxMeasuredInputTokens(
        [
          row('plan_house', 7754),
          row('plan_house_revise', 9000),
          row('facade', 50_000),
          row('plan_house', null),
        ],
        ['plan_house', 'plan_house_revise'],
      ),
    ).toBe(9000);
    expect(maxMeasuredInputTokens([], ['plan_house'])).toBeNull();
  });
});

describe('RunCostNotice — dòng «tối đa mỗi lời gọi»', () => {
  it('hiện số tối đa và nói khi đã hạ cho vừa mức', () => {
    render(
      <RunCostNotice
        estimate={null}
        units={1}
        callsMax={5}
        capUsd={0.8}
        perCallMax={{ usd: 0.8, lowered: true, inputKnown: true, outputTokens: 38_449 }}
        modelName="Claude Opus 5.5"
      />,
    );
    expect(screen.getByTestId('per-call-max').textContent).toMatch(
      /^Tối đa ≈ 0,8 USD mỗi lời gọi — giới hạn token ra đã hạ cho vừa mức chi phí của lượt\.$/,
    );
  });
});
