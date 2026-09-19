/**
 * Ghép câu cho chỗ lệch quy chuẩn, từ mẫu câu ở `rules/messages.vi.yaml`.
 *
 * Vì sao phải có bản TypeScript của thứ Container đã có (`rules/messages.py`): nhánh AI không
 * đi qua Container (T14), nên câu phải ghép ở Worker. Cả hai đọc CÙNG một tệp mẫu câu — đó là
 * thứ giữ cho hai bên không nói khác nhau về cùng một quy tắc. Chép mẫu câu sang TypeScript thì
 * mới là hai nguồn.
 *
 * Tách phần phân tích (thuần, kiểm thử được) khỏi phần nạp tệp (`plan-messages-data.ts`), cùng
 * khuôn với `rules/rule-pack.ts` + `rules/rule-pack-data.ts`.
 */

import { load as parseYaml } from 'js-yaml';

interface MessageFile {
  templates?: Record<string, string>;
  source_labels?: Record<string, string>;
}

export class RuleMessages {
  constructor(private readonly file: MessageFile) {}

  /**
   * Ghép câu cho một chỗ lệch quy chuẩn.
   *
   * Tra mẫu câu theo MÃ QUY TẮC trước, không có thì lùi về mẫu câu chung của vị từ — giống hệt
   * `MessageCatalog.render` bên Python, nhờ đó một quy tắc mới dùng lại vị từ sẵn có vẫn có câu
   * đọc được mà không phải soạn thêm.
   *
   * Không bao giờ đưa mã quy tắc thô ra trước mặt người dùng (CGD 4.4): thiếu mẫu câu thì nói
   * rõ đang thiếu gì.
   */
  render(ruleId: string, predicate: string, params: Record<string, string | number>): string {
    const templates = this.file.templates ?? {};
    const template = templates[ruleId] ?? templates[predicate];
    if (!template) return `Phương án lệch một quy tắc chưa có mô tả (${ruleId}).`;

    let missing: string | null = null;
    const text = template.replace(/\{(\w+)\}/g, (_all, key: string) => {
      const value = params[key];
      if (value === undefined) {
        missing ??= key;
        return `{${key}}`;
      }
      return String(value);
    });
    return missing ? `Phương án lệch quy tắc ${ruleId} (thiếu tham số ${missing}).` : text;
  }
}

export function parseRuleMessages(yamlText: string): RuleMessages {
  return new RuleMessages((parseYaml(yamlText) ?? {}) as MessageFile);
}
