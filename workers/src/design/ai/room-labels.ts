/**
 * Ghi nhãn HIỆN HÀNH vào những phòng mà loại phòng đã đổi tên (Haan, 09/10/2026: «Khu vệ sinh» →
 * «WC», «bản vẽ hiện có không cần đổi, tên mới cho bản vẽ từ giờ trở đi»).
 *
 * Tờ vẽ dựng lại từ artifact mỗi lần mở, và phòng `label: null` lấy chữ từ từ điển — nên đổi chữ
 * trong từ điển là đổi luôn bản vẽ cũ. Bộ vẽ vì vậy dùng tên CŨ cho phòng chưa mang nhãn
 * (`planDrawingLabels`), còn phương án mới mang sẵn tên mới ngay trong artifact. Chỉ ghi cho loại
 * có `vi_before`: phòng khác giữ `null` như cũ, artifact không đổi hình dạng ngoài chỗ cần.
 */

import type { AiFloorPlan } from '@nvg/shared/design';
import type { RoomTypeEntry } from '../kb/vocabulary';

export function stampRenamedRoomLabels(
  plan: AiFloorPlan,
  types: readonly RoomTypeEntry[],
): AiFloorPlan {
  const renamed = new Map(types.filter((t) => t.vi_before).map((t) => [t.code, t.vi]));
  if (renamed.size === 0) return plan;
  return {
    ...plan,
    levels: plan.levels.map((level) => ({
      ...level,
      rooms: level.rooms.map((room) =>
        room.label?.trim() || !renamed.has(room.type)
          ? room
          : { ...room, label: renamed.get(room.type)! },
      ),
    })),
  };
}
