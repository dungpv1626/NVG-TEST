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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  anonClient,
  cleanupTestData,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  PROTECTED_TABLES,
  signInAs,
  TEST_PREFIX,
} from './helpers';

// Không có thông tin kết nối thì bỏ qua thay vì làm hỏng cả bộ test (ví dụ trên CI chưa cấu hình).
const describeDb = hasCredentials ? describe : describe.skip;

// Dọn sạch mọi bản ghi do test tạo ra, kể cả những bản không xóa được qua RLS
// (ví dụ cơ hội đã bàn giao). Không dọn thì dữ liệu test tích tụ trong CSDL phát triển.
if (hasCredentials) {
  afterAll(async () => {
    await cleanupTestData();
  });
}

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
        title: `${TEST_PREFIX} Tài liệu ${Date.now()}`,
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

  });
});

describeDb('CRM — pipeline cơ hội kinh doanh', () => {
  /** Tạo một cơ hội để thử, trả về id và hàm dọn dẹp. */
  async function createOpportunity(client: SupabaseClient) {
    const { data: company } = await client
      .from('companies')
      .select('id, code')
      .eq('code', 'NVC')
      .single();

    const { data: customer } = await client.from('customers').select('id').limit(1).maybeSingle();
    if (!customer) throw new Error('Cần ít nhất một khách hàng để chạy test này.');

    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });

    const { data, error } = await client
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer.id,
        name: `${TEST_PREFIX} Cơ hội ${Date.now()}`,
        owner_id: me,
        stage: 'tiep_nhan',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  it('ghi lịch sử ngay khi khởi tạo — phễu bán hàng cần đủ mốc thời gian (CRM-09)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const id = await createOpportunity(kd);

    const { data } = await kd
      .from('opportunity_stage_history')
      .select('from_stage, to_stage')
      .eq('opportunity_id', id);

    expect(data).toHaveLength(1);
    expect(data![0]!.from_stage).toBeNull();
    expect(data![0]!.to_stage).toBe('tiep_nhan');

  });

  it('chuyển giai đoạn luôn ghi vết, không có đường nào lách được (NEN-03)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const id = await createOpportunity(kd);

    const { error } = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: 'khao_sat',
      p_note: 'Khách đồng ý cho khảo sát',
      p_lost_reason: null,
    });
    expect(error).toBeNull();

    const { data } = await kd
      .from('opportunity_stage_history')
      .select('from_stage, to_stage, note')
      .eq('opportunity_id', id)
      .order('changed_at');

    expect(data).toHaveLength(2);
    expect(data![1]).toMatchObject({
      from_stage: 'tiep_nhan',
      to_stage: 'khao_sat',
      note: 'Khách đồng ý cho khảo sát',
    });

  });

  it('không ghi được lịch sử giả từ trình duyệt', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const id = await createOpportunity(kd);

    const { error } = await kd.from('opportunity_stage_history').insert({
      opportunity_id: id,
      to_stage: 'ky_hop_dong',
      note: 'Lịch sử giả mạo',
    });
    expect(error).toBeTruthy();

  });

  it('mất cơ hội bắt buộc nêu nguyên nhân (CRM-09)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const id = await createOpportunity(kd);

    const { error: noReason } = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: 'mat_co_hoi',
      p_note: null,
      p_lost_reason: null,
    });
    expect(noReason, 'thiếu nguyên nhân phải bị từ chối').toBeTruthy();

    const { error: withReason } = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: 'mat_co_hoi',
      p_note: null,
      p_lost_reason: 'Khách chọn nhà thầu khác vì giá thấp hơn',
    });
    expect(withReason).toBeNull();

  });

  it('cơ hội đã bàn giao chuyển chế độ chỉ xem (CRM-06)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const admin = await signInAs(ACCOUNTS.admin);
    const id = await createOpportunity(kd);

    // Quản trị hệ thống đánh dấu đã bàn giao (thao tác thật sẽ do endpoint bàn giao thực hiện).
    const { error: handover } = await admin
      .from('opportunities')
      .update({ handed_over_at: new Date().toISOString() })
      .eq('id', id);
    expect(handover).toBeNull();

    // Sau khi bàn giao, chính người phụ trách cũng không đổi được giai đoạn nữa —
    // nếu còn sửa được thì bên nhận không thể tin dữ liệu vừa nhận.
    const { error: move } = await kd.rpc('move_opportunity_stage', {
      p_opportunity_id: id,
      p_to_stage: 'khao_sat',
      p_note: null,
      p_lost_reason: null,
    });
    expect(move).toBeTruthy();

  });
});

/**
 * Luồng báo giá và phê duyệt (CRM-04, CRM-05).
 *
 * Ba thứ phải chắc chắn đúng, vì sai thì KHÔNG có triệu chứng nào nhìn thấy được:
 *   1. Báo giá chưa duyệt mà vẫn gửi được cho khách → chữ ký phê duyệt vô nghĩa.
 *   2. Người không đủ hạn mức vẫn duyệt được → Mẫu C hỏng, mà không ai biết.
 *   3. Giảm giá đi nhầm sang luồng duyệt thường → né được Tổng Giám đốc (CRM-05).
 */
describeDb('CRM — báo giá và phê duyệt giá', () => {
  /** Cơ hội + báo giá nháp để thử. Trả về id cả hai. */
  async function createQuote(
    client: SupabaseClient,
    { totalValue, discountAmount }: { totalValue: string; discountAmount?: string },
  ) {
    const { data: company } = await client
      .from('companies')
      .select('id')
      .eq('code', 'NVC')
      .single();
    const { data: customer } = await client.from('customers').select('id').limit(1).maybeSingle();
    if (!customer) throw new Error('Cần ít nhất một khách hàng để chạy test này.');

    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });

    const { data: opportunity, error: oppError } = await client
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer.id,
        name: `${TEST_PREFIX} Báo giá ${Date.now()}`,
        owner_id: me,
        stage: 'bao_gia',
      })
      .select('id')
      .single();
    if (oppError) throw new Error(oppError.message);

    // Không truyền code/version/is_current_version — trigger cấp.
    const { data: quote, error: quoteError } = await client
      .from('quotes')
      .insert({
        company_id: company!.id,
        opportunity_id: opportunity!.id,
        total_value: totalValue,
        discount_amount: discountAmount ?? null,
        discount_reason: discountAmount ? 'Khách hàng cũ, khối lượng lớn' : null,
      })
      .select('id, code, version, is_current_version, status')
      .single();
    if (quoteError) throw new Error(quoteError.message);

    return { opportunityId: opportunity!.id as string, quote: quote! };
  }

  it('CSDL cấp mã và số phiên bản, không phải trình duyệt (NEN-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { opportunityId, quote } = await createQuote(kd, { totalValue: '800000000' });

    expect(quote.version).toBe(1);
    expect(quote.is_current_version).toBe(true);
    expect(quote.code).toMatch(/^NVC-BG-\d{4}-\d{4}$/);
    expect(quote.status).toBe('draft');

    // Phiên bản 2 giữ nguyên mã gốc kèm hậu tố, để nhìn mã là biết cùng một chuỗi báo giá.
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: v2, error } = await kd
      .from('quotes')
      .insert({
        company_id: company!.id,
        opportunity_id: opportunityId,
        total_value: '750000000',
      })
      .select('code, version, is_current_version')
      .single();
    expect(error).toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.code).toBe(`${quote.code}-V2`);

    // Và chỉ còn ĐÚNG MỘT bản đang hiệu lực — điều kiện để NEN-05 có ý nghĩa.
    const { data: current } = await kd
      .from('quotes')
      .select('id, version')
      .eq('opportunity_id', opportunityId)
      .eq('is_current_version', true);
    expect(current).toHaveLength(1);
    expect(current![0]!.version).toBe(2);
  });

  it('không gửi được báo giá chưa qua phê duyệt nội bộ (CRM-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { quote } = await createQuote(kd, { totalValue: '900000000' });

    const { error } = await kd.rpc('send_quote_to_customer', { p_quote_id: quote.id });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('chưa được phê duyệt nội bộ');
  });

  it('gửi phê duyệt là tự xuất hiện trong Hộp thư của đúng người (CRM-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    // Trên hạn mức 500 triệu của Kinh doanh → phải lên tới Tổng Giám đốc.
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });

    const { error } = await kd.rpc('request_quote_approval', { p_quote_id: quote.id });
    expect(error).toBeNull();

    const { data: forTgd } = await tgd
      .from('approvals')
      .select('id, subject, amount, status')
      .eq('entity_id', quote.id);
    expect(forTgd).toHaveLength(1);
    expect(forTgd![0]!.subject).toBe('quote_price');
    expect(forTgd![0]!.status).toBe('pending_approval');
  });

  it('vượt hạn mức thì KHÔNG duyệt được, dù nhìn thấy hồ sơ mình gửi (Mẫu C, NEN-02)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    // Người gửi vẫn thấy hồ sơ của mình để theo dõi đang nằm ở ai...
    const { data: mine } = await kd.from('approvals').select('id').eq('entity_id', quote.id);
    expect(mine).toHaveLength(1);

    // ...nhưng 8 tỷ vượt hạn mức 500 triệu của Kinh doanh nên không tự duyệt được.
    const { error } = await kd.rpc('decide_approval', {
      p_approval_id: mine![0]!.id,
      p_decision: 'approved',
      p_note: 'Tự duyệt',
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('hạn mức');

    // Báo giá phải vẫn đang chờ duyệt, không bị đổi trạng thái nửa vời.
    const { data: after } = await kd
      .from('quotes')
      .select('status')
      .eq('id', quote.id)
      .single();
    expect(after!.status).toBe('pending_approval');
  });

  it('duyệt xong mới gửi được khách hàng, và lịch sử ghi lại căn cứ (CRM-04, NEN-03)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    const { data: pending } = await tgd.from('approvals').select('id').eq('entity_id', quote.id);
    const { error: decide } = await tgd.rpc('decide_approval', {
      p_approval_id: pending![0]!.id,
      p_decision: 'approved',
      p_note: 'Giá phù hợp mặt bằng thị trường',
    });
    expect(decide).toBeNull();

    const { data: history } = await tgd
      .from('approval_decisions')
      .select('decision, note, approver_unlimited')
      .eq('approval_id', pending![0]!.id);
    expect(history).toHaveLength(1);
    expect(history![0]!.decision).toBe('approved');
    expect(history![0]!.note).toBe('Giá phù hợp mặt bằng thị trường');
    // Hạn mức tại thời điểm duyệt được ghi lại — quy chế đổi về sau, nhật ký vẫn đọc đúng.
    expect(history![0]!.approver_unlimited).toBe(true);

    const { error: send } = await kd.rpc('send_quote_to_customer', { p_quote_id: quote.id });
    expect(send).toBeNull();
  });

  it('báo giá đã duyệt KHÔNG sửa được giá nữa — nếu không, chữ ký duyệt vô nghĩa', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    const { data: pending } = await tgd.from('approvals').select('id').eq('entity_id', quote.id);
    await tgd.rpc('decide_approval', {
      p_approval_id: pending![0]!.id,
      p_decision: 'approved',
      p_note: 'Đồng ý',
    });

    // Policy chỉ cho sửa báo giá còn NHÁP: lệnh dưới đây không chạm được dòng nào.
    const { data: changed } = await kd
      .from('quotes')
      .update({ total_value: '1000' })
      .eq('id', quote.id)
      .select('id');
    expect(changed ?? []).toHaveLength(0);

    const { data: after } = await kd
      .from('quotes')
      .select('total_value')
      .eq('id', quote.id)
      .single();
    expect(Number(after!.total_value)).toBe(8_000_000_000);
  });

  it('có giảm giá thì bắt buộc đi luồng Tổng Giám đốc, không né được (CRM-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);

    // Tổng giá trị 100 triệu — NẰM TRONG hạn mức 500 triệu của Kinh doanh. Nếu chọn loại
    // nghiệp vụ theo tổng giá trị thì nhân viên tự duyệt được luôn khoản giảm giá của mình.
    const { quote } = await createQuote(kd, {
      totalValue: '100000000',
      discountAmount: '15000000',
    });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    const { data: mine } = await kd
      .from('approvals')
      .select('id, subject, amount')
      .eq('entity_id', quote.id);
    expect(mine![0]!.subject).toBe('special_discount');
    // Đối chiếu hạn mức theo MỨC GIẢM, không theo tổng giá trị.
    // PostgREST trả cột `bigint` dưới dạng SỐ JSON, không phải chuỗi.
    expect(Number(mine![0]!.amount)).toBe(15_000_000);

    // Kinh doanh không có hạn mức cho giảm giá đặc biệt → chặn.
    const { error: selfApprove } = await kd.rpc('decide_approval', {
      p_approval_id: mine![0]!.id,
      p_decision: 'approved',
      p_note: 'Tự duyệt giảm giá',
    });
    expect(selfApprove).toBeTruthy();

    // Tổng Giám đốc thì duyệt được (CRM-05: "mặc định theo khảo sát: Tổng Giám đốc").
    const { error: tgdApprove } = await tgd.rpc('decide_approval', {
      p_approval_id: mine![0]!.id,
      p_decision: 'approved',
      p_note: 'Chấp thuận mức giảm để giữ khách hàng cũ',
    });
    expect(tgdApprove).toBeNull();
  });

  it('người ngoài không thấy lý do giảm giá và ý kiến phê duyệt', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kho = await signInAs(ACCOUNTS.kho);
    const { quote } = await createQuote(kd, {
      totalValue: '100000000',
      discountAmount: '15000000',
    });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    // Nhân viên Kho không đề nghị, cũng không có hạn mức cho giảm giá đặc biệt.
    // PRD Module CRM: nội dung thương thảo "phải phân quyền chặt, không hiển thị đại trà".
    const { data } = await kho.from('approvals').select('id, reason').eq('entity_id', quote.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('từ chối bắt buộc nêu lý do, và trả báo giá về nháp để sửa', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    const { data: pending } = await tgd.from('approvals').select('id').eq('entity_id', quote.id);

    const { error: noReason } = await tgd.rpc('decide_approval', {
      p_approval_id: pending![0]!.id,
      p_decision: 'rejected',
      p_note: null,
    });
    expect(noReason).toBeTruthy();
    expect(noReason!.message).toContain('lý do từ chối');

    const { error: rejected } = await tgd.rpc('decide_approval', {
      p_approval_id: pending![0]!.id,
      p_decision: 'rejected',
      p_note: 'Biên lợi nhuận quá thấp, soạn lại phương án',
    });
    expect(rejected).toBeNull();

    // Về nháp để người phụ trách sửa và gửi lại — không kẹt ở trạng thái chờ mãi.
    const { data: after } = await kd
      .from('quotes')
      .select('status')
      .eq('id', quote.id)
      .single();
    expect(after!.status).toBe('draft');
  });

  it('không tạo được đề nghị phê duyệt giả từ trình duyệt', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();

    const { error } = await kd.from('approvals').insert({
      company_id: company!.id,
      subject: 'special_discount',
      entity_type: 'quotes',
      entity_id: crypto.randomUUID(),
      title: `${TEST_PREFIX} Đề nghị giả`,
      amount: '1000000',
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('không tự ghi được quyết định phê duyệt vào lịch sử', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { quote } = await createQuote(kd, { totalValue: '8000000000' });
    await kd.rpc('request_quote_approval', { p_quote_id: quote.id });

    const { data: mine } = await kd.from('approvals').select('id').eq('entity_id', quote.id);

    const { error } = await kd.from('approval_decisions').insert({
      approval_id: mine![0]!.id,
      decision: 'approved',
      note: 'Tự ghi là đã duyệt',
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});

/**
 * Hộp thư Phê duyệt chỉ chứa việc XỬ LÝ ĐƯỢC.
 *
 * Tách riêng khỏi nhóm test trên vì đây là hai câu hỏi khác nhau — "được xem" và "phải xử
 * lý" — và chính chỗ lẫn hai câu hỏi đó đã làm huy hiệu "Việc cần làm" đếm nhầm.
 */
describeDb('Hộp thư Phê duyệt', () => {
  it('người gửi KHÔNG thấy hồ sơ của mình trong hộp thư, dù xem được nó', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);

    const { data: company } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const { data: customer } = await kd.from('customers').select('id').limit(1).maybeSingle();
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: code } = await kd.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'CH',
    });

    const { data: opportunity } = await kd
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer!.id,
        name: `${TEST_PREFIX} Hộp thư ${Date.now()}`,
        owner_id: me,
        stage: 'bao_gia',
      })
      .select('id')
      .single();

    const { data: quote } = await kd
      .from('quotes')
      .insert({
        company_id: company!.id,
        opportunity_id: opportunity!.id,
        total_value: '9000000000',
      })
      .select('id')
      .single();

    await kd.rpc('request_quote_approval', { p_quote_id: quote!.id });

    // Người gửi XEM được hồ sơ (theo dõi đang nằm ở ai)...
    const { data: visible } = await kd.from('approvals').select('id').eq('entity_id', quote!.id);
    expect(visible).toHaveLength(1);

    // ...nhưng nó KHÔNG nằm trong hộp thư của họ, vì họ không duyệt được.
    const { data: kdInbox } = await kd.rpc('my_pending_approvals');
    expect((kdInbox ?? []).some((r: { entity_id: string }) => r.entity_id === quote!.id)).toBe(
      false,
    );

    // Trong khi hộp thư của Tổng Giám đốc thì có, kèm đủ dữ liệu để quyết định tại chỗ.
    const { data: tgdInbox } = await tgd.rpc('my_pending_approvals');
    const item = (tgdInbox ?? []).find(
      (r: { entity_id: string }) => r.entity_id === quote!.id,
    ) as { requested_by_name: string; company_code: string; parent_id: string } | undefined;
    expect(item).toBeTruthy();
    expect(item!.requested_by_name).toBeTruthy();
    expect(item!.company_code).toBe('NVC');
    // Có sẵn đường về hồ sơ đầy đủ mà không phải gọi thêm lượt nào.
    expect(item!.parent_id).toBe(opportunity!.id);
  });
});
