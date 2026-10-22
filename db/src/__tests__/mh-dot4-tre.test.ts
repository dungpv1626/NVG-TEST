/**
 * Đợt 4 — 4C: nhắc đơn đặt hàng sắp trễ / trễ hẹn (`purchase_order_due_list`,
 * `scan_purchase_order_due_reminders` — migration 0202).
 *
 * Quá hẹn / đến hạn hôm nay luôn báo; «sắp tới hạn» chỉ khi đã đặt `mh.order_due_soon_days`.
 * Chỉ huy trưởng chỉ thấy và chỉ được báo đơn về công trình mình (Mẫu E). Mỗi người mỗi đơn một
 * thông báo một ngày.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/mh-dot4-tre.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface DueRow {
  order_id: string;
  due_state: string;
  days_left: number;
}

interface Fixture {
  orderLate: string;
  orderToday: string;
  orderSoon: string;
  orderDone: string;
  chtId: string;
  mhId: string;
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
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [cht] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
    const [mh] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.muaHang}`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
      VALUES
        (${nvo!.id}, ${'NVO-CT-TRE-A-' + stamp}, ${TEST_PREFIX + ' Trễ A ' + stamp}, 'dang_thi_cong', current_date + 90, ${cht!.id}),
        (${nvo!.id}, ${'NVO-CT-TRE-B-' + stamp}, ${TEST_PREFIX + ' Trễ B ' + stamp}, 'dang_thi_cong', current_date + 90, NULL)
      RETURNING id`;
    const [supplier] = await sql<{ id: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class)
      VALUES (${'NCC-TRE-' + stamp}, ${TEST_PREFIX + ' NCC trễ ' + stamp}, 'chinh') RETURNING id`;

    async function order(siteId: string, label: string, stage: string, offset: number) {
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, construction_site_id, stage, needed_date, cost_code)
        VALUES (${nvo!.id}, ${'PR-TRE-' + label + '-' + stamp}, ${TEST_PREFIX + ' Trễ ' + label + ' ' + stamp},
                ${siteId}, 'dang_mua', current_date, 'VT-TRE')
        RETURNING id`;
      const [po] = await sql<{ id: string }[]>`
        INSERT INTO purchase_orders (company_id, code, purchase_request_id, supplier_id, stage, order_date, promised_date, total_value, created_by)
        VALUES (${nvo!.id}, ${'DH-TRE-' + label + '-' + stamp}, ${pr!.id}, ${supplier!.id},
                ${stage}::purchase_order_stage, current_date - 10,
                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + ${offset}::int, 1000000, ${mh!.id})
        RETURNING id`;
      return po!.id;
    }

    return {
      orderLate: await order(sites[0]!.id, 'A', 'da_dat', -2),
      orderToday: await order(sites[1]!.id, 'B', 'dang_giao', 0),
      orderSoon: await order(sites[0]!.id, 'C', 'da_dat', 5),
      orderDone: await order(sites[0]!.id, 'D', 'da_giao_du', -3),
      chtId: cht!.id,
      mhId: mh!.id,
    };
  });
}

async function dueList(client: SupabaseClient): Promise<DueRow[]> {
  const { data, error } = await client.rpc('purchase_order_due_list');
  if (error) throw new Error(error.message);
  return (data ?? []) as DueRow[];
}

async function notifiedOrders(userId: string, orderIds: string[]): Promise<string[]> {
  return withSql(async (sql) => {
    const rows = await sql<{ related_entity_id: string }[]>`
      SELECT related_entity_id FROM notifications
       WHERE user_id = ${userId} AND type = 'purchase_order_due'
         AND related_entity_id = ANY(${orderIds}::uuid[])`;
    return rows.map((r) => r.related_entity_id);
  });
}

async function scan(): Promise<void> {
  await withSql((sql) => sql`SELECT public.scan_purchase_order_due_reminders()`);
}

async function setSoonDays(value: number | null): Promise<void> {
  await withSql(
    (sql) => sql`
      UPDATE system_parameters SET value = ${value === null ? null : String(value)}::jsonb
       WHERE param_key = 'mh.order_due_soon_days' AND scope_type = 'global'`,
  );
}

describeDb('4C — nhắc đơn sắp trễ / trễ hẹn (0202)', () => {
  let f: Fixture;
  let ids: string[];

  beforeAll(async () => {
    await setSoonDays(null);
    f = await seedFixture();
    ids = [f.orderLate, f.orderToday, f.orderSoon, f.orderDone];
  });

  afterAll(async () => {
    await setSoonDays(null);
    await withSql(
      (sql) => sql`DELETE FROM notifications WHERE related_entity_id = ANY(${ids}::uuid[])`,
    );
  });

  it('Mua hàng thấy đơn quá hẹn và đến hạn hôm nay; đơn đã giao đủ và đơn còn xa thì không', async () => {
    const rows = (await dueList(await signInAs(ACCOUNTS.muaHang))).filter((r) =>
      ids.includes(r.order_id),
    );
    const late = rows.find((r) => r.order_id === f.orderLate)!;
    const today = rows.find((r) => r.order_id === f.orderToday)!;
    expect(late.due_state).toBe('qua_han');
    expect(late.days_left).toBe(-2);
    expect(today.due_state).toBe('hom_nay');
    expect(rows.map((r) => r.order_id)).not.toContain(f.orderSoon);
    expect(rows.map((r) => r.order_id)).not.toContain(f.orderDone);
  });

  it('chỉ huy trưởng chỉ thấy đơn về công trình được giao (Mẫu E)', async () => {
    const got = (await dueList(await signInAs(ACCOUNTS.chiHuyTruongNvo))).map((r) => r.order_id);
    expect(got).toContain(f.orderLate);
    expect(got).not.toContain(f.orderToday);
  });

  it('Kinh doanh không thấy đơn nào', async () => {
    const got = (await dueList(await signInAs(ACCOUNTS.kinhDoanhNvo))).map((r) => r.order_id);
    expect(got.filter((id) => ids.includes(id))).toHaveLength(0);
  });

  it('quét đêm báo Mua hàng mọi đơn đến hạn, chỉ huy trưởng đơn công trình mình; quét lại không báo trùng', async () => {
    await scan();
    expect((await notifiedOrders(f.mhId, ids)).sort()).toEqual([f.orderLate, f.orderToday].sort());
    expect(await notifiedOrders(f.chtId, ids)).toEqual([f.orderLate]);
    await scan();
    expect(await notifiedOrders(f.mhId, ids)).toHaveLength(2);
    expect(await notifiedOrders(f.chtId, ids)).toHaveLength(1);
  });

  it('đặt số ngày báo trước thì đơn sắp tới hạn mới vào danh sách và được báo', async () => {
    await setSoonDays(7);
    const rows = await dueList(await signInAs(ACCOUNTS.muaHang));
    const soon = rows.find((r) => r.order_id === f.orderSoon)!;
    expect(soon.due_state).toBe('sap_toi');
    expect(soon.days_left).toBe(5);
    await scan();
    expect(await notifiedOrders(f.chtId, ids)).toContain(f.orderSoon);
  });
});
