import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /admin/users` với Supabase giả: kiểm thứ tự và các nhánh hỏng, không chạm CSDL thật.
 * Quyền thật (chỉ ADMIN) nằm trong hàm CSDL và được kiểm ở `db/src/__tests__/nen-accounts.test.ts`.
 */

const state = {
  canManage: true as boolean,
  existing: null as { id: string } | null,
  createError: null as { message: string } | null,
  profile: { data: 'user-1' as unknown, error: null as { message: string; code?: string } | null },
  rpcCalls: [] as { fn: string; args?: Record<string, unknown> }[],
  deleted: [] as string[],
  createdPasswords: [] as string[],
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (fn: string, args?: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === 'can_manage_accounts')
        return Promise.resolve({ data: state.canManage, error: null });
      return Promise.resolve(state.profile);
    },
    from: () => ({
      select: () => ({
        ilike: () => ({
          maybeSingle: () => Promise.resolve({ data: state.existing, error: null }),
        }),
      }),
    }),
    auth: {
      admin: {
        createUser: (args: { password: string }) => {
          state.createdPasswords.push(args.password);
          return Promise.resolve(
            state.createError
              ? { data: { user: null }, error: state.createError }
              : { data: { user: { id: 'auth-1' } }, error: null },
          );
        },
        deleteUser: (id: string) => {
          state.deleted.push(id);
          return Promise.resolve({ error: null });
        },
      },
    },
  }),
}));

const { adminApp } = await import('../index');

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
const BODY = {
  fullName: 'Nguyễn Văn A',
  email: 'a@nhavietgroup.vn',
  companyId: '7d1e7b52-5d8e-4f3a-9a77-1f2b3c4d5e6f',
  roleId: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
};

function post(body: unknown, token: string | null = 'tok') {
  return adminApp.request(
    '/users',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
    ENV,
  );
}

beforeEach(() => {
  state.canManage = true;
  state.existing = null;
  state.createError = null;
  state.profile = { data: 'user-1', error: null };
  state.rpcCalls = [];
  state.deleted = [];
  state.createdPasswords = [];
});

describe('POST /admin/users', () => {
  it('chưa đăng nhập → 401', async () => {
    expect((await post(BODY, null)).status).toBe(401);
  });

  it('không phải Quản trị hệ thống → 403, không tạo danh tính nào', async () => {
    state.canManage = false;
    const res = await post(BODY);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/Quản trị hệ thống/);
    expect(state.createdPasswords).toHaveLength(0);
  });

  it('dữ liệu sai → 400 với câu tiếng Việt', async () => {
    const res = await post({ ...BODY, email: 'abc' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Email chưa đúng/);
  });

  it('email đã có hồ sơ → 409, không tạo danh tính', async () => {
    state.existing = { id: 'u0' };
    expect((await post(BODY)).status).toBe(409);
    expect(state.createdPasswords).toHaveLength(0);
  });

  it('ghi hồ sơ hỏng → xoá danh tính vừa tạo', async () => {
    state.profile = { data: null, error: { message: 'Vai trò không tồn tại.', code: '22023' } };
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Vai trò không tồn tại.');
    expect(state.deleted).toEqual(['auth-1']);
  });

  it('thành công → 201, trả mật khẩu tạm đúng cái đã đặt cho danh tính', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { userId: string; temporaryPassword: string };
    expect(json.userId).toBe('user-1');
    expect(json.temporaryPassword).toBe(state.createdPasswords[0]);
    const profileCall = state.rpcCalls.find((c) => c.fn === 'create_account_profile');
    expect(profileCall?.args).toMatchObject({
      p_auth_user_id: 'auth-1',
      p_email: 'a@nhavietgroup.vn',
      p_phone: null,
    });
    expect(state.deleted).toHaveLength(0);
  });
});
