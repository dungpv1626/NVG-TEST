/**
 * Đợt 3 — 3B: đề nghị thu tiền tự điền từ biên bản nghiệm thu đã ký (migration 0196).
 *
 * Bất biến canh ở đây:
 *   · chỉ Kế toán của pháp nhân lập được; Kinh doanh / KSNB không lập, Kinh doanh không đọc;
 *   · một bấm ra đúng số: theo đợt thu gắn biên bản (tỷ lệ × giá trị hợp đồng), không có thì theo
 *     giá trị biên bản; bấm lại không lập trùng; biên bản chưa ký thì không lập;
 *   · trạng thái chỉ đổi qua hàm; đã gửi khách thì không sửa nội dung;
 *   · «Ghi công nợ» mới sinh khoản phải thu, đánh dấu biên bản đã ghi nhận, chỉ một lần.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dot3-collection-request.test.ts`
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

interface Fixture {
  linkedAcceptance: string;
  plainAcceptance: string;
  unsignedAcceptance: string;
}

async function seed(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [kd] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
    const [contract] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, contract_number, title, type, stage, value, responsible_user_id, signed_date)
      VALUES (${nvo!.id}, ${'NVO-HD-DNT-' + stamp}, ${'99/' + stamp + '/HĐTC'},
              ${TEST_PREFIX + ' Đề nghị thu ' + stamp}, 'thi_cong', 'da_ky', 1000000000, ${kd!.id}, current_date)
      RETURNING id`;
    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, contract_id, planned_start_date, planned_end_date)
      VALUES (${nvo!.id}, ${'NVO-CT-DNT-' + stamp}, ${TEST_PREFIX + ' Đề nghị thu ' + stamp},
              'dang_thi_cong', ${contract!.id}, current_date, current_date + 90)
      RETURNING id`;
    const accs = await sql<{ id: string }[]>`
      INSERT INTO acceptance_records
        (company_id, construction_site_id, code, acceptance_type, status, stage_name, value, accepted_date, accepted_at, signed_at)
      VALUES
        (${nvo!.id}, ${site!.id}, ${'NVO-NT-DNT-A-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Phần móng', 350000000, current_date, now(), now()),
        (${nvo!.id}, ${site!.id}, ${'NVO-NT-DNT-B-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Phần thô', 200000000, current_date, now(), now()),
        (${nvo!.id}, ${site!.id}, ${'NVO-NT-DNT-C-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Hoàn thiện', 100000000, current_date, now(), NULL)
      RETURNING id`;
    await sql`
      INSERT INTO contract_terms (company_id, contract_id, term_type, description, percent_value, acceptance_record_id, position)
      VALUES (${nvo!.id}, ${contract!.id}, 'tien_do_thanh_toan', ${TEST_PREFIX + ' Hoàn thành móng'}, '30', ${accs[0]!.id}, '1')`;
    return {
      linkedAcceptance: accs[0]!.id,
      plainAcceptance: accs[1]!.id,
      unsignedAcceptance: accs[2]!.id,
    };
  });
}

describeDb('3B — đề nghị thu tiền từ biên bản đã ký (0196)', () => {
  let fx: Fixture;
  let ketoan: SupabaseClient;
  let kdNvo: SupabaseClient;
  let ksnb: SupabaseClient;
  let requestId: string;

  beforeAll(async () => {
    fx = await seed();
    [ketoan, kdNvo, ksnb] = await Promise.all([
      signInAs(ACCOUNTS.ketoan),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.ksnb),
    ]);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM collection_requests WHERE contract_id IN (
        SELECT id FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Đề nghị thu%'})`;
      await sql`DELETE FROM receivables_payables WHERE contract_id IN (
        SELECT id FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Đề nghị thu%'})`;
      await sql`DELETE FROM construction_sites WHERE name LIKE ${TEST_PREFIX + ' Đề nghị thu%'}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Đề nghị thu%'}`;
    });
  });

  it('Kinh doanh và KSNB không lập được', async () => {
    for (const c of [kdNvo, ksnb]) {
      const r = await c.rpc('create_collection_request', { p_acceptance_id: fx.linkedAcceptance });
      expect(r.error).not.toBeNull();
    }
  });

  it('một bấm ra đúng số theo đợt thu gắn biên bản; bấm lại không lập trùng', async () => {
    const first = await ketoan.rpc('create_collection_request', {
      p_acceptance_id: fx.linkedAcceptance,
    });
    expect(first.error).toBeNull();
    requestId = first.data as string;
    const { data } = await ketoan
      .from('collection_requests')
      .select('amount, basis, status, code')
      .eq('id', requestId)
      .single();
    const row = data as { amount: number; basis: string; status: string; code: string };
    expect(Number(row.amount)).toBe(300_000_000);
    expect(row.basis).toContain('Hợp đồng số 99/');
    expect(row.basis).toContain('Biên bản nghiệm thu NVO-NT-DNT-A-');
    expect(row.status).toBe('nhap');
    expect(row.code).toMatch(/^NVO-DNTH-/);

    const again = await ketoan.rpc('create_collection_request', {
      p_acceptance_id: fx.linkedAcceptance,
    });
    expect(again.data).toBe(requestId);
  });

  it('biên bản không gắn đợt thì theo giá trị biên bản; biên bản chưa ký thì không lập', async () => {
    const plain = await ketoan.rpc('create_collection_request', {
      p_acceptance_id: fx.plainAcceptance,
    });
    expect(plain.error).toBeNull();
    const { data } = await ketoan
      .from('collection_requests')
      .select('amount')
      .eq('id', plain.data as string)
      .single();
    expect(Number((data as { amount: number }).amount)).toBe(200_000_000);

    const unsigned = await ketoan.rpc('create_collection_request', {
      p_acceptance_id: fx.unsignedAcceptance,
    });
    expect(unsigned.error!.message).toContain('đã ký hai bên');
  });

  it('Kinh doanh không đọc; Kế toán sửa được nháp nhưng không tự đổi trạng thái', async () => {
    const { data: seen } = await kdNvo.from('collection_requests').select('id').eq('id', requestId);
    expect(seen).toEqual([]);

    const status = await ketoan
      .from('collection_requests')
      .update({ status: 'da_ghi_cong_no' })
      .eq('id', requestId)
      .select('id');
    expect(status.error).not.toBeNull();

    const edit = await ketoan
      .from('collection_requests')
      .update({ amount: 290_000_000, content: 'Đề nghị chuyển khoản trước ngày 30.' })
      .eq('id', requestId)
      .select('id')
      .single();
    expect(edit.error).toBeNull();
  });

  it('đã gửi khách thì không sửa nội dung; ghi công nợ một lần, biên bản được đánh dấu', async () => {
    expect((await ketoan.rpc('send_collection_request', { p_id: requestId })).error).toBeNull();
    const late = await ketoan
      .from('collection_requests')
      .update({ amount: 1 })
      .eq('id', requestId)
      .select('id');
    expect(late.error).not.toBeNull();

    const kd = await kdNvo.rpc('record_collection_receivable', { p_id: requestId });
    expect(kd.error).not.toBeNull();

    const rec = await ketoan.rpc('record_collection_receivable', {
      p_id: requestId,
      p_invoice_number: 'HĐ-0001',
    });
    expect(rec.error).toBeNull();
    const { data: rp } = await ketoan
      .from('receivables_payables')
      .select('amount, direction, invoice_number')
      .eq('id', rec.data as string)
      .single();
    expect(Number((rp as { amount: number }).amount)).toBe(290_000_000);
    expect((rp as { direction: string }).direction).toBe('phai_thu');

    const billed = await withSql(
      (sql) => sql<{ billing_recorded_at: string | null }[]>`
        SELECT billing_recorded_at FROM acceptance_records WHERE id = ${fx.linkedAcceptance}`,
    );
    expect(billed[0]!.billing_recorded_at).not.toBeNull();

    const twice = await ketoan.rpc('record_collection_receivable', { p_id: requestId });
    expect(twice.error).not.toBeNull();
  });
});
