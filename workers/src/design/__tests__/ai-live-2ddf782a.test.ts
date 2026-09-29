/**
 * Phát lại lượt chạy thật 2ddf782a (24/09/2026, gpt-6-sol, lời dẫn 8.25.0) — cùng đầu bài «Biệt thự
 * nhà vườn (demo)». Bốn lời gọi (0,369 USD), không ra phương án.
 *
 * Tầng 1 qua cả bốn lượt; lượt 4 xếp được CẢ HAI tầng (lần đầu từ T72), rồi hỏng ở cổng cả nhà: đầu
 * bài khai ban công mặt sau, mà mô hình đã bỏ ban công thứ hai từ lượt 2. Lỗi ấy chỉ lộ khi mọi tầng
 * đã xếp xong, nên lượt 2 và 3 không được nhắc (T73 h).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { BalconyDemand } from '../ai/brief-demands';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { checkSketchBalconyDemand } from '../ai/plan-demands';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('2ddf782a');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const evaluate = (round: string) =>
  evaluateHouse(input, context, run.intents[round]!, generator, prompts);

const BACK_HINT = /balcony on the back side/;

describe('phát lại lượt chạy thật 2ddf782a', () => {
  it('đầu bài ghim ban công mặt sau', () => {
    expect(context.demands.balcony?.sides).toContain('back');
  });

  it('lượt 1 vẽ ban công mặt sau: không nhắc gì về ban công', () => {
    expect(evaluate('round1').hints.join('\n')).not.toMatch(BACK_HINT);
  });

  it('lượt 2 và 3 bỏ ban công mặt sau: câu nhắc đi CÙNG lỗi tầng 2, không chờ tới cổng cả nhà', () => {
    for (const round of ['round2', 'round3']) {
      const evaluation = evaluate(round);
      // Trước T96 tầng 2 còn lỗi riêng; từ T96 (cổng chia lại khu bếp tầng dưới theo WC ứng viên) tầng 2
      // xếp được — câu nhắc ban công vẫn phải có mặt dù lỗi chỉ còn ở cổng cả nhà.
      expect(evaluation.rejections.length).toBeGreaterThan(0);
      expect(evaluation.hints.join('\n'), round).toMatch(BACK_HINT);
      expect(retryPlan({ intent: run.intents[round]!, issues: [] }, evaluation).kind).toBe(
        'revise',
      );
    }
  });

  it('lượt 4 xếp được cả hai tầng; chỉ còn lỗi ban công, báo một lần', () => {
    const evaluation = evaluate('round4');
    expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([0]);
    expect(evaluation.hints.filter((hint) => BACK_HINT.test(hint))).toHaveLength(1);
  });
});

describe('checkSketchBalconyDemand', () => {
  const demand: BalconyDemand = {
    ...context.demands.balcony!,
    sides: ['back'],
    forbiddenSides: [],
    levels: [2],
    forbidden: false,
  };
  const rooms = [
    { id: 'b', type: 'balcony', level: 2 },
    { id: 'r', type: 'bedroom', level: 2 },
    { id: 'g', type: 'garage', level: 1 },
  ];
  const codes = (rows: Map<number, string[] | null>, want = demand) => {
    const found: string[] = [];
    checkSketchBalconyDemand(want, rooms, rows, (_level, code) => found.push(code));
    return found;
  };

  it('mặt đo theo khung ô ĐÃ XÂY: ô `.` ở mép sau không làm ban công lệch mặt', () => {
    const sketch = new Map([
      [1, ['g g', 'g g']],
      [2, ['r r', 'b b', '. .']],
    ]);
    expect(codes(sketch)).toEqual([]);
  });

  it('ban công ở mặt trước khi đầu bài đòi mặt sau → báo mặt; không có ban công ở tầng đòi → báo tầng', () => {
    expect(codes(new Map([[2, ['b b', 'r r']]]))).toEqual(['balcony_side_missing']);
    expect(codes(new Map([[2, ['r r', 'r r']]]))).toEqual([
      'balcony_level_missing',
      'balcony_side_missing',
    ]);
  });

  it('mặt cấm có ban công → báo', () => {
    const only = { ...demand, sides: [], levels: [], forbiddenSides: ['back' as const] };
    expect(codes(new Map([[2, ['r r', 'b b']]]), only)).toEqual(['balcony_side_not_wanted']);
  });

  it('thiếu bản phác tầng cần xét, hoặc đầu bài không khai → không kết luận', () => {
    expect(codes(new Map([[2, null]]))).toEqual([]);
    expect(codes(new Map())).toEqual([]);
    const found: string[] = [];
    checkSketchBalconyDemand(null, rooms, new Map([[2, ['r']]]), (_l, code) => found.push(code));
    expect(found).toEqual([]);
  });
});
