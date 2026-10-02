/**
 * Phát lại lượt thật 8eaaee7b (02/10/2026, gpt-5.6-terra, lời dẫn 9.4.0, Worker cloud lần đầu) — T112.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * Năm lời gọi, hỏng. Từ vòng 3 mỗi vòng chỉ còn một lỗi; vòng 4–5 kẹt ở «ban công mặt bên trái»: mô hình vẽ
 * MỘT khối ban công ở góc trước – trái và tin nó phủ cả hai mặt bắt buộc. Cổng mặt bằng không tính khối góc
 * cho mặt mà cạnh dài của nó không nằm trên (T106), nhưng câu nhắc cũ nói «không ban công nào chạm mặt ấy» —
 * sai với chính bản phác mô hình đang nhìn, nên nó giữ nguyên.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function replay() {
  const run = loadRun('8eaaee7b');
  const input = {
    ...realContextInput(run.digest, { stairShape: true, openSetback: true }),
    mandatory,
  };
  const context = planContext(input);
  const out = [];
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const answer = run.intents[`round${i}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    out.push(result);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return { out, context };
}

describe('phát lại 8eaaee7b — ban công góc không phủ hai mặt', { timeout: 600_000 }, () => {
  const { out, context } = replay();

  it('đúng như lượt thật: năm vòng đều hỏng, tầng 1 qua từ vòng 2', () => {
    expect(out.every((r) => !r.ok)).toBe(true);
    expect(out[0]!.rejections.some((r) => r.level === 1)).toBe(true);
    for (const r of out.slice(1)) expect(r.rejections.some((x) => x.level === 1)).toBe(false);
  });

  it('vòng 5: câu lỗi nói ban công chỉ chạm mặt bên trái ở góc, câu nhắc mô hình bảo vẽ ban công riêng', () => {
    const last = out[4]!;
    const messages = last.rejections.flatMap((r) => r.messages).join(' ');
    expect(messages).toMatch(/chỉ chạm mặt ấy ở góc/);
    expect(last.hints.join('\n')).toMatch(
      /touches that side only at a corner .* Draw a separate balcony with its long side along the left edge/,
    );
    expect(last.hints.join('\n')).not.toMatch(/none of the balconies touches/);
  });

  it('đầu bài nói trước: mỗi mặt bắt buộc một ban công riêng chạy dọc mặt ấy', () => {
    expect(context.narrative).toContain('Mỗi mặt bắt buộc cần một ban công riêng chạy dọc mặt ấy');
  });
});
