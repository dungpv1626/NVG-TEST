/**
 * Nhãn tiếng Việt cho TỪNG không gian của chương trình, không phải cho từng loại phòng.
 *
 * `roomLabels()` ở `index.ts` trả nhãn theo LOẠI (`bedroom` → "Phòng ngủ"). Ở đây cần nhãn
 * theo không gian cụ thể ("Phòng ngủ 2"), vì câu thông báo vi phạm nói về một phòng chứ không
 * về một loại phòng. Số thứ tự chỉ hiện khi tầng nhà có nhiều hơn một phòng cùng loại — thêm
 * số vào chỗ chỉ có một cái là làm người đọc đi tìm cái số một không tồn tại.
 */

import type { SpaceProgram } from '@nvg/shared/design';

/**
 * `viByType` do lớp gọi cấp (từ `kb/room_vocabulary.yaml`) chứ không tự nạp: tệp YAML chỉ
 * nhúng được vào BẢN DỰNG Worker, còn hàm này phải kiểm thử được bằng Node thuần.
 */
export function spaceLabels(
  program: SpaceProgram,
  viByType: Record<string, string>,
): Record<string, string> {
  const vi = viByType;

  const total = new Map<string, number>();
  for (const space of program.spaces) {
    total.set(space.type, (total.get(space.type) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const labels: Record<string, string> = {};
  for (const space of program.spaces) {
    const index = (seen.get(space.type) ?? 0) + 1;
    seen.set(space.type, index);
    const base = vi[space.type] ?? space.type;
    labels[space.id] = (total.get(space.type) ?? 1) > 1 ? `${base} ${index}` : base;
  }
  return labels;
}
