/**
 * Quản trị hệ thống — phần cần `service_role` (NEN-02).
 *
 * `POST /admin/users`: tạo tài khoản mới. Danh tính đăng nhập trong Supabase Auth chỉ
 * `service_role` tạo được, nên việc này không thể làm thẳng từ trình duyệt như phần còn lại
 * của màn hình Người dùng. Ba bước, theo thứ tự:
 *
 *   1. hỏi CSDL người bấm có phải Quản trị hệ thống (`can_manage_accounts`, bằng JWT của họ);
 *   2. tạo danh tính đăng nhập với mật khẩu tạm (`service_role`);
 *   3. ghi hồ sơ + vai trò chính (`create_account_profile`, lại bằng JWT của họ — hàm tự kiểm
 *      quyền lần nữa và ghi đúng người tạo).
 *
 * Bước 3 hỏng thì XOÁ danh tính vừa tạo ở bước 2: một danh tính đăng nhập không có hồ sơ là
 * tài khoản ma — đăng nhập được mà không thấy gì, và chiếm luôn email đó.
 *
 * Mật khẩu tạm trả về đúng một lần trong phản hồi, không ghi vào nhật ký hay CSDL.
 */

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { generateTemporaryPassword, newAccountSchema, type CreatedAccount } from '@nvg/shared';
import type { DesignEnv } from '../design/env';

type Env = DesignEnv;

export const adminApp = new Hono<{ Bindings: Env }>();

function asUser(env: Env, token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asService(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Supabase Auth báo email trùng bằng nhiều câu khác nhau tuỳ phiên bản. */
function isDuplicateEmail(message: string): boolean {
  return /already (been )?registered|already exists|email_exists/i.test(message);
}

adminApp.post('/users', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Chưa đăng nhập.' }, 401);

  const user = asUser(c.env, token);
  const allowed = await user.rpc('can_manage_accounts');
  if (allowed.error) {
    console.error('can_manage_accounts:', allowed.error.message);
    return c.json({ error: 'Không kiểm tra được quyền tạo tài khoản. Vui lòng thử lại.' }, 500);
  }
  if (allowed.data !== true) {
    return c.json(
      { error: 'Không tạo được tài khoản vì chỉ Quản trị hệ thống được cấp tài khoản mới.' },
      403,
    );
  }

  const body: unknown = await c.req.json().catch(() => null);
  const parsed = newAccountSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ.' }, 400);
  }
  const input = parsed.data;

  // Kiểm trùng trước khi tạo danh tính: đỡ một lượt tạo rồi xoá, và câu báo rõ hơn câu của Auth.
  const existing = await asService(c.env)
    .from('users')
    .select('id')
    .ilike('email', input.email)
    .maybeSingle();
  if (existing.data) {
    return c.json({ error: 'Email này đã có tài khoản. Tra trong danh sách Người dùng.' }, 409);
  }

  const temporaryPassword = generateTemporaryPassword();
  const service = asService(c.env);
  const created = await service.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (created.error || !created.data.user) {
    const message = created.error?.message ?? '';
    console.error('auth.admin.createUser:', message);
    if (isDuplicateEmail(message)) {
      return c.json({ error: 'Email này đã có tài khoản đăng nhập.' }, 409);
    }
    return c.json({ error: 'Không tạo được tài khoản đăng nhập. Vui lòng thử lại.' }, 502);
  }
  const authUserId = created.data.user.id;

  const profile = await user.rpc('create_account_profile', {
    p_auth_user_id: authUserId,
    p_email: input.email,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_job_title: input.jobTitle,
    p_department: input.department,
    p_company_id: input.companyId,
    p_role_id: input.roleId,
  });
  if (profile.error || typeof profile.data !== 'string') {
    await service.auth.admin.deleteUser(authUserId);
    // Câu do hàm CSDL tự nêu (thiếu họ tên, email trùng…) đã là tiếng Việt cho người dùng.
    const message = profile.error?.message;
    const known = message && /[À-ỹ]/.test(message) ? message : null;
    return c.json(
      { error: known ?? 'Không lưu được hồ sơ tài khoản. Vui lòng thử lại.' },
      profile.error?.code === '42501' ? 403 : 400,
    );
  }

  const result: CreatedAccount = {
    userId: profile.data,
    email: input.email,
    temporaryPassword,
  };
  return c.json(result, 201);
});
