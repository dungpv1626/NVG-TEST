/**
 * Khối tiến độ một lượt chạy (07/10/2026): trạng thái, số tiền, ba nút — và câu lỗi chỉ hiện khi
 * hỏng ở phía NHÀ CUNG CẤP (người dùng phải làm gì đó), không hiện lỗi của bộ xếp.
 *
 * Ca thật 07/10/2026 22:32: lượt Gemini 3.1 Pro hỏng vì tài khoản hết tín dụng — một lượt gọi lỗi,
 * không token, không giá. Màn hình khi ấy chỉ nói «Chưa xếp được mặt bằng» và «có lượt chưa có giá».
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AiCallLogRow, AiRunView } from '@/hooks/use-ai-design';

const state = { rows: [] as AiCallLogRow[] };

vi.mock('@/hooks/use-ai-design', () => ({
  useAiCallLog: () => ({ data: [...state.rows].reverse(), isLoading: false }),
  useAiModels: () => ({
    data: {
      freeProviders: [],
      text: [{ route: 'ai_text_x', inputPer1mUsd: 2, outputPer1mUsd: 10 }],
      image: [],
    },
  }),
  useCancelAiRun: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  fetchAiCallPrompt: () => Promise.resolve(null),
}));

const { AiRunProgress } = await import('../ai-run-progress');
const { estimateLiveCost } = await import('../live-cost');

const CREDIT =
  'NonRetryableError: Không chạy được bước này: tài khoản tại nhà cung cấp mô hình đã hết tín dụng.';

function run(over: Partial<AiRunView> = {}): AiRunView {
  return {
    id: 'r1',
    stage: 'plan',
    status: 'failed',
    progress: { steps: [] },
    result: null,
    error: CREDIT,
    createdAt: '2026-10-07T15:32:29Z',
    updatedAt: '2026-10-07T15:32:30Z',
    ...over,
  };
}

function call(over: Partial<AiCallLogRow>): AiCallLogRow {
  return {
    id: 'c1',
    created_at: '2026-10-07T15:32:30Z',
    route: 'ai_text_gemini',
    provider: 'gemini_paid',
    model: 'gemini-3.1-pro-preview',
    purpose: 'plan_house',
    input_tokens: null,
    output_tokens: null,
    image_count: 0,
    latency_ms: 600,
    status: 'failed',
    error_code: 'LlmCallFailed',
    cost_usd: null,
    ...over,
  };
}

function show(r: AiRunView) {
  render(
    <AiRunProgress
      projectId="p1"
      run={r}
      purposePrefix="plan_house"
      reportTitle="Báo cáo"
      onRetry={vi.fn()}
      failedLabel="Chưa xếp được mặt bằng"
    />,
  );
}

describe('Khối tiến độ một lượt chạy', () => {
  it('hỏng ở nhà cung cấp (hết tín dụng): nói câu lỗi, chi phí 0 chứ không «chưa có giá»', () => {
    state.rows = [call({})];
    show(run());
    expect(screen.getByText(/hết tín dụng/)).toBeInTheDocument();
    expect(screen.queryByText(/NonRetryableError/)).toBeNull();
    expect(screen.getByText('≈ 0 USD')).toBeInTheDocument();
    expect(screen.queryByText(/chưa có giá/)).toBeNull();
  });

  it('hỏng ở bộ xếp (mô hình đã trả lời): KHÔNG bày câu lỗi, chỉ trạng thái và số tiền', () => {
    state.rows = [
      call({ status: 'rejected', input_tokens: 4000, output_tokens: 6000, cost_usd: 0.15 }),
    ];
    show(run({ error: 'Chưa xếp được mặt bằng: - R2 Every storey shares one stair position' }));
    expect(screen.getByText('Chưa xếp được mặt bằng')).toBeInTheDocument();
    expect(screen.queryByText(/Every storey/)).toBeNull();
    expect(screen.getByText('≈ 0,15 USD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải báo cáo (.md)' })).toBeInTheDocument();
  });

  it('đang chạy: hiện số tiền ƯỚC TÍNH theo thời gian thực, không chờ lượt gọi xong (07/10/2026)', () => {
    state.rows = [];
    show(
      run({
        status: 'running',
        error: null,
        progress: {
          steps: [],
          partial: {
            live: {
              route: 'ai_text_x',
              done: [{ inputTokens: 5000, costUsd: 0.05 }],
              active: [{ outputChars: 35000, thinkingChars: null }],
            },
          },
        },
      }),
    );
    // 0,05 thật + (5.000 × 2 + 10.000 token ra × 10) / 1e6 = 0,05 + 0,11 = 0,16
    expect(screen.getByText('≈ 0,16 USD')).toBeInTheDocument();
    expect(screen.getByText(/ước tính khi đang chạy/)).toBeInTheDocument();
  });
});

describe('estimateLiveCost', () => {
  it('cộng tiền thật đã xong với phần đang sinh quy ra token', () => {
    const cost = estimateLiveCost(
      {
        done: [{ inputTokens: 1000, costUsd: 0.01 }],
        active: [{ outputChars: 7000, thinkingChars: 3500 }],
      },
      { inputPer1mUsd: 4, outputPer1mUsd: 20 },
    );
    // 0,01 + (1.000 × 4 + 3.000 × 20) / 1e6 = 0,01 + 0,064
    expect(cost).toBeCloseTo(0.074, 6);
  });

  it('không có dữ liệu trực tiếp thì trả null, không bịa số', () => {
    expect(estimateLiveCost(null, null)).toBeNull();
    expect(estimateLiveCost({ done: [], active: [] }, null)).toBeNull();
  });
});
