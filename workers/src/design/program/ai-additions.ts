/**
 * Cưỡng chế luật diện tích cho không gian AI đề xuất thêm (Lớp 2a) — hàm thuần, kiểm thử được
 * mà không cần dữ liệu nhúng.
 */

import type { ProgramResult } from './engine';
import type { SpaceNorms } from './norms';

/**
 * Giữ không gian AI đề xuất thêm theo THỨ TỰ mô hình nêu, tới khi hết phần sàn còn lại.
 *
 * Phần sàn còn lại = sàn cho phép mỗi tầng × số tầng − tổng diện tích TỐI THIỂU của chương
 * trình khi chưa có đề xuất thêm. Đo bằng tối thiểu vì đó là phần không co được: đề xuất nào
 * mà ngay tối thiểu của nó cũng không vừa thì thêm vào chỉ làm các phòng khác bị cắt.
 */
export function fitAiAdditions(
  requested: readonly string[],
  baseline: () => ProgramResult,
  norms: SpaceNorms,
  labelOf: (code: string) => string,
): { kept: string[]; dropped: string[]; spareMinAreaM2: number; notes: string[] } {
  if (!requested.length) return { kept: [], dropped: [], spareMinAreaM2: 0, notes: [] };
  const base = baseline();
  const e = base.plateExplanation;
  const usedMin = base.payload.spaces.reduce((sum, s) => sum + s.min_area_m2, 0);
  let spare = e.buildableM2 * e.floors - usedMin;
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const code of requested) {
    const cost = norms.spaces[code]?.min_m2 ?? 0;
    if (cost <= spare + 1e-9) {
      kept.push(code);
      spare -= cost;
    } else {
      dropped.push(code);
    }
  }
  const notes = dropped.length
    ? [
        `Bỏ ${dropped.length} không gian AI đề xuất thêm vì vượt sàn cho phép: ${dropped.map(labelOf).join(', ')}.`,
      ]
    : [];
  return { kept, dropped, spareMinAreaM2: Math.max(0, spare), notes };
}
