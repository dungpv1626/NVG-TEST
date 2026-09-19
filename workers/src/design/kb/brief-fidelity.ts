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
