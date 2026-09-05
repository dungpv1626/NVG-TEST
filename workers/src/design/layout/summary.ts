/**
 * Bảng so sánh phương án bằng NGÔN NGỮ KHÁCH (11-design-flow 11.4b, 11.6 Output 3).
 *
 * Khách chốt phương án dựa trên công năng và bố cục — phòng nào ở đâu, mấy phòng ngủ, tổng
 * diện tích — chứ không dựa trên "diện tích giao thông 11,2%". Con số kỹ thuật vẫn tính ở đây
 * (kiến trúc sư cần), nhưng giao diện chọn hiện gì.
 *
 * Hàm thuần: nhận `FloorPlan` đã kiểm hợp đồng và hai bảng tra từ `kb/room_vocabulary.yaml`,
 * không gọi mạng, không đọc tệp — để kiểm thử được dưới Node và để tuyến GET không phải giải
 * lại gì.
 */

import type { FloorPlan } from '@nvg/shared/design';

export interface LevelSummary {
  level: number;
  height_m: number | null;
  /** Diện tích sàn = tổng đa giác phòng (cây chia không gian lấp kín mặt sàn — CLAUDE.md 8.8.6). */
  area_m2: number;
  rooms: Array<{ id: string; type: string; label: string; area_m2: number; has_daylight: boolean }>;
}

export interface FloorPlanSummary {
  levels: LevelSummary[];
  total_area_m2: number;
  bedrooms: number;
  /** Tỉ lệ diện tích giao thông trên tổng sàn, 0–1. */
  circulation_share: number;
  /** Tầng của các không gian khách hay hỏi trước tiên. Rỗng nếu chương trình không có. */
  altar_level: number | null;
  garage_level: number | null;
  constraint_status: FloorPlan['constraint_report']['status'];
  violations: FloorPlan['constraint_report']['violations'];
}

function round(value: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

export function summariseFloorPlan(
  plan: FloorPlan,
  labels: Record<string, string>,
  groups: Record<string, string[]>,
): FloorPlanSummary {
  const circulation = new Set(groups.circulation ?? []);
  const sleeping = new Set(groups.sleeping ?? []);

  let total = 0;
  let circulationArea = 0;
  let bedrooms = 0;
  let altarLevel: number | null = null;
  let garageLevel: number | null = null;

  const levels: LevelSummary[] = [...plan.levels]
    .sort((a, b) => a.level - b.level)
    .map((level) => {
      let area = 0;
      const rooms = level.rooms.map((room) => {
        area += room.area_m2;
        if (circulation.has(room.type)) circulationArea += room.area_m2;
        if (sleeping.has(room.type)) bedrooms += 1;
        if (room.type === 'altar_room' && altarLevel === null) altarLevel = level.level;
        if (room.type === 'garage' && garageLevel === null) garageLevel = level.level;
        return {
          id: room.id,
          type: room.type,
          // Nhãn theo MÃ KHÔNG GIAN của chương trình (`bedroom_2` → "Phòng ngủ 1"); không có thì
          // rơi về mã phòng để người đọc vẫn nhận ra, thay vì một ô trống.
          label: labels[room.id] ?? room.type,
          area_m2: round(room.area_m2),
          has_daylight: room.has_daylight === true,
        };
      });
      total += area;
      return { level: level.level, height_m: level.height_m ?? null, area_m2: round(area), rooms };
    });

  return {
    levels,
    total_area_m2: round(total),
    bedrooms,
    circulation_share: total > 0 ? round(circulationArea / total, 3) : 0,
    altar_level: altarLevel,
    garage_level: garageLevel,
    constraint_status: plan.constraint_report.status,
    violations: plan.constraint_report.violations ?? [],
  };
}
