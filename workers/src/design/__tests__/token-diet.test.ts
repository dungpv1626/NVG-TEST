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
 * Lược đồ được đo ở đây là lược đồ MÔ HÌNH NHẬN, tức `ai-plan-rooms`. Hợp đồng artifact
 * `ai-floor-plan` không còn được gửi cho ai nên dung lượng của nó không còn tính tiền — nhưng quy
 * tắc `$defs` vẫn áp cho nó, vì một ngày nào đó nó có thể quay lại đường gửi.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { schemaFor, type SchemaProvider } from '../llm/schema-dialect';
import { planContext, planPrompt, stripWorkerFields, type PlanVariant } from '../ai/plan';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { RulePack } from '../rules/rule-pack';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import { parseVocabulary } from '../kb/vocabulary';
import { digestOf, TOWNHOUSE } from './ai-digest-fixtures';
import { roomsProposalOf, TOWNHOUSE_PLAN } from './ai-plan-fixtures';
import type { AiSpaceProgram } from '@nvg/shared/design';

const PROVIDERS: SchemaProvider[] = ['openai', 'anthropic', 'gemini'];
const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');
const contract = (name: string) => JSON.parse(read(`contracts/${name}`));

/** Lược đồ MÔ HÌNH NHẬN — thứ duy nhất tính tiền mỗi lượt gọi. */
const sent = contract('ai-plan-rooms.schema.json');

/** Hợp đồng artifact: không gửi cho ai, nhưng vẫn phải giữ kỷ luật `$defs`. */
const artifact = contract('ai-floor-plan.schema.json');

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
const PROGRAM: AiSpaceProgram = {
  schema_version: '1.0.0',
  brief_ref: `sha256:${'b'.repeat(64)}`,
  spaces: TOWNHOUSE_PLAN.levels.flatMap((level) =>
    level.rooms.map((room) => ({
      id: room.id,
      type: room.type,
      level: level.level,
      target_area_m2: room.area_m2,
    })),
  ),
  rationale: 'fixture',
  assumptions: [],
  generator: TOWNHOUSE_PLAN.generator,
};
const context = planContext({
  digest,
  program: PROGRAM,
  variant: VARIANT,
  labels,
  construction,
  siteContext,
  rules: selectedRulePack(NO_RULE_PACKS, {
    standards: new RulePack([], false),
    experience: new RulePack([], false),
  }),
});
// Bản cũ gửi kèm lượt SỬA là phần MÔ HÌNH KHAI, không phải artifact — từ T23 hai thứ đó khác
// hình dạng. `stripWorkerFields` vẫn đi qua đây vì nó là thứ đường chạy thật dùng.
const previous = stripWorkerFields(roomsProposalOf(TOWNHOUSE_PLAN));

describe('lược đồ gửi cho mô hình không được phình lại', () => {
  it('sau nội suy `$ref`, lược đồ gửi đi dưới 7.500 ký tự cho cả ba nhà cung cấp', () => {
    // Trần đặt trên số đo thật (6.179 ký tự, OpenAI) cộng chỗ thở ~20%. Vỡ trần nghĩa là ai đó
    // vừa thêm một đoạn văn vào `$defs` — chỗ đắt nhất của cả tệp, vì nó được chép lại ở mọi
    // chỗ dùng — hoặc vừa đem một nhánh đã cắt quay lại.
    for (const provider of PROVIDERS) {
      const size = JSON.stringify(schemaFor(provider, sent)).length;
      expect(size, `${provider}: ${size} ký tự`).toBeLessThan(7_500);
    }
  });

  it('lược đồ gửi đi KHÔNG mang nhánh tường — đó là chỗ T23 cắt', () => {
    // Phép thử này canh đúng thứ dễ quay lại nhất: ai đó thấy artifact có `walls` rồi thêm vào
    // hợp đồng của mô hình cho «đủ bộ». Thêm lại là mua lại cả 4.710 ký tự lược đồ và phần lớn
    // token đầu ra, cộng sáu phép kiểm chặn đã xoá.
    const text = JSON.stringify(schemaFor('openai', sent));
    for (const gone of ['walls', 'centreline', 'walls_derived']) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it('`$defs.cm` giữ `description` NGẮN — lý lẽ dài nằm ở `$comment`', () => {
    // `cm` được dùng qua `$ref` 10 chỗ trong tệp này, nên mỗi ký tự `description` của nó tốn 10
    // lần. Đây là chỗ duy nhất trong repo mà một dòng chú thích có hệ số nhân hai chữ số.
    for (const schema of [sent, artifact]) {
      const cm = schema.$defs.cm;
      expect(cm.description.length).toBeLessThan(150);
      expect(cm.$comment.length).toBeGreaterThan(300);
    }
    // Và `$comment` phải thật sự bị lược, không chỉ được kỳ vọng là bị lược.
    for (const provider of PROVIDERS) {
      expect(JSON.stringify(schemaFor(provider, sent)), provider).not.toContain('$comment');
    }
  });

  it('không `$defs` nào khác mang một đoạn văn dài', () => {
    // Cùng cái bẫy, chỗ khác. Ngưỡng 150 là ngưỡng «một câu», đủ để dặn mô hình mà không đủ để
    // kể lý do.
    for (const schema of [sent, artifact]) {
      const fat = Object.entries(schema.$defs as Record<string, { description?: string }>)
        .filter(([, def]) => (def.description?.length ?? 0) > 150)
        .map(([name, def]) => `${name}: ${def.description!.length} ký tự`);
      expect(fat).toEqual([]);
    }
  });
});

describe('thân lời gọi không mang khoảng trắng thuần', () => {
  it('`planPrompt` trả JSON KHÔNG thụt lề', () => {
    const body = planPrompt(digest, context.knowledge);
    // Đo thẳng: JSON không thụt lề thì không có dãy `\n` + khoảng trắng nào.
    expect(body).not.toMatch(/\n\s/);
    expect(body.startsWith('{"brief"')).toBe(true);
  });

  it('bản thụt lề đắt hơn hẳn — con số là lý do quy tắc này tồn tại', () => {
    const compact = planPrompt(digest, context.knowledge);
    const indented = JSON.stringify(JSON.parse(compact) as unknown, null, 1);
    const saved = indented.length - compact.length;
    expect(saved).toBeGreaterThan(500);
  });

  it('lượt SỬA cũng không thụt lề — đó là lượt thân lời gọi lớn nhất', () => {
    // Lượt sửa gửi kèm cả bản cũ, nên nó là lượt dài nhất và cũng là lượt đắt nhất.
    const body = planPrompt(digest, context.knowledge, previous as never);
    expect(body).not.toMatch(/\n\s/);
    expect(body.length).toBeGreaterThan(planPrompt(digest, context.knowledge).length);
  });
});
