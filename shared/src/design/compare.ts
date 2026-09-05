/**
 * So sánh hai mặt bằng — phần "phân tích tác động" bằng ngôn ngữ người (TK-13).
 *
 * Hàm thuần trên hai `FloorPlan`; không có mô hình ngôn ngữ nào ở đây. Mỗi dòng trả về là một
 * câu tiếng Việt tất định về điều đã đổi: phòng chuyển tầng, diện tích thay đổi, tầng thêm hay
 * bớt, lõi thang có giữ nguyên chỗ hay không. Dùng chung cho Worker và trình duyệt.
 */

import type { FloorPlan } from './floor-plan.generated';

export interface PlanChange {
  kind:
    | 'level_added'
    | 'level_removed'
    | 'room_moved'
    | 'room_resized'
    | 'room_added'
    | 'room_removed'
    | 'core_kept'
    | 'core_moved'
    | 'total_area';
  message: string;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fmt(v: number): string {
  return round1(v).toFixed(1).replace('.', ',');
}

function centroid(polygon: ReadonlyArray<ReadonlyArray<number>>): [number, number] {
  const n = polygon.length || 1;
  return [
    polygon.reduce((s, p) => s + (p[0] ?? 0), 0) / n,
    polygon.reduce((s, p) => s + (p[1] ?? 0), 0) / n,
  ];
}

/**
 * `labels` — mã không gian → tên tiếng Việt (`spaceLabels`). Thiếu thì dùng mã.
 * Ngưỡng đổi diện tích đáng nói: 10 % hoặc 1 m², cái nào lớn hơn — nhỏ hơn là nhiễu của bộ giải.
 */
export function compareFloorPlans(
  before: FloorPlan,
  after: FloorPlan,
  labels: Record<string, string> = {},
): PlanChange[] {
  const name = (id: string, type: string) => labels[id] ?? labels[type] ?? type;
  const changes: PlanChange[] = [];

  const beforeLevels = new Set(before.levels.map((l) => l.level));
  const afterLevels = new Set(after.levels.map((l) => l.level));
  for (const level of [...afterLevels].sort((a, b) => a - b)) {
    if (!beforeLevels.has(level))
      changes.push({ kind: 'level_added', message: `Thêm tầng ${level}.` });
  }
  for (const level of [...beforeLevels].sort((a, b) => a - b)) {
    if (!afterLevels.has(level))
      changes.push({ kind: 'level_removed', message: `Bỏ tầng ${level}.` });
  }

  const beforeRooms = new Map<string, { level: number; area: number; type: string }>();
  for (const level of before.levels) {
    for (const room of level.rooms)
      beforeRooms.set(room.id, { level: level.level, area: room.area_m2, type: room.type });
  }
  const afterRooms = new Map<string, { level: number; area: number; type: string }>();
  for (const level of after.levels) {
    for (const room of level.rooms)
      afterRooms.set(room.id, { level: level.level, area: room.area_m2, type: room.type });
  }

  for (const [id, now] of afterRooms) {
    const was = beforeRooms.get(id);
    if (!was) {
      changes.push({
        kind: 'room_added',
        message: `Thêm ${name(id, now.type)} ở tầng ${now.level} (${fmt(now.area)} m²).`,
      });
      continue;
    }
    if (was.level !== now.level) {
      changes.push({
        kind: 'room_moved',
        message: `${name(id, now.type)} chuyển từ tầng ${was.level} sang tầng ${now.level}.`,
      });
    }
    const delta = now.area - was.area;
    const threshold = Math.max(1, was.area * 0.1);
    if (Math.abs(delta) >= threshold) {
      changes.push({
        kind: 'room_resized',
        message: `${name(id, now.type)} ${delta > 0 ? 'rộng thêm' : 'hẹp đi'} ${fmt(Math.abs(delta))} m² (${fmt(was.area)} → ${fmt(now.area)} m²).`,
      });
    }
  }
  // Nhiều phòng đổi diện tích cùng lúc là chuyện thường khi giải lại cả nhà — liệt kê từng
  // phòng thì danh sách dài hơn cả bản vẽ và không ai đọc. Quá ba thì gom thành một dòng.
  const resized = changes.filter((c) => c.kind === 'room_resized');
  if (resized.length > 3) {
    const kept = changes.filter((c) => c.kind !== 'room_resized');
    kept.push({
      kind: 'room_resized',
      message: `${resized.length} phòng đổi diện tích theo bố cục mới.`,
    });
    changes.length = 0;
    changes.push(...kept);
  }
  for (const [id, was] of beforeRooms) {
    if (!afterRooms.has(id)) {
      changes.push({
        kind: 'room_removed',
        message: `Bỏ ${name(id, was.type)} (tầng ${was.level}).`,
      });
    }
  }

  // Lõi thang: cùng vị trí hay không — điều kiện ra của Mốc 5 ("lõi và trục giữ nguyên").
  const coreBefore = before.cores?.[0]?.polygon;
  const coreAfter = after.cores?.[0]?.polygon;
  if (coreBefore && coreAfter) {
    const [bx, by] = centroid(coreBefore);
    const [ax, ay] = centroid(coreAfter);
    if (Math.hypot(ax - bx, ay - by) < 0.05) {
      changes.push({ kind: 'core_kept', message: 'Lõi thang giữ nguyên vị trí ở mọi tầng.' });
    } else {
      changes.push({
        kind: 'core_moved',
        message: `Lõi thang dời ${fmt(Math.hypot(ax - bx, ay - by))} m so với bản trước.`,
      });
    }
  }

  const totalBefore = before.levels.reduce(
    (s, l) => s + l.rooms.reduce((r, x) => r + x.area_m2, 0),
    0,
  );
  const totalAfter = after.levels.reduce(
    (s, l) => s + l.rooms.reduce((r, x) => r + x.area_m2, 0),
    0,
  );
  if (Math.abs(totalAfter - totalBefore) >= 1) {
    const up = totalAfter > totalBefore;
    changes.push({
      kind: 'total_area',
      message: `Tổng sàn ${up ? 'tăng' : 'giảm'} từ ${fmt(totalBefore)} ${up ? 'lên' : 'xuống'} ${fmt(totalAfter)} m².`,
    });
  }

  return changes;
}
