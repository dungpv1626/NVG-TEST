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
import {
  rectHeight,
  rectsOverlap,
  rectsShareEdge,
  rectWidth,
  toPt,
  toRect,
  type Pt,
  type Rect,
} from './draw/geometry';
import { prepareWalls } from './draw/walls';
import { faceAtPoint } from './outline-faces';
import { doorLinks } from './plan-check';
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
export const MEASURABLE_ON_PLAN = new Set([
  'min_area',
  'max_area',
  'min_dimension',
  'aspect_ratio_max',
  'requires_daylight',
  'adjacency',
  'floor_preference',
  'stair_faces_entry',
]);

/**
 * Vị từ QUAN HỆ — đo trên nhiều phòng cùng lúc, không trên số đo của một phòng.
 *
 * `adjacency` và `floor_preference` đã được tiêm vào lời dẫn khi kỹ sư tích gói kinh nghiệm từ
 * trước, nhưng tới 16/09/2026 KHÔNG được đo lại: `wc_separate_from_kitchen`, `kitchen_near_dining`,
 * `garage_ground_floor` chưa từng sinh một cảnh báo nào. `stair_faces_entry` thêm cùng ngày theo tài
 * liệu «Nguyên tắc vàng» mục 9 (Haan chốt: chỉ ý thang–cửa chính, vì đo được bằng hình học sẵn có).
 */
const RELATIONAL = new Set(['adjacency', 'floor_preference', 'stair_faces_entry']);

/** Sai lệch bỏ qua khi so số đo với ngưỡng, mét — dưới mức này là chuyện làm tròn. */
const MEASURE_SLACK_M = 0.05;

/** Tim tường lệch mặt hình bao tối đa bao nhiêu thì vẫn coi là nằm TRÊN cạnh ấy, cm. */
const EDGE_SLACK_CM = 2;

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
        if (!MEASURABLE_ON_PLAN.has(rule.predicate) || RELATIONAL.has(rule.predicate)) continue;
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

  const relational = applicable.filter(
    (rule) => RELATIONAL.has(rule.predicate) && targetIsKnown(rule, labels, groups),
  );
  const nameOfRoom = (room: AiFloorPlanLevel['rooms'][number]): string =>
    room.label?.trim() || nameOf(room.type);
  for (const rule of relational) {
    checked.add(rule.id);
    for (const found of relationalViolations(rule, levels, groups)) {
      const room = found.room;
      warnings.push({
        ruleId: rule.id,
        severity: rule.severity,
        source: rule.source,
        message: messages.render(rule.id, found.messageKey, {
          room: nameOfRoom(room),
          a: nameOf(String(rule.params.a)),
          b: nameOf(String(rule.params.b)),
          actual: found.level,
          target: nameOf(String(rule.params.target ?? '')),
        }),
        spaceId: room.id,
        level: found.level,
      });
    }
  }

  return { warnings, checked: [...checked].sort(), unchecked };
}

type PlanRoom = AiFloorPlanLevel['rooms'][number];

interface RelationalViolation {
  room: PlanRoom;
  level: number;
  /** Khoá mẫu câu trong `rules/messages.vi.yaml` khi quy tắc không có mẫu riêng theo mã. */
  messageKey: string;
}

/** Một khu mang một loại phòng: phòng thường là chính nó, không gian mở là từng khu (`parts`). */
interface TypedZone {
  room: PlanRoom;
  type: string;
  rect: Rect;
}

function zonesOf(room: PlanRoom): TypedZone[] {
  const parts = room.parts ?? [];
  if (parts.length > 1) {
    return parts.map((part) => ({ room, type: part.type, rect: toRect(part.rect) }));
  }
  return [{ room, type: room.type, rect: toRect(room.rect) }];
}

function relationalViolations(
  rule: Rule,
  levels: readonly AiFloorPlanLevel[],
  groups: Record<string, string[]>,
): RelationalViolation[] {
  if (rule.predicate === 'adjacency') return adjacencyViolations(rule, levels, groups);
  if (rule.predicate === 'floor_preference') return floorViolations(rule, levels, groups);
  return levels.flatMap((level) =>
    stairsFacingEntry(level).map((room) => ({
      room,
      level: level.level,
      messageKey: 'stair_faces_entry',
    })),
  );
}

/**
 * `kind: adjacent` — trên tầng có cả hai loại, phải có ít nhất một cặp chung tường (hoặc cùng một
 * không gian mở). `kind: separate` — không cặp nào chung tường; `scope: building` thì thêm: không
 * nằm chồng lên nhau ở hai tầng liền kề (WC trên phòng thờ, đúng cách A3 đo).
 */
function adjacencyViolations(
  rule: Rule,
  levels: readonly AiFloorPlanLevel[],
  groups: Record<string, string[]>,
): RelationalViolation[] {
  const a = String(rule.params.a ?? '');
  const b = String(rule.params.b ?? '');
  const kind = String(rule.params.kind ?? '');
  const isA = (type: string) => type === a || (groups[a]?.includes(type) ?? false);
  const isB = (type: string) => type === b || (groups[b]?.includes(type) ?? false);
  const zonesByLevel = new Map(
    levels.map((level) => [level.level, level.rooms.flatMap(zonesOf)] as const),
  );
  const out: RelationalViolation[] = [];

  for (const level of levels) {
    const zones = zonesByLevel.get(level.level) ?? [];
    const as = zones.filter((zone) => isA(zone.type));
    const bs = zones.filter((zone) => isB(zone.type));
    if (!as.length || !bs.length) continue;
    const touching = (p: TypedZone, q: TypedZone) =>
      p.room.id === q.room.id || rectsShareEdge(p.rect, q.rect);

    if (kind === 'adjacent') {
      if (!as.some((p) => bs.some((q) => touching(p, q)))) {
        out.push({ room: as[0]!.room, level: level.level, messageKey: 'adjacency_adjacent' });
      }
      continue;
    }
    if (kind !== 'separate') continue;
    for (const p of as) {
      if (bs.some((q) => p.room.id !== q.room.id && rectsShareEdge(p.rect, q.rect))) {
        out.push({ room: p.room, level: level.level, messageKey: 'adjacency_separate' });
      }
    }
  }

  if (kind === 'separate' && rule.scope === 'building') {
    for (const level of levels) {
      const zones = zonesByLevel.get(level.level) ?? [];
      const above = zonesByLevel.get(level.level + 1) ?? [];
      for (const [lower, upper] of [
        [zones.filter((z) => isB(z.type)), above.filter((z) => isA(z.type))],
        [zones.filter((z) => isA(z.type)), above.filter((z) => isB(z.type))],
      ] as const) {
        for (const top of upper) {
          if (lower.some((bottom) => rectsOverlap(bottom.rect, top.rect))) {
            out.push({ room: top.room, level: level.level + 1, messageKey: 'adjacency_separate' });
          }
        }
      }
    }
  }
  return dedupe(out);
}

/** `value: top` — tầng cao nhất có phòng ở (cùng định nghĩa A3); `value: ground` — tầng thấp nhất. */
function floorViolations(
  rule: Rule,
  levels: readonly AiFloorPlanLevel[],
  groups: Record<string, string[]>,
): RelationalViolation[] {
  const target = String(rule.params.target ?? '');
  const value = String(rule.params.value ?? '');
  if (value !== 'top' && value !== 'ground') return [];
  const habitable = new Set(groups.habitable ?? []);
  const habitableLevels = levels
    .filter((level) => level.rooms.some((room) => zonesOf(room).some((z) => habitable.has(z.type))))
    .map((level) => level.level);
  const wanted =
    value === 'top'
      ? Math.max(...(habitableLevels.length ? habitableLevels : levels.map((l) => l.level)))
      : Math.min(...levels.map((l) => l.level));
  const isTarget = (type: string) => type === target || (groups[target]?.includes(type) ?? false);

  return dedupe(
    levels
      .filter((level) => level.level !== wanted)
      .flatMap((level) =>
        level.rooms
          .filter((room) => zonesOf(room).some((zone) => isTarget(zone.type)))
          .map((room) => ({
            room,
            level: level.level,
            messageKey: `floor_preference_${value}`,
          })),
      ),
  );
}

function dedupe(found: RelationalViolation[]): RelationalViolation[] {
  const seen = new Set<string>();
  return found.filter((entry) => {
    const key = `${entry.level}|${entry.room.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lệch trục tối đa giữa tim cửa chính và mép ô thang vẫn coi là «thẳng trục», cm. */
const AXIS_SLACK_CM = 30;

const UP_VECTOR: Record<string, Pt> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };

/**
 * Ô thang «đâm thẳng» cửa chính: bước qua cửa ngoài nhà, đi thẳng theo pháp tuyến vào trong là gặp
 * ngay chân thang, và vế đầu chạy DỌC theo hướng đi ấy (xuống thang là đi thẳng ra cửa).
 *
 * Đo trên hình học đã giải, không đoán:
 *  · cửa chính = cửa có một phía là ngoài nhà, không phải cửa để xe hay cổng;
 *  · «gặp ngay» = ô thang nằm trong chính phòng cửa mở vào, HOẶC ở phòng kế tiếp trên trục ấy và
 *    hai phòng thông nhau bằng một cửa nằm trên trục (lệch ≤ `AXIS_SLACK_CM`);
 *  · vế đầu cùng chiều đi vào — vế vuông góc thì bước vào nhìn thấy mặt bên thang, không «đâm».
 *
 * Giới hạn chấp nhận: không lần qua hai phòng trở lên, không xét ô thông không cửa giữa hai phòng.
 */
export function stairsFacingEntry(level: AiFloorPlanLevel): PlanRoom[] {
  const stairs = level.stairs ?? [];
  if (!stairs.length) return [];
  const walls = prepareWalls(level.walls);
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const kindOf = new Map((level.doors ?? []).map((door) => [door.id, door.kind]));
  const links = doorLinks(level, walls);
  const rooms = level.rooms.map((room) => ({ room, rect: toRect(room.rect) }));
  const roomAt = (p: Pt) =>
    rooms.find(
      ({ rect }) => p[0] >= rect.x0 && p[0] <= rect.x1 && p[1] >= rect.y0 && p[1] <= rect.y1,
    );
  const found = new Map<string, PlanRoom>();

  for (const link of links) {
    if (!link.toOutside || link.rooms.length !== 1) continue;
    const kind = kindOf.get(link.id);
    if (kind === 'garage' || kind === 'gate') continue;
    const door = (level.doors ?? []).find((d) => d.id === link.id);
    const wall = door ? byId.get(door.wall) : undefined;
    const entry = rooms.find(({ room }) => room.id === link.rooms[0]);
    if (!wall || !entry) continue;

    const reach = wall.t / 2 + 2;
    const inward = [1, -1]
      .map((sign): Pt => [wall.n[0] * sign, wall.n[1] * sign])
      .find((dir) => roomAt([link.at[0] + dir[0] * reach, link.at[1] + dir[1] * reach]));
    if (!inward) continue;
    const alongX = Math.abs(inward[0]) > 0.9;
    const lateral = alongX ? link.at[1] : link.at[0];

    const onAxis = (rect: Rect) =>
      alongX
        ? lateral >= rect.y0 - AXIS_SLACK_CM && lateral <= rect.y1 + AXIS_SLACK_CM
        : lateral >= rect.x0 - AXIS_SLACK_CM && lateral <= rect.x1 + AXIS_SLACK_CM;
    const ahead = (rect: Rect) =>
      alongX
        ? inward[0] > 0
          ? rect.x1 > link.at[0]
          : rect.x0 < link.at[0]
        : inward[1] > 0
          ? rect.y1 > link.at[1]
          : rect.y0 < link.at[1];
    const runsInward = (up: string) => {
      const v = UP_VECTOR[up];
      return !!v && v[0] * inward[0] + v[1] * inward[1] > 0.9;
    };

    // Phòng kế tiếp trên trục: bước qua mép xa của phòng cửa mở vào.
    const far = alongX
      ? inward[0] > 0
        ? entry.rect.x1
        : entry.rect.x0
      : inward[1] > 0
        ? entry.rect.y1
        : entry.rect.y0;
    const probe: Pt = alongX
      ? [far + inward[0] * (wall.t + 2), lateral]
      : [lateral, far + inward[1] * (wall.t + 2)];
    const next = roomAt(probe);
    const passage = next
      ? links.find((other) => {
          if (!other.rooms.includes(entry.room.id) || !other.rooms.includes(next.room.id)) {
            return false;
          }
          const offset = alongX ? other.at[1] - lateral : other.at[0] - lateral;
          return Math.abs(offset) <= AXIS_SLACK_CM;
        })
      : undefined;

    for (const stair of stairs) {
      const rect = toRect(stair.rect);
      if (!onAxis(rect) || !ahead(rect) || !runsInward(stair.up)) continue;
      const inEntry = rectsOverlap(rect, entry.rect);
      const inNext = !!next && !!passage && rectsOverlap(rect, next.rect);
      if (!inEntry && !inNext) continue;
      const host = inEntry ? entry.room : next!.room;
      found.set(host.id, host);
    }
  }
  return [...found.values()];
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
 *
 * ⚠️ VÀ chỉ tính cửa sổ trên cạnh hình bao KHÔNG giáp ranh (`outline_faces`). Trước 12/09/2026
 * phép này đếm một cửa sổ trên tường ranh là mặt thoáng hợp lệ — một cửa sổ không thể tồn tại
 * — vì hợp đồng gộp tường ranh và tường giáp ngoài trời vào cùng loại `e`. Đo trên hồ sơ thật:
 * cả hai dự án NVO đều có tường ranh, và nhà phố P2 có phòng ngủ CHỈ lấy sáng qua hành lang.
 * Thiếu phép lọc này thì cảnh báo «phòng ngủ không có cửa sổ» im lặng không bao giờ nổ ra.
 *
 * Tầng nào chưa có `outline_faces` (artifact đúc trước 12/09/2026) thì giữ hành vi cũ: không
 * có dữ liệu mặt thì không suy hộ một kết luận về ánh sáng.
 *
 * Xuất ra ngoài vì tiêu chí D1 của BỘ CHẤM đo đúng câu hỏi này. Hai bản thực thi của «phòng nào có
 * sáng» là hai bản sẽ lệch, và lệch ở đây nghĩa là màn hình cảnh báo một phòng thiếu sáng trong khi
 * bộ chấm cho nó đủ điểm mặt thoáng.
 */
export function roomsWithDaylight(level: AiFloorPlanLevel): Set<string> {
  const walls = new Map(prepareWalls(level.walls).map((wall) => [wall.id, wall]));
  const rooms = level.rooms.map((room) => ({ id: room.id, rect: toRect(room.rect) }));
  const outline = level.outline.map(toPt);
  const faces = level.outline_faces ?? [];
  const lit = new Set<string>();

  for (const window of level.windows ?? []) {
    const wall = walls.get(window.wall);
    if (!wall || wall.kind !== 'e') continue;
    const distance = window.at + window.w / 2;
    const centreX = wall.a[0] + wall.u[0] * distance;
    const centreY = wall.a[1] + wall.u[1] * distance;
    if (
      faces.length === outline.length &&
      faceAtPoint([centreX, centreY], outline, faces, wall.t / 2 + EDGE_SLACK_CM) === 'boundary'
    ) {
      continue;
    }
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
