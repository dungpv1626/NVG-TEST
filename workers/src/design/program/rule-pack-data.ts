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
export function rulePackFor(locality: string): RulePack {
  const cached = cache.get(locality);
  if (cached) return cached;

  const localityFiles = LOCALITY_FILES[locality];
  const pack = new RulePack(
    mergePacks(parseAll(BASE_FILES), localityFiles ? parseAll(localityFiles) : []),
    localityFiles === undefined,
  );
  cache.set(locality, pack);
  return pack;
}
