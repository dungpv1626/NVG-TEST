/**
 * Đọc `kb/plan_quality.yaml` — trọng số, công thức và ngưỡng của thước chấm mặt bằng.
 *
 * Cùng khuôn với `kb/vocabulary.ts` và `rules/rule-pack.ts`: tệp YAML là nguồn, mô-đun này chỉ
 * phân tích và kiểm hình dạng. KHÔNG có một con số nào của thước chấm trong mã nguồn — đó là quy
 * tắc của CLAUDE.md 8.2 điểm 4, và ở đây nó có một lý do cụ thể: bộ đo mới có n ≤ 6, nên mọi
 * ngưỡng còn phải chỉnh nhiều lần khi có thêm hồ sơ. Mỗi lần chỉnh phải là một lần sửa DỮ LIỆU.
 *
 * ⚠️ Ngưỡng theo MÃ PHÒNG không nằm ở tệp này mà ở `rules/` — bộ chấm tra qua
 * `RulePack.minDimension` / `.aspectRatioMax`. Xem phần đầu `kb/plan_quality.yaml`.
 */

import { load as parseYaml } from 'js-yaml';

export class PlanQualityError extends Error {
  readonly retryable = false;
}

/** Năm kiểu thang điểm — xem phần «Năm kiểu thang điểm» của tệp YAML. */
export type ScoreKind = 'lower_better' | 'higher_better' | 'count' | 'boolean' | 'band';

/**
 * Phần của một tiêu chí mà công thức cho điểm CẦN — và chỉ phần ấy.
 *
 * Tách ra để thước chấm MẶT ĐỨNG (`ai/facade/quality.ts`) dùng lại đúng một bộ công thức
 * (`scoreOf`) mà không phải mang theo những trường chỉ mặt bằng mới có (`byBuildingType`,
 * `rooms`). Viết lại công thức cho thước thứ hai là tạo bản thứ hai sẽ lệch.
 */
export interface ScoreScale {
  kind: ScoreKind;
  pass?: number;
  zero?: number;
  low?: number;
  high?: number;
  hardLow?: number;
  hardHigh?: number;
}

export interface CriterionSpec extends ScoreScale {
  code: string;
  group: string;
  vi: string;
  giaiThich?: string;
  /** Tập phòng mà tiêu chí đo trên — hiện chỉ D1 dùng. */
  rooms?: string;
  /** Tham số riêng của tiêu chí, vẫn là dữ liệu: `khoang_cach_m`, `lech_m`. */
  params: Record<string, number>;
  /** Số mẫu đã đo. `0` nghĩa là ngưỡng hoàn toàn là suy luận (T31). */
  n: number;
  /**
   * Trọng số TƯƠNG ĐỐI trong nhóm (T96): tiêu chí `weight: 2` nặng gấp đôi tiêu chí `weight: 1` cùng
   * nhóm. Vắng = 1, tức chia đều như trước. Trọng số nhóm vẫn là con số của bộ đo — đây chỉ chia phần
   * trong nhóm theo tư duy nghề (phòng ngủ phải đi xuyên phòng ngủ khác nặng hơn một hành lang hơi dài).
   */
  weight: number;
  /** Nguyên văn nhãn `[ĐO]` / `[CHUNG]` của bộ đo — hiện lên màn hình, không rút gọn. */
  label: string;
  /**
   * Mã lỗi CHẶN đã bảo đảm tiêu chí này, nếu có.
   *
   * Có giá trị thì tiêu chí KHÔNG tính vào điểm: cổng dữ liệu đã chặn, nên mọi bản tới được bước
   * chấm đều đạt, và cho nó điểm là tặng không. Xem A2 trong tệp YAML.
   */
  enforcedByGate?: string;
  /** Ghi đè theo loại hình công trình — chỉ những khoá được khai mới thay. */
  byBuildingType: Record<string, Partial<CriterionSpec>>;
}

export interface PlanQuality {
  version: string;
  /** Đổi công thức hay ngưỡng là tăng số này (T27). */
  scoreVersion: number;
  coSoDuLieu: string;
  groups: Record<string, { vi: string; weight: number }>;
  /** `equal` = các tiêu chí chấm được trong một nhóm chia đều trọng số nhóm. */
  withinGroup: string;
  criteria: CriterionSpec[];
  /** Tiêu chí đã bỏ kèm lý do — giữ để không ai dựng lại chúng bằng thiện chí. */
  boKhoi: { code: string; vi: string; lyDo: string }[];
  khongDoDuoc: { muc: string; lyDo: string }[];
  /** Cách bộ giải ý định xếp hạng ứng viên (T43) — không phải một tiêu chí của điểm. */
  intentFit: IntentFitWeights;
  /** Ngưỡng nhận phương án, % trên phần chấm được (T53). `null` = không có ngưỡng. */
  acceptPercent: number | null;
  /**
   * Sàn theo NHÓM (T96): một nhóm chấm được mà dưới % này thì phương án dưới ngưỡng, dù tổng vượt
   * `acceptPercent`. Không có sàn thì nhóm diện tích và hình dáng bù được cho một tầng đi lại tệ —
   * đúng cách sáu mặt bằng đầu tiên lọt qua 65 điểm với D1 = 0, E2 = 0, C7 = 0,24. `null` = không sàn.
   */
  acceptGroupFloorPercent: number | null;
}

/**
 * Trọng số độ khớp Ý ĐỊNH khi bộ giải chọn giữa các cây ứng viên (T43, `kb/plan_quality.yaml` mục
 * `intent_fit`). Nó KHÔNG đi vào điểm của artifact: điểm đo bố cục, còn độ khớp đo «có đúng lời mô hình
 * không» — trộn hai thứ thì không biết 70 điểm là bố cục dở hay bộ giải cãi ý định.
 */
export interface IntentFitWeights {
  zone: number;
  relationship: number;
  street: number;
  /** Tâm hai phòng «gần nhau» cách không quá chừng này, m. */
  nearM: number;
  /** Tâm hai phòng «xa nhau» cách ít nhất chừng này, m. */
  farM: number;
  /** Tổng xếp hạng = điểm chuẩn hoá 0–100 + `blend` × 100 × độ khớp. */
  blend: number;
}

const INTENT_FIT_DEFAULTS: IntentFitWeights = {
  zone: 0.5,
  relationship: 0.3,
  street: 0.2,
  nearM: 6,
  farM: 8,
  blend: 0.3,
};

/** Khoá KHÔNG phải tham số riêng — mọi khoá số còn lại đi vào `params`. */
const STRUCTURAL = new Set([
  'code',
  'group',
  'vi',
  'giai_thich',
  'kind',
  'pass',
  'zero',
  'low',
  'high',
  'hard_low',
  'hard_high',
  'rooms',
  'n',
  'label',
  'weight',
  'enforced_by_gate',
  'by_building_type',
]);

const KINDS: ReadonlySet<string> = new Set<ScoreKind>([
  'lower_better',
  'higher_better',
  'count',
  'boolean',
  'band',
]);

export function parsePlanQuality(yamlText: string): PlanQuality {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') {
    throw new PlanQualityError('Tệp thước chấm mặt bằng rỗng hoặc sai định dạng.');
  }

  const groups: PlanQuality['groups'] = {};
  for (const [code, entry] of Object.entries(
    (raw.groups ?? {}) as Record<string, { vi?: string; weight?: number }>,
  )) {
    const weight = Number(entry?.weight);
    if (!Number.isFinite(weight)) {
      throw new PlanQualityError(`Nhóm "${code}" của thước chấm thiếu trọng số.`);
    }
    groups[code] = { vi: String(entry?.vi ?? code), weight };
  }
  if (Object.keys(groups).length === 0) {
    throw new PlanQualityError('Thước chấm không khai nhóm nào.');
  }
  // Tổng trọng số phải bằng 100, nếu không thì «điểm trên 100» là một câu nói sai. Kiểm ở đây chứ
  // không ở phép thử: một tệp dữ liệu sai phải không nạp được, chứ không phải nạp được rồi sai âm ỉ.
  const total = Object.values(groups).reduce((sum, group) => sum + group.weight, 0);
  if (Math.abs(total - 100) > 1e-9) {
    throw new PlanQualityError(`Tổng trọng số nhóm của thước chấm là ${total}, phải là 100.`);
  }

  const criteria = ((raw.criteria ?? []) as Record<string, unknown>[]).map((item, index) =>
    criterion(item, index, groups),
  );
  const seen = new Set<string>();
  for (const spec of criteria) {
    if (seen.has(spec.code)) {
      throw new PlanQualityError(`Thước chấm có hai tiêu chí cùng mã "${spec.code}".`);
    }
    seen.add(spec.code);
  }

  return {
    version: String(raw.version ?? ''),
    scoreVersion: Number(raw.score_version ?? 0),
    coSoDuLieu: String(raw.co_so_du_lieu ?? ''),
    groups,
    withinGroup: String(raw.within_group ?? 'equal'),
    criteria,
    boKhoi: ((raw.bo_khoi ?? []) as Record<string, string>[]).map((entry) => ({
      code: String(entry.code ?? ''),
      vi: String(entry.vi ?? ''),
      lyDo: String(entry.ly_do ?? ''),
    })),
    khongDoDuoc: ((raw.khong_do_duoc ?? []) as Record<string, string>[]).map((entry) => ({
      muc: String(entry.muc ?? ''),
      lyDo: String(entry.ly_do ?? ''),
    })),
    intentFit: intentFitOf(raw.intent_fit),
    acceptPercent: acceptPercentOf(raw.accept_percent),
    acceptGroupFloorPercent: acceptPercentOf(
      raw.accept_group_floor_percent,
      'accept_group_floor_percent',
    ),
  };
}

function acceptPercentOf(raw: unknown, key = 'accept_percent'): number | null {
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new PlanQualityError(
      `\`${key}\` của thước chấm phải trong (0, 100], đang là "${String(raw)}".`,
    );
  }
  return value;
}

function intentFitOf(raw: unknown): IntentFitWeights {
  const entry = (raw ?? {}) as Record<string, unknown>;
  const pick = (key: string, fallback: number) => {
    if (entry[key] === undefined) return fallback;
    const value = Number(entry[key]);
    if (!Number.isFinite(value) || value < 0) {
      throw new PlanQualityError(`Mục intent_fit.${key} của thước chấm phải là số không âm.`);
    }
    return value;
  };
  return {
    zone: pick('zone', INTENT_FIT_DEFAULTS.zone),
    relationship: pick('relationship', INTENT_FIT_DEFAULTS.relationship),
    street: pick('street', INTENT_FIT_DEFAULTS.street),
    nearM: pick('near_m', INTENT_FIT_DEFAULTS.nearM),
    farM: pick('far_m', INTENT_FIT_DEFAULTS.farM),
    blend: pick('blend', INTENT_FIT_DEFAULTS.blend),
  };
}

function criterion(
  raw: Record<string, unknown>,
  index: number,
  groups: PlanQuality['groups'],
): CriterionSpec {
  const code = String(raw.code ?? '');
  if (!code) throw new PlanQualityError(`Tiêu chí thứ ${index + 1} của thước chấm thiếu mã.`);
  const group = String(raw.group ?? '');
  if (!groups[group]) {
    throw new PlanQualityError(`Tiêu chí "${code}" thuộc nhóm "${group}" không có trong thước.`);
  }
  const kind = String(raw.kind ?? '');
  if (!KINDS.has(kind)) {
    throw new PlanQualityError(`Tiêu chí "${code}" khai kiểu thang điểm lạ: "${kind}".`);
  }

  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (STRUCTURAL.has(key)) continue;
    const number = Number(value);
    if (Number.isFinite(number)) params[key] = number;
  }

  const spec: CriterionSpec = {
    code,
    group,
    vi: String(raw.vi ?? code),
    ...(raw.giai_thich ? { giaiThich: String(raw.giai_thich) } : {}),
    kind: kind as ScoreKind,
    ...numbers(raw, code),
    ...(raw.rooms ? { rooms: String(raw.rooms) } : {}),
    params,
    n: Number(raw.n ?? 0),
    weight: weightOf(raw.weight, code),
    label: String(raw.label ?? ''),
    ...(raw.enforced_by_gate ? { enforcedByGate: String(raw.enforced_by_gate) } : {}),
    byBuildingType: {},
  };

  for (const [type, over] of Object.entries(
    (raw.by_building_type ?? {}) as Record<string, Record<string, unknown>>,
  )) {
    spec.byBuildingType[type] = {
      ...numbers(over, `${code}/${type}`),
      ...(over.rooms ? { rooms: String(over.rooms) } : {}),
    };
  }

  requireThresholds(spec);
  return spec;
}

/** Trọng số trong nhóm: vắng = 1; phải là số dương — 0 là «không chấm», và đó là việc của `enforced_by_gate`. */
function weightOf(raw: unknown, code: string): number {
  if (raw === undefined || raw === null) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PlanQualityError(
      `Tiêu chí "${code}" khai \`weight\` phải là số dương, đang là "${String(raw)}".`,
    );
  }
  return value;
}

function numbers(raw: Record<string, unknown>, where: string): Partial<CriterionSpec> {
  const out: Partial<CriterionSpec> = {};
  const pick = (key: string, field: 'pass' | 'zero' | 'low' | 'high' | 'hardLow' | 'hardHigh') => {
    if (raw[key] === undefined) return;
    const value = Number(raw[key]);
    if (!Number.isFinite(value)) {
      throw new PlanQualityError(`Tiêu chí "${where}" khai "${key}" không phải số.`);
    }
    out[field] = value;
  };
  pick('pass', 'pass');
  pick('zero', 'zero');
  pick('low', 'low');
  pick('high', 'high');
  pick('hard_low', 'hardLow');
  pick('hard_high', 'hardHigh');
  return out;
}

/** Mỗi kiểu thang điểm đòi đủ mốc của nó — thiếu mốc thì điểm ra `NaN` mà không ai biết. */
function requireThresholds(spec: CriterionSpec): void {
  const need = (fields: (keyof CriterionSpec)[]) => {
    for (const field of fields) {
      if (typeof spec[field] !== 'number') {
        throw new PlanQualityError(
          `Tiêu chí "${spec.code}" kiểu ${spec.kind} thiếu mốc "${String(field)}".`,
        );
      }
    }
  };
  if (spec.kind === 'band') need(['low', 'high', 'hardLow', 'hardHigh']);
  else if (spec.kind !== 'boolean') need(['pass', 'zero']);
}

/** Mốc và tập phòng áp dụng cho MỘT loại hình công trình — ghi đè chỉ những khoá được khai. */
export function criterionFor(spec: CriterionSpec, buildingType: string): CriterionSpec {
  const over = spec.byBuildingType[buildingType];
  return over ? { ...spec, ...over } : spec;
}
