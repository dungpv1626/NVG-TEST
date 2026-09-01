/**
 * Điểm nạp DUY NHẤT của `kb/site_context.yaml` vào bản dựng Worker.
 *
 * Cùng khuôn với `program/norms-data.ts`: Worker không có hệ tệp lúc chạy nên tệp dữ liệu
 * phải nhúng vào bản dựng dưới dạng văn bản.
 */

import siteContextYaml from '../../../../kb/site_context.yaml';
import { parseSiteContext, type SiteContextTable } from './site-context';

let cached: SiteContextTable | undefined;

export function siteContextTable(): SiteContextTable {
  if (!cached) cached = parseSiteContext(siteContextYaml as unknown as string);
  return cached;
}
