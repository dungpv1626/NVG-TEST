/**
 * Phát lại lượt chạy thật 1dd74b99 (27–28/10/2026, hồ sơ NVO-TK-2026-9272, biệt thự 15 × 20 m, GPT-5.6 Terra) — năm
 * lời gọi ≈ 0,50 USD, không ra phương án (`backup/ai-tron/bao-cao-luot-hong.md`):
 *
 *  · lượt 1: tầng 2 ba phòng không lối vào;
 *  · lượt 2–4: CÙNG lỗi chính «phòng ngủ tầng 2 chỉ 14,13 m² < 17 m²» (lượt 4 mô hình đánh số lại bedroom_4 → bedroom_3),
 *    lỗi phụ khác nhau từng lượt — nên phép dừng cũ (`stuckRepeating`, cả tập lỗi y hệt) không bắt được;
 *  · lượt 5: mô hình trả danh mục rỗng, vẫn tính ≈ 0,09 USD.
 *
 * T174: ba lượt liền cùng lỗi chính thì dừng TRƯỚC lời gọi thứ năm. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { parsePlanQuality } from '../ai/plan-quality';
import type { StructuredCallOptions } from '../llm/text-client';
import {
  AiPlanRejected,
  evaluateHouseBest,
  generateAiPlan,
  mainProblemKey,
  mergeRevision,
  planContext,
  programGenerator,
  retryPlan,
  sameMainProblem,
  type LevelRejection,
} from '../ai/plan';
import type { HouseIntent } from '../ai/house';
import { earlyStopOf } from '../workflows/plan-main-rejection';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('1dd74b99');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };

/** Chạy vòng sửa đồng bộ với năm câu trả lời đã ghi; trả số lời gọi đã dùng. */
async function replay(sameMainIssueRounds: number | null): Promise<number> {
  const answers = ['round1', 'round2', 'round3', 'round4', 'round5'].map((k) => run.intents[k]);
  let calls = 0;
  const client = {
    async complete(_route: string, _dataClass: unknown, _options: StructuredCallOptions) {
      calls += 1;
      return {
        json: answers[calls - 1],
        provider: 'fake',
        model: 'fake-1',
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  };
  await expect(
    generateAiPlan({
      ...input,
      quality: { ...input.quality, sameMainIssueRounds },
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
    }),
  ).rejects.toBeInstanceOf(AiPlanRejected);
  return calls;
}

describe('lượt thật 1dd74b99 — dừng sớm khi cùng một lỗi chính lặp lại (T174)', () => {
  it('kb/plan_quality.yaml khai ngưỡng 3 lượt', () => {
    expect(parsePlanQuality(read('kb/plan_quality.yaml')).sameMainIssueRounds).toBe(3);
  });

  it(
    'ngưỡng 3: dừng sau lượt 4, KHÔNG gọi lượt 5; tắt ngưỡng thì gọi đủ 5 lượt',
    { timeout: 300_000 },
    async () => {
      expect(await replay(3)).toBe(4);
      expect(await replay(null)).toBe(5);
    },
  );
});

describe('mainProblemKey / sameMainProblem', () => {
  const at = (room: string, other: string): LevelRejection[] => [
    {
      level: 2,
      codes: ['arrange_room_below_brief_area', 'sketch_stair_only'],
      messages: [
        `Bản phác tầng 2 vẽ phòng "${room}" chỉ đủ khoảng 14.13 m² — đầu bài khai tối thiểu 17 m².`,
        `Bản phác tầng 2: "${other}" chỉ vào được qua ô thang.`,
      ],
    },
  ];

  it('lỗi chính bỏ số thứ tự phòng, bỏ qua lỗi phụ', () => {
    expect(mainProblemKey(at('bedroom_4', 'altar_room_1'))).toBe(
      mainProblemKey(at('bedroom_3', 'wc_4')),
    );
  });

  it('số đo đổi (phòng còn nhích) thì không phải lặp', () => {
    const moved = at('bedroom_4', 'wc_4');
    moved[0]!.messages[0] = moved[0]!.messages[0]!.replace('14.13', '15.2');
    expect(mainProblemKey(moved)).not.toBe(mainProblemKey(at('bedroom_4', 'wc_4')));
  });

  it('cần đúng số lượt LIỀN NHAU; lượt xếp được (null) cắt chuỗi; ngưỡng vắng = tắt', () => {
    expect(sameMainProblem(['a', 'b', 'b', 'b'], 3)).toBe(true);
    expect(sameMainProblem(['b', 'b'], 3)).toBe(false);
    expect(sameMainProblem(['b', null, 'b', 'b'], 3)).toBe(false);
    expect(sameMainProblem([null, null, null], 3)).toBe(false);
    expect(sameMainProblem(['b', 'b', 'b'], null)).toBe(false);
  });

  it('câu dừng cho màn hình nói số lượt, tầng và lỗi chính', () => {
    const stop = earlyStopOf(3, at('bedroom_3', 'wc_4'));
    expect(stop?.level).toBe(2);
    expect(stop?.message).toMatch(
      /^Đã dừng gọi lại mô hình: 3 lượt liền hỏng cùng một lỗi chính ở tầng 2 — /,
    );
    expect(stop?.message).toContain('"bedroom_3" chỉ đủ khoảng 14.13 m²');
  });

  it('ngưỡng sai kiểu thì tệp thước chấm không nạp được', () => {
    const yaml = read('kb/plan_quality.yaml');
    for (const bad of ['1', '2.5', 'abc']) {
      expect(() =>
        parsePlanQuality(
          yaml.replace(
            /^revision_stop_same_main_issue_rounds: \d+$/m,
            `revision_stop_same_main_issue_rounds: ${bad}`,
          ),
        ),
      ).toThrow(/revision_stop_same_main_issue_rounds/);
    }
  });
});

describe('Workflow còn nối phép dừng theo lỗi chính (quét mã)', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../workflows/ai-design.ts', import.meta.url)),
    'utf8',
  );
  it('ghi lỗi chính mỗi lượt, kiểm bằng ngưỡng của thước chấm, mang câu dừng ra kết quả', () => {
    expect(source).toMatch(/mains\.push\(mainProblemKey\(arranged\.rejections\)\)/);
    expect(source).toMatch(/sameMainProblem\(mains, sameMain\)/);
    expect(source).toMatch(/deps\.quality\.sameMainIssueRounds/);
    expect(source).toMatch(/earlyStop: early/);
  });
});

describe('lượt thật 1dd74b99 — câu nhắc nói lấy ô ở đâu (T174)', () => {
  it(
    'lượt 2: phòng ngủ 15 ô cần 19 → dời phòng ngủ kề về phía ban công còn dư, đúng số ô',
    { timeout: 300_000 },
    () => {
      const context = planContext(input);
      const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
      // Lượt 2 là câu trả lời cho câu nhắc của lượt 1 — dựng ý định đúng như vòng sửa ghép.
      const first = evaluateHouseBest(input, context, run.intents.round1!, generator, prompts);
      const intent = mergeRevision(
        (first.renamed ?? run.intents.round1) as HouseIntent,
        run.intents.round2!,
        first.settled ?? [],
      );
      const evaluation = evaluateHouseBest(input, context, intent, generator, prompts);
      const plan = retryPlan({ intent, issues: [] }, evaluation);
      expect(plan.kind).toBe('revise');
      const hints = plan.kind === 'revise' ? plan.avoid : [];
      const line = hints.find((hint) => hint.includes('came out at 14.13 m²'));
      expect(line).toBeDefined();
      // Phòng nào, tầng nào, đang bao nhiêu ô, cần bao nhiêu ô.
      expect(line).toMatch(
        /^- Storey 2: Room "bedroom_4" came out at 14.13 m² from 15 sketch cells .* at least 17 m²; it needs at least 19 cells./,
      );
      // Lấy ở đâu: ban công bc2 sau phòng ngủ bd3 (cùng bề rộng 5 ô), một dải 5 ô.
      expect(line).toContain('"balcony_2" beyond "bedroom_3" has spare area (about 6 m² spare)');
      expect(line).toContain('shift "bedroom_3" by 1 line of 5 cells toward "balcony_2"');
      expect(line).toContain('gives up 5 cells');
    },
  );
});
