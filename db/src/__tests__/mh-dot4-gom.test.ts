/**
 * Đợt 4 — 4A: gom đề nghị mua (`mh_purchase_pool`, `request_group_quotation`,
 * `set_group_quotation_price`, trigger `quotations_complete_before_select` — migration 0200).
 *
 * Mua hàng thấy mọi đề nghị đang chờ mình, gộp theo pháp nhân + mã vật tư + đơn vị; chỉ huy
 * trưởng chỉ thấy công trình được giao (Mẫu E). Hỏi giá chung sinh báo giá nháp trên từng đề nghị
 * nguồn; báo giá thiếu mặt hàng không chọn được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/mh-dot4-gom.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface PoolSource {
  item_id: string;
  request_id: string;
  site_id: string | null;
  quantity: number | string;
  needed_date: string | null;
}

interface PoolRow {
  group_key: string;
  company_code: string;
  item_code: string | null;
  unit: string;
  total_quantity: number | string;
  source_count: number;
  request_count: number;
  earliest_needed: string | null;
  sources: PoolSource[];
}

interface Fixture {
  stamp: string;
  code: string;
  siteA: string;
  siteB: string;
  requestA: string;
  requestB: string;
  requestNvc: string;
  requestDraft: string;
  requestDone: string;
  itemA: string;
  itemASteel: string;
  itemB: string;
  itemNvc: string;
  itemDone: string;
  supplier: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const code = `XM-GOM-${stamp}`;
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date)
      VALUES
        (${nvo!.id}, ${'NVO-CT-GOM-A-' + stamp}, ${TEST_PREFIX + ' Gom A ' + stamp}, 'dang_thi_cong', current_date + 90),
        (${nvo!.id}, ${'NVO-CT-GOM-B-' + stamp}, ${TEST_PREFIX + ' Gom B ' + stamp}, 'dang_thi_cong', current_date + 90)
      RETURNING id`;
    const [siteA, siteB] = [sites[0]!.id, sites[1]!.id];
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${siteA}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvo}`;

    async function request(
      companyId: string,
      siteId: string | null,
      stage: string,
      needed: number,
      label: string,
    ): Promise<string> {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, construction_site_id, stage, needed_date, cost_code)
        VALUES (${companyId}, ${'PR-GOM-' + label + '-' + stamp}, ${TEST_PREFIX + ' Gom ' + label + ' ' + stamp},
                ${siteId}, ${stage}::purchase_request_stage, current_date + ${needed}::int, 'VT-GOM')
        RETURNING id`;
      return row!.id;
    }
    async function item(
      requestId: string,
      itemCode: string,
      name: string,
      qty: number,
    ): Promise<string> {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO purchase_request_items (purchase_request_id, position, item_code, name, unit, quantity, estimated_unit_price)
        VALUES (${requestId}, 1, ${itemCode}, ${name}, 'tấn', ${qty}, 1500000)
        RETURNING id`;
      return row!.id;
    }

    const requestA = await request(nvo!.id, siteA, 'da_duyet', 5, 'A');
    const requestB = await request(nvo!.id, siteB, 'cho_duyet', 3, 'B');
    const requestNvc = await request(nvc!.id, null, 'da_duyet', 4, 'NVC');
    const requestDraft = await request(nvo!.id, siteA, 'nhap', 1, 'NHAP');
    const requestDone = await request(nvo!.id, siteB, 'hoan_thanh', 2, 'XONG');

    const itemA = await item(requestA, code, 'Xi măng PCB40', 10);
    const itemASteel = await item(requestA, `THEP-GOM-${stamp}`, 'Thép D10', 2);
    const itemB = await item(requestB, code, 'Xi măng PCB40', 5);
    const itemNvc = await item(requestNvc, code, 'Xi măng PCB40', 7);
    await item(requestDraft, code, 'Xi măng PCB40', 99);
    const itemDone = await item(requestDone, code, 'Xi măng PCB40', 1);

    const [supplier] = await sql<{ id: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class)
      VALUES (${'NCC-GOM-' + stamp}, ${TEST_PREFIX + ' NCC xi măng ' + stamp}, 'chinh')
      RETURNING id`;

    return {
      stamp,
      code,
      siteA,
      siteB,
      requestA,
      requestB,
      requestNvc,
      requestDraft,
      requestDone,
      itemA,
      itemASteel,
      itemB,
      itemNvc,
      itemDone,
      supplier: supplier!.id,
    };
  } finally {
    await sql.end();
  }
}

async function pool(client: SupabaseClient): Promise<PoolRow[]> {
  const { data, error } = await client.rpc('mh_purchase_pool');
  if (error) throw new Error(error.message);
  return (data ?? []) as PoolRow[];
}

describeDb('4A — gom đề nghị mua (0200)', () => {
  let f: Fixture;
  let muaHang: SupabaseClient;

  beforeAll(async () => {
    f = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
  });

  it('Mua hàng thấy một dòng cho cùng mã + đơn vị của một pháp nhân: tổng số lượng và các nguồn', async () => {
    const rows = (await pool(muaHang)).filter((r) => r.item_code === f.code);
    const nvo = rows.find((r) => r.company_code === 'NVO')!;
    expect(nvo).toBeDefined();
    expect(Number(nvo.total_quantity)).toBe(15);
    expect(nvo.source_count).toBe(2);
    // Xếp nguồn theo ngày cần: B cần sớm hơn A.
    expect(nvo.sources.map((s) => s.request_id)).toEqual([f.requestB, f.requestA]);
    // Pháp nhân khác là nhóm riêng — không mua chung được.
    const nvc = rows.find((r) => r.company_code === 'NVC')!;
    expect(Number(nvc.total_quantity)).toBe(7);
  });

  it('đề nghị Nháp, Hoàn thành không vào danh sách gom', async () => {
    const ids = (await pool(muaHang)).flatMap((r) => r.sources.map((s) => s.request_id));
    expect(ids).not.toContain(f.requestDraft);
    expect(ids).not.toContain(f.requestDone);
  });

  it('chỉ huy trưởng chỉ thấy nguồn từ công trình được giao (Mẫu E)', async () => {
    const rows = (await pool(await signInAs(ACCOUNTS.chiHuyTruongNvo))).filter(
      (r) => r.item_code === f.code,
    );
    const ids = rows.flatMap((r) => r.sources.map((s) => s.request_id));
    expect(ids).toContain(f.requestA);
    expect(ids).not.toContain(f.requestB);
    expect(ids).not.toContain(f.requestNvc);
  });

  it('Kinh doanh (không xem Mua hàng) không thấy dòng nào', async () => {
    const rows = (await pool(await signInAs(ACCOUNTS.kinhDoanhNvo))).filter(
      (r) => r.item_code === f.code,
    );
    expect(rows).toHaveLength(0);
  });

  it('chỉ huy trưởng không hỏi giá được', async () => {
    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    const { error } = await cht.rpc('request_group_quotation', {
      p_item_ids: [f.itemA],
      p_supplier_id: f.supplier,
    });
    expect(error).toBeTruthy();
  });

  it('nhóm có đề nghị đã hoàn thành thì không hỏi giá được', async () => {
    const { error } = await muaHang.rpc('request_group_quotation', {
      p_item_ids: [f.itemA, f.itemDone],
      p_supplier_id: f.supplier,
    });
    expect(error?.message).toMatch(/không còn nhận báo giá/);
  });

  it('nhóm trộn hai pháp nhân bị từ chối', async () => {
    const { error } = await muaHang.rpc('request_group_quotation', {
      p_item_ids: [f.itemA, f.itemNvc],
      p_supplier_id: f.supplier,
    });
    expect(error?.message).toMatch(/nhiều pháp nhân/);
  });

  it('hỏi giá chung tạo báo giá «Chờ báo giá» trên từng đề nghị nguồn, nhập giá chung ghi đơn giá', async () => {
    const { data: created, error } = await muaHang.rpc('request_group_quotation', {
      p_item_ids: [f.itemA, f.itemB],
      p_supplier_id: f.supplier,
    });
    expect(error).toBeNull();
    expect(created).toBe(2);

    const { data: again } = await muaHang.rpc('request_group_quotation', {
      p_item_ids: [f.itemA, f.itemB],
      p_supplier_id: f.supplier,
    });
    expect(again).toBe(0);

    const { data: drafts } = await muaHang
      .from('quotations')
      .select('id, status, purchase_request_id')
      .eq('supplier_id', f.supplier);
    expect((drafts ?? []).map((q) => q.status).sort()).toEqual(['cho_bao_gia', 'cho_bao_gia']);

    const { error: priceError } = await muaHang.rpc('set_group_quotation_price', {
      p_item_ids: [f.itemA, f.itemB],
      p_supplier_id: f.supplier,
      p_unit_price: 1_450_000,
      p_delivery_days: 3,
    });
    expect(priceError).toBeNull();

    const { data: quotes } = await muaHang
      .from('quotations')
      .select(
        'id, status, purchase_request_id, delivery_days, quoted_date, quotation_items(purchase_request_item_id, unit_price, quantity)',
      )
      .eq('supplier_id', f.supplier);
    expect(quotes).toHaveLength(2);
    for (const q of quotes ?? []) {
      expect(q.status).toBe('da_nhan');
      expect(q.delivery_days).toBe(3);
      expect(q.quoted_date).not.toBeNull();
      const lines = q.quotation_items as {
        unit_price: number | string;
        quantity: number | string;
      }[];
      expect(lines).toHaveLength(1);
      expect(Number(lines[0]!.unit_price)).toBe(1_450_000);
    }
    const onB = (quotes ?? []).find((q) => q.purchase_request_id === f.requestB)!;
    expect(Number((onB.quotation_items as { quantity: number | string }[])[0]!.quantity)).toBe(5);
  });

  it('báo giá còn thiếu mặt hàng của đề nghị thì không chọn được', async () => {
    const { data: quote } = await muaHang
      .from('quotations')
      .select('id')
      .eq('supplier_id', f.supplier)
      .eq('purchase_request_id', f.requestA)
      .single();
    const { error } = await muaHang.rpc('select_quotation', {
      p_quotation_id: (quote as { id: string }).id,
      p_reason: null,
    });
    expect(error?.message).toMatch(/còn thiếu đơn giá 1 mặt hàng/);

    // Đề nghị B chỉ có một mặt hàng — chọn được.
    const { data: quoteB } = await muaHang
      .from('quotations')
      .select('id')
      .eq('supplier_id', f.supplier)
      .eq('purchase_request_id', f.requestB)
      .single();
    const { error: okError } = await muaHang.rpc('select_quotation', {
      p_quotation_id: (quoteB as { id: string }).id,
      p_reason: null,
    });
    expect(okError).toBeNull();
  });

  it('đề nghị đã chọn nhà cung cấp thì không hỏi giá chung thêm', async () => {
    const { error } = await muaHang.rpc('request_group_quotation', {
      p_item_ids: [f.itemB],
      p_supplier_id: f.supplier,
    });
    expect(error?.message).toMatch(/đã chọn nhà cung cấp/);
  });
});
