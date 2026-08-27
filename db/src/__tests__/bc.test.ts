/**
 * Module BC mức đầy đủ — BC-02: `project_profit_loss` (Mẫu D, quyền `profit`).
 *
 * Nguồn: PRD BC-02, migration `0056_bc_profit_loss.sql`.
 *
 * Hai điều phải đúng, đúng cách các test Mẫu D khác trong dự án đã kiểm (xem `sx.test.ts`,
 * bộ test của DA/TK cho `estimate_cost_breakdown`):
 *  1. Vai trò KHÔNG có quyền `profit` (chỉ TGĐ/CFO/BGĐ/ADMIN) gọi hàm phải bị từ chối.
 *  2. Vai trò CÓ quyền đọc đúng số đã cộng từ `project_budgets` + `contracts` — không lệch,
 *     và dòng `loi_nhuan` không bị cộng nhầm vào giá vốn.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  siteId: string;
  biddingProjectId: string;
  contractValue: number;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;

    const [bidding] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name)
      VALUES (${nvc!.id}, ${'BCTEST-DA-' + stamp}, ${TEST_PREFIX + ' Gói thầu báo cáo lãi lỗ ' + stamp})
      RETURNING id
    `;

    const [contract] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, value)
      VALUES (${nvc!.id}, ${'BCTEST-HD-' + stamp}, ${TEST_PREFIX + ' Hợp đồng báo cáo lãi lỗ ' + stamp},
              'thi_cong', ${1_000_000_000})
      RETURNING id
    `;

    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, contract_id, bidding_project_id)
      VALUES (${nvc!.id}, ${'BCTEST-CT-' + stamp}, ${TEST_PREFIX + ' Công trình báo cáo lãi lỗ ' + stamp},
              ${contract!.id}, ${bidding!.id})
      RETURNING id
    `;

    // Hai dòng chi phí (budgeted/actual/committed khác nhau) + một dòng lợi nhuận mục tiêu —
    // đúng hình dạng `project_budgets` sinh ra từ DA-09 (0021_da_rls.sql dòng ~934).
    await sql`
      INSERT INTO project_budgets
        (company_id, bidding_project_id, construction_site_id, cost_group, cost_code, name,
         budgeted_amount, actual_amount, committed_amount)
      VALUES
        (${nvc!.id}, ${bidding!.id}, ${site!.id}, 'vat_tu', ${'VATTU-' + stamp},
         'Vật tư', ${600_000_000}, ${200_000_000}, ${100_000_000}),
        (${nvc!.id}, ${bidding!.id}, ${site!.id}, 'chi_phi_chung', ${'CPC-' + stamp},
         'Chi phí chung', ${100_000_000}, ${50_000_000}, ${0}),
        (${nvc!.id}, ${bidding!.id}, ${site!.id}, 'loi_nhuan', ${'LOINHUAN-' + stamp},
         'Lợi nhuận mục tiêu', ${300_000_000}, ${0}, ${0})
    `;

    return { siteId: site!.id, biddingProjectId: bidding!.id, contractValue: 1_000_000_000 };
  } finally {
    await sql.end();
  }
}

async function cleanupFixture(): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    // Cùng thứ tự đã ghi trong `cleanupTestData` (helpers.ts): công trình trước, rồi hợp
    // đồng, rồi gói thầu (kéo theo project_budgets qua CASCADE).
    await sql`DELETE FROM construction_sites WHERE name LIKE ${'%' + TEST_PREFIX + '%'}`;
    await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM bidding_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
  } finally {
    await sql.end();
  }
}

describeDb('BC-02 — project_profit_loss (Mẫu D, quyền profit)', () => {
  let fixture: Fixture;
  let tgd: SupabaseClient;
  let kinhDoanh: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    [tgd, kinhDoanh] = await Promise.all([signInAs(ACCOUNTS.tgd), signInAs(ACCOUNTS.kinhDoanhNvc)]);
  });

  afterAll(async () => {
    await cleanupFixture();
  });

  it('vai trò không có quyền profit bị từ chối', async () => {
    const { error } = await kinhDoanh.rpc('project_profit_loss', { p_company_id: null });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('lãi/lỗ');
  });

  it('TGĐ đọc đúng số đã cộng từ project_budgets + contracts, tách riêng dòng lợi nhuận', async () => {
    const { data, error } = await tgd.rpc('project_profit_loss', { p_company_id: null });
    expect(error).toBeNull();

    const row = (data as Array<Record<string, unknown>>).find(
      (r) => r.construction_site_id === fixture.siteId,
    );
    expect(row).toBeTruthy();

    // Giá vốn = 600tr + 100tr, KHÔNG cộng dòng loi_nhuan (300tr) vào.
    expect(Number(row!.budgeted_cost)).toBe(700_000_000);
    expect(Number(row!.actual_cost)).toBe(250_000_000);
    expect(Number(row!.committed_cost)).toBe(100_000_000);
    expect(Number(row!.target_profit)).toBe(300_000_000);

    expect(Number(row!.contract_value)).toBe(fixture.contractValue);
    // Lãi thực tế = doanh thu − chi phí đã phát sinh = 1 tỷ − 250tr.
    expect(Number(row!.profit_actual)).toBe(750_000_000);
    // Lãi dự kiến khi hoàn thành = doanh thu − (đã phát sinh + đã cam kết + còn lại chưa cam
    // kết) = 1 tỷ − (250tr + 100tr + (700tr − 250tr − 100tr)) = 1 tỷ − 700tr.
    expect(Number(row!.profit_forecast)).toBe(300_000_000);
  });
});
