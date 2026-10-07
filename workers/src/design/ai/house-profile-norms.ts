/**
 * Số đo cửa / hành lang theo loại nhà (T116, handoff v6 mục 3.3). Gắn vào `ConstructionNorms` lúc dựng đầu vào của
 * lượt — cùng chỗ với `withStairShape` — để mọi nơi đọc số đo (cổng cửa, bộ xếp, bộ vẽ) dùng đúng một bộ số.
 */
import type { AiBriefDigest } from '@nvg/shared/design';
import { houseProfile } from '@nvg/shared/design';
import type { ConstructionNorms } from '../kb/construction';

export function withHouseProfile(
  construction: ConstructionNorms,
  digest: AiBriefDigest,
): ConstructionNorms {
  const norms = construction.by_house_profile?.[houseProfile(digest).profile];
  if (!norms) return construction;
  const sized = (key: string, width: number | undefined) => {
    const norm = construction.openings[key];
    return norm && width !== undefined ? { [key]: { ...norm, width_m: width } } : {};
  };
  return {
    ...construction,
    openings: {
      ...construction.openings,
      ...sized('door', norms.door_width_m),
      ...sized('wc_door', norms.wc_door_width_m),
    },
    openingRules: {
      ...construction.openingRules,
      ...(norms.door_margin_m !== undefined ? { door_margin_m: norms.door_margin_m } : {}),
    },
    ...(construction.usable && (norms.min_side_m || norms.max_aspect)
      ? {
          usable: {
            ...construction.usable,
            min_side_m: { ...construction.usable.min_side_m, ...norms.min_side_m },
            ...(norms.max_aspect
              ? { max_aspect: { ...construction.usable.max_aspect, ...norms.max_aspect } }
              : {}),
          },
        }
      : {}),
    ...(construction.circulation && norms.corridor_clear_m !== undefined
      ? { circulation: { ...construction.circulation, corridor_clear_m: norms.corridor_clear_m } }
      : {}),
  };
}

/**
 * Cạnh tối thiểu (m) của một loại phòng theo loại nhà — `min_side_m` của `by_house_profile`, hành lang (`circulation`)
 * lấy `corridor_clear_m`; `null` = loại nhà không khai, dùng ngưỡng chung.
 */
export function profileMinSide(
  construction: ConstructionNorms,
  profile: string,
): (type: string) => number | null {
  const norms = construction.by_house_profile?.[profile];
  return (type) =>
    norms?.min_side_m?.[type] ??
    (type === 'circulation' ? (norms?.corridor_clear_m ?? null) : null);
}

/** Loại phòng lấy sáng giữa nhà — có một trong số này thì không cần lưu ý giếng trời. */
const LIGHT_SOURCES = new Set(['light_well', 'courtyard']);

/**
 * Lưu ý «nên có giếng trời» (T116): khối nhà sâu hơn `light_well_advice_depth_m` của loại nhà mà phương án không có giếng
 * trời / sân trong. Chỉ là câu ghi chú cho kỹ sư — T96 giữ nguyên: không tự vẽ, không đòi mô hình thêm.
 */
export function lightWellAdvice(
  construction: ConstructionNorms,
  digest: AiBriefDigest,
  roomTypes: readonly string[],
): { code: 'light_well_advice'; message: string } | null {
  const result = houseProfile(digest);
  const limit = construction.by_house_profile?.[result.profile]?.light_well_advice_depth_m;
  if (limit === undefined || !result.block || result.block.depth_m <= limit) return null;
  if (roomTypes.some((type) => LIGHT_SOURCES.has(type))) return null;
  const depth = Math.round(result.block.depth_m * 10) / 10;
  return {
    code: 'light_well_advice',
    message: `Khối nhà sâu ${String(depth).replace('.', ',')} m mà chưa có giếng trời hay sân trong — các phòng giữa nhà có thể thiếu sáng và gió; nên cân nhắc thêm giếng trời (đầu bài chưa hỏi tới nên chương trình không tự vẽ).`,
  };
}
