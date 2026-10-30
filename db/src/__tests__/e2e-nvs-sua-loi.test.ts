/**
 * Lỗi tìm thấy khi chạy thử trọn luồng NVS (cho thuê giàn giáo) trên trình duyệt (30/10/2026, migration 0252).
 *
 * Hàng rào phải đứng:
 *  - Lý do phê duyệt báo giá thuê in số kiểu Việt Nam («2.500 đồng/ngày»), không «2,500».
 *  - Hợp đồng cho thuê ký xong thì Xưởng (người sửa được phân hệ SX của pháp nhân) được báo, lời báo
 *    không có giá trị hợp đồng và dẫn sang trang lập đơn thuê.
 *  - Công nợ sinh từ đơn thuê theo hợp đồng cho thuê gắn `contract_id`.
 *  - Biên bản thu hồi ký hai bên thì Kế toán của pháp nhân được báo số phải thu.
 *  - «Gửi qua Zalo» báo giá thuê: Xưởng ghi được lịch sử khi báo giá ĐÃ DUYỆT; bản nháp thì không; Kế toán
 *    (không sửa được SX) thì không.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/e2e-nvs-sua-loi.test.ts`
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

describeDb('Sửa lỗi chạy thử NVS (0252)', () => {
  const stamp = String(Date.now());
  let sx: SupabaseClient;
  let kt: SupabaseClient;
  let nvs = '';
  let mat = '';
  let customer = '';
  let contractId = '';
  let agreementId = '';
  const quoteIds: string[] = [];

  beforeAll(async () => {
    [sx, kt] = await Promise.all([signInAs(ACCOUNTS.xuongNvs), signInAs(ACCOUNTS.ketoan)]);
    await withSql(async (sql) => {
      nvs = (await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`)[0]!.id;
      mat = (
        await sql<{ id: string }[]>`
        INSERT INTO materials (code, group_code, name, unit, is_scaffolding)
        VALUES (${'GIANGIAO-0252-' + stamp}, 'GIANGIAO', ${TEST_PREFIX + ' Giáo 0252 ' + stamp}, 'bộ', true)
        RETURNING id`
      )[0]!.id;
      await sql`
        INSERT INTO system_parameters (param_key, scope_type, scope_id, value, unit, label)
        VALUES ('sx.rental_daily_rate', 'product', ${mat}, '3000'::jsonb, 'đồng/ngày', ${TEST_PREFIX + ' bảng giá 0252'})`;
      customer = (
        await sql<{ id: string }[]>`
        INSERT INTO customers (name, phone) VALUES (${TEST_PREFIX + ' Khách 0252 ' + stamp}, ${'07' + stamp.slice(-8)})
        RETURNING id`
      )[0]!.id;
      contractId = (
        await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, customer_id, value)
        VALUES (${nvs}, ${'NVS-HD-0252-' + stamp}, ${TEST_PREFIX + ' Hợp đồng cho thuê 0252'}, 'cho_thue',
                'da_duyet', ${customer}, 10000000)
        RETURNING id`
      )[0]!.id;
      agreementId = (
        await sql<{ id: string }[]>`
        INSERT INTO rental_agreements (company_id, code, customer_id, start_date)
        VALUES (${nvs}, ${'NVS-HDT-0252-' + stamp}, ${customer}, current_date)
        RETURNING id`
      )[0]!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM outbound_shares WHERE entity_id IN ${sql(quoteIds.length ? quoteIds : ['00000000-0000-0000-0000-000000000000'])}`.catch(
        () => undefined,
      );
      if (quoteIds.length) {
        await sql`DELETE FROM approvals WHERE entity_id IN ${sql(quoteIds)}`;
        await sql`DELETE FROM rental_quotes WHERE id IN ${sql(quoteIds)}`;
      }
      if (!agreementId || !contractId) return;
      await sql`DELETE FROM receivables_payables WHERE rental_agreement_id = ${agreementId}`;
      await sql`DELETE FROM notifications WHERE related_entity_id = ${agreementId}`;
      await sql`DELETE FROM rental_returns WHERE rental_agreement_id = ${agreementId}`;
      await sql`DELETE FROM rental_agreements WHERE id = ${agreementId}`;
      await sql`DELETE FROM notifications WHERE related_entity_id = ${contractId}`;
      await sql`DELETE FROM contracts WHERE id = ${contractId}`;
      await sql`DELETE FROM system_parameters WHERE scope_id = ${mat}`;
    });
  });

  async function newQuote(unitPrice: number): Promise<string> {
    const { data, error } = await sx
      .from('rental_quotes')
      .insert({
        company_id: nvs,
        customer_id: customer,
        needed_date: '2026-11-01',
        expected_end_date: '2026-11-10',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    quoteIds.push(id);
    const { error: e2 } = await sx.from('rental_quote_items').insert({
      rental_quote_id: id,
      material_id: mat,
      kind: 'thue',
      quantity: 1200,
      unit_price: unitPrice,
    });
    expect(e2).toBeNull();
    return id;
  }

  it('lý do duyệt báo giá thuê in số kiểu Việt Nam', async () => {
    const id = await newQuote(2500);
    const { data, error } = await sx.rpc('submit_rental_quote', { p_quote_id: id });
    expect(error).toBeNull();
    expect(data).toBe('cho_duyet');
    const [a] = await withSql(
      (sql) => sql<{ reason: string }[]>`SELECT reason FROM approvals WHERE entity_id = ${id}`,
    );
    expect(a!.reason).toContain('2.500 đồng/ngày');
    expect(a!.reason).toContain('3.000 đồng/ngày');
    expect(a!.reason).not.toMatch(/\d,\d{3}/);
  });

  it('hợp đồng cho thuê ký xong: Xưởng được báo, không lộ giá trị, dẫn sang trang lập đơn thuê', async () => {
    await withSql((sql) => sql`UPDATE contracts SET stage = 'da_ky' WHERE id = ${contractId}`);
    const rows = await withSql(
      (sql) => sql<{ email: string; message: string; action_url: string }[]>`
        SELECT u.email, n.message, n.action_url FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE n.related_entity_id = ${contractId} AND n.type = 'rental_contract_signed'`,
    );
    const toSx = rows.find((r) => r.email === ACCOUNTS.xuongNvs);
    expect(toSx).toBeDefined();
    expect(toSx!.action_url).toBe('/sx/tai-san-cho-thue');
    expect(toSx!.message).not.toContain('10.000.000');
  });

  it('công nợ của đơn thuê theo hợp đồng gắn hợp đồng', async () => {
    await withSql(async (sql) => {
      await sql`UPDATE contracts SET stage = 'da_ky' WHERE id = ${contractId} AND stage <> 'da_ky'`;
      await sql`UPDATE rental_agreements SET contract_id = ${contractId} WHERE id = ${agreementId}`;
    });
    const [r] = await withSql(
      (sql) => sql<{ contract_id: string | null }[]>`
        INSERT INTO receivables_payables (company_id, direction, party_type, customer_id, party_name, description,
                                          amount, rental_agreement_id)
        VALUES (${nvs}, 'phai_thu', 'khach_hang', ${customer}, 'Khách 0252', ${TEST_PREFIX + ' 0252'}, 100000,
                ${agreementId})
        RETURNING contract_id`,
    );
    expect(r!.contract_id).toBe(contractId);
  });

  it('biên bản thu hồi ký hai bên: Kế toán được báo khoản phải thu', async () => {
    const rows = await withSql(async (sql) => {
      const [r] = await sql<{ id: string }[]>`
        INSERT INTO rental_returns (company_id, rental_agreement_id, code, return_date, revenue, compensation)
        VALUES (${nvs}, ${agreementId}, ${'NVS-BBTH-0252-' + stamp}, current_date, 1500000, 250000)
        RETURNING id`;
      await sql`UPDATE rental_returns SET signed_at = now(), customer_representative = 'Khách 0252',
                       paper_scan_path = ${agreementId + '/0252.pdf'} WHERE id = ${r!.id}`;
      return sql<{ email: string; message: string; action_url: string }[]>`
        SELECT u.email, n.message, n.action_url FROM notifications n JOIN users u ON u.id = n.user_id
         WHERE n.related_entity_id = ${agreementId} AND n.type = 'rental_return_signed'`;
    });
    const toKt = rows.find((r) => r.email === ACCOUNTS.ketoan);
    expect(toKt).toBeDefined();
    expect(toKt!.message).toContain('1.750.000 đồng');
    expect(toKt!.action_url).toBe('/kt/thue-gian-giao');
  });

  it('Zalo báo giá thuê: chỉ bản đã duyệt, chỉ người sửa được SX', async () => {
    const draft = await newQuote(3000);
    const sxId = (
      await withSql(
        (sql) => sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.xuongNvs}`,
      )
    )[0]!.id;
    const ktId = (
      await withSql(
        (sql) => sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.ketoan}`,
      )
    )[0]!.id;
    const insert = (client: SupabaseClient, id: string, by: string) =>
      client.from('outbound_shares').insert({
        entity_type: 'rental_quotes',
        entity_id: id,
        channel: 'zalo',
        via: 'zalo_web',
        created_by: by,
      });
    expect((await insert(sx, draft, sxId)).error).not.toBeNull();
    // Theo bảng giá → tự duyệt.
    const { data } = await sx.rpc('submit_rental_quote', { p_quote_id: draft });
    expect(data).toBe('da_duyet');
    expect((await insert(kt, draft, ktId)).error).not.toBeNull();
    expect((await insert(sx, draft, sxId)).error).toBeNull();
  });
});
