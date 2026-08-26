/**
 * Dọn dữ liệu test — chạy MỘT LẦN sau khi toàn bộ tệp test kết thúc.
 *
 * Vì sao không để `afterAll` trong từng tệp: Vitest chạy các tệp test SONG SONG. Tệp nào kết
 * thúc trước sẽ xóa mọi bản ghi mang tiền tố test — kể cả bản ghi mà tệp khác đang dùng dở.
 * Lỗi kiểu đó không lặp lại đều đặn (phụ thuộc tệp nào xong trước) nên rất tốn công truy.
 */

import { cleanupTestData, hasCredentials } from './helpers';

export async function setup(): Promise<void> {
  // Không có gì cần chuẩn bị — dữ liệu nền do `npm run db:seed` tạo.
}

export async function teardown(): Promise<void> {
  if (!hasCredentials) return;
  await cleanupTestData();
}
