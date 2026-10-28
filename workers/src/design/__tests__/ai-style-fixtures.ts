/**
 * Bộ đặc trưng phong cách (`kb/style_catalogue.yaml`, T175) cho phép thử — đọc thẳng tệp như bản dựng
 * Worker, và gắn hai bảng phong cách vào lời dẫn ảnh đúng như `aiPrompts()` làm lúc nạp.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiPrompts } from '../ai/prompts';
import { withStylePrompts } from '../ai/prompts';
import { parseFacadeVocabulary } from '../kb/facade-vocabulary';
import { parseStyleCatalogue } from '../kb/style-catalogue';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

export const styleCatalogueYaml = read('kb/style_catalogue.yaml');
export const styleCat = parseStyleCatalogue(
  styleCatalogueYaml,
  parseFacadeVocabulary(read('kb/facade_vocabulary.yaml')),
);

/** Lời dẫn đã gắn bảng phong cách — cùng phép `aiPrompts()` của bản dựng Worker. */
export const withStyles = (prompts: AiPrompts): AiPrompts => withStylePrompts(prompts, styleCat);
