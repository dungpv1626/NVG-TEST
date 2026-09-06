/**
 * Điểm nạp `config/models.yaml` và nơi dựng client mô hình ngôn ngữ.
 *
 * Tách khỏi `design/index.ts` vì Workflow cũng cần client, mà Workflow lại được `index.ts`
 * xuất ra — để việc nạp cấu hình ở đó thì hai tệp import vòng nhau.
 */

import modelsYaml from '../../../../config/models.yaml';
import type { DesignEnv } from '../env';
import { GeminiClient } from './gemini';
import { PollinationsImageClient } from './pollinations';
import type { RenderImageClient } from '../render/render';
import { RENDER_ROUTE } from '../render/render';
import { ModelRouter, parseModelConfig } from './router';

let cachedRouter: ModelRouter | undefined;

/** Router dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function modelRouter(env: DesignEnv): ModelRouter {
  if (!cachedRouter) {
    cachedRouter = new ModelRouter(parseModelConfig(modelsYaml as unknown as string), {
      gemini: env.GEMINI_API_KEY,
      pollinations: env.POLLINATIONS_API_KEY,
    });
  }
  return cachedRouter;
}

/**
 * Client Gemini, hoặc `undefined` khi chưa có khoá.
 *
 * Trả `undefined` thay vì ném lỗi: các bước dùng mô hình ngôn ngữ đều là PHỤ TRỢ (PRD 5.1),
 * nên thiếu khoá phải làm mất tính năng chứ không chặn luồng chính. Bước nào thật sự không
 * chạy nổi khi thiếu mô hình thì tự nói ra, ngay tại chỗ nó cần.
 */
export function geminiClient(env: DesignEnv): GeminiClient | undefined {
  return env.GEMINI_API_KEY ? new GeminiClient(modelRouter(env)) : undefined;
}

/**
 * Client dựng ảnh phối cảnh, chọn theo `provider` của tuyến trong `config/models.yaml`.
 *
 * Đổi nhà cung cấp là sửa MỘT dòng cấu hình, không sửa mã gọi và không sửa giao diện — đó là
 * lý do `renderFromMassing` nhận một interface chứ không nhận `GeminiClient`.
 *
 * Thiếu khoá thì trả `undefined` (giống `geminiClient`): mất tính năng chứ không chặn luồng
 * chính, và màn hình tự nói ra lý do đọc được.
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
