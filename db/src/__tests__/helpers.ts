/**
 * Tiện ích cho bộ test RLS.
 *
 * Nguyên tắc: test PHẢI đăng nhập bằng tài khoản thật với anon key, KHÔNG dùng
 * service_role — service_role vượt qua RLS nên test bằng nó không chứng minh được gì.
 */

import '../env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SEED_PASSWORD } from '../seed/data';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

export const hasCredentials = Boolean(url && anonKey);

/** Client chưa đăng nhập — dùng để khẳng định vai trò `anon` không đọc được gì. */
export function anonClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Đăng nhập bằng tài khoản seed và trả về client đã xác thực. */
export async function signInAs(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (error) {
    throw new Error(
      `Không đăng nhập được ${email}: ${error.message}. Đã chạy "npm run db:seed" chưa?`,
    );
  }
  return client;
}

/** Email tài khoản seed, gom lại để test không rải chuỗi khắp nơi. */
export const ACCOUNTS = {
  tgd: 'tgd@nhavietgroup.test',
  cfo: 'cfo@nhavietgroup.test',
  admin: 'admin@nhavietgroup.test',
  kinhDoanhNvc: 'kinhdoanh.nvc@nhavietgroup.test',
  kinhDoanhNvo: 'kinhdoanh.nvo@nhavietgroup.test',
  thietKeNvo: 'thietke.nvo@nhavietgroup.test',
  kho: 'kho@nhavietgroup.test',
  ketoan: 'ketoan@nhavietgroup.test',
} as const;

/** Bảng nghiệp vụ mà vai trò `anon` KHÔNG BAO GIỜ được đọc. */
export const PROTECTED_TABLES = [
  'companies',
  'users',
  'roles',
  'permissions',
  'user_companies',
  'approval_limits',
] as const;

/** Mã lỗi Postgres cho "insufficient_privilege" — RLS chặn thành công. */
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

/** Tiền tố đặt cho mọi bản ghi do test tạo ra, để dọn sạch được sau khi chạy. */
export const TEST_PREFIX = '[TEST]';

/**
 * Xóa CỨNG các bản ghi do test tạo ra, qua kết nối trực tiếp (bỏ qua RLS).
 *
 * Cần thiết vì bản thân RLS chặn xóa cứng từ trình duyệt, và một số bản ghi sau khi
 * bàn giao thì chính người tạo cũng không sửa được nữa — nếu chỉ xóa mềm bằng tài khoản
 * thường thì dữ liệu test sẽ tích tụ trong cơ sở dữ liệu phát triển.
 */
export async function cleanupTestData(): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`DELETE FROM opportunities WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM documents WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}`;
  } finally {
    await sql.end();
  }
}
