/**
 * Handoff v6 sửa lỗi đợt 2 (sau lượt thật 41ffe1e5, 06/10/2026): kiểm lối vào ngay trên dải và mọi lỗi một lần (1.1),
 * bề rộng lọt lòng (1.2), mái do chương trình dựng (2), chuẩn hoá mềm / không lấy mẫu lại / thang tầng 1 là mốc / so theo
 * từng tầng (3), dạng gọn (4.2). KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { bandAccessIssues } from '../ai/bands/access';
import { compactBands, compactCell, expandCell, expandCompact } from '../ai/bands/compact';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  ANSWER_STAGE_CODE,
  bandsAttempt,
  generateAiPlan,
  normalizeBandsAnswer,
  planContext,
  promptsFor,
  revisionBase,
} from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import {
  NHAONG_BANDS,
  NHAONG_BANDS_PRE_KTS,
  NHAONG_BANDS_T2,
  withDemoAreas,
} from './ai-bands-helpers';
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
const context = planContext(input);
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
/** Chạy cả lượt với các câu trả lời cho trước; trả lời dẫn từng lời gọi. */
const run = async (answers: unknown[]) => {
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
  }).catch((error: unknown) => error);
  return { options, result };
};
const storey = (bands: AiHouseBands, level: string) =>
  bands.storeys.find((s) => s.level === level)!;
const withStorey = (bands: AiHouseBands, level: string, next: AiHouseBands['storeys'][number]) => ({
  ...bands,
  storeys: bands.storeys.map((s) => (s.level === level ? next : s)),
});
const c = (id: string, w = 0) => ({ id, w, stack: [] as { id: string; d: number }[] });
const st = (...ids: string[]) => ({ id: '', w: 0, stack: ids.map((id) => ({ id, d: 0 })) });

describe('dạng gọn (4.2)', () => {
  it('ô chuỗi ↔ ô đối tượng: phòng, ô xếp chồng, bề rộng lọt lòng', () => {
    expect(expandCell('living_1')).toEqual({ id: 'living_1', w: 0, stack: [] });
    expect(expandCell('gt_1:900')).toEqual({ id: 'gt_1', w: 900, stack: [] });
    expect(expandCell('wc_1/light_well_1')).toEqual({
      id: '',
      w: 0,
      stack: [
        { id: 'wc_1', d: 0 },
        { id: 'light_well_1', d: 0 },
      ],
    });
    for (const text of ['THANG:2500', '.', 'wc_ngu_ob/gt_t2:900', 'ngu_ob'])
      expect(compactCell(expandCell(text))).toBe(text);
  });

  it('bộ dải viết tay gửi ở dạng gọn → bung ra, một lời gọi, qua cổng', async () => {
    const compact = { ...NHAONG_BANDS, ...compactBands(NHAONG_BANDS) };
    expect(JSON.stringify(compact)).not.toContain('"stack"');
    expect(expandCompact(compact)).toMatchObject({ storeys: NHAONG_BANDS.storeys });
    const { options, result } = await run([compact]);
    expect(options).toHaveLength(1);
    expect(result).not.toBeInstanceOf(Error);
  });

  it('vòng sửa gửi <plan> dạng gọn, không gửi lại chữ của mô hình (lý giải, ghi chú)', async () => {
    const broken = withStorey(NHAONG_BANDS, '4', {
      level: '4',
      bands: [...storey(NHAONG_BANDS, '4').bands, { depth: 0, cells: [c('kho_9')] }],
    });
    const { options } = await run([
      broken,
      { storeys: [], doors_prefer: [], cantilevers_upsert: [], notes: [] },
    ]);
    const tail = options[1]!.promptTail ?? '';
    const plan = tail.slice(tail.indexOf('<plan>'));
    expect(plan).toContain('"wc_1:1200"');
    expect(plan).not.toContain('"rationale"');
    expect(plan).not.toContain('"stack"');
  });
});

describe('chuẩn hoá mềm, không lấy mẫu lại (3.1, 3.2)', () => {
  it('mã viết hoa, «stair», đường dẫn knowledge, trường thiếu → sửa và ghi lại', () => {
    const { json, changes } = normalizeBandsAnswer(
      {
        storeys: [
          {
            level: 1,
            bands: [
              {
                cells: [
                  { id: 'Garage_1' },
                  { id: 'stair', w: 2500 },
                  { id: 'knowledge.model_added.gt_1' },
                ],
              },
            ],
          },
        ],
        doors_prefer: [['Garage_1', 'living_1']],
      },
      false,
    );
    const cells = (json as AiHouseBands).storeys[0]!.bands[0]!.cells;
    expect(cells.map((cell) => cell.id)).toEqual(['garage_1', 'THANG', 'gt_1']);
    expect((json as AiHouseBands).storeys[0]!.level).toBe('1');
    expect((json as AiHouseBands).design_notes).toEqual([]);
    expect(changes.join('; ')).toMatch(/stair» → THANG/);
    expect(changes.join('; ')).toMatch(/chữ thường/);
    expect(changes.join('; ')).toMatch(/thiếu «design_notes»/);
  });

  it('câu trả lời đủ khung dải mà sai hợp đồng → vòng sau SỬA chính bộ ấy (delta), không lấy mẫu lại', async () => {
    // `w` âm: hợp đồng bác, nhưng khung dải đủ.
    const bad = withStorey(NHAONG_BANDS, '2', {
      level: '2',
      bands: [
        { depth: 0, cells: [c('gt_1', -5), st('ngu_ob', 'wc_ngu_ob')] },
        ...storey(NHAONG_BANDS, '2').bands.slice(1),
      ],
    });
    const { options } = await run([
      bad,
      { storeys: [], doors_prefer: [], cantilevers_upsert: [], notes: [] },
    ]);
    expect(options[1]!.schema).toMatchObject({ title: 'AiHouseBandsDeltaCompact' });
    expect(options[1]!.promptTail).toContain('<plan>');
  });

  it('bản sửa hỏng hợp đồng → vòng sau vẫn SỬA từ bản cũ', async () => {
    const broken = withStorey(NHAONG_BANDS, '4', {
      level: '4',
      bands: [...storey(NHAONG_BANDS, '4').bands, { depth: 0, cells: [c('kho_9')] }],
    });
    const { options } = await run([
      broken,
      {
        storeys: [{ level: '4', bands: 'x' }],
        doors_prefer: [],
        cantilevers_upsert: [],
        notes: [],
      },
      NHAONG_BANDS,
    ]);
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options[2]!.schema).toMatchObject({ title: 'AiHouseBandsDeltaCompact' });
    expect(options[2]!.promptTail).toContain('<plan>');
  });
});

describe('so bản sửa theo từng tầng (3.4)', () => {
  const failed = (messages: string[]) => ({
    rejections: [{ level: 0, messages, codes: [ANSWER_STAGE_CODE] }],
    hints: messages,
  });
  it('lượt mới nhiều lỗi hơn nhưng khá hơn ở MỘT tầng → giữ lượt mới', () => {
    const best = failed(['- R2 Storey 1: a', '- R2 Storey 1: b']);
    const next = failed(['- R2 Storey 1: a', '- R2 Storey 2: c', '- R2 Storey 3: d']);
    expect(revisionBase(best, next, prompts).next).toBe(next);
  });
  it('lượt mới không khá hơn ở tầng nào, tệ hơn ở một tầng → gạt', () => {
    const best = failed(['- R2 Storey 1: a']);
    const next = failed(['- R2 Storey 1: a', '- R2 Storey 2: c']);
    expect(revisionBase(best, next, prompts).best).toBe(best);
  });
});

describe('kiểm lối vào trên dải và mọi lỗi một lần (1.1)', () => {
  const access = (bands: AiHouseBands) =>
    bandAccessIssues({
      storeys: bands.storeys,
      widthCm: 500,
      stairToken: 'THANG',
      stairWidthCm: 250,
      typeOf: (id) =>
        id.startsWith('gt_')
          ? 'circulation'
          : id.startsWith('wc')
            ? 'wc'
            : id.startsWith('ngu')
              ? 'bedroom'
              : 'study',
      minSideCm: () => 100,
      through: new Set(['circulation']),
      stairOpensTo: new Set(['circulation']),
      parentOf: (id) => (id === 'wc_ngu_ob' ? 'ngu_ob' : null),
      servedFrom: null,
      noDoor: new Set(),
      entryRooms: [],
    });
  it('phòng trước ô [WC / hành lang]: hành lang đứng SAU trong ô xếp chồng → không lối vào (lượt thật 41ffe1e5)', () => {
    const bands = {
      ...NHAONG_BANDS,
      storeys: [
        {
          level: '2',
          bands: [
            { depth: 0, cells: [c('ngu_ob')] },
            { depth: 0, cells: [c('study_1'), st('wc_ngu_ob', 'gt_2')] },
            { depth: 0, cells: [c('THANG'), c('gt_3', 900)] },
          ],
        },
      ],
    } as AiHouseBands;
    expect(access(bands).map((issue) => issue.room)).toContain('ngu_ob');
    // Hành lang đứng riêng một ô, chạm phòng ngủ phía trước và hành lang cạnh thang phía sau → có lối vào.
    const fixed = {
      ...bands,
      storeys: [
        {
          level: '2',
          bands: [
            { depth: 0, cells: [c('ngu_ob')] },
            { depth: 0, cells: [c('study_1'), c('gt_2', 900)] },
            { depth: 0, cells: [c('THANG'), c('gt_3', 900)] },
          ],
        },
      ],
    } as AiHouseBands;
    expect(access(fixed).map((issue) => issue.room)).not.toContain('ngu_ob');
    // Hành lang đứng TRƯỚC WC trong ô xếp chồng: chạm phòng ngủ phía trước nhưng không chạm dải thang phía sau (chỉ
    // phần CUỐI — WC — chạm) → hành lang cụt, phòng ngủ vẫn không lối vào (lượt thật 41ffe1e5 tầng 4).
    const stub = {
      ...bands,
      storeys: [
        {
          level: '2',
          bands: [
            { depth: 0, cells: [c('ngu_ob')] },
            { depth: 0, cells: [c('study_1'), st('gt_2', 'wc_ngu_ob')] },
            { depth: 0, cells: [c('THANG'), c('gt_3', 900)] },
          ],
        },
      ],
    } as AiHouseBands;
    expect(access(stub).map((issue) => issue.room)).toEqual(
      expect.arrayContaining(['gt_2', 'ngu_ob']),
    );
  });

  it('bộ dải viết tay: không lỗi lối vào', () => {
    const issues = attempt(NHAONG_BANDS).issues.filter((line) => /has no way in/.test(line));
    expect(issues).toEqual([]);
  });
});

describe('mái do chương trình dựng (2)', () => {
  it('tri thức gửi mô hình không có mã mái; tầng «roof» mô hình gửi bị bỏ, vẫn qua cổng', async () => {
    const program = (context.modelKnowledge as { program: unknown[][] }).program;
    expect(program.some((row) => row[2] === 'roof')).toBe(false);
    const withJunkRoof = {
      ...NHAONG_BANDS,
      storeys: [
        ...NHAONG_BANDS.storeys.filter((s) => s.level !== 'roof'),
        { level: 'roof', bands: [{ depth: 0, cells: [c('THANG'), c('gt_9')] }] },
      ],
    };
    const { result } = await run([withJunkRoof]);
    expect(result).not.toBeInstanceOf(Error);
  });
});

describe('thang tầng 1 là mốc cố định (3.3)', () => {
  it('tầng 1 vừa khối, tầng trên dồn trước thang quá chỗ → nêu tầng trên, không nêu tầng 1', () => {
    const s4 = storey(NHAONG_BANDS, '4');
    const crowded = withStorey(NHAONG_BANDS, '4', {
      level: '4',
      bands: [
        ...['kho_9', 'kho_8', 'kho_7', 'kho_6', 'kho_5'].map((id) => ({
          depth: 0,
          cells: [c(id)],
        })),
        ...s4.bands,
      ],
    });
    const text = attempt(crowded).issues.join('\n');
    expect(text).toMatch(/The storey out of line is storey 4/);
    expect(text).not.toMatch(/Storey 1: the bands/);
  });
});

describe('bề rộng lọt lòng (1.2)', () => {
  it('WC nhà ống cần 1,1 m lọt lòng: ô ghi 1.000 thiếu, ghi 1.100 đủ', () => {
    // Bộ dải trước đợt 3: ô bên thang chỉ còn 1,05 m — WC ghi 1.000 không nới được.
    const s1 = storey(NHAONG_BANDS_T2, '1');
    const narrow = withStorey(NHAONG_BANDS_T2, '1', {
      level: '1',
      bands: [
        ...s1.bands.slice(0, 3),
        { depth: 0, cells: [c('THANG'), c('wc_1', 1000), c('light_well_1')] },
      ],
    });
    expect(attempt(narrow).issues.join('\n')).toMatch(/"wc_1" lacks/);
    expect(attempt(NHAONG_BANDS).issues).toEqual([]);
  });
});

describe('đầu thang tầng 1 chọn theo cả nhà (T116 tiếp 10, M156)', () => {
  it('tầng 1 vào được cả hai đầu, tầng trên chỉ có sảnh đầu trước → chọn đầu trước, không phải chèn sảnh', () => {
    const pre = {
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
    const ctx = planContext(pre);
    const result = bandsAttempt(
      ctx,
      ctx.layout!,
      ctx.bands!,
      promptsFor(ctx, prompts),
      NHAONG_BANDS_PRE_KTS,
      {} as never,
      ctx.roof?.level,
    );
    // Bộ dải cũ vướng luật WC / mặt thoáng của đợt 3 — ở đây chỉ xét thang và sảnh đầu thang.
    expect(result.issues.filter((line) => /THANG|thang_\d/.test(line))).toEqual([]);
    expect(result.layoutFixes?.join('\n') ?? '').not.toMatch(/chèn sảnh/);
  });
});
