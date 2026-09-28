/**
 * Mức bám đầu bài của nhánh AI — đọc từ `kb/brief_fidelity.yaml` (13/09/2026).
 *
 * Tách phần phân tích (thuần, kiểm thử được) khỏi phần nạp tệp (`brief-fidelity-data.ts`), cùng
 * khuôn với `construction.ts`.
 */

import { load as parseYaml } from 'js-yaml';

export interface BriefFidelity {
  version: string;
  /** Diện tích phòng đầu bài đã khai được lệch trong ± tỉ lệ này. */
  areaToleranceRatio: number;
  parking: { carM2: number; motorbikeM2: number };
  ensuiteChildTypes: string[];
  ensuiteParentTypes: string[];
  stairTypes: string[];
  /** Nhu cầu riêng → các loại không gian đáp ứng được nó. */
  needEquivalents: Record<string, string[]>;
  /** Tiện ích nằm TRONG phòng ngủ — gộp vào phòng, không thành không gian riêng. */
  inBedroomTypes: string[];
  /**
   * Loại không gian mô hình CHỈ được đề xuất khi đầu bài có hỏi tới (T96). Vắng = không giới hạn —
   * một bản `kb/` cũ hơn mã nguồn vẫn chạy như trước.
   */
  onlyWhenAsked: string[];
  /** Đòi hỏi suy từ những câu đầu bài ĐÃ trả lời (T65) — xem `demands:` của tệp YAML. */
  demands: BriefDemandSpec;
}

/**
 * Phần `demands:` của `kb/brief_fidelity.yaml` — SỐ và CỜ, không có logic.
 *
 * Logic «câu trả lời nào sinh đòi hỏi nào» nằm ở `ai/brief-demands.ts`; ở đây chỉ là những con
 * số mà logic ấy đọc. Tách như vậy vì con số đổi theo hồ sơ và theo gia chủ, còn logic thì không.
 */
export interface BriefDemandSpec {
  elevator: {
    spaceType: string;
    /** Nhãn của ô khi gia chủ mới chỉ CHỪA CHỖ, chưa lắp. */
    reservedLabel: string;
    /** Loại phòng tính là hành lang / sảnh chung khi kiểm kiểu bố trí thang máy. */
    hallTypes: string[];
    /** Đoạn vách chung tối thiểu để coi hai ô là «chung vách» / «cùng giáp», m. */
    layoutMinSharedM: number;
    /** Cạnh dài giếng tối đa bằng bấy nhiêu lần cạnh ngắn — `0` là không kiểm. */
    shaftMaxAspect: number;
    /** Diện tích giếng dựng tối đa bằng bấy nhiêu lần diện tích gia chủ khai — `0` là không kiểm. */
    shaftMaxAreaRatio: number;
  };
  balcony: {
    spaceType: string;
    /** Ban công chỉ tính từ tầng này trở lên — tầng 1 là sân hay hiên. */
    fromLevel: number;
    /** Loại không gian tính là chỗ phơi nắng được. */
    dryingTypes: string[];
  };
  /** Diện tích một chỗ đỗ ô tô theo CỠ xe đầu bài khai; vắng cỡ thì dùng `parking.carM2`. */
  carM2BySize: Record<string, number>;
  /** Câu trả lời nào đòi không gian nào. `code` là thứ mã nguồn tra, `answer`/`say` là để người đọc. */
  spaces: BriefDemandSpace[];
  /** Cảnh báo nào được bật. Vắng khoá = tắt; không có mục nào là mặc định hợp lệ. */
  warnings: Record<string, boolean>;
}

export interface BriefDemandSpace {
  code: string;
  /** Điều kiện, viết cho NGƯỜI đọc — mã nguồn tra theo `code`, không phân tích chuỗi này. */
  answer: string;
  /** Một trong các loại này là đủ. */
  anyOf: string[];
  /** Số không gian tối thiểu; vắng = 1. */
  count: number;
  /** `true` = bác phương án; `false` = chỉ cảnh báo (T52). */
  blocking: boolean;
  /** Câu nói ra khi thiếu — mở đầu của thông điệp lỗi. */
  say: string;
}

export class BriefFidelityError extends Error {
  constructor(message: string) {
    super(`Không đọc được kb/brief_fidelity.yaml: ${message}`);
    this.name = 'BriefFidelityError';
  }
}

export function parseBriefFidelity(yamlText: string): BriefFidelity {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new BriefFidelityError('tệp rỗng');
  const ratio = raw.area_tolerance_ratio;
  if (typeof ratio !== 'number' || ratio <= 0 || ratio >= 1) {
    throw new BriefFidelityError('`area_tolerance_ratio` phải là số trong khoảng (0, 1)');
  }
  const parking = raw.parking as { car_m2?: unknown; motorbike_m2?: unknown } | undefined;
  if (typeof parking?.car_m2 !== 'number' || typeof parking?.motorbike_m2 !== 'number') {
    throw new BriefFidelityError('thiếu `parking.car_m2` hoặc `parking.motorbike_m2`');
  }
  const list = (key: string): string[] => {
    const value = raw[key];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new BriefFidelityError(`\`${key}\` phải là danh sách mã phòng`);
    }
    return value as string[];
  };
  return {
    version: String(raw.version ?? '0.0.0'),
    areaToleranceRatio: ratio,
    parking: { carM2: parking.car_m2, motorbikeM2: parking.motorbike_m2 },
    ensuiteChildTypes: list('ensuite_child_types'),
    ensuiteParentTypes: list('ensuite_parent_types'),
    stairTypes: list('stair_types'),
    inBedroomTypes: raw.in_bedroom_types === undefined ? [] : list('in_bedroom_types'),
    onlyWhenAsked: raw.only_when_asked === undefined ? [] : list('only_when_asked'),
    demands: parseDemands(raw.demands),
    needEquivalents: Object.fromEntries(
      Object.entries((raw.need_equivalents ?? {}) as Record<string, unknown>).map(
        ([need, types]) => {
          if (!Array.isArray(types) || types.some((t) => typeof t !== 'string')) {
            throw new BriefFidelityError(`\`need_equivalents.${need}\` phải là danh sách mã phòng`);
          }
          return [need, types as string[]];
        },
      ),
    ),
  };
}

/**
 * Phần `demands:` — vắng hẳn là hợp lệ và có nghĩa «không đòi gì thêm».
 *
 * Vì sao chịu được khi vắng: một bản `kb/` cũ hơn mã nguồn vẫn phải chạy được. Vắng thì nhánh AI
 * quay về đúng hành vi trước T65 — bám đầu bài ở ba nhóm cũ — thay vì ném lỗi và chặn cả lượt
 * chạy. Khai SAI thì vẫn ném: khai sai là lỗi người sửa tệp, khác hẳn với chưa khai.
 */
function parseDemands(raw: unknown): BriefDemandSpec {
  const empty: BriefDemandSpec = {
    elevator: {
      spaceType: 'core',
      reservedLabel: '',
      hallTypes: [],
      layoutMinSharedM: 0,
      shaftMaxAspect: 0,
      shaftMaxAreaRatio: 0,
    },
    balcony: { spaceType: 'balcony', fromLevel: 2, dryingTypes: [] },
    carM2BySize: {},
    spaces: [],
    warnings: {},
  };
  if (raw === undefined || raw === null) return empty;
  if (typeof raw !== 'object') throw new BriefFidelityError('`demands` phải là một mục');
  const d = raw as Record<string, unknown>;

  const numberMap = (value: unknown, where: string): Record<string, number> => {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object') throw new BriefFidelityError(`\`${where}\` phải là một mục`);
    const out: Record<string, number> = {};
    for (const [key, raw2] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw2 !== 'number' || raw2 <= 0) {
        throw new BriefFidelityError(`\`${where}.${key}\` phải là số dương`);
      }
      out[key] = raw2;
    }
    return out;
  };
  const codes = (value: unknown, where: string): string[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
      throw new BriefFidelityError(`\`${where}\` phải là danh sách mã phòng`);
    }
    return value as string[];
  };

  const lift = (d.elevator ?? {}) as Record<string, unknown>;
  const balcony = (d.balcony ?? {}) as Record<string, unknown>;
  const spacesRaw = d.spaces === undefined || d.spaces === null ? [] : d.spaces;
  if (!Array.isArray(spacesRaw)) throw new BriefFidelityError('`demands.spaces` phải là danh sách');

  const spaces: BriefDemandSpace[] = spacesRaw.map((row, index) => {
    const r = row as Record<string, unknown>;
    const at = `demands.spaces[${index}]`;
    if (typeof r.code !== 'string' || !r.code) {
      throw new BriefFidelityError(`\`${at}.code\` phải là chuỗi không rỗng`);
    }
    const anyOf = codes(r.any_of, `${at}.any_of`);
    if (!anyOf.length) throw new BriefFidelityError(`\`${at}.any_of\` không được rỗng`);
    if (typeof r.blocking !== 'boolean') {
      // Cố ý KHÔNG có mặc định: quên khai cờ này là quên trả lời câu «thiếu thì bác hay chỉ
      // nhắc», và đoán hộ thì hoặc là bác oan, hoặc là im lặng bỏ qua yêu cầu của gia chủ.
      throw new BriefFidelityError(`\`${at}.blocking\` phải khai rõ true hay false`);
    }
    if (r.count !== undefined && (typeof r.count !== 'number' || r.count < 1)) {
      throw new BriefFidelityError(`\`${at}.count\` phải là số nguyên từ 1`);
    }
    return {
      code: r.code,
      answer: typeof r.answer === 'string' ? r.answer : '',
      anyOf,
      count: typeof r.count === 'number' ? r.count : 1,
      blocking: r.blocking,
      say: typeof r.say === 'string' ? r.say : '',
    };
  });

  const warnings: Record<string, boolean> = {};
  for (const [key, value] of Object.entries((d.warnings ?? {}) as Record<string, unknown>)) {
    if (typeof value !== 'boolean') {
      throw new BriefFidelityError(`\`demands.warnings.${key}\` phải là true hay false`);
    }
    warnings[key] = value;
  }

  return {
    elevator: {
      spaceType: typeof lift.space_type === 'string' ? lift.space_type : 'core',
      reservedLabel: typeof lift.reserved_label === 'string' ? lift.reserved_label : '',
      hallTypes: codes(lift.hall_types, 'demands.elevator.hall_types'),
      layoutMinSharedM: typeof lift.layout_min_shared_m === 'number' ? lift.layout_min_shared_m : 0,
      shaftMaxAspect: typeof lift.shaft_max_aspect === 'number' ? lift.shaft_max_aspect : 0,
      shaftMaxAreaRatio:
        typeof lift.shaft_max_area_ratio === 'number' ? lift.shaft_max_area_ratio : 0,
    },
    balcony: {
      spaceType: typeof balcony.space_type === 'string' ? balcony.space_type : 'balcony',
      fromLevel: typeof balcony.from_level === 'number' ? balcony.from_level : 2,
      dryingTypes: codes(balcony.drying_types, 'demands.balcony.drying_types'),
    },
    carM2BySize: numberMap(d.car_m2_by_size, 'demands.car_m2_by_size'),
    spaces,
    warnings,
  };
}
