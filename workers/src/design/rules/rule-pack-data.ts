/**
 * Điểm nạp DUY NHẤT của `rules/**` vào bản dựng Worker.
 *
 * Cùng khuôn với `kb/vocabulary-data.ts` và `llm/factory.ts`: Worker không có hệ tệp lúc
 * chạy, nên tệp dữ liệu phải nhúng vào bản dựng dưới dạng văn bản (`wrangler.jsonc`, mục
 * `rules` kiểu `Text`).
 *
 * Hệ quả: **danh sách địa phương phải khai tường minh ở đây**. Thêm một tỉnh là thêm thư mục
 * `rules/locality/<tỉnh>/` VÀ một dòng trong `LOCALITY_FILES`. Không có cách nào duyệt thư
 * mục lúc chạy, và một `import` động theo biến sẽ không được esbuild gói vào.
 */

import baseMeta from '../../../../rules/base/00-meta.yaml';
import baseDimensions from '../../../../rules/base/10-dimensions.yaml';
import baseDaylight from '../../../../rules/base/20-daylight-access.yaml';
import baseAdjacency from '../../../../rules/base/30-adjacency.yaml';
import baseVertical from '../../../../rules/base/40-vertical.yaml';
import baseMassing from '../../../../rules/base/50-massing.yaml';
import nvgExperience from '../../../../rules/nvg-experience.yaml';
import nvgMeasured from '../../../../rules/nvg-measured.yaml';
import { mergePacks, parseRuleFile, RulePack, type Rule } from './rule-pack';

const BASE_FILES: Array<[string, string]> = [
  ['rules/base/00-meta.yaml', baseMeta as unknown as string],
  ['rules/base/10-dimensions.yaml', baseDimensions as unknown as string],
  ['rules/base/20-daylight-access.yaml', baseDaylight as unknown as string],
  ['rules/base/30-adjacency.yaml', baseAdjacency as unknown as string],
  ['rules/base/40-vertical.yaml', baseVertical as unknown as string],
  ['rules/base/50-massing.yaml', baseMassing as unknown as string],
];

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
 * Thêm 12/09/2026. Vì sao không gộp vào `NVG_FILES`: danh sách ấy được `rulePackFor()` gộp với
 * `BASE_FILES` cho BỘ GIẢI, nên mọi quy tắc thêm vào đó đổi luôn khâu chia diện tích của bộ giải.
 *
 * Đo được hậu quả khi thử gộp: `room_min_area_wc: 3.0` (đo trên 5 khu vệ sinh thật, khoảng
 * 3,1–4,5 m²) nâng mức tối thiểu của bộ giải từ 2,4 m² lên 3,0, và trên lô nhà phố 3,5 × 12 m thì
 * +0,6 m² mỗi WC đẩy thang bộ xuống đúng mức sàn 4 m² — `program-plausibility.test.ts` đỏ 4 phép
 * thử. Phép đo không sai; lô ấy chật thật. Nhưng **re-tune bộ giải là quyết định riêng có nghiệm
 * thu riêng**, không phải hệ quả phụ của một đợt sửa gói quy tắc nhánh AI — nhất là khi bộ giải
 * đã nằm trong diện xoá và T10 đòi 1.211 phép thử của nó đứng yên.
 *
 * Đây là cùng một nước đi đã làm T30 thành MỘT chỗ đổi: hai đường đọc tách nhau thì đổi một bên
 * không kéo bên kia. Ngày xoá bộ giải, gộp hai tệp này lại là việc mười giây.
 */
const NVG_MEASURED_FILES: Array<[string, string]> = [
  ['rules/nvg-measured.yaml', nvgMeasured as unknown as string],
];

/**
 * Khoá là giá trị `locality` của đầu bài (`hung_yen`), không phải tên thư mục.
 *
 * **Rỗng là trạng thái đúng hiện nay**, không phải chỗ bỏ dở: NVG chưa nhận được văn bản quy
 * hoạch riêng của tỉnh nào, nên mọi con số đang dùng đều là QCVN 01:2021/BXD và nằm ở gói
 * nền. Xem `rules/locality/README.md` — tạo một gói chép lại đúng số của quy chuẩn quốc gia
 * là tạo bản sao thứ hai của cùng con số, và bản sao đó sẽ không đổi khi quy chuẩn đổi.
 */
const LOCALITY_FILES: Record<string, Array<[string, string]>> = {};

function parseAll(files: Array<[string, string]>): Rule[] {
  return files.flatMap(([origin, text]) => parseRuleFile(text, origin));
}

const cache = new Map<string, RulePack>();

/**
 * Gói quy tắc đã gộp cho một địa phương, dùng lại giữa các request trong cùng isolate.
 *
 * Địa phương chưa có pack riêng KHÔNG phải lỗi, và cũng KHÔNG phải cảnh báo: gói nền đã
 * mang đủ khoảng lùi và mật độ theo QCVN 01:2021/BXD, nên kết quả vẫn đúng quy chuẩn quốc
 * gia. `localityMissing` đi theo gói để lớp trên GHI LẠI chế độ đã dùng
 * (`params.rule_pack_locality`) và hiển thị thành một dòng thông tin — không phải một cảnh
 * báo. Cảnh báo nổ ở mọi lần chạy là cảnh báo bị bỏ qua.
 */
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
 * ⚠️ **`rules/base/` vẫn còn trên đĩa, và vẫn được `rulePackFor()` đọc cho BỘ GIẢI nội bộ.**
 * Không xoá tệp trong đợt này: bộ giải đang ràng buộc CP-SAT trên chúng và 1.211 phép thử đang
 * xanh không được vỡ (T10), trong khi bộ giải thì đã nằm trong diện xoá. Hai hàm tách riêng từ
 * 09/09/2026 chính là thứ cho phép đổi một bên mà không đụng bên kia — xem ghi chú của
 * `rulePackFor`. Ngày xoá bộ giải thì `rules/base/` đi theo.
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

export function rulePackFor(locality: string): RulePack {
  const cached = cache.get(locality);
  if (cached) return cached;

  const localityFiles = LOCALITY_FILES[locality];
  // Bộ giải nội bộ vẫn nhận CẢ HAI gói gộp lại, đúng như trước ngày tách tệp — tách là để
  // nhánh AI và màn hình phân biệt được nguồn, không phải để đổi hành vi bộ giải.
  const pack = new RulePack(
    mergePacks(
      mergePacks(parseAll(BASE_FILES), parseAll(NVG_FILES)),
      localityFiles ? parseAll(localityFiles) : [],
    ),
    localityFiles === undefined,
  );
  cache.set(locality, pack);
  return pack;
}
