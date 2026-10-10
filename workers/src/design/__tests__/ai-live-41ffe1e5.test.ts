/**
 * Phát lại lượt thật 41ffe1e5 (06/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Terra, 4 lời gọi, 0,281 USD, KHÔNG
 * ra mặt bằng. Bốn chỗ sửa, đều ở chương trình:
 *
 *  - Lời gọi 1 viết mã kèm đường dẫn (`knowledge.model_added.gt_t1`) — cả bộ bị bác ở hợp đồng. Nay bỏ tiền tố đường dẫn.
 *  - Giếng trời ghi cùng mã mọi tầng được đổi thành `light_well_1_t2`… nhưng mã đổi không mang loại của mã gốc → «không có
 *    trong danh mục» cả bốn vòng.
 *  - Mái đặt sân phơi + sân thượng 10,5 m TRƯỚC thang, đẩy mốc thang lùi; câu nhắc đổ cho tầng 1 → mô hình nén tầng 1 ba
 *    vòng tới đúng bằng bộ dải viết tay mà vẫn hỏng. Nay một dòng nói cả hai tầng, chỉ tầng lệch.
 *  - Bộ dựng lại tầng 1 đẩy THANG ra sát tường (mô hình đặt giữa) → mọi tầng trên hết chỗ; lỗi giếng trời của tầng 4 chặn
 *    luôn cách dựng lại. Nay giữ thứ tự trái–phải mô hình ghi, lỗi kiểm bố cục tầng khác đi về mô hình.
 *
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  generateAiPlan,
  planContext,
  promptsFor,
  rescueFirstStorey,
  stripKnowledgePaths,
} from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-41ffe1e5.json', import.meta.url), 'utf8'),
) as { outputs: unknown[] };

/** Bốn câu trả lời đã ghi lần lượt, như lượt thật. */
const replay = async () => {
  const options: StructuredCallOptions[] = [];
  const client = {
    async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
      const json = recorded.outputs[Math.min(options.length, recorded.outputs.length - 1)];
      options.push(callOptions);
      return {
        json,
        provider: 'fake',
        model: 'fake-1',
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  };
  const error = await generateAiPlan({
    ...realContextInput(digest, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
      preKtsSides: true,
    }),
    mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
    geometry: 'rect',
    pipeline: 'v6',
    ...layoutKb,
    briefRef: 'sha256:' + '0'.repeat(64),
    route: 'ai_text_fake',
    client,
    prompts,
    planVariants: false,
  }).catch((e: unknown) => e);
  return { options, error };
};

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
const errorsOf = (tail: string) => tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));

describe('phát lại 41ffe1e5 — GPT-5.6 Terra, đường v6', () => {
  it('mã kèm đường dẫn knowledge được bỏ tiền tố — lời gọi 1 qua hợp đồng, vòng sau là SỬA chứ không lấy mẫu lại', async () => {
    expect(
      stripKnowledgePaths({ a: ['knowledge.model_added.gt_t1', 'knowledge.program.wc_1'] }),
    ).toEqual({
      a: ['gt_t1', 'wc_1'],
    });
    // Câu chữ không phải trọn một đường dẫn thì giữ nguyên.
    expect(stripKnowledgePaths('see knowledge.model_added.gt')).toBe(
      'see knowledge.model_added.gt',
    );
    const { options } = await replay();
    expect(errorsOf(options[1]!.promptTail ?? '')).toMatch(/stair position/);
  });

  it('giếng trời cùng mã mọi tầng: mã đổi theo tầng mang loại giếng trời, không bị bác «không có trong danh mục»', async () => {
    const { options, error } = await replay();
    const all = [...options.slice(1).map((o) => o.promptTail ?? ''), String(error)].join('\n');
    expect(all).not.toMatch(/light_well_1_t\d" is not an id/);
  });

  it('lời gọi 1: tầng 1 tự thừa sâu thì nêu tầng 1 với số thừa của CHÍNH nó (thang tầng 1 là mốc — handoff đợt 2 mục 3.3)', async () => {
    const { options } = await replay();
    const errors = errorsOf(options[1]!.promptTail ?? '');
    expect(errors).toMatch(/Storey 1: the bands .* 840 mm deeper than the house/);
    expect(errors).toMatch(/Thiếu WC chung ở tầng 2/);
    expect(errors).not.toMatch(/The storey out of line is/);
  });

  it('lời gọi 2: dựng lại tầng 1 giữ THANG đúng chỗ mô hình đặt, tầng 1 qua cổng, lỗi còn lại gửi mô hình sửa', () => {
    const context = planContext(input);
    const rescued = rescueFirstStorey(
      input,
      context,
      promptsFor(context, prompts),
      { model: 'fake' } as never,
      (recorded.outputs as AiHouseBands[])[1]!,
      {} as never,
    );
    expect(rescued).not.toBeNull();
    expect(rescued!.attempt.layoutFixes?.[0]).toMatch(/\[light_well_1 \| THANG \| wc_1\]/);
    // Mái do chương trình dựng (handoff sửa lỗi đợt 2 mục 2), giếng trời chỉ xét trục giếng tầng 1 (lượt thật affaf12b):
    // cả nhà dựng được, tầng 1 qua; cổng dừng ở danh mục phòng — lỗi thật còn lại là thiếu WC chung tầng 2.
    const problems = [
      ...rescued!.attempt.issues,
      ...(rescued!.evaluation?.rejections.flatMap((r) => r.messages) ?? []),
    ].join('\n');
    expect(problems).toMatch(/Thiếu WC chung ở tầng 2/);
    expect(rescued!.evaluation?.rejections.some((r) => r.level === 1) ?? false).toBe(false);
    expect(problems).not.toMatch(/roof/);
  });
});
