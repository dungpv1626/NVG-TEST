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

/** Phần của `openings` không phải một quy cách ô cửa — cách chọn quy cách (T40). */
export interface OpeningRules {
  /** `kind` của cửa → tên quy cách trong `openings`. */
  door_by_kind: Record<string, string>;
  /** Loại phòng dùng cửa và cửa sổ vệ sinh. */
  wc_door_types: string[];
  /** Loại phòng nhỏ dùng CỬA vệ sinh (hẹp) nhưng không dùng cửa sổ vệ sinh — kho, tủ đồ. */
  narrow_door_types: string[];
  door_margin_m: number;
  window_priority: string[];
}

export interface SketchNorms {
  area_slack_ratio: number;
  /** Số lần bộ xếp tự nới phòng hụt ô trên bản phác trước khi bỏ bản phác — 0 = tắt (T79). */
  grow_tries: number;
  /** Dung sai đo ở cổng sau khi dựng cho sàn đầu bài khai, tỉ lệ — 0 = so thẳng (T82, Haan chọn 3 %). */
  floor_tolerance_ratio: number;
}

export interface EntryStepNorms {
  /** Bề sâu mặt bậc — giữ cố định, số bậc thay đổi theo chênh cốt. */
  going_m: number;
  /** Cổ bậc để CHIA chênh cốt ra số bậc (làm tròn lên). */
  riser_m: number;
  /** Bề rộng lối lên nhỏ nhất. */
  width_min_m: number;
  /** Lối lên rộng hơn lỗ cửa chính bấy nhiêu (cộng cả hai bên). */
  width_over_door_m: number;
  /** Trần số bậc — chênh cốt lớn hơn thì không vẽ, nói ra. */
  max_count: number;
}

export interface ConstructionNorms {
  version: string;
  walls: { exterior_m: number; load_bearing_m: number; partition_m: number };
  levels: { storey_height_m: number; top_storey_height_m: number };
  /** Cao bậc và ngưỡng hai vế — chương trình tính số bậc, không hỏi mô hình (T37). */
  stairs: {
    riser_m: number;
    two_flights_min_width_m: number;
    /** Bề sâu mặt bậc nhỏ nhất — điều kiện dựng ô thang của bộ giải ý định; vắng = không kiểm. */
    going_m?: number;
  };
  openings: Record<string, OpeningNorm>;
  openingRules: OpeningRules;
  /** Loại phòng không mở cửa sổ ra ngoài (thang, kho kỹ thuật, để xe…). */
  no_window_types: string[];
  outdoor: { railing_h_m: number; railing_thickness_m: number };
  /** Cốt vỉa hè và tường chắn mái mặc định cho tờ mặt đứng (T59) — vắng thì bước mặt đứng không dựng được khung. */
  facade?: { ground_floor_raise_m: number; parapet_height_m: number };
  /** Hành lang bộ giải ý định tự dựng (T43) — số tham khảo; vắng thì bộ giải dùng cửa đi + lề. */
  circulation?: { corridor_clear_m: number };
  /**
   * Bậc ở lối vào (bậc tam cấp, T70) — đo trên HS-04/05/06. Vắng thì mặt bằng không vẽ bậc lối vào,
   * đúng hành vi trước T70.
   */
  entry_steps?: EntryStepNorms;
  /** Bản phác lưới ô (T73): hụt diện tích đầu bài quá tỉ lệ này thì báo mô hình ngay. */
  sketch?: SketchNorms;
  /**
   * Cạnh ngắn DÙNG ĐƯỢC theo loại phòng, lọt lòng — điều kiện dựng của bộ giải ý định, KHÔNG phải số
   * kinh nghiệm (V-28). Vắng thì không có điều kiện nào.
   */
  usable?: {
    min_side_m: Record<string, number>;
    garage_with_car_m?: number;
    /** Tỉ lệ dài/rộng lọt lòng tối đa của phòng ở — cùng lý lẽ «dùng được». */
    max_aspect?: Record<string, number>;
  };
}

/**
 * Cạnh ngắn dùng được của một loại phòng, m — `null` khi quy cách không nói gì. Gara chứa ô tô dùng
 * mức riêng: gara xe máy 2,4 m không mở nổi cửa ô tô.
 */
export function usableMinSide(
  norms: ConstructionNorms,
  roomType: string,
  context: { cars: number },
): number | null {
  const usable = norms.usable;
  if (!usable) return null;
  if (roomType === 'garage' && context.cars > 0 && usable.garage_with_car_m !== undefined) {
    return usable.garage_with_car_m;
  }
  return usable.min_side_m[roomType] ?? null;
}

/** Tỉ lệ dài/rộng lọt lòng tối đa DÙNG ĐƯỢC của một loại phòng — `null` khi không có mức. */
export function usableMaxAspect(norms: ConstructionNorms, roomType: string): number | null {
  return norms.usable?.max_aspect?.[roomType] ?? null;
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
  for (const key of ['walls', 'levels', 'stairs', 'openings', 'outdoor'] as const) {
    if (!raw[key]) throw new ConstructionNormsError(`thiếu mục "${key}"`);
  }

  // Tách phần QUY TẮC CHỌN ra khỏi bảng quy cách: nơi đọc `openings` duyệt từng mục như một ô
  // cửa, và một mục `door_by_kind` lẫn vào đó sẽ bị đọc thành một ô cửa không có kích thước.
  const {
    door_by_kind,
    wc_door_types,
    narrow_door_types,
    door_margin_m,
    window_priority,
    ...sizes
  } = raw.openings as Record<string, unknown>;
  if (!door_by_kind || typeof door_by_kind !== 'object') {
    throw new ConstructionNormsError('thiếu "openings.door_by_kind"');
  }
  for (const [kind, norm] of Object.entries(door_by_kind as Record<string, string>)) {
    if (!(norm in sizes)) {
      throw new ConstructionNormsError(`cửa loại "${kind}" trỏ tới quy cách "${norm}" không có`);
    }
  }
  if (typeof door_margin_m !== 'number') {
    throw new ConstructionNormsError('thiếu "openings.door_margin_m"');
  }

  return {
    version: String(raw.version ?? '0.0.0'),
    walls: raw.walls!,
    levels: raw.levels!,
    stairs: raw.stairs!,
    openings: sizes as Record<string, OpeningNorm>,
    openingRules: {
      door_by_kind: door_by_kind as Record<string, string>,
      wc_door_types: (wc_door_types as string[] | undefined) ?? [],
      narrow_door_types: (narrow_door_types as string[] | undefined) ?? [],
      door_margin_m,
      window_priority: (window_priority as string[] | undefined) ?? ['outline'],
    },
    no_window_types: raw.no_window_types ?? [],
    outdoor: raw.outdoor!,
    ...(raw.facade ? { facade: parseFacade(raw.facade) } : {}),
    ...(raw.circulation ? { circulation: raw.circulation } : {}),
    ...(raw.usable ? { usable: parseUsable(raw.usable) } : {}),
    ...(raw.entry_steps ? { entry_steps: parseEntrySteps(raw.entry_steps) } : {}),
    ...(raw.sketch ? { sketch: parseSketch(raw.sketch) } : {}),
  };
}

function parseSketch(raw: unknown): SketchNorms {
  const ratio = (raw as Record<string, unknown>).area_slack_ratio;
  if (typeof ratio !== 'number' || !(ratio >= 0 && ratio < 1)) {
    throw new ConstructionNormsError('"sketch.area_slack_ratio" phải là số trong [0, 1)');
  }
  const tries = (raw as Record<string, unknown>).grow_tries ?? 0;
  if (typeof tries !== 'number' || !Number.isInteger(tries) || tries < 0) {
    throw new ConstructionNormsError('"sketch.grow_tries" phải là số nguyên không âm');
  }
  const tolerance = (raw as Record<string, unknown>).floor_tolerance_ratio ?? 0;
  if (typeof tolerance !== 'number' || !(tolerance >= 0 && tolerance < 1)) {
    throw new ConstructionNormsError('"sketch.floor_tolerance_ratio" phải là số trong [0, 1)');
  }
  return { area_slack_ratio: ratio, grow_tries: tries, floor_tolerance_ratio: tolerance };
}

function parseEntrySteps(raw: unknown): EntryStepNorms {
  const section = raw as Record<string, unknown>;
  const read = (key: keyof EntryStepNorms): number => {
    const value = section[key];
    if (typeof value !== 'number' || !(value > 0)) {
      throw new ConstructionNormsError(`"entry_steps.${key}" phải là số dương`);
    }
    return value;
  };
  return {
    going_m: read('going_m'),
    riser_m: read('riser_m'),
    width_min_m: read('width_min_m'),
    width_over_door_m: read('width_over_door_m'),
    max_count: Math.floor(read('max_count')),
  };
}

function parseFacade(raw: unknown): NonNullable<ConstructionNorms['facade']> {
  const value = raw as Record<string, unknown>;
  for (const key of ['ground_floor_raise_m', 'parapet_height_m']) {
    if (typeof value[key] !== 'number' || !((value[key] as number) >= 0)) {
      throw new ConstructionNormsError(`"facade.${key}" phải là số không âm`);
    }
  }
  return {
    ground_floor_raise_m: value.ground_floor_raise_m as number,
    parapet_height_m: value.parapet_height_m as number,
  };
}

function parseUsable(raw: unknown): NonNullable<ConstructionNorms['usable']> {
  const value = raw as { min_side_m?: unknown; garage_with_car_m?: unknown };
  if (!value.min_side_m || typeof value.min_side_m !== 'object') {
    throw new ConstructionNormsError('thiếu "usable.min_side_m"');
  }
  for (const [type, metres] of Object.entries(value.min_side_m as Record<string, unknown>)) {
    if (typeof metres !== 'number' || !(metres > 0)) {
      throw new ConstructionNormsError(`"usable.min_side_m.${type}" phải là số dương`);
    }
  }
  const aspects = (raw as { max_aspect?: unknown }).max_aspect;
  if (aspects !== undefined) {
    if (!aspects || typeof aspects !== 'object') {
      throw new ConstructionNormsError('"usable.max_aspect" phải là bảng loại phòng → số');
    }
    for (const [type, ratio] of Object.entries(aspects as Record<string, unknown>)) {
      if (typeof ratio !== 'number' || !(ratio >= 1)) {
        throw new ConstructionNormsError(`"usable.max_aspect.${type}" phải là số từ 1 trở lên`);
      }
    }
  }
  if (value.garage_with_car_m !== undefined && typeof value.garage_with_car_m !== 'number') {
    throw new ConstructionNormsError('"usable.garage_with_car_m" phải là số');
  }
  return {
    min_side_m: value.min_side_m as Record<string, number>,
    ...(typeof value.garage_with_car_m === 'number'
      ? { garage_with_car_m: value.garage_with_car_m }
      : {}),
    ...(aspects ? { max_aspect: aspects as Record<string, number> } : {}),
  };
}
