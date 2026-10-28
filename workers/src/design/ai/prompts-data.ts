/**
 * Điểm nạp DUY NHẤT của `kb/ai_design_prompts.yaml` vào bản dựng Worker — cùng khuôn với
 * `render/prompts-data.ts`.
 */

import { load } from 'js-yaml';
import promptsYaml from '../../../../kb/ai_design_prompts.yaml';
import { styleCatalogue } from '../kb/style-catalogue-data';
import { parseAiPrompts, withStylePrompts, type AiPrompts } from './prompts';

let cached: AiPrompts | undefined;

export function aiPrompts(): AiPrompts {
  // Bảng phong cách của lời dẫn ảnh dựng từ `kb/style_catalogue.yaml` (T175) — một nguồn.
  if (!cached) {
    cached = withStylePrompts(
      parseAiPrompts(load(promptsYaml as unknown as string)),
      styleCatalogue(),
    );
  }
  return cached;
}
