/**
 * Điểm nạp DUY NHẤT của `rules/**` vào bản dựng Worker.
 *
 * Cùng khuôn với `kb/vocabulary-data.ts` và `llm/factory.ts`: Worker không có hệ tệp lúc
 * chạy, nên tệp dữ liệu phải nhúng vào bản dựng dưới dạng văn bản (`wrangler.jsonc`, mục
 * `rules` kiểu `Text`).
 *
 * Hệ quả: **mọi tệp quy tắc phải import tường minh ở đây**. Không có cách nào duyệt thư mục lúc
 * chạy, và một `import` động theo biến sẽ không được esbuild gói vào.
 */

import nvgExperience from '../../../../rules/nvg-experience.yaml';
import nvgMeasured from '../../../../rules/nvg-measured.yaml';
import { mergePacks, parseRuleFile, RulePack, type Rule } from './rule-pack';

/**
 * Kinh nghiệm nghề của NVG — KHÔNG phải quy chuẩn, và đó là toàn bộ lý do nó ở tệp riêng.
 *
 * Tách khỏi `rules/base/` ngày 09/09/2026 (Haan yêu cầu). Trước đó 23 quy tắc thói quen nằm
 * lẫn 18 quy tắc văn bản pháp quy trong cùng thư mục, nên một cảnh báo hiện lên màn hình
 * không phân biệt được «sai luật» với «khác cách NVG quen làm» — và nhánh AI đã cảnh báo
 * «phòng khách dưới mức tối thiểu 14 m²» như thể đó là quy chuẩn.
 */
const NVG_FILES: Array<[string, string]> = [
  ['rules/nvg-experience.yaml', nvgExperience as unknown as string],
];

/**
 * Ngưỡng ĐO ĐƯỢC trên hồ sơ thật — chỉ NHÁNH AI đọc, bộ giải KHÔNG.
 *
 * Thêm 12/09/2026, tách khỏi `NVG_FILES` vì khi ấy `NVG_FILES` còn được bộ giải nội bộ đọc và
 * mọi quy tắc thêm vào đó đổi luôn khâu chia diện tích của bộ giải.
 *
 * Đo được hậu quả khi thử gộp: `room_min_area_wc: 3.0` (đo trên 5 khu vệ sinh thật, khoảng
 * 3,1–4,5 m²) nâng mức tối thiểu của bộ giải từ 2,4 m² lên 3,0, và trên lô nhà phố 3,5 × 12 m thì
 * +0,6 m² mỗi WC đẩy thang bộ xuống đúng mức sàn 4 m² — `program-plausibility.test.ts` đỏ 4 phép
 * thử. Phép đo không sai; lô ấy chật thật. Nhưng **re-tune bộ giải là quyết định riêng có nghiệm
 * thu riêng**, không phải hệ quả phụ của một đợt sửa gói quy tắc nhánh AI — nhất là khi bộ giải
 * đã nằm trong diện xoá và T10 đòi 1.211 phép thử của nó đứng yên. Bộ giải đã gỡ (T58); hai tệp
 * vẫn tách vì một bên là kinh nghiệm, một bên là số đo.
 */
const NVG_MEASURED_FILES: Array<[string, string]> = [
  ['rules/nvg-measured.yaml', nvgMeasured as unknown as string],
];

function parseAll(files: Array<[string, string]>): Rule[] {
  return files.flatMap(([origin, text]) => parseRuleFile(text, origin));
}

/**
 * Gói quy tắc PHÁP QUY của nhánh AI — **cố ý RỖNG** từ 12/09/2026 (T30, Haan quyết).
 *
 * Nhánh AI không kiểm quy chuẩn nữa. Lý do không phải «quy chuẩn không quan trọng» mà là
 * **chứng cứ không kiểm được**:
 *
 *  · 4 quy tắc ghi nguồn `TCVN 4451:2012` — TCVN là tiêu chuẩn TỰ NGUYỆN, chỉ thành bắt buộc
 *    khi QCVN/văn bản QPPL/hợp đồng viện dẫn. Dựng cổng pháp lý trên đó là nói quá.
 *  · 14 quy tắc ghi `QCVN 01:2021/BXD` **không kèm một số mục nào**, nên không ai truy lại
 *    được. Và `stair_min_width` / `corridor_min_width` bị gán cho một quy chuẩn QUY HOẠCH
 *    (khoảng lùi, mật độ, tầng cao) — không phải chỗ nói bề rộng thang.
 *
 * Đo trên 2 hồ sơ NVO đã xây (12/09/2026) thì bỏ còn TỐT HƠN giữ: `module_grid_100mm` bắt oan
 * **11/15 kích thước thật** (5020, 5140, 4780, 15880, 110, 140, 220, 520…); một quy tắc lấy
 * sáng kiểu bao trùm bắt oan **2/7 phòng ngủ thật**; còn `load_bearing_wall_alignment` nhắm vào
 * nhóm `load_bearing_wall` có `members: []` nên **chưa từng chạy lần nào**.
 *
 * Và nó nhất quán với nguyên tắc 9 của CLAUDE.md 8.2: tuân thủ pháp lý là việc của người có
 * chứng chỉ hành nghề ký, không phải của engine.
 *
 * ✅ **13/09/2026: `rules/base/` đã xoá khỏi repo**, và bộ giải nội bộ cũng thôi đọc quy chuẩn
 * (Haan quyết). Bộ giải cùng gói `rules/structure/` của nó đã gỡ ở T58.
 *
 * Điều kiện để BAO GIỜ thêm lại một quy tắc pháp quy (T34): số hiệu văn bản **+ số mục** +
 * cách đã kiểm + hiệu lực từ/đến, **và bản văn bản phải có trong repo**. Thiếu một trong bốn
 * thì nó vào gói kinh nghiệm, mức `warning`.
 */
export function nationalRulePack(): RulePack {
  nationalCache ??= new RulePack([], false);
  return nationalCache;
}

let nationalCache: RulePack | undefined;

/**
 * Gói KINH NGHIỆM NGHỀ của NVG, đứng riêng — bật/tắt được từ màn hình thiết kế.
 *
 * Không gộp sẵn với gói quy chuẩn: kỹ sư chọn áp gói nào cho từng hồ sơ, và màn hình phải
 * nói được cảnh báo nào đến từ luật, cảnh báo nào đến từ thói quen.
 */
export function nvgExperiencePack(): RulePack {
  experienceCache ??= new RulePack(
    mergePacks(parseAll(NVG_FILES), parseAll(NVG_MEASURED_FILES)),
    false,
  );
  return experienceCache;
}

let experienceCache: RulePack | undefined;
