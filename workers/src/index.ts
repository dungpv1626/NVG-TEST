/**
 * Worker API tùy chỉnh (Tech Stack 3.2) — Cron Trigger cho NEN-04 và API Module Thiết kế AI.
 *
 * `fetch` phục vụ kiểm tra sống, cộng với API của Module Thiết kế AI dưới tiền tố `/design`
 * (module đó thoả cả ba điều kiện của quy tắc CLAUDE.md 3.1 — xem `src/design/index.ts`).
 * `scheduled` là nơi tác vụ nền chạy — Cron Trigger khai ở `wrangler.jsonc` gọi vào đây.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClient } from '@supabase/supabase-js';
import { designApp } from './design';
import type { DesignEnv } from './design/env';

type Env = DesignEnv;

const app = new Hono<{ Bindings: Env }>();

/**
 * Chia sẻ tài nguyên khác nguồn.
 *
 * Bắt buộc phải có: giao diện chạy trên một Worker khác (`nvg`, Static Assets) còn API nằm ở
 * Worker này, nên MỌI lời gọi từ trình duyệt đều là khác nguồn. Thiếu lớp này thì trình duyệt
 * chặn ngay từ bước hỏi trước (`OPTIONS`), và thứ hiện ra trên màn hình là "không kết nối
 * được" — không phân biệt được với mất mạng. Đã xảy ra thật: cả lớp API của Module Thiết kế
 * chưa từng gọi được từ trình duyệt cho tới khi thêm đoạn này.
 *
 * Danh sách nguồn là DỮ LIỆU (`ALLOWED_ORIGINS`, ngăn cách bằng dấu phẩy), không phải hằng số:
 * tên miền chính thức của NVG còn chưa chốt (CLAUDE.md 6.6), và địa chỉ bản chạy thử đổi theo
 * môi trường. Để trống thì chỉ cho phép máy phát triển — mặc định phải là mức HẸP nhất.
 *
 * KHÔNG dùng `*`: mọi endpoint ở đây nhận thẻ đăng nhập qua tiêu đề `Authorization`, và mở cho
 * mọi nguồn là mời bất kỳ trang nào cũng gọi được API bằng thẻ họ lấy được.
 */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      const configured = (c.env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value: string) => value.trim())
        .filter(Boolean);
      const allowed = configured.length ? configured : DEV_ORIGINS;
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    // Tên tệp tải về (DXF, XLSX) nằm ở header này; không khai thì trình duyệt không đọc được
    // và mọi tệp rơi về một tên mặc định.
    //
    // `X-Sheet-*`: tỷ lệ và hướng giấy do BỘ VẼ chọn, và thân phản hồi là SVG nên không cài
    // thêm trường được. Giao diện và API khác nguồn nhau (Worker `nvg` so với `nvg-api`), nên
    // header không khai ở đây sẽ đọc ra `null` mà KHÔNG có lỗi nào — chip «Tỷ lệ 1:50» biến
    // mất và không ai biết vì sao.
    //
    // `X-Anchor-*`: cỡ ảnh neo, tính bằng điểm ảnh (T57). Cái bẫy ở trên đã sập thật ngày
    // 19/09/2026 — quên khai hai tên này thì trình duyệt không đặt được cỡ canvas và lượt vẽ
    // dừng trước khi gọi mô hình. Có phép thử canh danh sách này khớp với header các tuyến
    // thật sự đặt (`cors-expose.test.ts`), vì đây là loại lệch mà không mã nào ở hai phía nhìn
    // thấy được.
    //
    // `X-NVG-Contracts`: dấu vân tay hợp đồng dữ liệu của bản dựng (T69). Giao diện đối chiếu
    // với bản của chính nó để phát hiện hai bên chạy lệch phiên bản; không khai ở đây thì phép
    // đối chiếu luôn đọc ra `null` và im lặng bỏ qua — đúng thứ nó sinh ra để bắt.
    exposeHeaders: [
      'Content-Disposition',
      'X-NVG-Contracts',
      'X-Sheet-Scale',
      'X-Sheet-Orientation',
      'X-Anchor-Width',
      'X-Anchor-Height',
    ],
    maxAge: 600,
  }),
);

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

export { AiDesignPipeline, DigitisePipeline } from './design';

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
