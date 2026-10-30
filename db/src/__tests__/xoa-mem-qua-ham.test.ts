/**
 * Xoá mềm từ trình duyệt qua hàm (0250) — chạy thử NVO 30/10/2026.
 *
 * Chính sách đọc của `contract_terms` và `site_plan_items` có `deleted_at IS NULL`; PostgreSQL kiểm
 * dòng MỚI của một UPDATE có WHERE theo chính sách đọc, nên `update set deleted_at = now()` từ
 * trình duyệt luôn bị 403 — nút «Xoá» dòng điều khoản hợp đồng và «Bỏ đầu việc» không bao giờ chạy.
 *
 * Chạy: node dbtest-lock.cjs db/src/__tests__/xoa-mem-qua-ham.test.ts
 */

import { describe, expect, it } from 'vitest';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('xoá mềm qua hàm (0250)', () => {
  type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

  async function withSql<T>(fn: (sql: Sql) => Promise<T>) {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      return await fn(sql);
    } finally {
      await sql.end();
    }
  }

  it('xoá dòng điều khoản hợp đồng nháp: người soạn xoá được qua hàm, người khác bị từ chối', async () => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const oppId = await withSql(async (sql) => {
      const [nvo] = await sql`SELECT id FROM companies WHERE code = 'NVO'`;
      const [customer] = await sql`SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1`;
      const [owner] = await sql`SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
      const [opp] = await sql`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvo!.id}, ${'XM-CH-' + stamp}, ${customer!.id}, ${TEST_PREFIX + ' Xoá mềm ' + stamp},
                ${owner!.id}, 'dam_phan')
        RETURNING id`;
      return opp!.id as string;
    });
    const { data: contractId, error: draftError } = await (
      await signInAs(ACCOUNTS.kinhDoanhNvo)
    ).rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: oppId,
      p_type: 'thiet_ke',
      p_title: `${TEST_PREFIX} Hợp đồng xoá mềm ${stamp}`,
      p_scope_kind: null,
    });
    expect(draftError?.message ?? null).toBeNull();

    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const [contract] = await withSql(
      (sql) => sql`SELECT company_id FROM contracts WHERE id = ${contractId as string}`,
    );
    const companyId = contract!.company_id as string;
    const { data: term, error: insertError } = await kd
      .from('contract_terms')
      .insert({
        contract_id: contractId,
        company_id: companyId,
        term_type: 'tien_do_thanh_toan',
        description: `${TEST_PREFIX} Đợt nhập nhầm`,
      })
      .select('id')
      .single();
    expect(insertError?.message ?? null).toBeNull();

    // Đường cũ của giao diện — vẫn bị RLS chặn (lý do của hàm).
    const { error: directError } = await kd
      .from('contract_terms')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', term!.id);
    expect(directError).not.toBeNull();

    const tc = await signInAs(ACCOUNTS.congTruongNvo);
    const { error: otherError } = await tc.rpc('delete_contract_term', { p_term_id: term!.id });
    expect(otherError?.message).toBeTruthy();

    const { error } = await kd.rpc('delete_contract_term', { p_term_id: term!.id });
    expect(error?.message ?? null).toBeNull();
    const [row] = await withSql(
      (sql) => sql`SELECT deleted_at FROM contract_terms WHERE id = ${term!.id}`,
    );
    expect(row!.deleted_at).not.toBeNull();
  });

  it('bỏ đầu việc kế hoạch tuần: chỉ huy trưởng công trình bỏ được; đầu việc đã có tiến độ thì không', async () => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const f = await withSql(async (sql) => {
      const [nvo] = await sql`SELECT id FROM companies WHERE code = 'NVO'`;
      const [cht] = await sql`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
      const [site] = await sql`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
        VALUES (${nvo!.id}, ${'NVO-CT-XM-' + stamp}, ${TEST_PREFIX + ' Xoá mềm ' + stamp}, 'dang_thi_cong',
                current_date + 60, ${cht!.id})
        RETURNING id`;
      const items = await sql`
        INSERT INTO site_plan_items (company_id, construction_site_id, week_start, name)
        VALUES (${nvo!.id}, ${site!.id}, current_date, ${TEST_PREFIX + ' Đầu việc nhầm'}),
               (${nvo!.id}, ${site!.id}, current_date, ${TEST_PREFIX + ' Đầu việc đã làm'})
        RETURNING id`;
      const [log] = await sql`
        INSERT INTO site_logs (company_id, construction_site_id, log_date, content, created_by)
        VALUES (${nvo!.id}, ${site!.id}, current_date, ${TEST_PREFIX + ' nhật ký'}, ${cht!.id})
        RETURNING id`;
      await sql`
        INSERT INTO site_log_plan_progress (company_id, construction_site_id, site_log_id, plan_item_id, created_by)
        VALUES (${nvo!.id}, ${site!.id}, ${log!.id}, ${items[1]!.id}, ${cht!.id})`;
      return { wrong: items[0]!.id as string, used: items[1]!.id as string };
    });

    const kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { error: kdError } = await kd.rpc('remove_site_plan_item', { p_item_id: f.wrong });
    expect(kdError?.message).toBeTruthy();

    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    const { error } = await cht.rpc('remove_site_plan_item', { p_item_id: f.wrong });
    expect(error?.message ?? null).toBeNull();
    const { error: usedError } = await cht.rpc('remove_site_plan_item', { p_item_id: f.used });
    expect(usedError?.message).toContain('đã có tiến độ');

    const rows = await withSql(
      (sql) => sql`SELECT id, deleted_at FROM site_plan_items WHERE id IN (${f.wrong}, ${f.used})`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id as string, r.deleted_at]));
    expect(byId[f.wrong]).not.toBeNull();
    expect(byId[f.used]).toBeNull();
  });
});
