/**
 * Mức chi phí CHẶN THẬT của một lượt AI Design (T164 điểm 1, anh Dũng 23/10/2026).
 *
 * Số tiền ở đây là của hai lượt thật 23/10/2026 (hồ sơ NVO-TK-2026-THU5): ef5fbffc 5 lời gọi ≈ 0,46 USD.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { costCapDecision, costCapMessage, formatUsdVi, parseCostCap } from '../ai/cost-cap';
import { AiPlanRejectedWithMain } from '../workflows/plan-main-rejection';
import { AiPlanRejected } from '../ai/plan';

describe('parseCostCap — đọc cấu hình', () => {
  it('trống / sai / không dương = không giới hạn (null)', () => {
    for (const value of [null, undefined, '', '  ', 'abc', 0, -1, Number.NaN, {}, true]) {
      expect(parseCostCap(value)).toBeNull();
    }
  });
  it('nhận số và chuỗi số, cả dấu phẩy', () => {
    expect(parseCostCap(0.5)).toBe(0.5);
    expect(parseCostCap('0.5')).toBe(0.5);
    expect(parseCostCap('0,5')).toBe(0.5);
  });
});

describe('costCapDecision — trước mỗi lời gọi sửa kế tiếp', () => {
  it('mức trống: không bao giờ dừng, dù đã tiêu bao nhiêu', () => {
    expect(costCapDecision(null, [0.3, 0.3, 0.3])).toBeNull();
  });

  it('chưa có lời gọi nào: lời gọi đầu không bị chặn', () => {
    expect(costCapDecision(0.01, [])).toBeNull();
  });

  it('đã tiêu + ước tính một lời gọi nữa (trung bình các lời gọi đã có) vượt mức thì dừng', () => {
    // 0,12 + 0,10 + 0,08 = 0,30; trung bình 0,10 → 0,40 ≤ 0,5: gọi tiếp.
    expect(costCapDecision(0.5, [0.12, 0.1, 0.08])).toBeNull();
    // Lời gọi thứ tư 0,16: 0,46 + 0,115 = 0,575 > 0,5 → dừng.
    expect(costCapDecision(0.5, [0.12, 0.1, 0.08, 0.16])).toEqual({
      capUsd: 0.5,
      spentUsd: 0.46,
      nextUsd: 0.115,
      reason: 'over',
    });
  });

  it('vừa chạm đúng mức thì vẫn gọi (chỉ dừng khi VƯỢT)', () => {
    expect(costCapDecision(0.4, [0.1, 0.1, 0.1])).toBeNull();
  });

  it('một lời gọi không tính được tiền: không bảo đảm được mức → dừng, không đoán', () => {
    expect(costCapDecision(5, [0.1, null])).toEqual({
      capUsd: 5,
      spentUsd: 0.1,
      nextUsd: null,
      reason: 'unpriced',
    });
  });
});

describe('câu dừng cho người dùng', () => {
  it('số kiểu Việt Nam, nói mức và số đã tiêu', () => {
    expect(costCapMessage({ capUsd: 0.5, spentUsd: 0.46, nextUsd: 0.115, reason: 'over' })).toBe(
      'Đã dừng vì chạm mức chi phí 0,50 USD (đã tiêu 0,46 USD).',
    );
    expect(formatUsdVi(0.046)).toBe('0,046 USD');
  });

  it('lỗi mang mức chi phí vẫn là AiPlanRejected và giữ lượt chính', () => {
    const stop = { capUsd: 0.5, spentUsd: 0.46, nextUsd: 0.115, reason: 'over' as const };
    const error = new AiPlanRejectedWithMain(
      [{ level: 1, messages: ['x'] }],
      { round: 2, levels: [{ level: 1, messages: ['y'] }] },
      stop,
    );
    expect(error).toBeInstanceOf(AiPlanRejected);
    expect(error.costCap).toEqual(stop);
    expect(error.main?.round).toBe(2);
  });
});

/**
 * Workflow `ai-design.ts` import `cloudflare:workers` nên không nạp được trong Vitest; ở đây quét mã để
 * canh vòng lặp còn gọi phép kiểm mức chi phí trước MỖI lời gọi sửa và còn cộng tiền từng lời gọi.
 */
describe('Workflow còn nối phép kiểm mức chi phí (quét mã)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../workflows/ai-design.ts', import.meta.url)),
    'utf8',
  );

  it('kiểm trước lời gọi sửa của mặt bằng và của lượt sửa theo yêu cầu', () => {
    expect(source).toContain("await this.costCheck(step, params, id('propose'), spend)");
    expect(source).toContain('await this.costCheck(step, params, callId, spend)');
    expect(source).toMatch(/if \(round > 1 \|\| seed\) \{\s*const capped = await this\.costCheck/);
  });

  it('cộng tiền từng lời gọi vào sổ chung và quyết định nằm trong một bước bền', () => {
    expect(source.match(/spend\.push\(costUsd\(/g)?.length).toBe(2);
    expect(source).toMatch(
      /step\.do\(`\$\{beforeStepId\}:cost-cap`[\s\S]{0,80}costCapDecision\(cap, costs\)/,
    );
  });
});
