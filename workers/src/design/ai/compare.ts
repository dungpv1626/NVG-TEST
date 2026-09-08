/**
 * So chương trình do AI lập với bản bộ giải nội bộ — để kiến trúc sư thấy AI đổi gì.
 *
 * Ghép theo `id` (`type_n`, cùng khuôn đánh số ở hai nhánh): trùng id thì một dòng hai cột;
 * chỉ một bên có thì cột bên kia rỗng. Câu chữ hiển thị do màn hình dựng; hàm này chỉ trả số.
 */

import type { SpaceProgram } from '@nvg/shared/design';

export interface ComparisonRow {
  key: string;
  type: string;
  floor: number | null;
  solver_m2: number | null;
  ai_m2: number | null;
}

export function compareProgramsById(solver: SpaceProgram, ai: SpaceProgram): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  for (const s of solver.spaces) {
    rows.set(s.id, {
      key: s.id,
      type: s.type,
      floor: s.floor,
      solver_m2: s.target_area_m2 ?? null,
      ai_m2: null,
    });
  }
  for (const s of ai.spaces) {
    const row = rows.get(s.id);
    if (row) {
      row.ai_m2 = s.target_area_m2 ?? null;
      // Cùng id nhưng khác tầng: nói tầng của AI, vì đó là bản đang được chốt.
      if (row.floor !== s.floor) row.floor = s.floor;
    } else {
      rows.set(s.id, {
        key: s.id,
        type: s.type,
        floor: s.floor,
        solver_m2: null,
        ai_m2: s.target_area_m2 ?? null,
      });
    }
  }
  return [...rows.values()].sort(
    (a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.key.localeCompare(b.key),
  );
}
