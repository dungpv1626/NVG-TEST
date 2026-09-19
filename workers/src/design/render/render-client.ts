/**
 * Client sinh ảnh cho tuyến phối cảnh CŨ của bộ giải (`layer5_render`).
 *
 * Tách khỏi `llm/factory.ts` ngày 09/09/2026: `factory.ts` là hạ tầng dùng chung, nhánh AI
 * gọi nó suốt; để hàm này ở đó thì `llm/` import ngược lên `render/`, tức hạ tầng dùng chung
 * phụ thuộc vào một mảnh của bộ giải. Hôm xoá bộ giải sẽ kéo theo nhánh AI (T15).
 *
 * Tệp này thuộc BỘ GIẢI và sẽ bị xoá cùng nó.
 */

import type { DesignEnv } from '../env';
import { GeminiClient } from '../llm/gemini';
import { modelRouter } from '../llm/factory';
import { PollinationsImageClient } from '../llm/pollinations';
import { RENDER_ROUTE, type RenderImageClient } from './render';

/**
 * Client sinh ảnh phối cảnh — chọn theo `provider` của tuyến, không gắn cứng một hãng. Đó là
 * lý do `renderFromMassing` nhận một interface chứ không nhận `GeminiClient`.
 *
 * Thiếu khoá thì trả `undefined`: mất tính năng chứ không chặn luồng chính, và màn hình tự
 * nói ra lý do đọc được.
 */
export function renderImageClient(env: DesignEnv): RenderImageClient | undefined {
  const router = modelRouter(env);
  switch (router.providerOf(RENDER_ROUTE)) {
    case 'pollinations':
      return env.POLLINATIONS_API_KEY ? new PollinationsImageClient(router) : undefined;
    case 'gemini':
      return env.GEMINI_API_KEY ? new GeminiClient(router) : undefined;
    default:
      return undefined;
  }
}
