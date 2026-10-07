/**
 * Loại thang bộ của một lượt (T105, Haan 30/09/2026): gia chủ chọn ở đầu bài (`vertical.stair_shape`) thì dùng đúng loại
 * ấy; «chưa quyết» hoặc đầu bài cũ chưa có câu này thì chương trình chọn theo khối nhà, theo gợi ý của tài liệu «Các loại
 * thang bộ phổ biến» (`doc/design/thang-bo-mat-bang.pdf`):
 *  · nhà có người từ `ELDERLY_AGE` tuổi hoặc người đi lại khó khăn, khối đủ rộng → U chiếu nghỉ rộng («hợp nhà có người
 *    già»);
 *  · khối xây hẹp dưới `NARROW_CM` → thang thẳng («nhà ống mặt tiền hẹp nhưng sâu»);
 *  · còn lại → chữ U («gọn nhất, phổ biến nhất»).
 * Chữ L và ba vế chỉ khi gia chủ chọn: chúng hợp hay không tuỳ bố cục, quy tắc thô không suy ra được.
 *
 * Kết quả gắn vào `construction.stairs.shape` (`withStairShape`) — mọi chỗ tính ô thang và bộ vẽ đọc từ đó.
 */

import { houseProfile, type AiBriefDigest } from '@nvg/shared/design';
import { STAIR_SHAPES, type ConstructionNorms, type StairShape } from '../kb/construction';
import { buildableFromDigest } from './buildable';
import { stairNeed } from './stair-geometry';
import { stairParamsOf, stairTreads } from './tree/stair-fit';

/** Tuổi từ đó tính là người già — lời tài liệu «nhà có người già». */
const ELDERLY_AGE = 65;
/** Khối xây hẹp hơn thì thang thẳng — tài liệu: nhà ống mặt tiền hẹp; U cần ô 2,4 m và còn lối đi bên cạnh. */
const NARROW_CM = 400;
/** Nhà ống: bề ngang tối thiểu chừa cạnh thang (lối đi 0,9 m + vách) để loại thang được coi là vừa khối. */
const ONG_BESIDE_CM = 100;

export interface StairChoice {
  shape: StairShape;
  /** Câu tiếng Việt cho ghi chú mặt bằng. */
  reason: string;
}

export function chooseStairShape(
  digest: AiBriefDigest,
  construction: ConstructionNorms,
): StairChoice | null {
  const shapes = construction.stairs.shapes;
  if (!shapes) return null;
  const has = (shape: StairShape) => shapes[shape] !== undefined;
  const answer = digest.vertical?.stair_shape;
  if (answer && answer !== 'chua_quyet' && (STAIR_SHAPES as readonly string[]).includes(answer)) {
    const shape = answer as StairShape;
    if (has(shape)) return { shape, reason: `gia chủ chọn ${shapes[shape]!.vi.toLowerCase()}` };
  }
  const box = buildableFromDigest(digest);
  const widthCm = Math.round((box.x1 - box.x0) * 100);
  const elderly =
    digest.lifestyle?.reduced_mobility === true ||
    (digest.family ?? []).some((member) => (member.ages ?? []).some((age) => age >= ELDERLY_AGE));
  const needOf = (shape: StairShape) => {
    const treads = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
    const params = stairParamsOf(
      { ...construction, stairs: { ...construction.stairs, shape } },
      treads,
    );
    return params ? stairNeed(params) : null;
  };
  const fitsAcross = (shape: StairShape) => {
    const need = needOf(shape);
    return need !== null && Math.min(need.along, need.across) <= widthCm / 2;
  };
  if (elderly && has('chu_u_rong') && fitsAcross('chu_u_rong')) {
    return {
      shape: 'chu_u_rong',
      reason: 'nhà có người già / đi lại khó khăn — chiếu nghỉ sâu 1,5 m nghỉ chân, xoay đồ dễ',
    };
  }
  // Nhà ống (Haan chấm lượt a68c50bb, T116: «diện tích cầu thang tối thiểu nhất có thể»): loại chiếm ít diện tích nhất
  // trong các loại vừa bề ngang (chừa ít nhất `ONG_BESIDE_CM` cạnh thang cho lối đi / phòng). Chữ L và ba vế vẫn chỉ khi
  // gia chủ chọn.
  if (houseProfile(digest).profile === 'ong') {
    const smallest = (['thang_thang', 'chu_u'] as const)
      .filter((shape) => has(shape))
      .map((shape) => ({ shape, need: needOf(shape) }))
      .filter(
        (
          item,
        ): item is { shape: 'thang_thang' | 'chu_u'; need: { along: number; across: number } } =>
          item.need !== null &&
          Math.min(item.need.along, item.need.across) + ONG_BESIDE_CM <= widthCm,
      )
      .sort((a, b) => a.need.along * a.need.across - b.need.along * b.need.across)[0];
    if (smallest) {
      const m2 = (smallest.need.along * smallest.need.across) / 1e4;
      return {
        shape: smallest.shape,
        reason: `nhà ống — loại thang chiếm ít diện tích nhất vừa khối (${m2.toFixed(1)} m²)`,
      };
    }
  }
  if (widthCm < NARROW_CM && has('thang_thang')) {
    return {
      shape: 'thang_thang',
      reason: `khối xây chỉ rộng ${(widthCm / 100).toFixed(1)} m — thang thẳng chiếm ít bề ngang`,
    };
  }
  if (has('chu_u')) return { shape: 'chu_u', reason: 'loại gọn nhất, phổ biến nhất' };
  return null;
}

/** `construction` mang loại thang của lượt — gắn MỘT lần ở cửa vào của lượt chạy (ngữ cảnh, bước lưu, phát lại). */
export function withStairShape(
  construction: ConstructionNorms,
  digest: AiBriefDigest,
): ConstructionNorms {
  const choice = chooseStairShape(digest, construction);
  return choice
    ? { ...construction, stairs: { ...construction.stairs, shape: choice.shape } }
    : construction;
}
