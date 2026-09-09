/**
 * Quy ước cấu tạo của NVG — bề dày tường, cao độ tầng, kích thước cửa và cửa sổ.
 *
 * Nguồn: `kb/construction_norms.yaml`, đo từ hồ sơ thật (xem `do_duoc` trong chính tệp đó).
 *
 * ⚠️ Đây là `kb/`, KHÔNG phải `rules/` — phân biệt này quyết định chỗ dùng (CLAUDE.md 8.8
 * mục 7). Số ở đây nói bản vẽ TRÔNG thế nào; số ở `rules/` nói phương án có hợp lệ hay không.
 * Nhánh AI được phép đưa số ở đây vào lời dẫn (mô hình cần biết tường dày bao nhiêu để vẽ),
 * và CẤM đưa số ở `rules/` vào (T14).
 *
 * Phần tệp này đọc là phần dùng để VẼ. Những mục còn lại của tệp YAML (`schedule_columns`,
 * `materials_seen`, `hardware_seen`, `notes_on_every_sheet`) thuộc về bảng thống kê và khung
 * tên của bộ giải, nhánh AI không cần.
 */

import { load as parseYaml } from 'js-yaml';

export interface OpeningNorm {
  width_m?: number;
  height_m?: number;
  sill_m?: number;
  min_width_m?: number;
  max_width_m?: number;
  share_of_wall?: number;
}

export interface ConstructionNorms {
  version: string;
  walls: { exterior_m: number; load_bearing_m: number; partition_m: number };
  levels: { storey_height_m: number; top_storey_height_m: number };
  openings: Record<string, OpeningNorm>;
  /** Loại phòng không mở cửa sổ ra ngoài (thang, kho kỹ thuật, để xe…). */
  no_window_types: string[];
  outdoor: { railing_h_m: number; railing_thickness_m: number };
}

export class ConstructionNormsError extends Error {
  constructor(message: string) {
    super(`Không đọc được quy ước cấu tạo: ${message}`);
    this.name = 'ConstructionNormsError';
  }
}

export function parseConstructionNorms(yamlText: string): ConstructionNorms {
  const raw = parseYaml(yamlText) as Partial<ConstructionNorms> | null;
  if (!raw || typeof raw !== 'object') throw new ConstructionNormsError('tệp rỗng');
  for (const key of ['walls', 'levels', 'openings', 'outdoor'] as const) {
    if (!raw[key]) throw new ConstructionNormsError(`thiếu mục "${key}"`);
  }
  return {
    version: String(raw.version ?? '0.0.0'),
    walls: raw.walls!,
    levels: raw.levels!,
    openings: raw.openings!,
    no_window_types: raw.no_window_types ?? [],
    outdoor: raw.outdoor!,
  };
}
