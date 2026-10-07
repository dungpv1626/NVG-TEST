/**
 * Phát lại lượt thật f0c97c06 (07/10/2026, Haan tự chạy) — đường v6, nhà ống demo, GPT-5.6 Sol (`ai_text_openai_deep`),
 * 4 lời gọi, ~0,276 USD, KHÔNG ra mặt bằng. Hai lỗi chương trình:
 *
 *  - Lời gọi 1 đúng mẫu nhưng ghi tầng «Tầng 1»… — hợp đồng bác cả bộ (nhà cung cấp không chặn mẫu của schema), mô hình
 *    tốn hai vòng chỉ để đổi tên tầng. Nay chuẩn hoá mềm lấy số tầng.
 *  - Tầng 4: ô thông giữa hai hành lang 0,9 m bị đòi đủ quy cách cửa đi (cửa 0,8 + hai má = 90 cm), vách chung chỉ 87 cm
 *    vì một đầu giáp sân thượng (vách ngoài dày hơn) — cả tầng 4 không đi tới được (cùng lỗi lượt affaf12b). Nay ô thông
 *    giữa hai phòng giao thông không chừa má.
 *
 * Sau sửa: lời gọi 1 qua cổng. KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { generateAiPlan, normalizeBandsAnswer } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-f0c97c06.json', import.meta.url), 'utf8'),
) as { outputs: unknown[] };

describe('phát lại f0c97c06 — GPT-5.6 Sol, đường v6', () => {
  it('tầng ghi bằng chữ («Tầng 1», «tang_2», «mái») → số tầng / roof, có ghi lại', () => {
    const { json, changes } = normalizeBandsAnswer(
      {
        storeys: [
          { level: 'Tầng 1', bands: [] },
          { level: 'tang_2', bands: [] },
          { level: 'Mái', bands: [] },
        ],
      },
      false,
    );
    expect((json as { storeys: { level: string }[] }).storeys.map((s) => s.level)).toEqual([
      '1',
      '2',
      'roof',
    ]);
    expect(changes.join('; ')).toMatch(/tầng «Tầng 1» → «1»/);
  });

  it('lời gọi 1 không còn qua cổng (handoff đợt 3) — vòng 2 chỉ nhận lỗi WC / mặt thoáng, không vòng đổi tên tầng, tầng 4 đi tới được', async () => {
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: recorded.outputs[0],
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const base = realContextInput(digest, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
    });
    await generateAiPlan({
      ...base,
      quality: { ...base.quality!, acceptGroupFloorPercent: 40 },
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      geometry: 'rect',
      pipeline: 'v6',
      ...layoutKb,
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    }).catch(() => null);
    // Sau đợt 2 câu trả lời này qua cổng 63,8 điểm — luật đợt 3 bác: giặt đè phòng ngủ, làm việc / thờ không mặt thoáng.
    const tail = options[1]!.promptTail ?? '';
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    expect(errors.split('\n').filter((line) => line.startsWith('- '))).toEqual([
      expect.stringMatching(/^- R10 Storey 4: "laundry_1" sits over "ngu_con_1"/),
      expect.stringMatching(/^- R6 Storey 2: "study_1" has no window/),
      expect.stringMatching(/^- R6 Storey 4: "altar_room_1" has no window/),
    ]);
  });

  it('hành lang nối hành lang tầng 4 đi được ở cổng (M185): bỏ hai luật đợt 3 khỏi đường đi, cổng chỉ còn báo thiếu giặt', async () => {
    // Gia chủ không xếp «lấy sáng» lên đầu, phòng giặt đổi mã thành kho — lời gọi 1 tới được cổng (luật đợt 3 bác nó
    // trước cổng). Ô thông giữa hai hành lang 0,9 m (vách chung 87 cm) phải đặt được: chỉ còn lỗi thiếu phòng giặt.
    const first = JSON.parse(
      JSON.stringify(recorded.outputs[0]).replaceAll('"laundry_1', '"kho_8'),
    );
    const options: StructuredCallOptions[] = [];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: first,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    await generateAiPlan({
      ...realContextInput({ ...digest, priorities: ['area_efficiency'] } as AiBriefDigest, {
        stairShape: true,
        openSetback: true,
        houseProfile: true,
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
    }).catch(() => null);
    const tail = options[1]!.promptTail ?? '';
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    expect(errors.split('\n').filter((line) => line.startsWith('- '))).toEqual([
      expect.stringMatching(/Thiếu Giặt phơi ở tầng 4/),
    ]);
  });
});
