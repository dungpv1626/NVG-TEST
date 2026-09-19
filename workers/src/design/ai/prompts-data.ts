/**
 * Điểm nạp DUY NHẤT của `kb/ai_design_prompts.yaml` vào bản dựng Worker — cùng khuôn với
 * `render/prompts-data.ts`.
 */

import { load } from 'js-yaml';
import promptsYaml from '../../../../kb/ai_design_prompts.yaml';
import { parseAiPrompts, type AiPrompts } from './prompts';

let cached: AiPrompts | undefined;

export function aiPrompts(): AiPrompts {
  if (!cached) cached = parseAiPrompts(load(promptsYaml as unknown as string));
  return cached;
}
