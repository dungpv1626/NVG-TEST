/**
 * «Vẽ tất cả phòng chính» (B3b, anh Dũng 30/10/2026) — phần THUẦN: chọn những phòng nào sẽ vẽ.
 *
 * Một tấm cho mỗi phòng vẽ được của đầu bài, theo thứ tự đầu bài khai, nhưng:
 *  · loại phòng lặp lại (WC, ban công, sân thượng, giặt phơi, bếp…) chỉ vẽ MỘT tấm cho cả nhà — hai WC trong
 *    ảnh ý tưởng trông như nhau, vẽ hai lần là trả tiền hai lần cho cùng một hình dung;
 *  · phòng ngủ KHÔNG gộp — mỗi phòng ngủ là một phòng riêng của một người trong nhà;
 *  · phòng (hoặc loại phòng đã gộp) đã có ảnh theo đầu bài hiện hành thì bỏ qua — bộ sưu tập chỉ trả tấm của
 *    đúng bản đầu bài ấy (`room-image-routes.ts`).
 */

import { formatNumber } from '@nvg/shared';

/** «Phòng ngủ · tầng 2 · khoảng 14,3 m²» — tên phòng trên màn hình và trong tên tệp của bộ kết quả. */
export function roomTitle(room: {
  label: string;
  floor: number | null;
  areaM2: number | null;
}): string {
  return [
    room.label,
    room.floor !== null ? `tầng ${room.floor}` : null,
    room.areaM2 !== null ? `khoảng ${formatNumber(room.areaM2, 1)} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Loại phòng vẽ RIÊNG từng phòng, không gộp theo loại. */
const PER_ROOM_TYPES: ReadonlySet<string> = new Set(['bedroom', 'master_bedroom']);

export function roomsToDrawAll<R extends { key: string; type: string }>(
  rooms: readonly R[],
  images: ReadonlyArray<{ roomKey: string; roomType: string }>,
): R[] {
  const drawnKeys = new Set(images.map((image) => image.roomKey));
  const drawnTypes = new Set(images.map((image) => image.roomType));
  const takenTypes = new Set<string>();
  const out: R[] = [];
  for (const room of rooms) {
    if (PER_ROOM_TYPES.has(room.type)) {
      if (!drawnKeys.has(room.key)) out.push(room);
      continue;
    }
    if (drawnTypes.has(room.type) || takenTypes.has(room.type)) continue;
    takenTypes.add(room.type);
    out.push(room);
  }
  return out;
}
