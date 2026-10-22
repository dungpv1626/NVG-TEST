/**
 * Đợt 2 — 2E: bảng công trình của Trưởng phòng Thi công (`tc_site_board`, migration 0191).
 *
 * Trưởng phòng thấy mọi công trình đang chạy của pháp nhân, chỉ huy trưởng chỉ thấy công trình
 * được giao (Mẫu E), Kinh doanh không thấy dòng nào. «Chậm» chỉ tính từ ngày đã khai; nhật ký
 * «hôm nay» theo giờ Việt Nam.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-site-board.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface BoardRow {
  site_id: string;
  stage: string;
  site_overdue: boolean;
  milestones_total: number;
  milestones_passed: number;
  current_milestone_label: string | null;
  current_milestone_overdue: boolean;
  last_log_date: string | null;
  logged_today: boolean;
  open_requests: number;
}

interface Fixture {
  siteA: string;
  siteB: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date)
      VALUES
        (${nvo!.id}, ${'NVO-CT-BANG-A-' + stamp}, ${TEST_PREFIX + ' Bảng A ' + stamp}, 'dang_thi_cong', current_date + 90),
        (${nvo!.id}, ${'NVO-CT-BANG-B-' + stamp}, ${TEST_PREFIX + ' Bảng B ' + stamp}, 'dang_thi_cong', current_date - 1)
      RETURNING id`;
    const [a, b] = [sites[0]!.id, sites[1]!.id];
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${a}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvo}`;
    await sql`
      INSERT INTO site_logs (company_id, construction_site_id, log_date, content)
      VALUES (${nvo!.id}, ${a}, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
              ${TEST_PREFIX + ' Nhật ký hôm nay'})`;
    // Mốc đầu của B quá hạn.
    await sql`
      UPDATE site_milestones SET planned_end_date = current_date - 3
       WHERE construction_site_id = ${b} AND position = (
         SELECT min(position) FROM site_milestones WHERE construction_site_id = ${b})`;
    return { siteA: a, siteB: b };
  } finally {
    await sql.end();
  }
}

async function board(client: SupabaseClient): Promise<BoardRow[]> {
  const { data, error } = await client.rpc('tc_site_board');
  if (error) throw new Error(error.message);
  return (data ?? []) as BoardRow[];
}

describeDb('2E — bảng công trình Trưởng phòng Thi công (0191)', () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await seedFixture();
  });

  it('Trưởng phòng thấy cả hai công trình: mốc hiện tại, nhật ký hôm nay, chậm theo ngày đã khai', async () => {
    const rows = await board(await signInAs(ACCOUNTS.congTruongNvo));
    const a = rows.find((r) => r.site_id === fixture.siteA)!;
    const b = rows.find((r) => r.site_id === fixture.siteB)!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    expect(a.logged_today).toBe(true);
    expect(a.last_log_date).not.toBeNull();
    expect(a.site_overdue).toBe(false);
    expect(b.logged_today).toBe(false);
    expect(b.last_log_date).toBeNull();
    expect(b.site_overdue).toBe(true);

    // Công trình NVO mới tự có bộ mốc (0182); chưa đạt mốc nào → mốc hiện tại là mốc đầu.
    expect(a.milestones_total).toBeGreaterThan(0);
    expect(a.milestones_passed).toBe(0);
    expect(a.current_milestone_label).toBeTruthy();
    expect(a.current_milestone_overdue).toBe(false);
    expect(b.current_milestone_overdue).toBe(true);
  });

  it('chỉ huy trưởng chỉ thấy công trình được giao', async () => {
    const ids = (await board(await signInAs(ACCOUNTS.chiHuyTruongNvo))).map((r) => r.site_id);
    expect(ids).toContain(fixture.siteA);
    expect(ids).not.toContain(fixture.siteB);
  });

  it('Kinh doanh không thấy dòng nào của hai công trình', async () => {
    const ids = (await board(await signInAs(ACCOUNTS.kinhDoanhNvo))).map((r) => r.site_id);
    expect(ids).not.toContain(fixture.siteA);
    expect(ids).not.toContain(fixture.siteB);
  });
});
