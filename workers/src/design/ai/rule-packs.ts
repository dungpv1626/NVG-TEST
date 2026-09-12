/**
 * Gói quy tắc mà KỸ SƯ chọn có áp hay không, cho từng hồ sơ.
 *
 * ⚠️ **Từ 12/09/2026 (T30) chỉ còn MỘT gói: kinh nghiệm nghề NVG.** Gói pháp quy rỗng — xem
 * `rules/rule-pack-data.ts#nationalRulePack`. Phần lý lẽ của T20 dưới đây **vẫn đúng và vẫn
 * cần**: nó là lý do phải tách nguồn ra khỏi nhau ngay từ đầu, và nhờ đã tách mà việc gỡ gói
 * pháp quy hôm nay là một chỗ đổi, không phải một đợt tái cấu trúc.
 *
 * Lịch sử để không dựng lại: hai gói quy tắc mà kỹ sư chọn có áp hay không, cho từng hồ sơ.
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
  /**
   * @deprecated KHÔNG còn tác dụng từ 12/09/2026 (T30) — gói pháp quy rỗng nên tích cũng không
   * ra quy tắc nào. Giữ trường để `design_ai_run.params` của các lượt chạy CŨ còn đọc được;
   * màn hình đã gỡ ô tích. Có phép thử canh rằng tích nó không sinh quy tắc nào.
   */
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

/**
 * Quy tắc thuộc văn bản pháp quy hay thuộc kinh nghiệm nghề — đọc từ trường `source`.
 *
 * ⚠️ **Chiều mặc định là `experience`, và đó là điểm mấu chốt.** Bản trước hỏi ngược — «có chữ
 * *kinh nghiệm* thì là thói quen, còn lại là luật» — nên mọi nguồn không khớp đúng chữ ấy đều
 * thành `legal`. Lỗi ấy nổ ra thật ngày 12/09/2026 khi các quy tắc đo được trên hồ sơ mang nguồn
 * `đo trên hồ sơ NVG`: chúng bị gắn nhãn pháp quy, tức màn hình lại gọi thói quen của NVG là
 * vi phạm quy chuẩn — đúng một lỗi mà T20 đã sửa một lần.
 *
 * Nay hỏi xuôi: chỉ nguồn **dẫn được một văn bản** (QCVN/TCVN kèm số hiệu) mới là `legal`. Xếp
 * sai hướng này vô hại — một điều luật bị gọi là thói quen thì cảnh báo vẫn hiện, chỉ nhẹ chữ
 * hơn. Xếp sai hướng kia thì phần mềm nói người dùng đang vi phạm pháp luật.
 *
 * Điều kiện T34 (12/09/2026) buộc mọi quy tắc pháp quy phải có số hiệu + số mục, nên phép thử
 * này khớp đúng thứ T34 đòi, không phải một mẹo đoán chữ.
 */
const LEGAL_SOURCE = /\b(QCVN|TCVN)\s*\d/i;

export function kindOf(rule: Rule): RuleKind {
  return LEGAL_SOURCE.test(rule.source) ? 'legal' : 'experience';
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
  // `standards` vẫn được đọc chứ không bị bỏ qua bằng một nhánh `if (false)`: gói truyền vào
  // RỖNG là nơi duy nhất khai điều đó (T30). Nhờ vậy ngày gói pháp quy có nội dung đã kiểm
  // (T34), chỉ cần sửa `nationalRulePack` — không phải tìm lại chỗ nào đã chặn cứng.
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
