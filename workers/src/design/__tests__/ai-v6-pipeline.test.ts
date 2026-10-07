/**
 * Đường v6 trọn vẹn (T116): đầu bài nhà ống demo 5 × 18 m → lời dẫn v6 thật → mô hình GIẢ trả dải viết tay → bộ giải
 * dải → cổng `ai/tree/` → chấm điểm → phương án. KHÔNG chạm mạng, KHÔNG gọi mô hình thật.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { lightWellAdvice } from '../ai/house-profile-norms';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  AiPlanRejected,
  bandsAttempt,
  generateAiPlan,
  planContext,
  promptsFor,
  layoutPrompt,
} from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { NHAONG_BANDS, NHAONG_BANDS_T2, swapRoom, withDemoAreas } from './ai-bands-helpers';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

// Đầu bài demo đã sửa cho vừa luật đợt 3 (T116 tiếp 17) — phát lại lượt thật vẫn dùng tệp đầu bài nguyên.
const digest = withDemoAreas(
  JSON.parse(
    readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
  ) as AiBriefDigest,
);
const input = {
  ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
  geometry: 'rect' as const,
  pipeline: 'v6' as const,
  ...layoutKb,
};

const c = (id: string, w = 0) => ({ id, w, stack: [] as { id: string; d: number }[] });
const st = (...ids: string[]) => ({ id: '', w: 0, stack: ids.map((id) => ({ id, d: 0 })) });
const band = (...cells: ReturnType<typeof c>[]) => ({ depth: 0, cells });

describe('đường v6 — nhà ống demo', () => {
  const context = planContext(input);

  it('ngữ cảnh v6: loại nhà ống, gara đi xuyên được, lời dẫn có mẫu dải ỐNG', () => {
    expect(context.bands?.profile).toBe('ong');
    expect(context.bands?.through.has('garage')).toBe(true);
    const prompt = layoutPrompt(context, promptsFor(context, prompts), context.promptFlags);
    expect(prompt).toContain('<patterns>');
    expect(prompt).toContain('Tube house');
    expect(prompt).not.toContain('Town house, frontage 6–10 m');
  });

  it('một lời gọi, dải viết tay → phương án qua cổng', async () => {
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: NHAONG_BANDS,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    let result;
    try {
      result = await generateAiPlan({
        ...input,
        briefRef: 'sha256:' + '0'.repeat(64),
        route: 'ai_text_fake',
        client,
        prompts,
        planVariants: false,
      });
    } catch (error) {
      const rejected = error as AiPlanRejected;
      throw new Error(
        `bị bác sau ${options.length} lời gọi: ${JSON.stringify(rejected.levels ?? rejected.message).slice(0, 3000)}`,
      );
    }
    expect(options).toHaveLength(1);
    expect(options[0]!.schema).toMatchObject({ title: 'AiHouseBandsCompact' });
    expect(result).toBeTruthy();
  });

  it('bộ giải báo thiếu chỗ → vòng sau SỬA đúng bộ dải ấy bằng delta (không lấy mẫu lại), ra phương án', async () => {
    const t4 = NHAONG_BANDS.storeys.find((storey) => storey.level === '4')!;
    const crowded: AiHouseBands = {
      ...NHAONG_BANDS,
      storeys: NHAONG_BANDS.storeys.map((storey) =>
        storey.level === '4'
          ? { ...storey, bands: [...storey.bands, band(c('kho_9')), band(c('kho_8'))] }
          : storey,
      ),
    };
    const answers: unknown[] = [
      crowded,
      { storeys: [t4], doors_prefer: [], cantilevers_upsert: [], notes: ['Bỏ hai kho tầng 4.'] },
    ];
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: answers[Math.min(options.length - 1, answers.length - 1)],
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const result = await generateAiPlan({
      ...input,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    });
    expect(result).toBeTruthy();
    expect(options).toHaveLength(2);
    expect(options[1]!.schema).toMatchObject({ title: 'AiHouseBandsDeltaCompact' });
    expect(options[1]!.promptTail).toContain('<plan>');
    // Hai kho thêm ở tầng 4 làm tầng ấy (hay mốc thang chung) thừa sâu.
    expect(options[1]!.promptTail).toMatch(/Storey \d: .*(more depth|deeper than the house)/);
  });

  it('bộ giải hỏng (tầng 4 thừa sâu, không dựng lại được) → lỗi danh mục phòng (thiếu WC chung tầng 2) đi CÙNG vòng sửa (lượt thật 822e699d)', async () => {
    const crowded4: AiHouseBands = {
      ...NHAONG_BANDS,
      storeys: NHAONG_BANDS.storeys.map((storey) =>
        storey.level === '4'
          ? { ...storey, bands: [...storey.bands, band(c('kho_9')), band(c('kho_8'))] }
          : storey,
      ),
    };
    const broken = swapRoom(crowded4, '2', 'wc_2', 'kho_2');
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: broken,
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
    const tail = options[1]?.promptTail ?? '';
    expect(tail).toMatch(/Storey 4: /);
    expect(tail).toMatch(/Thiếu Khu vệ sinh chung ở tầng 2/);
  });

  it('luật chặn T116 trên bộ dải mẫu: bỏ sảnh trước ô thang → chương trình chèn lại; lợp giếng trời ở tầng 3 → giếng bị che', () => {
    const attempt = (bands: AiHouseBands) =>
      bandsAttempt(
        context,
        context.layout!,
        context.bands!,
        promptsFor(context, prompts),
        bands,
        {} as never,
        context.roof?.level,
      );
    expect(attempt(NHAONG_BANDS).issues).toEqual([]);
    // Tầng 3 hành lang dọc bên PHẢI, thang bên trái, không sảnh ngang: đầu trước ô thang chỉ giáp phòng ngủ.
    // Mẫu giếng trời GIỮA nhà không chèn được sảnh: dải giếng neo sát ô thang, không còn khe — vòng sau gửi mô hình.
    // Chèn sảnh thử trên bộ dải trước đợt 3 (giếng trời trong ô cạnh thang), gia chủ không xếp «lấy sáng» lên đầu, phòng
    // giặt tầng 4 đổi thành kho — bộ dải ấy chỉ còn vướng sảnh. Tầng 3 hành lang dọc bên PHẢI, thang bên trái, không sảnh
    // ngang: đầu trước ô thang chỉ giáp phòng ngủ.
    const plain = planContext({
      ...input,
      digest: { ...input.digest, priorities: ['area_efficiency', 'easy_maintenance'] },
    });
    const noLanding: AiHouseBands = {
      ...NHAONG_BANDS_T2,
      storeys: swapRoom(NHAONG_BANDS_T2, '4', 'laundry_1', 'kho_8').storeys.map((storey) =>
        storey.level === '3'
          ? {
              ...storey,
              bands: [
                band(st('ngu_vc', 'wc_ngu_vc'), c('gt_4', 900)),
                band(c('ngu_con_1'), c('gt_5', 900)),
                band(c('THANG'), st('kho_3', 'light_well_1')),
              ],
            }
          : storey,
      ),
    };
    // Bỏ sảnh trước ô thang: chương trình tự chèn lại sảnh suốt bề ngang (Haan, sau lượt df9da65a), không gửi mô hình.
    const landed = bandsAttempt(
      plain,
      plain.layout!,
      plain.bands!,
      promptsFor(plain, prompts),
      noLanding,
      {} as never,
      plain.roof?.level,
    );
    expect(landed.issues).toEqual([]);
    expect(landed.layoutFixes?.join('\n')).toMatch(/chèn sảnh suốt bề ngang: tầng 3 đầu trước/);
    const roofed = swapRoom(NHAONG_BANDS, '3', 'LW', 'kho_9');
    expect(attempt(roofed).issues.join('\n')).toMatch(
      /light well "light_well_1" of storey 1 is covered on storey 3/,
    );
  });

  it('lưu ý giếng trời (T116): nhà ống sâu hơn mốc, không giếng / sân trong → ghi chú; có giếng → im', () => {
    const advice = lightWellAdvice(input.construction, input.digest, ['living', 'bedroom']);
    expect(advice?.code).toBe('light_well_advice');
    expect(advice?.message).toContain('giếng trời');
    expect(lightWellAdvice(input.construction, input.digest, ['living', 'light_well'])).toBeNull();
  });

  it('câu trả lời thiếu dải một tầng → báo «tầng không có dải», KHÔNG xếp tầng ấy bằng bộ xếp cũ (P0-3)', async () => {
    const missing: AiHouseBands = {
      ...NHAONG_BANDS,
      storeys: NHAONG_BANDS.storeys.filter((storey) => storey.level !== '3'),
    };
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: missing,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const error = await generateAiPlan({
      ...input,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiPlanRejected);
    const rejected = error as AiPlanRejected;
    const all = JSON.stringify(rejected.levels);
    // Không một dòng nào của bộ xếp cũ («bỏ sót … vùng mặc định»).
    expect(all).not.toMatch(/bỏ sót/);
    // Cổng danh mục bắt trước (tầng 3 không có phòng nào) và gửi mô hình sửa; `band_level_missing` là lưới phía sau
    // cho tầng lọt qua cổng danh mục mà không có cây.
    expect(options[1]!.promptTail).toMatch(/Tầng 3 không có không gian nào/);
  });
});
