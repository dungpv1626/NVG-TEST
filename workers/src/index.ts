/**
 * Worker API tùy chỉnh (Tech Stack 3.2) — hiện chỉ có Cron Trigger cho NEN-04, chưa có endpoint
 * REST nào (chưa nghiệp vụ nào trong BSD 4.1→4.12 cần lớp này, theo quy tắc CLAUDE.md 3.1).
 *
 * `fetch` chỉ phục vụ kiểm tra sống (Cloudflare cần một handler fetch để deploy Worker, và một
 * route kiểm tra sống giúp xác nhận Worker đã lên chứ không tự dựng thêm nghiệp vụ gì).
 * `scheduled` là nơi thật sự chạy — Cron Trigger khai ở `wrangler.jsonc` gọi vào đây.
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.json({ ok: true, service: 'nvg-api' }));

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
 * 2/4 loại NEN-04 đã có hàm quét (giấy tờ nhân sự — NS-10; công nợ phải thu quá hạn — KT-04).
 * Hai loại còn lại (việc quá hạn xử lý, chi phí vượt ngân sách) chưa có hàm quét — thêm vào
 * mảng này khi có (BUILD_PLAN.md 4D).
 */
const SCAN_FUNCTIONS = ['scan_hr_document_reminders', 'scan_receivable_reminders'] as const;

export async function runScheduledScans(env: Env): Promise<Record<string, number | string>> {
  const supabase = serviceClient(env);
  const results: Record<string, number | string> = {};

  for (const fn of SCAN_FUNCTIONS) {
    const { data, error } = await supabase.rpc(fn);
    results[fn] = error ? `lỗi: ${error.message}` : (data as number);
  }

  return results;
}

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
