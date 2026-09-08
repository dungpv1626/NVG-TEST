/**
 * Điểm nạp `config/models.yaml` và nơi dựng client mô hình.
 *
 * Tách khỏi `design/index.ts` vì Workflow cũng cần client, mà Workflow lại được `index.ts`
 * xuất ra — để việc nạp cấu hình ở đó thì hai tệp import vòng nhau.
 *
 * Đây là nơi DUY NHẤT đọc khoá từ `env`: mỗi nhà cung cấp một biến, và khoá đi thẳng vào
 * `ModelRouter` — không client nào cầm khoá riêng.
 */

import modelsYaml from '../../../../config/models.yaml';
import type { DesignEnv } from '../env';
import { AnthropicClient } from './anthropic';
import { GeminiClient, LlmCallFailed } from './gemini';
import { OpenAiClient } from './openai';
import { PollinationsImageClient } from './pollinations';
import type { RenderImageClient } from '../render/render';
import { RENDER_ROUTE } from '../render/render';
import { ModelRouter, parseModelConfig } from './router';
import type { AiImageClient, TextModelClient } from './text-client';

let cachedRouter: ModelRouter | undefined;

/** Router dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function modelRouter(env: DesignEnv): ModelRouter {
  if (!cachedRouter) {
    cachedRouter = new ModelRouter(parseModelConfig(modelsYaml as unknown as string), {
      gemini: env.GEMINI_API_KEY,
      pollinations: env.POLLINATIONS_API_KEY,
      openai: env.OPENAI_API_KEY,
      anthropic: env.ANTHROPIC_API_KEY,
      // Gemini TRẢ PHÍ là một "nhà cung cấp" riêng về mặt chính sách dữ liệu: cùng API, khác
      // khoá, khác cam kết. Không bao giờ cấp khoá miễn phí cho tuyến hạng 2.
      gemini_paid: env.GEMINI_PAID_API_KEY,
    });
  }
  return cachedRouter;
}

/** Chỉ cho kiểm thử: ép nạp lại cấu hình với env khác. Không gọi trong mã chạy thật. */
export function resetModelRouterForTests(): void {
  cachedRouter = undefined;
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

/**
 * Client VĂN BẢN cho một tuyến `ai_text_*` — người dùng chọn tuyến, tuyến chọn nhà cung cấp.
 *
 * Trình duyệt chỉ gửi TÊN TUYẾN; tên đó phải có trong `config/models.yaml`, nên không có cách
 * nào đưa một tên mô hình tự do xuống đây (hàng rào 2 của kế hoạch nhánh AI).
 */
export function textClientFor(env: DesignEnv, routeName: string): TextModelClient | undefined {
  const router = modelRouter(env);
  switch (router.providerOf(routeName)) {
    case 'gemini':
      return env.GEMINI_API_KEY ? new GeminiClient(router) : undefined;
    case 'gemini_paid':
      return env.GEMINI_PAID_API_KEY ? new GeminiClient(router) : undefined;
    case 'openai':
      return env.OPENAI_API_KEY ? new OpenAiClient(router) : undefined;
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? new AnthropicClient(router) : undefined;
    default:
      return undefined;
  }
}

/** Client ẢNH cho một tuyến `ai_image_*` (hoặc tuyến phối cảnh cũ). Anthropic không sinh ảnh. */
export function imageClientFor(env: DesignEnv, routeName: string): AiImageClient | undefined {
  const router = modelRouter(env);
  switch (router.providerOf(routeName)) {
    case 'gemini':
      return env.GEMINI_API_KEY ? new GeminiClient(router) : undefined;
    case 'gemini_paid':
      return env.GEMINI_PAID_API_KEY ? new GeminiClient(router) : undefined;
    case 'openai':
      return env.OPENAI_API_KEY ? new OpenAiClient(router) : undefined;
    case 'pollinations': {
      if (!env.POLLINATIONS_API_KEY) return undefined;
      // Pollinations nhận đúng MỘT ảnh vào — bọc lại cho vừa giao diện chung, và nói ra khi
      // lớp gọi đưa nhiều hơn thay vì lặng lẽ bỏ bớt.
      const inner = new PollinationsImageClient(router);
      return {
        async generateImage(route, dataClass, options) {
          const [image, ...rest] = options.images;
          if (!image || rest.length) {
            throw new LlmCallFailed(
              `Nhà cung cấp của tuyến "${route}" chỉ nhận đúng một ảnh vào (đang gửi ${options.images.length}).`,
              false,
            );
          }
          const started = Date.now();
          const out = await inner.generateImage(route, dataClass, {
            system: options.system,
            prompt: options.prompt,
            image,
          });
          return {
            ...out,
            provider: 'pollinations',
            model: router.publicRoutes().find((r) => r.route === route)?.model ?? '',
            usage: { inputTokens: null, outputTokens: null },
            latencyMs: Date.now() - started,
          };
        },
      };
    }
    default:
      return undefined;
  }
}
