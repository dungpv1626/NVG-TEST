/**
 * Kết nối cơ sở dữ liệu cho tiến trình chạy trên Node (migration, seed, script quản trị).
 *
 * ⚠️ KHÔNG dùng file này trong `web/` hay `workers/`:
 *  - `web/` gọi Supabase qua `@supabase/supabase-js` với anon key, bị RLS giới hạn hoàn toàn.
 *  - `workers/` chạy trên môi trường Cloudflare, dùng Supabase client với service_role key
 *    cho tác vụ hệ thống (Tech Stack 5.6).
 *
 * Kết nối trực tiếp bằng chuỗi `DATABASE_URL` này bỏ qua RLS (vai trò `postgres`),
 * nên chỉ dùng cho thao tác quản trị có chủ đích.
 */

import './env';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export function createConnection(connectionString?: string) {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Thiếu DATABASE_URL. Sao chép .env.example thành .env và điền chuỗi kết nối Supabase.',
    );
  }

  // `max: 1` cho migration/seed: các lệnh DDL phải chạy tuần tự trên cùng một kết nối.
  const sql = postgres(url, { max: 1, prepare: false });
  return { sql, db: drizzle(sql, { schema }) };
}

export type Database = ReturnType<typeof createConnection>['db'];
