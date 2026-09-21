/**
 * Đọc `kb/facade_quality.yaml` — thước chấm «mặt đứng giống cách NVG vẽ đến đâu» (T63).
 *
 * Chia đôi như mọi mô-đun đọc YAML của module: phần PHÂN TÍCH ở đây (kiểm thử được bằng chuỗi tự
 * dựng), phần nạp tệp ở `facade-quality-data.ts` (chỉ bản dựng Worker chạm tới).
 *
 * Năm kiểu thang điểm và công thức tính dùng LẠI của thước chấm mặt bằng (`ai/plan-score.ts`,
 * `scoreOf`) — một bộ công thức, hai cái thước. Viết lại công thức ở đây là tạo bản thứ hai sẽ lệch.
 */

import { load as parseYaml } from 'js-yaml';
import type { ScoreKind } from '../plan-quality';

export class FacadeQualityError extends Error {
  constructor(message: string) {
    super(`Không đọc được thước chấm mặt đứng: ${message}`);
    this.name = 'FacadeQualityError';
  }
}

/**
 * Điều kiện áp dụng của một tiêu chí — rỗng nghĩa là luôn chấm.
 *
 * Điều kiện ở đây nói «ngôi nhà này KHÔNG CÓ thứ ấy», khác hẳn «chưa biết thứ ấy». Không có thì
 * tiêu chí ra khỏi phép chia hẳn; chưa biết thì nó giữ phần trọng số của mình. Đặt nhầm một cái
 * thành cái kia là lặng lẽ đổi mẫu số của điểm.
 */
export type FacadeCondition =
  | 'roof_japanese'
  | 'roof_flat'
  | 'roof_pitched'
  | 'main_door'
  | 'front_window'
  | 'main_door_window'
  | 'balcony';

const CONDITIONS: readonly string[] = [
  'roof_japanese',
  'roof_flat',
  'roof_pitched',
  'main_door',
  'front_window',
  'main_door_window',
  'balcony',
];

export interface FacadeCriterion {
  code: string;
  group: string;
  vi: string;
  giaiThich?: string;
  kind: ScoreKind;
  pass?: number;
  zero?: number;
  low?: number;
  high?: number;
  hardLow?: number;
  hardHigh?: number;
  /** Chỉ chấm khi điều kiện này đúng; vắng = luôn chấm. */
  chiKhi?: FacadeCondition;
  /**
   * Mô hình có quyết được tiêu chí này không. `false` = nó đến từ mặt bằng, phiếu yêu cầu hoặc
   * `kb/construction_norms.yaml`, nên vòng tự sửa KHÔNG gửi nó cho mô hình — bắt mô hình sửa thứ
   * nó không cầm là đốt một lượt gọi tính tiền để nhận lại đúng câu trả lời cũ.
   */
  doAi: boolean;
  /** Tham số riêng của tiêu chí — vẫn là dữ liệu, không phải hằng số trong mã (CLAUDE.md 8.6). */
  params: Record<string, number>;
  /** Số công trình đã đo. `0` = ngưỡng hoàn toàn là suy luận. */
  n: number;
  /** Nguyên văn nhãn `[ĐO]` / `[CHUNG]` — hiện lên màn hình, không rút gọn. */
  label: string;
}

export interface FacadeQuality {
  version: string;
  scoreVersion: number;
  coSoDuLieu: string;
  /** Ngưỡng nhận, % trên phần trọng số chấm được. `null` = không có ngưỡng. */
  acceptPercent: number | null;
  groups: Record<string, { vi: string; weight: number }>;
  withinGroup: string;
  criteria: FacadeCriterion[];
  /** Đo được trên hồ sơ nhưng chưa thành tiêu chí, kèm lý do. */
  chuaChamDuoc: Array<{ muc: string; lyDo: string }>;
}

const KINDS: readonly string[] = ['lower_better', 'higher_better', 'count', 'boolean', 'band'];

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FacadeQualityError(`"${where}" phải là số`);
  }
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FacadeQualityError(`"${where}" phải là chữ`);
  }
  return value;
}

/** Mục `params` của một tiêu chí: mọi giá trị phải là số. Vắng = rỗng. */
function numbers(raw: unknown, where: string): Record<string, number> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') throw new FacadeQualityError(`"${where}" phải là mục khoá–số`);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = num(value, `${where}.${key}`);
  }
  return out;
}

export function parseFacadeQuality(yamlText: string): FacadeQuality {
  const raw = parseYaml(yamlText);
  if (!raw || typeof raw !== 'object') throw new FacadeQualityError('tệp rỗng');
  const doc = raw as Record<string, unknown>;

  const groupsRaw = doc.groups;
  if (!groupsRaw || typeof groupsRaw !== 'object') throw new FacadeQualityError('thiếu `groups`');
  const groups: FacadeQuality['groups'] = {};
  for (const [code, value] of Object.entries(groupsRaw as Record<string, unknown>)) {
    const g = value as Record<string, unknown>;
    groups[code] = {
      vi: str(g?.vi, `groups.${code}.vi`),
      weight: num(g?.weight, `groups.${code}.weight`),
    };
  }
  if (Object.keys(groups).length === 0) throw new FacadeQualityError('`groups` rỗng');

  const list = doc.criteria;
  if (!Array.isArray(list) || list.length === 0) throw new FacadeQualityError('thiếu `criteria`');
  const criteria = list.map((item, index) => {
    const c = item as Record<string, unknown>;
    const code = str(c?.code, `criteria[${index}].code`);
    const group = str(c?.group, `criteria[${code}].group`);
    if (!groups[group])
      throw new FacadeQualityError(`tiêu chí ${code} trỏ vào nhóm "${group}" không có`);
    const kind = str(c?.kind, `criteria[${code}].kind`);
    if (!KINDS.includes(kind))
      throw new FacadeQualityError(`tiêu chí ${code} có kind "${kind}" lạ`);
    const chiKhi =
      c?.chi_khi === undefined ? undefined : str(c.chi_khi, `criteria[${code}].chi_khi`);
    if (chiKhi !== undefined && !CONDITIONS.includes(chiKhi)) {
      throw new FacadeQualityError(`tiêu chí ${code} có chi_khi "${chiKhi}" lạ`);
    }
    // Thang điểm nào thiếu mốc thì bắt NGAY lúc đọc tệp: thiếu một mốc thì `scoreOf` đọc ra
    // `undefined` và cho điểm 0 lặng lẽ — một tiêu chí luôn 0 trông y hệt một bản vẽ luôn sai.
    if (kind === 'band') {
      for (const key of ['low', 'high', 'hard_low', 'hard_high']) {
        num(c[key], `criteria[${code}].${key}`);
      }
    } else if (kind !== 'boolean') {
      for (const key of ['pass', 'zero']) num(c[key], `criteria[${code}].${key}`);
    }
    return {
      code,
      group,
      vi: str(c?.vi, `criteria[${code}].vi`),
      ...(typeof c?.giai_thich === 'string' ? { giaiThich: c.giai_thich } : {}),
      kind: kind as ScoreKind,
      ...(typeof c?.pass === 'number' ? { pass: c.pass } : {}),
      ...(typeof c?.zero === 'number' ? { zero: c.zero } : {}),
      ...(typeof c?.low === 'number' ? { low: c.low } : {}),
      ...(typeof c?.high === 'number' ? { high: c.high } : {}),
      ...(typeof c?.hard_low === 'number' ? { hardLow: c.hard_low } : {}),
      ...(typeof c?.hard_high === 'number' ? { hardHigh: c.hard_high } : {}),
      ...(chiKhi ? { chiKhi: chiKhi as FacadeCondition } : {}),
      // Vắng = mô hình quyết. Chỉ tiêu chí KHÔNG do mô hình quyết mới phải khai.
      doAi: c?.do_ai !== false,
      params: numbers(c?.params, `criteria[${code}].params`),
      n: num(c?.n, `criteria[${code}].n`),
      label: str(c?.label, `criteria[${code}].label`),
    } satisfies FacadeCriterion;
  });

  const accept = doc.accept_percent;
  return {
    version: str(doc.version, 'version'),
    scoreVersion: num(doc.score_version, 'score_version'),
    coSoDuLieu: str(doc.co_so_du_lieu, 'co_so_du_lieu'),
    acceptPercent: typeof accept === 'number' ? accept : null,
    groups,
    withinGroup: str(doc.within_group, 'within_group'),
    criteria,
    chuaChamDuoc: Array.isArray(doc.chua_cham_duoc)
      ? doc.chua_cham_duoc.map((item, index) => {
          const r = item as Record<string, unknown>;
          return {
            muc: str(r?.muc, `chua_cham_duoc[${index}].muc`),
            lyDo: str(r?.ly_do, `chua_cham_duoc[${index}].ly_do`),
          };
        })
      : [],
  };
}
