/**
 * Phát lại lượt chạy thật b1543b8c (29/09/2026, gpt-5.6-terra, lời dẫn 9.0.0) — mặt bằng 69,6 điểm Haan chấm ba
 * chỗ (T103). KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * - Thang tầng 1: ô mở từ phòng khách nằm giữa cạnh dài, chữ «LÊN» ở đầu bị tường bít. Nay lối vào ở ĐẦU NGẮN
 *   giáp hành lang, sát góc bậc 1 (`arrange/doors.ts` `stairEntry`).
 * - Tầng 2: giặt phơi nằm trong, phòng kỹ thuật chiếm góc cuối thoáng. Nay đổi chỗ (`arrange/open-face.ts`).
 * - Hành lang tầng 1 rộng 2,44 m. Nay thu hẹp về khung biệt thự, phần dư cho phòng bên kia (`arrange/corridor-trim.ts`,
 *   biến thể cả nhà của `evaluateHouseBest`).
 * - Khách – ăn – bếp: đầu bài chưa hỏi liền hay tách. Nay có câu hỏi `lifestyle.living_dining_kitchen`; trả lời
 *   «tách riêng» thì không gộp, không ô thông (bộ xếp: `ai-open-plan.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

type Digest = ReturnType<typeof loadRun>['digest'];

/** Ghép các vòng như đường chạy thật: câu trả lời sửa ghép lên gốc vòng trước, giữ tầng đã qua. */
function replay(digest: Digest, intents: Record<string, unknown>, rounds: number) {
  const input = { ...realContextInput(digest), mandatory };
  const context = planContext(input);
  const out = [];
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  for (let i = 1; i <= rounds; i += 1) {
    const answer = intents[`round${i}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    out.push(result);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return out;
}

const run = loadRun('b1543b8c');

describe('phát lại b1543b8c — thang, giặt phơi', () => {
  const rounds = replay(run.digest, run.intents, 6);
  const ok = rounds[5]!.ok!;
  const storey = (n: number) => ok.levels.find((lv) => lv.level.level === n)!;

  it('vòng 6 xếp được, qua ngưỡng 65 điểm', () => {
    expect(ok, JSON.stringify(rounds[5]!.rejections)).not.toBeNull();
    expect(ok.score.percent).toBeGreaterThanOrEqual(65);
  });

  it('thang tầng 1 vào từ hành lang ở đầu ngắn, ô mở sát góc bậc 1', () => {
    const tree = storey(1).tree;
    const entry = tree.doors.filter((d) => d.a === 'stair_1' || d.b === 'stair_1');
    expect(entry).toHaveLength(1);
    expect([entry[0]!.a, entry[0]!.b]).toContain('circulation_1');
    // Hành lang ở phía x0 của thang → lên +x, ô mở ở đầu toạ độ nhỏ (vế một chạy dọc y0).
    expect(tree.stair?.up).toBe('+x');
    expect(entry[0]!.place).toBe('start');
  });

  it('hành lang tầng 1 thu hẹp về khung biệt thự (1,5 m lọt lòng, sai số một mô-đun), phần dư cho phòng ngủ bên kia', () => {
    const rooms = storey(1).level.rooms;
    const hall = rooms.find((r) => r.id === 'circulation_1')!;
    const bedroom = rooms.find((r) => r.id === 'bedroom_1')!;
    const width = (r: typeof hall) => (r.rect[2] as number) - (r.rect[0] as number);
    // Trần 1,5 m lọt lòng; phần thu hẹp làm tròn XUỐNG theo mô-đun 5 cm nên có thể vượt tới một mô-đun.
    expect(width(hall)).toBeLessThanOrEqual(155);
    expect(width(hall)).toBeGreaterThanOrEqual(120);
    // Trước: hành lang 2,44 m, phòng ngủ 1 rộng 4,03 m.
    expect(width(bedroom)).toBeGreaterThan(450);
    expect(ok.levels[0]!.notes.map((n) => n.code)).toContain('corridor_trimmed');
  });

  it('giặt phơi tầng 2 ở góc cuối (mép sau), phòng kỹ thuật vào trong', () => {
    const rooms = storey(2).level.rooms;
    const laundry = rooms.find((r) => r.type === 'laundry')!;
    const technical = rooms.find((r) => r.type === 'technical')!;
    expect(laundry.rect[3] as number).toBeGreaterThan(technical.rect[3] as number);
  });
});

describe('phát lại b1543b8c — gia chủ trả lời «ba phòng tách riêng»', () => {
  const digest = structuredClone(run.digest);
  digest.lifestyle = {
    ...digest.lifestyle,
    living_dining_kitchen: 'tach_rieng',
  } as Digest['lifestyle'];
  const context = planContext({ ...realContextInput(digest), mandatory });

  it('không cặp khách / ăn / bếp nào còn được gộp, câu dặn mô hình có mặt', () => {
    const pairs = context.knowledge.merge_allowed.map((pair) => [...pair].sort().join('|'));
    for (const pair of ['dining|living', 'dining|kitchen', 'kitchen|living']) {
      expect(pairs).not.toContain(pair);
    }
    expect(pairs).toContain('altar_room|living');
    expect(context.demands.lines.some((line) => line.includes('BA phòng riêng'))).toBe(true);
  });
});
