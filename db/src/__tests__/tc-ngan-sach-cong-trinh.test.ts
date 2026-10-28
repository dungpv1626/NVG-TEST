/**
 * Ngân sách lập ngay trên công trình, từ báo giá đã duyệt (0235).
 *
 * Lỗi gốc: hợp đồng thi công từ cơ hội CRM ký xong tự mở công trình (0187), nhưng ngân sách chỉ dựng từ dự toán
 * của gói thầu / hồ sơ thiết kế — công trình ấy 0 dòng ngân sách, đề nghị mua gắn công trình không gửi phê duyệt
 * được («Mã chi phí … không có trong ngân sách của công trình này»).
 *
 * Canh: Trưởng phòng Thi công lập được từ báo giá (một dòng tổng, số dự trù 0 — máy không tự đặt tỷ lệ); Kinh doanh
 * và chỉ huy trưởng bị chặn; lập hai lần bị chặn; có ngân sách thì đề nghị mua qua được mã chi phí; chỉ huy trưởng
 * công trình khác không đọc được dòng ngân sách; dòng lợi nhuận Thi công không thấy, không sửa được; dòng đã có
 * đề nghị mua không đổi mã / xoá được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-ngan-sach-cong-trinh.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

interface BudgetLine {
  id: string;
  cost_group: string;
  cost_code: string;
  name: string;
  budgeted_amount: number;
  notes: string | null;
}

describeDb('Ngân sách công trình từ báo giá (0235)', () => {
  let tc: SupabaseClient;
  let cht: SupabaseClient;
  let kd: SupabaseClient;
  let tgd: SupabaseClient;
  /** Công trình mở từ hợp đồng của cơ hội — chỉ huy trưởng KHÔNG được phân công. */
  let siteId = '';
  /** Công trình thứ hai — chỉ huy trưởng là người chịu trách nhiệm (trong phạm vi). */
  let ownSiteId = '';
  const stamp = String(Date.now());

  beforeAll(async () => {
    [tc, cht, kd, tgd] = await Promise.all([
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
    await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [chtUser] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name) VALUES (${'KH-NS-' + stamp}, ${TEST_PREFIX + ' Khách ngân sách ' + stamp})
        RETURNING id`;

      async function siteFromOpportunity(label: string, responsible: string | null) {
        const [o] = await sql<{ id: string }[]>`
          INSERT INTO opportunities (company_id, code, customer_id, name, stage)
          VALUES (${nvc!.id}, ${'NVC-CH-NS-' + label + stamp}, ${cu!.id}, ${TEST_PREFIX + ' Cơ hội ngân sách ' + label}, 'dam_phan')
          RETURNING id`;
        // Trigger của báo giá luôn đưa bản mới về Nháp — đặt «đã duyệt, đã gửi khách» sau khi tạo.
        const [q] = await sql<{ id: string }[]>`
          INSERT INTO quotes (company_id, code, opportunity_id, total_value)
          VALUES (${nvc!.id}, ${'NVC-BG-NS-' + label + stamp}, ${o!.id}, 1500000000)
          RETURNING id`;
        await sql`UPDATE quotes SET status = 'completed', sent_to_customer_at = now() WHERE id = ${q!.id}`;
        const [c] = await sql<{ id: string }[]>`
          INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date, source_type, source_id)
          VALUES (${nvc!.id}, ${'NVC-HD-NS-' + label + stamp}, ${TEST_PREFIX + ' Hợp đồng ngân sách ' + label},
                  'thi_cong', 'da_ky', 1500000000, current_date, 'opportunities', ${o!.id})
          RETURNING id`;
        const [s] = await sql<{ id: string }[]>`
          INSERT INTO construction_sites (company_id, code, name, contract_id, responsible_user_id)
          VALUES (${nvc!.id}, ${'NVC-CT-NS-' + label + stamp}, ${TEST_PREFIX + ' Công trình ngân sách ' + label},
                  ${c!.id}, ${responsible})
          RETURNING id`;
        return s!.id;
      }

      siteId = await siteFromOpportunity('A', null);
      ownSiteId = await siteFromOpportunity('B', chtUser!.id);
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM approvals WHERE title LIKE ${'%' + TEST_PREFIX + ' Ngân sách công trình%'}`;
      await sql`DELETE FROM purchase_requests WHERE construction_site_id IN ${sql([siteId, ownSiteId])}`;
      await sql`DELETE FROM project_budgets WHERE construction_site_id IN ${sql([siteId, ownSiteId])}`;
    });
  });

  async function lines(client: SupabaseClient, site = siteId): Promise<BudgetLine[]> {
    const { data, error } = await client
      .from('project_budgets')
      .select('id, cost_group, cost_code, name, budgeted_amount, notes')
      .eq('construction_site_id', site);
    expect(error).toBeNull();
    return (data ?? []) as BudgetLine[];
  }

  it('Kinh doanh và chỉ huy trưởng không lập được; Kinh doanh không nhận được báo giá', async () => {
    const byKd = await kd.rpc('build_site_budget_from_quote', { p_site_id: siteId });
    expect(byKd.error?.message).toMatch(/Không lập được ngân sách/);

    const byCht = await cht.rpc('build_site_budget_from_quote', { p_site_id: ownSiteId });
    expect(byCht.error?.message).toMatch(/Không lập được ngân sách/);

    const src = await kd.rpc('site_budget_source', { p_site_id: siteId });
    expect(src.error).toBeNull();
    expect((src.data as Record<string, unknown>[])[0]).toMatchObject({
      can_manage: false,
      quote_value: null,
    });
  });

  it('Trưởng phòng Thi công lập được từ báo giá: một dòng tổng, số dự trù 0, ghi nguồn', async () => {
    const src = await tc.rpc('site_budget_source', { p_site_id: siteId });
    expect((src.data as Record<string, unknown>[])[0]).toMatchObject({
      can_manage: true,
      has_budget: false,
      quote_value: 1500000000,
    });

    const built = await tc.rpc('build_site_budget_from_quote', { p_site_id: siteId });
    expect(built.error).toBeNull();

    const rows = await lines(tc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cost_code: 'TONG', budgeted_amount: 0 });
    expect(rows[0]!.notes).toMatch(/NVC-BG-NS-A/);
    expect(rows[0]!.notes).toMatch(/1\.500\.000\.000 đồng/);
  });

  it('lập lần hai bị chặn', async () => {
    const again = await tc.rpc('build_site_budget_from_quote', { p_site_id: siteId });
    expect(again.error?.message).toMatch(/đã có ngân sách/);
  });

  it('sửa dòng tổng thành mã vật tư rồi đề nghị mua gắn công trình qua được mã chi phí', async () => {
    const [line] = await lines(tc);
    const saved = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: line!.id,
      p_cost_group: 'vat_tu',
      p_cost_code: 'vt-chinh',
      p_name: 'Vật tư chính',
      p_budgeted_amount: 900000000,
    });
    expect(saved.error).toBeNull();

    const codes = await tc.rpc('site_cost_codes', { p_site_id: siteId });
    expect((codes.data as { cost_code: string }[]).map((c) => c.cost_code)).toEqual(['VT-CHINH']);

    const { data: company } = await tc
      .from('construction_sites')
      .select('company_id')
      .eq('id', siteId);
    const pr = await tc
      .from('purchase_requests')
      .insert({
        company_id: company![0]!.company_id,
        code: 'PR-NS-' + stamp,
        title: TEST_PREFIX + ' Ngân sách công trình ' + stamp,
        construction_site_id: siteId,
        cost_code: 'VT-CHINH',
        needed_date: '2099-01-01',
      })
      .select('id')
      .single();
    expect(pr.error).toBeNull();
    const item = await tc.from('purchase_request_items').insert({
      purchase_request_id: pr.data!.id,
      name: 'Xi măng',
      unit: 'bao',
      quantity: 10,
      estimated_unit_price: 90000,
    });
    expect(item.error).toBeNull();

    const submitted = await tc.rpc('submit_purchase_request_approval', {
      p_request_id: pr.data!.id,
    });
    expect(submitted.error).toBeNull();

    // Mã đã có đề nghị mua: đổi mã / xoá bị chặn (đơn hàng tìm dòng ngân sách theo mã).
    const rename = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: line!.id,
      p_cost_group: 'vat_tu',
      p_cost_code: 'VT-KHAC',
      p_name: 'Vật tư chính',
      p_budgeted_amount: 900000000,
    });
    expect(rename.error?.message).toMatch(/không đổi mã được/);
    const del = await tc.rpc('delete_site_budget_line', { p_line_id: line!.id });
    expect(del.error?.message).toMatch(/không xoá được/);
  });

  it('chỉ huy trưởng: công trình khác không đọc được dòng; công trình mình đọc được nhưng không sửa', async () => {
    expect(await lines(cht)).toHaveLength(0);

    const built = await tc.rpc('build_site_budget_from_quote', { p_site_id: ownSiteId });
    expect(built.error).toBeNull();
    const own = await lines(cht, ownSiteId);
    expect(own).toHaveLength(1);

    const edit = await cht.rpc('save_site_budget_line', {
      p_site_id: ownSiteId,
      p_line_id: own[0]!.id,
      p_cost_group: 'vat_tu',
      p_cost_code: 'TONG',
      p_name: 'Tự sửa',
      p_budgeted_amount: 1,
    });
    expect(edit.error?.message).toMatch(/Không sửa được ngân sách/);
  });

  it('dòng lợi nhuận: Ban Giám đốc thêm được, Thi công không thấy và không sửa / xoá được', async () => {
    const added = await tgd.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: null,
      p_cost_group: 'loi_nhuan',
      p_cost_code: 'LOI_NHUAN',
      p_name: 'Lợi nhuận mục tiêu',
      p_budgeted_amount: 300000000,
    });
    expect(added.error).toBeNull();
    const profitId = added.data as string;

    expect((await lines(tgd)).some((l) => l.cost_group === 'loi_nhuan')).toBe(true);
    expect((await lines(tc)).some((l) => l.cost_group === 'loi_nhuan')).toBe(false);

    const status = await tc.rpc('construction_budget_status', { p_site_id: siteId });
    expect(
      (status.data as { cost_group: string }[]).some((r) => r.cost_group === 'loi_nhuan'),
    ).toBe(false);

    const tcAdd = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: null,
      p_cost_group: 'loi_nhuan',
      p_cost_code: 'LN2',
      p_name: 'Lợi nhuận',
      p_budgeted_amount: 1,
    });
    expect(tcAdd.error?.message).toMatch(/Dòng lợi nhuận/);
    const tcEdit = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: profitId,
      p_cost_group: 'vat_tu',
      p_cost_code: 'LOI_NHUAN',
      p_name: 'Đổi nhóm để đọc',
      p_budgeted_amount: 300000000,
    });
    expect(tcEdit.error?.message).toMatch(/Không tìm thấy dòng/);
    const tcDel = await tc.rpc('delete_site_budget_line', { p_line_id: profitId });
    expect(tcDel.error?.message).toMatch(/Không xoá được/);
  });

  it('thêm dòng mới, trùng mã bị chặn, xoá mềm dòng chưa dùng', async () => {
    const add = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: null,
      p_cost_group: 'nhan_cong',
      p_cost_code: 'NC',
      p_name: 'Nhân công',
      p_budgeted_amount: 200000000,
    });
    expect(add.error).toBeNull();

    const dup = await tc.rpc('save_site_budget_line', {
      p_site_id: siteId,
      p_line_id: null,
      p_cost_group: 'may_moc',
      p_cost_code: 'nc',
      p_name: 'Trùng mã',
      p_budgeted_amount: 0,
    });
    expect(dup.error?.message).toMatch(/đã có trong ngân sách/);

    const del = await tc.rpc('delete_site_budget_line', { p_line_id: add.data as string });
    expect(del.error).toBeNull();
    expect((await lines(tc)).some((l) => l.cost_code === 'NC')).toBe(false);
  });
});
