/**
 * API của Module Thiết kế AI — gắn vào Worker `nvg-api` dưới tiền tố `/design`.
 *
 * Vì sao module này CÓ lớp Workers trong khi CLAUDE.md 3.1 bảo phần lớn nghiệp vụ nên gọi
 * thẳng Supabase: nó thoả cả ba điều kiện của quy tắc đó cùng lúc — gọi dịch vụ bên ngoài
 * (mô hình ngôn ngữ, Container tính toán), ghi nhiều bảng phải toàn vẹn cùng lúc (artifact +
 * cạnh lineage + con trỏ bản hiệu lực), và có quy tắc nghiệp vụ vượt khả năng của RLS
 * (điều phối pipeline, chính sách hạng dữ liệu).
 *
 * Phần CRUD thường của module (danh sách dự án, xem đầu bài) vẫn gọi thẳng Supabase từ
 * `web/` như 12 module còn lại. Đừng thêm endpoint ở đây cho việc RLS đã đủ sức làm.
 */

import { Hono } from 'hono';
import { DATA_CLASSES, type DataClass } from '@nvg/shared/design';
import { ContractError } from './contracts';
import { createComputeBackend } from './compute-backend';
import {
  ModelRouter,
  parseModelConfig,
  DataClassViolation,
  ModelNotConfigured,
} from './llm/router';
import { PublishBridge } from './publish';
import { createSourceFileStore, type StoredSource } from './source-files';
import type { DigitiseParams, DigitiseSource } from './workflows/digitise-steps';
import type { DesignEnv } from './env';

// Nạp `config/models.yaml` dạng văn bản. `wrangler.jsonc` khai `rules` kiểu Text cho `*.yaml`
// để esbuild nhúng tệp vào bản dựng — Worker không có hệ tệp để đọc lúc chạy.
import modelsYaml from '../../../config/models.yaml';

export const designApp = new Hono<{ Bindings: DesignEnv }>();

let cachedRouter: ModelRouter | undefined;

/** Router mô hình dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
function modelRouter(env: DesignEnv): ModelRouter {
  if (!cachedRouter) {
    cachedRouter = new ModelRouter(
      parseModelConfig(modelsYaml as unknown as string),
      env.GEMINI_API_KEY,
    );
  }
  return cachedRouter;
}

/**
 * Kiểm tra sống của cả hai runtime.
 *
 * Trả riêng trạng thái lớp tính toán vì đó là thứ hay tắt nhất trong giai đoạn dev (Container
 * chạy bằng Docker tại chỗ) — biết ngay còn hơn để pipeline chạy tới bước 4 mới đứng.
 */
designApp.get('/health', async (c) => {
  const compute = createComputeBackend(c.env);
  return c.json({
    ok: true,
    module: 'design',
    compute: { backend: compute.name, reachable: await compute.health() },
    models: { version: modelRouter(c.env).version },
  });
});

/**
 * Chính sách hạng dữ liệu — cho giao diện biết trước lời gọi nào bị chặn.
 *
 * Không thay thế lớp chặn: `ModelRouter.resolve` vẫn kiểm lại ở đúng thời điểm gọi. Đây chỉ
 * là để không hiện nút rồi mới báo lỗi (AFD 6.5).
 */
designApp.get('/policy/data-class', (c) => {
  const router = modelRouter(c.env);
  const routes = ['layer1_brief', 'layer2_program', 'layer3_intent', 'layer4_facade'];
  return c.json({
    routes: Object.fromEntries(
      routes.map((name) => [
        name,
        Object.fromEntries(DATA_CLASSES.map((dc) => [dc, router.allows(name, dc as DataClass)])),
      ]),
    ),
  });
});

/** Phát hành hồ sơ một bộ môn sang hệ tài liệu. Chạy dưới phiên của chính người ký. */
designApp.post('/publish', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const bridge = new PublishBridge(c.env, token);
  const outcome = await bridge.publish(await c.req.json());
  return c.json(outcome, 201);
});

/**
 * Số hoá một bộ hồ sơ cũ — nhận nhiều bản vẽ, khởi động Workflow, trả mã lượt chạy.
 *
 * Quyền được hỏi CHÍNH CƠ SỞ DỮ LIỆU (`rls_kb_writable`) dưới phiên của người gọi, thay vì
 * chép lại điều kiện ở đây. Nếu viết lại ở tầng Worker thì có hai bản quy tắc sẽ lệch nhau,
 * mà bản trong CSDL mới là bản không vòng qua được (CLAUDE.md 3.4).
 *
 * Endpoint trả về NGAY sau khi lưu tệp và khởi động Workflow: trích một bộ hồ sơ mất hàng
 * chục giây, giữ kết nối chờ là cách chắc chắn để gặp hết giờ ở tầng mạng.
 */
designApp.post('/kb/digitise', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  if (!c.env.DIGITISE_PIPELINE) {
    return c.json(
      {
        error:
          'Chưa cấu hình luồng số hoá. Workflow chỉ chạy trong runtime Workers — dùng `wrangler dev` thay vì gọi trực tiếp.',
        retryable: false,
      },
      503,
    );
  }

  const form = await c.req.formData();
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') {
    return c.json({ error: 'Thiếu phần `meta` mô tả bộ hồ sơ.' }, 400);
  }

  const meta = JSON.parse(rawMeta) as Omit<DigitiseParams, 'sources'> & { levels?: number[] };
  const discipline = meta.discipline ?? 'kien_truc';

  const { createClient } = await import('@supabase/supabase-js');
  const asUser = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const allowed = await asUser.rpc('rls_kb_writable', {
    p_tenant_id: meta.tenantId,
    p_discipline: discipline,
  });
  if (allowed.error) return c.json({ error: 'Không kiểm tra được quyền số hoá hồ sơ.' }, 500);
  if (allowed.data !== true) {
    // Nêu rõ AI xử lý được, không chỉ "không đủ quyền" (CGD 5.5).
    return c.json(
      {
        error: `Không đủ quyền số hoá hồ sơ bộ môn này. Việc này do người có quyền ghi hồ sơ ${discipline} của Phòng Thiết kế thực hiện.`,
      },
      403,
    );
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return c.json({ error: 'Chưa chọn bản vẽ nào để số hoá.' }, 400);

  const store = createSourceFileStore(c.env);
  const stored: StoredSource[] = [];
  const sources: DigitiseSource[] = [];
  for (const [index, file] of files.entries()) {
    const saved = await store.put(file.name, new Uint8Array(await file.arrayBuffer()));
    stored.push(saved);
    sources.push({ uri: saved.uri, name: file.name, level: meta.levels?.[index] ?? index + 1 });
  }

  const params: DigitiseParams = { ...meta, discipline, sources };
  const run = await c.env.DIGITISE_PIPELINE.create({ params });

  return c.json({ runId: run.id, sources: stored }, 202);
});

/**
 * Lỗi hiển thị cho người dùng: nêu VIỆC GÌ không làm được và CẦN LÀM GÌ, không mã HTTP,
 * không vết ngăn xếp (CGD 5.5). Chi tiết kỹ thuật chỉ ghi log.
 */
designApp.onError((error, c) => {
  console.error('design:', error);

  if (error instanceof ContractError) {
    return c.json({ error: error.message, retryable: false }, 422);
  }
  if (error instanceof DataClassViolation) {
    return c.json({ error: error.message, retryable: false }, 403);
  }
  if (error instanceof ModelNotConfigured) {
    return c.json({ error: error.message, retryable: false }, 503);
  }
  if ((error as { retryable?: boolean }).retryable) {
    return c.json({ error: error.message, retryable: true }, 503);
  }
  return c.json({ error: error.message }, 400);
});

export { DesignPipeline } from './workflows/design-pipeline';
export { DigitisePipeline } from './workflows/digitise';
