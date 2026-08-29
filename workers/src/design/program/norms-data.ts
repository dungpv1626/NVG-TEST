/**
 * Điểm nạp DUY NHẤT của `kb/space_norms.yaml` vào bản dựng Worker.
 *
 * Cùng khuôn với `kb/vocabulary-data.ts`: Worker không có hệ tệp lúc chạy nên tệp dữ liệu
 * phải nhúng vào bản dựng dưới dạng văn bản. Tách khỏi `norms.ts` để phần phân tích và kiểm
 * tra định dạng kiểm thử được bằng dữ liệu tự dựng.
 */

import normsYaml from '../../../../kb/space_norms.yaml';
import { parseSpaceNorms, type SpaceNorms } from './norms';

let cached: SpaceNorms | undefined;

/** Chuẩn diện tích dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function spaceNorms(): SpaceNorms {
  if (!cached) cached = parseSpaceNorms(normsYaml as unknown as string);
  return cached;
}
