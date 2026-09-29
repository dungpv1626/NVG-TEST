/**
 * T86 (26/09/2026) — tầng đã qua giữ nguyên ở lượt sửa. Lượt thật dc949b49: năm câu trả lời sửa đều vẽ
 * lại CẢ HAI tầng dù lời dẫn bảo chỉ trả tầng bị nêu; tầng đã qua bị vẽ lại rồi hỏng lại. Ở đây dùng lượt
 * thật 4b0268b1: vòng 2 tầng 1 qua (chỉ tầng 2 hỏng), câu trả lời vòng 3 vẽ lại cả tầng 1. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouse,
  mergeRevision,
  planContext,
  programGenerator,
  replaceKeptSketches,
  retryPlan,
  settledLevels,
} from '../ai/plan';
import { absorbUnknown, partitionRows, splitMerged } from '../ai/arrange/sketch';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

describe('settledLevels', () => {
  it('giữ tầng dưới tầng hỏng thấp nhất', () => {
    expect(settledLevels([1, 2, 3], [{ level: 3 }])).toEqual([1, 2]);
    expect(settledLevels([1, 2, 3], [{ level: 2 }, { level: 3 }])).toEqual([1]);
  });
  it('tầng trên tầng hỏng chưa qua gì: không giữ', () => {
    expect(settledLevels([1, 2, 3], [{ level: 1 }])).toEqual([]);
  });
  it('lỗi cả nhà (tầng 0) thì không giữ tầng nào', () => {
    expect(settledLevels([1, 2, 3], [{ level: 3 }, { level: 0 }])).toEqual([]);
  });
  it('không có lỗi thì không có gì để giữ', () => {
    expect(settledLevels([1, 2], [])).toEqual([]);
  });
});

const run = loadRun('4b0268b1');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);
const levelOf = (intent: HouseIntent, level: number) => ({
  rooms: intent.rooms.filter((room) => room.level === level),
  sketch: (intent.sketches ?? []).find((sketch) => sketch.level === level),
});

describe('phát lại 4b0268b1 — tầng 1 đã qua ở vòng 2, câu trả lời vòng 3 vẽ lại nó', () => {
  const round1 = evaluate(run.intents.round1 as HouseIntent);
  const round2 = evaluate(mergeRevision(round1.renamed!, run.intents.round2 as HouseIntent));

  it('vòng 2: chỉ tầng 2 hỏng → tầng 1 là tầng giữ, lượt sửa mang `keep` và câu nhắc nói rõ', () => {
    expect(round2.rejections.map((r) => r.level)).toEqual([2]);
    expect(round2.settled).toEqual([1]);
    const plan = retryPlan({ intent: round2.renamed, issues: [] }, round2);
    expect(plan.kind).toBe('revise');
    expect(plan.kind === 'revise' && plan.keep).toEqual([1]);
    expect(round2.hints.join('\n')).toMatch(/Storey 1 passed every check and is kept/);
  });

  it('ghép câu trả lời vòng 3: tầng 1 lấy nguyên vòng 2, tầng 2 lấy của câu trả lời', () => {
    const answer = run.intents.round3 as HouseIntent;
    expect((answer.sketches ?? []).map((sketch) => sketch.level)).toEqual([1, 2]);
    const merged = mergeRevision(round2.renamed!, answer, [1]);
    expect(levelOf(merged, 1)).toEqual(levelOf(round2.renamed!, 1));
    expect(levelOf(merged, 2).sketch).toEqual(levelOf(answer, 2).sketch);
    // Tầng 1 giữ nguyên thì vẫn qua: tầng hỏng (nếu có) chỉ còn tầng 2.
    const round3 = evaluate(merged);
    expect(round3.rejections.every((r) => r.level !== 1)).toBe(true);
  });

  it('không có `keep` thì như trước T86: câu trả lời đủ mọi tầng thay cả nhà', () => {
    const answer = run.intents.round3 as HouseIntent;
    expect(mergeRevision(round2.renamed!, answer)).toBe(answer);
  });
});

describe('tầng giữ đã bị chia lại: gửi cách chia thật làm bản phác (T86 phương án 1)', () => {
  const block = { x0: 0, y0: 0, x1: 400, y1: 300 };

  it('partitionRows: ô lấy phòng chồng lấn nhiều nhất — khe tường không thành lỗ «.»', () => {
    // Lòng phòng cách nhau 11 cm tường ở x = 200: tâm cột 2 (x = 150) và 3 (x = 250) vẫn đúng phòng.
    const rows = partitionRows(
      [
        { id: 'a', rect: [0, 0, 194.5, 300] },
        { id: 'b', rect: [205.5, 0, 400, 300] },
      ],
      block,
      4,
      3,
    );
    expect(rows).toEqual(['a a b b', 'a a b b', 'a a b b']);
  });

  it('partitionRows: phòng nhỏ hơn một ô vẫn còn trên bản phác; ngoài mọi phòng là «.»', () => {
    const rows = partitionRows(
      [
        { id: 'big', rect: [0, 0, 300, 300] },
        { id: 'tiny', rect: [120, 120, 160, 160] },
      ],
      block,
      4,
      3,
    );
    expect(rows.join(' ').split(' ')).toContain('tiny');
    expect(rows.map((row) => row.split(' ')[3])).toEqual(['.', '.', '.']);
  });

  it('splitMerged: phòng gộp (`also`) tách dọc cạnh dài theo diện tích mục tiêu', () => {
    const parts = splitMerged(
      [{ id: 'living_1', rect: [0, 0, 900, 400], also: ['dining_1'] }],
      (id) => (id === 'living_1' ? 20 : 10),
    );
    expect(parts).toEqual([
      { id: 'living_1', rect: [0, 0, 600, 400] },
      { id: 'dining_1', rect: [600, 0, 900, 400] },
    ]);
  });

  it('replaceKeptSketches: bản phác vẽ lại không xếp lại được thì giữ bản của mô hình (T97)', () => {
    // Vẽ lại lên lưới ô là phép làm tròn — lượt thật 5584bf0d: phòng ngủ 20 m² co còn 18 ô, vòng sau
    // cổng bác chính tầng «giữ nguyên». Không qua kiểm thì gửi lại bản phác cũ.
    const intent = {
      rooms: [
        { id: 'a', type: 'living', level: 1, target_area_m2: 20, ensuite_of: null },
        { id: 'b', type: 'bedroom', level: 1, target_area_m2: 12, ensuite_of: null },
      ],
      sketches: [{ level: 1, rows: ['a a a b', 'a a a b', 'a a a b'] }],
    } as unknown as HouseIntent;
    const arranged = [
      {
        level: {
          level: 1,
          rooms: [
            { id: 'a', rect: [0, 0, 194.5, 300] },
            { id: 'b', rect: [205.5, 0, 400, 300] },
          ],
        },
      },
    ] as unknown as Parameters<typeof replaceKeptSketches>[1];
    const seen: string[][] = [];
    const rejected = replaceKeptSketches(
      intent,
      arranged,
      [{ level: 1 }],
      [1],
      block,
      (_level, rows) => {
        seen.push([...rows]);
        return false;
      },
    );
    expect(seen).toEqual([['a a b b', 'a a b b', 'a a b b']]);
    expect(rejected.sketches![0]!.rows).toEqual(['a a a b', 'a a a b', 'a a a b']);
    const accepted = replaceKeptSketches(intent, arranged, [{ level: 1 }], [1], block, () => true);
    expect(accepted.sketches![0]!.rows).toEqual(['a a b b', 'a a b b', 'a a b b']);
  });

  it('absorbUnknown: phòng chương trình tự thêm nhập vào phòng giao thông kề nó', () => {
    const rows = absorbUnknown(
      ['a hall_9 circulation_1', 'a hall_9 b'],
      new Set(['a', 'b', 'circulation_1']),
    );
    expect(rows).toEqual(['a circulation_1 circulation_1', 'a circulation_1 b']);
  });
});

describe('phát lại dc949b49 — tầng 1 «qua nhờ chia lại» được giữ và không còn bị đòi sửa', () => {
  const dc = loadRun('dc949b49');
  const dcInput = { ...realContextInput(dc.digest), mandatory };
  const dcContext = planContext(dcInput);
  const dcEvaluate = (intent: HouseIntent) =>
    evaluateHouse(dcInput, dcContext, intent, generator, prompts);
  const round1 = dcEvaluate(dc.intents.round1 as HouseIntent);
  const round2 = dcEvaluate(mergeRevision(round1.renamed!, dc.intents.round2 as HouseIntent));

  it('vòng 2: tầng 1 giữ; câu nhắc chỉ về tầng 2 — trước T86 nó đòi sửa tầng 1 và vòng 3 làm hỏng hẳn tầng 1', () => {
    expect(round2.rejections.map((r) => r.level)).toEqual([2]);
    expect(round2.settled).toEqual([1]);
    const hints = round2.hints.join('\n');
    expect(hints).not.toMatch(/Your sketch of storey 1 failed/);
    expect(hints).not.toMatch(/Storey 1: Room "technical_1"/);
    expect(hints).toMatch(/Storey 1 passed every check and is kept/);
  });

  it('bản phác tầng 1 gửi lượt sửa là cách chia thật: đủ phòng của ý định, không lỗ giữa nhà', () => {
    const rows = round2.renamed!.sketches!.find((sketch) => sketch.level === 1)!.rows;
    const ids = new Set(rows.join(' ').split(' '));
    const ground = round2.renamed!.rooms.filter((room) => room.level === 1).map((room) => room.id);
    for (const id of ground) expect(ids.has(id), id).toBe(true);
    // Phòng ăn (gộp vào phòng khách ở mặt bằng) được tách lại.
    expect(ids.has('dining_1')).toBe(true);
    // Mỗi hàng: «.» chỉ ở mép (sân), không kẹp giữa hai phòng.
    for (const row of rows) expect(row).not.toMatch(/[a-z0-9] \. [a-z]/);
  });

  it('câu trả lời vòng 3 (vẽ lại tầng 1) ghép lên gốc vòng 2: tầng 1 không còn hỏng', () => {
    const merged = mergeRevision(round2.renamed!, dc.intents.round3 as HouseIntent, round2.settled);
    const round3 = dcEvaluate(merged);
    // Trước T86: vòng 3 hỏng ở TẦNG 1 (cửa chính, lối vào) — tầng đã qua bị vẽ lại và hỏng lại.
    expect(round3.rejections.every((r) => r.level !== 1)).toBe(true);
    expect(round3.settled).toEqual([1]);
  });
});
