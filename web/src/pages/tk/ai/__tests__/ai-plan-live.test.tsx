/**
 * Bảng theo dõi trực tiếp bước xếp mặt bằng — thời gian, token, xuất prompt, nút Dừng (13/09/2026).
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  cancel: vi.fn(async () => ({ stopped: true })),
  download: vi.fn(),
}));

vi.mock('@/hooks/use-ai-design', () => ({
  useAiRun: () => ({ data: null }),
  useCancelAiRun: () => ({
    mutateAsync: state.cancel,
    isPending: false,
    isError: false,
    data: undefined,
  }),
  useDownloadAiCallPrompt: () => ({ mutate: state.download, isPending: false, isError: false }),
  useAiModels: () => ({ data: { text: [], image: [], defaults: {}, freeProviders: [] } }),
  useAiCallLog: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useAiCallPrompts: () => ({ data: new Set() }),
}));

const { AiPlanLive } = await import('../ai-live-call');

const started = new Date(Date.now() - 65_000).toISOString();

function run(status: string) {
  return {
    id: 'run-1',
    status,
    progress: {
      partial: {
        live: {
          model: 'claude-sonnet-5',
          route: 'ai_text_anthropic_fast',
          effort: 'medium',
          startedAt: started,
          active: [
            {
              key: 'plan:AI-A:L2:propose',
              label: 'Xếp tầng 2 · AI-A',
              startedAt: started,
              phase: 'thinking',
              outputChars: 0,
              thinkingChars: 3500,
            },
          ],
          done: [
            {
              key: 'plan:AI-A:L1:propose',
              label: 'Xếp tầng 1 · AI-A',
              callId: 'call-1',
              status: 'ok',
              errorCode: null,
              inputTokens: 8708,
              outputTokens: 18271,
              latencyMs: 195308,
              costUsd: 0.200126,
            },
          ],
        },
      },
    },
  };
}

describe('AiPlanLive', () => {
  it('đang chạy: model, mức suy nghĩ, thời gian, suy nghĩ ước tính, lượt xong có token và tiền', () => {
    render(<AiPlanLive projectId="p1" run={run('running')} />);
    expect(screen.getByText(/mức suy nghĩ Vừa/)).toBeInTheDocument();
    expect(screen.getByText(/Xếp tầng 2 · AI-A · 1 phút/)).toBeInTheDocument();
    expect(
      screen.getByText(/3\.500 ký tự tóm tắt suy nghĩ ≈ 1\.000 token \(ước tính/),
    ).toBeInTheDocument();
    expect(screen.getByText('18.271')).toBeInTheDocument();
    expect(screen.getAllByText(/0,2 USD/).length).toBeGreaterThan(0);
  });

  it('xuất prompt của lượt đã xong, và nút Dừng gửi đúng mã lượt chạy', () => {
    state.download.mockClear();
    render(<AiPlanLive projectId="p1" run={run('running')} />);
    fireEvent.click(screen.getByRole('button', { name: /Xuất prompt của lượt Xếp tầng 1/ }));
    expect(state.download).toHaveBeenCalledWith({ projectId: 'p1', callId: 'call-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Dừng lượt chạy' }));
    expect(state.cancel).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('đã xong: không còn nút Dừng, không còn lượt đang bay', () => {
    render(<AiPlanLive projectId="p1" run={run('done')} />);
    expect(screen.queryByRole('button', { name: 'Dừng lượt chạy' })).toBeNull();
    expect(screen.queryByText(/tóm tắt suy nghĩ/)).toBeNull();
    expect(screen.getByText('Xong')).toBeInTheDocument();
  });
});
