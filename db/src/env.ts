/**
 * Nạp biến môi trường từ `.env` ở GỐC repo.
 *
 * Cần thiết vì npm workspaces chạy script với thư mục làm việc là `db/`, trong khi
 * `.env` nằm ở gốc — `import 'dotenv/config'` mặc định sẽ không tìm thấy.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

const repoRootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
config({ path: repoRootEnv });

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
