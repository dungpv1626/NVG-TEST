/**
 * Lịch sử «đã mở Zalo để gửi khách» (migration 0238).
 *
 * Hàng rào phải đứng:
 *  - Đọc theo quyền đọc hồ sơ gốc: Thi công không xem Module Hợp đồng nên không thấy lần gửi bản đã ký;
 *    Kinh doanh pháp nhân khác không thấy lần gửi báo giá.
 *  - Ghi theo quyền gửi hồ sơ gốc: chỉ người chịu trách nhiệm / lãnh đạo; Kiểm soát nội bộ chỉ xem; báo giá
 *    chưa duyệt, hợp đồng chưa có bản đã duyệt thì không ghi được.
 *  - Bất biến: không ai sửa / xoá được dòng; pháp nhân và người ghi do CSDL đặt.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/outbound-shares.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  nvcId: string;
  nvoId: string;
  kdUserId: string;
  signedContractId: string;
  scanShareId: string;
  approvedContractId: string;
  bareContractId: string;
  quoteApprovedId: string;
  quoteDraftId: string;
  opportunityId: string;
  customerId: string;
}

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function seedFixture(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [kd] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;

    const [signed] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id,
                             contract_number, signed_scan_path)
      VALUES (${nvc!.id}, ${'NVC-HD-ZALO-' + stamp}, ${TEST_PREFIX + ' Gửi Zalo bản ký ' + stamp},
              'mua_ban', 'da_ky', 300000000, ${kd!.id}, ${'Z-' + stamp}, 'x/da-ky.pdf')
      RETURNING id`;
    const [scanShare] = await sql<{ id: string }[]>`
      INSERT INTO contract_scan_shares (contract_id, company_id, expires_at)
      VALUES (${signed!.id}, ${nvc!.id}, now() + interval '7 days')
      RETURNING id`;

    // Hợp đồng đã duyệt có văn bản đã duyệt: lập văn bản khi còn Nháp rồi mới đổi bước.
    const [approved] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id)
      VALUES (${nvc!.id}, ${'NVC-HD-ZALOW-' + stamp}, ${TEST_PREFIX + ' Gửi Zalo văn bản ' + stamp},
              'mua_ban', 'nhap', 300000000, ${kd!.id})
      RETURNING id`;
    await sql`
      INSERT INTO contract_documents (contract_id, company_id, storage_path, file_name, filled_values)
      VALUES (${approved!.id}, ${nvc!.id}, ${approved!.id + '/ban-1.docx'}, 'ban-1.docx', '{}'::jsonb)`;
    // Cột văn bản đã duyệt chỉ trigger ghi (0176): Nháp → Chờ duyệt → Đã duyệt.
    await sql`UPDATE contracts SET stage = 'cho_duyet' WHERE id = ${approved!.id}`;
    await sql`UPDATE contracts SET stage = 'da_duyet' WHERE id = ${approved!.id}`;

    const [bare] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id)
      VALUES (${nvc!.id}, ${'NVC-HD-ZALON-' + stamp}, ${TEST_PREFIX + ' Gửi Zalo chưa duyệt ' + stamp},
              'mua_ban', 'nhap', 300000000, ${kd!.id})
      RETURNING id`;

    const [cu] = await sql<{ id: string }[]>`
      INSERT INTO customers (code, name, phone)
      VALUES (${'KH-ZALO-' + stamp}, ${TEST_PREFIX + ' Khách Zalo ' + stamp}, '0912345678')
      RETURNING id`;
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
      VALUES (${nvc!.id}, ${'NVC-CH-ZALO-' + stamp}, ${cu!.id}, ${TEST_PREFIX + ' Cơ hội Zalo ' + stamp},
              ${kd!.id}, 'dam_phan')
      RETURNING id`;
    const [q1] = await sql<{ id: string }[]>`
      INSERT INTO quotes (company_id, code, opportunity_id, total_value)
      VALUES (${nvc!.id}, ${'NVC-BG-ZALO-' + stamp}, ${o!.id}, 1500000000)
      RETURNING id`;
    await sql`UPDATE quotes SET status = 'completed' WHERE id = ${q1!.id}`;
    const [q2] = await sql<{ id: string }[]>`
      INSERT INTO quotes (company_id, code, opportunity_id, total_value)
      VALUES (${nvc!.id}, ${'NVC-BG-ZALO2-' + stamp}, ${o!.id}, 1400000000)
      RETURNING id`;

    return {
      nvcId: nvc!.id,
      nvoId: nvo!.id,
      kdUserId: kd!.id,
      signedContractId: signed!.id,
      scanShareId: scanShare!.id,
      approvedContractId: approved!.id,
      bareContractId: bare!.id,
      quoteApprovedId: q1!.id,
      quoteDraftId: q2!.id,
      opportunityId: o!.id,
      customerId: cu!.id,
    };
  });
}

describeDb('outbound_shares — lịch sử mở Zalo gửi khách (0238)', () => {
  let fx: Fixture;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let ksnb: SupabaseClient;
  let thiCong: SupabaseClient;

  beforeAll(async () => {
    fx = await seedFixture();
    [kd, kdNvo, ksnb, thiCong] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.ksnb),
      signInAs(ACCOUNTS.congTruongNvc),
    ]);
  });

  afterAll(async () => {
    if (!fx) return;
    await withSql(async (sql) => {
      const contracts = [fx.signedContractId, fx.approvedContractId, fx.bareContractId];
      const entities = [...contracts, fx.quoteApprovedId, fx.quoteDraftId];
      await sql`DELETE FROM outbound_shares WHERE entity_id = ANY(${entities}::uuid[])`;
      await sql`DELETE FROM contract_scan_shares WHERE contract_id = ANY(${contracts}::uuid[])`;
      await sql`DELETE FROM contracts WHERE id = ANY(${contracts}::uuid[])`;
      await sql`DELETE FROM quotes WHERE opportunity_id = ${fx.opportunityId}`;
      await sql`DELETE FROM opportunities WHERE id = ${fx.opportunityId}`;
      await sql`DELETE FROM customers WHERE id = ${fx.customerId}`;
    });
  });

  it('bản đã ký: người chịu trách nhiệm ghi được; CSDL đặt pháp nhân, người ghi; Thi công không thấy', async () => {
    const row = {
      entity_type: 'contract_signed_scan',
      entity_id: fx.signedContractId,
      channel: 'zalo',
      via: 'zalo_web',
      recipient: '84912345678',
      share_link_id: fx.scanShareId,
      // Trình duyệt khai bừa — CSDL phải đè.
      company_id: fx.nvoId,
    };
    const { data, error } = await kd
      .from('outbound_shares')
      .insert(row)
      .select('id, company_id, created_by')
      .single();
    expect(error).toBeNull();
    expect(data!.company_id).toBe(fx.nvcId);
    expect(data!.created_by).toBe(fx.kdUserId);

    // Kiểm soát nội bộ đọc được, không ghi được.
    const seen = await ksnb.from('outbound_shares').select('id').eq('id', data!.id);
    expect(seen.data?.length).toBe(1);
    expect((await ksnb.from('outbound_shares').insert(row)).error).not.toBeNull();

    // Thi công không xem Module Hợp đồng: không đọc, không ghi.
    const hidden = await thiCong.from('outbound_shares').select('id').eq('id', data!.id);
    expect(hidden.data ?? []).toHaveLength(0);
    expect((await thiCong.from('outbound_shares').insert(row)).error).not.toBeNull();
  });

  it('link có hạn phải thuộc đúng hợp đồng', async () => {
    const other = await withSql(
      (sql) => sql<{ id: string }[]>`
        INSERT INTO contract_scan_shares (contract_id, company_id, expires_at)
        SELECT id, company_id, now() + interval '7 days' FROM contracts
         WHERE id <> ${fx.signedContractId} AND stage = 'da_ky' AND signed_scan_path IS NOT NULL
           AND deleted_at IS NULL
         LIMIT 1
        RETURNING id`,
    );
    if (!other[0]) return;
    try {
      const res = await kd.from('outbound_shares').insert({
        entity_type: 'contract_signed_scan',
        entity_id: fx.signedContractId,
        share_link_id: other[0].id,
      });
      expect(res.error).not.toBeNull();
    } finally {
      await withSql((sql) => sql`DELETE FROM contract_scan_shares WHERE id = ${other[0]!.id}`);
    }
  });

  it('văn bản hợp đồng: ghi được khi đã có bản đã duyệt; hợp đồng Nháp thì không', async () => {
    const ok = await kd
      .from('outbound_shares')
      .insert({
        entity_type: 'contracts',
        entity_id: fx.approvedContractId,
        file_name: 'ban-1.docx',
        via: 'bang_chia_se',
      })
      .select('id')
      .single();
    expect(ok.error).toBeNull();
    const denied = await kd
      .from('outbound_shares')
      .insert({ entity_type: 'contracts', entity_id: fx.bareContractId });
    expect(denied.error).not.toBeNull();
  });

  it('báo giá: chỉ bản đã duyệt, chỉ người chịu trách nhiệm cơ hội; pháp nhân khác không thấy', async () => {
    const ok = await kd
      .from('outbound_shares')
      .insert({ entity_type: 'quotes', entity_id: fx.quoteApprovedId, recipient: '0912345678' })
      .select('id')
      .single();
    expect(ok.error).toBeNull();
    expect(
      (
        await kd
          .from('outbound_shares')
          .insert({ entity_type: 'quotes', entity_id: fx.quoteDraftId })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await kdNvo
          .from('outbound_shares')
          .insert({ entity_type: 'quotes', entity_id: fx.quoteApprovedId })
      ).error,
    ).not.toBeNull();
    const hidden = await kdNvo.from('outbound_shares').select('id').eq('id', ok.data!.id);
    expect(hidden.data ?? []).toHaveLength(0);
  });

  it('không sửa, không xoá được dòng đã ghi', async () => {
    const { data } = await kd
      .from('outbound_shares')
      .select('id, recipient')
      .eq('entity_id', fx.quoteApprovedId)
      .limit(1)
      .single();
    expect(data).not.toBeNull();
    const upd = await kd
      .from('outbound_shares')
      .update({ recipient: '0900000000' })
      .eq('id', data!.id)
      .select('id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await kd.from('outbound_shares').delete().eq('id', data!.id).select('id');
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const [still] = await withSql(
      (sql) =>
        sql<{ recipient: string }[]>`SELECT recipient FROM outbound_shares WHERE id = ${data!.id}`,
    );
    expect(still!.recipient).toBe('0912345678');
  });
});
