/**
 * Áp dụng migration Drizzle lên cơ sở dữ liệu.
 *
 * Tech Stack Mục 5.2: cấu trúc dữ liệu ở mọi môi trường phải được tạo từ CÙNG một lịch sử
 * thay đổi — KHÔNG sửa tay trực tiếp trên Supabase Cloud.
 *
 * Trước khi chạy trên production: xác nhận đã có bản sao lưu gần nhất
 * (Implementation Plan Mục 5.4).
 */

import './env';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createConnection } from './client';

async function main() {
  const target = process.env.DATABASE_URL?.match(/@([^:/]+)/)?.[1] ?? 'không rõ';
  console.log(`Áp dụng migration lên: ${target}`);

  const { sql, db } = createConnection();
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
    console.log('Hoàn tất: tất cả migration đã được áp dụng.');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('Migration thất bại:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
