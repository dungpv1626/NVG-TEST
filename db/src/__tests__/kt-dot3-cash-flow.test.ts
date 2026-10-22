/**
 * Đợt 3 — 3C: dòng tiền 4–8 tuần (migration 0197).
 *
 * Bất biến canh ở đây:
 *   · chỉ nhóm xem tài chính (Ban Giám đốc, Tài chính, Kế toán, KSNB) đọc được; Thi công, Kinh
 *     doanh bị TỪ CHỐI rõ ràng (không nhận bảng rỗng đọc như «không có tiền»);
 *   · số dư đầu kỳ chỉ từ số Tài chính nhập; đợt thu chưa thành công nợ và đề nghị chi đã duyệt
 *     chưa chi có mặt với đúng số;
 *   · đợt thu đã thành công nợ qua đề nghị thu không bị đếm hai lần.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dot3-cash-flow.test.ts`
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
  company_id: string;
  item_date: string | null;
  label: string;
  amount: number;
  ref_id: string;
}

describeDb('3C — dòng tiền theo tuần (0197)', () => {
  let nvsId: string;
  let contractId: string;
  let billedContractId: string;
  let paymentId: string;
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvs] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`;
      nvsId = nvs!.id;
      await sql`
        INSERT INTO cash_flow_plans (company_id, period_type, period_start, period_end, opening_balance, notes)
        VALUES (${nvsId}, 'tuan', current_date - 1, current_date + 5, 123000000, ${TEST_PREFIX + ' số dư'})`;
      const contracts = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date)
        VALUES
          (${nvsId}, ${'NVS-HD-DT-A-' + stamp}, ${TEST_PREFIX + ' Dòng tiền A'}, 'mua_ban', 'da_ky', 800000000, current_date),
          (${nvsId}, ${'NVS-HD-DT-B-' + stamp}, ${TEST_PREFIX + ' Dòng tiền B'}, 'mua_ban', 'da_ky', 100000000, current_date)
        RETURNING id`;
      contractId = contracts[0]!.id;
      billedContractId = contracts[1]!.id;
      const terms = await sql<{ id: string }[]>`
        INSERT INTO contract_terms (company_id, contract_id, term_type, description, amount, due_date, position)
        VALUES
          (${nvsId}, ${contractId}, 'tien_do_thanh_toan', 'Đợt giao hàng 1', 250000000, current_date + 10, '1'),
          (${nvsId}, ${billedContractId}, 'tien_do_thanh_toan', 'Đợt đã ghi công nợ', 100000000, current_date + 3, '1')
        RETURNING id`;
      await sql`
        INSERT INTO collection_requests (company_id, code, contract_id, contract_term_id, title, amount, basis, status)
        VALUES (${nvsId}, ${'NVS-DNTH-TEST-' + stamp}, ${billedContractId}, ${terms[1]!.id},
                ${TEST_PREFIX + ' đã ghi'}, 100000000, 'căn cứ', 'da_ghi_cong_no')`;
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO payment_requests (company_id, code, title, stage, amount, due_date)
        VALUES (${nvsId}, ${'NVS-DNTT-TEST-' + stamp}, ${TEST_PREFIX + ' Trả tiền thép'}, 'da_duyet', 400000000, current_date + 2)
        RETURNING id`;
      paymentId = pr!.id;
    });
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM payment_requests WHERE id = ${paymentId}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Dòng tiền%'}`;
      await sql`DELETE FROM cash_flow_plans WHERE notes = ${TEST_PREFIX + ' số dư'}`;
    });
  });

  it('Thi công và Kinh doanh bị từ chối', async () => {
    for (const email of [ACCOUNTS.congTruongNvc, ACCOUNTS.kinhDoanhNvc]) {
      const c = await signInAs(email);
      const { error } = await c.rpc('cash_flow_forecast_items', {});
      expect(error?.message).toContain('Không xem được dòng tiền');
    }
  });

  it('số dư đầu kỳ, đợt thu, đề nghị chi đã duyệt có mặt đúng số; đợt đã thành công nợ không đếm lại', async () => {
    const { data, error } = await ketoan.rpc('cash_flow_forecast_items', {
      p_company_id: nvsId,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Row[];
    const opening = rows.find((r) => r.kind === 'opening');
    expect(Number(opening?.amount)).toBe(123_000_000);
    const dot = rows.filter((r) => r.kind === 'thu_dot' && r.ref_id === contractId);
    expect(dot.map((r) => Number(r.amount))).toEqual([250_000_000]);
    expect(rows.some((r) => r.kind === 'thu_dot' && r.ref_id === billedContractId)).toBe(false);
    const pay = rows.find((r) => r.kind === 'chi_de_nghi' && r.ref_id === paymentId);
    expect(Number(pay?.amount)).toBe(400_000_000);
  });

  it('KSNB và CFO đọc được (chỉ xem)', async () => {
    for (const email of [ACCOUNTS.ksnb, ACCOUNTS.cfo]) {
      const c = await signInAs(email);
      const { data, error } = await c.rpc('cash_flow_forecast_items', { p_company_id: nvsId });
      expect(error).toBeNull();
      expect(((data ?? []) as Row[]).some((r) => r.ref_id === paymentId)).toBe(true);
    }
  });
});
