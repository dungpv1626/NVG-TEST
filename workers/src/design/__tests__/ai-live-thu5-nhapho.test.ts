/**
 * Phát lại hai lượt thật «Xếp mặt bằng» của hồ sơ thử NVO-TK-2026-THU5 (23/10/2026, GPT-5.6 Terra, lời dẫn 9.10.0, T165)
 * — nhà phố 5 × 18 m, 4 tầng, 1 ô tô + 2 xe máy, mặt tiền giáp đường, ba mặt giáp nhà. Cả hai lượt hỏng (9 lời gọi,
 * ≈ 0,74 USD). Câu trả lời thô đọc từ `ai_calls/<callId>.json` → `output` (bản ghi có từ 15/09/2026, nhưng tệp chữ của
 * báo cáo không in ra); đầu bài là `anonymiseForAi` của đầu bài đã xác nhận — dựng lại lời gọi khớp TỪNG KÝ TỰ chín lời
 * gọi đã ghi (lúc điều tra).
 *
 *  - ef5fbffc: vòng 1–3 mô hình vẽ đúng kiểu nhà ống (gara trọn hàng đường, phòng khách sau gara) nhưng chọn phòng khách
 *    làm `entry_room`. Câu nhắc bảo «vẽ phòng khách chạm hàng đường» → vòng 4 đưa phòng khách ra TRƯỚC gara (xe đi xuyên
 *    phòng khách), vòng 5 mô hình tự viết ra mâu thuẫn và trả danh mục rỗng.
 *  - e5ec68a6: mô hình vẽ gara 3 ô cạnh phòng khách 2 ô ở hàng đường; gara cần 3,1 m, phòng khách 3,3 m, tầng rộng 5 m.
 *    Bộ xếp chia lại tầng, phòng khách ra sau gara, câu nhắc vẫn là «vẽ phòng khách chạm hàng đường» — ba lượt sửa nộp
 *    lại y nguyên.
 *
 * Lời dẫn lưới (`floor_level`) chưa từng nói gara được làm lối vào: luật T115 chỉ ở `house_layout` / `house_bands`.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouseBest,
  generateAiPlan,
  houseSystem,
  mergeRevision,
  planContext,
  programGenerator,
} from '../ai/plan';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { fullPrompt, type StructuredCallOptions } from '../llm/text-client';
import {
  FAKE_CALL,
  layoutKb,
  loadRun,
  prompts,
  read,
  realContextInput,
  type RecordedRun,
} from './ai-real-context';

const STRATEGY =
  'Stair in the middle band against one side (a `blind` side when there is one); living to the front, service and wet rooms to the back; a light well, only when the brief asks for one, right behind the stair.';

/** Ngữ cảnh đúng như Workflow thật của lượt ấy (`ai-design-steps.ts#contextInput`): loại thang, số đo nhà ống, mặt thoáng. */
function thu5Input(run: RecordedRun) {
  const base = realContextInput(run.digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  return {
    ...base,
    fidelity: parseBriefFidelity(read('kb/brief_fidelity.yaml')),
    variant: { id: 'AI-A', label: 'AI-A', strategy: STRATEGY },
    quality: { ...base.quality!, acceptGroupFloorPercent: 40 },
    mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
    ...layoutKb,
  };
}

const RAW: Record<string, RecordedRun> = {
  ef5fbffc: JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-ef5fbffc.json')),
  e5ec68a6: JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-e5ec68a6.json')),
  '4eade9b1': JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-4eade9b1.json')),
  b1859741: JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-b1859741.json')),
  '4a25b460': JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-4a25b460.json')),
};

/** Chạy lại cả vòng lặp thật (`generateAiPlan`) với các câu trả lời đã ghi, theo thứ tự; trả lời gọi đã gửi. */
async function replayLoop(id: string) {
  const run = RAW[id]!;
  const answers = Object.keys(run.intents)
    .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    .map((key) => run.intents[key]);
  const sent: StructuredCallOptions[] = [];
  const client = {
    async complete(_route: string, _dataClass: unknown, options: StructuredCallOptions) {
      const json = answers[sent.length];
      sent.push(options);
      if (json === undefined) throw new Error('hết câu trả lời đã ghi');
      return { json, ...FAKE_CALL, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
    },
  };
  let error: unknown = null;
  try {
    await generateAiPlan({
      ...thu5Input(run),
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
    });
  } catch (caught) {
    error = caught;
  }
  return { sent, error, prompts: sent.map((options) => fullPrompt(options)) };
}

describe('THU5 — nhà phố 5 m có ô tô: mặt tiền và lối vào', () => {
  const run = loadRun('e5ec68a6');
  const input = thu5Input(run);
  const context = planContext(input);

  it('mặt tiền đúng: chỉ mặt trước thoáng và là mặt cửa chính / cửa xe; ba mặt kia giáp nhà', () => {
    expect(context.openFaces).toEqual(['front']);
    expect(context.entrances).toEqual({ main: 'front', vehicle: 'front' });
    expect(context.blockMm.widthMm).toBe(5000);
  });

  it('lời dẫn lưới nói gara được làm entry_room khi đầu bài cho vào nhà qua gara (nhà phố, có ô tô)', () => {
    expect(context.promptFlags.entry_garage).toBe(true);
    const system = houseSystem(prompts.floorLevel.system, context.promptFlags);
    expect(system).toMatch(/garage runs across them and is the `entry_room`/);
    // Biệt thự không khai gara làm lối vào (`passage.entry_room_by_building_type`): câu ấy không có.
    const villa = loadRun('5aba737d');
    const villaContext = planContext({ ...realContextInput(villa.digest) });
    expect(villaContext.promptFlags.entry_garage).toBe(false);
    expect(houseSystem(prompts.floorLevel.system, villaContext.promptFlags)).not.toMatch(
      /entry_room`: people walk in beside the car/,
    );
  });
});

describe('phát lại e5ec68a6 — gara và phòng khách cạnh nhau ở hàng đường của lô 5 m', () => {
  const run = loadRun('e5ec68a6');
  const input = thu5Input(run);
  const context = planContext(input);
  const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
  const round1 = evaluateHouseBest(
    input,
    context,
    run.intents.round1 as HouseIntent,
    generator,
    prompts,
  );
  const round2 = evaluateHouseBest(
    input,
    context,
    mergeRevision(
      round1.renamed ?? (run.intents.round1 as HouseIntent),
      run.intents.round2 as HouseIntent,
      round1.settled ?? [],
    ),
    generator,
    prompts,
  );

  it('vòng 2 vẫn hỏng tầng 1 — bản phác không dựng nổi, nhưng lỗi đầu tiên nói đúng chỗ: hàng đường quá hẹp', () => {
    expect(round2.ok).toBeNull();
    const ground = round2.rejections.find((rejection) => rejection.level === 1)!;
    expect(ground.codes?.[0]).toBe('sketch_row_too_narrow');
    expect(ground.messages[0]).toMatch(
      /hàng 1–8 đặt "garage_1", "living_1" cạnh nhau theo bề ngang — cần ít nhất 6\.4 m .* mà tầng chỉ rộng 5 m/,
    );
  });

  it('câu nhắc vòng sửa: hàng quá hẹp + gara làm entry_room; không còn «vẽ phòng khách chạm hàng đường»', async () => {
    const { prompts: sent, error } = await replayLoop('e5ec68a6');
    expect(error).toBeTruthy();
    expect(sent).toHaveLength(4);
    for (const prompt of sent.slice(1)) {
      expect(prompt).not.toContain('draw it touching the street row');
      expect(prompt).toContain('make "gr1" the entry_room');
    }
    expect(sent[2]).toMatch(
      /rows 1–8 put "gr1", "lv1" side by side across the storey; together they need at least 6\.4 m/,
    );
  });
});

describe('phát lại ef5fbffc — gara trọn hàng đường, phòng khách sau gara', () => {
  it('vòng 4 không còn bị bảo đưa phòng khách ra hàng đường (vòng thật đặt nó trước gara); câu nói gara làm lối vào', async () => {
    const { prompts: sent } = await replayLoop('ef5fbffc');
    // Vòng 1–3 là lỗi bản phác thật của mô hình (phòng không lối vào, phòng hụt ô, thang vào từ cạnh dài): câu nhắc
    // không đổi. Lời gọi 4 (sau vòng 3) là chỗ câu cũ dắt mô hình vào ngõ cụt.
    expect(sent).toHaveLength(5);
    const fourth = sent[3]!;
    expect(fourth).not.toContain('draw it touching the street row');
    expect(fourth).toContain(
      '"lv1" cannot carry the front door: the garage "gr1" takes the street side.',
    );
    expect(fourth).toContain('make "gr1" the entry_room');
  });

  it('câu trả lời vòng 5 (danh mục rỗng, mô hình tự nói không giải được) vẫn bị bác ở hợp đồng', async () => {
    const { error } = await replayLoop('ef5fbffc');
    expect(String(error)).toMatch(/Sai cấu trúc ở rooms/);
  });
});

/**
 * Lượt thật thứ ba 4eade9b1 (23/10/2026, sau T165; 5 lời gọi, 0,29 USD): mô hình vẽ đúng kiểu nhà ống ngay lời gọi 1
 * (gara trọn hàng đường làm lối vào, phòng khách sau, thang chữ U 3 × 4 ô, bếp ăn, WC, giếng trời). Vòng 4 sửa đúng
 * phòng khách 20 ô — nhưng phòng ăn + bếp gộp thông vẽ hình chữ L, bộ nắn bản phác cho nó ăn trọn khung bao, lấy mất cột
 * thứ ba của ô thang (3 → 2 ô, mức 2,4 m): thang ra lọt lòng 2,07 m < 2,15 m ngang hai vế, phòng khách bị ép còn
 * 12,79 m². Vòng ấy bị gạt là «tệ hơn», lượt hết tiền ở lỗi 13,7 m² của vòng 3 (T166).
 */
describe('phát lại 4eade9b1 — phòng lồi không được ăn cột của ô thang', () => {
  it('vòng 4: tầng 1 và 2 qua; câu nhắc lời gọi 5 chỉ còn lỗi bản phác thật của tầng 3–4', async () => {
    const { prompts: sent } = await replayLoop('4eade9b1');
    expect(sent.length).toBeGreaterThanOrEqual(5);
    const fifth = sent[4]!;
    expect(fifth).toContain('Storey 1, 2 passed every check');
    expect(fifth).not.toContain('"lv1" came out at');
    expect(fifth).not.toMatch(/stair "st1" is only/);
    expect(fifth).toMatch(
      /Storey 3: In the sketch, these rooms are not one rectangle of cells: co6/,
    );
  });

  it('tầng 1 hỏng thì tầng trên vẫn được soát phòng THIẾU trên bản phác: WC tầng 4 nói ngay từ lời gọi 2 (T167)', async () => {
    const { prompts: sent } = await replayLoop('4eade9b1');
    // Trước T167 câu này chỉ tới ở lời gọi 5, sau khi tầng 1 qua — lượt hết tiền trước khi mô hình sửa được.
    expect(sent[1]).toContain('Storey 4: The sketch of this storey leaves out wc5');
    // Phòng không chữ nhật KHÔNG báo sớm: hành lang chữ L tầng 2 vẫn qua khi được xếp thật (vòng 4).
    expect(sent[1]).not.toMatch(/Storey 2: In the sketch, these rooms are not one rectangle/);
  });

  it('vòng 1: thiếu bề NGANG thang thì câu nói bề ngang, không nói «theo chiều đi lên»', () => {
    const run = loadRun('4eade9b1');
    const input = thu5Input(run);
    const context = planContext(input);
    const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
    const result = evaluateHouseBest(
      input,
      context,
      run.intents.round1 as HouseIntent,
      generator,
      prompts,
    );
    const messages = result.rejections.flatMap((rejection) => rejection.messages).join(' | ');
    expect(messages).not.toMatch(/chỉ dài 2\.\d+ m theo chiều đi lên/);
  });
});

/**
 * Hai lượt thật 24/10/2026 trên THU5 (T168), sau T167. Cả hai qua tầng 1–3 ngay vòng 1–2; tầng 4 / cả nhà hỏng.
 *
 *  - 4a25b460: tầng 3 vẽ phòng ngủ 2 ô cạnh ô thang (thang ≥ 2,4 m + phòng ngủ ≥ 2,7 m trên 5 m). Chương trình chia lại
 *    tầng được nhưng nắn ban công mặt tiền thành khối góc bên phải; kiểm cả nhà báo «ban công chỉ chạm mặt trước ở góc» +
 *    «ban công ở mặt bên phải» như lỗi của mô hình, lỗi thật (hàng quá hẹp) không bao giờ tới.
 *  - b1859741: câu nhắc nói «đầu bước ra của thang tầng 4 chỉ giáp giếng trời» — giếng trời ấy do một cách chia lại đặt; bản
 *    phác của mô hình có hành lang suốt đầu thang. Lỗi thật: phòng giặt chạm hành lang dưới một cửa.
 */
describe('phát lại 4a25b460 và b1859741 — lỗi tầng trên tới mô hình đúng chỗ (T168)', () => {
  it('4a25b460: lời gọi 4 nói hàng thang + phòng ngủ tầng 3 quá hẹp, ban công khối góc là hệ quả của việc chia lại', async () => {
    const { prompts: sent } = await replayLoop('4a25b460');
    expect(sent).toHaveLength(5);
    // Ba lời gọi đầu không đổi so với lượt thật — vẽ lại tầng giữ (T86) không được mang lỗi ban công của cách chia lại.
    expect(sent[2]).not.toContain('is on the right side');
    const fourth = sent[3]!;
    expect(fourth).toMatch(/Storey 3: In the sketch, rows 8–14 put "st3", "bd2" side by side/);
    expect(fourth).toContain(
      'it became a corner block only because the program had to partition storey 3',
    );
    expect(fourth).not.toContain('move it to an allowed side or drop it');
  });

  it('b1859741: không còn câu «đầu bước ra chỉ giáp giếng trời» khi bản phác có hành lang suốt đầu thang', async () => {
    const { prompts: sent } = await replayLoop('b1859741');
    expect(sent[1]).not.toContain('touches only lw4');
    expect(sent[1]).toMatch(/Storey 4: In the sketch, "ld1" have no way in/);
  });
});
