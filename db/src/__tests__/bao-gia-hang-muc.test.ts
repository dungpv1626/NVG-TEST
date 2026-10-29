/**
 * Báo giá có bảng hạng mục, mẫu lời nhắn, lịch sử gửi email (migration 0239).
 *
 * Hàng rào phải đứng:
 *  - `total_value` do CSDL tính từ hạng mục (khớp `computeQuoteTotals`); trình duyệt gõ số khác bị đè.
 *  - Báo giá cũ không hạng mục giữ tổng đã lưu.
 *  - Hạng mục khoá khi báo giá rời Nháp — kể cả với người chịu trách nhiệm cơ hội.
 *  - Quyền hạng mục đi theo báo giá mẹ: pháp nhân khác không đọc, không ghi.
 *  - Phê duyệt giá đặc biệt (CRM-05) vẫn mở khi có giảm giá.
 *  - Mẫu lời nhắn: ai trong pháp nhân cũng đọc, chỉ Ban Giám đốc / Quản trị sửa.
 *  - Dòng «đã gửi email» không ghi được từ trình duyệt.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/bao-gia-hang-muc.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeQuoteTotals } from '@nvg/shared';
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

interface Fixture {
  nvcId: string;
  customerId: string;
  opportunityId: string;
  oldQuoteId: string;
}

const ITEMS = [
  { description: 'Đào móng', unit: 'm3', quantity: '100', unit_price: 600000 },
  { description: 'Bê tông móng', unit: 'm3', quantity: '12.5', unit_price: 3200000 },
  { description: 'Cốp pha', unit: 'm2', quantity: '0.3333', unit_price: 100 },
];

describeDb('báo giá có hạng mục (0239)', () => {
  let fx: Fixture;
  let kd: SupabaseClient;
  let kdNvo: SupabaseClient;
  let tgd: SupabaseClient;
  let quoteId: string;

  beforeAll(async () => {
    fx = await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [kdUser] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name, phone)
        VALUES (${'KH-BGHM-' + stamp}, ${TEST_PREFIX + ' Khách báo giá ' + stamp}, '0912345678')
        RETURNING id`;
      const [o] = await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
        VALUES (${nvc!.id}, ${'NVC-CH-BGHM-' + stamp}, ${cu!.id},
                ${TEST_PREFIX + ' Cơ hội báo giá ' + stamp}, ${kdUser!.id}, 'bao_gia')
        RETURNING id`;
      const [old] = await sql<{ id: string }[]>`
        INSERT INTO quotes (company_id, code, opportunity_id, total_value)
        VALUES (${nvc!.id}, ${'NVC-BG-BGHM-' + stamp}, ${o!.id}, 777000000)
        RETURNING id`;
      return { nvcId: nvc!.id, customerId: cu!.id, opportunityId: o!.id, oldQuoteId: old!.id };
    });
    [kd, kdNvo, tgd] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.tgd),
    ]);
  });

  afterAll(async () => {
    if (!fx) return;
    await withSql(async (sql) => {
      const ids = sql`SELECT id FROM quotes WHERE opportunity_id = ${fx.opportunityId}`;
      await sql`DELETE FROM approvals WHERE entity_type = 'quotes' AND entity_id IN (${ids})`;
      await sql`DELETE FROM outbound_shares WHERE entity_type = 'quotes' AND entity_id IN (${ids})`;
      await sql`DELETE FROM quotes WHERE opportunity_id = ${fx.opportunityId}`;
      await sql`DELETE FROM notifications WHERE related_entity_id = ${fx.opportunityId}`;
      await sql`DELETE FROM opportunities WHERE id = ${fx.opportunityId}`;
      await sql`DELETE FROM customers WHERE id = ${fx.customerId}`;
      await sql`DELETE FROM message_templates WHERE company_id = ${fx.nvcId} AND body LIKE ${TEST_PREFIX + '%'}`;
    });
  });

  it('quote_totals của CSDL khớp computeQuoteTotals', async () => {
    const cases = [
      [100_000_000, 5_000_000, null, null],
      [100_000_000, 5_000_000, 10, false],
      [1_000_005, 0, 8, true],
      [333_333_333, 1, 5, false],
      [987_654_321, 12_345, 8, true],
    ] as const;
    await withSql(async (sql) => {
      for (const [sub, disc, rate, incl] of cases) {
        const [row] = await sql<{ vat_value: string | null; total_value: string }[]>`
          SELECT vat_value::text, total_value::text FROM quote_totals(${sub}, ${disc}, ${rate}, ${incl})`;
        const ts = computeQuoteTotals({
          subtotal: sub,
          discount: disc,
          vatRate: rate,
          vatIncluded: incl,
        });
        expect(row!.total_value).toBe(ts.total.toString());
        expect(row!.vat_value).toBe(ts.vat === null ? null : ts.vat.toString());
      }
    });
  });

  it('lập phiên bản kèm hạng mục: CSDL tính tổng; gõ tay tổng khác bị đè', async () => {
    const { data, error } = await kd.rpc('create_quote_version', {
      p_opportunity_id: fx.opportunityId,
      p_company_id: fx.nvcId,
      p_items: ITEMS,
      p_discount_amount: 5_000_000,
      p_discount_reason: 'Khách cũ',
      p_vat_rate: 10,
      p_vat_included: false,
      p_valid_until: '2026-12-31',
      p_notes: 'Phạm vi phần thô',
    });
    expect(error).toBeNull();
    quoteId = data as string;

    const expected = computeQuoteTotals({
      subtotal: 60_000_000 + 40_000_000 + 33,
      discount: 5_000_000,
      vatRate: 10,
      vatIncluded: false,
    });
    const read = async () =>
      (
        await kd
          .from('quotes')
          .select('total_value, subtotal_value, vat_amount, line_items_based')
          .eq('id', quoteId)
          .single()
      ).data!;
    const q = await read();
    expect(q.line_items_based).toBe(true);
    expect(String(q.subtotal_value)).toBe('100000033');
    expect(String(q.total_value)).toBe(expected.total.toString());
    expect(String(q.vat_amount)).toBe(expected.vat!.toString());

    // Gõ thẳng tổng khác → CSDL tính lại từ hạng mục.
    await kd.from('quotes').update({ total_value: 1 }).eq('id', quoteId);
    expect(String((await read()).total_value)).toBe(expected.total.toString());

    // Thêm hạng mục → tổng đổi theo.
    const add = await kd.from('quote_items').insert({
      quote_id: quoteId,
      company_id: fx.nvcId,
      position: 9,
      description: 'Phát sinh',
      quantity: 1,
      unit_price: 1_000_000,
    });
    expect(add.error).toBeNull();
    const after = computeQuoteTotals({
      subtotal: 101_000_033,
      discount: 5_000_000,
      vatRate: 10,
      vatIncluded: false,
    });
    expect(String((await read()).total_value)).toBe(after.total.toString());
  });

  it('báo giá cũ không hạng mục giữ tổng đã lưu', async () => {
    const [row] = await withSql(
      (sql) => sql<{ total_value: string; line_items_based: boolean }[]>`
        SELECT total_value::text, line_items_based FROM quotes WHERE id = ${fx.oldQuoteId}`,
    );
    expect(row).toEqual({ total_value: '777000000', line_items_based: false });
  });

  it('pháp nhân khác không đọc, không ghi hạng mục', async () => {
    const seen = await kdNvo.from('quote_items').select('id').eq('quote_id', quoteId);
    expect(seen.data ?? []).toHaveLength(0);
    const ins = await kdNvo.from('quote_items').insert({
      quote_id: quoteId,
      company_id: fx.nvcId,
      description: 'Lén',
      quantity: 1,
      unit_price: 1,
    });
    expect(ins.error).not.toBeNull();
  });

  it('gửi phê duyệt: có giảm giá vẫn đi luồng giá đặc biệt; hạng mục khoá sau đó', async () => {
    const req = await kd.rpc('request_quote_approval', { p_quote_id: quoteId });
    expect(req.error).toBeNull();
    const [appr] = await withSql(
      (sql) => sql<{ subject: string }[]>`
        SELECT subject::text FROM approvals WHERE entity_type = 'quotes' AND entity_id = ${quoteId}`,
    );
    expect(appr!.subject).toBe('special_discount');

    const items = (await kd.from('quote_items').select('id').eq('quote_id', quoteId)).data!;
    expect(items.length).toBe(4);

    const upd = await kd
      .from('quote_items')
      .update({ unit_price: 1 })
      .eq('id', items[0]!.id)
      .select('id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const ins = await kd.from('quote_items').insert({
      quote_id: quoteId,
      company_id: fx.nvcId,
      description: 'Sau duyệt',
      quantity: 1,
      unit_price: 1,
    });
    expect(ins.error).not.toBeNull();
    const del = await kd.from('quote_items').delete().eq('id', items[0]!.id).select('id');
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);

    // Khoá ở CSDL, không chỉ ở chính sách: kể cả lệnh trực tiếp (không qua RLS) cũng bị chặn.
    await expect(
      withSql((sql) => sql`UPDATE quote_items SET unit_price = 1 WHERE id = ${items[0]!.id}`),
    ).rejects.toThrow(/không sửa được/);
    const count = (await kd.from('quote_items').select('id').eq('quote_id', quoteId)).data!;
    expect(count.length).toBe(4);
  });

  it('mẫu lời nhắn: Kinh doanh đọc, không sửa; Tổng Giám đốc sửa được', async () => {
    const row = {
      company_id: fx.nvcId,
      channel: 'email',
      email_subject: 'Báo giá {ma_bao_gia}',
      body: TEST_PREFIX + ' {ten_khach}',
    };
    expect((await kd.from('message_templates').insert(row)).error).not.toBeNull();
    const ok = await tgd
      .from('message_templates')
      .upsert(row, { onConflict: 'company_id,subject_kind,channel' })
      .select('id')
      .single();
    expect(ok.error).toBeNull();
    const seen = await kd.from('message_templates').select('id').eq('id', ok.data!.id);
    expect(seen.data?.length).toBe(1);
    const upd = await kd
      .from('message_templates')
      .update({ body: 'Sửa lén' })
      .eq('id', ok.data!.id)
      .select('id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
  });

  it('trình duyệt không tự ghi «đã gửi email»', async () => {
    await withSql((sql) => sql`UPDATE quotes SET status = 'completed' WHERE id = ${fx.oldQuoteId}`);
    const email = await kd.from('outbound_shares').insert({
      entity_type: 'quotes',
      entity_id: fx.oldQuoteId,
      channel: 'email',
      via: 'he_thong',
      recipient: 'khach@example.com',
    });
    expect(email.error).not.toBeNull();
    const zalo = await kd
      .from('outbound_shares')
      .insert({ entity_type: 'quotes', entity_id: fx.oldQuoteId, via: 'zalo_web' });
    expect(zalo.error).toBeNull();
  });

  it('câu chữ sửa được cả sau duyệt, có lịch sử; khoá lạ (số tiền) bị từ chối; pháp nhân khác không sửa', async () => {
    await withSql((sql) => sql`UPDATE quotes SET status = 'completed' WHERE id = ${quoteId}`);
    const first = await kd
      .from('quote_texts')
      .upsert(
        {
          quote_id: quoteId,
          texts: { dieu_khoan_thanh_toan: 'Tạm ứng 30%', nguoi_ky: ' Bùi Văn Thi ' },
        },
        { onConflict: 'quote_id' },
      )
      .select('texts, company_id')
      .single();
    expect(first.error).toBeNull();
    expect(first.data!.company_id).toBe(fx.nvcId);
    expect(first.data!.texts).toEqual({
      dieu_khoan_thanh_toan: 'Tạm ứng 30%',
      nguoi_ky: 'Bùi Văn Thi',
    });

    const second = await kd
      .from('quote_texts')
      .update({ texts: { dieu_khoan_thanh_toan: 'Tạm ứng 50%', nguoi_ky: 'Bùi Văn Thi' } })
      .eq('quote_id', quoteId)
      .select('quote_id');
    expect(second.error).toBeNull();
    const history = (
      await kd
        .from('quote_text_changes')
        .select('field, old_value, new_value')
        .eq('quote_id', quoteId)
        .order('changed_at', { ascending: true })
    ).data!;
    expect(history).toEqual(
      expect.arrayContaining([
        { field: 'dieu_khoan_thanh_toan', old_value: null, new_value: 'Tạm ứng 30%' },
        { field: 'dieu_khoan_thanh_toan', old_value: 'Tạm ứng 30%', new_value: 'Tạm ứng 50%' },
      ]),
    );

    const money = await kd
      .from('quote_texts')
      .update({ texts: { tong_cong: '1 đồng' } })
      .eq('quote_id', quoteId)
      .select('quote_id');
    expect(money.error).not.toBeNull();
    const notString = await kd
      .from('quote_texts')
      .update({ texts: { gioi_thieu: { html: '<b>x</b>' } } })
      .eq('quote_id', quoteId)
      .select('quote_id');
    expect(notString.error).not.toBeNull();

    const other = await kdNvo
      .from('quote_texts')
      .update({ texts: { gioi_thieu: 'Lén' } })
      .eq('quote_id', quoteId)
      .select('quote_id');
    expect(other.error !== null || (other.data ?? []).length === 0).toBe(true);
    expect(
      (await kdNvo.from('quote_text_changes').select('id').eq('quote_id', quoteId)).data ?? [],
    ).toHaveLength(0);
  });

  it('bản sửa trong Word: chỉ báo giá đã duyệt, bắt buộc lý do, đánh số bản, bất biến', async () => {
    const me = (await kd.rpc('auth_user_id')).data as string;
    const row = (reason: string) => ({
      quote_id: quoteId,
      version: 0,
      storage_path: `${quoteId}/thu.docx`,
      file_name: 'thu.docx',
      reason,
      created_by: me,
    });
    expect((await kd.from('quote_documents').insert(row('  '))).error).not.toBeNull();
    const ok = await kd
      .from('quote_documents')
      .insert(row('Thêm bảng tiến độ'))
      .select('id, version')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data!.version).toBe(1);
    const upd = await kd
      .from('quote_documents')
      .update({ reason: 'đổi' })
      .eq('id', ok.data!.id)
      .select('id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await kd.from('quote_documents').delete().eq('id', ok.data!.id).select('id');
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    // Báo giá cũ (không còn là bản hiện hành) không nhận bản Word.
    const old = await kd
      .from('quote_documents')
      .insert({ ...row('Thử'), quote_id: fx.oldQuoteId, storage_path: `${fx.oldQuoteId}/x.docx` });
    expect(old.error).not.toBeNull();
  });
});
