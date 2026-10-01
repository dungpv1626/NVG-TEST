/**
 * NEN-02 — tạo tài khoản mới (0150): chỉ Quản trị hệ thống, hồ sơ và vai trò ghi cùng lúc.
 *
 * Danh tính đăng nhập (Supabase Auth) do Worker tạo bằng `service_role`; ở đây chỉ thử nửa CSDL
 * với một `auth_user_id` ngẫu nhiên — cột đó không có khoá ngoại sang `auth.users`.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, PG_INSUFFICIENT_PRIVILEGE, signInAs } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const EMAIL_PREFIX = 'kiem-tao-tai-khoan-';

describeDb('NEN-02 — tạo tài khoản', () => {
  let admin: SupabaseClient;
  let companyId: string;
  let roleId: string;

  beforeAll(async () => {
    admin = await signInAs(ACCOUNTS.admin);
    const company = await admin.from('companies').select('id').eq('code', 'NVC').single();
    const role = await admin.from('roles').select('id').eq('code', 'KT').single();
    companyId = company.data!.id as string;
    roleId = role.data!.id as string;
  });

  afterAll(async () => {
    const { data } = await admin.from('users').select('id').like('email', `${EMAIL_PREFIX}%`);
    const ids = (data ?? []).map((r) => r.id as string);
    if (ids.length) {
      await admin.from('user_companies').delete().in('user_id', ids);
      await admin.from('users').delete().in('id', ids);
    }
  });

  function args(email: string) {
    return {
      p_auth_user_id: randomUUID(),
      p_email: email,
      p_full_name: '  Người Kiểm Thử ',
      p_phone: '',
      p_job_title: 'Kế toán viên',
      p_department: null,
      p_company_id: companyId,
      p_role_id: roleId,
    };
  }

  it('Quản trị hệ thống được tạo; can_manage_accounts đúng theo vai trò', async () => {
    expect((await admin.rpc('can_manage_accounts')).data).toBe(true);
    for (const email of [ACCOUNTS.nhanSu, ACCOUNTS.tgd]) {
      const other = await signInAs(email);
      expect((await other.rpc('can_manage_accounts')).data).toBe(false);
    }
  });

  it('ghi hồ sơ và vai trò chính trong một lượt, chuẩn hoá email và ô trống', async () => {
    const email = `${EMAIL_PREFIX}${Date.now()}@NhaVietGroup.test`;
    const { data: userId, error } = await admin.rpc('create_account_profile', args(email));
    expect(error).toBeNull();

    const user = await admin
      .from('users')
      .select('email, full_name, phone, job_title, is_active, created_by')
      .eq('id', userId)
      .single();
    expect(user.data).toMatchObject({
      email: email.toLowerCase(),
      full_name: 'Người Kiểm Thử',
      phone: null,
      job_title: 'Kế toán viên',
      is_active: true,
    });
    expect(user.data!.created_by).toBe((await admin.rpc('auth_user_id')).data);

    const link = await admin
      .from('user_companies')
      .select('company_id, role_id, is_primary')
      .eq('user_id', userId);
    expect(link.data).toEqual([{ company_id: companyId, role_id: roleId, is_primary: true }]);
  });

  it('email trùng (khác hoa thường) bị từ chối', async () => {
    const email = `${EMAIL_PREFIX}trung-${Date.now()}@nhavietgroup.test`;
    expect((await admin.rpc('create_account_profile', args(email))).error).toBeNull();
    const again = await admin.rpc('create_account_profile', args(email.toUpperCase()));
    expect(again.error?.message).toBe('Email này đã có tài khoản.');
  });

  it('Nhân sự không tạo được dù được sửa bảng users', async () => {
    const ns = await signInAs(ACCOUNTS.nhanSu);
    const email = `${EMAIL_PREFIX}ns-${Date.now()}@nhavietgroup.test`;
    const { error } = await ns.rpc('create_account_profile', args(email));
    expect(error?.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    const { data } = await admin.from('users').select('id').eq('email', email);
    expect(data).toEqual([]);
  });
});
