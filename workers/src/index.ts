/**
 * Worker API tùy chỉnh (Tech Stack 3.2) — Cron Trigger cho NEN-04 và API Module Thiết kế AI.
 *
 * `fetch` phục vụ kiểm tra sống, cộng với API của Module Thiết kế AI dưới tiền tố `/design`
 * (module đó thoả cả ba điều kiện của quy tắc CLAUDE.md 3.1 — xem `src/design/index.ts`).
 * `scheduled` là nơi tác vụ nền chạy — Cron Trigger khai ở `wrangler.jsonc` gọi vào đây.
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { designApp } from './design';
import type { DesignEnv } from './design/env';

type Env = DesignEnv;

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ ok: true, service: 'nvg-api' }));

/**
 * Module Thiết kế AI (TK-10 → TK-17) — xem `src/design/index.ts` để biết vì sao module này
 * cần lớp Workers trong khi 12 module còn lại gọi thẳng Supabase.
 */
app.route('/design', designApp);

function serviceClient(env: Env) {
  // service_role vượt RLS — CHỈ dùng ở đây, không bao giờ trong web/ (CLAUDE.md 5.5).
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Chạy các hàm quét cảnh báo định kỳ (NEN-04). Mỗi hàm tự chịu trách nhiệm không nhắc lại đã
 * xử lý (CGD 3.4) — ở đây chỉ gọi và ghi log, không có logic nghiệp vụ nào lặp lại từ SQL.
 *
 * 3/4 loại NEN-04 chạy qua CRON QUÉT ở đây (giấy tờ nhân sự — NS-10; công nợ phải thu quá hạn
 * — KT-04; việc chờ phê duyệt để lâu — 0072). Chi phí vượt ngân sách (TC-05) là loại còn lại
 * nhưng KHÔNG cần thêm vào mảng này — nó đã báo NGAY bằng trigger `budget_overrun_alert()`
 * (0035, vá ở 0067), không cần đợi quét đêm. "Hồ sơ thiếu chứng từ" (PRD NEN-04) và việc quá
 * hạn KHÔNG gắn phê duyệt (chờ quyết định bảng `tasks`, BUILD_PLAN.md 4D) vẫn chưa có cơ chế.
 */
const SCAN_FUNCTIONS = [
  'scan_hr_document_reminders',
  'scan_receivable_reminders',
  'scan_pending_approval_reminders',
] as const;

export async function runScheduledScans(env: Env): Promise<Record<string, number | string>> {
  const supabase = serviceClient(env);
  const results: Record<string, number | string> = {};

  for (const fn of SCAN_FUNCTIONS) {
    const { data, error } = await supabase.rpc(fn);
    results[fn] = error ? `lỗi: ${error.message}` : (data as number);
  }

  return results;
}

export { DesignPipeline, DigitisePipeline } from './design';

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledScans(env).then((results) => {
        console.log('NEN-04 — kết quả quét cảnh báo định kỳ:', JSON.stringify(results));
      }),
    );
  },
};
