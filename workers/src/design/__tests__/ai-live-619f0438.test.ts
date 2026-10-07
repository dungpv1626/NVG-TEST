/**
 * Phát lại lượt thật 619f0438 (05/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Sol, 2 lời gọi, 0,393 USD, KHÔNG ra
 * mặt bằng. Cả hai câu trả lời hỏng vì chỗ của CHƯƠNG TRÌNH, không phải mô hình:
 *
 *  - Lời gọi 1 bị coi là sai hợp đồng vì một cặp `doors_prefer` mang «THANG» → mô hình phải vẽ lại từ đầu.
 *    Phát lại thêm ba lỗi chương trình phía sau: chiều sâu dải mô hình ghi bị coi là số cứng (giếng trời còn 30 cm);
 *    bề ngang chia theo diện tích bỏ quên cạnh tối thiểu (kho thiếu 10 cm).
 *  - Lời gọi 2: hộp kỹ thuật cùng mã `hkt_1` ở mọi tầng bị bác ở tầng 3; WC tầng 2 không giáp hành lang bị coi là lỗi
 *    hình học (`retry: none`) nên lượt DỪNG thay vì gửi mô hình sửa.
 *
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { generateAiPlan } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-619f0438.json', import.meta.url), 'utf8'),
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

/** Lời gọi đầu trả câu trả lời thứ `start` đã ghi; các lời gọi sau trả lại đúng câu ấy (chỉ để xem câu nhắc). */
const replay = async (start: number) => {
  const options: StructuredCallOptions[] = [];
  const client = {
    async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
      options.push(callOptions);
      return {
        json: recorded.outputs[start],
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

describe('phát lại 619f0438 — GPT-5.6 Sol, đường v6', () => {
  it('lời gọi 1: cặp cửa mang «THANG» bị bỏ, câu trả lời dùng được — vòng sau là SỬA, lỗi bề ngang lọt lòng có số', async () => {
    const options = await replay(0);
    expect(options.length).toBeGreaterThan(1);
    expect(options[1]!.schema).toMatchObject({ title: 'AiHouseBandsDeltaCompact' });
    const tail = options[1]!.promptTail ?? '';
    expect(tail).not.toMatch(/did not match the schema/);
    // Không còn nhát cắt 30 cm. Ô thiếu bề ngang là LỌT LÒNG (dải [kho | bếp | ăn] trên 5 m không đủ cả ba
    // cạnh tối thiểu cộng tường) — lỗi thật của mô hình, trước kia lọt qua bộ giải vì so theo tim tường.
    expect(tail).not.toMatch(/cut|Nhát cắt/);
    expect(tail).toMatch(/Storey 1: "[a-z_0-9]+" lacks \d+ mm of width/);
  });

  it('lời gọi 2: vòng sau là SỬA (không dừng); WC tầng 2 có cửa; hộp kỹ thuật cùng mã các tầng không còn bị bác', async () => {
    const options = await replay(1);
    expect(options.length).toBeGreaterThan(1);
    const tail = options[1]!.promptTail ?? '';
    expect(tail).toContain('REVISION');
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    // WC tầng 2 nay có cửa: vách chung trừ tường theo từng đầu (đầu trong nhà nửa vách), không trừ 28 cm ở mọi vách.
    // (Câu của cổng cây có dấu hai chấm; kiểm lối vào trên dải — handoff sửa lỗi đợt 2 — báo riêng bằng gạch ngang khi
    // bộ giải hỏng: wc_2 nằm sau kho, không chạm hành lang.)
    expect(errors).not.toMatch(/"wc_2" has no way in:/);
    // Trước sửa: «Ô "hkt_1" đặt ở tầng 3, nhưng chương trình xếp phòng này ở tầng 2» — bác cả tầng 3; nay hộp kỹ thuật cùng
    // mã các tầng mang hậu tố tầng, không còn lời bác ấy. Giếng trời chỉ ở tầng 1 (T116, luật chặn) — báo ngay từ vòng này.
    expect(errors).toMatch(/light well "light_well_1" of storey 1 is covered/);
    expect(errors).not.toMatch(/chương trình xếp phòng này ở tầng/);
  });
});
