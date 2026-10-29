/**
 * G5 — NVS cho thuê (migration 0245): báo giá thuê có duyệt + hạn mức công nợ, thuê nội bộ NVC / NVO
 * (QĐ-6), chi phí vào ngân sách công trình, loại khỏi số hợp nhất, kiểm tồn ba nhóm, điều chuyển.
 *
 * Canh:
 *  1. Chỉ huy trưởng chỉ gửi được đề nghị thuê cho công trình mình được giao (mẫu E).
 *  2. Đơn nội bộ: cờ `is_internal` tự bật, không gỡ được; đơn giá = `internal_rental_price` lúc xuất;
 *     đổi tham số sau đó không đổi dòng đã xuất; chưa cấu hình giá thì không xuất được.
 *  3. Biên bản thu hồi đã ký của đơn nội bộ → chi phí vào ngân sách công trình nhận.
 *  4. `finance_daily`: số từng công ty giữ phần nội bộ; trừ cột nội bộ ra thì số toàn NVG loại được.
 *  5. Báo giá giá đặc biệt / vượt hạn mức → chờ Ban Giám đốc NVS duyệt; Xưởng không duyệt được.
 *  6. Điều chuyển giữa hai công trình: không qua kho, sổ giàn giáo cân, đơn nguồn chốt tiền.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/g5-nvs-thue-noi-bo.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BGD_NVS = 'pgd.nvs@nhavietgroup.test';

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
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

describeDb('G5 — NVS cho thuê nội bộ, báo giá có duyệt, điều chuyển (0245)', () => {
  const stamp = String(Date.now());
  let sx: SupabaseClient;
  let cht: SupabaseClient;
  let bgd: SupabaseClient;
  let tgd: SupabaseClient;
  let nvs = '';
  let nvc = '';
  let matA = '';
  let matB = '';
  let ownSite = '';
  let otherSite = '';
  let ownSite2 = '';
  let customer = '';
  let paramA = '';
  const requestIds: string[] = [];

  beforeAll(async () => {
    [sx, cht, bgd, tgd] = await Promise.all([
      signInAs(ACCOUNTS.xuongNvs),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(BGD_NVS),
      signInAs(ACCOUNTS.tgd),
    ]);
    await sqlRun(async (sql) => {
      nvs = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`)[0]!.id;
      nvc = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`)[0]!.id;
      const chtUser = (
        await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`
      )[0]!.id;
      const mats = await sql<{ id: string }[]>`
        INSERT INTO materials (code, group_code, name, unit, is_scaffolding)
        VALUES (${'GIANGIAO-G5-A-' + stamp}, 'GIANGIAO', ${TEST_PREFIX + ' Giáo G5 A ' + stamp}, 'bộ', true),
               (${'GIANGIAO-G5-B-' + stamp}, 'GIANGIAO', ${TEST_PREFIX + ' Giáo G5 B ' + stamp}, 'bộ', true)
        RETURNING id`;
      matA = mats[0]!.id;
      matB = mats[1]!.id;
      await sql`
        INSERT INTO scaffolding_assets (company_id, asset_code, material_id, quantity, condition, location_type)
        VALUES (${nvs}, ${'TEST-G5-A-' + stamp}, ${matA}, 200, 'con_dung_duoc', 'kho'),
               (${nvs}, ${'TEST-G5-AH-' + stamp}, ${matA}, 7, 'hong_cho_sua', 'kho'),
               (${nvs}, ${'TEST-G5-B-' + stamp}, ${matB}, 50, 'con_dung_duoc', 'kho')`;
      // Giá nội bộ chỉ cho mã A; mã B cố ý để trống.
      paramA = (
        await sql<{ id: string }[]>`
        INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
        VALUES ('internal_rental_price', 'product', ${matA}, '1000'::jsonb, 'đồng/ngày', ${TEST_PREFIX + ' giá nội bộ A'})
        RETURNING id`
      )[0]!.id;
      await sql`
        INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
        VALUES ('sx.rental_daily_rate', 'product', ${matA}, '5000'::jsonb, 'đồng/ngày', ${TEST_PREFIX + ' bảng giá A'})`;
      const sites = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, responsible_user_id, stage)
        VALUES (${nvc}, ${'NVC-CT-G5A-' + stamp}, ${TEST_PREFIX + ' Công trình G5 được giao'}, ${chtUser}, 'dang_thi_cong'),
               (${nvc}, ${'NVC-CT-G5B-' + stamp}, ${TEST_PREFIX + ' Công trình G5 không giao'}, NULL, 'dang_thi_cong'),
               (${nvc}, ${'NVC-CT-G5C-' + stamp}, ${TEST_PREFIX + ' Công trình G5 thứ hai'}, ${chtUser}, 'dang_thi_cong')
        RETURNING id`;
      ownSite = sites[0]!.id;
      otherSite = sites[1]!.id;
      ownSite2 = sites[2]!.id;
      customer = (
        await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone) VALUES (${TEST_PREFIX + ' Khách thuê G5 ' + stamp}, ${'08' + stamp.slice(-8)})
        RETURNING id`
      )[0]!.id;
    });
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      const agreements = await sql<{ id: string }[]>`
        SELECT id FROM rental_agreements WHERE construction_site_id IN (${ownSite}, ${otherSite}, ${ownSite2})
           OR site_address LIKE ${'%G5%' + stamp + '%'}`;
      const ids = agreements.map((a) => a.id);
      if (ids.length > 0) {
        const recv = await sql<{ id: string }[]>`
          SELECT id FROM receivables_payables WHERE rental_agreement_id IN ${sql(ids)}`;
        await sql`DELETE FROM rental_agreements WHERE id IN ${sql(ids)}`;
        if (recv.length > 0) {
          await sql`DELETE FROM receivables_payables WHERE id IN ${sql(recv.map((r) => r.id))}`;
        }
      }
      await sql`DELETE FROM system_parameters WHERE scope_id IN (${matA}, ${matB}, ${customer})`;
      if (requestIds.length > 0) {
        await sql`DELETE FROM approvals WHERE entity_id IN ${sql(requestIds)}`;
      }
      await sql`DELETE FROM notifications WHERE related_entity_id IN (${ownSite}, ${otherSite}, ${ownSite2})`;
    });
  });

  async function requestFrom(client: SupabaseClient, siteId: string, items: object[]) {
    return client.rpc('request_internal_rental', {
      p_site_id: siteId,
      p_needed_date: isoDate(-10),
      p_expected_return_date: isoDate(-1),
      p_notes: `${TEST_PREFIX} đề nghị`,
      p_items: items,
    });
  }

  async function approvalOf(entityId: string) {
    return sqlRun(
      async (sql) =>
        (
          await sql<{ id: string }[]>`SELECT id FROM approvals WHERE entity_id = ${entityId}
            AND status = 'pending_approval'`
        )[0]?.id,
    );
  }

  async function signReturnWithPaper(returnId: string) {
    const path = `${returnId}/phieu-giay/${crypto.randomUUID()}.png`;
    const up = await sx.storage
      .from('rental-return-docs')
      .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
    expect(up.error).toBeNull();
    const signed = await sx.rpc('sign_rental_return', {
      p_rental_return_id: returnId,
      p_customer_representative: 'Đại diện thử',
      p_paper_scan_path: path,
    });
    expect(signed.error).toBeNull();
  }

  let internalAgreement = '';

  it('chỉ huy trưởng không gửi được đề nghị cho công trình không được giao; được giao thì gửi được', async () => {
    const denied = await requestFrom(cht, otherSite, [{ material_id: matA, quantity: 10 }]);
    expect(denied.error).toBeTruthy();

    const ok = await requestFrom(cht, ownSite, [{ material_id: matA, quantity: 20 }]);
    expect(ok.error).toBeNull();
    requestIds.push(ok.data as string);

    // Đọc được đề nghị của công trình mình; Xưởng NVS cũng đọc được.
    const mine = await cht.from('internal_rental_requests').select('id, status').eq('id', ok.data);
    expect(mine.data?.[0]?.status).toBe('cho_nvs');
    const theirs = await sx.from('internal_rental_requests').select('id').eq('id', ok.data);
    expect(theirs.data).toHaveLength(1);
  });

  it('Xưởng không duyệt được; Ban Giám đốc NVS duyệt; đơn nội bộ mang giá nội bộ và cờ nội bộ', async () => {
    const reqId = requestIds[0]!;
    const prep = await sx.rpc('prepare_internal_rental_request', { p_request_id: reqId });
    expect(prep.error).toBeNull();
    const approvalId = await approvalOf(reqId);
    expect(approvalId).toBeTruthy();

    const sxDecide = await sx.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(sxDecide.error).toBeTruthy();

    const issuedEarly = await sx.rpc('issue_internal_rental', {
      p_request_id: reqId,
      p_start_date: isoDate(-10),
    });
    expect(issuedEarly.error).toBeTruthy();

    const decide = await bgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
    });
    expect(decide.error).toBeNull();

    const issued = await sx.rpc('issue_internal_rental', {
      p_request_id: reqId,
      p_start_date: isoDate(-10),
    });
    expect(issued.error).toBeNull();
    internalAgreement = issued.data as string;

    await sqlRun(async (sql) => {
      const [ra] = await sql<{ is_internal: boolean; renter_company_id: string }[]>`
        SELECT is_internal, renter_company_id FROM rental_agreements WHERE id = ${internalAgreement}`;
      expect(ra!.is_internal).toBe(true);
      expect(ra!.renter_company_id).toBe(nvc);
      const [item] = await sql<{ daily_rate: string; price_source: string }[]>`
        SELECT daily_rate::text, price_source FROM rental_agreement_items WHERE rental_agreement_id = ${internalAgreement}`;
      expect(item!.daily_rate).toBe('1000');
      expect(item!.price_source).toBe('noi_bo');
    });

    // Không gỡ được cờ nội bộ.
    const unflag = await sx
      .from('rental_agreements')
      .update({ is_internal: false })
      .eq('id', internalAgreement)
      .select('id');
    expect(unflag.error).toBeTruthy();
  });

  it('đổi giá nội bộ sau khi xuất không đổi dòng đã xuất; mã chưa có giá thì không chuẩn bị được', async () => {
    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = '1500'::jsonb WHERE id = ${paramA}`,
    );
    await sqlRun(async (sql) => {
      const [item] = await sql<{ daily_rate: string }[]>`
        SELECT daily_rate::text FROM rental_agreement_items WHERE rental_agreement_id = ${internalAgreement}`;
      expect(item!.daily_rate).toBe('1000');
    });
    const noPrice = await requestFrom(cht, ownSite, [{ material_id: matB, quantity: 5 }]);
    expect(noPrice.error).toBeNull();
    requestIds.push(noPrice.data as string);
    const prep = await sx.rpc('prepare_internal_rental_request', { p_request_id: noPrice.data });
    expect(prep.error?.message).toMatch(/Chưa cấu hình giá nội bộ/);
    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = '1000'::jsonb WHERE id = ${paramA}`,
    );
  });

  it('biên bản thu hồi đã ký của đơn nội bộ ghi chi phí vào ngân sách công trình nhận', async () => {
    const ret = await sx.rpc('return_rental_agreement', {
      p_rental_agreement_id: internalAgreement,
      p_actual_return_date: isoDate(-1),
      p_items: [{ material_id: matA, quantity_ok: 20 }],
    });
    expect(ret.error).toBeNull();
    const returnId = await sqlRun(
      async (sql) =>
        (
          await sql<{ id: string; revenue: string }[]>`
          SELECT id, revenue::text FROM rental_returns WHERE rental_agreement_id = ${internalAgreement}`
        )[0]!,
    );
    // 20 bộ × 1.000 đồng × 10 ngày.
    expect(returnId.revenue).toBe('200000');
    await signReturnWithPaper(returnId.id);

    await sqlRun(async (sql) => {
      const [line] = await sql<{ actual_amount: string; cost_code: string }[]>`
        SELECT actual_amount::text, cost_code FROM project_budgets
         WHERE construction_site_id = ${ownSite} AND cost_code = 'THUE_GIAN_GIAO_NB' AND deleted_at IS NULL`;
      expect(line!.actual_amount).toBe('200000');
      const [charge] = await sql<{ amount: string; company_id: string }[]>`
        SELECT amount::text, company_id FROM internal_rental_charges WHERE rental_return_id = ${returnId.id}`;
      expect(charge!.amount).toBe('200000');
      expect(charge!.company_id).toBe(nvc);
    });
  });

  it('số từng công ty giữ doanh thu nội bộ; trừ cột nội bộ thì số toàn NVG loại được', async () => {
    // Một đơn ngoài cùng ngày để thấy hai loại tách nhau.
    const ext = await sx.rpc('create_rental_agreement', {
      p_company_id: nvs,
      p_customer_id: customer,
      p_construction_site_id: null,
      p_site_address: `G5 ngoài ${stamp}`,
      p_start_date: isoDate(-10),
      p_expected_end_date: isoDate(-1),
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} ngoài`,
      p_items: [{ material_id: matA, quantity: 10, daily_rate: 5000 }],
    });
    expect(ext.error).toBeNull();
    expect(
      (
        await sx.rpc('return_rental_agreement', {
          p_rental_agreement_id: ext.data,
          p_actual_return_date: isoDate(-1),
          p_items: [{ material_id: matA, quantity_ok: 10 }],
        })
      ).error,
    ).toBeNull();

    const { data, error } = await tgd.rpc('finance_daily', {
      p_from: isoDate(-1),
      p_to: isoDate(-1),
      p_company_id: null,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as {
      company_id: string;
      rental_revenue: number;
      internal_revenue: number;
    }[];
    const nvsRow = rows.find((r) => r.company_id === nvs)!;
    // Từng công ty: đủ cả nội bộ (200.000) lẫn ngoài (500.000) — có thể kèm số khác cùng ngày.
    expect(Number(nvsRow.rental_revenue)).toBeGreaterThanOrEqual(700000);
    expect(Number(nvsRow.internal_revenue)).toBeGreaterThanOrEqual(200000);
    const group = rows.reduce((t, r) => t + Number(r.rental_revenue), 0);
    const groupExternal = rows.reduce(
      (t, r) => t + Number(r.rental_revenue) - Number(r.internal_revenue),
      0,
    );
    expect(group - groupExternal).toBe(rows.reduce((t, r) => t + Number(r.internal_revenue), 0));
    expect(group - groupExternal).toBeGreaterThanOrEqual(200000);
    // Đơn ngoài không bị tính là nội bộ.
    const extOnly = await sqlRun(
      async (sql) =>
        (
          await sql<
            { is_internal: boolean }[]
          >`SELECT is_internal FROM rental_agreements WHERE id = ${ext.data as string}`
        )[0]!.is_internal,
    );
    expect(extOnly).toBe(false);
  });

  it('báo giá giá đặc biệt hoặc vượt hạn mức công nợ phải Ban Giám đốc NVS duyệt; giá theo bảng thì không', async () => {
    async function quote(price: number) {
      const { data, error } = await sx
        .from('rental_quotes')
        .insert({
          company_id: nvs,
          customer_id: customer,
          needed_date: isoDate(5),
          expected_end_date: isoDate(14),
          notes: `${TEST_PREFIX} báo giá`,
        })
        .select('id')
        .single();
      expect(error?.message ?? null).toBeNull();
      const line = await sx
        .from('rental_quote_items')
        .insert({ rental_quote_id: data!.id, material_id: matA, quantity: 10, unit_price: price });
      expect(line.error).toBeNull();
      return data!.id as string;
    }

    const normal = await quote(5000);
    expect((await sx.rpc('submit_rental_quote', { p_quote_id: normal })).data).toBe('da_duyet');

    const special = await quote(4000);
    expect((await sx.rpc('submit_rental_quote', { p_quote_id: special })).data).toBe('cho_duyet');
    const approvalId = await approvalOf(special);
    expect(approvalId).toBeTruthy();
    // Đã gửi thì Xưởng không sửa được giá.
    const edit = await sx
      .from('rental_quote_items')
      .update({ unit_price: 1 })
      .eq('rental_quote_id', special)
      .select('id');
    expect(edit.data ?? []).toHaveLength(0);
    expect(
      (await sx.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' }))
        .error,
    ).toBeTruthy();
    expect(
      (await bgd.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' }))
        .error,
    ).toBeNull();
    const after = await sx.from('rental_quotes').select('status').eq('id', special).single();
    expect(after.data?.status).toBe('da_duyet');

    // Hạn mức công nợ riêng khách: 100.000 đồng < giá trị báo giá 500.000.
    await sqlRun(
      (sql) => sql`
      INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
      VALUES ('sx.customer_credit_limit', 'customer', ${customer}, '100000'::jsonb, 'đồng', ${TEST_PREFIX + ' hạn mức'})`,
    );
    const overLimit = await quote(5000);
    expect((await sx.rpc('submit_rental_quote', { p_quote_id: overLimit })).data).toBe('cho_duyet');
    const q = await sx
      .from('rental_quotes')
      .select('credit_exceeded, special_price')
      .eq('id', overLimit)
      .single();
    expect(q.data).toEqual({ credit_exceeded: true, special_price: false });
    const approval = await approvalOf(overLimit);
    if (approval) requestIds.push(overLimit, special, normal);
  });

  it('kiểm tồn ba nhóm: tồn chắc chắn, dự kiến thu hồi trước ngày cần, đang sửa — không cộng dồn', async () => {
    const out = await sx.rpc('create_rental_agreement', {
      p_company_id: nvs,
      p_customer_id: customer,
      p_construction_site_id: null,
      p_site_address: `G5 tồn ${stamp}`,
      p_start_date: isoDate(-2),
      p_expected_end_date: isoDate(3),
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} tồn`,
      p_items: [{ material_id: matA, quantity: 30, daily_rate: 5000 }],
    });
    expect(out.error).toBeNull();
    const { data, error } = await sx.rpc('rental_availability', {
      p_company_id: nvs,
      p_needed_date: isoDate(5),
    });
    expect(error).toBeNull();
    const row = (
      data as {
        material_id: string;
        available: number;
        returning_qty: number;
        under_repair: number;
      }[]
    ).find((r) => r.material_id === matA)!;
    expect(Number(row.available)).toBe(170);
    expect(Number(row.returning_qty)).toBe(30);
    expect(Number(row.under_repair)).toBe(7);

    const before = await sx.rpc('rental_availability', {
      p_company_id: nvs,
      p_needed_date: isoDate(2),
    });
    const early = (before.data as { material_id: string; returning_qty: number }[]).find(
      (r) => r.material_id === matA,
    )!;
    expect(Number(early.returning_qty)).toBe(0);
  });

  it('điều chuyển giữa hai công trình nội bộ không qua kho, sổ giàn giáo cân, đơn nguồn chốt tiền', async () => {
    const req = await requestFrom(cht, ownSite, [{ material_id: matA, quantity: 12 }]);
    expect(req.error).toBeNull();
    requestIds.push(req.data as string);
    await sx.rpc('prepare_internal_rental_request', { p_request_id: req.data });
    const approvalId = await approvalOf(req.data as string);
    await bgd.rpc('decide_approval', { p_approval_id: approvalId, p_decision: 'approved' });
    const issued = await sx.rpc('issue_internal_rental', {
      p_request_id: req.data,
      p_start_date: isoDate(-6),
    });
    expect(issued.error).toBeNull();
    const source = issued.data as string;

    const ledgerTotal = () =>
      sqlRun(
        async (sql) =>
          (
            await sql<{ total: string; kho: string }[]>`
            SELECT COALESCE(sum(quantity_delta), 0)::text AS total,
                   COALESCE(sum(quantity_delta) FILTER (WHERE location_type = 'kho'), 0)::text AS kho
              FROM scaffolding_ledger_entries WHERE material_id = ${matA}`
          )[0]!,
      );
    const before = await ledgerTotal();

    const draft = await sx.rpc('create_rental_transfer', {
      p_from_agreement_id: source,
      p_transfer_date: isoDate(-2),
      p_to_site_id: ownSite2,
      p_to_site_label: null,
      p_items: [{ material_id: matA, quantity: 5 }],
    });
    expect(draft.error).toBeNull();
    const transferId = draft.data as string;
    const path = `${transferId}/phieu-giay/${crypto.randomUUID()}.png`;
    expect(
      (
        await sx.storage
          .from('rental-transfer-docs')
          .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' })
      ).error,
    ).toBeNull();
    const signed = await sx.rpc('sign_rental_transfer', {
      p_transfer_id: transferId,
      p_customer_representative: 'Chỉ huy trưởng thử',
      p_paper_scan_path: path,
    });
    expect(signed.error).toBeNull();
    const target = signed.data as string;

    const after = await ledgerTotal();
    expect(after.total).toBe(before.total);
    expect(after.kho).toBe(before.kho);

    await sqlRun(async (sql) => {
      const lots = await sql<{ agreement: string; qty: string }[]>`
        SELECT current_rental_agreement_id AS agreement, sum(quantity)::text AS qty
          FROM scaffolding_assets WHERE current_rental_agreement_id IN (${source}, ${target})
           AND deleted_at IS NULL AND quantity > 0 GROUP BY 1`;
      const by = new Map(lots.map((l) => [l.agreement, l.qty]));
      expect(Number(by.get(source))).toBe(7);
      expect(Number(by.get(target))).toBe(5);
      const [t] = await sql<
        { is_internal: boolean; construction_site_id: string; start_date: string }[]
      >`
        SELECT is_internal, construction_site_id, start_date::text FROM rental_agreements WHERE id = ${target}`;
      expect(t).toEqual({
        is_internal: true,
        construction_site_id: ownSite2,
        start_date: isoDate(-2),
      });
      // Đơn nguồn: 5 bộ × 1.000 × 5 ngày = 25.000, ghi vào ngân sách công trình nguồn.
      const [rr] = await sql<{ revenue: string; signed: boolean }[]>`
        SELECT revenue::text, signed_at IS NOT NULL AS signed FROM rental_returns WHERE transfer_id = ${transferId}`;
      expect(rr).toEqual({ revenue: '25000', signed: true });
    });
  });
});
