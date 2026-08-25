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

describeDb('Hạ tầng xuyên suốt — nhật ký chỉ đọc', () => {
  it('người dùng thường KHÔNG đọc được nhật ký thao tác (PRD NEN-07)', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data } = await kinhDoanh.from('audit_logs').select('*').limit(1);
    expect(data).toEqual([]);
  });

  it('vai trò giám sát đọc được nhật ký', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { error } = await tgd.from('audit_logs').select('*').limit(1);
    expect(error).toBeNull();
  });

  it('KHÔNG AI ghi được nhật ký từ trình duyệt — kể cả Quản trị hệ thống', async () => {
    const admin = await signInAs(ACCOUNTS.admin);
    const { data: me } = await admin.rpc('auth_user_id');
    const { error } = await admin.from('audit_logs').insert({
      user_id: me,
      action: 'gia_mao',
      entity_type: 'users',
    });
    expect(error).toBeTruthy();
  });

  it('nhật ký truy cập nhạy cảm chỉ ghi được qua hàm có kiểm soát', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);

    const { error: directWrite } = await tgd.from('sensitive_access_logs').insert({
      user_id: (await tgd.rpc('auth_user_id')).data,
      sensitive_kind: 'salary',
      entity_type: 'employees',
      action: 'view',
    });
    expect(directWrite, 'ghi trực tiếp phải bị chặn').toBeTruthy();

    const { error: viaFunction } = await tgd.rpc('log_sensitive_access', {
      p_kind: 'salary',
      p_entity_type: 'employees',
      p_entity_id: null,
      p_action: 'view',
    });
    expect(viaFunction, 'ghi qua hàm phải thành công').toBeNull();
  });

  it('hàm ghi nhật ký từ chối loại dữ liệu nhạy cảm không hợp lệ', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { error } = await tgd.rpc('log_sensitive_access', {
      p_kind: 'bia_dat',
      p_entity_type: 'employees',
      p_entity_id: null,
    });
    expect(error).toBeTruthy();
  });
});

describeDb('Hạ tầng xuyên suốt — thông báo và việc cần làm', () => {
  it('người dùng chỉ thấy thông báo của chính mình, kể cả Ban Giám đốc', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: me } = await tgd.rpc('auth_user_id');
    const { data } = await tgd.from('notifications').select('user_id');
    // Hộp thư của người khác không phải dữ liệu nghiệp vụ để giám sát.
    for (const row of data ?? []) expect(row.user_id).toBe(me);
  });

  it('không tự tạo được việc cần làm cho người khác', async () => {
    const kinhDoanh = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: otherUser } = await kinhDoanh
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.tgd)
      .maybeSingle();

    if (!otherUser) return; // không thấy người đó thì đã bị chặn ở tầng trên

    const { error } = await kinhDoanh.from('tasks').insert({
      user_id: otherUser.id,
      title: 'Việc giả mạo',
      action_url: '/dashboard',
    });
    expect(error).toBeTruthy();
  });
});

describeDb('Hạ tầng xuyên suốt — phiên bản tài liệu (NEN-05)', () => {
  it('chỉ MỘT phiên bản đang hiệu lực tại một thời điểm', async () => {
    const admin = await signInAs(ACCOUNTS.admin);
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('code', 'NVC')
      .single();

    const { data: doc, error: docError } = await admin
      .from('documents')
      .insert({
        company_id: company!.id,
        title: `Tài liệu kiểm thử ${Date.now()}`,
        category: 'ban_ve',
      })
      .select('id')
      .single();
    expect(docError).toBeNull();

    const publish = (reason: string | null) =>
      admin.rpc('publish_document_version', {
        p_document_id: doc!.id,
        p_file_url: 'test/duong-dan.pdf',
        p_file_name: 'ban-ve.pdf',
        p_change_reason: reason,
      });

    // Bản đầu tiên không cần nguyên nhân thay đổi.
    const { error: first } = await publish(null);
    expect(first).toBeNull();

    // Bản điều chỉnh BẮT BUỘC nêu nguyên nhân (NEN-05).
    const { error: noReason } = await publish(null);
    expect(noReason, 'bản điều chỉnh thiếu nguyên nhân phải bị từ chối').toBeTruthy();

    const { error: second } = await publish('Điều chỉnh cao độ nền theo góp ý');
    expect(second).toBeNull();

    const { data: versions } = await admin
      .from('document_versions')
      .select('version, is_current_version')
      .eq('document_id', doc!.id)
      .order('version');

    expect(versions).toHaveLength(2);
    expect(versions!.filter((v) => v.is_current_version)).toHaveLength(1);
    // Bản đang hiệu lực phải là bản mới nhất.
    expect(versions!.at(-1)!.is_current_version).toBe(true);

    await admin.from('documents').delete().eq('id', doc!.id);
  });
});
