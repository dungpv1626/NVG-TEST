/**
 * Bảng theo dõi trực tiếp của bước xếp mặt bằng — nhiều tầng gọi song song trong một lượt chạy.
 */

import { describe, expect, it } from 'vitest';
import { LivePlanBoard } from '../ai/live-plan';

const pricing = { input_per_1m_usd: 2, output_per_1m_usd: 10 };

describe('LivePlanBoard', () => {
  it('lượt đang bay có tiến độ; lượt xong rời danh sách đang bay, mang mã nhật ký và tiền', () => {
    const board = new LivePlanBoard(
      { model: 'claude-sonnet-5', route: 'r', effort: 'medium' },
      pricing,
      true,
    );
    board.begin('plan:AI-A:L2:propose', 'Xếp tầng 2 · AI-A');
    board.begin('plan:AI-A:L3:propose', 'Xếp tầng 3 · AI-A');
    board.progress('plan:AI-A:L2:propose', {
      phase: 'thinking',
      outputChars: 0,
      thinkingChars: 420,
    });

    let snap = board.snapshot();
    expect(snap.active).toHaveLength(2);
    expect(snap.active[0]).toMatchObject({ phase: 'thinking', thinkingChars: 420 });

    board.finish('plan:AI-A:L2:propose', {
      callId: 'c1',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 8708, outputTokens: 18271 },
      latencyMs: 195308.4,
      status: 'ok',
    });
    snap = board.snapshot();
    expect(snap.active.map((a) => a.key)).toEqual(['plan:AI-A:L3:propose']);
    expect(snap.done[0]).toMatchObject({
      label: 'Xếp tầng 2 · AI-A',
      callId: 'c1',
      inputTokens: 8708,
      outputTokens: 18271,
      latencyMs: 195308,
      costUsd: 0.200126,
    });
  });

  it('khoá gói miễn phí: tiền thật 0; tuyến chưa có giá: `null`, không phải 0', () => {
    const free = new LivePlanBoard({ model: 'm', route: 'r', effort: null }, pricing, false);
    const unpriced = new LivePlanBoard({ model: 'm', route: 'r', effort: null }, undefined, true);
    const logged = {
      callId: null,
      provider: 'x',
      model: 'm',
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
      status: 'ok' as const,
    };
    free.begin('k', 'l');
    free.finish('k', logged);
    unpriced.begin('k', 'l');
    unpriced.finish('k', logged);
    expect(free.snapshot().done[0]!.costUsd).toBe(0);
    expect(unpriced.snapshot().done[0]!.costUsd).toBeNull();
  });

  it('«Dừng» bật tín hiệu huỷ dùng chung cho mọi lượt gọi', () => {
    const board = new LivePlanBoard({ model: 'm', route: 'r', effort: null }, pricing, true);
    expect(board.signal.aborted).toBe(false);
    board.cancel();
    expect(board.signal.aborted).toBe(true);
  });
});
