import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

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
