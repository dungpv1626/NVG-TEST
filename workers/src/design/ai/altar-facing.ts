/**
 * Hướng bàn thờ gia chủ khai (T106, Haan chấm lượt f351115d: «không có cách để đặt bàn thờ quay hướng đông nam, vì nếu
 * bàn thờ quay hướng đông nam như đầu bài thì từ cửa đi vào là phía sau của bàn thờ»). Bàn thờ quay hướng F thì dựa lưng
 * vào vách phía F + 180°; cửa phòng thờ mở ở vách ấy là người vào đi thẳng tới lưng bàn thờ.
 *
 * Hướng đọc từ lời gia chủ ở ô tiện ích của dòng phòng thờ («hướng đông nam»), không suy đoán: không khai thì không ràng
 * buộc. Đổi ra cạnh mặt bằng theo hướng nhà (`site.orientation`): mặt trước (y0) quay hướng nhà H, sau (y1) H + 180°,
 * trái nhìn từ đường (x0) H + 90°, phải (x1) H + 270°. Hàm THUẦN.
 */

import type { AiBriefDigest } from '@nvg/shared/design';

/** Phương vị từng mã hướng của đầu bài (`site.orientation`), độ — bắc 0, theo chiều kim đồng hồ. */
export const BEARINGS: Record<string, number> = {
  B: 0,
  BD: 45,
  D: 90,
  DN: 135,
  N: 180,
  TN: 225,
  T: 270,
  TB: 315,
};

export type RoomSide = 'x0' | 'x1' | 'y0' | 'y1';

/** Tên hướng (không dấu) → phương vị, độ. Hướng ghép đứng trước để khớp dài nhất. */
const WORDS: readonly [string, number][] = [
  ['dong nam', 135],
  ['tay nam', 225],
  ['dong bac', 45],
  ['tay bac', 315],
  ['dong', 90],
  ['tay', 270],
  ['nam', 180],
  ['bac', 0],
];

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Phương vị bàn thờ quay ra, độ — `null` khi đầu bài không khai hướng ở dòng phòng thờ. */
export function altarFacingBearing(digest: AiBriefDigest): number | null {
  for (const row of digest.required_spaces ?? []) {
    if (row.type !== 'altar_room' || !row.amenities) continue;
    const text = plain(row.amenities);
    for (const [word, bearing] of WORDS) {
      if (new RegExp(`huong ${word}\\b`).test(text)) return bearing;
    }
  }
  return null;
}

/** Cạnh phòng mà bàn thờ dựa lưng — cửa phòng thờ không mở ở cạnh này. `null` khi không khai hướng / hướng nhà. */
export function altarBackSide(digest: AiBriefDigest): RoomSide | null {
  const facing = altarFacingBearing(digest);
  const house = digest.site?.orientation ? BEARINGS[digest.site.orientation] : undefined;
  if (facing === null || house === undefined) return null;
  const back = (facing + 180) % 360;
  const sides: [RoomSide, number][] = [
    ['y0', house],
    ['y1', house + 180],
    ['x0', house + 90],
    ['x1', house + 270],
  ];
  const gap = (a: number) =>
    Math.min(Math.abs(((a - back) % 360) + 360) % 360, 360 - ((((a - back) % 360) + 360) % 360));
  return sides.sort((p, q) => gap(p[1]) - gap(q[1]))[0]![0];
}
