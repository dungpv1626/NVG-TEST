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
import thaiBinhMeta from '../../../../rules/locality/thai-binh/00-meta.yaml';
import thaiBinhMassing from '../../../../rules/locality/thai-binh/10-massing.yaml';
import { mergePacks, parseRuleFile, RulePack, type Rule } from './rule-pack';

const BASE_FILES: Array<[string, string]> = [
  ['rules/base/00-meta.yaml', baseMeta as unknown as string],
  ['rules/base/10-dimensions.yaml', baseDimensions as unknown as string],
  ['rules/base/20-daylight-access.yaml', baseDaylight as unknown as string],
  ['rules/base/30-adjacency.yaml', baseAdjacency as unknown as string],
  ['rules/base/40-vertical.yaml', baseVertical as unknown as string],
];

/** Khoá là giá trị `locality` của đầu bài (`thai_binh`), không phải tên thư mục. */
const LOCALITY_FILES: Record<string, Array<[string, string]>> = {
  thai_binh: [
    ['rules/locality/thai-binh/00-meta.yaml', thaiBinhMeta as unknown as string],
    ['rules/locality/thai-binh/10-massing.yaml', thaiBinhMassing as unknown as string],
  ],
};

function parseAll(files: Array<[string, string]>): Rule[] {
  return files.flatMap(([origin, text]) => parseRuleFile(text, origin));
}

const cache = new Map<string, RulePack>();

/**
 * Gói quy tắc đã gộp cho một địa phương, dùng lại giữa các request trong cùng isolate.
 *
 * Địa phương chưa có pack riêng KHÔNG phải lỗi — NVG thi công ở tỉnh mới trước khi có ai
 * soạn xong quy định của tỉnh đó. Nhưng nó cũng không được im lặng: `localityMissing` đi
 * theo gói để lớp trên ghi được vào cảnh báo của bản kết quả.
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
