/**
 * Phát lại lượt thật affaf12b (07/10/2026, Haan tự chạy) — đường v6 sau handoff sửa lỗi đợt 2, nhà ống demo, GPT-5.6 Sol (`ai_text_openai_deep`), 0,307 USD,
 * 4 lời gọi, KHÔNG ra mặt bằng. Lời gọi 1 theo đúng mẫu mới (thang sau, dạng gọn): tầng 1–3 qua và được khoá ngay, chỉ
 * còn «giếng trời tầng 3 bị che ở tầng 4» — tầng 3 để giếng chiếm trọn cột cạnh thang, tầng 1 / 4 chỉ phần sau cột; trục
 * giếng từ tầng 1 vẫn thông lên trời. Nay phép kiểm chỉ xét phần giếng nằm trên trục giếng tầng thấp nhất; ô thông giữa
 * hai hành lang không chừa má cửa (tầng 4 vách chung 87 cm) — lời gọi 1 qua cổng.
 *
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands, AiHouseBandsDelta } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { generateAiPlan } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-affaf12b.json', import.meta.url), 'utf8'),
) as { outputs: unknown[] };

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
  const result = await generateAiPlan({
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
  }).catch((error: unknown) => error);
  return { options, result };
};

describe('phát lại affaf12b — GPT-5.6 Sol, đường v6 sau handoff đợt 2', () => {
  it('lời gọi 1 không còn qua cổng (handoff đợt 3): giặt tầng 4 đè phòng ngủ, làm việc / thờ không mặt thoáng — vòng 2 nhận đúng ba lỗi ấy', async () => {
    // Sau đợt 2 câu trả lời này qua cổng 63,8 điểm, nhóm E 8 % — handoff đợt 3 nói không chấp nhận được.
    const { options } = await replay();
    const tail = options[1]!.promptTail ?? '';
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    expect(errors).toMatch(/Storey 4: "laundry_1" sits over "ngu_con_1"/);
    expect(errors).toMatch(/Storey 2: "study_1" has no window/);
    expect(errors).toMatch(/Storey 4: "altar_room_1" has no window/);
    // Giếng trời thừa ra ngoài trục tầng 1 vẫn không bị báo «che»; hành lang nối hành lang vẫn đi được.
    expect(errors).not.toMatch(/covered|has no way in|cannot be reached/);
  });
});

describe('cặp cửa gộp qua vòng sửa (lượt thật affaf12b: 31 cặp)', () => {
  it('bỏ trùng, giữ tối đa 24 cặp mới nhất — bộ dải ghép vẫn đúng hợp đồng', async () => {
    const { mergeBandsDelta } = await import('../ai/bands/layout');
    const { aiHouseBandsSchema } = await import('@nvg/shared/design');
    const { expandCompact } = await import('../ai/bands/compact');
    const { dropBadDoorPairs, normalizeBandsAnswer } = await import('../ai/plan');
    // Như `callLayoutModel`: bung dạng gọn, chuẩn hoá, bỏ cặp cửa sai khuôn.
    const clean = (json: unknown, delta: boolean) =>
      dropBadDoorPairs(normalizeBandsAnswer(expandCompact(json), delta).json);
    const [first, ...deltas] = recorded.outputs;
    let bands = clean(first, false) as AiHouseBands;
    for (const delta of deltas)
      bands = mergeBandsDelta(bands, clean(delta, true) as AiHouseBandsDelta, new Set());
    expect(bands.doors_prefer.length).toBeLessThanOrEqual(24);
    expect(new Set(bands.doors_prefer.map((p) => [...p].sort().join('|'))).size).toBe(
      bands.doors_prefer.length,
    );
    // 30 cặp khác nhau qua một vòng sửa → vẫn chỉ 24 cặp mới nhất.
    const many = Array.from({ length: 30 }, (_, i) => [`kho_${i}`, 'gt_1']);
    const capped = mergeBandsDelta(
      bands,
      { storeys: [], doors_prefer: many, cantilevers_upsert: [], notes: [] },
      new Set(),
    );
    expect(capped.doors_prefer).toHaveLength(24);
    expect(capped.doors_prefer.at(-1)).toEqual(['kho_29', 'gt_1']);
    const parsed = aiHouseBandsSchema.safeParse(bands);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  });
});
