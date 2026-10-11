/**
 * Phòng PHỤ nhỏ kẹt trên bản phác — chương trình tự nhập vào phòng bên cạnh (T153, 10/10/2026).
 *
 * Lượt 75ba5793: tầng 1 nhà ống 5 m vòng đầu đúng bố cục (gara mặt tiền → khách → ăn + bếp → thang + WC →
 * giếng trời), chỉ có ô kho 2 m² kẹt ở góc sau giữa giếng trời và WC, không chạm lối đi nào. Bản phác bị
 * gửi lại mô hình cả tầng; bốn vòng sửa sau làm tầng 1 tệ dần (vòng 4 dời gara ra sau nhà), hết 0,5 USD.
 * Kiến trúc sư gặp ô kho như thế chỉ gộp nó vào phòng kề — đúng việc chương trình làm được, không cần ai
 * vẽ lại.
 *
 * Phạm vi HẸP có chủ đích (`kb/construction_norms.yaml` `sketch.absorb_stranded`):
 *  · chỉ loại phòng khai trong danh sách (kho, tủ đồ) và không lớn hơn ngưỡng;
 *  · không đụng phòng đầu bài yêu cầu ở chính tầng ấy — đó là lời gia chủ, vẫn báo về mô hình;
 *  · «kẹt» đo y như phép soát bản phác (`sketchNoAccess` chế độ chạm): không ô nào giáp phòng đi xuyên được,
 *    phòng được phép phục vụ nó, hay phòng mẹ;
 *  · nhập vào phòng kề chung NHIỀU ô nhất, trừ ô thang / thang máy / gara — nhập vào đó là đổi kích thước
 *    thứ đã có mốc, hoặc đặt kho lên đường xe.
 *
 * Hàm thuần: chỉ đổi bản phác và danh mục phòng của ý định, ghi chú mỗi chỗ đã nhập.
 */

import type { HouseIntent } from './house';

export interface StrandedRules {
  /** Loại phòng được nhập (`sketch.absorb_stranded.types`). */
  types: ReadonlySet<string>;
  maxAreaM2: number;
  /** Loại phòng đi xuyên được (`passage.through`). */
  through: ReadonlySet<string>;
  /** Loại phòng → các loại được mở cửa vào nó (`passage.served_from`). */
  servedFrom: ReadonlyMap<string, ReadonlySet<string>>;
  /** Loại phòng KHÔNG nhận ô nhập vào: thang, thang máy, gara… */
  noHost: ReadonlySet<string>;
  /** Đầu bài yêu cầu loại phòng này ở tầng này. */
  required: (type: string, level: number) => boolean;
  /** Tên tiếng Việt của loại phòng, cho ghi chú. */
  label: (type: string) => string;
}

export interface StrandedNote {
  level: number;
  room: string;
  host: string;
  message: string;
}

export function absorbStranded(
  intent: HouseIntent,
  rules: StrandedRules,
): { intent: HouseIntent; notes: StrandedNote[] } {
  if (!intent.sketches?.length || rules.types.size === 0) return { intent, notes: [] };
  const typeOf = new Map(intent.rooms.map((room) => [room.id, room.type]));
  const notes: StrandedNote[] = [];
  const gone = new Set<string>();
  const grown = new Map<string, number>();

  const sketches = intent.sketches.map((sketch) => {
    let grid = sketch.rows.map((row) => row.trim().split(/\s+/).filter(Boolean));
    for (const room of intent.rooms) {
      if (room.level !== sketch.level || room.ensuite_of) continue;
      if (!rules.types.has(room.type) || room.target_area_m2 > rules.maxAreaM2) continue;
      if (rules.required(room.type, room.level)) continue;
      const touch = touchCounts(grid, room.id);
      if (touch.size === 0) continue;
      const reachable = [...touch.keys()].some((other) => {
        const type = typeOf.get(other);
        if (!type) return false;
        return rules.through.has(type) || rules.servedFrom.get(room.type)?.has(type) === true;
      });
      if (reachable) continue;
      const host = [...touch.entries()]
        .filter(([other]) => {
          const type = typeOf.get(other);
          return type !== undefined && !rules.noHost.has(type) && !gone.has(other);
        })
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      if (!host) continue;
      grid = grid.map((row) => row.map((cell) => (cell === room.id ? host : cell)));
      gone.add(room.id);
      grown.set(host, (grown.get(host) ?? 0) + room.target_area_m2);
      notes.push({
        level: sketch.level,
        room: room.id,
        host,
        message: `Bản phác tầng ${sketch.level}: ${rules.label(room.type).toLocaleLowerCase('vi-VN')} "${room.id}" không chạm lối đi nào — chương trình nhập vào "${host}" (${rules.label(typeOf.get(host) ?? '').toLocaleLowerCase('vi-VN')}) thay vì gửi cả tầng về mô hình.`,
      });
    }
    return gone.size ? { ...sketch, rows: grid.map((row) => row.join(' ')) } : sketch;
  });
  if (!gone.size) return { intent, notes: [] };

  return {
    intent: {
      ...intent,
      // Phòng nhận ô mang thêm diện tích mục tiêu của phòng bị nhập — bộ xếp chia vách theo mục tiêu.
      rooms: intent.rooms
        .filter((room) => !gone.has(room.id))
        .map((room) =>
          grown.has(room.id)
            ? { ...room, target_area_m2: room.target_area_m2 + grown.get(room.id)! }
            : room,
        ),
      relationships: intent.relationships.filter((rel) => !gone.has(rel.a) && !gone.has(rel.b)),
      sketches,
      ...(intent.entry_room && gone.has(intent.entry_room) ? { entry_room: null } : {}),
    },
    notes,
  };
}

/** Phòng kề (chung cạnh ô, 4 hướng) của `id` → số cạnh ô chung. */
function touchCounts(grid: readonly string[][], id: string): Map<string, number> {
  const out = new Map<string, number>();
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== id) return;
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const other = grid[r + dr]?.[c + dc];
        if (other && other !== id && other !== '.') out.set(other, (out.get(other) ?? 0) + 1);
      }
    }),
  );
  return out;
}
