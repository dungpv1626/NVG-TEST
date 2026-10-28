/**
 * Điểm nạp DUY NHẤT của `kb/style_catalogue.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import catalogueYaml from '../../../../kb/style_catalogue.yaml';
import type { StyleCatalogue } from '@nvg/shared/design';
import { facadeVocabulary } from './facade-vocabulary-data';
import { parseStyleCatalogue } from './style-catalogue';

let cached: StyleCatalogue | undefined;

export function styleCatalogue(): StyleCatalogue {
  if (!cached) cached = parseStyleCatalogue(catalogueYaml as unknown as string, facadeVocabulary());
  return cached;
}
