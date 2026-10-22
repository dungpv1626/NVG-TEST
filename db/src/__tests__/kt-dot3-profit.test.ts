/**
 * Đợt 3 — 3D: lãi / lỗ từng công trình, số quản trị (migration 0198).
 *
 * Bất biến canh ở đây:
 *   · Mẫu D: chỉ Ban Giám đốc / Tài chính / KSNB xem; Kế toán, Thi công, Kinh doanh bị từ chối;
 *     mỗi lượt xem ghi `sensitive_access_logs`;
 *   · doanh thu hợp đồng = giá trị ký + phát sinh ĐÃ DUYỆT (đề xuất chưa duyệt không tính);
 *   · lãi đến nay = đã nghiệm thu − chi phí thực tế; dự kiến tính cả cam kết và ngân sách còn lại;
 *   · chi tiết truy ngược được chứng từ chi đã phân bổ cho công trình.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dot3-profit.test.ts`
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

interface ListRow {
  construction_site_id: string;
  contract_value: number;
  amendments_value: number;
  revenue_contract: number;
  accepted_revenue: number;
  actual_cost: number;
  profit_to_date: number;
  profit_forecast: number;
}

describeDb('3D — lãi / lỗ từng công trình (0198)', () => {
  let siteId: string;
  let nvcId: string;
  let paymentId: string;
  let tgd: SupabaseClient;

  beforeAll(async () => {
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      nvcId = nvc!.id;
      const [contract] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date)
        VALUES (${nvcId}, ${'NVC-HD-LL-' + stamp}, ${TEST_PREFIX + ' Lãi lỗ ' + stamp}, 'thi_cong', 'da_ky', 1000000000, current_date)
        RETURNING id`;
      await sql`
        INSERT INTO contract_amendments (company_id, contract_id, title, content, reason, stage, value_change)
        VALUES
          (${nvcId}, ${contract!.id}, 'Thêm mái che', 'Thêm mái che', 'Khách yêu cầu', 'da_duyet', 200000000),
          (${nvcId}, ${contract!.id}, 'Đề xuất chưa duyệt', 'x', 'x', 'de_xuat', 999000000)`;
      const [site] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, contract_id, planned_start_date, planned_end_date)
        VALUES (${nvcId}, ${'NVC-CT-LL-' + stamp}, ${TEST_PREFIX + ' Lãi lỗ ' + stamp}, 'dang_thi_cong',
                ${contract!.id}, current_date, current_date + 90)
        RETURNING id`;
      siteId = site!.id;
      await sql`
        INSERT INTO acceptance_records (company_id, construction_site_id, code, acceptance_type, status, stage_name, value, accepted_date, accepted_at, signed_at)
        VALUES (${nvcId}, ${siteId}, ${'NVC-NT-LL-' + stamp}, 'khach_hang', 'da_nghiem_thu', 'Phần móng', 300000000, current_date, now(), now())`;
      const [bp] = await sql<{ id: string }[]>`
        INSERT INTO bidding_projects (company_id, code, name)
        VALUES (${nvcId}, ${'NVC-DA-LL-' + stamp}, ${TEST_PREFIX + ' Lãi lỗ ' + stamp})
        RETURNING id`;
      await sql`
        INSERT INTO project_budgets (company_id, bidding_project_id, construction_site_id, cost_group, cost_code, name,
                                     budgeted_amount, actual_amount, committed_amount)
        VALUES
          (${nvcId}, ${bp!.id}, ${siteId}, 'vat_tu', 'VT', 'Vật tư', 600000000, 250000000, 100000000),
          (${nvcId}, ${bp!.id}, ${siteId}, 'loi_nhuan', 'LN', 'Lợi nhuận', 100000000, 0, 0)`;
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO payment_requests (company_id, code, title, stage, amount, paid_date, paid_amount)
        VALUES (${nvcId}, ${'NVC-DNTT-LL-' + stamp}, ${TEST_PREFIX + ' Mua thép'}, 'da_chi', 250000000, current_date, 250000000)
        RETURNING id`;
      paymentId = pr!.id;
      await sql`
        INSERT INTO payment_request_allocations (payment_request_id, construction_site_id, cost_group, amount)
        VALUES (${paymentId}, ${siteId}, 'vat_tu', 250000000)`;
    });
    tgd = await signInAs(ACCOUNTS.tgd);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM payment_requests WHERE id = ${paymentId}`;
      await sql`DELETE FROM construction_sites WHERE id = ${siteId}`;
      await sql`DELETE FROM bidding_projects WHERE name LIKE ${TEST_PREFIX + ' Lãi lỗ%'}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Lãi lỗ%'}`;
    });
  });

  it('Kế toán, Thi công, Kinh doanh bị từ chối', async () => {
    for (const email of [ACCOUNTS.ketoan, ACCOUNTS.congTruongNvc, ACCOUNTS.kinhDoanhNvc]) {
      const c = await signInAs(email);
      const list = await c.rpc('site_profit_loss_list', {});
      expect(list.error?.message).toContain('không được xem lãi');
      const detail = await c.rpc('site_profit_loss_detail', { p_site_id: siteId });
      expect(detail.error).not.toBeNull();
    }
  });

  it('doanh thu gồm phát sinh đã duyệt; lãi đến nay theo nghiệm thu; dự kiến gồm cam kết + ngân sách còn lại', async () => {
    const { data, error } = await tgd.rpc('site_profit_loss_list', { p_company_id: nvcId });
    expect(error).toBeNull();
    const row = ((data ?? []) as ListRow[]).find((r) => r.construction_site_id === siteId)!;
    expect(Number(row.amendments_value)).toBe(200_000_000);
    expect(Number(row.revenue_contract)).toBe(1_200_000_000);
    expect(Number(row.accepted_revenue)).toBe(300_000_000);
    expect(Number(row.profit_to_date)).toBe(50_000_000);
    // 1,2 tỷ − (250 + 100 + (600 − 250 − 100)) triệu = 600 triệu
    expect(Number(row.profit_forecast)).toBe(600_000_000);
  });

  it('công trình chưa có ngân sách / chi phí: lãi / lỗ để trống, không hiện số đẹp giả', async () => {
    const bare = await withSql(async (sql) => {
      const [s] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, contract_id, planned_start_date, planned_end_date)
        SELECT company_id, code || '-B', name || ' trống', stage, contract_id, planned_start_date, planned_end_date
          FROM construction_sites WHERE id = ${siteId}
        RETURNING id`;
      return s!.id;
    });
    const { data } = await tgd.rpc('site_profit_loss_list', { p_company_id: nvcId });
    const row = ((data ?? []) as ListRow[]).find((r) => r.construction_site_id === bare)!;
    expect(row.profit_to_date).toBeNull();
    expect(row.profit_forecast).toBeNull();
    await withSql((sql) => sql`DELETE FROM construction_sites WHERE id = ${bare}`);
  });

  it('chi tiết truy được chứng từ chi; mỗi lượt xem ghi nhật ký', async () => {
    const before = await withSql(
      (sql) => sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sensitive_access_logs WHERE entity_id = ${siteId}`,
    );
    const { data, error } = await tgd.rpc('site_profit_loss_detail', { p_site_id: siteId });
    expect(error).toBeNull();
    const detail = data as {
      cost_documents: { payment_request_id: string; amount: number }[];
      amendments: { title: string }[];
    };
    expect(detail.cost_documents.map((d) => d.payment_request_id)).toContain(paymentId);
    expect(detail.amendments.map((a) => a.title)).toEqual(['Thêm mái che']);
    const after = await withSql(
      (sql) => sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM sensitive_access_logs WHERE entity_id = ${siteId}`,
    );
    expect(after[0]!.n).toBe(before[0]!.n + 1);
  });

  it('KSNB xem được (chỉ xem)', async () => {
    const ksnb = await signInAs(ACCOUNTS.ksnb);
    const { error } = await ksnb.rpc('site_profit_loss_detail', { p_site_id: siteId });
    expect(error).toBeNull();
  });
});
