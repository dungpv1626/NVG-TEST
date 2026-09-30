/**
 * Nạp biến môi trường từ GỐC repo, và chặn mọi tiến trình chạm nhầm bản chạy thử / demo.
 *
 * Cần nạp tay vì npm workspaces chạy script với thư mục làm việc là `db/`, trong khi `.env`
 * nằm ở gốc — `import 'dotenv/config'` mặc định sẽ không tìm thấy.
 *
 * ── Hai môi trường (C-1, tách 30/09/2026) ─────────────────────────────────────────────
 *
 *  · `.env`       → Supabase CHẠY TẠI MÁY (`npm run db:start`). Mặc định của mọi lệnh.
 *  · `.env.demo`  → project cloud sau `nvg.tests99.workers.dev`. Chỉ nạp khi gọi tường minh
 *                   `NVG_DB_TARGET=demo` — tức `npm run db:migrate:demo` lúc phát hành.
 *
 * Trước ngày tách, máy phát triển và bản công khai dùng CHUNG một CSDL: `db:migrate` ở máy là
 * đổi luôn bản công khai, và `cleanupTestData` xoá CỨNG trên đó. Hai chốt dưới đây giữ cho điều
 * ấy không quay lại chỉ vì ai đó dán nhầm chuỗi kết nối vào `.env`:
 *
 *  1. Bộ kiểm thử KHÔNG BAO GIỜ chạy trên bản demo, kể cả khi gọi tường minh.
 *  2. Tiến trình khác (migration, seed, script) chỉ chạm bản demo khi được gọi tường minh.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

/** Mã project cloud của bản chạy thử / demo. Không phải bí mật — nằm sẵn trong địa chỉ công khai. */
export const DEMO_PROJECT_REF = 'awaiwegmuykhctnysvou';

export const DB_TARGET: 'dev' | 'demo' = process.env.NVG_DB_TARGET === 'demo' ? 'demo' : 'dev';

const envFile = DB_TARGET === 'demo' ? '../../.env.demo' : '../../.env';
config({ path: fileURLToPath(new URL(envFile, import.meta.url)) });

const pointsAtDemo = [process.env.DATABASE_URL, process.env.SUPABASE_URL].some((v) =>
  v?.includes(DEMO_PROJECT_REF),
);

if (pointsAtDemo && process.env.VITEST) {
  throw new Error(
    'Bộ kiểm thử đang trỏ vào bản chạy thử / demo trên cloud — dừng lại. Kiểm thử xoá cứng dữ liệu. ' +
      'Trỏ `.env` về Supabase tại máy (`npm run db:start`) rồi chạy lại.',
  );
}
if (pointsAtDemo && DB_TARGET !== 'demo') {
  throw new Error(
    '`.env` đang trỏ vào bản chạy thử / demo trên cloud. Lệnh thường chỉ chạy trên Supabase tại máy; ' +
      'muốn áp migration lên bản demo thì dùng `npm run db:migrate:demo`.',
  );
}
if (DB_TARGET === 'demo' && !pointsAtDemo) {
  throw new Error(
    'Đã chọn bản demo (`NVG_DB_TARGET=demo`) nhưng `.env.demo` không trỏ vào project demo.',
  );
}

/** Đọc biến bắt buộc, báo lỗi rõ ràng nếu thiếu thay vì để lỗi mơ hồ ở tầng dưới. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường ${name}. Sao chép .env.example thành .env ở gốc repo và điền giá trị.`,
    );
  }
  return value;
}
