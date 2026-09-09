/**
 * Điểm nạp `rules/messages.vi.yaml` vào bản dựng Worker — cùng khuôn với
 * `rules/rule-pack-data.ts`. Worker không có hệ tệp lúc chạy nên tệp dữ liệu phải nhúng vào
 * bản dựng dưới dạng văn bản (`wrangler.jsonc`, mục `rules` kiểu `Text`).
 *
 * Tách khỏi `plan-messages.ts` để phần ghép câu kiểm thử được mà không cần trình gói: nhóm test
 * không hiểu `import` một tệp YAML.
 */

import messagesYaml from '../../../../rules/messages.vi.yaml';
import { parseRuleMessages, type RuleMessages } from './plan-messages';

let cached: RuleMessages | undefined;

export function ruleMessages(): RuleMessages {
  cached ??= parseRuleMessages(messagesYaml as unknown as string);
  return cached;
}
