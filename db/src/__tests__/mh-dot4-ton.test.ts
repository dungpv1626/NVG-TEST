/**
 * Đợt 4 — 4D: tồn tối thiểu (`inventory_items.min_quantity` + trigger
 * `inventory_items_low_stock_notify` — migration 0203).
 *
 * Kho đặt mức; tồn đi QUA mức (xuất kho) thì Mua hàng được báo một lần; đã ở dưới thì không báo
 * lại; chưa đặt mức thì không báo. Mua hàng (chỉ xem Kho) không sửa được mức.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/mh-dot4-ton.test.ts`
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
  warehouse: string;
  materialWithMin: string;
  materialNoMin: string;
  siteId: string;
  mhId: string;
}

async function seedFixture(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [mh] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.muaHang}`;
    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      VALUES (${nvc!.id}, ${'NVC-CT-TON-' + stamp}, ${TEST_PREFIX + ' Tồn ' + stamp}, current_date + 90)
      RETURNING id`;
    const materials = await sql<{ id: string }[]>`
      INSERT INTO materials (code, group_code, name, unit)
      VALUES (${'XM-TON-' + stamp}, 'XM', ${TEST_PREFIX + ' Xi măng tồn ' + stamp}, 'bao'),
             (${'CAT-TON-' + stamp}, 'CAT', ${TEST_PREFIX + ' Cát tồn ' + stamp}, 'm3')
      RETURNING id`;
    const [wh] = await sql<{ id: string }[]>`
      INSERT INTO warehouses (company_id, code, name, warehouse_type)
      VALUES (${nvc!.id}, ${'KHO-TON-' + stamp}, ${TEST_PREFIX + ' Kho tồn ' + stamp}, 'vat_tu_xay_dung')
      RETURNING id`;
    return {
      warehouse: wh!.id,
      materialWithMin: materials[0]!.id,
      materialNoMin: materials[1]!.id,
      siteId: site!.id,
      mhId: mh!.id,
    };
  });
}

async function lowStockNotices(userId: string, warehouseId: string): Promise<number> {
  return withSql(async (sql) => {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM notifications n
        JOIN inventory_items i ON i.id = n.related_entity_id
       WHERE n.user_id = ${userId} AND n.type = 'low_stock' AND i.warehouse_id = ${warehouseId}`;
    return row!.n;
  });
}

describeDb('4D — tồn tối thiểu (0203)', () => {
  let f: Fixture;
  let kho: SupabaseClient;

  async function issue(materialId: string, quantity: number) {
    const { error } = await kho.rpc('issue_stock', {
      p_warehouse_id: f.warehouse,
      p_items: [{ material_id: materialId, quantity }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: f.siteId,
    });
    if (error) throw new Error(error.message);
  }
  async function receive(materialId: string, quantity: number) {
    const { error } = await kho.rpc('receive_stock', {
      p_warehouse_id: f.warehouse,
      p_items: [{ material_id: materialId, quantity, unit_cost: 90_000 }],
    });
    if (error) throw new Error(error.message);
  }
  async function itemId(materialId: string): Promise<string> {
    const { data } = await kho
      .from('inventory_items')
      .select('id')
      .eq('warehouse_id', f.warehouse)
      .eq('material_id', materialId)
      .single();
    return (data as { id: string }).id;
  }

  beforeAll(async () => {
    f = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    await receive(f.materialWithMin, 50);
    await receive(f.materialNoMin, 30);
  });

  afterAll(async () => {
    await withSql(
      (sql) => sql`
        DELETE FROM notifications WHERE type = 'low_stock' AND related_entity_id IN (
          SELECT id FROM inventory_items WHERE warehouse_id = ${f.warehouse})`,
    );
  });

  it('Kho đặt được mức tối thiểu; Mua hàng (chỉ xem Kho) thì không', async () => {
    const id = await itemId(f.materialWithMin);
    const { error } = await kho
      .from('inventory_items')
      .update({ min_quantity: 20 })
      .eq('id', id)
      .select('id')
      .single();
    expect(error).toBeNull();

    const mh = await signInAs(ACCOUNTS.muaHang);
    const { data } = await mh
      .from('inventory_items')
      .update({ min_quantity: 999 })
      .eq('id', id)
      .select('id');
    expect(data ?? []).toHaveLength(0);
    expect(await lowStockNotices(f.mhId, f.warehouse)).toBe(0);
  });

  it('xuất kho làm tồn xuống tới mức thì Mua hàng được báo', async () => {
    await issue(f.materialWithMin, 35);
    expect(await lowStockNotices(f.mhId, f.warehouse)).toBe(1);
  });

  it('đã ở dưới mức thì xuất tiếp không báo lại', async () => {
    await issue(f.materialWithMin, 5);
    expect(await lowStockNotices(f.mhId, f.warehouse)).toBe(1);
  });

  it('vật tư chưa đặt mức thì xuất hết cũng không báo', async () => {
    await issue(f.materialNoMin, 30);
    expect(await lowStockNotices(f.mhId, f.warehouse)).toBe(1);
  });

  it('nhập bù lên trên mức rồi lại xuống thì báo lần mới', async () => {
    await receive(f.materialWithMin, 100);
    await issue(f.materialWithMin, 95);
    expect(await lowStockNotices(f.mhId, f.warehouse)).toBe(2);
  });
});
