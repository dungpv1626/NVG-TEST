/**
 * Kết nối cho trình nạp dữ liệu demo.
 *
 * Mọi lượt ghi đi bằng anon key + tài khoản seed đã đăng nhập — đúng đường giao diện đi, qua
 * RLS và qua các hàm nghiệp vụ. Không dùng service_role, không chèn thẳng bảng: dữ liệu demo
 * phải là dữ liệu mà người dùng thật tạo ra được, với mã, phê duyệt, ngân sách nhất quán.
 *
 * Cố ý KHÔNG import `__tests__/helpers`: trình nạp không phải bộ kiểm thử, và `env.ts` chặn
 * bộ kiểm thử chạy trên bản demo.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SEED_PASSWORD } from '../seed/data';

const sessions = new Map<string, SupabaseClient>();

export async function signIn(email: string): Promise<SupabaseClient> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Thiếu SUPABASE_URL / SUPABASE_ANON_KEY.');
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (error) throw new Error(`Không đăng nhập được ${email}: ${error.message}`);
  sessions.set(email, client);
  return client;
}

/** Dừng ngay kèm tên bước — đọc log là biết luồng đứt ở đâu. */
export function check<T>(step: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${step}: ${result.error.message}`);
  return result.data;
}

export async function one<T = unknown>(
  step: string,
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${step}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${step}: không có dữ liệu trả về.`);
  return data as T;
}

export async function userId(client: SupabaseClient): Promise<string> {
  return check('đọc người dùng', await client.rpc('auth_user_id')) as string;
}

export async function companyId(client: SupabaseClient, code: string): Promise<string> {
  const row = await one(
    `tìm pháp nhân ${code}`,
    client.from('companies').select('id').eq('code', code).single(),
  );
  return (row as { id: string }).id;
}

export async function nextCode(client: SupabaseClient, company: string, type: string) {
  return check(
    `cấp mã ${type}`,
    await client.rpc('next_record_code', { p_company_code: company, p_record_type: type }),
  ) as string;
}

/** Ngày theo giờ Việt Nam, lệch `offsetDays` so với hôm nay, dạng `yyyy-MM-dd`. */
export function day(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export const ACCOUNTS = {
  tgd: 'tgd@nhavietgroup.test',
  cfo: 'cfo@nhavietgroup.test',
  kinhDoanhNvc: 'kinhdoanh.nvc@nhavietgroup.test',
  kinhDoanhNvo: 'kinhdoanh.nvo@nhavietgroup.test',
  dauThauNvc: 'dauthau.nvc@nhavietgroup.test',
  thietKeNvo: 'thietke.nvo@nhavietgroup.test',
  truongPhongTc: 'congtruong.nvc@nhavietgroup.test',
  chiHuyTruong: 'chihuytruong.nvc@nhavietgroup.test',
  muaHang: 'muahang@nhavietgroup.test',
  kho: 'kho@nhavietgroup.test',
  ketoan: 'ketoan@nhavietgroup.test',
} as const;
