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

type Face = 'front' | 'back' | 'left' | 'right';

/**
 * Kiểm ánh sáng TRƯỚC lượt «Xếp mặt bằng» (29/10/2026). Phần khối xây cách mọi mặt thoáng xa hơn `daylight_reach_m` không
 * đặt được phòng có cửa sổ ra mặt thoáng — mô hình xếp thế nào thì phòng ở rơi vào đó cũng tối. Phần ấy quá
 * `daylight_interior_share_advice` diện tích tầng mà đầu bài không hỏi giếng trời / sân trong thì báo TRƯỚC khi tốn tiền.
 * Chỉ cảnh báo (T52); không tự vẽ giếng trời (T96). Gần đúng theo hình chữ nhật xây được — phần lõm của thửa đa giác bỏ qua.
 */
export function daylightPreflightAdvice(
  construction: ConstructionNorms,
  digest: AiBriefDigest,
  block: { widthM: number; depthM: number },
  openFaces: readonly Face[],
  /** Loại đầu bài BẮT có (dòng «Không gian gia chủ yêu cầu») và loại đầu bài chỉ mở đường (vd «sân trong» ở khoảng sân). */
  spaces: { required: ReadonlySet<string>; allowed: ReadonlySet<string> },
): string | null {
  const norms = construction.by_house_profile?.[houseProfile(digest).profile];
  const reach = norms?.daylight_reach_m;
  const limit = norms?.daylight_interior_share_advice;
  if (reach === undefined || limit === undefined) return null;
  if ([...LIGHT_SOURCES].some((type) => spaces.required.has(type))) return null;
  // Chỉ mở đường mà không bắt: lượt thật 9272 (đầu bài có «chỗ phơi ngoài trời» nên sân trong được phép) — mô hình không xếp giếng nào.
  const allowed = [...LIGHT_SOURCES].some((type) => spaces.allowed.has(type));
  const area = block.widthM * block.depthM;
  if (!(area > 0)) return null;
  const cut = (faces: readonly Face[]) => faces.filter((face) => openFaces.includes(face)).length;
  const inner =
    Math.max(0, block.widthM - reach * cut(['left', 'right'])) *
    Math.max(0, block.depthM - reach * cut(['front', 'back']));
  const share = inner / area;
  if (share <= limit) return null;
  const num = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  const faces = openFaces.map((face) => FACE_LABEL[face]).join(', ');
  return (
    `Khối nhà ${num(block.widthM)} × ${num(block.depthM)} m chỉ thoáng ${faces}: khoảng ${Math.round(inner)} m² mỗi tầng ` +
    `(${Math.round(share * 100)} %) nằm sâu hơn ${num(reach)} m tính từ mặt thoáng, phòng ở đặt vào đó sẽ không có cửa sổ. ` +
    'Muốn mọi phòng ngủ đều sáng thì thêm «Giếng trời» hoặc «Sân trong» ở mục «Không gian gia chủ yêu cầu» của đầu bài' +
    (allowed
      ? ' — đầu bài mới cho phép chứ chưa buộc phải có, nên AI có thể bỏ qua.'
      : ' (đầu bài chưa hỏi tới nên AI không được tự thêm).')
  );
}

const FACE_LABEL: Record<Face, string> = {
  front: 'mặt trước',
  back: 'mặt sau',
  left: 'mặt trái',
  right: 'mặt phải',
};
