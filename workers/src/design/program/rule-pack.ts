/**
 * Đọc rule pack trong Worker — CHỈ ĐỌC, không đánh giá.
 *
 * Nguồn: doc/design/07-rule-pack.md; CLAUDE.md 8.7.
 *
 * ⚠️ Ranh giới dễ hiểu nhầm, đọc kỹ trước khi thêm hàm vào tệp này:
 *
 *   "Vị từ hình học chỉ cài đặt MỘT nơi: Container." Tệp này KHÔNG vi phạm điều đó vì nó
 *   không hỏi "đa giác này có đạt 9 m² không" — nó chỉ đọc ra CON SỐ 9 đã khai trong rule
 *   pack rồi chép vào `min_area_m2` của chương trình không gian, để bộ giải nhận đúng ràng
 *   buộc ấy làm đầu vào. Cùng một tệp YAML, một nơi đánh giá.
 *
 *   Nếu có ngày cần trả lời "hình này có hợp lệ không" ở phía Worker — dừng lại. Đó là lúc
 *   dựng bản thực thi thứ hai, và hai bản sẽ lệch nhau.
 *
 * Pack địa phương ghi đè pack nền THEO `id`, đúng ngữ nghĩa của `compute/.../rules/loader.py`.
 * Hai bản đọc lệch nhau thì Lớp 2 soạn chương trình theo một bộ số, còn bộ giải kiểm theo bộ
 * số khác — kiểu sai không bao giờ nổ ra thành lỗi, chỉ ra kết quả khó hiểu.
 */

import { load as parseYaml } from 'js-yaml';

export type RuleSeverity = 'error' | 'warning';

export interface Rule {
  id: string;
  applies_to: string[];
  scope: string;
  predicate: string;
  severity: RuleSeverity;
  source: string;
  /** Mọi khoá còn lại — tham số của vị từ. Giữ nguyên văn, không diễn giải ở đây. */
  params: Record<string, unknown>;
}

const STRUCTURAL = new Set([
  'id',
  'applies_to',
  'scope',
  'predicate',
  'severity',
  'source',
  'auto_repair',
]);

export class RulePackError extends Error {
  readonly retryable = false;
}

/** Phân tích một tệp quy tắc. `00-meta.yaml` (đối tượng, không phải mảng) trả về rỗng. */
export function parseRuleFile(yamlText: string, origin: string): Rule[] {
  const raw = parseYaml(yamlText);
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) return []; // tệp siêu dữ liệu

  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new RulePackError(`${origin}: quy tắc thứ ${index + 1} không phải một đối tượng.`);
    }
    const r = item as Record<string, unknown>;
    for (const key of ['id', 'applies_to', 'scope', 'predicate', 'severity', 'source']) {
      if (r[key] === undefined) {
        throw new RulePackError(`${origin}: quy tắc thứ ${index + 1} thiếu khoá "${key}".`);
      }
    }
    if (r.severity !== 'error' && r.severity !== 'warning') {
      throw new RulePackError(`${origin}: quy tắc "${String(r.id)}" có severity lạ.`);
    }
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(r)) {
      if (!STRUCTURAL.has(key)) params[key] = value;
    }
    return {
      id: String(r.id),
      applies_to: (r.applies_to as string[]).map(String),
      scope: String(r.scope),
      predicate: String(r.predicate),
      severity: r.severity,
      source: String(r.source),
      params,
    };
  });
}

/**
 * Gói quy tắc đã gộp, kèm các phép tra mà Lớp 2 cần.
 *
 * Mọi phép tra đều lọc theo loại hình công trình: một quy tắc chỉ áp cho biệt thự không được
 * ảnh hưởng tới chương trình không gian của nhà phố.
 */
export class RulePack {
  constructor(
    readonly rules: Rule[],
    /** `true` khi đầu bài khai một địa phương chưa có pack riêng — chỉ có pack nền. */
    readonly localityMissing: boolean = false,
  ) {}

  private forType(buildingType: string, predicate: string): Rule[] {
    return this.rules.filter(
      (r) => r.predicate === predicate && r.applies_to.includes(buildingType),
    );
  }

  /** Diện tích tối thiểu theo quy chuẩn cho một mã phòng. Rỗng khi không quy tắc nào nhắm tới. */
  minArea(buildingType: string, roomType: string): number | null {
    const values = this.forType(buildingType, 'min_area')
      .filter((r) => r.params.target === roomType)
      .map((r) => Number(r.params.value_m2))
      .filter((v) => Number.isFinite(v));
    return values.length ? Math.max(...values) : null;
  }

  /** Mã phòng buộc phải có chiếu sáng tự nhiên. */
  requiresDaylight(buildingType: string): Set<string> {
    return new Set(
      this.forType(buildingType, 'requires_daylight').map((r) => String(r.params.target)),
    );
  }

  /** Nguyện vọng tầng do quy tắc áp đặt — thắng nguyện vọng khai trong `kb/space_norms.yaml`. */
  floorPreference(buildingType: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const rule of this.forType(buildingType, 'floor_preference')) {
      out.set(String(rule.params.target), String(rule.params.value));
    }
    return out;
  }

  /**
   * Quan hệ liền kề đã khai trong rule pack — nguồn DUY NHẤT của `SpaceProgram.adjacency`.
   *
   * Khai lại quan hệ ở `kb/space_norms.yaml` sẽ tạo bộ thứ hai: bộ giải tối ưu theo bộ này
   * rồi trình kiểm tra chấm điểm theo bộ kia, và không ai hiểu vì sao kết quả "hợp lệ" mà
   * vẫn bị cảnh báo.
   */
  adjacency(buildingType: string): Array<{
    a: string;
    b: string;
    kind: 'adjacent' | 'near' | 'separate';
    scope: string;
    severity: RuleSeverity;
  }> {
    return this.forType(buildingType, 'adjacency')
      .filter(
        (r) =>
          r.params.kind === 'adjacent' || r.params.kind === 'near' || r.params.kind === 'separate',
      )
      .map((r) => ({
        a: String(r.params.a),
        b: String(r.params.b),
        kind: r.params.kind as 'adjacent' | 'near' | 'separate',
        scope: r.scope,
        severity: r.severity,
      }));
  }

  /** Khoảng lùi bắt buộc theo từng cạnh, mét. */
  setbacks(buildingType: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const rule of this.forType(buildingType, 'setback')) {
      const side = String(rule.params.side);
      const value = Number(rule.params.value_m);
      if (Number.isFinite(value)) out[side] = Math.max(out[side] ?? 0, value);
    }
    return out;
  }

  /** Mật độ xây dựng tối đa (0..1). Rỗng khi rule pack không nói gì. */
  maxDensity(buildingType: string): number | null {
    const values = this.forType(buildingType, 'max_density')
      .map((r) => Number(r.params.value))
      .filter((v) => Number.isFinite(v));
    // Nhiều quy tắc cùng nói thì lấy cái CHẶT nhất — nới lỏng phải là hành động tường minh.
    return values.length ? Math.min(...values) : null;
  }
}

/**
 * Gộp pack nền với pack địa phương. Quy tắc trùng `id` thì bản địa phương thắng.
 *
 * Thứ tự đầu ra tất định (theo `id`) để mã băm `params_hash` của cạnh lineage không đổi giữa
 * hai lần chạy cùng đầu vào.
 */
export function mergePacks(base: Rule[], locality: Rule[]): Rule[] {
  const byId = new Map<string, Rule>();
  for (const rule of base) byId.set(rule.id, rule);
  for (const rule of locality) byId.set(rule.id, rule);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
