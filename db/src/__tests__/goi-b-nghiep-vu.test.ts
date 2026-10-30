/**
 * Gói B (0254, 0255 — anh Dũng 30/10/2026) sau lượt chạy thử trọn luồng NVC / NVS.
 *
 * Hàng rào phải đứng:
 *  1. Đề nghị chi gõ tay tên tổ đội (không gắn tổ đội) VẪN lập được, nhưng `payment_request_crew_warning`
 *     cảnh báo người lập / người duyệt và kể tổ đội đã đăng ký ở công trình phân bổ; nhà cung cấp thường
 *     không bị cảnh báo; người không đọc được đề nghị không nhận được gì.
 *  2. Nộp thầu bắt buộc có danh mục hồ sơ: chưa có đầu mục nào thì `submit_bid` bị chặn, có rồi thì nộp được.
 *  3. Vai trò `KD_NVS`: xem được SX, không sửa SX; lập cơ hội + báo giá CRM ở NVS; không thấy dữ liệu NVC.
 *     `KD` (Kinh doanh NVC) vẫn KHÔNG xem SX.
 *  4. Đơn thuê giàn giáo NỘI BỘ quá hạn trả báo cả chỉ huy trưởng công trình nhận hàng — không giá, dẫn
 *     tới tab «Giàn giáo» của công trình.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/goi-b-nghiep-vu.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  markBidParticipationApproved,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const isoDate = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

interface CrewWarning {
  warn: boolean;
  matched_crew: string | null;
  crews: { id: string; name: string; site_code: string }[];
  message: string | null;
}

describeDb('Gói B — nghiệp vụ sau chạy thử NVC / NVS (0255)', () => {
  const stamp = String(Date.now());
  let kt: SupabaseClient;
  let kdNvc: SupabaseClient;
  let kdNvs: SupabaseClient;
  let dt: SupabaseClient;
  let tgd: SupabaseClient;
  let nvc = '';
  let nvs = '';
  let siteId = '';
  let crewId = '';
  let chtUser = '';
  let sxUser = '';
  let customerId = '';
  const paymentIds: string[] = [];
  const opportunityIds: string[] = [];
  let productionOrderId = '';
  let nvcOpportunityId = '';
  let agreementId = '';

  beforeAll(async () => {
    [kt, kdNvc, kdNvs, dt, tgd] = await Promise.all([
      signInAs(ACCOUNTS.ketoan),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvs),
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
    await withSql(async (sql) => {
      nvc = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`)[0]!.id;
      nvs = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`)[0]!.id;
      chtUser = (
        await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`
      )[0]!.id;
      sxUser = (
        await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.xuongNvs}`
      )[0]!.id;
      siteId = (
        await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, responsible_user_id, stage)
        VALUES (${nvc}, ${'NVC-CT-GB-' + stamp}, ${TEST_PREFIX + ' Công trình gói B'}, ${chtUser}, 'dang_thi_cong')
        RETURNING id`
      )[0]!.id;
      crewId = (
        await sql<{ id: string }[]>`
        INSERT INTO subcontractors (company_id, construction_site_id, name, scope_of_work)
        VALUES (${nvc}, ${siteId}, ${'Tổ nề Lâm GB' + stamp}, 'Xây trát')
        RETURNING id`
      )[0]!.id;
      customerId = (
        await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone)
        VALUES (${TEST_PREFIX + ' Khách gói B ' + stamp}, ${'08' + stamp.slice(-8)})
        RETURNING id`
      )[0]!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      const none = ['00000000-0000-0000-0000-000000000000'];
      const ids = (a: string[]) => sql(a.length ? a : none);
      await sql`DELETE FROM payment_request_allocations WHERE payment_request_id IN ${ids(paymentIds)}`;
      await sql`DELETE FROM payment_requests WHERE id IN ${ids(paymentIds)}`;
      await sql`DELETE FROM quotes WHERE opportunity_id IN ${ids(opportunityIds)}`.catch(
        () => undefined,
      );
      await sql`DELETE FROM opportunities WHERE id IN ${ids([...opportunityIds, nvcOpportunityId].filter(Boolean))}`.catch(
        () => undefined,
      );
      if (productionOrderId)
        await sql`DELETE FROM production_orders WHERE id = ${productionOrderId}`;
      await sql`DELETE FROM notifications WHERE related_entity_id IN ${ids([siteId, agreementId].filter(Boolean))}`;
      if (agreementId)
        await sql`DELETE FROM rental_agreements WHERE id = ${agreementId}`.catch(() => undefined);
      await sql`DELETE FROM subcontractors WHERE id = ${crewId}`.catch(() => undefined);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // 1. Đề nghị chi gõ tay tên tổ đội
  // ---------------------------------------------------------------------------------------------
  it('1. gõ tay tên tổ đội vẫn lập được, nhưng có cảnh báo kèm tổ đội đã đăng ký; nhà cung cấp thường không', async () => {
    const make = async (payee: string, title: string) => {
      const { data, error } = await kt
        .from('payment_requests')
        .insert({
          company_id: nvc,
          title: `${TEST_PREFIX} ${title}`,
          amount: 3_000_000,
          payee_name: payee,
        })
        .select('id')
        .single();
      expect(error, 'cảnh báo, không chặn').toBeNull();
      const id = (data as { id: string }).id;
      paymentIds.push(id);
      await withSql(
        (
          sql,
        ) => sql`INSERT INTO payment_request_allocations (payment_request_id, construction_site_id, amount)
                     VALUES (${id}, ${siteId}, 3000000)`,
      );
      return id;
    };
    const crewReq = await make('Tổ nề anh Lâm', 'Trả tiền công tuần 3');
    const supplierReq = await make('Công ty Thép Hòa Phát', 'Thanh toán thép hình');
    const nameReq = await make(`Tổ nề Lâm GB${stamp}`, 'Thanh toán');

    const warningOf = async (client: SupabaseClient, id: string) => {
      const { data, error } = await client.rpc('payment_request_crew_warning', {
        p_request_id: id,
      });
      expect(error).toBeNull();
      return ((data ?? []) as CrewWarning[])[0];
    };

    const w = await warningOf(kt, crewReq);
    expect(w?.warn).toBe(true);
    expect(w?.message ?? '').toContain('Không gắn tổ đội');
    expect(w?.crews.map((c) => c.id)).toContain(crewId);

    expect((await warningOf(kt, supplierReq))?.warn).toBe(false);

    const byName = await warningOf(kt, nameReq);
    expect(byName?.warn).toBe(true);
    expect(byName?.matched_crew).toBe(`Tổ nề Lâm GB${stamp}`);

    // Kinh doanh không đọc được đề nghị chi của Kế toán → không nhận được gì (kể cả tên tổ đội).
    expect(await warningOf(kdNvc, crewReq)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------------------------
  // 2. Nộp thầu bắt buộc có danh mục hồ sơ
  // ---------------------------------------------------------------------------------------------
  it('2. chưa có danh mục hồ sơ thì không nộp thầu được; có một đầu mục thì nộp được', async () => {
    const { data: me } = await dt.rpc('auth_user_id');
    const { data: code } = await dt.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'DA',
    });
    const { data: project, error } = await dt
      .from('bidding_projects')
      .insert({
        code,
        company_id: nvc,
        name: `${TEST_PREFIX} Gói B nộp thầu ${stamp}`,
        responsible_user_id: me,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const projectId = (project as { id: string }).id;
    await markBidParticipationApproved(projectId);

    const { data: estimateCode } = await dt.rpc('next_record_code', {
      p_company_code: 'NVC',
      p_record_type: 'DT',
    });
    const { data: est, error: estErr } = await dt
      .from('estimates')
      .insert({
        code: estimateCode,
        company_id: nvc,
        bidding_project_id: projectId,
        bid_price: 120_000_000,
        basis_notes: `${TEST_PREFIX} căn cứ`,
        prepared_by: me,
      })
      .select('id')
      .single();
    expect(estErr).toBeNull();
    const { data: approvalId } = await dt.rpc('request_estimate_approval', {
      p_estimate_id: (est as { id: string }).id,
    });
    await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: 'Duyệt.',
    });

    const blocked = await dt.rpc('submit_bid', { p_bidding_project_id: projectId });
    expect(blocked.error?.message ?? '').toContain('danh mục hồ sơ');

    // Đi đường tắt sửa thẳng bước cũng bị chặn.
    const direct = await dt
      .from('bidding_projects')
      .update({ stage: 'nop_thau' })
      .eq('id', projectId);
    expect(direct.error).toBeTruthy();

    await dt.from('bid_documents').insert({
      company_id: nvc,
      bidding_project_id: projectId,
      category: 'bang_gia',
      name: 'Bảng giá dự thầu',
      is_required: false,
    });
    const ok = await dt.rpc('submit_bid', { p_bidding_project_id: projectId });
    expect(ok.error).toBeNull();
  });

  // ---------------------------------------------------------------------------------------------
  // 3. Vai trò Kinh doanh NVS
  // ---------------------------------------------------------------------------------------------
  it('3a. KD_NVS xem được SX (lệnh sản xuất NVS), không sửa SX; KD vẫn không xem SX', async () => {
    expect((await kdNvs.rpc('auth_can_view_module', { p_module: 'SX' })).data).toBe(true);
    expect((await kdNvs.rpc('auth_can_edit_module', { p_module: 'SX' })).data).toBe(false);
    expect((await kdNvs.rpc('auth_can_approve_module', { p_module: 'SX' })).data).toBe(false);
    expect((await kdNvc.rpc('auth_can_view_module', { p_module: 'SX' })).data).toBe(false);

    productionOrderId = await withSql(
      async (sql) =>
        (
          await sql<{ id: string }[]>`
          INSERT INTO production_orders (company_id, code, product, quantity)
          VALUES (${nvs}, ${'NVS-LSX-GB-' + stamp}, ${TEST_PREFIX + ' Giáo gói B'}, 10)
          RETURNING id`
        )[0]!.id,
    );
    const { data: seen } = await kdNvs
      .from('production_orders')
      .select('id')
      .eq('id', productionOrderId);
    expect(seen ?? []).toHaveLength(1);

    const write = await kdNvs.from('production_orders').insert({
      company_id: nvs,
      code: 'NVS-LSX-GB-X-' + stamp,
      product: `${TEST_PREFIX} không được lập`,
      quantity: 1,
    });
    expect(write.error, 'Kinh doanh NVS không lập được lệnh sản xuất').toBeTruthy();
    const upd = await kdNvs
      .from('production_orders')
      .update({ notes: 'sửa' })
      .eq('id', productionOrderId)
      .select('id');
    expect(upd.data ?? []).toHaveLength(0);
  });

  it('3b. KD_NVS lập cơ hội + báo giá CRM ở NVS; không lập được ở NVC, không thấy cơ hội NVC', async () => {
    const { data: me } = await kdNvs.rpc('auth_user_id');
    const { data: code } = await kdNvs.rpc('next_record_code', {
      p_company_code: 'NVS',
      p_record_type: 'CH',
    });
    const { data: opp, error } = await kdNvs
      .from('opportunities')
      .insert({
        code,
        company_id: nvs,
        customer_id: customerId,
        name: `${TEST_PREFIX} Cơ hội NVS gói B`,
        owner_id: me,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const oppId = (opp as { id: string }).id;
    opportunityIds.push(oppId);

    // Sang bước Báo giá (điều kiện bước kiểm riêng ở flow-guard) rồi lập báo giá CRM.
    await withSql((sql) => sql`UPDATE opportunities SET stage = 'bao_gia' WHERE id = ${oppId}`);
    const quote = await kdNvs.rpc('create_quote_version', {
      p_opportunity_id: oppId,
      p_company_id: nvs,
      p_items: [
        { description: 'Thuê giàn giáo 30 ngày', unit: 'bộ', quantity: '10', unit_price: 900000 },
      ],
      p_discount_amount: 0,
      p_discount_reason: null,
      p_vat_rate: 8,
      p_vat_included: false,
      p_valid_until: isoDate(30),
      p_notes: 'Gói B',
    });
    expect(quote.error).toBeNull();

    const atNvc = await kdNvs.from('opportunities').insert({
      code: 'NVC-CH-GB-' + stamp,
      company_id: nvc,
      customer_id: customerId,
      name: `${TEST_PREFIX} Cơ hội NVC không được lập`,
      owner_id: me,
    });
    expect(atNvc.error, 'Kinh doanh NVS không lập cơ hội của NVC').toBeTruthy();

    nvcOpportunityId = await withSql(async (sql) => {
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      return (
        await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id)
        VALUES (${nvc}, ${'NVC-CH-GB2-' + stamp}, ${customerId}, ${TEST_PREFIX + ' Cơ hội NVC gói B'}, ${u!.id})
        RETURNING id`
      )[0]!.id;
    });
    const { data: hidden } = await kdNvs
      .from('opportunities')
      .select('id')
      .eq('id', nvcOpportunityId);
    expect(hidden ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------------------------
  // 4. Thuê nội bộ quá hạn trả → báo chỉ huy trưởng
  // ---------------------------------------------------------------------------------------------
  it('4. đơn thuê nội bộ quá hạn báo chỉ huy trưởng công trình: không giá, dẫn tới tab Giàn giáo', async () => {
    agreementId = await withSql(
      async (sql) =>
        (
          await sql<{ id: string }[]>`
          INSERT INTO rental_agreements (company_id, code, customer_id, construction_site_id, start_date,
                                         expected_end_date, status, created_by)
          VALUES (${nvs}, ${'NVS-HDT-GB-' + stamp}, nvg_entity_customer(${nvc}), ${siteId}, ${isoDate(-30)}, ${isoDate(-2)},
                  'dang_thue', ${sxUser})
          RETURNING id`
        )[0]!.id,
    );
    const rows = await withSql(async (sql) => {
      const [ra] = await sql<
        { is_internal: boolean }[]
      >`SELECT is_internal FROM rental_agreements WHERE id = ${agreementId}`;
      expect(ra!.is_internal, 'công trình NVC nhận giàn giáo NVS là thuê nội bộ').toBe(true);
      await sql`SELECT scan_rental_expiry_reminders()`;
      return sql<{ user_id: string; message: string; action_url: string; company_id: string }[]>`
        SELECT user_id, message, action_url, company_id FROM notifications
         WHERE related_entity_id = ${siteId} AND type = 'rental_expiry'`;
    });
    const cht = rows.filter((r) => r.user_id === chtUser);
    expect(cht).toHaveLength(1);
    expect(cht[0]!.action_url).toBe(`/tc/cong-trinh/${siteId}?tab=gian-giao`);
    expect(cht[0]!.company_id).toBe(nvc);
    expect(cht[0]!.message).not.toMatch(/đồng/);
    // Xưởng vẫn được báo như cũ, theo đơn thuê.
    const sx = await withSql(
      (sql) => sql<{ n: number }[]>`SELECT count(*)::int AS n FROM notifications
        WHERE related_entity_id = ${agreementId} AND user_id = ${sxUser} AND type = 'rental_expiry'`,
    );
    expect(sx[0]!.n).toBe(1);
  });
});
