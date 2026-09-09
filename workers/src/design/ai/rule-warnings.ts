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

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import { formatNumber } from '@nvg/shared/format';
import type { Rule, RulePack, RuleSeverity } from '../rules/rule-pack';
import { rectHeight, rectWidth, toRect } from './draw/geometry';
import { prepareWalls } from './draw/walls';
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
  /** Mã nhóm → danh sách mã phòng, từ `kb/room_vocabulary.yaml` mục `group_targets`. */
  groups: Record<string, string[]>;
  messages: RuleMessages;
}): ProgramReview {
  const { spaces, buildingType, rules, labels, groups, messages } = input;
  const applicable = rules.rules.filter((r) => r.applies_to.includes(buildingType));

  const unchecked: ProgramReview['unchecked'] = [];
  for (const rule of applicable) {
    if (!MEASURABLE.has(rule.predicate) || !targetIsKnown(rule, labels, groups)) {
      unchecked.push({ ruleId: rule.id, predicate: rule.predicate, source: rule.source });
    }
  }

  const checked = new Set<string>();
  const warnings: ProgramWarning[] = [];
  const nameOf = (type: string): string => labels[type] ?? type;

  for (const space of spaces) {
    for (const rule of applicable) {
      if (!MEASURABLE.has(rule.predicate)) continue;
      if (!targetIsKnown(rule, labels, groups)) continue;
      if (!targets(rule, space.type, groups)) continue;
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

/**
 * Quy tắc có nhắm tới loại phòng này không.
 *
 * `target` nhận BA dạng, và bỏ sót dạng thứ hai là cách im lặng nhất để một quy tắc không bao
 * giờ chạy: vắng mặt hoặc `all` (mọi phòng) · một MÃ NHÓM của `kb/room_vocabulary.yaml` mục
 * `group_targets` (`habitable`, `outdoor`, `service`…) · một mã phòng cụ thể.
 *
 * Đo 09/09/2026: cả ba quy tắc `aspect_ratio_max` đều nhắm nhóm (`habitable`, `outdoor`,
 * `service`). So thẳng chuỗi thì chúng không khớp phòng nào, không sinh cảnh báo, và cũng
 * không rơi vào danh sách «chưa đối chiếu được» — tức là biến mất hẳn khỏi màn hình.
 */
function targets(rule: Rule, roomType: string, groups: Record<string, string[]>): boolean {
  const target = rule.params.target;
  if (target === undefined || target === null || target === 'all') return true;
  const name = String(target);
  if (name === roomType) return true;
  return groups[name]?.includes(roomType) ?? false;
}

/**
 * `target` của quy tắc có trỏ tới thứ gì hệ thống biết không.
 *
 * Mã lạ nghĩa là quy tắc CHƯA TỪNG chạy — đúng thứ đã xảy ra thật với `lightwell_max_area`
 * (khai `lightwell` trong khi từ vựng ghi `light_well`; xem ghi chú đầu
 * `rules/nvg-experience.yaml`). Trả `false` ở đây để nó hiện lên danh sách «chưa đối chiếu
 * được» thay vì lặng lẽ không làm gì.
 */
function targetIsKnown(
  rule: Rule,
  labels: Record<string, string>,
  groups: Record<string, string[]>,
): boolean {
  const target = rule.params.target;
  if (target === undefined || target === null || target === 'all') return true;
  const name = String(target);
  return name in labels || name in groups;
}

// ---------------------------------------------------------------------------
// Cảnh báo quy chuẩn trên MẶT BẰNG — đo trên chữ nhật phòng, không chỉ trên diện tích
// ---------------------------------------------------------------------------

/**
 * Vị từ đo được khi đã có hình: thêm bề rộng lọt lòng, tỷ lệ dài/rộng và yêu cầu chiếu sáng.
 *
 * `requires_access` cố ý KHÔNG nằm ở đây dù đo được: «phòng phải có lối vào» đã là một phép
 * kiểm CHẶN của `plan-check.ts` (`room_without_door`). Đo hai lần ở hai nơi thì một hôm nào đó
 * hai nơi sẽ nói khác nhau, và người đọc không biết tin bên nào.
 */
const MEASURABLE_ON_PLAN = new Set([
  'min_area',
  'max_area',
  'min_dimension',
  'aspect_ratio_max',
  'requires_daylight',
]);

/** Sai lệch bỏ qua khi so số đo với ngưỡng, mét — dưới mức này là chuyện làm tròn. */
const MEASURE_SLACK_M = 0.05;

export interface PlanWarning extends ProgramWarning {
  /** Tầng chứa phòng — cùng một mã phòng không xuất hiện ở hai tầng, nhưng màn hình cần nói ra. */
  level: number;
}

export interface PlanReview {
  warnings: PlanWarning[];
  checked: string[];
  unchecked: ProgramReview['unchecked'];
}

/**
 * Đối chiếu mặt bằng đã đề xuất với gói quy tắc kỹ sư đã tích — SAU khi mô hình trả về, và
 * KHÔNG chặn (T14, T20).
 *
 * Đơn vị: hợp đồng mặt bằng khai bằng xăng-ti-mét, rule pack khai bằng mét. Đổi ở đây, một
 * chỗ, ngay khi đọc chữ nhật — chứ không đổi rải rác ở từng phép so.
 */
export function reviewPlanRooms(input: {
  levels: readonly AiFloorPlanLevel[];
  buildingType: string;
  rules: RulePack;
  labels: Record<string, string>;
  /** Mã nhóm → danh sách mã phòng, từ `kb/room_vocabulary.yaml` mục `group_targets`. */
  groups: Record<string, string[]>;
  messages: RuleMessages;
}): PlanReview {
  const { levels, buildingType, rules, labels, groups, messages } = input;
  const applicable = rules.rules.filter((rule) => rule.applies_to.includes(buildingType));

  const unchecked: ProgramReview['unchecked'] = applicable
    .filter(
      (rule) => !MEASURABLE_ON_PLAN.has(rule.predicate) || !targetIsKnown(rule, labels, groups),
    )
    .map((rule) => ({ ruleId: rule.id, predicate: rule.predicate, source: rule.source }));

  const checked = new Set<string>();
  const warnings: PlanWarning[] = [];
  const nameOf = (type: string): string => labels[type] ?? type;

  for (const level of levels) {
    const daylit = roomsWithDaylight(level);

    for (const room of level.rooms) {
      const rect = toRect(room.rect);
      const widthM = Math.min(rectWidth(rect), rectHeight(rect)) / 100;
      const longM = Math.max(rectWidth(rect), rectHeight(rect)) / 100;
      const areaM2 = (rectWidth(rect) * rectHeight(rect)) / 10_000;

      for (const rule of applicable) {
        if (!MEASURABLE_ON_PLAN.has(rule.predicate)) continue;
        if (!targetIsKnown(rule, labels, groups)) continue;
        if (!targets(rule, room.type, groups)) continue;
        checked.add(rule.id);

        const measured = measure(rule, { areaM2, widthM, longM, daylit: daylit.has(room.id) });
        if (!measured || !measured.violated) continue;

        warnings.push({
          ruleId: rule.id,
          severity: rule.severity,
          source: rule.source,
          message: messages.render(rule.id, rule.predicate, {
            room: room.label?.trim() || nameOf(room.type),
            actual: measured.actual,
            required: measured.required,
          }),
          spaceId: room.id,
          level: level.level,
        });
      }
    }
  }

  return { warnings, checked: [...checked].sort(), unchecked };
}

/** So một phòng với một quy tắc. Trả `null` khi quy tắc thiếu tham số để so. */
function measure(
  rule: Rule,
  room: { areaM2: number; widthM: number; longM: number; daylit: boolean },
): { violated: boolean; actual: string; required: string } | null {
  if (rule.predicate === 'requires_daylight') {
    return { violated: !room.daylit, actual: 'không có cửa sổ ra ngoài', required: 'có cửa sổ' };
  }

  if (rule.predicate === 'aspect_ratio_max') {
    const limit = Number(rule.params.value ?? rule.params.ratio);
    if (!Number.isFinite(limit) || room.widthM <= 0) return null;
    const ratio = room.longM / room.widthM;
    return {
      violated: ratio > limit + 0.05,
      actual: formatNumber(ratio, 1),
      required: formatNumber(limit, 1),
    };
  }

  const required = Number(
    rule.predicate === 'min_dimension' ? rule.params.value_m : rule.params.value_m2,
  );
  if (!Number.isFinite(required)) return null;
  const actual = rule.predicate === 'min_dimension' ? room.widthM : room.areaM2;
  const violated =
    rule.predicate === 'max_area'
      ? actual > required + MEASURE_SLACK_M
      : actual + MEASURE_SLACK_M < required;
  return { violated, actual: formatNumber(actual, 1), required: formatNumber(required, 1) };
}

/**
 * Phòng nào có cửa sổ ra ngoài trời.
 *
 * Suy từ HÌNH HỌC, cùng cách bộ kiểm suy phòng phục vụ của một cái cửa: lùi từ điểm giữa ô cửa
 * sổ vào trong nửa bề dày tường, rơi vào phòng nào thì phòng đó có sáng. Chỉ tính cửa sổ trên
 * tường bao — cửa sổ trên vách ngăn không mang ánh sáng trời vào (và đã bị bộ kiểm chặn).
 */
function roomsWithDaylight(level: AiFloorPlanLevel): Set<string> {
  const walls = new Map(prepareWalls(level.walls).map((wall) => [wall.id, wall]));
  const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));
  const lit = new Set<string>();

  for (const window of level.windows ?? []) {
    const wall = walls.get(window.wall);
    if (!wall || wall.kind !== 'e') continue;
    const distance = window.at + window.w / 2;
    const centreX = wall.a[0] + wall.u[0] * distance;
    const centreY = wall.a[1] + wall.u[1] * distance;
    const reach = wall.t / 2 + 1;
    for (const sign of [1, -1]) {
      const x = centreX + wall.n[0] * sign * reach;
      const y = centreY + wall.n[1] * sign * reach;
      for (const room of rooms) {
        if (x >= room.rect.x0 && x <= room.rect.x1 && y >= room.rect.y0 && y <= room.rect.y1) {
          lit.add(room.id);
        }
      }
    }
  }
  return lit;
}
