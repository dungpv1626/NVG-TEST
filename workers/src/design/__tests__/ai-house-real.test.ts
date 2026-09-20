/**
 * Bộ giải ý định `ai/arrange/` trên ý định THẬT của mô hình — lượt đo 14/09/2026 (V-28).
 *
 * Lượt `9cce001a`, gpt-5-mini mức Thấp, «Biệt thự nhà vườn (demo)» 15 × 20 m, 2 tầng. Mô hình khai ý
 * định hợp lý mà bộ giải hỏng: tầng 2 bỏ rơi hai phòng không lối vào ở cả hai lượt, tầng 1 qua cổng
 * với phòng ngủ 1,78 × 14,6 m. Dữ liệu ở `fixtures/ai-run-5aba737d.json` — đầu bài đã lược danh tính,
 * ý định nguyên văn mô hình trả về.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { fileURLToPath, URL } from 'node:url';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseAreaNorms } from '../kb/space-norms';
import { parsePlanQuality } from '../ai/plan-quality';
import { evaluateHouse, planContext, programGenerator, type PlanContextInput } from '../ai/plan';
import { parseAiPrompts } from '../ai/prompts';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import { briefMinimums, type HouseIntent } from '../ai/house';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  VocabularyIndex,
  zoneDefaults,
} from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const areaNorms = parseAreaNorms(read('kb/space_norms.yaml'));

interface RecordedRun {
  digest: AiBriefDigest;
  intents: Record<string, HouseIntent>;
}
const loadRun = (id: string) =>
  JSON.parse(read(`workers/src/design/__tests__/fixtures/ai-run-${id}.json`)) as RecordedRun;
const run = loadRun('5aba737d');
/**
 * Lượt 4a521f52 (15/09/2026, gpt-5 mức Thấp, lời dẫn 5.0.0): cùng đầu bài. Ý định ba lượt đầu đọc lại từ
 * `<previous_intent>` của lượt sửa kế tiếp (lượt thứ tư không lưu). Mô hình khai mỗi tầng `stair` + `core`.
 */
const run4a52 = loadRun('4a521f52');
/**
 * Lượt 58688ead (16/09/2026, gpt-5 mức Vừa, lời dẫn 8.0.0): 1 lượt khai + 3 lượt sửa, cả ba lượt sửa cùng
 * lỗi «cửa gara chỉ đặt được trên cạnh giáp hàng xóm» với bản phác y hệt; lượt 4 qua vì mô hình đổi
 * `entry_room` từ sảnh sang phòng khách.
 */
const run588 = loadRun('58688ead');

const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);
const experience = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
  false,
);
const scoreRules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);

function contextInput(digest: AiBriefDigest = run.digest): PlanContextInput {
  return {
    digest,
    variant: { id: 'AI-A', label: 'AI-A', strategy: '' },
    labels: Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi])),
    vocabulary: new VocabularyIndex(vocabulary),
    fidelity: parseBriefFidelity(read('kb/brief_fidelity.yaml')),
    construction: parseConstructionNorms(read('kb/construction_norms.yaml')),
    siteContext: parseSiteContext(read('kb/site_context.yaml')),
    rules: selectedRulePack(NO_RULE_PACKS, { standards: new RulePack([], false), experience }),
    groups: {
      outdoor: new Set(groupsTable.outdoor ?? []),
      vertical: new Set(groupsTable.circulation ?? []),
      noDoorRequired: new Set(groupsTable.no_door_required ?? []),
      habitable: new Set(groupsTable.habitable ?? []),
      doorHosts: groupsTable.door_hosts ?? [],
      passage: passageRules(vocabulary),
    },
    mergeAllowed: mergeAllowed(vocabulary),
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: ['stair', 'core'],
    areaNorms,
    scoreRules,
    quality,
    roomGroups: groupsTable,
  };
}

const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const generator = programGenerator(
  { provider: 'fake', model: 'fake-1', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 },
  'ai_text_fake',
  prompts.version,
  false,
);

function evaluate(key: string, recorded: RecordedRun = run) {
  const input = { ...contextInput(recorded.digest), quality, scoreRules, roomGroups: groupsTable };
  return evaluateHouse(input, planContext(input), recorded.intents[key]!, generator, prompts);
}

describe('phát lại lượt đo 5aba737d (T45, V-29)', () => {
  for (const key of Object.keys(run.intents)) {
    it(`${key}: xếp được trọn hai tầng — trước sửa: tầng 2 hụt sàn đầu bài, rồi phòng không cửa`, () => {
      const evaluation = evaluate(key);
      expect(evaluation.rejections.flatMap((rejection) => rejection.messages)).toEqual([]);
      expect(evaluation.ok?.levels).toHaveLength(2);
    });

    it(`${key}: mọi phòng có mức đầu bài đạt mức ấy`, () => {
      const { ok } = evaluate(key);
      const minimums = briefMinimums(run.digest, ok!.program);
      for (const arranged of ok!.levels) {
        for (const room of arranged.level.rooms) {
          const need = [room.id, ...(room.also ?? [])].reduce(
            (sum, id) => sum + (minimums.get(id) ?? 0),
            0,
          );
          expect(Math.round(room.area_m2 * 10) / 10, room.id).toBeGreaterThanOrEqual(need);
        }
      }
    });

    it(`${key}: tầng 2 dùng hành lang có nhánh — hành lang mô hình khai tách thành nhiều dải, tổng diện tích giữ nguyên`, () => {
      const { ok } = evaluate(key);
      const upper = ok!.program.spaces.filter(
        (space) => space.level === 2 && space.type === 'circulation',
      );
      expect(upper.length).toBeGreaterThanOrEqual(2);
      const declared = run.intents[key]!.rooms.filter(
        (room) => room.level === 2 && room.type === 'circulation',
      );
      const total = (list: { target_area_m2: number }[]) =>
        Math.round(list.reduce((sum, item) => sum + item.target_area_m2, 0) * 10) / 10;
      expect(total(upper)).toBeCloseTo(total(declared), 0);
      const placed = ok!.levels[1]!.level.rooms.map((room) => room.id);
      for (const space of upper) expect(placed).toContain(space.id);
    });
  }
});

describe('phát lại lượt đo 4a521f52 — lõi thang khai riêng cạnh thang bộ', () => {
  for (const key of Object.keys(run4a52.intents)) {
    it(`${key}: lõi thang gộp vào ô thang cùng tầng — không lý do nào còn nói về ô thang`, () => {
      const evaluation = evaluate(key, run4a52);
      const messages = evaluation.rejections.flatMap((rejection) => rejection.messages);
      // Lỗi về chính ô thang (quá ngắn, quá hẹp) — «không đi tới được từ ô thang» là chuyện hành lang.
      expect(messages.filter((m) => /^(Ô thang|Phòng "(stair|core)_)/.test(m))).toEqual([]);
      expect(evaluation.renamed!.rooms.some((room) => room.type === 'core')).toBe(false);
      const declared = run4a52.intents[key]!.rooms;
      for (const level of [1, 2]) {
        const stairs = evaluation.renamed!.rooms.filter(
          (room) => room.level === level && room.type === 'stair',
        );
        expect(stairs, `tầng ${level}`).toHaveLength(1);
      }
      // Diện tích thang + lõi dồn vào MỘT không gian của danh mục.
      if (evaluation.ok) {
        for (const level of [1, 2]) {
          const total = declared
            .filter((room) => room.level === level && ['stair', 'core'].includes(room.type))
            .reduce((sum, room) => sum + room.target_area_m2, 0);
          const spaces = evaluation.ok.program.spaces.filter(
            (space) => space.level === level && space.type === 'stair',
          );
          expect(spaces.map((space) => space.target_area_m2)).toEqual([total]);
        }
      }
    });
  }

  for (const key of Object.keys(run4a52.intents)) {
    it(`${key}: xếp được trọn hai tầng — trước sửa: ô thang hẹp, rồi tầng 2 dồn phòng vào vùng không chứa nổi sàn đầu bài hoặc quá sâu cho phòng nhỏ`, () => {
      const evaluation = evaluate(key, run4a52);
      expect(evaluation.rejections.flatMap((rejection) => rejection.messages)).toEqual([]);
      expect(evaluation.ok?.levels).toHaveLength(2);
    });
  }
});

describe('phát lại lượt đo 58688ead — lượt sửa phí vì lỗi cửa ra ngoài', () => {
  for (const key of Object.keys(run588.intents)) {
    it(`${key}: xếp được ngay, không cần gọi lại mô hình — chương trình tự thử đổi phòng mang cửa chính`, () => {
      const evaluation = evaluate(key, run588);
      expect(evaluation.rejections.flatMap((rejection) => rejection.messages)).toEqual([]);
      expect(evaluation.ok?.levels).toHaveLength(2);
    });
  }

  it('round1: ghi chú nói rõ chương trình đã đổi phòng mang cửa chính', () => {
    const { ok } = evaluate('round1', run588);
    const notes = ok!.levels[0]!.notes.map((note) => note.code);
    expect(notes).toContain('entry_room_switched');
  });

  it('round4 (mô hình đã tự đổi lối vào): không đổi gì thêm', () => {
    const { ok } = evaluate('round4', run588);
    expect(ok!.levels[0]!.notes.map((note) => note.code)).not.toContain('entry_room_switched');
  });
});
