/**
 * Điểm nạp DUY NHẤT của `kb/render_prompts.yaml` vào bản dựng Worker — cùng khuôn với
 * `layout/site-context-data.ts`.
 */

import { load } from 'js-yaml';
import renderPromptsYaml from '../../../../kb/render_prompts.yaml';
import { parseRenderPrompts, type RenderPrompts } from './render';

let cached: RenderPrompts | undefined;

export function renderPrompts(): RenderPrompts {
  if (!cached) cached = parseRenderPrompts(load(renderPromptsYaml as unknown as string));
  return cached;
}
