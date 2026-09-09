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
 * Gói quy tắc QUỐC GIA — chỉ `rules/base/`, không bao giờ gộp gói địa phương.
 *
 * Dùng riêng cho nhánh AI (T14). Ở đó rule pack KHÔNG ràng buộc mô hình; nó chỉ để đối chiếu
 * sau và sinh cảnh báo. Quy định riêng của một tỉnh không phải thứ đem cảnh báo trên một đề
 * xuất tham khảo, nên hàm này cố ý bỏ qua `LOCALITY_FILES` thay vì nhận tham số địa phương —
 * hiện `LOCALITY_FILES` rỗng nên hai đường cho cùng kết quả, và đó chính là lý do phải tách
 * bằng một hàm riêng: ngày có gói tỉnh đầu tiên, nhánh AI không âm thầm đổi hành vi.
 */
export function nationalRulePack(): RulePack {
  nationalCache ??= new RulePack(parseAll(BASE_FILES), false);
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
  experienceCache ??= new RulePack(parseAll(NVG_FILES), false);
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
