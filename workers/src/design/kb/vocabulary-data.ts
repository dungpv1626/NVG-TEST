/**
 * Điểm nạp DUY NHẤT của `kb/room_vocabulary.yaml` vào bản dựng Worker.
 *
 * Tách khỏi `vocabulary.ts` để phần logic tra cứu kiểm thử được bằng dữ liệu tự dựng, không
 * phải kéo theo cơ chế nhúng tệp của esbuild. Cùng khuôn với `config/models.yaml` ở
 * `design/index.ts`: Worker không có hệ tệp lúc chạy nên tệp dữ liệu phải nhúng vào bản dựng.
 */

import vocabularyYaml from '../../../../kb/room_vocabulary.yaml';
import { parseVocabulary, VocabularyIndex } from './vocabulary';

let cached: VocabularyIndex | undefined;

/** Bảng tra dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function roomVocabulary(): VocabularyIndex {
  if (!cached) cached = new VocabularyIndex(parseVocabulary(vocabularyYaml as unknown as string));
  return cached;
}
