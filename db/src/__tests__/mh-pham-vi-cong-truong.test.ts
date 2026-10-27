/**
 * Đơn đặt hàng và phiếu giao nhận theo phạm vi công trường (Mẫu E — migration 0224).
 *
 * Trước 0224 chính sách đọc `purchase_orders` chỉ theo pháp nhân: chỉ huy trưởng công trình A thấy đơn, giá trị, dòng
 * hàng, phiếu giao nhận của công trình B cùng pháp nhân, và `record_delivery` cho ghi giao nhận vào đơn của B. Đơn
 * thuộc công trình của đề nghị mua gốc; đề nghị không gắn công trình (hàng về kho) vẫn hiện theo pháp nhân.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/mh-pham-vi-cong-truong.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Order {
  orderId: string;
  itemId: string;
}

interface Fixture {
  mine: Order;
  other: Order;
  noSite: Order;
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
    // Công trình A: chỉ huy trưởng NVO là người chịu trách nhiệm (coi như đã phân công). B: không ai phân công.
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
      VALUES
        (${nvo!.id}, ${'NVO-CT-PV-A-' + stamp}, ${TEST_PREFIX + ' Phạm vi A ' + stamp}, 'dang_thi_cong', current_date + 90, ${cht!.id}),
        (${nvo!.id}, ${'NVO-CT-PV-B-' + stamp}, ${TEST_PREFIX + ' Phạm vi B ' + stamp}, 'dang_thi_cong', current_date + 90, NULL)
      RETURNING id`;
    const [supplier] = await sql<{ id: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class)
      VALUES (${'NCC-PV-' + stamp}, ${TEST_PREFIX + ' NCC phạm vi ' + stamp}, 'chinh') RETURNING id`;

    async function order(siteId: string | null, label: string): Promise<Order> {
      const [pr] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, construction_site_id, stage, needed_date, cost_code)
        VALUES (${nvo!.id}, ${'PR-PV-' + label + '-' + stamp}, ${TEST_PREFIX + ' Phạm vi ' + label + ' ' + stamp},
                ${siteId}, 'dang_mua', current_date, 'VT-PV')
        RETURNING id`;
      const [po] = await sql<{ id: string }[]>`
        INSERT INTO purchase_orders (company_id, code, purchase_request_id, supplier_id, stage, order_date, promised_date, total_value, created_by)
        VALUES (${nvo!.id}, ${'DH-PV-' + label + '-' + stamp}, ${pr!.id}, ${supplier!.id}, 'da_dat',
                current_date - 3, current_date + 3, 1000000, ${mh!.id})
        RETURNING id`;
      const [item] = await sql<{ id: string }[]>`
        INSERT INTO purchase_order_items (purchase_order_id, position, name, unit, quantity, unit_price)
        VALUES (${po!.id}, 1, ${'Thép phạm vi ' + label}, 'kg', 100, 10000) RETURNING id`;
      return { orderId: po!.id, itemId: item!.id };
    }

    return {
      mine: await order(sites[0]!.id, 'A'),
      other: await order(sites[1]!.id, 'B'),
      noSite: await order(null, 'K'),
    };
  });
}

async function visibleOrders(client: SupabaseClient, ids: string[]): Promise<string[]> {
  const { data, error } = await client.from('purchase_orders').select('id').in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as string).sort();
}

async function visibleItems(client: SupabaseClient, orderIds: string[]): Promise<string[]> {
  const { data, error } = await client
    .from('purchase_order_items')
    .select('purchase_order_id')
    .in('purchase_order_id', orderIds);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.purchase_order_id as string))].sort();
}

function recordDelivery(client: SupabaseClient, o: Order) {
  return client.rpc('record_delivery', {
    p_purchase_order_id: o.orderId,
    p_delivered_date: null,
    p_items: [{ purchase_order_item_id: o.itemId, quantity_ok: 10, quantity_issue: 0 }],
  });
}

describeDb('Đơn đặt hàng theo phạm vi công trường (0224)', () => {
  let f: Fixture;
  let ids: string[];
  let cht: SupabaseClient;
  let mh: SupabaseClient;

  beforeAll(async () => {
    f = await seedFixture();
    ids = [f.mine.orderId, f.other.orderId, f.noSite.orderId];
    cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    mh = await signInAs(ACCOUNTS.muaHang);
  });

  it('chỉ huy trưởng chỉ thấy đơn của công trình mình và đơn không gắn công trình', async () => {
    expect(await visibleOrders(cht, ids)).toEqual([f.mine.orderId, f.noSite.orderId].sort());
    expect(await visibleItems(cht, ids)).toEqual([f.mine.orderId, f.noSite.orderId].sort());
  });

  it('Mua hàng (không giới hạn công trường) vẫn thấy cả ba đơn', async () => {
    expect(await visibleOrders(mh, ids)).toEqual([...ids].sort());
  });

  it('chỉ huy trưởng không ghi được giao nhận cho đơn công trình khác, ghi được cho công trình mình', async () => {
    const blocked = await recordDelivery(cht, f.other);
    expect(blocked.error?.message).toMatch(/chưa được phân công/);
    const ok = await recordDelivery(cht, f.mine);
    expect(ok.error).toBeNull();

    // Phiếu giao nhận của đơn công trình khác (do Mua hàng ghi) cũng không lộ ra.
    const byMh = await recordDelivery(mh, f.other);
    expect(byMh.error).toBeNull();
    const { data, error } = await cht
      .from('deliveries')
      .select('purchase_order_id')
      .in('purchase_order_id', [f.mine.orderId, f.other.orderId]);
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.purchase_order_id)).toEqual([f.mine.orderId]);
  });
});
