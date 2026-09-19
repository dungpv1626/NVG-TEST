/**
 * Mặt sàn dùng chung của công trình — một phép tính, hai đường chạy.
 *
 * Cả đường đồng bộ (`layout/variants.ts`) lẫn đường Workflow (`workflows/design-pipeline.ts`)
 * đều phải trả lời cùng một câu hỏi trước khi dựng ý đồ bố cục: bộ giải sẽ làm việc trên ô
 * chữ nhật nào. Tính riêng ở hai nơi thì sớm muộn hai nơi trả lời khác nhau, và cùng một đầu
 * bài cho ra hai khung mẫu khác nhau mà không có gì nói ra điều đó.
 */

import { siteGeometry, type DesignBrief, type SpaceProgram } from '@nvg/shared/design';
import { strictestSetbacks } from '../program/site-limits';
import type { Plate } from './intent';

/**
 * Ô chữ nhật mà bộ giải sẽ chia.
 *
 * Phải khớp `compute/src/design_compute/solver/model.py::_footprint`: ô chữ nhật xây được,
 * THU vào theo khoảng lùi từng phía, thu chiều sâu theo TRẦN MẬT ĐỘ (mức chặt hơn giữa gói
 * quy tắc và đầu bài, nhân với diện tích thửa — đúng `max_density` phía Python), rồi thu tiếp
 * theo mặt sàn mà chương trình không gian chọn dùng (`floor_allocation.usable_area_m2`, lấy
 * tầng cần nhiều nhất — hình bao dùng chung cho cả công trình nên phải đủ cho tầng nặng
 * nhất). Chỉ thu, không bao giờ nới.
 *
 * Bước mật độ từng THIẾU ở đây (rà soát 08/09/2026): chương trình cũ không có `floor_allocation`
 * của biệt thự 20 × 30 m, mật độ 0,6, lùi trước 3 m → Worker tính sâu 27 m trong khi bộ giải
 * chia 18 m, và khung mẫu được chọn theo một mặt sàn không tồn tại.
 *
 * Khoảng lùi từng bị BỎ QUÊN ở đây cho tới 07/09/2026. Nhà phố lùi 0 nên hai bên trùng nhau
 * và không ai thấy; biệt thự lùi 3 m thì mặt sàn dùng để chọn khung mẫu rộng hơn phần đất
 * bộ giải thật sự chia, nên `chooseFrame` chọn khung theo một bề rộng không tồn tại.
 *
 * Chương trình cũ không có `floor_allocation` thì giữ nguyên ô đã trừ lùi — không đoán.
 */
export function plateFor(
  brief: DesignBrief,
  program: SpaceProgram,
  /**
   * Khoảng lùi theo gói quy tắc (`RuleCatalogue.setbacks`). Rỗng nghĩa là lớp gọi KHÔNG CÓ
   * gói quy tắc trong tay — khi đó chỉ còn khoảng lùi khai trong đầu bài, và mặt sàn có thể
   * rộng hơn thực tế. Không tự dựng lại con số quy chuẩn ở đây: Worker đọc rule pack chứ
   * không tự đánh giá nó (CLAUDE.md 8.7).
   */
  packSetbacks: Readonly<Record<string, number>> = {},
  /** Trần mật độ theo gói quy tắc (`RuleCatalogue.maxDensity`), `null` = gói không nói gì. */
  packMaxDensity: number | null = null,
): Plate {
  const geometry = siteGeometry(brief.site);
  const buildable = geometry.buildable;
  const setbacks = strictestSetbacks(packSetbacks, brief);
  const widthM = Math.max(0, buildable.widthM - setbacks.left - setbacks.right);
  let insetDepthM = Math.max(0, buildable.depthM - setbacks.front - setbacks.back);

  // Mật độ: mức CHẶT hơn giữa gói quy tắc và đầu bài, như `max_density` phía Python. Không có
  // bên nào nói thì không thu — `null` là "không biết", không phải "được phủ kín lô".
  const declared = brief.site.max_density ?? null;
  const density =
    packMaxDensity === null
      ? declared
      : declared === null
        ? packMaxDensity
        : Math.min(packMaxDensity, declared);
  if (density !== null && widthM > 0) {
    insetDepthM = Math.min(insetDepthM, (density * geometry.areaM2) / widthM);
  }

  const wanted = (program.floor_allocation ?? [])
    .map((entry) => entry.usable_area_m2)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const depthM =
    wanted.length && widthM > 0 ? Math.min(insetDepthM, Math.max(...wanted) / widthM) : insetDepthM;
  return { widthM, depthM };
}
