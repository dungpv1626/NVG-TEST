/**
 * Điểm nạp `config/models.yaml` và nơi dựng client mô hình ngôn ngữ.
 *
 * Tách khỏi `design/index.ts` vì Workflow cũng cần client, mà Workflow lại được `index.ts`
 * xuất ra — để việc nạp cấu hình ở đó thì hai tệp import vòng nhau.
 */

import modelsYaml from '../../../../config/models.yaml';
import type { DesignEnv } from '../env';
import { GeminiClient } from './gemini';
import { ModelRouter, parseModelConfig } from './router';

let cachedRouter: ModelRouter | undefined;

/** Router dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function modelRouter(env: DesignEnv): ModelRouter {
  if (!cachedRouter) {
    cachedRouter = new ModelRouter(
      parseModelConfig(modelsYaml as unknown as string),
      env.GEMINI_API_KEY,
    );
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
