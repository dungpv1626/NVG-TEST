/**
 * Nền tảng dùng chung — NEN-12: bảng tham số hệ thống và thời hạn cam kết xử lý.
 *
 * Nguồn: PRD v1.4 NEN-12, Backend Schema v1.1 Mục 4.1. Migration `0111` (system_parameters +
 * lịch sử) và `0113` (sla_definitions).
 *
 * Ba thứ được canh ở đây:
 *  1. Đọc rộng (mọi vai trò cần biết ngưỡng để hiển thị đúng), sửa hẹp (chỉ cấp quyết định) —
 *     đúng khuôn `aging_buckets`/`approval_limits` đã có (KT-04, NEN-02).
 *  2. Lịch sử thay đổi ghi bằng TRIGGER, không phụ thuộc nơi gọi có nhớ ghi log hay không.
 *  3. Ràng buộc `NULLS NOT DISTINCT` chống trùng dòng dùng chung (`scope_id` rỗng) — đúng
 *     lớp lỗi migration `0109` đã phải vá cho `aging_buckets`/`approval_limits`.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('NEN-12 — tham số hệ thống (system_parameters)', () => {
  let admin: SupabaseClient;
  let ketoan: SupabaseClient;
  let kho: SupabaseClient;

  beforeAll(async () => {
    admin = await signInAs(ACCOUNTS.admin);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    kho = await signInAs(ACCOUNTS.kho);
  });

  afterAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`DELETE FROM system_parameters WHERE label LIKE ${TEST_PREFIX + '%'}`;
    } finally {
      await sql.end();
    }
  });

  it('mọi vai trò đã đăng nhập đọc được tham số không nhạy cảm', async () => {
    const { data, error } = await ketoan
      .from('system_parameters')
      .select('param_key, value')
      .eq('param_key', 'hours_per_workday')
      .single();
    expect(error).toBeNull();
    expect(Number((data as { value: number }).value)).toBe(8);
  });

  it('Kho không sửa được tham số hệ thống — ngang hàng hạn mức phê duyệt (NEN-02)', async () => {
    const { error } = await kho
      .from('system_parameters')
      .insert({
        param_key: `${TEST_PREFIX}_tu_dat_${Date.now()}`,
        scope_type: 'global',
        value: 1,
        label: `${TEST_PREFIX} Tham số tự đặt`,
      })
      .select('id')
      .single();
    expect(error).toBeTruthy();
  });

  it('Quản trị hệ thống sửa được, và mỗi lần đổi giá trị ghi một dòng lịch sử', async () => {
    const key = `${TEST_PREFIX}_ngưỡng_test_${Date.now()}`;
    const { data: created, error: createError } = await admin
      .from('system_parameters')
      .insert({
        param_key: key,
        scope_type: 'global',
        value: 1,
        label: `${TEST_PREFIX} Ngưỡng thử nghiệm`,
      })
      .select('id')
      .single();
    expect(createError).toBeNull();
    const id = (created as { id: string }).id;

    const { error: updateError } = await admin
      .from('system_parameters')
      .update({ value: 2 })
      .eq('id', id);
    expect(updateError).toBeNull();

    const { data: history } = await admin
      .from('system_parameter_history')
      .select('old_value, new_value')
      .eq('parameter_id', id)
      .order('changed_at', { ascending: true });
    const rows = (history ?? []) as { old_value: number | null; new_value: number }[];

    // Một dòng cho lần TẠO (old_value rỗng), một dòng cho lần SỬA (1 → 2). Sửa nhãn/mô tả mà
    // không đổi `value` thì KHÔNG thêm dòng nào — trigger `log_system_parameter_change` cố ý
    // lọc theo `IS DISTINCT FROM` trên chính cột giá trị.
    expect(rows).toHaveLength(2);
    expect(Number(rows[0]!.new_value)).toBe(1);
    expect(Number(rows[1]!.old_value)).toBe(1);
    expect(Number(rows[1]!.new_value)).toBe(2);
  });

  it('không ai ghi được lịch sử tham số trực tiếp — chỉ trigger SECURITY DEFINER mới ghi', async () => {
    const { error } = await admin.from('system_parameter_history').insert({
      parameter_id: '00000000-0000-0000-0000-000000000000',
      param_key: `${TEST_PREFIX}_khong_hop_le`,
      new_value: 1,
    });
    expect(error).toBeTruthy();
  });

  it('hai tham số dùng chung cùng khoá KHÔNG nhân đôi được (NULLS NOT DISTINCT, bài học 0109)', async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    const key = `${TEST_PREFIX}_chong_trung_${Date.now()}`;
    try {
      await sql`
        INSERT INTO system_parameters (param_key, scope_type, value, label)
        VALUES (${key}, 'global', '1'::jsonb, ${TEST_PREFIX + ' Chống trùng'})
      `;
      await expect(
        sql`
          INSERT INTO system_parameters (param_key, scope_type, value, label)
          VALUES (${key}, 'global', '2'::jsonb, ${TEST_PREFIX + ' Chống trùng lần hai'})
        `,
      ).rejects.toThrow();
    } finally {
      await sql`DELETE FROM system_parameters WHERE param_key = ${key}`;
      await sql.end();
    }
  });
});

describeDb('NEN-12 — thời hạn cam kết xử lý (sla_definitions)', () => {
  let admin: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    admin = await signInAs(ACCOUNTS.admin);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('công trường không tự đặt được thời hạn cam kết cho chính mình', async () => {
    const { error } = await chiHuy
      .from('sla_definitions')
      .insert({
        request_type: `${TEST_PREFIX}_tu_dat`,
        target_hours: 1,
        label: `${TEST_PREFIX} Tự đặt hạn`,
      })
      .select('id')
      .single();
    expect(error).toBeTruthy();
  });

  it('bảng cố ý RỖNG — chưa có dòng nào thì sla_target_hours trả NULL, không phải 0', async () => {
    const { data, error } = await admin.rpc('sla_target_hours', {
      p_request_type: `${TEST_PREFIX}_chua_khai_bao`,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
