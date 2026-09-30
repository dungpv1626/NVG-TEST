import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// `.env` nằm ở gốc repo, không phải trong db/ — npm workspaces chạy script từ db/.
config({ path: new URL('../.env', import.meta.url).pathname });

// Cùng chốt chặn với `src/env.ts`, viết lại tại chỗ vì drizzle-kit nạp tệp cấu hình bằng bộ nạp
// riêng. Drizzle Kit (`push`, `studio`, `generate`) KHÔNG BAO GIỜ được chạm bản demo: `push` bỏ
// qua migration và sửa thẳng cấu trúc bảng. Bản demo chỉ nhận migration qua `npm run db:migrate:demo`.
const DEMO_PROJECT_REF = 'awaiwegmuykhctnysvou';
if (process.env.DATABASE_URL?.includes(DEMO_PROJECT_REF)) {
  throw new Error(
    '`.env` đang trỏ vào bản chạy thử / demo trên cloud. Drizzle Kit chỉ chạy trên Supabase tại máy; ' +
      'bản demo chỉ nhận migration qua `npm run db:migrate:demo`.',
  );
}

/**
 * Cấu hình Drizzle Kit.
 *
 * Tech Stack Mục 4.1 + 5.2: mọi thay đổi cấu trúc bảng phải qua migration có kiểm soát
 * phiên bản trong Git — KHÔNG sửa trực tiếp qua giao diện Supabase.
 *
 * Dùng cổng 5432 (kết nối trực tiếp), không dùng 6543 (pooler) vì pooler
 * không hỗ trợ đầy đủ các lệnh DDL cần cho migration.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Supabase quản lý các schema này — Drizzle không được đụng vào.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
