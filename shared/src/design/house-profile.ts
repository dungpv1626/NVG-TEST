/**
 * Loại nhà (profile) — chọn luật và thông số theo loại (T116, handoff v6 mục 3). Một hàm cho cả giao diện lẫn
 * Worker: hai bên suy lệch nhau thì màn hình nói «nhà ống» trong khi cổng kiểm theo luật nhà phố.
 */
import DATA from './house-profile.json';

export type HouseProfile = 'ong' | 'pho' | 'bt' | 'vuon';

export interface HouseProfileResult {
  profile: HouseProfile;
  /** Kết hợp kinh doanh — ghép với `profile` (luật lối vào, cửa hàng). */
  kd: boolean;
  /** `override` = KTS chọn; `auto` = suy từ đầu bài. */
  source: 'auto' | 'override';
  /** Khối xây dùng để suy (m) — `null` khi đầu bài thiếu kích thước. */
  block: { width_m: number; depth_m: number } | null;
}

type Side = 'front' | 'back' | 'left' | 'right';
type Sides = Partial<Record<Side, number | null | undefined>>;

/** Phần đầu bài hàm cần — khớp cả `DesignBrief`, bản nháp phiếu lẫn digest gửi AI. */
export interface HouseProfileInput {
  building_type?: string | null;
  house_profile_override?: string | null;
  site?: {
    width_m?: number | null;
    depth_m?: number | null;
    adjacent?: Partial<Record<Side, string | null | undefined>> | null;
    setback_required_m?: Sides | null;
  } | null;
  massing?: { yard_depth_m?: Sides | null } | null;
  household?: { home_business?: { mode?: string | null } | null } | null;
}

const PROFILES: readonly HouseProfile[] = ['ong', 'pho', 'bt', 'vuon'];

export function houseProfile(input: HouseProfileInput): HouseProfileResult {
  const kd = DATA.kd_business_modes.includes(input.household?.home_business?.mode ?? '');
  const block = blockOf(input);
  const override = input.house_profile_override;
  if (override && (PROFILES as readonly string[]).includes(override)) {
    return { profile: override as HouseProfile, kd, source: 'override', block };
  }
  const type = input.building_type ?? '';
  const byType = (DATA.by_building_type as Record<string, HouseProfile | undefined>)[type] ?? 'pho';
  return { profile: isTubeHouse(type, input, block) ? 'ong' : byType, kd, source: 'auto', block };
}

export function houseProfileLabel(result: Pick<HouseProfileResult, 'profile' | 'kd'>): string {
  const labels = DATA.labels as Record<string, string>;
  return `${labels[result.profile]}${result.kd ? `, ${labels.kd}` : ''}`;
}

/** Khối xây = lô trừ khoảng lùi; mỗi mặt lấy số lớn hơn giữa khoảng lùi quy hoạch và sân gia chủ muốn. */
function blockOf(input: HouseProfileInput): HouseProfileResult['block'] {
  const width = input.site?.width_m;
  const depth = input.site?.depth_m;
  if (typeof width !== 'number' || typeof depth !== 'number' || width <= 0 || depth <= 0)
    return null;
  const off = (side: Side) =>
    Math.max(
      input.site?.setback_required_m?.[side] ?? 0,
      input.massing?.yard_depth_m?.[side] ?? 0,
      0,
    );
  return {
    width_m: Math.max(0, width - off('left') - off('right')),
    depth_m: Math.max(0, depth - off('front') - off('back')),
  };
}

function isTubeHouse(
  type: string,
  input: HouseProfileInput,
  block: HouseProfileResult['block'],
): boolean {
  const rule = DATA.ong;
  if (!rule.from_building_types.includes(type) || !block || block.width_m <= 0) return false;
  if (block.width_m > rule.max_block_width_m) return false;
  if (block.depth_m < rule.min_depth_to_width * block.width_m) return false;
  // Mặt bên «kín»: giáp nhà / đất người khác, hoặc chưa khai mà xây sát ranh. Mặt giáp đường, hẻm, ao là mặt thoáng.
  const closed = (['left', 'right'] as const).filter((side) => {
    const adjacent = input.site?.adjacent?.[side];
    if (adjacent) return !DATA.open_adjacent.includes(adjacent);
    return (input.site?.setback_required_m?.[side] ?? 0) === 0;
  }).length;
  return closed >= rule.min_closed_sides;
}
