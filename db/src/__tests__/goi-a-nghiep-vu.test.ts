/**
 * Gói A — bảy quyết định nghiệp vụ của anh Dũng sau lượt chạy thử trọn luồng (migration 0253).
 *
 * Hàng rào phải đứng:
 *  1. Hợp đồng thiết kế chỉ quyết toán khi khách đã duyệt hồ sơ kỹ thuật (trigger + stage_readiness).
 *  2. Ký hợp đồng thiết kế → máy tạo hồ sơ thiết kế gắn cơ hội + hợp đồng, báo phòng Thiết kế;
 *     trọn gói chỉ khi pháp nhân tự làm thiết kế (`tk.design_in_house`).
 *  3. Ngân sách thi công lập từ giá vốn báo giá; Tổng Giám đốc duyệt trước khởi công; sửa khi đang chờ
 *     bị chặn, sửa sau khi duyệt thì phải gửi lại.
 *  4. Đợt «khi ký hợp đồng» đến hạn thu ngay khi ký, Kế toán được báo.
 *  5. «Gửi khách» báo giá ghi kênh; mở Zalo gửi báo giá đã duyệt thì ghi đã gửi qua Zalo.
 *  6. Lợi nhuận dự toán lấy số máy tính — số gõ tay không lách được mức tối thiểu.
 *  7. Đợt giữ lại bảo hành: hạn theo ngày hết bảo hành, tới hạn thì đến hạn thu (G3 không trừ thêm —
 *     phép thử ở `g3-thanh-toan-cdt`).
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/goi-a-nghiep-vu.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const TAG = TEST_PREFIX + ' Gói A';

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function readiness(client: SupabaseClient, type: string, id: string) {
  const { data, error } = await client.rpc('stage_readiness', { p_entity_type: type, p_id: id });
  expect(error).toBeNull();
  return (data ?? []) as { for_stage: string; requirement: string; met: boolean; label: string }[];
}

describeDb('Gói A — nghiệp vụ sau chạy thử (0253)', () => {
  const stamp = String(Date.now());
  let tgd: SupabaseClient;
  let tp: SupabaseClient; // Trưởng phòng Thi công NVC
  let cht: SupabaseClient;
  let kdNvc: SupabaseClient;
  let dauThau: SupabaseClient;
  let nvoId = '';
  let nvcId = '';
  let customerId = '';
  const oppIds: string[] = [];
  const contractIds: string[] = [];
  const siteIds: string[] = [];
  const estimateIds: string[] = [];
  const bidIds: string[] = [];

  async function makeOpp(companyId: string, label: string, responsible: string | null = null) {
    return withSql(async (sql) => {
      const [o] = await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, name, customer_id, stage, owner_id)
        VALUES (${companyId}, ${'GA-CH-' + label + '-' + stamp}, ${TAG + ' ' + label + ' ' + stamp},
                ${customerId}, 'dam_phan', ${responsible})
        RETURNING id`;
      oppIds.push(o!.id);
      return o!.id;
    });
  }

  async function makeContract(opts: {
    companyId: string;
    label: string;
    type: 'thiet_ke' | 'thi_cong';
    scope: 'thiet_ke' | 'thi_cong' | 'tron_goi';
    opportunityId: string | null;
    stage?: string;
    value?: number;
  }) {
    return withSql(async (sql) => {
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, scope_kind, stage, value, source_type, source_id,
                               customer_id, signed_date, start_date, end_date, project_location)
        VALUES (${opts.companyId}, ${'GA-HD-' + opts.label + '-' + stamp}, ${TAG + ' ' + opts.label + ' ' + stamp},
                ${opts.type}, ${opts.scope}, ${opts.stage ?? 'da_duyet'}, ${opts.value ?? 500_000_000},
                ${opts.opportunityId ? 'opportunities' : null}, ${opts.opportunityId}, ${customerId},
                NULL, current_date + 3, current_date + 120, 'Hưng Yên')
        RETURNING id`;
      contractIds.push(c!.id);
      return c!.id;
    });
  }

  beforeAll(async () => {
    [tgd, tp, cht, kdNvc, dauThau] = await Promise.all([
      signInAs(ACCOUNTS.tgd),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.dauThauNvc),
    ]);
    await withSql(async (sql) => {
      const rows = await sql<{ code: string; id: string }[]>`SELECT code, id FROM companies`;
      nvoId = rows.find((r) => r.code === 'NVO')!.id;
      nvcId = rows.find((r) => r.code === 'NVC')!.id;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name, phone) VALUES (${'GA-KH-' + stamp}, ${TAG + ' Khách ' + stamp}, ${'09' + stamp.slice(-8)})
        RETURNING id`;
      customerId = cu!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`UPDATE system_parameters SET value = NULL
                 WHERE param_key = 'min_margin_percent' AND scope_type = 'company' AND scope_id = ${nvcId}`;
      await sql`DELETE FROM approvals WHERE entity_id IN (
                  SELECT id FROM site_budget_submissions WHERE construction_site_id = ANY(${siteIds})
                  UNION SELECT unnest(${estimateIds}::uuid[]))`;
      await sql`DELETE FROM notifications WHERE related_entity_id = ANY(${[...contractIds, ...siteIds]})`;
      await sql`DELETE FROM construction_sites WHERE id = ANY(${siteIds}) OR contract_id = ANY(${contractIds})`;
      await sql`DELETE FROM design_projects WHERE contract_id = ANY(${contractIds}) OR opportunity_id = ANY(${oppIds})`;
      await sql`DELETE FROM contracts WHERE id = ANY(${contractIds})`;
      await sql`DELETE FROM estimates WHERE id = ANY(${estimateIds})`;
      await sql`DELETE FROM bidding_projects WHERE id = ANY(${bidIds})`;
      await sql`DELETE FROM quotes WHERE opportunity_id = ANY(${oppIds})`;
      await sql`DELETE FROM opportunities WHERE id = ANY(${oppIds})`;
      await sql`DELETE FROM customers WHERE id = ${customerId}`;
    });
  });

  // ---------------------------------------------------------------------------------------------
  // 2 + 4. Ký hợp đồng thiết kế: tự tạo hồ sơ thiết kế; đợt «khi ký» đến hạn thu ngay
  // ---------------------------------------------------------------------------------------------
  let designContract = '';
  let designProject = '';
  let advanceTerm = '';

  it('ký hợp đồng thiết kế → máy tạo hồ sơ thiết kế gắn cơ hội + hợp đồng; đợt tạm ứng đến hạn thu ngay', async () => {
    const opp = await makeOpp(nvoId, 'TK');
    designContract = await makeContract({
      companyId: nvoId,
      label: 'TK',
      type: 'thiet_ke',
      scope: 'thiet_ke',
      opportunityId: opp,
    });
    advanceTerm = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO contract_terms (company_id, contract_id, term_type, description, percent_value, position,
                                    collection_trigger)
        VALUES (${nvoId}, ${designContract}, 'tam_ung', ${TAG + ' Tạm ứng 30%'}, '30', '1', 'ky_hop_dong')
        RETURNING id`;
      return rows[0]!.id;
    });
    // Chưa ký: chưa đến hạn.
    const before = await withSql(
      (sql) =>
        sql<
          { due: string | null }[]
        >`SELECT collection_due_at::text AS due FROM contract_terms WHERE id = ${advanceTerm}`,
    );
    expect(before[0]!.due).toBeNull();

    const signed = await tgd.rpc('sign_contract', {
      p_contract_id: designContract,
      p_contract_number: 'GA/' + stamp + '/HĐTK',
      p_signed_date: new Date().toISOString().slice(0, 10),
    });
    expect(signed.error).toBeNull();

    const projects = await withSql(
      (sql) => sql<
        {
          id: string;
          opportunity_id: string;
          contract_id: string;
          responsible_user_id: string | null;
        }[]
      >`SELECT id, opportunity_id, contract_id, responsible_user_id FROM design_projects
         WHERE opportunity_id = ${opp} AND deleted_at IS NULL`,
    );
    expect(projects).toHaveLength(1);
    designProject = projects[0]!.id;
    expect(projects[0]!.contract_id).toBe(designContract);

    // Phòng Thiết kế được báo.
    const notified = await withSql(
      (sql) => sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE n.type = 'design_project_from_contract' AND n.related_entity_id = ${designProject}
           AND u.email = ${ACCOUNTS.thietKeNvo}`,
    );
    expect(notified[0]!.n).toBe(1);

    // Đợt «khi ký hợp đồng»: đến hạn thu + Kế toán được báo.
    const after = await withSql(
      (sql) =>
        sql<
          { due: string | null }[]
        >`SELECT collection_due_at::text AS due FROM contract_terms WHERE id = ${advanceTerm}`,
    );
    expect(after[0]!.due).not.toBeNull();
    const kt = await withSql(
      (sql) => sql<{ message: string }[]>`
        SELECT n.message FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE u.email = ${ACCOUNTS.ketoan} AND n.type = 'collection_due' AND n.related_entity_id = ${advanceTerm}`,
    );
    expect(kt).toHaveLength(1);
    expect(kt[0]!.message).toContain('hợp đồng đã ký');
  });

  it('trọn gói của pháp nhân không tự làm thiết kế thì không tạo hồ sơ thiết kế', async () => {
    const opp = await makeOpp(nvcId, 'TG');
    const c = await makeContract({
      companyId: nvcId,
      label: 'TG',
      type: 'thi_cong',
      scope: 'tron_goi',
      opportunityId: opp,
    });
    expect(
      (
        await tgd.rpc('sign_contract', {
          p_contract_id: c,
          p_contract_number: 'GA/' + stamp + '/TG',
          p_signed_date: new Date().toISOString().slice(0, 10),
        })
      ).error,
    ).toBeNull();
    const n = await withSql(
      (sql) =>
        sql<
          { n: number }[]
        >`SELECT count(*)::int AS n FROM design_projects WHERE opportunity_id = ${opp}`,
    );
    expect(n[0]!.n).toBe(0);
  });

  // ---------------------------------------------------------------------------------------------
  // 1. Quyết toán hợp đồng thiết kế
  // ---------------------------------------------------------------------------------------------
  it('hợp đồng thiết kế chỉ quyết toán khi khách đã duyệt hồ sơ kỹ thuật', async () => {
    const r1 = await readiness(tgd, 'contract', designContract);
    const row = r1.find((r) => r.requirement === 'design_tech_approved')!;
    expect(row.met).toBe(false);
    expect(row.label).toContain('chưa duyệt hồ sơ kỹ thuật');

    const blocked = await tgd.rpc('close_contract', {
      p_contract_id: designContract,
      p_stage: 'hoan_thanh',
    });
    expect(blocked.error?.message).toContain('hồ sơ kỹ thuật');

    // Bản kiến trúc phát hành nhưng khách chưa duyệt — vẫn chặn.
    const [version] = await withSql(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO design_versions (company_id, design_project_id, discipline, title, published_at)
        VALUES (${nvoId}, ${designProject}, 'kien_truc', ${TAG + ' Hồ sơ kiến trúc'}, now())
        RETURNING id`,
    );
    // Phát hành (trigger đặt bản mới chưa hiệu lực, chưa phát hành — đi tắt như `publish_design_version`).
    await withSql(
      (sql) => sql`UPDATE design_versions SET is_current_version = true, published_at = now()
                    WHERE id = ${version!.id}`,
    );
    expect(
      (await tgd.rpc('close_contract', { p_contract_id: designContract, p_stage: 'hoan_thanh' }))
        .error?.message,
    ).toContain('Khách chưa duyệt hồ sơ kỹ thuật');

    await withSql(
      (sql) =>
        sql`UPDATE design_versions SET customer_approved_at = now() WHERE id = ${version!.id}`,
    );
    const r2 = await readiness(tgd, 'contract', designContract);
    expect(r2.find((r) => r.requirement === 'design_tech_approved')!.met).toBe(true);
    expect(
      (await tgd.rpc('close_contract', { p_contract_id: designContract, p_stage: 'hoan_thanh' }))
        .error,
    ).toBeNull();
  });

  // ---------------------------------------------------------------------------------------------
  // 3. Ngân sách thi công
  // ---------------------------------------------------------------------------------------------
  let budgetSite = '';
  it('ngân sách lập từ GIÁ VỐN của báo giá (không phải giá bán)', async () => {
    const opp = await makeOpp(nvcId, 'NS');
    await withSql(async (sql) => {
      const [q] = await sql<{ id: string }[]>`
        INSERT INTO quotes (company_id, code, opportunity_id, status, sent_to_customer_at, is_current_version)
        VALUES (${nvcId}, ${'GA-BG-' + stamp}, ${opp}, 'completed', now(), true)
        RETURNING id`;
      const items = await sql<{ id: string }[]>`
        INSERT INTO quote_items (quote_id, company_id, description, quantity, unit_price)
        VALUES (${q!.id}, ${nvcId}, 'Kết cấu thép', 10, 50000000),
               (${q!.id}, ${nvcId}, 'Mái tôn', 2, 25000000)
        RETURNING id`;
      await sql`
        INSERT INTO quote_item_costs (quote_item_id, quote_id, company_id, unit_cost)
        VALUES (${items[0]!.id}, ${q!.id}, ${nvcId}, 40000000),
               (${items[1]!.id}, ${q!.id}, ${nvcId}, 20000000)`;
      // Trigger đặt báo giá mới về Nháp — đưa về «đã duyệt, đã gửi» như sau luồng thật.
      await sql`UPDATE quotes SET status = 'completed', sent_to_customer_at = now() WHERE id = ${q!.id}`;
    });
    const c = await makeContract({
      companyId: nvcId,
      label: 'NS',
      type: 'thi_cong',
      scope: 'thi_cong',
      opportunityId: opp,
      stage: 'da_ky',
    });
    budgetSite = await withSql(async (sql) => {
      const [chtUser] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const [s] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, contract_id, responsible_user_id,
                                        planned_start_date, planned_end_date, stage)
        VALUES (${nvcId}, ${'GA-CT-' + stamp}, ${TAG + ' Công trình ' + stamp}, ${c}, ${chtUser!.id},
                current_date + 3, current_date + 120, 'chuan_bi')
        RETURNING id`;
      siteIds.push(s!.id);
      await sql`UPDATE site_checklist_items SET status = 'da_dat', confirmed_at = now()
                 WHERE construction_site_id = ${s!.id} AND kind = 'khoi_cong'`;
      return s!.id;
    });

    expect(
      (await tp.rpc('build_site_budget_from_quote', { p_site_id: budgetSite })).error,
    ).toBeNull();
    const lines = await withSql(
      (sql) => sql<{ amount: string }[]>`
        SELECT budgeted_amount::text AS amount FROM project_budgets
         WHERE construction_site_id = ${budgetSite} AND deleted_at IS NULL`,
    );
    // Giá vốn: 10 × 40tr + 2 × 20tr = 440tr (giá bán là 550tr).
    expect(lines.map((l) => Number(l.amount))).toEqual([440_000_000]);
  });

  it('chưa được Tổng Giám đốc duyệt thì không khởi công; Thi công không tự duyệt; sửa khi đang chờ bị chặn', async () => {
    const r = await readiness(tp, 'site', budgetSite);
    expect(r.find((x) => x.requirement === 'budget_approved')!.met).toBe(false);
    const blocked = await cht.rpc('move_site_stage', {
      p_site_id: budgetSite,
      p_stage: 'dang_thi_cong',
    });
    expect(blocked.error?.message).toContain('Tổng Giám đốc duyệt ngân sách');

    // Chỉ huy trưởng không gửi được; Trưởng phòng Thi công gửi.
    expect((await cht.rpc('submit_site_budget', { p_site_id: budgetSite })).error).not.toBeNull();
    const sub = await tp.rpc('submit_site_budget', { p_site_id: budgetSite });
    expect(sub.error).toBeNull();

    const state = await tp.rpc('site_budget_approval', { p_site_id: budgetSite });
    expect((state.data as { state: string; state_label: string }[])[0]!.state_label).toBe(
      'Chờ Tổng Giám đốc duyệt',
    );

    // Đang chờ: sửa dòng bị chặn.
    const { data: line } = await tp
      .from('project_budgets')
      .select('id')
      .eq('construction_site_id', budgetSite)
      .single();
    const edit = await tp.rpc('save_site_budget_line', {
      p_site_id: budgetSite,
      p_line_id: (line as { id: string }).id,
      p_cost_group: 'vat_tu',
      p_cost_code: 'TONG',
      p_name: 'Chi phí thi công',
      p_budgeted_amount: 450_000_000,
    });
    expect(edit.error?.message).toContain('chờ Tổng Giám đốc duyệt');

    const [appr] = await withSql(
      (sql) => sql<{ id: string }[]>`
        SELECT approval_id AS id FROM site_budget_submissions WHERE id = ${sub.data as string}`,
    );
    // Trưởng phòng Thi công không có hạn mức loại này.
    expect(
      (await tp.rpc('decide_approval', { p_approval_id: appr!.id, p_decision: 'approved' })).error,
    ).not.toBeNull();
    expect(
      (await tgd.rpc('decide_approval', { p_approval_id: appr!.id, p_decision: 'approved' })).error,
    ).toBeNull();
    expect(
      (await readiness(tp, 'site', budgetSite)).find((x) => x.requirement === 'budget_approved')!
        .met,
    ).toBe(true);
  });

  it('sửa ngân sách sau khi đã duyệt → phải gửi duyệt lại trước khởi công', async () => {
    const { data: line } = await tp
      .from('project_budgets')
      .select('id')
      .eq('construction_site_id', budgetSite)
      .single();
    expect(
      (
        await tp.rpc('save_site_budget_line', {
          p_site_id: budgetSite,
          p_line_id: (line as { id: string }).id,
          p_cost_group: 'vat_tu',
          p_cost_code: 'TONG',
          p_name: 'Chi phí thi công',
          p_budgeted_amount: 460_000_000,
        })
      ).error,
    ).toBeNull();
    const state = await tp.rpc('site_budget_approval', { p_site_id: budgetSite });
    const row = (state.data as { state: string; superseded: boolean }[])[0]!;
    expect(row.state).toBe('nhap');
    expect(row.superseded).toBe(true);
    expect(
      (await cht.rpc('move_site_stage', { p_site_id: budgetSite, p_stage: 'dang_thi_cong' })).error
        ?.message,
    ).toContain('Tổng Giám đốc duyệt ngân sách');

    const sub = await tp.rpc('submit_site_budget', { p_site_id: budgetSite });
    expect(sub.error).toBeNull();
    const [appr] = await withSql(
      (sql) => sql<{ id: string }[]>`
        SELECT approval_id AS id FROM site_budget_submissions WHERE id = ${sub.data as string}`,
    );
    expect(
      (await tgd.rpc('decide_approval', { p_approval_id: appr!.id, p_decision: 'approved' })).error,
    ).toBeNull();
    expect(
      (await cht.rpc('move_site_stage', { p_site_id: budgetSite, p_stage: 'dang_thi_cong' })).error,
    ).toBeNull();
  });

  // ---------------------------------------------------------------------------------------------
  // 5. Kênh gửi báo giá
  // ---------------------------------------------------------------------------------------------
  it('gửi khách báo giá ghi kênh; mở Zalo gửi báo giá đã duyệt thì ghi đã gửi qua Zalo', async () => {
    const [kd] = await withSql(
      (sql) => sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`,
    );
    const opp = await makeOpp(nvcId, 'KG', kd!.id);
    const quoteIds = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO quotes (company_id, code, opportunity_id, status, is_current_version, scope_kind)
        VALUES (${nvcId}, ${'GA-BG1-' + stamp}, ${opp}, 'completed', true, 'thiet_ke'),
               (${nvcId}, ${'GA-BG2-' + stamp}, ${opp}, 'completed', true, 'thi_cong')
        RETURNING id`;
      await sql`UPDATE quotes SET status = 'completed', sent_to_customer_at = NULL
                 WHERE id IN ${sql(rows.map((r) => r.id))}`;
      return rows.map((r) => r.id);
    });
    const q1 = quoteIds[0]!;
    const q2 = quoteIds[1]!;
    const bad = await kdNvc.rpc('send_quote_to_customer', { p_quote_id: q1, p_channel: 'fax' });
    expect(bad.error?.message).toContain('Kênh gửi');
    expect(
      (await kdNvc.rpc('send_quote_to_customer', { p_quote_id: q1, p_channel: 'tan_tay' })).error,
    ).toBeNull();

    const share = await kdNvc
      .from('outbound_shares')
      .insert({
        company_id: nvcId,
        entity_type: 'quotes',
        entity_id: q2,
        channel: 'zalo',
        via: 'zalo_web',
        created_by: (await kdNvc.rpc('auth_user_id')).data,
      })
      .select('id')
      .single();
    expect(share.error).toBeNull();

    const rows = await withSql(
      (sql) => sql<{ id: string; ch: string | null; sent: boolean }[]>`
        SELECT id, sent_channel AS ch, sent_to_customer_at IS NOT NULL AS sent FROM quotes
         WHERE id IN (${q1}, ${q2})`,
    );
    expect(rows.find((r) => r.id === q1)).toMatchObject({ ch: 'tan_tay', sent: true });
    expect(rows.find((r) => r.id === q2)).toMatchObject({ ch: 'zalo', sent: true });

    // Kênh không sửa thẳng từ trình duyệt.
    const direct = await kdNvc.from('quotes').update({ sent_channel: 'email' }).eq('id', q1);
    const after = await withSql(
      (sql) => sql<{ ch: string }[]>`SELECT sent_channel AS ch FROM quotes WHERE id = ${q1}`,
    );
    expect(direct.error !== null || after[0]!.ch === 'tan_tay').toBe(true);
    expect(after[0]!.ch).toBe('tan_tay');
  });

  // ---------------------------------------------------------------------------------------------
  // 6. Lợi nhuận dự toán: số máy tính
  // ---------------------------------------------------------------------------------------------
  it('lợi nhuận dự toán lấy số máy tính; số gõ tay không lách được mức tối thiểu', async () => {
    const [bid] = await withSql(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO bidding_projects (company_id, code, name, stage, participation_status)
        VALUES (${nvcId}, ${'GA-DA-' + stamp}, ${TAG + ' Gói thầu ' + stamp}, 'du_toan', 'da_duyet')
        RETURNING id`,
    );
    bidIds.push(bid!.id);
    // Giá 1,1 tỷ (thuế 100tr) → trước thuế 1 tỷ; chi phí 950tr → lợi nhuận MÁY 50tr = 5 %.
    // Người lập gõ 200tr / 20 % (lệch).
    const [est] = await withSql(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO estimates (company_id, bidding_project_id, code, status, bid_price, tax_amount,
                               direct_cost, overhead_cost, contingency_cost, finance_cost,
                               profit_amount, profit_margin_percent)
        VALUES (${nvcId}, ${bid!.id}, ${'GA-DT-' + stamp}, 'draft', 1100000000, 100000000,
                800000000, 100000000, 50000000, 0, 200000000, 20)
        RETURNING id`,
    );
    estimateIds.push(est!.id);
    await withSql(
      (sql) => sql`UPDATE system_parameters SET value = '10'::jsonb
                    WHERE param_key = 'min_margin_percent' AND scope_type = 'company' AND scope_id = ${nvcId}`,
    );
    const req = await dauThau.rpc('request_estimate_approval', { p_estimate_id: est!.id });
    expect(req.error).toBeNull();
    const [appr] = await withSql(
      (sql) => sql<{ subject: string }[]>`
        SELECT subject::text FROM approvals WHERE entity_type = 'estimates' AND entity_id = ${est!.id}
           AND status = 'pending_approval'`,
    );
    expect(appr!.subject).toBe('low_margin_price');

    const brief = await tgd.rpc('price_margin_brief', {
      p_entity_type: 'estimates',
      p_entity_id: est!.id,
    });
    expect(brief.error).toBeNull();
    const b = (
      brief.data as {
        profit: number;
        margin_percent: number;
        typed_profit: number;
        typed_margin_percent: number;
        typed_mismatch: boolean;
      }[]
    )[0]!;
    expect(Number(b.profit)).toBe(50_000_000);
    expect(Number(b.margin_percent)).toBe(5);
    expect(Number(b.typed_profit)).toBe(200_000_000);
    expect(Number(b.typed_margin_percent)).toBe(20);
    expect(b.typed_mismatch).toBe(true);
  });

  // ---------------------------------------------------------------------------------------------
  // 7. Đợt giữ lại bảo hành
  // ---------------------------------------------------------------------------------------------
  it('đợt giữ lại bảo hành: hạn theo ngày hết bảo hành, tới hạn thì đến hạn thu', async () => {
    const c = await makeContract({
      companyId: nvcId,
      label: 'GL',
      type: 'thi_cong',
      scope: 'thi_cong',
      opportunityId: null,
      stage: 'da_ky',
      value: 2_000_000_000,
    });
    const { termId, siteId } = await withSql(async (sql) => {
      const [s] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, contract_id, stage)
        VALUES (${nvcId}, ${'GA-CT-GL-' + stamp}, ${TAG + ' GL ' + stamp}, ${c}, 'bao_hanh')
        RETURNING id`;
      siteIds.push(s!.id);
      const [t] = await sql<{ id: string }[]>`
        INSERT INTO contract_terms (company_id, contract_id, term_type, description, percent_value, position,
                                    collection_trigger)
        VALUES (${nvcId}, ${c}, 'tien_do_thanh_toan', ${TAG + ' Hết thời hạn bảo hành'}, '5', '5', 'het_bao_hanh')
        RETURNING id`;
      return { termId: t!.id, siteId: s!.id };
    });
    // Khai bảo hành đã hết hạn hôm qua → hạn đợt = hôm qua; quét đêm → đến hạn thu.
    await withSql(
      (sql) => sql`
        INSERT INTO warranties (company_id, construction_site_id, item, start_date, warranty_until)
        VALUES (${nvcId}, ${siteId}, ${TAG + ' Mái'}, current_date - 400, current_date - 1)`,
    );
    const [t1] = await withSql(
      (sql) => sql<{ d: number; due: string | null }[]>`
        SELECT (due_date - current_date) AS d, collection_due_at::text AS due FROM contract_terms WHERE id = ${termId}`,
    );
    expect(Number(t1!.d)).toBe(-1);
    expect(t1!.due).toBeNull();
    await withSql((sql) => sql`SELECT scan_collection_reminders()`);
    const [t2] = await withSql(
      (sql) =>
        sql<
          { due: string | null }[]
        >`SELECT collection_due_at::text AS due FROM contract_terms WHERE id = ${termId}`,
    );
    expect(t2!.due).not.toBeNull();
    const kt = await withSql(
      (sql) => sql<{ message: string }[]>`
        SELECT n.message FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE u.email = ${ACCOUNTS.ketoan} AND n.type = 'collection_due' AND n.related_entity_id = ${termId}`,
    );
    expect(kt[0]!.message).toContain('hết hạn bảo hành');
    expect(kt[0]!.message).toContain('100.000.000');
  });
});
