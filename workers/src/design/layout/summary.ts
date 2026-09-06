/**
 * Bảng so sánh phương án bằng NGÔN NGỮ KHÁCH (11-design-flow 11.4b, 11.6 Output 3).
 *
 * Khách chốt phương án dựa trên công năng và bố cục — phòng nào ở đâu, mấy phòng ngủ, tổng
 * diện tích — chứ không dựa trên "diện tích giao thông 11,2%". Con số kỹ thuật vẫn tính ở đây
 * (kiến trúc sư cần), nhưng giao diện chọn hiện gì.
 *
 * Hàm thuần: nhận `FloorPlan` đã kiểm hợp đồng và hai bảng tra từ `kb/room_vocabulary.yaml`,
 * không gọi mạng, không đọc tệp — để kiểm thử được dưới Node và để tuyến GET không phải giải
 * lại gì.
 */

import type { FloorPlan } from '@nvg/shared/design';
import type { Rule } from '../program/rule-pack';

export interface LevelSummary {
  level: number;
  height_m: number | null;
  /** Diện tích sàn = tổng đa giác phòng (cây chia không gian lấp kín mặt sàn — CLAUDE.md 8.8.6). */
  area_m2: number;
  rooms: Array<{ id: string; type: string; label: string; area_m2: number; has_daylight: boolean }>;
}

export interface FloorPlanSummary {
  levels: LevelSummary[];
  total_area_m2: number;
  bedrooms: number;
  /** Tỉ lệ diện tích giao thông trên tổng sàn, 0–1. */
  circulation_share: number;
  /** Tầng của các không gian khách hay hỏi trước tiên. Rỗng nếu chương trình không có. */
  altar_level: number | null;
  garage_level: number | null;
  constraint_status: FloorPlan['constraint_report']['status'];
  violations: SummaryViolation[];
  /** Số quy tắc áp cho loại công trình này — mẫu số của "16/18 đạt". */
  rulesChecked: number;
  /** `rulesChecked` trừ số quy tắc bị vi phạm. */
  rulesPassed: number;
}

export interface SummaryViolation {
  rule_id: string;
  severity: 'error' | 'warning';
  message: string;
  involved?: string[];
  /**
   * Trích dẫn nguồn nguyên văn từ gói quy tắc (`QCVN 01:2021/BXD`, `kinh nghiệm NVG`).
   *
   * Rỗng khi không tra được `rule_id` trong gói — bày dòng không có nguồn còn hơn suy ra một
   * nguồn từ mức độ nghiêm trọng, vì đoán sai chỗ này là gán nhầm thẩm quyền pháp lý cho một
   * quy tắc kinh nghiệm.
   */
  source: string | null;
  /**
   * Có chặn phát hành hay không.
   *
   * Lấy thẳng từ `severity` chứ không suy từ tiền tố văn bản: `severity` LÀ thứ quyết định
   * chặn hay không, còn việc "mức error đòi nguồn là văn bản quy phạm pháp luật" đã do
   * `compute/…/rules/validator.py` canh lúc soạn quy tắc. Cài lại phép phân loại đó ở đây là
   * dựng bản sao thứ hai của một danh sách tiền tố nằm trong mã Python.
   */
  blocking: boolean;
}

/**
 * Tra cứu quy tắc cho MỘT loại công trình: đếm mẫu số và tìm nguồn theo `rule_id`.
 *
 * Đếm ở Worker chứ không hỏi Container vì Worker gửi CHÍNH gói quy tắc này cho Container —
 * một nguồn, hai chỗ đọc, không lệch được.
 */
export interface RuleCatalogue {
  checked: number;
  sourceOf: (ruleId: string) => string | null;
  /**
   * Mặt nào của hình bao mà một loại phòng BẮT BUỘC giáp, theo vị từ `requires_face`.
   *
   * Đây là tra cứu để XẾP CHỖ ở Lớp 3a, không phải phép đánh giá quy tắc — vị từ hình học vẫn
   * chỉ được cài đặt một nơi là Container (CLAUDE.md 8.7). Cùng loại việc với `floorPreference`
   * mà Lớp 2 đã đọc từ gói quy tắc để gán tầng.
   */
  faceOf: (roomType: string) => 'open' | 'access' | null;
}

export function ruleCatalogue(
  rules: Rule[],
  buildingType: string,
  groups: Record<string, string[]> = {},
): RuleCatalogue {
  const applicable = rules.filter((r) => r.applies_to.includes(buildingType));
  const byId = new Map(applicable.map((r) => [r.id, r.source] as const));

  // Quy tắc nhắm đúng mã phòng thắng quy tắc nhắm cả nhóm — cùng thứ tự ưu tiên với
  // `threshold_for_target` phía Container, để hai bên không hiểu khác nhau.
  const faceRules = applicable.filter((r) => r.predicate === 'requires_face');
  const faceOf = (roomType: string): 'open' | 'access' | null => {
    const exact = faceRules.find((r) => r.params?.target === roomType);
    const byGroup = faceRules.find((r) => {
      const target = r.params?.target;
      return typeof target === 'string' && (groups[target] ?? []).includes(roomType);
    });
    const face = (exact ?? byGroup)?.params?.face;
    return face === 'access' || face === 'open' ? face : null;
  };

  return { checked: applicable.length, sourceOf: (id) => byId.get(id) ?? null, faceOf };
}

/** Gói rỗng — dùng khi lớp gọi không có gói quy tắc trong tay. Không bịa mẫu số. */
export const NO_RULES: RuleCatalogue = {
  checked: 0,
  sourceOf: () => null,
  faceOf: () => null,
};

function round(value: number, digits = 1): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

export function summariseFloorPlan(
  plan: FloorPlan,
  labels: Record<string, string>,
  groups: Record<string, string[]>,
  rules: RuleCatalogue = NO_RULES,
): FloorPlanSummary {
  const circulation = new Set(groups.circulation ?? []);
  const sleeping = new Set(groups.sleeping ?? []);

  let total = 0;
  let circulationArea = 0;
  let bedrooms = 0;
  let altarLevel: number | null = null;
  let garageLevel: number | null = null;

  const levels: LevelSummary[] = [...plan.levels]
    .sort((a, b) => a.level - b.level)
    .map((level) => {
      let area = 0;
      const rooms = level.rooms.map((room) => {
        area += room.area_m2;
        if (circulation.has(room.type)) circulationArea += room.area_m2;
        if (sleeping.has(room.type)) bedrooms += 1;
        if (room.type === 'altar_room' && altarLevel === null) altarLevel = level.level;
        if (room.type === 'garage' && garageLevel === null) garageLevel = level.level;
        return {
          id: room.id,
          type: room.type,
          // Nhãn theo MÃ KHÔNG GIAN của chương trình (`bedroom_2` → "Phòng ngủ 1"); không có thì
          // rơi về mã phòng để người đọc vẫn nhận ra, thay vì một ô trống.
          label: labels[room.id] ?? room.type,
          area_m2: round(room.area_m2),
          has_daylight: room.has_daylight === true,
        };
      });
      total += area;
      return { level: level.level, height_m: level.height_m ?? null, area_m2: round(area), rooms };
    });

  const violations: SummaryViolation[] = (plan.constraint_report.violations ?? []).map((v) => ({
    rule_id: v.rule_id,
    severity: v.severity,
    message: v.message,
    involved: v.involved,
    source: rules.sourceOf(v.rule_id),
    blocking: v.severity === 'error',
  }));

  return {
    levels,
    total_area_m2: round(total),
    bedrooms,
    circulation_share: total > 0 ? round(circulationArea / total, 3) : 0,
    altar_level: altarLevel,
    garage_level: garageLevel,
    constraint_status: plan.constraint_report.status,
    violations,
    rulesChecked: rules.checked,
    // Không để mẫu số nhỏ hơn tử số khi gói quy tắc và bản vẽ lệch phiên bản: thà đếm thiếu
    // còn hơn hiện "18/16 đạt", một câu không đọc được.
    rulesPassed: Math.max(0, rules.checked - violations.length),
  };
}
