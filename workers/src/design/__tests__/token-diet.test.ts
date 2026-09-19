/**
 * Chế độ ăn token (T26, 12/09/2026) — canh những byte KHÔNG mang tin nào.
 *
 * Vì sao cần phép thử thay vì một lần sửa: cả ba chỗ dưới đây đều lặng lẽ phình lại. Một dòng
 * `description` thêm vào `$defs` trông vô hại trong tệp hợp đồng, nhưng `llm/schema-dialect.ts`
 * nội suy `$defs` vào MỌI chỗ dùng `$ref` nên nó được gửi đi nhiều lần trong một lượt gọi; và một
 * `JSON.stringify(…, null, 2)` thêm vào cho dễ đọc nhật ký thì tính tiền ở mỗi lượt.
 *
 * Đo ngày 12/09/2026, hai đợt:
 *  · dời phần lý lẽ của `$defs.cm` sang `$comment` — lược đồ `ai-floor-plan` sau nội suy đi từ
 *    14.508 xuống 9.198 ký tự (−37%). `$comment` nằm trong `META_KEYS` nên bị lược cho cả ba nhà
 *    cung cấp, còn `description` thì không;
 *  · T23 — lược đồ GỬI ĐI đổi từ `ai-floor-plan` sang `ai-plan-rooms` (mô hình thôi khai tường):
 *    9.999 → **6.179** ký tự (OpenAI), tức −38% nữa và −57% so với điểm xuất phát.
 *
 * Từ T37 (13/09/2026) lược đồ GỬI ĐI là `ai-plan-tree` — MỘT TẦNG, chỉ cấu trúc. Từ T43 (14/09/2026)
 * là `ai-plan-intent` — ý định bố cục, không một toạ độ: 3.213 ký tự tệp gốc. Từ T45 (15/09/2026) là
 * `ai-house-intent` — ý định CẢ NHÀ trong một lượt, gồm diện tích mục tiêu mỗi phòng. `ai-plan-tree` và
 * `ai-plan-intent` nay là hợp đồng NỘI BỘ nhưng `ai-plan-tree` vẫn giữ kỷ luật `$defs`, cùng
 * `ai-floor-plan`: một ngày nào đó chúng có thể quay lại đường gửi.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAreaNorms } from '../kb/space-norms';
import { schemaFor, type SchemaProvider } from '../llm/schema-dialect';
import { housePrompt, planContext, type PlanVariant } from '../ai/plan';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { RulePack } from '../rules/rule-pack';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import { knowledgeOf } from '../brief/narrative';
import { parseAiPrompts } from '../ai/prompts';
import { load } from 'js-yaml';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  VocabularyIndex,
  zoneDefaults,
} from '../kb/vocabulary';
import { digestOf, TOWNHOUSE } from './ai-digest-fixtures';
import { TOWNHOUSE_HOUSE, VILLA_HOUSE } from './ai-house-fixtures';

const PROVIDERS: SchemaProvider[] = ['openai', 'anthropic', 'gemini'];
const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const areaNorms = parseAreaNorms(read('kb/space_norms.yaml'));
const contract = (name: string) => JSON.parse(read(`contracts/${name}`));

/** Lược đồ MÔ HÌNH NHẬN — thứ duy nhất tính tiền mỗi lượt gọi. */
const sent = contract('ai-house-intent.schema.json');

/** Hợp đồng không gửi cho ai (artifact, cây nội bộ), nhưng vẫn phải giữ kỷ luật `$defs.cm`. */
const unsent = [contract('ai-floor-plan.schema.json'), contract('ai-plan-tree.schema.json')];

// Lời dẫn THẬT, dựng từ cùng fixture mà `ai-plan.test.ts` dùng: đo trên một thân lời gọi giả nhỏ
// thì con số tiết kiệm cũng nhỏ, và phép thử sẽ không bắt được lần phình lại nào.
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const labels = Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi]));

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const siteContext = parseSiteContext(read('kb/site_context.yaml'));

const VARIANT: PlanVariant = {
  id: 'AI-B',
  label: 'Lõi thang dồn về sau',
  strategy: 'Push the stair core to the back.',
};
const digest = digestOf(TOWNHOUSE);
const groups = roomGroups(vocabulary);
const source = {
  digest,
  variant: VARIANT,
  labels,
  vocabulary: new VocabularyIndex(vocabulary),
  fidelity: parseBriefFidelity(read('kb/brief_fidelity.yaml')),
  construction,
  siteContext,
  rules: selectedRulePack(NO_RULE_PACKS, {
    standards: new RulePack([], false),
    experience: new RulePack([], false),
  }),
  groups: {
    outdoor: new Set(groups.outdoor ?? []),
    vertical: new Set(groups.circulation ?? []),
    noDoorRequired: new Set(groups.no_door_required ?? []),
    habitable: new Set(groups.habitable ?? []),
    doorHosts: groups.door_hosts ?? [],
    passage: passageRules(vocabulary),
  },
  mergeAllowed: mergeAllowed(vocabulary),
  zoneDefaults: zoneDefaults(vocabulary),
  stairTypes: ['stair', 'core'],
  areaNorms,
};
const context = planContext(source);
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));

describe('lược đồ gửi cho mô hình không được phình lại', () => {
  it('sau nội suy `$ref`, lược đồ gửi đi dưới 4.000 ký tự cho cả ba nhà cung cấp', () => {
    // Ý định cả nhà mang phòng, diện tích, vùng và quan hệ (T45). Vỡ trần nghĩa là ai đó vừa thêm một đoạn văn vào
    // `$defs` — chỗ đắt nhất, vì nó được chép lại ở mọi chỗ dùng — hoặc vừa đem một trường chương
    // trình tự suy quay lại lược đồ.
    for (const provider of PROVIDERS) {
      const size = JSON.stringify(schemaFor(provider, sent)).length;
      expect(size, `${provider}: ${size} ký tự`).toBeLessThan(4_000);
    }
  });

  it('lược đồ gửi đi KHÔNG hỏi mô hình một hình học nào — diện tích mục tiêu là con số DUY NHẤT (T45)', () => {
    // Canh đúng thứ dễ quay lại nhất: ai đó thấy artifact có cây, cửa, kích thước rồi thêm vào hợp
    // đồng của mô hình cho «đủ bộ». Mỗi trường là một phép số học giao lại cho mô hình — đúng chỗ
    // lượt 13/09/2026 đã hỏng (V-26, V-27).
    const text = JSON.stringify(schemaFor('openai', sent));
    for (const gone of [
      'nodes',
      'cut',
      'at',
      'footprint',
      'doors',
      'walls',
      'windows',
      'area_m2',
      'rect',
      'hinge',
      'treads',
      'outline',
    ]) {
      expect(text, gone).not.toContain(`"${gone}"`);
    }
  });

  it('`$defs.cm` của các hợp đồng còn mang toạ độ giữ `description` NGẮN — lý lẽ dài ở `$comment`', () => {
    // `cm` được dùng qua `$ref` nhiều chỗ trong mỗi tệp, nên mỗi ký tự `description` của nó tốn
    // nhiều lần.
    for (const schema of unsent) {
      const cm = schema.$defs.cm;
      expect(cm.description.length).toBeLessThan(150);
      expect(cm.$comment.length).toBeGreaterThan(300);
    }
    // Và `$comment` phải thật sự bị lược, không chỉ được kỳ vọng là bị lược.
    for (const provider of PROVIDERS) {
      expect(JSON.stringify(schemaFor(provider, sent)), provider).not.toContain('$comment');
    }
  });

  it('không `$defs` nào của lược đồ GỬI ĐI mang một đoạn văn dài', () => {
    // Ngưỡng 150 là ngưỡng «một câu», đủ để dặn mô hình mà không đủ để kể lý do.
    const fat = Object.entries(sent.$defs as Record<string, { description?: string }>)
      .filter(([, def]) => (def.description?.length ?? 0) > 150)
      .map(([name, def]) => `${name}: ${def.description!.length} ký tự`);
    expect(fat).toEqual([]);
  });
});

describe('thân lời gọi không mang khoảng trắng thuần', () => {
  const knowledgeText = (body: string) => /<knowledge>([\s\S]*?)<\/knowledge>/.exec(body)![1]!;
  const body = housePrompt(context.narrative, context.modelKnowledge);

  it('`housePrompt`: đầu bài văn xuôi đứng trước, tri thức là JSON KHÔNG thụt lề', () => {
    expect(body.startsWith('<brief>')).toBe(true);
    expect(knowledgeText(body)).not.toMatch(/\n\s/);
    expect(knowledgeOf(body)).toEqual(JSON.parse(JSON.stringify(context.modelKnowledge)));
  });

  it('bản thụt lề đắt hơn hẳn — con số là lý do quy tắc này tồn tại', () => {
    const compact = knowledgeText(body);
    const indented = JSON.stringify(JSON.parse(compact) as unknown, null, 1);
    expect(indented.length - compact.length).toBeGreaterThan(300);
  });

  it('tri thức gửi đi có trần — chỉ thứ văn xuôi đầu bài không nói (T46)', () => {
    // Trước T46 là ~9.000 ký tự: quy cách cửa, cửa sổ, lan can, danh sách không gian chép lại đầu bài.
    const text = knowledgeText(body);
    expect(text.length, `${text.length} ký tự`).toBeLessThan(2_500);
  });

  it('tri thức gửi đi KHÔNG chép lại đầu bài hay quy cách cấu tạo (T46)', () => {
    const sentKeys = Object.keys(knowledgeOf<Record<string, unknown>>(body));
    for (const gone of [
      'brief_spaces',
      'required_by_brief',
      'members',
      'construction',
      'building_type',
      'area_tolerance_ratio',
      'need_equivalents',
      'circulation_share',
      'variant_id',
      'zones',
      'yards',
      'access_faces',
    ]) {
      expect(sentKeys, gone).not.toContain(gone);
    }
  });

  it('loại thang gửi đi chỉ có «thang bộ» — lõi thang bị gộp vào ô thang khi xếp, đưa ra thì mô hình khai cả hai (lượt 4a521f52)', () => {
    const types = Object.keys(knowledgeOf<{ room_types: Record<string, string> }>(body).room_types);
    expect(types).toContain('stair');
    expect(types).not.toContain('core');
  });

  it('lời dẫn hệ thống + lược đồ gửi đi có trần (T46)', () => {
    const system = prompts.floorLevel.system;
    // 4.500 → 4.700 (16/09/2026, lời dẫn 8.0.0): hai gợi ý thiết kế từ «Nguyên tắc vàng» (~180 ký tự).
    expect(system.length, `${system.length} ký tự`).toBeLessThan(4_700);
    expect(system).not.toContain('<example>');
    const schema = JSON.stringify(schemaFor('openai', sent));
    expect(schema.length, `${schema.length} ký tự`).toBeLessThan(3_000);
  });

  it('KHÔNG một toạ độ cm nào rời Worker', () => {
    expect(knowledgeText(body)).not.toMatch(
      /"(x0|y0|x1|y1|footprint|buildable_cm|plot_cm|anchors)"/,
    );
  });

  it('ý định cả nhà mẫu vài nghìn ký tự — phần đầu ra là nửa đắt', () => {
    // Đầu ra đắt gấp 4–8 lần đầu vào. Trước T45 là chương trình không gian (~2.500 token) + mỗi tầng
    // một ý định ~1.000 ký tự; nay một lượt mang cả hai. T48 thêm bản phác: mỗi ô một mã, nên lời dẫn
    // đòi mã ngắn (≤ 6 ký tự) — đo với mã ngắn như mô hình được dặn viết.
    for (const intent of [TOWNHOUSE_HOUSE, VILLA_HOUSE]) {
      const short = new Map(intent.rooms.map((room, i) => [room.id, `r${i + 1}`]));
      const id = (value: string | null) => (value === null ? null : (short.get(value) ?? value));
      const written = {
        ...intent,
        rooms: intent.rooms.map((room) => ({
          ...room,
          id: id(room.id),
          ensuite_of: id(room.ensuite_of),
        })),
        relationships: intent.relationships.map((rel) => ({ ...rel, a: id(rel.a), b: id(rel.b) })),
        sketches: intent.sketches.map((sketch) => ({
          ...sketch,
          rows: sketch.rows.map((row) => row.split(' ').map(id).join(' ')),
        })),
        entry_room: id(intent.entry_room),
        garage_room: id(intent.garage_room),
      };
      expect(JSON.stringify(written).length).toBeLessThan(4_500);
    }
  });
});
