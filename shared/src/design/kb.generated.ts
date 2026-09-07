/**
 * SINH TỰ ĐỘNG từ `kb/space_norms.yaml` (mục `occupancy`) và `kb/room_vocabulary.yaml`
 * (nhãn tiếng Việt) — KHÔNG SỬA TAY. Xem `scripts/contracts-gen.mjs`.
 */

/** Mấy người ở chung một phòng ngủ, và phòng đó là loại gì. */
export interface OccupancyRule {
  readonly perRoom: number;
  readonly roomType: string;
}

export const OCCUPANCY: Readonly<Record<string, OccupancyRule>> = {
  vo_chong: { perRoom: 2, roomType: 'master_bedroom' },
  ong_ba: { perRoom: 2, roomType: 'bedroom' },
  con: { perRoom: 1, roomType: 'bedroom' },
  khach: { perRoom: 2, roomType: 'bedroom' },
  nguoi_giup_viec: { perRoom: 2, roomType: 'bedroom' },
};

/** Số phòng ngủ một nhóm thành viên cần — cùng phép tính Lớp 2 dùng ở `collectRequests`. */
export function bedroomsFor(role: string, count: number): number {
  const rule = OCCUPANCY[role];
  if (!rule || count <= 0) return 0;
  return Math.ceil(count / rule.perRoom);
}

/** Loại phòng ngủ của một vai trò (`bedroom` hay `master_bedroom`); rỗng khi vai trò lạ. */
export function bedroomTypeFor(role: string): string | null {
  return OCCUPANCY[role]?.roomType ?? null;
}

/** Nhãn tiếng Việt của mã phòng — gương của `kb/room_vocabulary.yaml`. */
export const ROOM_LABEL: Readonly<Record<string, string>> = {
  living: 'Phòng khách',
  dining: 'Phòng ăn',
  kitchen: 'Bếp',
  bedroom: 'Phòng ngủ',
  master_bedroom: 'Phòng ngủ chính',
  wc: 'Khu vệ sinh',
  stair: 'Thang bộ',
  core: 'Lõi thang',
  circulation: 'Giao thông',
  garage: 'Để xe',
  altar_room: 'Phòng thờ',
  study: 'Phòng làm việc',
  study_area: 'Không gian học tập',
  storage: 'Kho',
  closet: 'Tủ đồ',
  dressing_room: 'Phòng thay đồ',
  laundry: 'Giặt phơi',
  balcony: 'Ban công',
  terrace: 'Sân thượng',
  courtyard: 'Sân trong',
  light_well: 'Giếng trời',
  shaft: 'Hộp kỹ thuật',
  shop: 'Không gian kinh doanh',
  technical: 'Phòng kỹ thuật',
};
