/**
 * Phát lại lượt thật 36fb8000 (05/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Terra, 4 lời gọi, 0,253 USD, KHÔNG
 * ra mặt bằng. Không còn lỗi chương trình chặn trước mô hình; mô hình hội tụ dần nhưng tầng 1 vẫn thừa sâu. Ba chỗ sửa
 * sau lượt này:
 *
 *  - Lời dẫn lượt đầu chỉ nói «chật 80/81 m²»: tầng 1 nhà hẹp mà mỗi phòng một dải thì sâu 18,1 m trên 16,5 m — nay
 *    `knowledge.feasibility` nói cả chiều sâu và gợi ý nhóm phòng đứng cạnh nhau (`storeyDepth`).
 *  - Vòng cuối: «laundry_1 thiếu 100 mm bề ngang» trong khi phòng thờ cùng dải dư hơn 1 m — bộ giải tự mượn.
 *  - Dải sân thượng tầng 4 ghi 7.760 mm bị coi là mức sàn, ép thang tầng 1 — nay chỉ là mong muốn.
 *
 * Từ lời gọi 2, câu trả lời đã ghi trả lời câu nhắc CŨ — chuỗi sau đó chỉ để xem chương trình báo gì.
 *
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { AiPlanRejected, generateAiPlan } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-36fb8000.json', import.meta.url), 'utf8'),
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
    ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
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

describe('phát lại 36fb8000 — GPT-5.6 Terra, đường v6', () => {
  it('lượt đầu: knowledge nói tầng 1 vượt chiều sâu khi mỗi phòng một dải, kèm nhóm phòng đứng cạnh nhau', async () => {
    const { options } = await replay();
    const body = JSON.stringify(options[0]);
    expect(body).toMatch(/depth: one room per band needs 18\.\d m of 16\.5 m/);
    expect(body).toMatch(/beside THANG/);
  });

  it('bốn lời gọi; không vòng nào còn «giặt thiếu bề ngang» (bộ giải mượn ô cùng dải)', async () => {
    const { options, error } = await replay();
    expect(options).toHaveLength(4);
    expect(error).toBeInstanceOf(AiPlanRejected);
    for (const o of options) expect(o.promptTail ?? '').not.toMatch(/laundry_1" lacks/);
  });
});
