/**
 * Hai gói quy tắc mà KỸ SƯ chọn có áp hay không, cho từng hồ sơ.
 *
 * Quyết định của Haan ngày 09/09/2026 (T20), thay một phần T14:
 *
 *  · Mặc định **TẮT CẢ HAI**. Không tích gì thì mô hình thiết kế tự do hoàn toàn và không có
 *    cảnh báo nào — đúng câu «loại bỏ hết quy chuẩn hiện tại».
 *  · Gói đã tích tác động **CẢ HAI CHIỀU**: đưa vào lời dẫn để mô hình làm theo, VÀ dùng để
 *    đối chiếu kết quả rồi sinh cảnh báo.
 *
 * Vì sao phải tách làm hai gói chứ không một nút «áp quy tắc». Đo ngày 09/09/2026:
 * `rules/base/` khi ấy chứa 41 quy tắc, trong đó **23 là kinh nghiệm nghề của NVG**, không
 * phải văn bản pháp quy. Màn hình vì thế báo «phòng khách dưới mức tối thiểu 14 m²» trông y
 * như một vi phạm quy chuẩn, trong khi 14 m² chỉ là thói quen của phòng thiết kế. Hai gói,
 * hai ô chọn, và cảnh báo nói rõ nguồn.
 */

import { mergePacks, RulePack, type Rule, type RuleSeverity } from '../rules/rule-pack';

export interface AiRulePackChoice {
  /** QCVN 01:2021/BXD và TCVN — văn bản pháp quy, áp dụng toàn quốc. */
  standards: boolean;
  /** Kinh nghiệm nghề của Phòng Thiết kế NVG — không phải luật, bỏ qua được. */
  experience: boolean;
}

export const NO_RULE_PACKS: AiRulePackChoice = { standards: false, experience: false };

/** Quy tắc đến từ đâu — để lời dẫn và màn hình đều nói được «luật» hay «thói quen». */
export type RuleKind = 'legal' | 'experience';

/**
 * Một quy tắc ở dạng ĐƯA ĐƯỢC VÀO LỜI DẪN: phẳng, có đơn vị, có nguồn.
 *
 * Không gửi nguyên `Rule` cho mô hình: `params` là túi khoá tự do, và mô hình sẽ phải đoán
 * `value_m` với `value_m2` khác nhau chỗ nào.
 */
export interface InjectedRule {
  id: string;
  predicate: string;
  /** Mã loại phòng quy tắc nhắm tới; rỗng nghĩa là áp cho mọi phòng. */
  target: string | null;
  value: number | null;
  unit: 'm' | 'm2' | 'ratio' | null;
  severity: RuleSeverity;
  source: string;
  kind: RuleKind;
}

/** Quy tắc thuộc văn bản pháp quy hay thuộc kinh nghiệm nghề — đọc từ trường `source`. */
export function kindOf(rule: Rule): RuleKind {
  return /kinh nghi/i.test(rule.source) ? 'experience' : 'legal';
}

function valueOf(rule: Rule): { value: number | null; unit: InjectedRule['unit'] } {
  for (const [key, unit] of [
    ['value_m2', 'm2'],
    ['value_m', 'm'],
    ['value', 'ratio'],
  ] as const) {
    const raw = Number(rule.params[key]);
    if (Number.isFinite(raw)) return { value: raw, unit };
  }
  return { value: null, unit: null };
}

/**
 * Gói đã chọn, gộp lại thành một `RulePack` để đối chiếu.
 *
 * Không tích gì thì trả về gói RỖNG chứ không phải `null`: lớp gọi luôn có một gói để hỏi, và
 * kết quả tự nhiên là không cảnh báo nào. Nhánh `if (pack)` rải khắp nơi là chỗ để lọt.
 */
export function selectedRulePack(
  choice: AiRulePackChoice,
  packs: { standards: RulePack; experience: RulePack },
): RulePack {
  const chosen: Rule[][] = [];
  if (choice.standards) chosen.push(packs.standards.rules);
  if (choice.experience) chosen.push(packs.experience.rules);
  if (!chosen.length) return new RulePack([], false);
  return new RulePack(
    chosen.reduce((a, b) => mergePacks(a, b)),
    false,
  );
}

/**
 * Quy tắc để ĐƯA VÀO LỜI DẪN, lọc theo loại công trình và theo vị từ mà bước này hiểu được.
 *
 * `predicates` hẹp có chủ ý: bước lập chương trình không gian mới có diện tích, chưa có hình
 * học, nên gửi kèm `min_dimension` là gửi một con số mô hình không dùng được vào việc gì và
 * chỉ làm loãng lời dẫn.
 */
export function injectableRules(
  pack: RulePack,
  buildingType: string,
  predicates: ReadonlySet<string>,
): InjectedRule[] {
  return pack.rules
    .filter((r) => r.applies_to.includes(buildingType) && predicates.has(r.predicate))
    .map((r) => {
      const { value, unit } = valueOf(r);
      return {
        id: r.id,
        predicate: r.predicate,
        target: r.params.target === undefined ? null : String(r.params.target),
        value,
        unit,
        severity: r.severity,
        source: r.source,
        kind: kindOf(r),
      } satisfies InjectedRule;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
