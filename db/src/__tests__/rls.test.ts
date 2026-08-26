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
  TEST_PREFIX,
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

  it('không chuyển được cơ hội sang pháp nhân khác (NEN-01)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const admin = await signInAs(ACCOUNTS.admin);
    const id = await createOpportunity(kd);

    const { data: nvo } = await admin.from('companies').select('id').eq('code', 'NVO').single();

    // Thử bằng Quản trị hệ thống — vai trò nhìn thấy mọi pháp nhân nên qua được policy.
    // Chặn phải nằm ở trigger: `WITH CHECK` không tham chiếu được giá trị CŨ của dòng, nên
    // đổi pháp nhân là lệnh hợp lệ ở cả hai đầu, và toàn bộ giá trị cơ hội nhảy sang P&L
    // của công ty kia mà không để lại vết gì.
    const { error } = await admin.from('opportunities').update({ company_id: nvo!.id }).eq('id', id);
    expect(error).toBeTruthy();
    expect(error!.message).toContain('pháp nhân');
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

  it('không tự đặt báo giá sang Đã duyệt bằng một câu UPDATE (CRM-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { quote } = await createQuote(kd, { totalValue: '800000000' });

    // Cùng lỗ hổng đã bịt ở Module HD: `USING` kiểm dòng ĐANG ở trạng thái nào, `WITH CHECK`
    // không kiểm trạng thái SẼ thành gì. Đặt thẳng `completed` là tự cấp cho mình chữ ký
    // phê duyệt nội bộ mà CRM-04 bắt buộc phải có trước khi gửi khách.
    const { error: fakeApproved } = await kd
      .from('quotes')
      .update({ status: 'completed' })
      .eq('id', quote.id);
    expect(fakeApproved!.message).toContain('Không đổi trực tiếp được trạng thái');

    const { error: fakeSent } = await kd
      .from('quotes')
      .update({ sent_to_customer_at: new Date().toISOString() })
      .eq('id', quote.id);
    expect(fakeSent!.message).toContain('Không đổi trực tiếp được trạng thái');

    // Sửa giá ở bản nháp vẫn phải làm được — nếu không thì soạn báo giá bằng gì.
    const { error: editValue } = await kd
      .from('quotes')
      .update({ total_value: '820000000' })
      .eq('id', quote.id)
      .select('id')
      .single();
    expect(editValue).toBeNull();
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

/**
 * Biên bản khảo sát (CRM-03).
 *
 * Biên bản khảo sát chứa ngân sách khách nêu và điều kiện thương mại — PRD Module CRM xếp
 * đây vào nhóm "nội dung đàm phán... phải phân quyền chặt". Quyền ghi thừa hưởng từ cơ hội
 * mẹ, nên phải khẳng định rõ ràng thay vì tin là nó "chắc đúng vì dùng chung hàm".
 */
describeDb('CRM — biên bản khảo sát', () => {
  async function createOpportunityFor(client: SupabaseClient) {
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

    const { data, error } = await client
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer.id,
        name: `${TEST_PREFIX} Khảo sát ${Date.now()}`,
        owner_id: me,
        stage: 'khao_sat',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  }

  it('người chịu trách nhiệm đặt lịch và ghi được biên bản', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const opportunityId = await createOpportunityFor(kd);

    const { data: created, error } = await kd
      .from('site_surveys')
      .insert({
        opportunity_id: opportunityId,
        scheduled_at: new Date().toISOString(),
        needs: 'Nhà xưởng 2.000 m2, cầu trục 5 tấn',
        decision_maker: 'Ông Nam — Giám đốc nhà máy',
        budget_note: 'Khoảng 6 tỷ',
      })
      .select('id, surveyed_at')
      .single();
    expect(error).toBeNull();
    // Mới đặt lịch thì chưa có thời điểm khảo sát thật — hai thứ khác nhau (CRM-03).
    expect(created!.surveyed_at).toBeNull();

    const { error: updateError } = await kd
      .from('site_surveys')
      .update({ surveyed_at: new Date().toISOString(), commercial_terms: 'Thanh toán 3 đợt' })
      .eq('id', created!.id);
    expect(updateError).toBeNull();
  });

  it('đồng nghiệp cùng pháp nhân XEM được nhưng KHÔNG sửa được biên bản của người khác', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const daDt = await signInAs(ACCOUNTS.dauThauNvc);
    const opportunityId = await createOpportunityFor(kd);

    const { data: survey } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: opportunityId, scheduled_at: new Date().toISOString() })
      .select('id')
      .single();

    // Xem được: Phòng Dự án cần đúng dữ liệu này để bóc tách và dự toán (Mẫu A).
    const { data: visible } = await daDt.from('site_surveys').select('id').eq('id', survey!.id);
    expect(visible).toHaveLength(1);

    // Nhưng không sửa được biên bản của người khác (Mẫu B) — lệnh không chạm dòng nào.
    const { data: changed } = await daDt
      .from('site_surveys')
      .update({ needs: 'Sửa trộm' })
      .eq('id', survey!.id)
      .select('id');
    expect(changed ?? []).toHaveLength(0);
  });

  it('không xóa hẳn được biên bản khảo sát, kể cả người tạo (Backend Schema 1.4)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const opportunityId = await createOpportunityFor(kd);

    const { data: survey } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: opportunityId, scheduled_at: new Date().toISOString() })
      .select('id')
      .single();

    // Không có policy DELETE: lệnh chạy nhưng không xóa được dòng nào.
    await kd.from('site_surveys').delete().eq('id', survey!.id);
    const { data: still } = await kd.from('site_surveys').select('id').eq('id', survey!.id);
    expect(still).toHaveLength(1);
  });

  it('cơ hội đã bàn giao thì biên bản khảo sát chuyển chế độ chỉ xem (CRM-06)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const admin = await signInAs(ACCOUNTS.admin);
    const opportunityId = await createOpportunityFor(kd);

    const { data: survey } = await kd
      .from('site_surveys')
      .insert({ opportunity_id: opportunityId, scheduled_at: new Date().toISOString() })
      .select('id')
      .single();

    await admin
      .from('opportunities')
      .update({ handed_over_at: new Date().toISOString() })
      .eq('id', opportunityId);

    const { data: changed } = await kd
      .from('site_surveys')
      .update({ needs: 'Sửa sau khi đã bàn giao' })
      .eq('id', survey!.id)
      .select('id');
    expect(changed ?? []).toHaveLength(0);
  });
});

/**
 * Khiếu nại khách hàng (CRM-08).
 *
 * Điểm dễ sai nhất: CRM-08 nói "ghi nhận VÀ PHÂN LUỒNG" — người tiếp nhận thường KHÁC người
 * xử lý. Nếu quyền tạo bị buộc phải tự nhận mình làm chủ trì thì người nhận điện thoại của
 * khách sẽ không ghi nhận được gì, và khiếu nại lại quay về Zalo như hiện trạng.
 */
describeDb('CRM — khiếu nại khách hàng', () => {
  async function createComplaint(
    client: SupabaseClient,
    overrides: Record<string, unknown> = {},
  ) {
    const { data: company } = await client
      .from('companies')
      .select('id')
      .eq('code', 'NVC')
      .single();
    const { data: customer } = await client.from('customers').select('id').limit(1).maybeSingle();
    if (!customer) throw new Error('Cần ít nhất một khách hàng để chạy test này.');

    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'KN',
    });

    return client
      .from('complaints')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer.id,
        title: `${TEST_PREFIX} Khiếu nại ${Date.now()}`,
        content: 'Khách phản ánh thấm trần tầng 2 sau mưa lớn.',
        severity: 'cao',
        status: 'in_progress',
        ...overrides,
      })
      .select('id, status, assignee_id, collaborator_ids')
      .single();
  }

  it('ghi nhận được khiếu nại rồi giao cho NGƯỜI KHÁC xử lý (CRM-08)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: congTruong } = await kd
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.congTruongNvc)
      .single();

    // Người tiếp nhận KHÔNG tự nhận mình là chủ trì — đúng tình huống thực tế.
    const { data, error } = await createComplaint(kd, { assignee_id: congTruong!.id });
    expect(error).toBeNull();
    expect(data!.assignee_id).toBe(congTruong!.id);
  });

  it('người tiếp nhận KHÔNG sửa được diễn biến xử lý của người khác (Mẫu B)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: congTruong } = await kd
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.congTruongNvc)
      .single();

    const { data: complaint } = await createComplaint(kd, { assignee_id: congTruong!.id });

    // Ghi nhận xong là hết vai trò: người tiếp nhận không phải chủ trì cũng không phối hợp.
    const { data: changed } = await kd
      .from('complaints')
      .update({ resolution: 'Tự ghi là đã xử lý xong' })
      .eq('id', complaint!.id)
      .select('id');
    expect(changed ?? []).toHaveLength(0);
  });

  it('NGƯỜI PHỐI HỢP sửa được diễn biến xử lý (CRM-08)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const congTruong = await signInAs(ACCOUNTS.congTruongNvc);

    const { data: me } = await kd.rpc('auth_user_id');
    const { data: assignee } = await congTruong.rpc('auth_user_id');

    // Chủ trì là người khác, nhưng người ghi nhận được đưa vào danh sách phối hợp.
    const { data: complaint } = await createComplaint(kd, {
      assignee_id: assignee,
      collaborator_ids: [me],
    });

    const { data: changed } = await kd
      .from('complaints')
      .update({ resolution: 'Đã cử tổ chống thấm xử lý ngày 26/08.' })
      .eq('id', complaint!.id)
      .select('id');
    expect(changed).toHaveLength(1);
  });

  it('người chủ trì đóng hồ sơ và ghi nhận khách hàng xác nhận', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const congTruong = await signInAs(ACCOUNTS.congTruongNvc);
    const { data: assignee } = await congTruong.rpc('auth_user_id');

    // Ban công trường KHÔNG tự tạo được khiếu nại: vai trò Thi công không có quyền xem
    // danh mục khách hàng, nên cũng không có quyền tạo hồ sơ CRM. Đúng luồng thực tế —
    // kinh doanh tiếp nhận rồi giao xuống công trường xử lý.
    const { data: complaint } = await createComplaint(kd, { assignee_id: assignee });

    const { data: closed } = await congTruong
      .from('complaints')
      .update({
        status: 'completed',
        resolution: 'Đã chống thấm lại toàn bộ mái, bảo hành 12 tháng.',
        customer_confirmed_at: new Date().toISOString(),
      })
      .eq('id', complaint!.id)
      .select('status, customer_confirmed_at')
      .single();

    expect(closed!.status).toBe('completed');
    expect(closed!.customer_confirmed_at).toBeTruthy();
  });

  it('pháp nhân khác KHÔNG thấy khiếu nại (Mẫu A)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: complaint } = await createComplaint(kd);

    const { data } = await kdNvo.from('complaints').select('id').eq('id', complaint!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it('khiếu nại CHƯA PHÂN CÔNG vẫn phân luồng được — không bị đóng băng', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const congTruong = await signInAs(ACCOUNTS.congTruongNvc);

    // Người tiếp nhận chưa biết giao cho ai — ô "Chưa phân công" trên biểu mẫu.
    const { data: complaint } = await createComplaint(kd, { assignee_id: null });
    expect(complaint!.assignee_id).toBeNull();

    // Mẫu B thuần cho ra `NULL OR false` = NULL và policy sẽ từ chối, khiến hồ sơ vô chủ
    // trở thành hồ sơ không ai đụng được. Nghịch lý: bỏ trống lại khoá chặt hơn điền tên.
    const { data: assignee } = await congTruong.rpc('auth_user_id');
    const { data: assigned } = await kd
      .from('complaints')
      .update({ assignee_id: assignee })
      .eq('id', complaint!.id)
      .select('assignee_id');
    expect(assigned).toHaveLength(1);
    expect(assigned![0]!.assignee_id).toBe(assignee);
  });

  it('không chuyển được khiếu nại sang pháp nhân khác (NEN-01)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const admin = await signInAs(ACCOUNTS.admin);
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: complaint } = await createComplaint(kd, { assignee_id: me });

    const { data: nvo } = await admin.from('companies').select('id').eq('code', 'NVO').single();

    // Quản trị hệ thống thấy mọi pháp nhân nên qua được policy — chặn phải nằm ở trigger,
    // vì WITH CHECK không tham chiếu được giá trị CŨ của dòng.
    const { error } = await admin
      .from('complaints')
      .update({ company_id: nvo!.id })
      .eq('id', complaint!.id);
    expect(error).toBeTruthy();
    expect(error!.message).toContain('pháp nhân');
  });

  it('không xóa hẳn được khiếu nại (Backend Schema 1.4)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: complaint } = await createComplaint(kd, { assignee_id: me });

    await kd.from('complaints').delete().eq('id', complaint!.id);
    const { data: still } = await kd.from('complaints').select('id').eq('id', complaint!.id);
    expect(still).toHaveLength(1);
  });
});

/**
 * Hồ sơ khách hàng (CRM-01) — Mẫu B, và bốn cột kiểm toán.
 *
 * Hai nhóm khẳng định ở đây đều thuộc loại "sai mà không có triệu chứng":
 *  - Quyền sửa quá rộng: đồng nghiệp sửa hồ sơ của nhau, không lỗi, không ai biết.
 *  - Cột kiểm toán không được ghi: mọi màn hình vẫn chạy đúng, chỉ có câu hỏi "ai sửa gần
 *    nhất, lúc nào" là mãi mãi không trả lời được — mà đó là thứ Backend Schema 1.4 bắt buộc.
 */
describeDb('CRM — hồ sơ khách hàng', () => {
  /** Tạo một khách hàng để thử. `responsibleUserId` không truyền = hồ sơ chưa phân công. */
  async function createCustomer(
    client: SupabaseClient,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string }> {
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'KH',
    });
    const { data, error } = await client
      .from('customers')
      .insert({ code, name: `${TEST_PREFIX} Khách hàng ${Date.now()}`, ...extra })
      .select('id, code')
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string; code: string };
  }

  it('CSDL tự ghi 4 cột kiểm toán — trình duyệt không khai hộ được (Backend Schema 1.4)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: me } = await kd.rpc('auth_user_id');
    const { data: someoneElse } = await tgd.rpc('auth_user_id');

    // Cố tình khai người tạo là NGƯỜI KHÁC. Nếu hệ thống tin lời khai này thì cột "người
    // tạo" trở thành thứ giả được, và nhật ký truy vết mất giá trị.
    const created = await createCustomer(kd, { created_by: someoneElse, responsible_user_id: me });

    const { data: after } = await kd
      .from('customers')
      .select('created_at, created_by, updated_at, updated_by')
      .eq('id', created.id)
      .single();
    expect(after!.created_by, 'người tạo phải là người đang đăng nhập, không phải lời khai').toBe(
      me,
    );
    expect(after!.updated_by).toBe(me);

    const { error: updateError } = await kd
      .from('customers')
      .update({ contact_person: 'Người liên hệ mới' })
      .eq('id', created.id);
    expect(updateError).toBeNull();

    const { data: touched } = await kd
      .from('customers')
      .select('created_at, created_by, updated_at, updated_by')
      .eq('id', created.id)
      .single();

    // "Cập nhật gần nhất" trên màn hình Chi tiết đọc đúng cột này — không nhích lên nghĩa là
    // màn hình đang hiển thị một con số sai.
    expect(new Date(touched!.updated_at).getTime()).toBeGreaterThan(
      new Date(after!.updated_at).getTime(),
    );
    // Nguồn gốc hồ sơ là bất biến: sửa nội dung không được viết lại người/lúc tạo.
    expect(touched!.created_at).toBe(after!.created_at);
    expect(touched!.created_by).toBe(after!.created_by);
  });

  it('không đổi được mã hồ sơ khách hàng — mã là căn cứ truy ngược', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data: me } = await kd.rpc('auth_user_id');
    const created = await createCustomer(kd, { responsible_user_id: me });

    const { error } = await kd
      .from('customers')
      .update({ code: `${created.code}-SUA` })
      .eq('id', created.id);
    expect(error, 'sửa mã hồ sơ phải bị chặn').toBeTruthy();
    expect(error!.message).toContain('mã hồ sơ');
  });

  it('đồng nghiệp XEM được nhưng KHÔNG sửa được hồ sơ của người khác (Mẫu B)', async () => {
    const kdNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: me } = await kdNvc.rpc('auth_user_id');
    const created = await createCustomer(kdNvc, { responsible_user_id: me });

    // Khách hàng là bảng DÙNG CHUNG (Backend Schema 2.2) — nhìn thấy là đúng.
    const { data: seen } = await kdNvo.from('customers').select('id').eq('id', created.id);
    expect(seen).toHaveLength(1);

    // Nhưng sửa thì không. PostgREST không báo 42501 cho trường hợp này — nó cập nhật
    // 0 dòng và trả về error null, nên phải khẳng định bằng dữ liệu chứ không bằng mã lỗi.
    await kdNvo.from('customers').update({ name: `${TEST_PREFIX} Bị sửa trộm` }).eq('id', created.id);
    const { data: unchanged } = await kdNvc
      .from('customers')
      .select('name')
      .eq('id', created.id)
      .single();
    expect(unchanged!.name).not.toContain('Bị sửa trộm');
  });

  it('hồ sơ CHƯA PHÂN CÔNG thì người khác nhận được — không bị đóng băng', async () => {
    const kdNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const created = await createCustomer(kdNvc, { responsible_user_id: null });
    const { data: nvoUser } = await kdNvo.rpc('auth_user_id');

    const { error } = await kdNvo
      .from('customers')
      .update({ responsible_user_id: nvoUser })
      .eq('id', created.id)
      .select('id')
      .single();
    expect(error, 'hồ sơ vô chủ phải nhận được, không được khoá chặt hơn hồ sơ có chủ').toBeNull();
  });

  it('chuyển người chịu trách nhiệm xong thì người cũ hết sửa được', async () => {
    const kdNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: me } = await kdNvc.rpc('auth_user_id');
    const { data: nvoUser } = await kdNvo.rpc('auth_user_id');
    const created = await createCustomer(kdNvc, { responsible_user_id: me });

    const { error: handover } = await kdNvc
      .from('customers')
      .update({ responsible_user_id: nvoUser })
      .eq('id', created.id)
      .select('id')
      .single();
    expect(handover).toBeNull();

    await kdNvc.from('customers').update({ notes: `${TEST_PREFIX} sau khi chuyển` }).eq('id', created.id);
    const { data: after } = await kdNvo
      .from('customers')
      .select('notes')
      .eq('id', created.id)
      .single();
    expect(after!.notes, 'người đã chuyển giao không còn quyền sửa').toBeNull();
  });
});

/**
 * Module DA — Dự án và Đấu thầu.
 *
 * Ba nhóm khẳng định, đều thuộc loại "sai mà không có triệu chứng":
 *  1. **Mẫu D** — giá vốn và lợi nhuận. Sai ở đây nghĩa là người không được phép đọc được
 *     giá vốn của công ty, và không ai biết vì việc đọc không để lại dấu vết (PRD NEN-07).
 *  2. **Luồng duyệt giá** (DA-07). Nộp thầu bằng giá chưa duyệt thì chữ ký phê duyệt vô nghĩa.
 *  3. **Ngân sách thi công** (DA-09) — mắt xích nối Giai đoạn 1 sang Giai đoạn 2. Sai ở đây
 *     thì Thi công điều hành công trình bằng một bộ số không khớp dự toán đã duyệt.
 */
describeDb('DA — gói thầu, dự toán và ngân sách', () => {
  /** Gói thầu để thử. Trả về id và mã. */
  async function createBiddingProject(
    client: SupabaseClient,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string; companyId: string }> {
    const { data: company } = await client
      .from('companies')
      .select('id')
      .eq('code', 'NVC')
      .single();
    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'DA',
    });

    const { data, error } = await client
      .from('bidding_projects')
      .insert({
        code,
        company_id: company!.id,
        name: `${TEST_PREFIX} Nhà xưởng ${Date.now()}`,
        responsible_user_id: me,
        ...extra,
      })
      .select('id, code')
      .single();
    if (error) throw new Error(error.message);
    return { ...(data as { id: string; code: string }), companyId: company!.id };
  }

  /** Dự toán nháp kèm dòng chi tiết. */
  async function createEstimate(
    client: SupabaseClient,
    project: { id: string; code: string; companyId: string },
    bidPrice: number,
  ): Promise<string> {
    const { data: me } = await client.rpc('auth_user_id');
    const { data: estimateCode } = await client.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'DT',
    });

    const { data, error } = await client
      .from('estimates')
      .insert({
        code: estimateCode,
        company_id: project.companyId,
        bidding_project_id: project.id,
        bid_price: bidPrice,
        basis_notes: `${TEST_PREFIX} căn cứ lập giá`,
        prepared_by: me,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  it('cột giá vốn KHÔNG đọc thẳng được, kể cả Tổng Giám đốc (Mẫu D, NEN-07)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 800_000_000);

    // Không phải "không thấy dòng" mà là "không đọc được cột": quyền bị thu hồi ở tầng CSDL,
    // nên đường vòng qua PostgREST cũng không lấy được.
    for (const [who, client] of [
      ['Dự án – Đấu thầu', dt],
      ['Tổng Giám đốc', tgd],
    ] as const) {
      const { error } = await client
        .from('estimates')
        .select('id, direct_cost, profit_amount')
        .eq('id', estimateId);
      expect(error, `${who} vẫn đọc được cột giá vốn bằng SELECT thẳng`).toBeTruthy();
      expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    }

    // Còn giá dự thầu thì phải đọc được — đó là con số gửi ra ngoài.
    const { data, error: priceError } = await dt
      .from('estimates')
      .select('id, code, version, status, bid_price')
      .eq('id', estimateId)
      .single();
    expect(priceError).toBeNull();
    expect(Number(data!.bid_price)).toBe(800_000_000);
  });

  it('xem giá vốn qua hàm thì được, và lượt xem ĐƯỢC GHI NHẬT KÝ (NEN-07)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 500_000_000);

    const { error: saveError } = await dt.rpc('save_estimate_costs', {
      p_estimate_id: estimateId,
      p_direct_cost: 300_000_000,
      p_overhead_cost: 40_000_000,
      p_contingency_cost: 20_000_000,
      p_finance_cost: 10_000_000,
      p_tax_amount: 50_000_000,
      p_profit_amount: 80_000_000,
      p_profit_margin_percent: 16,
    });
    expect(saveError).toBeNull();

    const { data: breakdown, error } = await dt.rpc('estimate_cost_breakdown', {
      p_estimate_id: estimateId,
    });
    expect(error).toBeNull();
    expect(Number(breakdown![0].direct_cost)).toBe(300_000_000);
    expect(Number(breakdown![0].profit_amount)).toBe(80_000_000);

    // Nhật ký chỉ vai trò giám sát đọc được — dùng Tổng Giám đốc để kiểm chứng.
    const { data: logs } = await tgd
      .from('sensitive_access_logs')
      .select('sensitive_kind, action, entity_type')
      .eq('entity_id', estimateId)
      .order('created_at');
    expect(logs!.length, 'phải có ít nhất một lượt ghi (edit) và một lượt xem (view)').toBeGreaterThanOrEqual(2);
    expect(logs!.every((l) => l.sensitive_kind === 'cost')).toBe(true);
    expect(logs!.map((l) => l.action)).toContain('view');
    expect(logs!.map((l) => l.action)).toContain('edit');
  });

  it('đơn giá là giá vốn — vai trò ngoài danh sách không thấy dòng nào (DA-05)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const kt = await signInAs(ACCOUNTS.ketoan);
    const { data: company } = await dt.from('companies').select('id').eq('code', 'NVC').single();

    const { error } = await dt.from('unit_prices').insert({
      company_id: company!.id,
      item_code: `TEST-${Date.now()}`,
      name: `${TEST_PREFIX} Thép hộp 50x50`,
      unit: 'kg',
      cost_group: 'vat_tu',
      price: 21_500,
      source: 'bao_gia_ncc',
      effective_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).toBeNull();

    const { data: seenByDt } = await dt.from('unit_prices').select('id').limit(5);
    expect(seenByDt!.length).toBeGreaterThan(0);

    const { data: seenByKt } = await kt.from('unit_prices').select('id').limit(5);
    expect(seenByKt, 'Kế toán không nằm trong danh sách vai trò xem giá vốn').toEqual([]);
  });

  it('thành tiền do CSDL tính, không tin con số trình duyệt gửi lên (DA-06)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 400_000_000);

    const { data: count, error } = await dt.rpc('save_estimate_items', {
      p_estimate_id: estimateId,
      p_items: [
        {
          cost_group: 'vat_tu',
          description: 'Thép hình',
          unit: 'kg',
          quantity: 1000,
          unit_price: 21_500,
          // Con số sai cố ý: nếu hệ thống tin nó thì bảng dự toán cộng ra số khác.
          amount: 1,
        },
        {
          cost_group: 'nhan_cong',
          description: 'Nhân công lắp dựng',
          unit: 'công',
          quantity: 200,
          unit_price: 350_000,
          amount: 1,
        },
      ],
    });
    expect(error).toBeNull();
    expect(count).toBe(2);

    const { data: items } = await dt
      .from('estimate_items')
      .select('description, amount')
      .eq('estimate_id', estimateId)
      .order('description');
    expect(items!.map((i) => Number(i.amount))).toEqual([70_000_000, 21_500_000]);

    // Tổng chi phí trực tiếp phải khớp các dòng vừa ghi.
    const { data: breakdown } = await dt.rpc('estimate_cost_breakdown', {
      p_estimate_id: estimateId,
    });
    expect(Number(breakdown![0].direct_cost)).toBe(91_500_000);
  });

  it('CSDL cấp số phiên bản dự toán, chỉ MỘT bản đang hiệu lực (DA-07, NEN-05)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const project = await createBiddingProject(dt);
    await createEstimate(dt, project, 400_000_000);
    await createEstimate(dt, project, 420_000_000);

    const { data: versions } = await dt
      .from('estimates')
      .select('code, version, is_current_version')
      .eq('bidding_project_id', project.id)
      .order('version');

    expect(versions!.map((v) => v.version)).toEqual([1, 2]);
    // Cùng một mã hồ sơ qua các phiên bản — nhìn mã là biết cùng một bộ dự toán.
    expect(new Set(versions!.map((v) => v.code)).size).toBe(1);
    expect(versions!.filter((v) => v.is_current_version)).toHaveLength(1);
    expect(versions!.at(-1)!.is_current_version).toBe(true);
  });

  it('vượt hạn mức thì người lập giá KHÔNG tự duyệt được, Tổng Giám đốc thì được (DA-07)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    // 800 triệu > hạn mức 500 triệu của vai trò Dự án – Đấu thầu.
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 800_000_000);

    const { data: approvalId, error: requestError } = await dt.rpc('request_estimate_approval', {
      p_estimate_id: estimateId,
    });
    expect(requestError).toBeNull();

    const { data: staged } = await dt
      .from('bidding_projects')
      .select('stage')
      .eq('id', project.id)
      .single();
    expect(staged!.stage).toBe('cho_duyet_gia');

    const { error: selfApprove } = await dt.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: null,
    });
    expect(selfApprove, 'vượt hạn mức mà vẫn duyệt được là hỏng Mẫu C').toBeTruthy();

    const { error: bossApprove } = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Giá hợp lý so với mặt bằng thị trường.',
    });
    expect(bossApprove).toBeNull();

    const { data: after } = await dt
      .from('estimates')
      .select('status, approved_at')
      .eq('id', estimateId)
      .single();
    expect(after!.status).toBe('completed');
    expect(after!.approved_at).not.toBeNull();

    const { data: project2 } = await dt
      .from('bidding_projects')
      .select('stage')
      .eq('id', project.id)
      .single();
    expect(project2!.stage).toBe('da_duyet_gia');

    // Đã duyệt thì không sửa giá được nữa — nếu sửa được, chữ ký duyệt vô nghĩa.
    await dt.from('estimates').update({ bid_price: 100 }).eq('id', estimateId);
    const { data: unchanged } = await dt
      .from('estimates')
      .select('bid_price')
      .eq('id', estimateId)
      .single();
    expect(Number(unchanged!.bid_price)).toBe(800_000_000);
  });

  it('không nộp thầu được khi giá chưa duyệt hoặc hồ sơ bắt buộc còn thiếu (DA-08)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const project = await createBiddingProject(dt);

    const { error: noPrice } = await dt.rpc('submit_bid', { p_bidding_project_id: project.id });
    expect(noPrice).toBeTruthy();
    expect(noPrice!.message).toContain('phê duyệt');

    const estimateId = await createEstimate(dt, project, 200_000_000);
    const { data: approvalId } = await dt.rpc('request_estimate_approval', {
      p_estimate_id: estimateId,
    });
    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Duyệt.',
    });

    await dt.from('bid_documents').insert({
      company_id: project.companyId,
      bidding_project_id: project.id,
      category: 'phap_ly',
      name: 'Giấy đăng ký kinh doanh',
      is_required: true,
    });

    const { error: missingDocs } = await dt.rpc('submit_bid', {
      p_bidding_project_id: project.id,
    });
    expect(missingDocs, 'thiếu hồ sơ bắt buộc mà vẫn nộp được là phát hiện quá muộn').toBeTruthy();

    await dt
      .from('bid_documents')
      .update({ submitted_at: new Date().toISOString() })
      .eq('bidding_project_id', project.id);

    const { error: submitted } = await dt.rpc('submit_bid', {
      p_bidding_project_id: project.id,
    });
    expect(submitted).toBeNull();

    // Nộp rồi thì hồ sơ đóng băng: bộ trên hệ thống phải khớp bộ đã gửi chủ đầu tư.
    await dt.from('bid_documents').update({ notes: 'sửa sau khi nộp' }).eq('bidding_project_id', project.id);
    const { data: docs } = await dt
      .from('bid_documents')
      .select('notes')
      .eq('bidding_project_id', project.id);
    expect(docs![0]!.notes).toBeNull();
  });

  it('trượt thầu bắt buộc nêu nguyên nhân (DA-08)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 150_000_000);
    const { data: approvalId } = await dt.rpc('request_estimate_approval', {
      p_estimate_id: estimateId,
    });
    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Duyệt.',
    });
    await dt.rpc('submit_bid', { p_bidding_project_id: project.id });

    const { error: noReason } = await dt.rpc('record_bid_result', {
      p_bidding_project_id: project.id,
      p_won: false,
      p_reason: '   ',
    });
    expect(noReason, 'trượt thầu không nêu nguyên nhân thì gói sau lặp lại sai lầm').toBeTruthy();

    const { error: ok } = await dt.rpc('record_bid_result', {
      p_bidding_project_id: project.id,
      p_won: false,
      p_reason: 'Giá cao hơn đối thủ khoảng 7%.',
    });
    expect(ok).toBeNull();
  });

  it('ngân sách thi công sinh từ dự toán ĐÃ DUYỆT, dòng lợi nhuận chỉ Ban Giám đốc thấy (DA-09)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const project = await createBiddingProject(dt);
    const estimateId = await createEstimate(dt, project, 500_000_000);

    await dt.rpc('save_estimate_items', {
      p_estimate_id: estimateId,
      p_items: [
        { cost_group: 'vat_tu', description: 'Thép', unit: 'kg', quantity: 1000, unit_price: 21_500 },
        { cost_group: 'nhan_cong', description: 'Nhân công', unit: 'công', quantity: 100, unit_price: 350_000 },
      ],
    });
    await dt.rpc('save_estimate_costs', {
      p_estimate_id: estimateId,
      p_direct_cost: 56_500_000,
      p_overhead_cost: 20_000_000,
      p_contingency_cost: 10_000_000,
      p_finance_cost: 0,
      p_tax_amount: 0,
      p_profit_amount: 60_000_000,
      p_profit_margin_percent: 12,
    });

    // Chưa trúng thầu thì chưa lập ngân sách.
    const { error: tooEarly } = await dt.rpc('generate_project_budget', {
      p_bidding_project_id: project.id,
    });
    expect(tooEarly).toBeTruthy();

    const { data: approvalId } = await dt.rpc('request_estimate_approval', {
      p_estimate_id: estimateId,
    });
    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Duyệt.',
    });
    await dt.from('bid_documents').insert({
      company_id: project.companyId,
      bidding_project_id: project.id,
      category: 'bang_gia',
      name: 'Bảng giá dự thầu',
      is_required: false,
    });
    await dt.rpc('submit_bid', { p_bidding_project_id: project.id });
    await dt.rpc('record_bid_result', { p_bidding_project_id: project.id, p_won: true });

    const { data: rows, error } = await dt.rpc('generate_project_budget', {
      p_bidding_project_id: project.id,
    });
    expect(error).toBeNull();
    expect(rows).toBe(2);

    // Lập hai lần là có hai bộ số cho cùng một công trình — đúng thứ PRD Mục 2.3 cấm.
    const { error: twice } = await dt.rpc('generate_project_budget', {
      p_bidding_project_id: project.id,
    });
    expect(twice).toBeTruthy();

    const { data: seenByDt } = await dt
      .from('project_budgets')
      .select('cost_group, budgeted_amount')
      .eq('bidding_project_id', project.id);
    const { data: seenByTgd } = await tgd
      .from('project_budgets')
      .select('cost_group, budgeted_amount')
      .eq('bidding_project_id', project.id);

    expect(seenByDt!.map((b) => b.cost_group)).not.toContain('loi_nhuan');
    expect(seenByTgd!.map((b) => b.cost_group)).toContain('loi_nhuan');
    // Ngân sách vật tư/nhân công thì cả hai đều thấy — Thi công phải điều hành được.
    expect(seenByDt!.map((b) => b.cost_group).sort()).toEqual(
      ['chi_phi_chung', 'du_phong', 'nhan_cong', 'vat_tu'].sort(),
    );
  });

  it('pháp nhân khác KHÔNG thấy gói thầu (Mẫu A, NEN-01)', async () => {
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const project = await createBiddingProject(dt);

    const { data: seen } = await kdNvo
      .from('bidding_projects')
      .select('id')
      .eq('id', project.id);
    expect(seen).toEqual([]);
  });
});

/**
 * Module TK — Thiết kế (PRD TK-01 → TK-08, Backend Schema 4.4).
 *
 * Trọng tâm: cơ chế MỘT bản đang hiệu lực. Vướng mắc khảo sát #9 ("không chắc file đang dùng
 * có phải bản mới nhất") chỉ được giải quyết nếu ràng buộc nằm trong CSDL — nên phần lớn
 * test ở đây cố tình đi vòng qua giao diện để chứng minh CSDL vẫn chặn.
 */
describeDb('TK — dự án thiết kế, phiên bản bản vẽ và bàn giao', () => {
  /** Dự án thiết kế nháp của NVO, người chịu trách nhiệm là người tạo. */
  async function createDesignProject(
    client: SupabaseClient,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string; companyId: string }> {
    const { data: company } = await client.from('companies').select('id').eq('code', 'NVO').single();
    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: 'NVO',
      p_record_type: 'TK',
    });

    const { data, error } = await client
      .from('design_projects')
      .insert({
        code,
        company_id: company!.id,
        name: `${TEST_PREFIX} Nhà phố ${Date.now()}`,
        responsible_user_id: me,
        ...extra,
      })
      .select('id, code')
      .single();
    if (error) throw new Error(error.message);
    return { ...(data as { id: string; code: string }), companyId: company!.id };
  }

  /**
   * Một phiên bản kèm tệp trong kho hồ sơ dùng chung — phát hành yêu cầu có tệp, nên mọi
   * test về phát hành đều cần bước này.
   */
  async function createVersion(
    client: SupabaseClient,
    project: { id: string; companyId: string },
    discipline: string,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data: doc, error: docError } = await client
      .from('documents')
      .insert({
        company_id: project.companyId,
        title: `${TEST_PREFIX} Bản vẽ ${discipline} ${Date.now()}`,
        category: 'ban_ve',
        related_entity_type: 'design_projects',
        related_entity_id: project.id,
      })
      .select('id')
      .single();
    if (docError) throw new Error(docError.message);

    const { data: version, error: versionError } = await client.rpc('publish_document_version', {
      p_document_id: (doc as { id: string }).id,
      p_file_url: `test/${Date.now()}.pdf`,
      p_file_name: 'ban-ve.pdf',
      p_change_reason: 'Bản đầu tiên',
    });
    if (versionError) throw new Error(versionError.message);

    const { data, error } = await client
      .from('design_versions')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        discipline,
        title: `${TEST_PREFIX} ${discipline}`,
        document_id: (doc as { id: string }).id,
        document_version_id: version as string,
        change_reason: 'Điều chỉnh theo góp ý',
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  /** Đưa dự án tới trạng thái đủ điều kiện bàn giao: 3 bộ môn xong, phương án khách đã duyệt. */
  async function makeReadyForHandover(
    client: SupabaseClient,
    project: { id: string; companyId: string },
  ): Promise<void> {
    const concept = await createVersion(client, project, 'phuong_an');
    await client.rpc('publish_design_version', { p_version_id: concept });
    await client.rpc('record_design_review', {
      p_version_id: concept,
      p_reviewer_type: 'khach_hang',
      p_decision: 'duyet',
      p_comments: 'Đồng ý phương án mặt bằng.',
      p_reviewer_name: 'Chủ nhà Nguyễn Văn A',
    });

    const { data: me } = await client.rpc('auth_user_id');
    for (const discipline of ['kien_truc', 'ket_cau', 'dien_nuoc']) {
      const versionId = await createVersion(client, project, discipline);
      await client.rpc('publish_design_version', { p_version_id: versionId });
      await client.from('design_discipline_tasks').insert({
        company_id: project.companyId,
        design_project_id: project.id,
        discipline,
        assignee_id: me,
        status: 'hoan_thanh',
        progress_percent: 100,
      });
    }
  }

  it('CSDL cấp số phiên bản theo TỪNG bộ môn, không đánh số chung cả dự án (TK-05)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    await createVersion(tk, project, 'kien_truc');
    await createVersion(tk, project, 'kien_truc');
    const ketCauId = await createVersion(tk, project, 'ket_cau');

    const { data } = await tk
      .from('design_versions')
      .select('discipline, version')
      .eq('design_project_id', project.id)
      .order('version');

    // "Kết cấu bản 2" phải nghĩa là lần thứ hai kết cấu ra bản vẽ — không phải bản thứ ba
    // của cả dự án. Người ngoài công trường không đọc được con số đánh chung.
    expect(data!.filter((v) => v.discipline === 'kien_truc').map((v) => v.version)).toEqual([1, 2]);
    expect(data!.filter((v) => v.discipline === 'ket_cau').map((v) => v.version)).toEqual([1]);

    // Trình duyệt không tự đặt được số phiên bản.
    const { error } = await tk
      .from('design_versions')
      .update({ version: 99 })
      .eq('id', ketCauId);
    expect(error, 'số phiên bản là căn cứ truy ngược, không được sửa').toBeTruthy();
  });

  it('bản mới là NHÁP — chỉ phát hành mới đổi bản đang hiệu lực (TK-05)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const first = await createVersion(tk, project, 'kien_truc');
    const { error: publishError } = await tk.rpc('publish_design_version', {
      p_version_id: first,
    });
    expect(publishError).toBeNull();

    // Bản thứ hai đang soạn KHÔNG được hạ bản công trường đang dùng xuống.
    const second = await createVersion(tk, project, 'kien_truc');
    const { data: afterDraft } = await tk
      .from('design_versions')
      .select('id, version, is_current_version, published_at')
      .eq('design_project_id', project.id)
      .eq('discipline', 'kien_truc')
      .order('version');

    expect(afterDraft!.find((v) => v.id === first)!.is_current_version).toBe(true);
    expect(afterDraft!.find((v) => v.id === second)!.is_current_version).toBe(false);
    expect(afterDraft!.find((v) => v.id === second)!.published_at).toBeNull();

    await tk.rpc('publish_design_version', { p_version_id: second });

    const { data: afterPublish } = await tk
      .from('design_versions')
      .select('id, is_current_version')
      .eq('design_project_id', project.id)
      .eq('discipline', 'kien_truc');

    // Đúng MỘT bản đang hiệu lực sau khi phát hành — đây là điều vướng mắc #9 cần.
    expect(afterPublish!.filter((v) => v.is_current_version).map((v) => v.id)).toEqual([second]);
  });

  it('bản đã phát hành KHÔNG sửa lặng lẽ được, kể cả người phát hành (TK-05)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    const versionId = await createVersion(tk, project, 'ket_cau');
    await tk.rpc('publish_design_version', { p_version_id: versionId });

    // Phát hành là một cam kết đã gửi thông báo cho 5 bộ phận. Sửa sau đó mà không ai biết
    // là đúng cái sai mà cơ chế phiên bản sinh ra để chặn.
    const { data, error } = await tk
      .from('design_versions')
      .update({ title: 'Sửa lén sau khi phát hành' })
      .eq('id', versionId)
      .select('id');
    expect(error === null && data!.length === 0, 'policy phải lọc bản đã phát hành').toBe(true);

    // Phát hành lại lần nữa cũng bị chặn — nếu không thì thông báo bắn hai lần cho cùng một bản.
    const { error: rePublish } = await tk.rpc('publish_design_version', {
      p_version_id: versionId,
    });
    expect(rePublish!.message).toContain('đã phát hành');
  });

  it('phát hành có gửi thông báo cho các bộ phận PRD TK-05 liệt kê', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    const versionId = await createVersion(tk, project, 'kien_truc');

    const { data: notified, error } = await tk.rpc('publish_design_version', {
      p_version_id: versionId,
    });
    expect(error).toBeNull();
    // Ít nhất một người khác phải nhận được — phát hành mà không ai biết thì bằng không
    // phát hành (NEN-03). Người vừa bấm cố ý KHÔNG tự nhận thông báo của chính mình.
    expect(notified).toBeGreaterThan(0);
  });

  it('chưa đính kèm tệp thì không phát hành được — bản vẽ rỗng không dùng để thi công', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { data: empty } = await tk
      .from('design_versions')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        discipline: 'dien_nuoc',
        title: `${TEST_PREFIX} chưa có tệp`,
      })
      .select('id')
      .single();

    const { error } = await tk.rpc('publish_design_version', {
      p_version_id: (empty as { id: string }).id,
    });
    expect(error!.message).toContain('Chưa đính kèm tệp');
  });

  it('bản điều chỉnh bắt buộc nêu nguyên nhân, bản đầu tiên thì không (NEN-05)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { error: firstError } = await tk.from('design_versions').insert({
      company_id: project.companyId,
      design_project_id: project.id,
      discipline: 'kien_truc',
      title: `${TEST_PREFIX} bản đầu`,
    });
    expect(firstError, 'bản đầu tiên không có gì để nêu nguyên nhân').toBeNull();

    const { error: secondError } = await tk.from('design_versions').insert({
      company_id: project.companyId,
      design_project_id: project.id,
      discipline: 'kien_truc',
      title: `${TEST_PREFIX} bản hai`,
    });
    expect(secondError!.message).toContain('nguyên nhân');
  });

  it('một dự án chỉ MỘT đầu bài đang hiệu lực, bản cũ khoá lại (TK-01)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const insertBrief = (extra: Record<string, unknown>) =>
      tk
        .from('design_briefs')
        .insert({
          company_id: project.companyId,
          design_project_id: project.id,
          ...extra,
        })
        .select('id, version')
        .single();

    const { data: v1, error: e1 } = await insertBrief({ design_task: 'Thiết kế nhà 3 tầng' });
    expect(e1).toBeNull();

    const { error: noReason } = await insertBrief({ design_task: 'Đổi thành 4 tầng' });
    expect(noReason!.message).toContain('nguyên nhân');

    const { data: v2 } = await insertBrief({
      design_task: 'Đổi thành 4 tầng',
      change_reason: 'Khách bổ sung phòng thờ ở tầng trên cùng',
    });
    expect((v2 as { version: number }).version).toBe(2);

    const { data: briefs } = await tk
      .from('design_briefs')
      .select('id, version, is_current_version')
      .eq('design_project_id', project.id)
      .order('version');
    expect(briefs!.filter((b) => b.is_current_version).map((b) => b.version)).toEqual([2]);

    // Bản đã hết hiệu lực không sửa được: sửa lịch sử thì không còn là lịch sử.
    const { data: edited } = await tk
      .from('design_briefs')
      .update({ design_task: 'sửa bản cũ' })
      .eq('id', (v1 as { id: string }).id)
      .select('id');
    expect(edited).toEqual([]);
  });

  it('khách duyệt phương án thì tự mở khoá bước hồ sơ kỹ thuật (TK-03)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    // Chưa phát hành phương án thì chưa gửi khách xem được.
    const { error: tooEarly } = await tk.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'cho_khach_duyet',
    });
    expect(tooEarly!.message).toContain('Chưa phát hành phương án');

    const concept = await createVersion(tk, project, 'phuong_an');
    await tk.rpc('publish_design_version', { p_version_id: concept });
    await tk.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'cho_khach_duyet',
    });

    // Ghi nhận khách hàng thì bắt buộc có tên người góp ý — "khách hàng" chung chung thì
    // sau này không đối chiếu được với ai.
    const { error: noName } = await tk.rpc('record_design_review', {
      p_version_id: concept,
      p_reviewer_type: 'khach_hang',
      p_decision: 'duyet',
      p_comments: 'Đồng ý.',
    });
    expect(noName!.message).toContain('tên người góp ý');

    const { error } = await tk.rpc('record_design_review', {
      p_version_id: concept,
      p_reviewer_type: 'khach_hang',
      p_decision: 'duyet',
      p_comments: 'Đồng ý phương án mặt bằng tầng 1.',
      p_reviewer_name: 'Chủ nhà Nguyễn Văn A',
    });
    expect(error).toBeNull();

    const { data: after } = await tk
      .from('design_projects')
      .select('stage')
      .eq('id', project.id)
      .single();
    expect(after!.stage, 'xác nhận của khách là căn cứ chuyển bước (TK-03)').toBe('ho_so_ky_thuat');

    const { data: version } = await tk
      .from('design_versions')
      .select('customer_approved_at')
      .eq('id', concept)
      .single();
    expect(version!.customer_approved_at).not.toBeNull();
  });

  it('lịch sử góp ý chỉ ghi thêm — không sửa, không xoá, không ghi thẳng (TK-03)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    const concept = await createVersion(tk, project, 'phuong_an');
    await tk.rpc('publish_design_version', { p_version_id: concept });
    await tk.rpc('record_design_review', {
      p_version_id: concept,
      p_reviewer_type: 'noi_bo',
      p_decision: 'gop_y',
      p_comments: 'Cân nhắc lại vị trí cầu thang.',
    });

    const { data: reviews } = await tk
      .from('design_reviews')
      .select('id, decision')
      .eq('design_version_id', concept);
    expect(reviews!.length).toBe(1);

    // Ghi thẳng vào bảng lịch sử là tự khai "khách đã duyệt" mà không đi qua kiểm tra nào.
    const { error: insertError } = await tk.from('design_reviews').insert({
      company_id: project.companyId,
      design_version_id: concept,
      reviewer_type: 'khach_hang',
      decision: 'duyet',
      comments: 'Tự khai',
    });
    expect(insertError).toBeTruthy();

    const { error: updateError } = await tk
      .from('design_reviews')
      .update({ comments: 'Sửa lại lời khách' })
      .eq('id', reviews![0]!.id);
    expect(updateError).toBeTruthy();

    const { error: deleteError } = await tk
      .from('design_reviews')
      .delete()
      .eq('id', reviews![0]!.id);
    expect(deleteError).toBeTruthy();
  });

  it('không bàn giao được khi hồ sơ chưa đồng bộ giữa các bộ môn (TK-04, TK-08)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { data: findings, error } = await tk.rpc('check_design_sync', {
      p_design_project_id: project.id,
    });
    expect(error).toBeNull();
    const codes = (findings as { code: string; blocking: boolean }[]).map((f) => f.code);
    // Dự án rỗng: thiếu cả ba bộ môn và phương án chưa được khách duyệt.
    expect(codes).toContain('thieu_ban_ve');
    expect(codes).toContain('phuong_an_chua_duyet');

    const { error: blocked } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: project.id,
    });
    expect(blocked!.message).toContain('chưa đồng bộ');

    // Không đặt tay bước bàn giao để đi vòng qua kiểm tra được.
    const { error: bypass } = await tk.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'ban_giao',
    });
    expect(bypass!.message).toContain('kiểm tra đồng bộ');
  });

  it('còn xung đột bộ môn chưa xử lý thì vẫn chặn bàn giao (TK-04)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    await makeReadyForHandover(tk, project);

    // Đủ hồ sơ rồi thì mới có nghĩa để thử riêng điều kiện xung đột.
    const { data: readyFindings } = await tk.rpc('check_design_sync', {
      p_design_project_id: project.id,
    });
    expect(
      (readyFindings as { blocking: boolean }[]).filter((f) => f.blocking),
      'đủ ba bộ môn và khách đã duyệt thì không còn hạng mục chặn',
    ).toEqual([]);

    await tk
      .from('design_discipline_tasks')
      .update({ conflict_notes: 'Dầm D3 chắn ngang cửa sổ trục B tầng 2.' })
      .eq('design_project_id', project.id)
      .eq('discipline', 'ket_cau');

    const { data: findings } = await tk.rpc('check_design_sync', {
      p_design_project_id: project.id,
    });
    expect((findings as { code: string }[]).map((f) => f.code)).toContain('con_xung_dot');

    const { error } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: project.id,
    });
    expect(error!.message).toContain('chưa đồng bộ');
  });

  it('yêu cầu thay đổi đã chấp thuận nhưng chưa làm thì chặn bàn giao (TK-06)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    await makeReadyForHandover(tk, project);

    const { data: cr } = await tk
      .from('change_requests')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        title: `${TEST_PREFIX} Dời vị trí bếp`,
        origin: 'khach_hang',
        requester_name: 'Chủ nhà Nguyễn Văn A',
        content: 'Dời bếp sang phía sau nhà.',
        reason: 'Khách muốn mở rộng phòng khách.',
        status: 'chap_thuan',
        schedule_impact_days: 5,
        cost_impact: 12_000_000,
        affected_drawing_count: 4,
      })
      .select('id')
      .single();

    const { error: blocked } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: project.id,
    });
    expect(
      blocked!.message,
      'bàn giao bộ hồ sơ mà chính mình biết là phải sửa thì công trường thi công sai',
    ).toContain('chưa đồng bộ');

    await tk
      .from('change_requests')
      .update({ status: 'da_thuc_hien' })
      .eq('id', (cr as { id: string }).id);

    const { data: notified, error } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: project.id,
    });
    expect(error).toBeNull();
    expect(notified).toBeGreaterThan(0);
  });

  it('bàn giao xong thì hồ sơ đóng băng, nhưng vẫn ghi được yêu cầu thay đổi (TK-08)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    await makeReadyForHandover(tk, project);
    await tk.rpc('handover_design_to_construction', { p_design_project_id: project.id });

    const { data: after } = await tk
      .from('design_projects')
      .select('stage, handed_over_at')
      .eq('id', project.id)
      .single();
    expect(after!.stage).toBe('ban_giao');
    expect(after!.handed_over_at).not.toBeNull();

    // Thêm bản vẽ sau khi công trường đã nhận = hai bộ hồ sơ khác nhau cùng tồn tại, và
    // không ai biết bộ nào đang thi công. Phải đi đường yêu cầu thay đổi (TK-06).
    //
    // Phần header (tên, người chịu trách nhiệm, ghi chú) CỐ Ý vẫn sửa được — đổi người phụ
    // trách sau bàn giao là việc hành chính bình thường; `code` và `company_id` đã bị trigger
    // định danh khoá riêng.
    const { error: frozenError } = await tk.from('design_versions').insert({
      company_id: project.companyId,
      design_project_id: project.id,
      discipline: 'kien_truc',
      title: `${TEST_PREFIX} bản thêm sau bàn giao`,
      change_reason: 'Sửa lén sau bàn giao',
    });
    expect(frozenError, 'hồ sơ đã bàn giao phải đóng băng').toBeTruthy();

    const { data: brief } = await tk
      .from('design_briefs')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        design_task: 'Đổi đầu bài sau bàn giao',
        change_reason: 'thử',
      })
      .select('id');
    expect(brief ?? [], 'đầu bài cũng đóng băng sau bàn giao').toEqual([]);

    const { error: rehandover } = await tk.rpc('handover_design_to_construction', {
      p_design_project_id: project.id,
    });
    expect(rehandover!.message).toContain('đã bàn giao');

    // Nhưng TK-08 yêu cầu "xử lý sai khác/thay đổi tại hiện trường" — công trường phải ghi
    // được yêu cầu thay đổi sau bàn giao, nếu không họ quay lại gọi điện và Zalo như cũ.
    const { error: crError } = await tk.from('change_requests').insert({
      company_id: project.companyId,
      design_project_id: project.id,
      title: `${TEST_PREFIX} Sai khác hiện trường`,
      origin: 'cong_truong',
      content: 'Cốt nền thực tế thấp hơn bản vẽ 15cm.',
      reason: 'Sai khác giữa bản vẽ và hiện trạng.',
    });
    expect(crError, 'yêu cầu thay đổi sau bàn giao phải ghi được').toBeNull();
  });

  it('dừng thiết kế bắt buộc nêu nguyên nhân', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { error: noReason } = await tk.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'dung_thiet_ke',
    });
    expect(noReason!.message).toContain('nguyên nhân');

    const { error } = await tk.rpc('move_design_stage', {
      p_design_project_id: project.id,
      p_stage: 'dung_thiet_ke',
      p_reason: 'Khách hàng chuyển sang phương án mua nhà xây sẵn.',
    });
    expect(error).toBeNull();
  });

  it('dự toán NVO dùng CHUNG bảng của Module DA, không có bảng sao chép (TK-07)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    const { data: me } = await tk.rpc('auth_user_id');
    const { data: code } = await tk.rpc('next_record_code', {
      p_company_code: 'NVO',
      p_record_type: 'DT',
    });

    const { data: estimate, error } = await tk
      .from('estimates')
      .insert({
        code,
        company_id: project.companyId,
        design_project_id: project.id,
        bid_price: 1_200_000_000,
        basis_notes: `${TEST_PREFIX} căn cứ lập giá NVO`,
        prepared_by: me,
      })
      .select('id, version')
      .single();
    expect(error, 'kiến trúc sư NVO phải lập được dự toán cho dự án của mình').toBeNull();

    const estimateId = (estimate as { id: string }).id;

    // Cùng cơ chế tính thành tiền của DA-06 — không phải công thức viết lại lần hai.
    const { data: count, error: itemsError } = await tk.rpc('save_estimate_items', {
      p_estimate_id: estimateId,
      p_items: [
        {
          cost_group: 'vat_tu',
          description: 'Gạch ốp lát',
          unit: 'm2',
          quantity: 300,
          unit_price: 250_000,
          amount: 1,
        },
      ],
    });
    expect(itemsError).toBeNull();
    expect(count).toBe(1);

    const { data: breakdown } = await tk.rpc('estimate_cost_breakdown', {
      p_estimate_id: estimateId,
    });
    expect(Number(breakdown![0].direct_cost)).toBe(75_000_000);

    // Và cùng luồng phê duyệt giá qua Hộp thư chung.
    const { data: approvalId, error: approvalError } = await tk.rpc('request_estimate_approval', {
      p_estimate_id: estimateId,
    });
    expect(approvalError).toBeNull();
    expect(approvalId).toBeTruthy();
  });

  it('một dòng dự toán không thuộc cả gói thầu lẫn dự án thiết kế cùng lúc (TK-07)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { error: bothNull } = await tk.from('boq_items').insert({
      company_id: project.companyId,
      name: `${TEST_PREFIX} không có hồ sơ cha`,
      unit: 'm2',
      quantity: 10,
    });
    // Không có cha thì tổng của cả hai bên đều thiếu dòng này mà không ai thấy.
    expect(bothNull).toBeTruthy();
  });

  it('pháp nhân khác KHÔNG thấy dự án thiết kế (Mẫu A, NEN-01)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const dtNvc = await signInAs(ACCOUNTS.dauThauNvc);
    const project = await createDesignProject(tk);

    const { data: seen } = await dtNvc.from('design_projects').select('id').eq('id', project.id);
    expect(seen).toEqual([]);
  });

  it('đồng nghiệp cùng phòng XEM được nhưng KHÔNG sửa tiến độ bộ môn của người khác (Mẫu B)', async () => {
    // Người tạo dự án là KIẾN TRÚC SƯ; bộ môn kết cấu giao cho KỸ SƯ KẾT CẤU. Đồng nghiệp
    // thứ ba trong ví dụ này chính là kiến trúc sư — không phải người được giao bộ môn đó.
    const ketCau = await signInAs(ACCOUNTS.ketCauNvo);
    const kienTruc = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(ketCau);
    const { data: ketCauUser } = await ketCau.rpc('auth_user_id');

    const { data: task } = await ketCau
      .from('design_discipline_tasks')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        discipline: 'ket_cau',
        assignee_id: ketCauUser,
        status: 'dang_lam',
        progress_percent: 40,
      })
      .select('id')
      .single();

    const taskId = (task as { id: string }).id;

    const { data: seen } = await kienTruc
      .from('design_discipline_tasks')
      .select('id, status')
      .eq('id', taskId);
    expect(seen!.length, 'đồng nghiệp cùng phòng phải theo dõi được tiến độ').toBe(1);

    // PostgREST không báo 42501 cho trường hợp này — nó cập nhật 0 dòng và trả về error
    // null, nên khẳng định bằng dữ liệu chứ không bằng mã lỗi.
    await kienTruc
      .from('design_discipline_tasks')
      .update({ status: 'hoan_thanh', progress_percent: 100 })
      .eq('id', taskId);

    const { data: unchanged } = await ketCau
      .from('design_discipline_tasks')
      .select('status')
      .eq('id', taskId)
      .single();
    expect(unchanged!.status, 'người khác không báo hộ hoàn thành bộ môn được').toBe('dang_lam');
  });

  it('bộ môn CHƯA GIAO cho ai vẫn nhận được — không bị đóng băng', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    const { data: task } = await tk
      .from('design_discipline_tasks')
      .insert({
        company_id: project.companyId,
        design_project_id: project.id,
        discipline: 'dien_nuoc',
        status: 'chua_bat_dau',
      })
      .select('id')
      .single();

    const { data: me } = await tk.rpc('auth_user_id');
    const { data: assigned } = await tk
      .from('design_discipline_tasks')
      .update({ assignee_id: me, status: 'dang_lam' })
      .eq('id', (task as { id: string }).id)
      .select('id');
    // Bỏ trống người phụ trách không được phép làm hồ sơ khoá chặt hơn là điền tên ai đó.
    expect(assigned!.length).toBe(1);
  });

  it('không chuyển được dự án thiết kế sang pháp nhân khác (NEN-01)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);
    const { data: nvc } = await tk.from('companies').select('id').eq('code', 'NVC').single();

    const { error } = await tk
      .from('design_projects')
      .update({ company_id: (nvc as { id: string } | null)?.id })
      .eq('id', project.id);
    expect(error, 'đổi pháp nhân là chuyển doanh thu/chi phí sang P&L khác').toBeTruthy();
  });

  it('người chưa đăng nhập KHÔNG gọi được hàm nghiệp vụ TK', async () => {
    // Mọi hàm SECURITY DEFINER đều lộ ra qua PostgREST cho vai trò `anon` — đó là mặc định
    // của nền tảng, không tắt được. Nên mỗi hàm phải TỰ chặn, và đây là chỗ khẳng định điều đó.
    const anon = anonClient();
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    for (const [fn, params] of [
      ['check_design_sync', { p_design_project_id: project.id }],
      ['handover_design_to_construction', { p_design_project_id: project.id }],
      ['move_design_stage', { p_design_project_id: project.id, p_stage: 'phuong_an' }],
    ] as const) {
      const { error } = await anon.rpc(fn, params);
      expect(error, `${fn} phải từ chối người chưa đăng nhập`).toBeTruthy();
    }
  });

  it('không xóa hẳn được dự án thiết kế (Backend Schema 1.4)', async () => {
    const tk = await signInAs(ACCOUNTS.thietKeNvo);
    const project = await createDesignProject(tk);

    await tk.from('design_projects').delete().eq('id', project.id);
    const { data: still } = await tk.from('design_projects').select('id').eq('id', project.id);
    expect(still, 'không có policy DELETE ⇒ xoá 0 dòng, hồ sơ vẫn còn').toHaveLength(1);
  });
});

/**
 * Module HD — Hợp đồng (PRD HD-01 → HD-05, Backend Schema 4.5).
 *
 * Đây là module KHÉP LẠI Giai đoạn 1, nên trọng tâm test là hai thứ mà tiêu chí nghiệm thu
 * (PRD Mục 7) đòi hỏi: đường truy ngược không đứt, và chữ ký phê duyệt theo hạn mức có
 * nghĩa thật — không sửa được giá trị sau khi đã duyệt.
 */
describeDb('HD — hợp đồng, điều khoản và phát sinh', () => {
  /** Cơ hội đã có báo giá được duyệt — nguồn hợp lệ để soạn hợp đồng theo HD-01. */
  async function createSourceOpportunity(
    client: SupabaseClient,
  ): Promise<{ id: string; companyId: string }> {
    const { data: company } = await client.from('companies').select('id').eq('code', 'NVC').single();
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
        name: `${TEST_PREFIX} Nhà xưởng HD ${Date.now()}`,
        owner_id: me,
        estimated_value: 900_000_000,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: (data as { id: string }).id, companyId: company!.id };
  }

  async function createContract(
    client: SupabaseClient,
    source?: { id: string; companyId: string },
  ): Promise<{ id: string; companyId: string; sourceId: string }> {
    const src = source ?? (await createSourceOpportunity(client));
    const { data, error } = await client.rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: src.id,
      p_type: 'thi_cong',
      p_title: `${TEST_PREFIX} Hợp đồng thi công`,
    });
    if (error) throw new Error(error.message);
    return { id: data as string, companyId: src.companyId, sourceId: src.id };
  }

  /** Ba nhóm điều khoản bắt buộc + giá trị — đủ điều kiện trình ký theo HD-02/HD-05. */
  async function makeReadyToSubmit(
    client: SupabaseClient,
    contract: { id: string; companyId: string },
    value = 900_000_000,
  ): Promise<void> {
    await client.from('contracts').update({ value, start_date: '2026-09-01' }).eq('id', contract.id);
    for (const termType of ['pham_vi', 'gia_tri', 'tien_do_thanh_toan']) {
      await client.from('contract_terms').insert({
        company_id: contract.companyId,
        contract_id: contract.id,
        term_type: termType,
        description: `${TEST_PREFIX} điều khoản ${termType}`,
      });
    }
  }

  async function createAmendment(
    client: SupabaseClient,
    contract: { id: string; companyId: string },
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const { data: me } = await client.rpc('auth_user_id');
    const { data, error } = await client
      .from('contract_amendments')
      .insert({
        company_id: contract.companyId,
        contract_id: contract.id,
        title: `${TEST_PREFIX} Phát sinh móng`,
        content: 'Gia cố nền đất yếu phát hiện khi đào móng.',
        reason: 'Địa chất thực tế khác báo cáo khảo sát.',
        value_change: 40_000_000,
        requested_by: me,
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  it('soạn hợp đồng lấy sẵn khách hàng và tên từ hồ sơ nguồn — không nhập lại (HD-01)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const source = await createSourceOpportunity(kd);
    const contract = await createContract(kd, source);

    const { data } = await kd
      .from('contracts')
      .select('code, title, source_type, source_id, company_id, stage, responsible_user_id')
      .eq('id', contract.id)
      .single();

    expect(data!.source_type).toBe('opportunities');
    expect(data!.source_id, 'đường truy ngược về cơ hội gốc (PRD Mục 7)').toBe(source.id);
    expect(data!.company_id).toBe(source.companyId);
    expect(data!.stage).toBe('nhap');
    expect(data!.code).toMatch(/^NVC-HD-\d{4}-\d{4}$/);
  });

  it('một hồ sơ nguồn chỉ sinh MỘT hợp đồng — hai bản là đếm doanh thu hai lần', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const source = await createSourceOpportunity(kd);
    await createContract(kd, source);

    const { error } = await kd.rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: source.id,
      p_type: 'thi_cong',
      p_title: `${TEST_PREFIX} Bản thứ hai`,
    });
    expect(error!.message).toContain('đã có hợp đồng');
  });

  it('không đổi được hồ sơ nguồn sau khi tạo — đứt đường truy ngược (PRD Mục 7)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);
    const other = await createSourceOpportunity(kd);

    const { error } = await kd
      .from('contracts')
      .update({ source_id: other.id })
      .eq('id', contract.id);
    expect(error, 'source_id nằm trong danh sách cột định danh bị khoá').toBeTruthy();
  });

  it('hợp đồng không nhận hồ sơ nguồn của pháp nhân khác (NEN-01)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data: nvc } = await kd.from('companies').select('id').eq('code', 'NVC').single();
    const nvoSource = await (async () => {
      const { data: company } = await kdNvo.from('companies').select('id').eq('code', 'NVO').single();
      const { data: customer } = await kdNvo.from('customers').select('id').limit(1).maybeSingle();
      const { data: me } = await kdNvo.rpc('auth_user_id');
      const { data: code } = await kdNvo.rpc('next_record_code', {
        p_company_code: 'NVO',
        p_record_type: 'CH',
      });
      const { data } = await kdNvo
        .from('opportunities')
        .insert({
          code,
          company_id: company!.id,
          customer_id: customer!.id,
          name: `${TEST_PREFIX} Cơ hội NVO ${Date.now()}`,
          owner_id: me,
        })
        .select('id')
        .single();
      return (data as { id: string }).id;
    })();

    const { data: code } = await kd.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'HD',
    });
    const { error } = await kd.from('contracts').insert({
      code,
      company_id: (nvc as { id: string }).id,
      title: `${TEST_PREFIX} Hợp đồng lệch pháp nhân`,
      type: 'thi_cong',
      source_type: 'opportunities',
      source_id: nvoSource,
    });
    // Trigger phải chặn: khoá ngoại không kiểm hộ được tham chiếu đa hình.
    expect(error).toBeTruthy();
  });

  it('thiếu điều khoản bắt buộc thì không trình ký được (HD-02, HD-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);

    // Chưa có giá trị.
    const { error: noValue } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });
    expect(noValue!.message).toContain('giá trị hợp đồng');

    await kd.from('contracts').update({ value: 900_000_000 }).eq('id', contract.id);

    const { error: noTerms } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });
    expect(noTerms!.message).toContain('điều khoản bắt buộc');

    await makeReadyToSubmit(kd, contract);
    const { error } = await kd.rpc('submit_contract_approval', { p_contract_id: contract.id });
    expect(error).toBeNull();
  });

  it('vượt hạn mức thì người soạn KHÔNG tự duyệt được, Tổng Giám đốc thì được (HD-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const dt = await signInAs(ACCOUNTS.dauThauNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const contract = await createContract(kd);

    // 900 triệu vượt hạn mức 200 triệu của Dự án – Đấu thầu (DEFAULT_APPROVAL_LIMITS).
    await makeReadyToSubmit(kd, contract, 900_000_000);
    const { data: approvalId } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });

    const { error: overLimit } = await dt.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(overLimit!.message).toContain('hạn mức');

    const { error } = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(error).toBeNull();

    const { data: after } = await kd
      .from('contracts')
      .select('stage, approved_at')
      .eq('id', contract.id)
      .single();
    expect(after!.stage).toBe('da_duyet');
    expect(after!.approved_at).not.toBeNull();
  });

  it('hợp đồng đã trình ký KHÔNG sửa được giá trị — nếu không chữ ký duyệt vô nghĩa', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);
    await makeReadyToSubmit(kd, contract, 900_000_000);
    await kd.rpc('submit_contract_approval', { p_contract_id: contract.id });

    const { data: edited } = await kd
      .from('contracts')
      .update({ value: 100_000_000 })
      .eq('id', contract.id)
      .select('id');
    expect(edited, 'policy chỉ cho sửa hợp đồng còn ở bước Nháp').toEqual([]);

    const { data: unchanged } = await kd
      .from('contracts')
      .select('value')
      .eq('id', contract.id)
      .single();
    expect(Number(unchanged!.value)).toBe(900_000_000);
  });

  it('từ chối bắt buộc nêu lý do, và trả hợp đồng về Nháp để sửa (HD-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const contract = await createContract(kd);
    await makeReadyToSubmit(kd, contract);
    const { data: approvalId } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });

    const { error: noReason } = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'rejected',
    });
    expect(noReason!.message).toContain('lý do');

    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'rejected',
      p_note: 'Tiến độ thanh toán bất lợi, đàm phán lại đợt cuối.',
    });

    const { data: after } = await kd
      .from('contracts')
      .select('stage')
      .eq('id', contract.id)
      .single();
    // Không nằm mãi ở "chờ phê duyệt": người soạn phải sửa được để trình lại.
    expect(after!.stage).toBe('nhap');
  });

  it('chưa phê duyệt nội bộ thì không ghi nhận đã ký được (HD-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const contract = await createContract(kd);
    await makeReadyToSubmit(kd, contract);

    const { error: tooEarly } = await kd.rpc('sign_contract', {
      p_contract_id: contract.id,
      p_contract_number: 'HD-01/2026',
      p_signed_date: '2026-09-01',
    });
    expect(tooEarly!.message).toContain('phê duyệt nội bộ');

    const { data: approvalId } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });
    await tgd.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' });

    const { error: noNumber } = await kd.rpc('sign_contract', {
      p_contract_id: contract.id,
      p_contract_number: '  ',
      p_signed_date: '2026-09-01',
    });
    expect(noNumber!.message).toContain('số hợp đồng');

    const { error } = await kd.rpc('sign_contract', {
      p_contract_id: contract.id,
      p_contract_number: 'HD-01/2026',
      p_signed_date: '2026-09-01',
    });
    expect(error).toBeNull();

    const { data: after } = await kd
      .from('contracts')
      .select('stage, contract_number, signed_at')
      .eq('id', contract.id)
      .single();
    expect(after!.stage).toBe('da_ky');
    expect(after!.contract_number).toBe('HD-01/2026');
    expect(after!.signed_at).not.toBeNull();
  });

  it('phát sinh KHÔNG thực hiện được khi khách chưa xác nhận (HD-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const contract = await createContract(kd);
    const amendmentId = await createAmendment(kd, contract);

    // Đây là điều khoản khó nhất của module: "làm trước, hợp thức hóa sau" chính là chỗ gây
    // tranh chấp với khách hàng, nên chặn ở CSDL chứ không ở giao diện.
    const { error: notApproved } = await kd.rpc('execute_amendment', {
      p_amendment_id: amendmentId,
    });
    expect(notApproved!.message).toContain('chưa được phê duyệt');

    // Chưa gửi báo giá thì không trình duyệt được.
    const { error: noQuote } = await kd.rpc('submit_amendment_approval', {
      p_amendment_id: amendmentId,
    });
    expect(noQuote!.message).toContain('báo giá');

    await kd
      .from('contract_amendments')
      .update({ quote_sent_at: new Date().toISOString() })
      .eq('id', amendmentId);

    const { data: approvalId, error } = await kd.rpc('submit_amendment_approval', {
      p_amendment_id: amendmentId,
    });
    expect(error).toBeNull();
    await tgd.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' });

    // Đã duyệt nội bộ nhưng khách chưa xác nhận ⇒ vẫn chặn.
    const { error: noCustomer } = await kd.rpc('execute_amendment', {
      p_amendment_id: amendmentId,
    });
    expect(noCustomer!.message).toContain('xác nhận của khách hàng');

    const { error: noName } = await kd.rpc('confirm_amendment_by_customer', {
      p_amendment_id: amendmentId,
      p_confirmed_by: '   ',
    });
    expect(noName!.message).toContain('tên người xác nhận');

    await kd.rpc('confirm_amendment_by_customer', {
      p_amendment_id: amendmentId,
      p_confirmed_by: 'Chủ đầu tư Trần Văn B',
    });

    const { error: done } = await kd.rpc('execute_amendment', { p_amendment_id: amendmentId });
    expect(done).toBeNull();
  });

  it('trường hợp khẩn cấp bỏ qua xác nhận khách, nhưng PHẢI ghi rõ người cho phép (HD-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);

    // Đánh dấu khẩn cấp mà không chỉ ra ai cho phép chính là lỗ hổng HD-04 viết ra để bịt.
    const { error: noAuthorizer } = await kd.from('contract_amendments').insert({
      company_id: contract.companyId,
      contract_id: contract.id,
      title: `${TEST_PREFIX} Chống sạt lở khẩn cấp`,
      content: 'Chống sạt lở taluy sau mưa lớn.',
      reason: 'Nguy cơ mất an toàn ngay trong đêm.',
      value_change: 25_000_000,
      is_emergency: true,
    });
    expect(noAuthorizer, 'ràng buộc CHECK bắt cặp is_emergency + người cho phép').toBeTruthy();

    const { data: tgdUser } = await (await signInAs(ACCOUNTS.tgd)).rpc('auth_user_id');
    const amendmentId = await createAmendment(kd, contract, {
      title: `${TEST_PREFIX} Chống sạt lở khẩn cấp`,
      is_emergency: true,
      emergency_authorized_by: tgdUser,
      emergency_reason: 'Nguy cơ mất an toàn ngay trong đêm, Tổng Giám đốc đồng ý qua điện thoại.',
    });

    const { error } = await kd.rpc('execute_amendment', { p_amendment_id: amendmentId });
    expect(error, 'khẩn cấp có người cho phép thì thực hiện được ngay').toBeNull();

    const { data: after } = await kd
      .from('contract_amendments')
      .select('stage, executed_at, emergency_authorized_by')
      .eq('id', amendmentId)
      .single();
    expect(after!.stage).toBe('da_thuc_hien');
    expect(after!.emergency_authorized_by, 'danh tính người cho phép là thứ HD-04 bắt ghi rõ').toBe(
      tgdUser,
    );
  });

  it('phát sinh không tự khai là đã duyệt hoặc đã thực hiện được (HD-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);

    const { error: selfApproved } = await kd.from('contract_amendments').insert({
      company_id: contract.companyId,
      contract_id: contract.id,
      title: `${TEST_PREFIX} Tự duyệt`,
      content: 'Nội dung',
      reason: 'Lý do',
      value_change: 10_000_000,
      stage: 'da_duyet',
    });
    expect(selfApproved, 'policy INSERT ép mọi phát sinh bắt đầu ở bước Đề xuất').toBeTruthy();

    const amendmentId = await createAmendment(kd, contract);

    // Sửa NỘI DUNG ở bước Đề xuất là đúng và phải làm được.
    const { error: editContent } = await kd
      .from('contract_amendments')
      .update({ content: 'Bổ sung mô tả phạm vi gia cố.' })
      .eq('id', amendmentId)
      .select('id')
      .single();
    expect(editContent).toBeNull();

    // Nhưng BƯỚC thì không: đặt thẳng `da_thuc_hien` là bỏ qua toàn bộ kiểm tra của HD-04.
    const { error: jumpStage } = await kd
      .from('contract_amendments')
      .update({ stage: 'da_thuc_hien' })
      .eq('id', amendmentId);
    expect(jumpStage!.message).toContain('Không đổi trực tiếp được trạng thái');

    // Và xác nhận của khách cũng không tự khai được — đó chính là thứ HD-04 dựng lên để
    // chặn "làm trước, hợp thức hóa sau".
    const { error: fakeCustomer } = await kd
      .from('contract_amendments')
      .update({ customer_confirmed_at: new Date().toISOString(), customer_confirmed_by: 'Ai đó' })
      .eq('id', amendmentId);
    expect(fakeCustomer!.message).toContain('Không đổi trực tiếp được trạng thái');
  });

  it('không tự đặt hợp đồng sang Đã ký bằng một câu UPDATE — bỏ qua cả hạn mức (HD-05)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);
    await makeReadyToSubmit(kd, contract, 900_000_000);

    // Đây là lỗ hổng phát hiện khi viết bộ test này: `USING` chỉ kiểm dòng ĐANG ở bước nào,
    // `WITH CHECK` không kiểm bước SẼ thành gì. Một câu PATCH của PostgREST là đủ để hợp
    // đồng 900 triệu thành "đã ký" mà không có dòng nào trong `approvals`.
    const { error: fakeSigned } = await kd
      .from('contracts')
      .update({ stage: 'da_ky', signed_at: new Date().toISOString() })
      .eq('id', contract.id);
    expect(fakeSigned!.message).toContain('Không đổi trực tiếp được trạng thái');

    const { error: fakeApproved } = await kd
      .from('contracts')
      .update({ approved_at: new Date().toISOString() })
      .eq('id', contract.id);
    expect(fakeApproved!.message).toContain('Không đổi trực tiếp được trạng thái');

    // Sửa nội dung thường ở bước Nháp vẫn phải làm được, nếu không thì soạn hợp đồng bằng gì.
    const { error: editTitle } = await kd
      .from('contracts')
      .update({ notes: 'Ghi chú đàm phán.' })
      .eq('id', contract.id)
      .select('id')
      .single();
    expect(editTitle).toBeNull();

    const { data: after } = await kd
      .from('contracts')
      .select('stage')
      .eq('id', contract.id)
      .single();
    expect(after!.stage).toBe('nhap');
  });

  it('còn phát sinh chưa xử lý xong thì chưa quyết toán được (HD-03, HD-04)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const tgd = await signInAs(ACCOUNTS.tgd);
    const contract = await createContract(kd);
    await makeReadyToSubmit(kd, contract);
    const { data: approvalId } = await kd.rpc('submit_contract_approval', {
      p_contract_id: contract.id,
    });
    await tgd.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' });
    await kd.rpc('sign_contract', {
      p_contract_id: contract.id,
      p_contract_number: 'HD-02/2026',
      p_signed_date: '2026-09-01',
    });

    const amendmentId = await createAmendment(kd, contract);

    const { error: blocked } = await kd.rpc('close_contract', {
      p_contract_id: contract.id,
      p_stage: 'hoan_thanh',
    });
    expect(blocked!.message).toContain('phát sinh chưa xử lý');

    await kd
      .from('contract_amendments')
      .update({ quote_sent_at: new Date().toISOString() })
      .eq('id', amendmentId);
    const { data: amendApproval } = await kd.rpc('submit_amendment_approval', {
      p_amendment_id: amendmentId,
    });
    await tgd.rpc('decide_approval', {
      p_approval_id: amendApproval,
      p_decision: 'rejected',
      p_note: 'Khách không đồng ý phạm vi phát sinh.',
    });

    const { error } = await kd.rpc('close_contract', {
      p_contract_id: contract.id,
      p_stage: 'hoan_thanh',
    });
    expect(error).toBeNull();

    const { data: after } = await kd
      .from('contracts')
      .select('stage, settled_at')
      .eq('id', contract.id)
      .single();
    expect(after!.stage).toBe('hoan_thanh');
    expect(after!.settled_at).not.toBeNull();
  });

  it('hủy hợp đồng bắt buộc nêu nguyên nhân, và hồ sơ đã kết thúc thì đóng lại', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);

    const { error: noReason } = await kd.rpc('close_contract', {
      p_contract_id: contract.id,
      p_stage: 'huy',
    });
    expect(noReason!.message).toContain('nguyên nhân');

    await kd.rpc('close_contract', {
      p_contract_id: contract.id,
      p_stage: 'huy',
      p_reason: 'Khách hàng dừng đầu tư.',
    });

    // Điều khoản của hợp đồng đã đóng không thêm được nữa.
    const { error: addTerm } = await kd.from('contract_terms').insert({
      company_id: contract.companyId,
      contract_id: contract.id,
      term_type: 'phat',
      description: `${TEST_PREFIX} thêm sau khi hủy`,
    });
    expect(addTerm).toBeTruthy();

    const { error: reclose } = await kd.rpc('close_contract', {
      p_contract_id: contract.id,
      p_stage: 'hoan_thanh',
    });
    expect(reclose!.message).toContain('đã kết thúc');
  });

  it('pháp nhân khác KHÔNG thấy hợp đồng (Mẫu A, NEN-01)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const contract = await createContract(kd);

    const { data: seen } = await kdNvo.from('contracts').select('id').eq('id', contract.id);
    expect(seen).toEqual([]);
  });

  it('Kế toán XEM được hợp đồng nhưng KHÔNG soạn được (Webapp Flow 2.3)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const kt = await signInAs(ACCOUNTS.ketoan);
    const contract = await createContract(kd);

    const { data: seen } = await kt.from('contracts').select('id').eq('id', contract.id);
    expect(seen!.length, 'Kế toán theo dõi công nợ nên phải xem được hợp đồng').toBe(1);

    const source = await createSourceOpportunity(kd);
    const { error } = await kt.rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: source.id,
      p_type: 'thi_cong',
      p_title: `${TEST_PREFIX} Kế toán soạn`,
    });
    expect(error!.message).toContain('không được soạn hợp đồng');
  });

  it('không xóa hẳn được hợp đồng (Backend Schema 1.4)', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const contract = await createContract(kd);

    await kd.from('contracts').delete().eq('id', contract.id);
    const { data: still } = await kd.from('contracts').select('id').eq('id', contract.id);
    expect(still).toHaveLength(1);
  });
});

describeDb('BC — Dashboard điều hành và phạm vi "Toàn NVG"', () => {
  /**
   * Tạo một cơ hội ở pháp nhân chỉ định, để có dữ liệu ở HAI pháp nhân khác nhau.
   *
   * Mỗi pháp nhân dùng đúng nhân viên kinh doanh của mình: Ban Giám đốc XEM được mọi pháp
   * nhân nhưng KHÔNG có quyền tạo hồ sơ CRM (Webapp Flow 2.3 — "tất cả module ở chế độ chỉ
   * xem + phê duyệt"), nên không thể mượn tài khoản đó để dựng dữ liệu cho cả hai bên.
   */
  async function createOpportunityIn(companyCode: 'NVC' | 'NVO'): Promise<string> {
    const client = await signInAs(
      companyCode === 'NVC' ? ACCOUNTS.kinhDoanhNvc : ACCOUNTS.kinhDoanhNvo,
    );
    const { data: company } = await client
      .from('companies')
      .select('id')
      .eq('code', companyCode)
      .single();
    const { data: customer } = await client.from('customers').select('id').limit(1).maybeSingle();
    if (!customer) throw new Error('Cần ít nhất một khách hàng để chạy test này.');
    const { data: me } = await client.rpc('auth_user_id');
    const { data: code } = await client.rpc('next_record_code', {
      p_company_code: companyCode,
      p_record_type: 'CH',
    });

    const { data, error } = await client
      .from('opportunities')
      .insert({
        code,
        company_id: company!.id,
        customer_id: customer.id,
        name: `${TEST_PREFIX} Cơ hội ${companyCode} cho Dashboard`,
        owner_id: me,
        estimated_value: 500_000_000,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  /**
   * "NVG" là mã TỔNG HỢP, không phải pháp nhân giao dịch (Backend Schema 2.2).
   *
   * Đây là lý do màn hình gộp KHÔNG được lọc theo `company_id` của NVG: bảng giao dịch không
   * bao giờ có dòng nào mang mã đó. Giám đốc Tài chính chỉ được gán vào NVG, nên lọc như vậy
   * cho ra màn hình trắng trong khi phân quyền hoàn toàn đúng — hỏng mà nhìn như chưa có dữ liệu.
   */
  it('không hồ sơ giao dịch nào mang pháp nhân tổng hợp NVG', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: nvg } = await tgd.from('companies').select('id').eq('code', 'NVG').single();

    for (const table of ['opportunities', 'bidding_projects', 'design_projects', 'contracts']) {
      const { data } = await tgd.from(table).select('id').eq('company_id', nvg!.id).limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it('vai trò cấp tập đoàn gộp được số liệu nhiều pháp nhân trong một truy vấn', async () => {
    await createOpportunityIn('NVC');
    await createOpportunityIn('NVO');

    // Truy vấn KHÔNG có điều kiện pháp nhân — đúng cách Dashboard chạy ở chế độ "Toàn NVG".
    const cfo = await signInAs(ACCOUNTS.cfo);
    const { data } = await cfo.from('opportunities').select('company_id').is('deleted_at', null);

    const companies = new Set((data ?? []).map((o) => o.company_id));
    expect(companies.size).toBeGreaterThan(1);
  });

  /**
   * Bỏ điều kiện lọc pháp nhân ở trình duyệt KHÔNG mở thêm quyền cho ai.
   *
   * Đây là phần phải khẳng định tường minh: nếu hàng rào nằm ở câu truy vấn của trình duyệt
   * thì bỏ nó đi là lộ dữ liệu ba pháp nhân cho mọi người. Hàng rào thật nằm trong RLS, nên
   * cùng một câu truy vấn "không lọc" vẫn chỉ trả về phần của người gọi.
   */
  it('bỏ điều kiện lọc pháp nhân KHÔNG làm lộ dữ liệu pháp nhân khác', async () => {
    await createOpportunityIn('NVC');
    await createOpportunityIn('NVO');

    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: nvo } = await tgd.from('companies').select('id').eq('code', 'NVO').single();

    const kinhDoanhNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data } = await kinhDoanhNvc
      .from('opportunities')
      .select('company_id')
      .is('deleted_at', null);

    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).some((o) => o.company_id === nvo!.id)).toBe(false);
  });

  /** Danh mục pháp nhân phải đọc được để cột "Pháp nhân" của màn hình gộp có tên hiển thị. */
  it('mọi người đăng nhập đều đọc được danh mục pháp nhân', async () => {
    const kinhDoanhNvc = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const { data } = await kinhDoanhNvc.from('companies').select('code, is_transactional');

    const codes = (data ?? []).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['NVC', 'NVS', 'NVO', 'NVG']));
    expect((data ?? []).find((c) => c.code === 'NVG')?.is_transactional).toBe(false);
  });
});
