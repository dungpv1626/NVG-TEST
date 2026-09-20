/**
 * Điểm nạp DUY NHẤT của `kb/facade_vocabulary.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import vocabularyYaml from '../../../../kb/facade_vocabulary.yaml';
import { parseFacadeVocabulary, type FacadeVocabulary } from './facade-vocabulary';

let cached: FacadeVocabulary | undefined;

export function facadeVocabulary(): FacadeVocabulary {
  if (!cached) cached = parseFacadeVocabulary(vocabularyYaml as unknown as string);
  return cached;
}
