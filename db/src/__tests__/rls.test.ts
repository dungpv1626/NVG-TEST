/**
 * Bộ kiểm thử chính sách RLS.
 *
 * Tech Stack Mục 3.6 yêu cầu: "đảm bảo một vai trò không vô tình xem/sửa được dữ liệu
 * ngoài phạm vi quyền hạn (đặc biệt dữ liệu nhạy cảm: giá vốn, lương, lợi nhuận)".
 *
 * VÌ SAO CHẠY SỚM VÀ CHẠY MÃI: RLS quá lỏng KHÔNG có triệu chứng — không lỗi, không cảnh
 * báo, chỉ là dữ liệu lẽ ra phải giấu thì lại hiện ra. Chỉ phát hiện được bằng cách khẳng
 * định tường minh ai thấy gì. Mỗi bảng mới thêm vào phải bổ sung test ở đây ngay.
 *
 * Test chạy trên cơ sở dữ liệu DEV thật và cần đã chạy `npm run db:seed`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  anonClient,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  PROTECTED_TABLES,
  signInAs,
} from './helpers';

// Không có thông tin kết nối thì bỏ qua thay vì làm hỏng cả bộ test (ví dụ trên CI chưa cấu hình).
const describeDb = hasCredentials ? describe : describe.skip;

describeDb('RLS — vai trò anon (chưa đăng nhập)', () => {
  it.each(PROTECTED_TABLES)('không đọc được bảng %s', async (table) => {
    const { data, error } = await anonClient().from(table).select('*').limit(1);
    // Chấp nhận cả hai hình thức chặn: từ chối quyền, hoặc trả về rỗng do RLS lọc hết.
    if (error) {
      expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    } else {
      expect(data).toEqual([]);
    }
  });
});

describeDb('RLS — nhận diện người dùng và vai trò', () => {
  let tgd: SupabaseClient;
  let kinhDoanh: SupabaseClient;

  beforeAll(async () => {
    tgd = await signInAs(ACCOUNTS.tgd);
    kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
  });

  it('auth_user_id trả về hồ sơ nghiệp vụ của người đăng nhập', async () => {
    const { data } = await tgd.rpc('auth_user_id');
    expect(data).toBeTruthy();
  });

  it('auth_role_codes trả đúng vai trò được gán', async () => {
    const { data } = await kinhDoanh.rpc('auth_role_codes');
    expect(data).toEqual(['KD']);
  });

  it('chỉ vai trò cấp tập đoàn mới xem được mọi pháp nhân', async () => {
    const { data: tgdSeesAll } = await tgd.rpc('auth_sees_all_companies');
    const { data: kdSeesAll } = await kinhDoanh.rpc('auth_sees_all_companies');
    expect(tgdSeesAll).toBe(true);
    expect(kdSeesAll).toBe(false);
  });
});

describeDb('RLS — Mẫu A: phạm vi theo pháp nhân', () => {
  it('nhân viên một pháp nhân chỉ thấy người cùng pháp nhân, ít hơn Ban Giám đốc', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);

    const { data: allUsers } = await tgd.from('users').select('email');
    const { data: scopedUsers } = await kinhDoanh.from('users').select('email');

    expect(allUsers!.length).toBeGreaterThan(scopedUsers!.length);
  });

  it('nhân viên NVC không thấy người chỉ thuộc NVO', async () => {
    const kinhDoanhNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data } = await kinhDoanhNvc.from('users').select('email');
    const emails = data!.map((u) => u.email);

    expect(emails).toContain(ACCOUNTS.kinhDoanhNvc);
    expect(emails).not.toContain(ACCOUNTS.thietKeNvo);
  });
});

describeDb('RLS — Mẫu C: hạn mức phê duyệt', () => {
  async function permission(client: SupabaseClient, subject: string, companyId?: string) {
    const { data } = await client.rpc('auth_approval_permission', {
      target_subject: subject,
      ...(companyId ? { target_company_id: companyId } : {}),
    });
    return data![0] as { can_approve: boolean; is_unlimited: boolean; max_amount: number | null };
  }

  async function companyId(client: SupabaseClient, code: string): Promise<string> {
    const { data } = await client.from('companies').select('id').eq('code', code).single();
    return data!.id;
  }

  it('phân biệt "không giới hạn" với "không có quyền" — không được lẫn lộn', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);

    const tgdPerm = await permission(tgd, 'payment_request');
    expect(tgdPerm.can_approve).toBe(true);
    expect(tgdPerm.is_unlimited).toBe(true);

    const kdPerm = await permission(kinhDoanh, 'payment_request');
    expect(kdPerm.can_approve).toBe(false);
    expect(kdPerm.is_unlimited).toBe(false);
  });

  it('giảm giá đặc biệt chỉ Tổng Giám đốc duyệt được (CRM-05)', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const cfo = await signInAs(ACCOUNTS.cfo);

    expect((await permission(tgd, 'special_discount')).can_approve).toBe(true);
    expect((await permission(cfo, 'special_discount')).can_approve).toBe(false);
  });

  it('vai trò cấp tập đoàn phê duyệt được xuyên pháp nhân (Back Office dùng chung)', async () => {
    const cfo = await signInAs(ACCOUNTS.cfo);
    const nvc = await companyId(cfo, 'NVC');

    // Giám đốc Tài chính được gán ở NVG nhưng phải duyệt được chi cho NVC.
    const perm = await permission(cfo, 'payment_request', nvc);
    expect(perm.can_approve).toBe(true);
  });

  it('rls_can_approve tôn trọng đúng ngưỡng hạn mức', async () => {
    const cfo = await signInAs(ACCOUNTS.cfo);
    const nvc = await companyId(cfo, 'NVC');
    const limit = (await permission(cfo, 'payment_request', nvc)).max_amount!;
    expect(limit).toBeGreaterThan(0);

    const check = async (amount: number) => {
      const { data } = await cfo.rpc('rls_can_approve', {
        target_subject: 'payment_request',
        target_company_id: nvc,
        target_amount: amount,
      });
      return data as boolean;
    };

    expect(await check(limit - 1)).toBe(true);
    expect(await check(limit)).toBe(true);
    expect(await check(limit + 1)).toBe(false);
  });

  it('người không có quyền thì không duyệt được dù giá trị nhỏ', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const nvc = await companyId(kinhDoanh, 'NVC');
    const { data } = await kinhDoanh.rpc('rls_can_approve', {
      target_subject: 'payment_request',
      target_company_id: nvc,
      target_amount: 1000,
    });
    expect(data).toBe(false);
  });
});

describeDb('RLS — Mẫu D: quyền xem cột nhạy cảm', () => {
  it('lương và lợi nhuận chỉ mở cho vai trò được phép (PRD NEN-07)', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);

    for (const kind of ['cost', 'profit', 'salary']) {
      const { data: tgdSees } = await tgd.rpc('rls_sees_sensitive', { kind });
      const { data: kdSees } = await kinhDoanh.rpc('rls_sees_sensitive', { kind });
      expect(tgdSees, `Ban Giám đốc phải xem được ${kind}`).toBe(true);
      expect(kdSees, `Kinh doanh KHÔNG được xem ${kind}`).toBe(false);
    }
  });

  it('loại dữ liệu nhạy cảm không xác định thì mặc định từ chối', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data } = await tgd.rpc('rls_sees_sensitive', { kind: 'khong_ton_tai' });
    expect(data).toBe(false);
  });
});

describeDb('RLS — chặn ghi trái phép', () => {
  it('không phải Quản trị hệ thống thì không sửa được hạn mức phê duyệt', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { error } = await kinhDoanh.from('approval_limits').insert({
      role_id: '00000000-0000-0000-0000-000000000000',
      subject: 'payment_request',
      step: 99,
    });
    expect(error).toBeTruthy();
  });

  it('không phải Quản trị hệ thống thì không tạo được pháp nhân', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { error } = await kinhDoanh.from('companies').insert({
      code: 'TEST',
      legal_name: 'Không được phép',
      short_name: 'Không được phép',
    });
    expect(error).toBeTruthy();
  });

  it('người dùng không tự nâng quyền cho mình được', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: adminRole } = await kinhDoanh.from('roles').select('id').eq('code', 'ADMIN').single();
    const { data: me } = await kinhDoanh.rpc('auth_user_id');
    const { data: company } = await kinhDoanh.from('companies').select('id').eq('code', 'NVC').single();

    const { error } = await kinhDoanh.from('user_companies').insert({
      user_id: me,
      company_id: company!.id,
      role_id: adminRole!.id,
    });
    expect(error).toBeTruthy();
  });
});
