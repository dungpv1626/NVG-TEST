/**
 * Số token và chi phí của lượt gọi AI trên màn hình.
 *
 * Canh ba chỗ «hiện 0 ở chỗ không phải 0» (CLAUDE.md 5.2): tuyến chưa có giá, nhà cung cấp không
 * trả số token, và khoá gói miễn phí — tiền thật 0 nhưng vẫn phải nói giá nếu trả phí.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AiCallLogRow, AiCallUsage } from '@/hooks/use-ai-design';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  prompts: new Set<string>(),
  download: vi.fn(),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiCallLog: () => ({ data: state.rows, isLoading: false, isError: false, error: null }),
  useAiCallPrompts: () => ({ data: state.prompts }),
  useDownloadAiCallPrompt: () => ({
    mutate: state.download,
    isPending: false,
    isError: false,
    variables: undefined,
  }),
  useAiModels: () => ({ data: { text: [], image: [], defaults: {}, freeProviders: ['gemini'] } }),
}));

const { AiCallLedger, AiUsageLine, formatUsd } = await import('../ai-usage');

function usage(over: Partial<AiCallUsage> = {}): AiCallUsage {
  return {
    route: 'ai_text_openai_fast',
    purpose: 'program',
    provider: 'openai',
    model: 'gpt-5-mini',
    inputTokens: 12_000,
    outputTokens: 3_000,
    imageCount: 0,
    latencyMs: 4_200,
    status: 'ok',
    billed: true,
    costUsd: 0.009,
    listCostUsd: 0.009,
    ...over,
  };
}

describe('AiUsageLine', () => {
  it('khoá trả phí: token vào/ra, thời gian, tiền theo giá niêm yết', () => {
    render(<AiUsageLine usage={usage()} />);
    const line = screen.getByTestId('ai-usage');
    expect(line).toHaveTextContent('gpt-5-mini · 12.000 token vào · 3.000 token ra · 4,2 giây');
    expect(line).toHaveTextContent('Chi phí ≈ 0,009 USD (giá niêm yết, chưa gồm thuế)');
  });

  it('nhiều lượt (lượt đầu + lượt sửa) thì cộng lại và nói số lượt', () => {
    render(<AiUsageLine usage={[usage(), usage({ inputTokens: 13_000, costUsd: 0.01 })]} />);
    const line = screen.getByTestId('ai-usage');
    expect(line).toHaveTextContent('2 lượt gọi');
    expect(line).toHaveTextContent('25.000 token vào · 6.000 token ra');
    expect(line).toHaveTextContent('≈ 0,019 USD');
  });

  it('chưa có giá niêm yết → nói chưa có giá, KHÔNG hiện 0 USD', () => {
    render(<AiUsageLine usage={usage({ costUsd: null, listCostUsd: null })} />);
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('chưa có giá niêm yết cho model này');
    expect(screen.getByTestId('ai-usage')).not.toHaveTextContent('0 USD');
  });

  it('nhà cung cấp không trả số token → nói không trả về, KHÔNG hiện 0 token', () => {
    render(<AiUsageLine usage={usage({ inputTokens: null })} />);
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('không trả về token vào');
  });

  it('dựng ảnh không tính theo token thì nói số ảnh', () => {
    render(
      <AiUsageLine
        usage={usage({
          inputTokens: null,
          outputTokens: null,
          imageCount: 1,
          billed: false,
          costUsd: 0,
          listCostUsd: null,
        })}
      />,
    );
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('1 ảnh');
    expect(screen.getByTestId('ai-usage')).toHaveTextContent('0 USD (gói miễn phí)');
  });

  it('không có lượt nào thì không vẽ gì', () => {
    const { container } = render(<AiUsageLine usage={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('formatUsd', () => {
  it('lượt rẻ vẫn đọc được, không làm tròn thành 0', () => {
    expect(formatUsd(0.00042)).toBe('0,0004 USD');
    expect(formatUsd(0.333)).toBe('0,333 USD');
    expect(formatUsd(12.5)).toBe('12,5 USD');
  });
});

describe('AiCallLedger', () => {
  const row = (over: Partial<AiCallLogRow>): AiCallLogRow => ({
    id: Math.random().toString(36),
    created_at: '2026-09-13T09:00:00Z',
    route: 'ai_text_openai',
    provider: 'openai',
    model: 'gpt-5',
    purpose: 'plan_level',
    input_tokens: 8_000,
    output_tokens: 12_000,
    image_count: 0,
    latency_ms: 90_000,
    status: 'ok',
    error_code: null,
    cost_usd: '0.13',
    ...over,
  });

  it('cộng tiền THẬT và giá niêm yết riêng; dòng gói miễn phí tính 0 nhưng vẫn nói giá', () => {
    state.rows = [
      row({}),
      row({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        purpose: 'program_intent',
        cost_usd: 0.001,
      }),
      row({
        status: 'failed',
        cost_usd: null,
        route: 'ai_text_gemini_fast',
        provider: 'gemini_paid',
      }),
    ];
    render(<AiCallLedger projectId="p1" />);

    expect(screen.getByText(/3 lượt · 24.000 token vào · 36.000 token ra/)).toHaveTextContent(
      'Tiền thật ≈ 0,13 USD · Theo giá niêm yết ≈ 0,131 USD · 1 lượt chưa tính được tiền, chưa cộng',
    );
    expect(screen.getByText('0 USD (≈ 0,001 USD nếu trả phí)')).toBeInTheDocument();
    expect(screen.getByText('Chưa có giá')).toBeInTheDocument();
    expect(screen.getByText('Đề xuất ưu tiên diện tích')).toBeInTheDocument();
    expect(screen.getByText('Lỗi khi gọi')).toBeInTheDocument();
  });

  it('lượt có bản ghi lời gọi thì có nút «Xuất prompt»; lượt cũ ghi «Không lưu», không hiện nút chết', () => {
    state.rows = [
      row({ id: 'call-new' }),
      row({ id: 'call-old', created_at: '2026-09-12T09:00:00Z' }),
    ];
    state.prompts = new Set(['call-new']);
    state.download.mockClear();
    render(<AiCallLedger projectId="p1" />);

    const buttons = screen.getAllByRole('button', { name: /Xuất prompt/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    expect(state.download).toHaveBeenCalledWith({ projectId: 'p1', callId: 'call-new' });
    expect(screen.getByText('Không lưu')).toBeInTheDocument();
    state.prompts = new Set();
  });

  it('chưa có lượt nào thì nói rõ, không hiện bảng rỗng', () => {
    state.rows = [];
    render(<AiCallLedger projectId="p1" />);
    expect(screen.getByText(/Hồ sơ này chưa có lượt gọi AI nào/)).toBeInTheDocument();
  });
});
