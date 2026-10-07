/**
 * Phát lại lượt thật 03718834 (05/10/2026) — lượt đầu tiên của đường v6 (dải), nhà ống demo 5 × 18 m, GPT-5.6 Terra,
 * 3 lời gọi, 0,150 USD, KHÔNG ra mặt bằng.
 *
 *  - Vòng 1: cả nhà qua bộ giải, chỉ còn «dining_1 thiếu 400 mm bề ngang» — mô hình ghi hành lang `gt_t2` 1.500 mm
 *    trong dải [gt_t2 | bếp | ăn] của nhà ống rộng 5 m, mức thông thuỷ nhà ống chỉ 900 mm.
 *  - Vòng 2: mô hình xếp bếp, ăn theo chiều sâu → tầng 1 sâu quá khối, bị gạt vì tệ hơn.
 *  - Vòng 3: câu nhắc chỉ nhắc lại lỗi phòng ăn, không nói vì sao vòng 2 bị gạt → mô hình trả y nguyên → dừng vì lặp.
 *
 * Sửa: bộ giải thu hẹp hành lang rộng quá mức thông thuỷ của loại nhà khi ô cùng dải thiếu bề ngang (T104); lượt bị gạt
 * kèm lỗi chính của nó (`revision_setback_why`). KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { generateAiPlan, revisionBase } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-03718834.json', import.meta.url), 'utf8'),
) as { outputs: unknown[] };
const input = {
  ...realContextInput(digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
    preKtsSides: true,
  }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
  geometry: 'rect' as const,
  pipeline: 'v6' as const,
  ...layoutKb,
};

describe('phát lại 03718834 — lượt thật đầu tiên của đường v6', () => {
  // Phát lại bằng câu trả lời đã ghi: chỉ vòng 1 so được (các vòng sau trả lời câu nhắc CŨ).
  const run = async () => {
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: recorded.outputs[Math.min(options.length - 1, recorded.outputs.length - 1)],
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    await generateAiPlan({
      ...input,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    }).catch(() => null);
    return options;
  };

  it('vòng 1: MỌI lỗi một lần — mốc thang (tầng 4 lệch, thang tầng 1 là mốc), chiều sâu tầng 2–3, phòng không lối vào', async () => {
    const options = await run();
    const tail = options[1]!.promptTail ?? '';
    // Bề rộng mô hình ghi là LỌT LÒNG (handoff sửa lỗi đợt 2 mục 1.2) — phòng ăn [hành lang 1.500 | bếp | ăn] nay đủ cạnh;
    // lỗi chiều sâu, mốc thang và lối vào (thấy ngay trên dải) đi cùng một vòng (mục 1.1).
    expect(tail).toMatch(/The storey out of line is storey 4/);
    expect(tail).toMatch(/Storey 2: the bands .* deeper than the house/);
    expect(tail).toMatch(/Storey 2: "ngu_ob" has no way in/);
    expect(tail).not.toMatch(/dựng lại tầng 1/);
  });

  it('lượt sửa bị gạt kèm lỗi chính của nó — mô hình biết đừng lặp lại cách ấy', () => {
    const best = {
      rejections: [{ level: 1, messages: ['a'] }],
      hints: ['- dining_1 thiếu bề ngang'],
    };
    const worse = {
      rejections: [{ level: 1, messages: ['a', 'b', 'c'] }],
      hints: ['- Storey 1 sâu quá khối 2600 mm', '- dining_1 thiếu bề ngang'],
    };
    const { next } = revisionBase(best, worse, prompts);
    expect(next.hints[0]).toMatch(/has been set aside/);
    expect(next.hints[1]).toBe(
      '- That set-aside revision failed on: Storey 1 sâu quá khối 2600 mm Do not repeat that fix; solve the problem below another way.',
    );
    expect(next.hints.slice(2)).toEqual(best.hints);
  });
});
