/**
 * Từ vựng hiển thị của Đầu bài thiết kế (Lớp 1 — TK-10).
 *
 * Nguồn: `contracts/design-brief.schema.json`, `doc/design/03-data-contracts.md` mục 3.1.
 *
 * Hợp đồng dữ liệu chỉ khai MÃ (`DN`, `ong_ba`, `hien_dai`); nhãn tiếng Việt phải nằm ở
 * đúng một chỗ, nếu không mỗi màn hình sẽ tự dịch một kiểu và cùng một mã hiện ra hai tên
 * khác nhau ở hai nơi. Đặt ở `shared/` vì cả `web/` (vẽ biểu mẫu) lẫn `workers/` (soạn
 * prompt và thông báo lỗi) đều cần.
 *
 * ⚠️ Đây là NHÃN, không phải nguồn của tập giá trị. Tập giá trị nằm trong hợp đồng; có kiểm
 * thử canh hai bên khớp nhau, để thêm một mã vào hợp đồng mà quên nhãn sẽ làm đỏ chứ không
 * lặng lẽ hiện ra mã thô cho người dùng.
 */

import type { DesignBriefBuildingType, DesignBrief } from './design-brief.generated';

/** Tám hướng nhà, viết tắt tiếng Việt theo hợp đồng. */
export const ORIENTATIONS = ['B', 'BD', 'D', 'DN', 'N', 'TN', 'T', 'TB'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const ORIENTATION_LABEL: Readonly<Record<Orientation, string>> = {
  B: 'Bắc',
  BD: 'Đông Bắc',
  D: 'Đông',
  DN: 'Đông Nam',
  N: 'Nam',
  TN: 'Tây Nam',
  T: 'Tây',
  TB: 'Tây Bắc',
};

export const BUILDING_TYPES = ['nha_pho', 'biet_thu', 'nha_vuon'] as const;

export const BUILDING_TYPE_LABEL: Readonly<Record<DesignBriefBuildingType, string>> = {
  nha_pho: 'Nhà phố',
  biet_thu: 'Biệt thự',
  nha_vuon: 'Nhà vườn',
};

/**
 * Phong cách kiến trúc — chín cái phổ biến trong nhà ở dân dụng Việt Nam.
 *
 * Đây là danh sách để CHỌN, không phải danh sách đầy đủ của ngành.
 *
 * Thứ tự ở đây là thứ tự hiện trên biểu mẫu: ba cái NVO làm nhiều nhất trước.
 */
export const STYLES = [
  'hien_dai',
  'tan_co_dien',
  'indochine',
  'mai_thai',
  'toi_gian',
  'nhiet_doi',
  'dia_trung_hai',
  'co_dien',
  'bac_au',
] as const;
export type BriefStyle = (typeof STYLES)[number];

export const STYLE_LABEL: Readonly<Record<BriefStyle, string>> = {
  hien_dai: 'Hiện đại',
  tan_co_dien: 'Tân cổ điển',
  indochine: 'Đông Dương',
  mai_thai: 'Mái Thái',
  toi_gian: 'Tối giản',
  nhiet_doi: 'Nhiệt đới',
  dia_trung_hai: 'Địa Trung Hải',
  co_dien: 'Cổ điển',
  bac_au: 'Bắc Âu',
};

export const FAMILY_ROLES = ['ong_ba', 'vo_chong', 'con', 'khach', 'nguoi_giup_viec'] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export const FAMILY_ROLE_LABEL: Readonly<Record<FamilyRole, string>> = {
  ong_ba: 'Ông bà',
  vo_chong: 'Vợ chồng',
  con: 'Con',
  khach: 'Khách',
  nguoi_giup_viec: 'Người giúp việc',
};

/**
 * Nguyện vọng tầng tương đối — CÁCH KHAI CŨ, chỉ còn để ĐỌC.
 *
 * Biểu mẫu không sinh thêm giá trị mới cho nó từ 06/09/2026: nó dùng một thang đo khác hẳn
 * `required_spaces[].floor` (số tầng thật) cho đúng một khái niệm, nên cùng một biểu mẫu bắt
 * người khai dịch qua lại giữa hai thang — và "tầng giữa" của một căn hai tầng thì không trỏ
 * vào tầng nào. Thay bằng `family[].floor`.
 *
 * Giữ lại vì các đầu bài đã lưu mang giá trị này; bỏ đi là xoá một câu trả lời đã có.
 */
export const FLOOR_PREFS = ['low', 'mid', 'top'] as const;
export type FloorPref = (typeof FLOOR_PREFS)[number];

export const FLOOR_PREF_LABEL: Readonly<Record<FloorPref, string>> = {
  low: 'Tầng thấp',
  mid: 'Tầng giữa',
  top: 'Tầng trên cùng',
};

export const ACCESS_SIDES = ['front', 'back', 'left', 'right'] as const;
export type AccessSide = (typeof ACCESS_SIDES)[number];

/**
 * Nhãn bốn phía.
 *
 * "Trước / sau / trái / phải" đứng từ ngoài đường nhìn vào — quy ước của hợp đồng đặt gốc
 * toạ độ ở góc trước-trái lô đất (03-data-contracts, phần hệ toạ độ). Ghi ra để người vẽ
 * biểu mẫu không tự đảo trái-phải theo hướng nhìn từ trong nhà ra.
 */
export const SIDE_LABEL: Readonly<Record<AccessSide, string>> = {
  front: 'Mặt trước',
  back: 'Mặt sau',
  left: 'Bên trái',
  right: 'Bên phải',
};

/** Hiện trạng thường gặp ở mỗi phía — gợi ý, KHÔNG phải tập đóng (hợp đồng cho chuỗi tự do). */
export const ADJACENT_SUGGESTIONS: readonly { value: string; label: string }[] = [
  { value: 'nha_hang_xom', label: 'Nhà hàng xóm' },
  { value: 'hem_2m', label: 'Hẻm 2 m' },
  { value: 'hem_3m', label: 'Hẻm 3 m' },
  { value: 'duong_lon', label: 'Đường lớn' },
  { value: 'dat_trong', label: 'Đất trống' },
  { value: 'ao_ho', label: 'Ao hồ, kênh mương' },
];

/** Quan hệ của người quyết định cuối với công trình. */
export const DECISION_RELATIONSHIPS: readonly { value: string; label: string }[] = [
  { value: 'chu_nha', label: 'Chủ nhà' },
  { value: 'vo_chong_chu_nha', label: 'Hai vợ chồng cùng quyết' },
  { value: 'ong_ba', label: 'Ông bà' },
  { value: 'nguoi_dai_dien', label: 'Người đại diện được uỷ quyền' },
];

/**
 * Kiểu gia đình suy từ `family[]` — KHÔNG hỏi thêm một ô nào.
 *
 * Mốc 3 dùng `family_archetype` làm bộ lọc tầng 2 của truy hồi hồ sơ cũ
 * (`kb_retrieve_candidates`). Suy ra ở đây thay vì bắt nhập là để hai nơi không thể nói
 * khác nhau: người nhập "ba thế hệ" rồi khai gia đình chỉ có vợ chồng thì bộ lọc sẽ tìm
 * nhầm nhóm hồ sơ tham chiếu, mà không có triệu chứng gì.
 */
export function familyArchetype(family: DesignBrief['family']): string | null {
  const members = family ?? [];
  const present = new Set(members.filter((m) => m.count > 0).map((m) => m.role));
  if (present.size === 0) return null;

  const generations =
    (present.has('ong_ba') ? 1 : 0) +
    (present.has('vo_chong') ? 1 : 0) +
    (present.has('con') ? 1 : 0);

  if (present.has('ong_ba') && present.has('con')) return '3_the_he';
  if (generations >= 2) return '2_the_he';
  if (present.has('vo_chong') && !present.has('con')) return 'hat_nhan';
  return 'khac';
}

/** Tổng số người trong nhà — dùng cho phép kiểm nhất quán số phòng ngủ. */
export function householdSize(family: DesignBrief['family']): number {
  return (family ?? []).reduce((total, member) => total + (member.count ?? 0), 0);
}
