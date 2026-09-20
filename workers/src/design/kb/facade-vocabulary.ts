/**
 * Danh mục mặt đứng — mái, vật liệu, màu, lan can (T59). Nguồn: `kb/facade_vocabulary.yaml`.
 *
 * Mỗi mã mang hai nhãn: `label_vi` cho giao diện, `prompt_en` cho lời dẫn ảnh. Mô hình văn bản
 * chỉ được chọn mã có trong danh mục; `ai/facade/check.ts` bắt mã lạ.
 *
 * Tách khỏi phần nạp (`facade-vocabulary-data.ts`) vì Vitest không nạp được `.yaml` qua `import`.
 */

import { load as parseYaml } from 'js-yaml';

export interface VocabEntry {
  label_vi: string;
  prompt_en: string;
}

export interface ColourEntry extends VocabEntry {
  hex: string;
}

/** Khoảng [thấp, cao] cm. */
export type Range = readonly [number, number];

export interface DoorTypeEntry extends VocabEntry {
  /** Bộ vẽ chia mấy cánh: số cánh, hoặc `folding` (xếp) / `sliding` (lùa). */
  leaves: number | 'folding' | 'sliding';
}

export interface FacadeVocabulary {
  version: string;
  doorMaterials: Record<string, VocabEntry>;
  doorTypes: Record<string, DoorTypeEntry>;
  glassTypes: Record<string, VocabEntry>;
  garageDoorTypes: Record<string, VocabEntry>;
  fenceTypes: Record<string, VocabEntry>;
  roofMaterials: Record<string, VocabEntry>;
  materials: Record<string, VocabEntry>;
  colours: Record<string, ColourEntry>;
  railings: Record<string, VocabEntry>;
  /** Nhãn tiếng Việt cho mã hợp đồng đã khai sẵn (kiểu mái, kiểu cổng, vùng, mảng trang trí). */
  roofTypes: Record<string, string>;
  gateTypes: Record<string, string>;
  zones: Record<string, string>;
  elements: Record<string, string>;
  limits: {
    gate_h_cm: Range;
    fence_h_cm: Range;
    parapet_cm: Range;
    roof_rise_max_cm: number;
    roof_overhang_max_cm: number;
  };
  /** Đường mái tự dựng khi mô hình không khai (`ai/facade/merge.ts`). */
  roofDefaults: {
    overhang_cm: number;
    pitch_deg: number;
    hip_ridge_share: number;
    /** Mái Nhật: dốc thấp, đua rộng. */
    japanese: { pitch_deg: number; overhang_cm: number };
  };
}

export class FacadeVocabularyError extends Error {
  constructor(message: string) {
    super(`Không đọc được danh mục mặt đứng: ${message}`);
    this.name = 'FacadeVocabularyError';
  }
}

const CODE = /^[a-z0-9_]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

function entries<T extends VocabEntry>(
  raw: unknown,
  section: string,
  extra?: (code: string, value: Record<string, unknown>) => void,
): Record<string, T> {
  if (!raw || typeof raw !== 'object') throw new FacadeVocabularyError(`thiếu mục "${section}"`);
  const out: Record<string, T> = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!CODE.test(code)) throw new FacadeVocabularyError(`mã "${section}.${code}" sai dạng`);
    const v = value as Record<string, unknown>;
    if (typeof v?.label_vi !== 'string' || typeof v.prompt_en !== 'string') {
      throw new FacadeVocabularyError(`"${section}.${code}" thiếu label_vi hoặc prompt_en`);
    }
    extra?.(code, v);
    out[code] = v as unknown as T;
  }
  if (Object.keys(out).length === 0) throw new FacadeVocabularyError(`mục "${section}" rỗng`);
  return out;
}

function labels(raw: unknown, section: string): Record<string, string> {
  if (!raw || typeof raw !== 'object') throw new FacadeVocabularyError(`thiếu mục "${section}"`);
  for (const [code, label] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof label !== 'string') {
      throw new FacadeVocabularyError(`nhãn "${section}.${code}" phải là chữ`);
    }
  }
  return raw as Record<string, string>;
}

function range(raw: unknown, key: string): Range {
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    typeof raw[0] !== 'number' ||
    typeof raw[1] !== 'number' ||
    raw[0] > raw[1]
  ) {
    throw new FacadeVocabularyError(`"limits.${key}" phải là [thấp, cao]`);
  }
  return [raw[0], raw[1]];
}

export function parseFacadeVocabulary(yamlText: string): FacadeVocabulary {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new FacadeVocabularyError('tệp rỗng');
  const limits = raw.limits as Record<string, unknown> | undefined;
  if (!limits) throw new FacadeVocabularyError('thiếu mục "limits"');
  for (const key of ['roof_rise_max_cm', 'roof_overhang_max_cm']) {
    if (typeof limits[key] !== 'number' || !((limits[key] as number) >= 0)) {
      throw new FacadeVocabularyError(`"limits.${key}" phải là số không âm`);
    }
  }

  const roof = raw.roof_defaults as Record<string, unknown> | undefined;
  if (!roof) throw new FacadeVocabularyError('thiếu mục "roof_defaults"');
  for (const key of ['overhang_cm', 'pitch_deg', 'hip_ridge_share']) {
    if (typeof roof[key] !== 'number' || !((roof[key] as number) >= 0)) {
      throw new FacadeVocabularyError(`"roof_defaults.${key}" phải là số không âm`);
    }
  }
  if ((roof.hip_ridge_share as number) >= 1) {
    throw new FacadeVocabularyError('"roof_defaults.hip_ridge_share" phải nhỏ hơn 1');
  }
  const japanese = roof.japanese as Record<string, unknown> | undefined;
  if (
    !japanese ||
    typeof japanese.pitch_deg !== 'number' ||
    typeof japanese.overhang_cm !== 'number'
  ) {
    throw new FacadeVocabularyError('"roof_defaults.japanese" cần "pitch_deg" và "overhang_cm"');
  }

  return {
    version: String(raw.version ?? '0.0.0'),
    roofDefaults: {
      overhang_cm: roof.overhang_cm as number,
      pitch_deg: roof.pitch_deg as number,
      hip_ridge_share: roof.hip_ridge_share as number,
      japanese: { pitch_deg: japanese.pitch_deg, overhang_cm: japanese.overhang_cm },
    },
    doorMaterials: entries(raw.door_materials, 'door_materials'),
    doorTypes: entries<DoorTypeEntry>(raw.door_types, 'door_types', (code, v) => {
      const leaves = v.leaves;
      if (
        !(typeof leaves === 'number' && leaves >= 1) &&
        leaves !== 'folding' &&
        leaves !== 'sliding'
      ) {
        throw new FacadeVocabularyError(
          `kiểu cửa "${code}" cần "leaves" là số cánh, "folding" hoặc "sliding"`,
        );
      }
    }),
    glassTypes: entries(raw.glass_types, 'glass_types'),
    garageDoorTypes: entries(raw.garage_door_types, 'garage_door_types'),
    fenceTypes: entries(raw.fence_types, 'fence_types'),
    roofMaterials: entries(raw.roof_materials, 'roof_materials'),
    materials: entries(raw.materials, 'materials'),
    colours: entries<ColourEntry>(raw.colours, 'colours', (code, v) => {
      if (typeof v.hex !== 'string' || !HEX.test(v.hex)) {
        throw new FacadeVocabularyError(`màu "${code}" thiếu mã hex dạng #RRGGBB`);
      }
    }),
    railings: entries(raw.railings, 'railings'),
    roofTypes: labels(raw.roof_types, 'roof_types'),
    gateTypes: labels(raw.gate_types, 'gate_types'),
    zones: labels(raw.zones, 'zones'),
    elements: labels(raw.elements, 'elements'),
    limits: {
      gate_h_cm: range(limits.gate_h_cm, 'gate_h_cm'),
      fence_h_cm: range(limits.fence_h_cm, 'fence_h_cm'),
      parapet_cm: range(limits.parapet_cm, 'parapet_cm'),
      roof_rise_max_cm: limits.roof_rise_max_cm as number,
      roof_overhang_max_cm: limits.roof_overhang_max_cm as number,
    },
  };
}
