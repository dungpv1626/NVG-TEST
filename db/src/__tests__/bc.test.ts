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

describeDb('BC-05 — sites_budget_status (tổng hợp toàn công trình, tránh N+1)', () => {
  let fixture: Fixture;
  let tgd: SupabaseClient;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    [tgd, kho] = await Promise.all([signInAs(ACCOUNTS.tgd), signInAs(ACCOUNTS.kho)]);
  });

  afterAll(async () => {
    await cleanupFixture();
  });

  it('vai trò không có quyền xem BC bị từ chối', async () => {
    const { error } = await kho.rpc('sites_budget_status', { p_company_id: null });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('báo cáo điều hành');
  });

  it('TGĐ đọc đúng chi phí đã cộng cho MỌI công trình trong MỘT lượt gọi, tách riêng dòng lợi nhuận', async () => {
    const { data, error } = await tgd.rpc('sites_budget_status', { p_company_id: null });
    expect(error).toBeNull();

    const row = (data as Array<Record<string, unknown>>).find(
      (r) => r.construction_site_id === fixture.siteId,
    );
    expect(row).toBeTruthy();

    // Cùng số với project_profit_loss ở khối test trên: 600tr + 100tr, KHÔNG cộng dòng
    // loi_nhuan (300tr) — hai hàm phải luôn đồng nhất vì dùng chung công thức costs CTE.
    expect(Number(row!.budgeted_cost)).toBe(700_000_000);
    expect(Number(row!.actual_cost)).toBe(250_000_000);
    expect(Number(row!.committed_cost)).toBe(100_000_000);
    expect(row).not.toHaveProperty('target_profit');
  });
});

/**
 * BC-03 — `opportunity_funnel_by_source` và `bidding_outcomes`.
 *
 * Hai hàm này gộp theo NHÓM (nguồn khách/giai đoạn, giai đoạn/nguyên nhân trượt), không phải
 * một dòng-một-hồ-sơ như BC-02/BC-05 — CSDL dev dùng chung đã có sẵn dữ liệu demo thật từ các
 * module khác, nên KHÔNG thể assert tổng số toàn cục (sẽ lẫn với dữ liệu có sẵn). Dùng một
 * NGUỒN KHÁCH và một NGUYÊN NHÂN TRƯỢT THẦU duy nhất, gắn `TEST_PREFIX`, để tìm đúng dòng của
 * riêng fixture này bằng khoá không đụng hàng — thay vì so tổng.
 */
interface SalesFixture {
  testSource: string;
  testLostReason: string;
}

async function seedSalesFixture(): Promise<SalesFixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  const testSource = `${TEST_PREFIX} Facebook ${stamp}`;
  const testLostReason = `${TEST_PREFIX} Giá cao hơn đối thủ ${stamp}`;
  try {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;

    const [customer] = await sql<{ id: string }[]>`
      INSERT INTO customers (code, name, source)
      VALUES (${'BCTEST-KH-' + stamp}, ${TEST_PREFIX + ' Khách hàng hiệu quả kinh doanh ' + stamp}, ${testSource})
      RETURNING id
    `;

    await sql`
      INSERT INTO opportunities (company_id, customer_id, code, name, stage, estimated_value, lost_reason)
      VALUES
        (${nvc!.id}, ${customer!.id}, ${'BCTEST-CH-WON-' + stamp},
         ${TEST_PREFIX + ' Cơ hội thắng ' + stamp}, 'ky_hop_dong', ${500_000_000}, NULL),
        (${nvc!.id}, ${customer!.id}, ${'BCTEST-CH-LOST-' + stamp},
         ${TEST_PREFIX + ' Cơ hội mất ' + stamp}, 'mat_co_hoi', ${100_000_000}, 'Khách chọn nhà thầu khác')
    `;

    await sql`
      INSERT INTO bidding_projects (company_id, code, name, stage, lost_reason)
      VALUES
        (${nvc!.id}, ${'BCTEST-GT-LOST-' + stamp}, ${TEST_PREFIX + ' Gói thầu trượt ' + stamp},
         'truot_thau', ${testLostReason})
    `;

    return { testSource, testLostReason };
  } finally {
    await sql.end();
  }
}

async function cleanupSalesFixture(): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`DELETE FROM opportunities WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM bidding_projects WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}`;
  } finally {
    await sql.end();
  }
}

describeDb('BC-03 — opportunity_funnel_by_source / bidding_outcomes', () => {
  let fixture: SalesFixture;
  let tgd: SupabaseClient;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedSalesFixture();
    [tgd, kho] = await Promise.all([signInAs(ACCOUNTS.tgd), signInAs(ACCOUNTS.kho)]);
  });

  afterAll(async () => {
    await cleanupSalesFixture();
  });

  it('vai trò không có quyền xem BC bị từ chối ở cả hai hàm', async () => {
    const [funnel, outcomes] = await Promise.all([
      kho.rpc('opportunity_funnel_by_source', { p_company_id: null }),
      kho.rpc('bidding_outcomes', { p_company_id: null }),
    ]);
    expect(funnel.error!.message).toContain('báo cáo điều hành');
    expect(outcomes.error!.message).toContain('báo cáo điều hành');
  });

  it('opportunity_funnel_by_source gộp đúng theo (nguồn khách, giai đoạn), tách riêng thắng/mất', async () => {
    const { data, error } = await tgd.rpc('opportunity_funnel_by_source', { p_company_id: null });
    expect(error).toBeNull();

    const rows = data as Array<Record<string, unknown>>;
    const won = rows.find((r) => r.source === fixture.testSource && r.stage === 'ky_hop_dong');
    const lost = rows.find((r) => r.source === fixture.testSource && r.stage === 'mat_co_hoi');

    expect(won).toBeTruthy();
    expect(Number(won!.opportunity_count)).toBe(1);
    expect(Number(won!.estimated_value)).toBe(500_000_000);

    expect(lost).toBeTruthy();
    expect(Number(lost!.opportunity_count)).toBe(1);
    expect(Number(lost!.estimated_value)).toBe(100_000_000);
  });

  it('bidding_outcomes gộp đúng nguyên nhân trượt thầu, KHÔNG lẫn gói thầu chưa có kết quả', async () => {
    const { data, error } = await tgd.rpc('bidding_outcomes', { p_company_id: null });
    expect(error).toBeNull();

    const rows = data as Array<Record<string, unknown>>;
    const lostRow = rows.find(
      (r) => r.stage === 'truot_thau' && r.lost_reason === fixture.testLostReason,
    );
    expect(lostRow).toBeTruthy();
    expect(Number(lostRow!.bidding_count)).toBe(1);

    // Hàm chỉ lấy hai giai đoạn KẾT THÚC — không có dòng nào ở giai đoạn dở dang.
    expect(rows.every((r) => r.stage === 'trung_thau' || r.stage === 'truot_thau')).toBe(true);
  });
});
