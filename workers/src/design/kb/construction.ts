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

/** Số đo đè theo loại nhà (`by_house_profile.<loại>`), m. Mục vắng = giữ số chung. */
export interface HouseProfileNorms {
  door_width_m?: number;
  wc_door_width_m?: number;
  door_margin_m?: number;
  corridor_clear_m?: number;
  /** Cạnh ngắn dùng được theo loại phòng, m — đè `usable.min_side_m` (vd ban công nhà ống theo lộ giới). */
  min_side_m?: Record<string, number>;
  /** Tỉ lệ dài / rộng lọt lòng tối đa theo loại phòng — đè `usable.max_aspect` (vd WC nhà ống, T116). */
  max_aspect?: Record<string, number>;
  /**
   * Khối nhà sâu hơn ngần này mà phương án không có giếng trời / sân trong → ghi LƯU Ý «nên có giếng trời» (T116; giữ
   * T96: không tự vẽ, không trừ điểm, không chặn).
   */
  light_well_advice_depth_m?: number;
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
  /**
   * Phòng phụ nhỏ không lối vào trên bản phác — chương trình nhập vào phòng bên cạnh (T153). Vắng = tắt.
   */
  absorb_stranded?: { types: string[]; max_area_m2: number };
  /**
   * Bước quay lui T172: tầng trên hỏng thì dời ô thang tầng 1 tối đa bấy nhiêu ô lưới bản phác mỗi phía, theo từng trục.
   * Vắng = tắt.
   */
  ground_core_shift?: { max_steps: number };
  /**
   * Dời vách bản phác T177 (`arrange/sketch-repair.ts`): phòng không lối vào / hụt sàn đầu bài mà tầng còn dư thì chương
   * trình dời tối đa bấy nhiêu đoạn vách một ô lưới trước khi gửi lại mô hình. Vắng = tắt.
   */
  repair_walls?: { max_moves: number; max_new_corridors: number; beam: number; patience: number };
  /**
   * Ô thang có chỗ trong cả nhà không (T178, `ai/stair-fit.ts`), kiểm trước lời gọi mô hình đầu tiên: `block` — chặn khi
   * chắc chắn không tầng nào dựng được dù đặt ô thang ở đâu; `warn_share` — cảnh báo «khá chật» khi vùng chặt nhất quanh
   * ô thang đã dùng từ tỉ lệ này (`null` = không cảnh báo). Vắng = không kiểm.
   */
  stair_fit?: { block: boolean; warn_share: number | null };
  /**
   * Khung hai hàng T179 (`arrange/skeleton-rows.ts`): khung xương T102 không ra cây nào qua cổng ở tầng trên thì dựng thêm
   * kiểu hành lang áp đầu bước ra của ô thang, dải dọc cạnh thang, dải sâu chia HAI hàng phòng kẹp hành lang. Số ứng viên
   * tối đa, số lần dời phòng giữa các hàng khi chia, bước dò chiều sâu hàng (cm). Vắng hoặc `max_candidates: 0` = tắt.
   */
  skeleton_rows?: {
    max_candidates: number;
    max_moves: number;
    depth_step_cm: number;
    /**
     * Bước chỉnh T180 sau khi chia được: dời / đổi phòng cho khu ướt nằm trên khu ướt tầng dưới, không đè chỗ khô (E5), phòng
     * ở có mặt thoáng (D2). Trọng số chỉ để so các cách xếp với nhau, không phải điểm. Vắng = không chỉnh.
     */
    prefer?: {
      max_moves: number;
      wet_over_dry: number;
      dark_room: number;
      dark_bedroom: number;
      wet_distance_per_m: number;
      floor_margin_ratio: number;
      tight_floor: number;
    };
  };
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

/** Năm loại thang CHÍNH (T105, tài liệu thang bộ) — thang xoắn ốc chỉ làm thang phụ nên không có ở đây. */
export const STAIR_SHAPES = ['thang_thang', 'chu_l', 'chu_u', 'ba_ve', 'chu_u_rong'] as const;
export type StairShape = (typeof STAIR_SHAPES)[number];

export interface StairShapeSpec {
  vi: string;
  /** Bề rộng vế thông thuỷ, m. */
  flight_width_m: number;
  /** Chiều sâu chiếu nghỉ, m — chiếu nghỉ góc (L, ba vế) vuông cạnh bằng bề rộng vế. */
  landing_m: number;
  /** Giếng thang giữa hai vế song song, m (U). */
  gap_m?: number;
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
    /**
     * Gầm thang dùng được (WC gầm thang, T116): phần sàn mà mặt dưới vế cao từ mức này trở lên, m (đã gồm bản thang).
     * Vắng = không cho dùng gầm thang.
     */
    under_use_height_m?: number;
    /** Thông số từng loại thang (T105). Vắng = thang cũ (vế thẳng song song theo `two_flights_min_width_m`). */
    shapes?: Partial<Record<StairShape, StairShapeSpec>>;
    /**
     * Loại thang CỦA LƯỢT NÀY — không đọc từ tệp: gắn khi dựng ngữ cảnh từ đầu bài (`withStairShape`). Vắng = thang
     * cũ; mọi chỗ tính ô thang và bộ vẽ đọc trường này.
     */
    shape?: StairShape | null;
  };
  openings: Record<string, OpeningNorm>;
  openingRules: OpeningRules;
  /** Loại phòng không mở cửa sổ ra ngoài (thang, kho kỹ thuật, để xe…). */
  no_window_types: string[];
  outdoor: { railing_h_m: number; railing_thickness_m: number };
  /** Cốt vỉa hè và tường chắn mái mặc định cho tờ mặt đứng (T59) — vắng thì bước mặt đứng không dựng được khung. */
  facade?: { ground_floor_raise_m: number; parapet_height_m: number };
  /** Hành lang bộ giải ý định tự dựng (T43) — số tham khảo; vắng thì bộ giải dùng cửa đi + lề. */
  circulation?: {
    corridor_clear_m: number;
    /** Lọt lòng tối thiểu của hành lang, m (T104). */
    corridor_min_clear_m?: number;
    /** Lọt lòng tối thiểu của chỗ nối hai ô hành lang (ô thông, không cửa), m — handoff đợt 3 mục 1. */
    corridor_pass_clear_m?: number;
    /** Lọt lòng TỐI ĐA theo loại nhà (`default` cho loại không khai), m — rộng hơn thì thu hẹp (T104). */
    corridor_max_clear_m?: Record<string, number>;
  };
  /** WC khép kín dài quá thì tách phần dư thành tủ đồ (T160, `arrange/ensuite-closet.ts`). Vắng = không tách. */
  ensuite?: { wc_max_length_m: number; closet_min_length_m: number };
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
  /**
   * Số đo cửa / hành lang THEO LOẠI NHÀ (T116, handoff v6 mục 3.3 ⚑) — đè lên `openings`, `openingRules`,
   * `circulation` qua `withHouseProfile`. Vắng = một bộ số cho mọi loại (hành vi trước T116).
   */
  by_house_profile?: Record<string, HouseProfileNorms>;
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
    stairs: parseStairs(raw.stairs!),
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
    ...(raw.ensuite ? { ensuite: raw.ensuite } : {}),
    ...(raw.usable ? { usable: parseUsable(raw.usable) } : {}),
    ...(raw.entry_steps ? { entry_steps: parseEntrySteps(raw.entry_steps) } : {}),
    ...(raw.sketch ? { sketch: parseSketch(raw.sketch) } : {}),
    ...(raw.by_house_profile ? { by_house_profile: parseHouseProfiles(raw.by_house_profile) } : {}),
  };
}

const HOUSE_PROFILE_KEYS: readonly (keyof HouseProfileNorms)[] = [
  'door_width_m',
  'wc_door_width_m',
  'door_margin_m',
  'corridor_clear_m',
  'light_well_advice_depth_m',
];

function parseHouseProfiles(raw: unknown): Record<string, HouseProfileNorms> {
  if (!raw || typeof raw !== 'object') {
    throw new ConstructionNormsError('"by_house_profile" phải là bảng theo loại nhà');
  }
  const out: Record<string, HouseProfileNorms> = {};
  for (const [profile, section] of Object.entries(raw as Record<string, unknown>)) {
    const norms: HouseProfileNorms = {};
    for (const [key, value] of Object.entries((section ?? {}) as Record<string, unknown>)) {
      if (key === 'min_side_m' || key === 'max_aspect') {
        const table: Record<string, number> = {};
        const least = key === 'max_aspect' ? 1 : 0;
        for (const [type, m] of Object.entries((value ?? {}) as Record<string, unknown>)) {
          if (typeof m !== 'number' || !(m > least)) {
            throw new ConstructionNormsError(
              `"by_house_profile.${profile}.${key}.${type}" phải là số lớn hơn ${least}`,
            );
          }
          table[type] = m;
        }
        norms[key] = table;
        continue;
      }
      if (!(HOUSE_PROFILE_KEYS as readonly string[]).includes(key)) {
        throw new ConstructionNormsError(`"by_house_profile.${profile}" có khoá lạ "${key}"`);
      }
      if (typeof value !== 'number' || !(value >= 0)) {
        throw new ConstructionNormsError(
          `"by_house_profile.${profile}.${key}" phải là số không âm`,
        );
      }
      (norms as Record<string, unknown>)[key] = value;
    }
    out[profile] = norms;
  }
  return out;
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
  const absorbRaw = (raw as Record<string, unknown>).absorb_stranded as
    Record<string, unknown> | undefined;
  let absorb: SketchNorms['absorb_stranded'];
  if (absorbRaw !== undefined) {
    const types = absorbRaw?.types;
    const max = absorbRaw?.max_area_m2;
    if (!Array.isArray(types) || types.some((t) => typeof t !== 'string')) {
      throw new ConstructionNormsError(
        '"sketch.absorb_stranded.types" phải là danh sách mã loại phòng',
      );
    }
    if (typeof max !== 'number' || !(max > 0)) {
      throw new ConstructionNormsError('"sketch.absorb_stranded.max_area_m2" phải là số dương');
    }
    absorb = { types: types.slice() as string[], max_area_m2: max };
  }
  const shiftRaw = (raw as Record<string, unknown>).ground_core_shift as
    Record<string, unknown> | undefined;
  let shift: SketchNorms['ground_core_shift'];
  if (shiftRaw !== undefined) {
    const steps = shiftRaw?.max_steps;
    if (typeof steps !== 'number' || !Number.isInteger(steps) || steps < 0) {
      throw new ConstructionNormsError(
        '"sketch.ground_core_shift.max_steps" phải là số nguyên không âm',
      );
    }
    shift = { max_steps: steps };
  }
  const repairRaw = (raw as Record<string, unknown>).repair_walls as
    Record<string, unknown> | undefined;
  let repair: SketchNorms['repair_walls'];
  if (repairRaw !== undefined) {
    const moves = repairRaw?.max_moves;
    if (typeof moves !== 'number' || !Number.isInteger(moves) || moves < 0) {
      throw new ConstructionNormsError(
        '"sketch.repair_walls.max_moves" phải là số nguyên không âm',
      );
    }
    const pieces = repairRaw?.max_new_corridors ?? 0;
    if (typeof pieces !== 'number' || !Number.isInteger(pieces) || pieces < 0) {
      throw new ConstructionNormsError(
        '"sketch.repair_walls.max_new_corridors" phải là số nguyên không âm',
      );
    }
    const beam = repairRaw?.beam ?? 1;
    const patience = repairRaw?.patience ?? 1;
    for (const [name, value] of [
      ['beam', beam],
      ['patience', patience],
    ] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new ConstructionNormsError(`"sketch.repair_walls.${name}" phải là số nguyên dương`);
      }
    }
    repair = {
      max_moves: moves,
      max_new_corridors: pieces,
      beam: beam as number,
      patience: patience as number,
    };
  }
  const fitRaw = (raw as Record<string, unknown>).stair_fit as Record<string, unknown> | undefined;
  let fit: SketchNorms['stair_fit'];
  if (fitRaw !== undefined) {
    const block = fitRaw?.block;
    if (typeof block !== 'boolean') {
      throw new ConstructionNormsError('"sketch.stair_fit.block" phải là true hoặc false');
    }
    const warn = fitRaw?.warn_share ?? null;
    if (warn !== null && (typeof warn !== 'number' || !(warn > 0))) {
      throw new ConstructionNormsError(
        '"sketch.stair_fit.warn_share" phải là số dương hoặc bỏ trống',
      );
    }
    fit = { block, warn_share: warn as number | null };
  }
  const rowsRaw = (raw as Record<string, unknown>).skeleton_rows as
    Record<string, unknown> | undefined;
  let rows: SketchNorms['skeleton_rows'];
  if (rowsRaw !== undefined) {
    const read = (name: string, positive: boolean): number => {
      const value = rowsRaw?.[name];
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        (positive && value === 0)
      ) {
        throw new ConstructionNormsError(
          `"sketch.skeleton_rows.${name}" phải là số nguyên ${positive ? 'dương' : 'không âm'}`,
        );
      }
      return value;
    };
    const preferRaw = rowsRaw?.prefer as Record<string, unknown> | undefined;
    let prefer: NonNullable<SketchNorms['skeleton_rows']>['prefer'];
    if (preferRaw !== undefined) {
      const moves = preferRaw?.max_moves;
      if (typeof moves !== 'number' || !Number.isInteger(moves) || moves < 0) {
        throw new ConstructionNormsError(
          '"sketch.skeleton_rows.prefer.max_moves" phải là số nguyên không âm',
        );
      }
      const weight = (name: string): number => {
        const value = preferRaw?.[name];
        if (typeof value !== 'number' || !(value >= 0)) {
          throw new ConstructionNormsError(
            `"sketch.skeleton_rows.prefer.${name}" phải là số không âm`,
          );
        }
        return value;
      };
      prefer = {
        max_moves: moves,
        wet_over_dry: weight('wet_over_dry'),
        dark_room: weight('dark_room'),
        dark_bedroom: weight('dark_bedroom'),
        wet_distance_per_m: weight('wet_distance_per_m'),
        floor_margin_ratio: weight('floor_margin_ratio'),
        tight_floor: weight('tight_floor'),
      };
    }
    rows = {
      max_candidates: read('max_candidates', false),
      max_moves: read('max_moves', false),
      depth_step_cm: read('depth_step_cm', true),
      ...(prefer ? { prefer } : {}),
    };
  }
  return {
    area_slack_ratio: ratio,
    grow_tries: tries,
    floor_tolerance_ratio: tolerance,
    ...(absorb ? { absorb_stranded: absorb } : {}),
    ...(shift ? { ground_core_shift: shift } : {}),
    ...(repair ? { repair_walls: repair } : {}),
    ...(fit ? { stair_fit: fit } : {}),
    ...(rows ? { skeleton_rows: rows } : {}),
  };
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

function parseStairs(raw: ConstructionNorms['stairs']): ConstructionNorms['stairs'] {
  if (
    raw.under_use_height_m !== undefined &&
    !(typeof raw.under_use_height_m === 'number' && raw.under_use_height_m > 1.8)
  ) {
    throw new ConstructionNormsError('"stairs.under_use_height_m" phải là số lớn hơn 1,8');
  }
  const shapes = raw.shapes;
  if (shapes === undefined) return raw;
  for (const [key, spec] of Object.entries(shapes)) {
    if (!(STAIR_SHAPES as readonly string[]).includes(key)) {
      throw new ConstructionNormsError(`"stairs.shapes" có loại thang lạ "${key}"`);
    }
    const ok = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && v >= min && v <= max;
    if (
      !spec ||
      typeof spec.vi !== 'string' ||
      !ok(spec.flight_width_m, 0.6, 2) ||
      !ok(spec.landing_m, 0.6, 3) ||
      (spec.gap_m !== undefined && !ok(spec.gap_m, 0, 2))
    ) {
      throw new ConstructionNormsError(`"stairs.shapes.${key}" thiếu hoặc sai thông số`);
    }
  }
  const { shape: _ignored, ...rest } = raw;
  return rest;
}
