/**
 * Dòng tiền tuần không đếm hai lần một đợt thu (migration 0227).
 *
 * Trước 0227: Kế toán tự lập công nợ phải thu cho một đợt của hợp đồng → dòng tiền tính cả đợt (`thu_dot`) lẫn công nợ
 * (`thu_cong_no`). Canh: công nợ gắn đợt thì đợt rời dòng tiền; công nợ gắn hợp đồng mà chưa chọn đợt thì được liệt kê
 * «có thể trùng», không bị tự gắn; đợt phải đúng hợp đồng và chỉ cho công nợ phải thu; «Ghi công nợ» từ đề nghị thu tự
 * gắn đợt.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dong-tien-khong-dem-trung.test.ts`
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

interface Row {
  kind: string;
  label: string;
  ref_id: string;
}

describeDb('Dòng tiền không đếm trùng đợt thu (0227)', () => {
  let nvsId = '';
  let contractId = '';
  let otherContractId = '';
  let termLinked = '';
  let termOther = '';
  let termCollection = '';
  let unlinkedId = '';
  let linkedId = '';
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvs] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`;
      nvsId = nvs!.id;
      const contracts = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date)
        VALUES
          (${nvsId}, ${'NVS-HD-KDT-A-' + stamp}, ${TEST_PREFIX + ' Không đếm trùng A'}, 'mua_ban', 'da_ky', 900000000, current_date),
          (${nvsId}, ${'NVS-HD-KDT-B-' + stamp}, ${TEST_PREFIX + ' Không đếm trùng B'}, 'mua_ban', 'da_ky', 100000000, current_date)
        RETURNING id`;
      contractId = contracts[0]!.id;
      otherContractId = contracts[1]!.id;
      const terms = await sql<{ id: string }[]>`
        INSERT INTO contract_terms (company_id, contract_id, term_type, description, amount, due_date, position)
        VALUES
          (${nvsId}, ${contractId}, 'tien_do_thanh_toan', 'Đợt 1 — Kế toán tự lập công nợ', 300000000, current_date + 5, '1'),
          (${nvsId}, ${contractId}, 'tien_do_thanh_toan', 'Đợt 2 — chưa thu', 400000000, current_date + 12, '2'),
          (${nvsId}, ${contractId}, 'quyet_toan', 'Quyết toán — qua đề nghị thu', 200000000, current_date + 20, '3'),
          (${nvsId}, ${otherContractId}, 'tien_do_thanh_toan', 'Đợt hợp đồng khác', 100000000, current_date + 5, '1')
        RETURNING id`;
      termLinked = terms[0]!.id;
      termCollection = terms[2]!.id;
      termOther = terms[3]!.id;
    });
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM collection_requests WHERE contract_id = ${contractId}`;
      await sql`DELETE FROM receivables_payables WHERE contract_id IN (${contractId}, ${otherContractId})`;
      await sql`DELETE FROM contracts WHERE id IN (${contractId}, ${otherContractId})`;
    });
  });

  async function newReceivable(extra: Record<string, unknown>) {
    return ketoan
      .from('receivables_payables')
      .insert({
        company_id: nvsId,
        direction: 'phai_thu',
        party_type: 'khach_hang',
        party_name: TEST_PREFIX + ' khách không đếm trùng',
        description: TEST_PREFIX + ' công nợ',
        amount: 300000000,
        due_date: new Date().toISOString().slice(0, 10),
        ...extra,
      })
      .select('id')
      .single();
  }

  it('đợt phải đúng hợp đồng, chỉ cho công nợ phải thu', async () => {
    const wrong = await newReceivable({ contract_id: contractId, contract_term_id: termOther });
    expect(wrong.error?.message).toMatch(/thuộc hợp đồng khác/);
    const payable = await newReceivable({
      direction: 'phai_tra',
      party_type: 'nha_cung_cap',
      contract_id: contractId,
      contract_term_id: termLinked,
    });
    expect(payable.error?.message).toMatch(/Chỉ công nợ phải thu/);
  });

  it('công nợ gắn đợt thì đợt rời dòng tiền; công nợ chưa chọn đợt được báo «có thể trùng»', async () => {
    const linked = await newReceivable({ contract_term_id: termLinked });
    expect(linked.error).toBeNull();
    linkedId = linked.data!.id;
    const unlinked = await newReceivable({ contract_id: contractId });
    expect(unlinked.error).toBeNull();
    unlinkedId = unlinked.data!.id;

    const { data, error } = await ketoan.rpc('cash_flow_forecast_items', { p_company_id: nvsId });
    expect(error).toBeNull();
    const dots = ((data ?? []) as Row[])
      .filter((r) => r.kind === 'thu_dot' && r.ref_id === contractId)
      .map((r) => r.label);
    expect(dots.some((l) => l.includes('Đợt 1'))).toBe(false);
    expect(dots.some((l) => l.includes('Đợt 2'))).toBe(true);

    const flagged = await ketoan.rpc('cash_flow_unlinked_receivables', { p_company_id: nvsId });
    expect(flagged.error).toBeNull();
    const ids = ((flagged.data ?? []) as { receivable_id: string }[]).map((r) => r.receivable_id);
    expect(ids).toContain(unlinkedId);
    expect(ids).not.toContain(linkedId);

    // Không tự gắn: công nợ chưa chọn đợt vẫn chưa có đợt.
    const term = await withSql(
      (sql) =>
        sql<{ contract_term_id: string | null }[]>`
          SELECT contract_term_id FROM receivables_payables WHERE id = ${unlinkedId}`,
    );
    expect(term[0]!.contract_term_id).toBeNull();
  });

  it('«Ghi công nợ» từ đề nghị thu tự gắn đợt của đề nghị', async () => {
    const created = await ketoan.rpc('create_collection_request', { p_term_id: termCollection });
    expect(created.error).toBeNull();
    const requestId = created.data as string;
    expect((await ketoan.rpc('send_collection_request', { p_id: requestId })).error).toBeNull();
    expect(
      (await ketoan.rpc('record_collection_receivable', { p_id: requestId })).error,
    ).toBeNull();
    const [row] = await withSql(
      (sql) =>
        sql<{ contract_term_id: string | null }[]>`
          SELECT rp.contract_term_id FROM collection_requests cr
            JOIN receivables_payables rp ON rp.id = cr.receivable_id
           WHERE cr.id = ${requestId}`,
    );
    expect(row!.contract_term_id).toBe(termCollection);

    // Đợt 2 chưa có công nợ nào vẫn nằm trong dòng tiền.
    const { data } = await ketoan.rpc('cash_flow_forecast_items', { p_company_id: nvsId });
    const labels = ((data ?? []) as Row[]).filter((r) => r.kind === 'thu_dot').map((r) => r.label);
    expect(labels.some((l) => l.includes('Đợt 2'))).toBe(true);
    expect(labels.some((l) => l.includes('Quyết toán — qua đề nghị thu'))).toBe(false);
  });
});
