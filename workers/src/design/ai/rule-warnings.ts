/**
 * Cảnh báo quy chuẩn trên CHƯƠNG TRÌNH KHÔNG GIAN — đối chiếu diện tích mong muốn với
 * `rules/base/`.
 *
 * Đây là nửa sau của T14 áp cho bước lập chương trình, đúng cách bộ kiểm mặt bằng của Đợt 2 sẽ làm
 * cho bước sau: mô hình KHÔNG nhận ngưỡng trong lời dẫn, nhưng sau khi nó trả về thì đo lại và nói
 * ra chỗ lệch.
 *
 * Ba điều tệp này không làm, đều có chủ đích:
 *  · **Không chặn.** Diện tích dưới ngưỡng vẫn giữ nguyên trong đề xuất — kiến trúc sư quyết.
 *  · **Không tự nâng diện tích.** Sửa hộ là đổi phương án của mô hình mà không ai thấy.
 *  · **Không đọc gói địa phương.** Chỉ `rules/base/` (`nationalRulePack()`): quy định riêng
 *    của một tỉnh không phải thứ đem cảnh báo trên một bản phác.
 *
 * ⚠️ Chỉ đo được HAI vị từ ở bước này — `min_area` và `max_area` — vì chương trình không gian
 * mới chỉ có diện tích, chưa có hình dạng. Danh sách quy tắc CHƯA đối chiếu được trả về cùng
 * kết quả: một danh sách cảnh báo rỗng rất dễ đọc thành "đạt quy chuẩn", trong khi nó chỉ có
 * nghĩa là "không lệch trong số thứ đo được ở bước này".
 */

import { formatNumber } from '@nvg/shared/format';
import type { Rule, RulePack, RuleSeverity } from '../rules/rule-pack';
import type { RuleMessages } from './plan-messages';

/** Vị từ đo được trên một con số diện tích, không cần toạ độ. */
const MEASURABLE = new Set(['min_area', 'max_area']);

export interface ProgramWarning {
  ruleId: string;
  severity: RuleSeverity;
  /** Văn bản quy chuẩn, nguyên văn trường `source` của quy tắc. */
  source: string;
  message: string;
  spaceId: string;
}

export interface ProgramReview {
  warnings: ProgramWarning[];
  /** Mã quy tắc đã đối chiếu được ở bước này. */
  checked: string[];
  /** Mã quy tắc CHƯA đối chiếu được — để màn hình nói thật về phạm vi đã soát. */
  unchecked: Array<{ ruleId: string; predicate: string; source: string }>;
}

export interface ReviewableSpace {
  id: string;
  type: string;
  target_area_m2: number;
}

export function reviewProgramAreas(input: {
  spaces: ReviewableSpace[];
  buildingType: string;
  rules: RulePack;
  /** Mã loại → nhãn tiếng Việt, để câu cảnh báo gọi tên phòng như người dùng thấy. */
  labels: Record<string, string>;
  messages: RuleMessages;
}): ProgramReview {
  const { spaces, buildingType, rules, labels, messages } = input;
  const applicable = rules.rules.filter((r) => r.applies_to.includes(buildingType));

  const unchecked: ProgramReview['unchecked'] = [];
  for (const rule of applicable) {
    if (!MEASURABLE.has(rule.predicate)) {
      unchecked.push({ ruleId: rule.id, predicate: rule.predicate, source: rule.source });
    }
  }

  const checked = new Set<string>();
  const warnings: ProgramWarning[] = [];
  const nameOf = (type: string): string => labels[type] ?? type;

  for (const space of spaces) {
    for (const rule of applicable) {
      if (!MEASURABLE.has(rule.predicate)) continue;
      if (!targets(rule, space.type)) continue;
      checked.add(rule.id);

      const required = Number(rule.params.value_m2);
      if (!Number.isFinite(required)) continue;
      const actual = space.target_area_m2;
      const violated =
        rule.predicate === 'min_area' ? actual + 0.05 < required : actual > required + 0.05;
      if (!violated) continue;

      warnings.push({
        ruleId: rule.id,
        severity: rule.severity,
        source: rule.source,
        message: messages.render(rule.id, rule.predicate, {
          room: nameOf(space.type),
          actual: formatNumber(actual),
          required: formatNumber(required),
        }),
        spaceId: space.id,
      });
    }
  }

  return { warnings, checked: [...checked].sort(), unchecked };
}

/** Quy tắc có nhắm tới loại phòng này không. `target` vắng mặt nghĩa là áp cho mọi phòng. */
function targets(rule: Rule, roomType: string): boolean {
  const target = rule.params.target;
  if (target === undefined || target === null) return true;
  return String(target) === roomType;
}
