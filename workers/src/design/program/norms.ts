/**
 * Chuẩn lập chương trình không gian — nạp từ `kb/space_norms.yaml`.
 *
 * Nguồn: doc/design/03-data-contracts.md mục 3.2, 06-knowledge-base.md mục 6.0 và 6.4.
 *
 * Kiểm ở đây khắt khe hơn mức "đọc được": một tệp chuẩn thiếu vài trường vẫn phân tích được
 * và vẫn cho ra chương trình không gian — chỉ là những con số bịa. Sai kiểu đó không nổ ra
 * thành lỗi, nó đi thẳng vào bản vẽ. Nên thiếu là dừng ngay tại đây, kèm tên trường thiếu.
 */

import { load as parseYaml } from 'js-yaml';

export type FloorPreference = 'ground' | 'low' | 'mid' | 'top' | 'any';

const FLOOR_PREFERENCES = new Set<string>(['ground', 'low', 'mid', 'top', 'any']);

export interface SpaceNorm {
  min_m2: number;
  target_m2: number;
  max_m2: number;
  priority: number;
  floor: FloorPreference;
  daylight: boolean;
  facade: boolean;
  ventilation: boolean;
  /** `false` = không bao giờ tự sinh; chỉ có mặt khi đầu bài khai đích danh. */
  auto: boolean;
}

export interface WidthBand {
  id: string;
  /** Rỗng = dải trên cùng, không có cận trên. */
  max_width_m: number | null;
  /** Hệ số nhân vào diện tích mong muốn và tối đa. */
  scale: number;
}

export interface OccupancyNorm {
  per_room: number;
  room_type: string;
  floor: FloorPreference;
}

export interface SpaceNorms {
  version: string;
  priors: { min_samples: number; width_bands: WidthBand[] };
  occupancy: Record<string, OccupancyNorm>;
  mandatory: Record<string, string[]>;
  derived: {
    wc: { per_bedrooms: number; min_per_floor: number };
    circulation: { ratio_of_floor: number };
    stair: { per_core: number };
  };
  adjacency_weight: Record<'error' | 'warning', number>;
  spaces: Record<string, SpaceNorm>;
}

export class SpaceNormsError extends Error {
  readonly retryable = false;
}

function num(value: unknown, path: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new SpaceNormsError(`kb/space_norms.yaml: "${path}" phải là số.`);
  return n;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SpaceNormsError(`kb/space_norms.yaml: "${path}" phải là true hoặc false.`);
  }
  return value;
}

export function parseSpaceNorms(yamlText: string): SpaceNorms {
  const raw = parseYaml(yamlText) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') {
    throw new SpaceNormsError('kb/space_norms.yaml không đọc được.');
  }

  const spacesRaw = raw.spaces as Record<string, Record<string, unknown>> | undefined;
  if (!spacesRaw || !Object.keys(spacesRaw).length) {
    throw new SpaceNormsError('kb/space_norms.yaml: thiếu mục `spaces`.');
  }

  const spaces: Record<string, SpaceNorm> = {};
  for (const [code, entry] of Object.entries(spacesRaw)) {
    const at = `spaces.${code}`;
    const floor = String(entry.floor);
    if (!FLOOR_PREFERENCES.has(floor)) {
      throw new SpaceNormsError(
        `${at}.floor = "${floor}" không hợp lệ — nhận ground | low | mid | top | any.`,
      );
    }
    const norm: SpaceNorm = {
      min_m2: num(entry.min_m2, `${at}.min_m2`),
      target_m2: num(entry.target_m2, `${at}.target_m2`),
      max_m2: num(entry.max_m2, `${at}.max_m2`),
      priority: num(entry.priority, `${at}.priority`),
      floor: floor as FloorPreference,
      daylight: bool(entry.daylight, `${at}.daylight`),
      facade: bool(entry.facade, `${at}.facade`),
      ventilation: bool(entry.ventilation, `${at}.ventilation`),
      auto: entry.auto === undefined ? true : bool(entry.auto, `${at}.auto`),
    };
    // Thứ tự min ≤ target ≤ max không phải chuyện thẩm mỹ: bộ giải nhận cả ba làm cận, và
    // một bộ ba nghịch đảo cho ra miền rỗng — vô nghiệm mà không ai hiểu vì sao.
    if (!(norm.min_m2 <= norm.target_m2 && norm.target_m2 <= norm.max_m2)) {
      throw new SpaceNormsError(
        `${at}: phải thoả min_m2 ≤ target_m2 ≤ max_m2 (đang là ${norm.min_m2} · ${norm.target_m2} · ${norm.max_m2}).`,
      );
    }
    spaces[code] = norm;
  }

  const priorsRaw = raw.priors as Record<string, unknown> | undefined;
  const bandsRaw = priorsRaw?.width_bands as Array<Record<string, unknown>> | undefined;
  if (!bandsRaw?.length)
    throw new SpaceNormsError('kb/space_norms.yaml: thiếu `priors.width_bands`.');
  const width_bands: WidthBand[] = bandsRaw.map((band, i) => ({
    id: String(band.id),
    max_width_m:
      band.max_width_m === null || band.max_width_m === undefined
        ? null
        : num(band.max_width_m, `priors.width_bands[${i}].max_width_m`),
    scale: num(band.scale, `priors.width_bands[${i}].scale`),
  }));
  // Dải phải tăng dần và dải cuối phải mở: một lô 20 m mà không rơi vào dải nào thì hàm tra
  // trả về undefined, và diện tích mong muốn thành NaN — lỗi chỉ lộ ra ở tận bản vẽ.
  for (let i = 1; i < width_bands.length; i += 1) {
    const prev = width_bands[i - 1]!.max_width_m;
    const cur = width_bands[i]!.max_width_m;
    if (prev === null || (cur !== null && cur <= prev)) {
      throw new SpaceNormsError(
        'kb/space_norms.yaml: `priors.width_bands` phải tăng dần theo max_width_m.',
      );
    }
  }
  if (width_bands[width_bands.length - 1]!.max_width_m !== null) {
    throw new SpaceNormsError(
      'kb/space_norms.yaml: dải bề rộng cuối phải để `max_width_m: null` (không cận trên).',
    );
  }

  const occupancyRaw = (raw.occupancy ?? {}) as Record<string, Record<string, unknown>>;
  const occupancy: Record<string, OccupancyNorm> = {};
  for (const [role, entry] of Object.entries(occupancyRaw)) {
    const floor = String(entry.floor);
    if (!FLOOR_PREFERENCES.has(floor)) {
      throw new SpaceNormsError(`occupancy.${role}.floor = "${floor}" không hợp lệ.`);
    }
    const roomType = String(entry.room_type);
    if (!spaces[roomType]) {
      throw new SpaceNormsError(
        `occupancy.${role}.room_type = "${roomType}" không có trong mục spaces.`,
      );
    }
    occupancy[role] = {
      per_room: num(entry.per_room, `occupancy.${role}.per_room`),
      room_type: roomType,
      floor: floor as FloorPreference,
    };
  }

  const mandatory = (raw.mandatory ?? {}) as Record<string, string[]>;
  for (const [buildingType, list] of Object.entries(mandatory)) {
    for (const code of list) {
      if (!spaces[code]) {
        throw new SpaceNormsError(
          `mandatory.${buildingType} nhắc tới "${code}" không có trong mục spaces.`,
        );
      }
    }
  }

  const derivedRaw = (raw.derived ?? {}) as Record<string, Record<string, unknown>>;
  const weightRaw = (raw.adjacency_weight ?? {}) as Record<string, unknown>;

  return {
    version: String(raw.version ?? '0.0.0'),
    priors: { min_samples: num(priorsRaw?.min_samples, 'priors.min_samples'), width_bands },
    occupancy,
    mandatory,
    derived: {
      wc: {
        per_bedrooms: num(derivedRaw.wc?.per_bedrooms, 'derived.wc.per_bedrooms'),
        min_per_floor: num(derivedRaw.wc?.min_per_floor, 'derived.wc.min_per_floor'),
      },
      circulation: {
        ratio_of_floor: num(
          derivedRaw.circulation?.ratio_of_floor,
          'derived.circulation.ratio_of_floor',
        ),
      },
      stair: { per_core: num(derivedRaw.stair?.per_core, 'derived.stair.per_core') },
    },
    adjacency_weight: {
      error: num(weightRaw.error, 'adjacency_weight.error'),
      warning: num(weightRaw.warning, 'adjacency_weight.warning'),
    },
    spaces,
  };
}

/** Dải bề rộng lô chứa `width_m`. Luôn trả về một dải vì dải cuối không có cận trên. */
export function bandFor(norms: SpaceNorms, width_m: number): WidthBand {
  for (const band of norms.priors.width_bands) {
    if (band.max_width_m === null || width_m <= band.max_width_m) return band;
  }
  /* c8 ignore next -- `parseSpaceNorms` đã cưỡng chế dải cuối mở, nhánh này không tới được */
  return norms.priors.width_bands[norms.priors.width_bands.length - 1]!;
}
