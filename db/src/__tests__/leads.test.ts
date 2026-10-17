/**
 * Đầu mối + nhật ký chăm sóc (Đợt 1 — 1A, 1B; migration 0172).
 *
 * Hàng rào phải đứng:
 *  - Đầu mối theo pháp nhân: Kinh doanh NVO không thấy đầu mối NVC; phân hệ khác (Thi công)
 *    không thấy số điện thoại khách; Kiểm soát nội bộ xem, không ghi.
 *  - Mã, người phụ trách do CSDL đặt; trùng số điện thoại trong cùng pháp nhân bị chặn.
 *  - Lưu trữ M1 phải có ngày liên hệ lại; Không phù hợp phải có lý do; «Có nhu cầu» chỉ qua
 *    `convert_lead` (tạo khách hàng + cơ hội, nhật ký đi theo khách).
 *  - Nhật ký bất biến, bắt buộc bước tiếp + ngày hẹn, không ghi giờ tương lai; ghi xong thì
 *    đầu mối mang bước tiếp và chuyển «Đã liên hệ».
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/leads.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

function phone(): string {
  // Số giả 10 chữ số, khác nhau mỗi lần chạy.
  return '09' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
}

function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
}

describeDb('Đầu mối và nhật ký chăm sóc (0172)', () => {
  let nvcId: string;
  let nvoId: string;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let tgd: SupabaseClient;
  let ksnb: SupabaseClient;
  let thiCong: SupabaseClient;

  beforeAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const rows = await sql<{ code: string; id: string }[]>`
        SELECT code, id FROM companies WHERE code IN ('NVC', 'NVO')`;
      nvcId = rows.find((r) => r.code === 'NVC')!.id;
      nvoId = rows.find((r) => r.code === 'NVO')!.id;
    } finally {
      await sql.end();
    }
    [kd, kdNvo, tgd, ksnb, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.ksnb),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
  });

  async function newLead(client: SupabaseClient, extra: Record<string, unknown> = {}) {
    return client
      .from('leads')
      .insert({
        company_id: nvcId,
        full_name: `${TEST_PREFIX} Anh Hùng ${Date.now()}`,
        phone: phone(),
        source: 'Hotline website',
        need: 'Xây nhà xưởng 2.000 m²',
        ...extra,
      })
      .select('id, code, owner_id, status, phone_digits')
      .single();
  }

  it('mã và người phụ trách do CSDL đặt; trạng thái gửi lên bị bỏ qua', async () => {
    const { data, error } = await newLead(kd, {
      code: 'GIA-MAO',
      status: 'co_nhu_cau',
      owner_id: null,
    });
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NVC-DM-\d{4}-\d{4}$/);
    expect(data!.status).toBe('moi');
    const { data: me } = await kd
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.kinhDoanhNvc)
      .single();
    expect(data!.owner_id).toBe(me!.id);
  });

  it('trùng số điện thoại trong cùng pháp nhân bị chặn; hàm kiểm trùng tìm ra', async () => {
    const p = phone();
    const first = await newLead(kd, { phone: p });
    expect(first.error).toBeNull();
    // Cùng số, khác cách viết.
    const formatted = `${p.slice(0, 4)}.${p.slice(4, 7)}.${p.slice(7)}`;
    const dup = await newLead(kd, { phone: formatted });
    expect(dup.error?.code).toBe('23505');

    const { data: hits, error } = await kd.rpc('contact_duplicates', { p_phone: formatted });
    expect(error).toBeNull();
    expect(hits!.some((h: { id: string }) => h.id === first.data!.id)).toBe(true);
  });

  it('pháp nhân khác và phân hệ khác không thấy đầu mối; KSNB thấy nhưng không ghi', async () => {
    const { data: lead } = await newLead(kd);
    const nvo = await kdNvo.from('leads').select('id').eq('id', lead!.id);
    expect(nvo.data).toEqual([]);
    const tc = await thiCong.from('leads').select('id').eq('id', lead!.id);
    expect(tc.data).toEqual([]);
    const k = await ksnb.from('leads').select('id').eq('id', lead!.id);
    expect(k.data).toHaveLength(1);
    const kw = await ksnb
      .from('leads')
      .insert({
        company_id: nvcId,
        full_name: `${TEST_PREFIX} KSNB`,
        phone: phone(),
        source: 'Khác',
      })
      .select('id');
    expect(kw.error).not.toBeNull();
    // Kinh doanh NVO không tạo được đầu mối vào NVC.
    const cross = await kdNvo
      .from('leads')
      .insert({
        company_id: nvcId,
        full_name: `${TEST_PREFIX} Lấn`,
        phone: phone(),
        source: 'Khác',
      })
      .select('id');
    expect(cross.error).not.toBeNull();
    // Nhưng tạo được ở NVO.
    const own = await kdNvo
      .from('leads')
      .insert({
        company_id: nvoId,
        full_name: `${TEST_PREFIX} NVO ${Date.now()}`,
        phone: phone(),
        source: 'Zalo',
      })
      .select('id');
    expect(own.error).toBeNull();
  });

  it('M1 phải có ngày liên hệ lại; Không phù hợp phải có lý do; tự đặt «Có nhu cầu» bị chặn', async () => {
    const { data: lead } = await newLead(kd);
    const noDate = await kd
      .from('leads')
      .update({ status: 'luu_tru' })
      .eq('id', lead!.id)
      .select('id');
    expect(noDate.error).not.toBeNull();
    const ok = await kd
      .from('leads')
      .update({ status: 'luu_tru', recontact_at: today(30) })
      .eq('id', lead!.id)
      .select('status');
    expect(ok.error).toBeNull();
    const noReason = await kd
      .from('leads')
      .update({ status: 'khong_phu_hop' })
      .eq('id', lead!.id)
      .select('id');
    expect(noReason.error).not.toBeNull();
    const fake = await kd
      .from('leads')
      .update({ status: 'co_nhu_cau' })
      .eq('id', lead!.id)
      .select('id');
    expect(fake.error).not.toBeNull();
  });

  it('nhật ký: bắt buộc bước tiếp + ngày hẹn, không ghi giờ tương lai, bất biến; cập nhật đầu mối', async () => {
    const { data: lead } = await newLead(kd);
    const missing = await kd
      .from('contact_logs')
      .insert({ lead_id: lead!.id, channel: 'goi_dien', content: 'Gọi lần đầu' })
      .select('id');
    expect(missing.error).not.toBeNull();

    const future = await kd
      .from('contact_logs')
      .insert({
        lead_id: lead!.id,
        channel: 'goi_dien',
        content: 'Ghi lùi giờ',
        contacted_at: new Date(Date.now() + 86_400_000).toISOString(),
        next_action: 'Gọi lại',
        next_action_at: today(3),
      })
      .select('id');
    expect(future.error).not.toBeNull();

    const log = await kd
      .from('contact_logs')
      .insert({
        lead_id: lead!.id,
        channel: 'zalo',
        content: 'Khách hỏi giá nhà xưởng khung thép',
        next_action: 'Gửi hồ sơ năng lực',
        next_action_at: today(2),
        // Gửi lên pháp nhân sai — CSDL phải lấy theo đầu mối.
        company_id: nvoId,
      })
      .select('id, company_id')
      .single();
    expect(log.error).toBeNull();
    expect(log.data!.company_id).toBe(nvcId);

    const { data: after } = await kd
      .from('leads')
      .select('status, next_action, next_action_at, last_contacted_at')
      .eq('id', lead!.id)
      .single();
    expect(after).toMatchObject({
      status: 'da_lien_he',
      next_action: 'Gửi hồ sơ năng lực',
      next_action_at: today(2),
    });
    expect(after!.last_contacted_at).not.toBeNull();

    const edit = await kd
      .from('contact_logs')
      .update({ content: 'Sửa' })
      .eq('id', log.data!.id)
      .select('id');
    expect(edit.data ?? []).toEqual([]);
    const del = await kd.from('contact_logs').delete().eq('id', log.data!.id).select('id');
    expect(del.data ?? []).toEqual([]);

    // Người khác (không phụ trách) cùng pháp nhân không ghi thay được; Ban Giám đốc ghi được.
    const byTgd = await tgd
      .from('contact_logs')
      .insert({
        lead_id: lead!.id,
        channel: 'gap_mat',
        content: 'TGĐ gặp khách',
        closes_followup: true,
      })
      .select('id');
    expect(byTgd.error).toBeNull();
  });

  it('chuyển thành cơ hội: tạo khách hàng + cơ hội, khoá đầu mối, nhật ký đi theo khách', async () => {
    const { data: lead } = await newLead(kd);
    await kd.from('contact_logs').insert({
      lead_id: lead!.id,
      channel: 'goi_dien',
      content: 'Khách xác nhận cần xây',
      next_action: 'Hẹn khảo sát',
      next_action_at: today(1),
    });

    // Người không phụ trách (Kinh doanh NVO) không chuyển được.
    const denied = await kdNvo.rpc('convert_lead', { p_lead_id: lead!.id });
    expect(denied.error).not.toBeNull();

    const { data: oppId, error } = await kd.rpc('convert_lead', {
      p_lead_id: lead!.id,
      p_opportunity_name: `${TEST_PREFIX} Nhà xưởng anh Hùng`,
      p_project_type: 'Nhà xưởng công nghiệp',
    });
    expect(error).toBeNull();

    const { data: opp } = await kd
      .from('opportunities')
      .select('code, stage, customer_id, company_id')
      .eq('id', oppId as string)
      .single();
    expect(opp!.code).toMatch(/^NVC-CH-/);
    expect(opp).toMatchObject({ stage: 'tiep_nhan', company_id: nvcId });

    const { data: converted } = await kd
      .from('leads')
      .select('status, customer_id, opportunity_id')
      .eq('id', lead!.id)
      .single();
    expect(converted).toMatchObject({
      status: 'co_nhu_cau',
      customer_id: opp!.customer_id,
      opportunity_id: oppId,
    });

    const { data: logs } = await kd
      .from('contact_logs')
      .select('customer_id, opportunity_id')
      .eq('lead_id', lead!.id);
    expect(logs!.length).toBeGreaterThan(0);
    expect(
      logs!.every((l) => l.customer_id === opp!.customer_id && l.opportunity_id === oppId),
    ).toBe(true);

    // Đã thành cơ hội thì đầu mối chỉ xem.
    const locked = await kd.from('leads').update({ need: 'Đổi' }).eq('id', lead!.id).select('id');
    expect(locked.data ?? []).toEqual([]);
    const again = await kd.rpc('convert_lead', { p_lead_id: lead!.id });
    expect(again.error).not.toBeNull();

    // Đổi tên khách hàng để được dọn theo tiền tố.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [c] = await sql<
        { name: string }[]
      >`SELECT name FROM customers WHERE id = ${opp!.customer_id}`;
      expect(c!.name.startsWith(TEST_PREFIX)).toBe(true);
    } finally {
      await sql.end();
    }
  });
});

describeDb('Việc chăm sóc khách hôm nay (0173)', () => {
  let nvcId: string;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;

  beforeAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = c!.id;
    } finally {
      await sql.end();
    }
    [kd, kdNvo] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
    ]);
  });

  async function followups(client: SupabaseClient, horizon: number) {
    const { data, error } = await client.rpc('my_crm_followups', { p_horizon_days: horizon });
    expect(error).toBeNull();
    return (data ?? []) as { kind: string; entity_id: string; due_date: string; action: string }[];
  }

  it('đầu mối mới → liên hệ lần đầu; ghi liên hệ → theo ngày hẹn; chỉ người phụ trách thấy', async () => {
    const { data: lead } = await kd
      .from('leads')
      .insert({
        company_id: nvcId,
        full_name: `${TEST_PREFIX} Việc hôm nay ${Date.now()}`,
        phone: phone(),
        source: 'Zalo',
      })
      .select('id')
      .single();

    const first = (await followups(kd, 0)).find((f) => f.entity_id === lead!.id);
    expect(first).toMatchObject({ kind: 'lead_first_contact', due_date: today() });
    expect((await followups(kdNvo, 7)).some((f) => f.entity_id === lead!.id)).toBe(false);

    await kd.from('contact_logs').insert({
      lead_id: lead!.id,
      channel: 'goi_dien',
      content: 'Đã gọi',
      next_action: 'Gửi báo giá sơ bộ',
      next_action_at: today(2),
    });
    expect((await followups(kd, 0)).some((f) => f.entity_id === lead!.id)).toBe(false);
    const later = (await followups(kd, 7)).find((f) => f.entity_id === lead!.id);
    expect(later).toMatchObject({
      kind: 'lead_followup',
      due_date: today(2),
      action: 'Gửi báo giá sơ bộ',
    });
  });

  it('cơ hội: dòng nhật ký mới nhất quyết định; kết thúc theo dõi thì hết việc', async () => {
    const { data: lead } = await kd
      .from('leads')
      .insert({
        company_id: nvcId,
        full_name: `${TEST_PREFIX} Cơ hội việc ${Date.now()}`,
        phone: phone(),
        source: 'Giới thiệu',
      })
      .select('id')
      .single();
    const { data: oppId } = await kd.rpc('convert_lead', {
      p_lead_id: lead!.id,
      p_opportunity_name: `${TEST_PREFIX} Cơ hội việc hôm nay`,
    });
    await kd.from('contact_logs').insert({
      opportunity_id: oppId,
      channel: 'gap_mat',
      content: 'Gặp khách',
      next_action: 'Hẹn khảo sát',
      next_action_at: today(),
    });
    const item = (await followups(kd, 0)).find((f) => f.entity_id === oppId);
    expect(item).toMatchObject({ kind: 'opportunity_followup', action: 'Hẹn khảo sát' });

    await kd.from('contact_logs').insert({
      opportunity_id: oppId,
      channel: 'goi_dien',
      content: 'Khách hoãn vô thời hạn',
      closes_followup: true,
    });
    expect((await followups(kd, 30)).some((f) => f.entity_id === oppId)).toBe(false);
  });

  it('cron đêm: một thông báo tóm tắt mỗi người mỗi ngày', async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [u] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      await sql`DELETE FROM notifications WHERE user_id = ${u!.id} AND type = 'crm_followup'`;
      await sql`SELECT public.scan_crm_followup_reminders()`;
      const [first] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications
        WHERE user_id = ${u!.id} AND type = 'crm_followup'`;
      expect(first!.n).toBe(1);
      await sql`SELECT public.scan_crm_followup_reminders()`;
      const [second] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications
        WHERE user_id = ${u!.id} AND type = 'crm_followup'`;
      expect(second!.n).toBe(1);
    } finally {
      await sql.end();
    }
  });

  it('trình duyệt không gọi được hàm nội bộ và lượt quét', async () => {
    const internal = await kd.rpc('crm_followups_for', {
      p_user: '00000000-0000-0000-0000-000000000000',
      p_until: today(30),
    });
    expect(internal.error).not.toBeNull();
    const scan = await kd.rpc('scan_crm_followup_reminders');
    expect(scan.error).not.toBeNull();
  });
});

describeDb('Khách cũ và phễu từ đầu mối (0177)', () => {
  let nvcId: string;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let customerId: string;

  beforeAll(async () => {
    [kd, kdNvo] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
    ]);
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const stamp = String(Date.now());
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = c!.id;
      const [k] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name, phone)
        VALUES (${'KH-KC' + stamp}, ${TEST_PREFIX + ' Khách cũ ' + stamp}, ${phone()})
        RETURNING id`;
      customerId = k!.id;
      await sql`
        INSERT INTO contracts (company_id, code, title, type, stage, value, customer_id, signed_at)
        VALUES (${nvcId}, ${'NVC-HD-KC-' + stamp}, ${TEST_PREFIX + ' Hợp đồng khách cũ ' + stamp},
                'thi_cong', 'da_ky', 500000000, ${customerId}, now() - interval '200 days')`;
    } finally {
      await sql.end();
    }
  });

  it('khách đã ký hiện ở danh sách khách cũ của đúng pháp nhân, kèm hẹn chăm sóc và số giới thiệu', async () => {
    const before = (await kd.rpc('old_customers', { p_company_id: nvcId })).data as {
      customer_id: string;
      next_care_at: string | null;
      referral_count: number;
    }[];
    const row = before.find((r) => r.customer_id === customerId);
    expect(row).toMatchObject({ next_care_at: null, referral_count: 0 });

    const other = (await kdNvo.rpc('old_customers', { p_company_id: null })).data as {
      customer_id: string;
    }[];
    expect(other.some((r) => r.customer_id === customerId)).toBe(false);

    await kd.from('contact_logs').insert({
      customer_id: customerId,
      company_id: nvcId,
      channel: 'goi_dien',
      content: 'Hỏi thăm sau 6 tháng bàn giao, khách nhắc cần bảo trì mái',
      next_action: 'Hẹn kiểm tra mái',
      next_action_at: today(10),
    });
    await kd.from('leads').insert({
      company_id: nvcId,
      full_name: `${TEST_PREFIX} Người được giới thiệu ${Date.now()}`,
      phone: phone(),
      source: 'Khách cũ giới thiệu',
      referred_by_customer_id: customerId,
    });
    const after = (await kd.rpc('old_customers', { p_company_id: nvcId })).data as {
      customer_id: string;
      next_care_at: string | null;
      next_care_action: string | null;
      referral_count: number;
      last_contact_at: string | null;
    }[];
    expect(after.find((r) => r.customer_id === customerId)).toMatchObject({
      next_care_at: today(10),
      next_care_action: 'Hẹn kiểm tra mái',
      referral_count: 1,
    });
  });

  it('phễu đầu mối đếm đúng: đầu mối → đã liên hệ → thành cơ hội', async () => {
    const source = `${TEST_PREFIX} nguồn ${Date.now()}`.slice(0, 32);
    const mk = async () =>
      (
        await kd
          .from('leads')
          .insert({
            company_id: nvcId,
            full_name: `${TEST_PREFIX} Phễu ${Math.random()}`,
            phone: phone(),
            source,
          })
          .select('id')
          .single()
      ).data!.id as string;
    const [a, b, c] = [await mk(), await mk(), await mk()];
    void a;
    for (const id of [b, c]) {
      await kd.from('contact_logs').insert({
        lead_id: id,
        channel: 'zalo',
        content: 'Đã liên hệ',
        next_action: 'Gọi lại',
        next_action_at: today(1),
      });
    }
    await kd.rpc('convert_lead', {
      p_lead_id: c,
      p_opportunity_name: `${TEST_PREFIX} Cơ hội từ phễu`,
    });
    const { data } = await kd.rpc('lead_funnel_by_source', { p_company_id: nvcId });
    const row = (data as { source: string }[]).find((r) => r.source === source);
    expect(row).toMatchObject({
      lead_count: 3,
      contacted_count: 2,
      converted_count: 1,
      signed_count: 0,
    });
  });
});
