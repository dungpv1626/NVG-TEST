/**
 * Module KHO — Quản lý Kho: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD KHO-01 → KHO-09, Backend Schema 4.8, Tech Stack 3.6.
 *
 * Năm thứ được canh kỹ nhất, vì mất thứ nào cũng làm sổ kho nói sai:
 *  1. sổ kho chỉ đổi qua phiếu;
 *  2. không xuất quá tồn;
 *  3. điều chuyển đổi cả hai đầu trong cùng một giao dịch (KHO-05);
 *  4. kiểm kê khoá kho, và sổ chỉ đổi SAU khi biên bản được duyệt (KHO-07);
 *  5. giàn giáo hỏng không nằm chung với hàng dùng được (KHO-06).
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  anonClient,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  nvcCompanyId: string;
  nvoCompanyId: string;
  nvcSiteId: string;
  nvoSiteId: string;
  warehouseA: string;
  warehouseB: string;
  warehouseC: string;
  warehouseNvo: string;
  materialThep: string;
  materialBulong: string;
  materialGiao: string;
  scaffoldingAssetId: string;
}

/** Dựng bối cảnh bằng kết nối trực tiếp (vượt RLS): hai kho NVC, một kho NVO, ba vật tư. */
async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const sites = await sql<{ id: string; company_id: string; code: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      SELECT c.id, c.code || '-CT-KHOTEST-' || ${stamp},
             ${TEST_PREFIX + ' Công trình KHO '} || c.code || ' ' || ${stamp},
             current_date + 120
        FROM companies c WHERE c.code IN ('NVC', 'NVO')
       RETURNING id, company_id, (SELECT code FROM companies WHERE id = company_id) AS code
    `;
    const byCode = new Map(sites.map((s) => [s.code, s]));
    const nvc = byCode.get('NVC')!;
    const nvo = byCode.get('NVO')!;

    const materials = await sql<{ id: string; code: string }[]>`
      INSERT INTO materials (code, group_code, name, specification, unit, is_scaffolding)
      VALUES
        (${'THEP-HOP-KHOTEST-' + stamp}, 'THEP',
         ${TEST_PREFIX + ' Thép hộp 50x50 ' + stamp}, '50x50x2.0mm', 'kg', false),
        (${'PK-BULONG-KHOTEST-' + stamp}, 'KHAC',
         ${TEST_PREFIX + ' Bulông M16 ' + stamp}, 'M16x60', 'cái', false),
        (${'GIANGIAO-NEM-KHOTEST-' + stamp}, 'GIANGIAO',
         ${TEST_PREFIX + ' Giáo nêm 1.5m ' + stamp}, 'Cao 1,5m', 'bộ', true)
      RETURNING id, code
    `;

    const warehouses = await sql<{ id: string; code: string }[]>`
      INSERT INTO warehouses (company_id, code, name, warehouse_type)
      VALUES
        (${nvc.company_id}, ${'KHO-A-' + stamp},
         ${TEST_PREFIX + ' Kho vật tư A ' + stamp}, 'vat_tu_xay_dung'),
        (${nvc.company_id}, ${'KHO-B-' + stamp},
         ${TEST_PREFIX + ' Kho vật tư B ' + stamp}, 'cong_cu_dung_cu'),
        (${nvc.company_id}, ${'KHO-C-' + stamp},
         ${TEST_PREFIX + ' Kho vật tư C ' + stamp}, 'vat_tu_xay_dung'),
        (${nvo.company_id}, ${'KHO-NVO-' + stamp},
         ${TEST_PREFIX + ' Kho NVO ' + stamp}, 'vat_tu_xay_dung')
      RETURNING id, code
    `;

    const [asset] = await sql<{ id: string }[]>`
      INSERT INTO scaffolding_assets (company_id, asset_code, material_id, quantity, condition,
                                      location_type, warehouse_id)
      VALUES (${nvc.company_id}, ${'TEST-GIAO-' + stamp}, ${materials[2]!.id}, 500, 'moi',
              'kho', ${warehouses[0]!.id})
      RETURNING id
    `;

    return {
      nvcCompanyId: nvc.company_id,
      nvoCompanyId: nvo.company_id,
      nvcSiteId: nvc.id,
      nvoSiteId: nvo.id,
      warehouseA: warehouses[0]!.id,
      warehouseB: warehouses[1]!.id,
      // Kho C để riêng cho phép thử giá vốn: nó phải sạch, không dính tồn của phép thử khác.
      warehouseC: warehouses[2]!.id,
      warehouseNvo: warehouses[3]!.id,
      materialThep: materials[0]!.id,
      materialBulong: materials[1]!.id,
      materialGiao: materials[2]!.id,
      scaffoldingAssetId: asset!.id,
    };
  } finally {
    await sql.end();
  }
}

/** Số tồn của một cặp kho × vật tư, đọc trực tiếp để không phụ thuộc quyền. */
async function onHand(warehouseId: string, materialId: string): Promise<number> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const rows = await sql<{ quantity_on_hand: string }[]>`
      SELECT quantity_on_hand FROM inventory_items
       WHERE warehouse_id = ${warehouseId} AND material_id = ${materialId}
    `;
    return rows.length === 0 ? 0 : Number(rows[0]!.quantity_on_hand);
  } finally {
    await sql.end();
  }
}

/**
 * Giá vốn bình quân của một cặp kho × vật tư, đọc trực tiếp để không phụ thuộc quyền.
 *
 * Từ BUILD_PLAN 4B, `average_cost` KHÔNG còn đọc thẳng được qua vai trò `kho` (Mẫu D — chỉ
 * qua hàm `inventory_items_cost`, xem test riêng ở cuối tệp) — các ca kiểm TÍNH ĐÚNG giá bình
 * quân sau nhập/điều chuyển/kiểm kê dùng hàm này để tách khỏi việc kiểm quyền.
 */
async function averageCost(warehouseId: string, materialId: string): Promise<bigint> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const rows = await sql<{ average_cost: string }[]>`
      SELECT average_cost FROM inventory_items
       WHERE warehouse_id = ${warehouseId} AND material_id = ${materialId}
    `;
    return rows.length === 0 ? 0n : BigInt(rows[0]!.average_cost);
  } finally {
    await sql.end();
  }
}

describeDb('KHO — danh mục vật tư và phạm vi pháp nhân (KHO-01, KHO-02)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;
  let muaHang: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    muaHang = await signInAs(ACCOUNTS.muaHang);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('vai trò anon không đọc được tồn kho', async () => {
    const { data, error } = await anonClient().from('inventory_items').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('danh mục vật tư dùng chung: Mua hàng XEM được nhưng chỉ Kho mới thêm (KHO-02)', async () => {
    const { data } = await muaHang
      .from('materials')
      .select('id')
      .eq('id', fixture.materialThep)
      .maybeSingle();
    expect(data).toBeTruthy();

    const { error } = await muaHang.from('materials').insert({
      code: `MH-TU-DAT-${Date.now()}`,
      group_code: 'KHAC',
      name: `${TEST_PREFIX} Vật tư do Mua hàng tạo`,
      unit: 'cái',
    });
    // Một vật tư một mã chỉ giữ được khi việc đặt mã nằm ở một đầu mối (KHO-02).
    expect(error).toBeTruthy();
  });

  it('mã vật tư trùng bị chặn — một vật tư chỉ dùng MỘT mã (KHO-02)', async () => {
    const { data: existing } = await kho
      .from('materials')
      .select('code')
      .eq('id', fixture.materialThep)
      .single();

    const { error } = await kho.from('materials').insert({
      code: (existing as { code: string }).code,
      group_code: 'THEP',
      name: `${TEST_PREFIX} Thép hộp nhập trùng`,
      unit: 'kg',
    });
    expect(error).toBeTruthy();
  });

  it('pháp nhân khác KHÔNG thấy kho (Mẫu A, NEN-01)', async () => {
    const { data } = await kho.from('warehouses').select('id').eq('id', fixture.warehouseNvo);
    // Tài khoản Kho được gán NVC và NVS, không có NVO.
    expect(data).toEqual([]);
  });

  it('không ghi thẳng được vào sổ kho — mọi thay đổi phải có phiếu đứng sau', async () => {
    const { error } = await kho.from('inventory_items').insert({
      company_id: fixture.nvcCompanyId,
      warehouse_id: fixture.warehouseA,
      material_id: fixture.materialThep,
      quantity_on_hand: 9999,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('Ban công trường không lập được phiếu kho', async () => {
    const { error } = await chiHuy.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 10, unit_cost: 20_000 }],
    });
    expect(error).toBeTruthy();
  });
});

describeDb('KHO — nhập, xuất, điều chuyển (KHO-03, KHO-04, KHO-05)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
  });

  it('nhập kho cộng đúng tồn và đặt đơn giá bình quân', async () => {
    const { data, error } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 1000, unit_cost: 20_000 }],
      p_counterpart_name: 'Thép Nam Việt',
    });
    expect(error).toBeNull();

    const { data: movement } = await kho
      .from('stock_movements')
      .select('code, movement_type')
      .eq('id', data as string)
      .single();
    expect((movement as { code: string }).code).toMatch(/^NVC-PN-\d{4}-\d{4}$/);

    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(1000);
  });

  it('nhập đợt hai tính lại giá bình quân theo số lượng', async () => {
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 1000, unit_cost: 24_000 }],
    });

    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(2000);
    // (1000×20.000 + 1000×24.000) / 2000 = 22.000
    expect(await averageCost(fixture.warehouseA, fixture.materialThep)).toBe(22_000n);
  });

  it('xuất quá tồn bị chặn, và nói rõ còn bao nhiêu', async () => {
    const { error } = await kho.rpc('issue_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 999_999 }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: fixture.nvcSiteId,
    });
    expect(error?.message).toMatch(/không xuất quá tồn/i);
  });

  it('xuất cho công trình bắt buộc chọn công trình (KT-05)', async () => {
    const { error } = await kho.rpc('issue_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 10 }],
      p_issue_reason: 'cong_trinh',
    });
    expect(error?.message).toMatch(/phải chọn công trình/i);
  });

  it('không xuất được cho công trình của pháp nhân khác (NEN-01)', async () => {
    const { error } = await kho.rpc('issue_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 10 }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: fixture.nvoSiteId,
    });
    expect(error?.message).toMatch(/không thuộc pháp nhân/i);
  });

  it('xuất kho trừ đúng tồn', async () => {
    const before = await onHand(fixture.warehouseA, fixture.materialThep);
    const { error } = await kho.rpc('issue_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 300 }],
      p_issue_reason: 'cong_trinh',
      p_construction_site_id: fixture.nvcSiteId,
    });
    expect(error).toBeNull();
    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(before - 300);
  });

  it('điều chuyển giảm kho xuất và tăng kho nhận trong CÙNG một giao dịch (KHO-05)', async () => {
    const beforeA = await onHand(fixture.warehouseA, fixture.materialThep);
    const beforeB = await onHand(fixture.warehouseB, fixture.materialThep);

    const { error } = await kho.rpc('transfer_stock', {
      p_from_warehouse_id: fixture.warehouseA,
      p_to_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialThep, quantity: 200 }],
    });
    expect(error).toBeNull();

    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(beforeA - 200);
    expect(await onHand(fixture.warehouseB, fixture.materialThep)).toBe(beforeB + 200);
  });

  it('điều chuyển vượt tồn KHÔNG làm tăng kho nhận — cả hai đầu cùng đứng yên', async () => {
    const beforeA = await onHand(fixture.warehouseA, fixture.materialThep);
    const beforeB = await onHand(fixture.warehouseB, fixture.materialThep);

    const { error } = await kho.rpc('transfer_stock', {
      p_from_warehouse_id: fixture.warehouseA,
      p_to_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialThep, quantity: 999_999 }],
    });
    expect(error).toBeTruthy();

    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(beforeA);
    expect(await onHand(fixture.warehouseB, fixture.materialThep)).toBe(beforeB);
  });

  it('điều chuyển về chính kho đó bị chặn', async () => {
    const { error } = await kho.rpc('transfer_stock', {
      p_from_warehouse_id: fixture.warehouseA,
      p_to_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 1 }],
    });
    expect(error).toBeTruthy();
  });

  it('gửi lại cùng một phiếu KHÔNG tạo phiếu thứ hai (KHO-09)', async () => {
    const clientId = `test-scan-${Date.now()}`;
    const before = await onHand(fixture.warehouseB, fixture.materialBulong);

    const { data: first } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialBulong, quantity: 50, unit_cost: 12_000 }],
      p_client_generated_id: clientId,
    });

    // Máy ở kho mất sóng giữa lúc gửi nên gửi lại đúng phiếu đó.
    const { data: second, error } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialBulong, quantity: 50, unit_cost: 12_000 }],
      p_client_generated_id: clientId,
    });

    expect(error).toBeNull();
    expect(second).toBe(first);
    // Quan trọng nhất: tồn KHÔNG cộng hai lần.
    expect(await onHand(fixture.warehouseB, fixture.materialBulong)).toBe(before + 50);
  });

  it('quét mã trả về tồn theo từng kho, mã lạ thì báo rõ (KHO-09)', async () => {
    const { data: material } = await kho
      .from('materials')
      .select('code')
      .eq('id', fixture.materialThep)
      .single();

    const { data, error } = await kho.rpc('scan_material', {
      p_code: (material as { code: string }).code,
    });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBeGreaterThan(0);

    const { error: unknownError } = await kho.rpc('scan_material', { p_code: 'KHONG-CO-MA-NAY' });
    expect(unknownError?.message).toMatch(/Không tìm thấy vật tư/i);
  });

  it('giàn giáo KHÔNG đi qua sổ tồn kho — tránh đếm trùng hai sổ (KHO-06)', async () => {
    // Cùng một đống giáo nêm mà vừa có dòng tồn vừa có lô tài sản thì hai con số chắc chắn
    // lệch nhau ngay lần đầu có hàng hỏng, vì chỉ một bên biết đến "hỏng chờ sửa".
    const { error } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialGiao, quantity: 100, unit_cost: 500_000 }],
    });
    expect(error?.message).toMatch(/vòng đời giàn giáo/i);
    expect(await onHand(fixture.warehouseA, fixture.materialGiao)).toBe(0);
  });

  it('hàm nội bộ không gọi được từ trình duyệt', async () => {
    const { error: deltaError } = await kho.rpc('apply_stock_delta', {
      p_company_id: fixture.nvcCompanyId,
      p_warehouse_id: fixture.warehouseA,
      p_material_id: fixture.materialThep,
      p_delta: 1000,
    });
    expect(deltaError).toBeTruthy();

    const { error: writeError } = await kho.rpc('write_stock_movement', {
      p_movement_type: 'nhap',
      p_warehouse_id: fixture.warehouseA,
      p_target_warehouse_id: null,
      p_movement_date: null,
      p_items: [{ material_id: fixture.materialThep, quantity: 1 }],
    });
    expect(writeError).toBeTruthy();
  });
});

describeDb('KHO — kiểm kê khoá kho và điều chỉnh phải được duyệt trước (KHO-07)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;
  /**
   * Duyệt điều chỉnh kiểm kê KHÔNG phải việc của Tổng Giám đốc: hạn mức mặc định
   * (`DEFAULT_APPROVAL_LIMITS`) chỉ mở cho Kho tới 10 triệu và Giám đốc Tài chính không giới
   * hạn — chênh lệch kho là chuyện tài sản, không phải chuyện điều hành.
   */
  let cfo: SupabaseClient;
  let stocktakeId: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    cfo = await signInAs(ACCOUNTS.cfo);

    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [
        { material_id: fixture.materialThep, quantity: 1000, unit_cost: 20_000 },
        { material_id: fixture.materialBulong, quantity: 200, unit_cost: 12_000 },
      ],
    });

    const { data } = await kho.rpc('start_stocktake', { p_warehouse_id: fixture.warehouseA });
    stocktakeId = data as string;
  });

  it('mở đợt kiểm kê chụp lại số sổ kho của mọi vật tư trong kho', async () => {
    const { data } = await kho
      .from('stocktake_items')
      .select('material_id, book_quantity, counted_quantity')
      .eq('stocktake_id', stocktakeId);

    const rows = data as { material_id: string; book_quantity: string }[];
    expect(rows.length).toBe(2);
    expect(Number(rows.find((r) => r.material_id === fixture.materialThep)!.book_quantity)).toBe(
      1000,
    );
  });

  it('đang kiểm kê thì kho tạm dừng nhập xuất (KHO-07)', async () => {
    const { error } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 10, unit_cost: 20_000 }],
    });
    expect(error?.message).toMatch(/đang kiểm kê/i);
  });

  it('hai đợt kiểm kê cùng lúc trên một kho bị chặn', async () => {
    const { error } = await kho.rpc('start_stocktake', { p_warehouse_id: fixture.warehouseA });
    expect(error?.message).toMatch(/chưa kết thúc/i);
  });

  it('chưa đếm hết thì không lập được biên bản chênh lệch', async () => {
    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: stocktakeId,
      p_items: [{ material_id: fixture.materialThep, counted_quantity: 980 }],
    });

    const { error } = await kho.rpc('submit_stocktake_approval', {
      p_stocktake_id: stocktakeId,
      p_variance_reason: 'Hao hụt bốc xếp.',
    });
    expect(error?.message).toMatch(/chưa đếm/i);
  });

  it('trình phê duyệt bắt buộc ghi nguyên nhân chênh lệch', async () => {
    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: stocktakeId,
      p_items: [{ material_id: fixture.materialBulong, counted_quantity: 200 }],
    });

    const { error } = await kho.rpc('submit_stocktake_approval', {
      p_stocktake_id: stocktakeId,
      p_variance_reason: '   ',
    });
    expect(error?.message).toMatch(/nguyên nhân/i);
  });

  it('sổ kho KHÔNG đổi khi biên bản mới chỉ đang chờ duyệt', async () => {
    const { error } = await kho.rpc('submit_stocktake_approval', {
      p_stocktake_id: stocktakeId,
      p_variance_reason: 'Hao hụt trong quá trình bốc xếp và cắt.',
    });
    expect(error).toBeNull();

    // Đếm được 980 nhưng sổ vẫn là 1000 — đây chính là điều KHO-07 đòi hỏi.
    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(1000);
  });

  it('duyệt xong sổ kho mới đổi, và đổi bằng một PHIẾU điều chỉnh chứ không lặng lẽ', async () => {
    const { data: approval } = await kho
      .from('approvals')
      .select('id, subject, amount')
      .eq('entity_type', 'stocktakes')
      .eq('entity_id', stocktakeId)
      .single();
    expect((approval as { subject: string }).subject).toBe('stocktake_adjustment');
    // 20 kg lệch × 20.000 đồng giá bình quân = 400.000 đồng.
    expect(BigInt((approval as { amount: string }).amount)).toBe(400_000n);

    const { error } = await cfo.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'approved',
      p_note: 'Đồng ý điều chỉnh theo biên bản.',
    });
    expect(error).toBeNull();

    expect(await onHand(fixture.warehouseA, fixture.materialThep)).toBe(980);

    const { data: movements } = await kho
      .from('stock_movements')
      .select('id, movement_type, code')
      .eq('stocktake_id', stocktakeId);
    expect((movements as unknown[]).length).toBe(1);
    expect((movements as { movement_type: string }[])[0]!.movement_type).toBe('kiem_ke');

    const { data: st } = await kho
      .from('stocktakes')
      .select('status')
      .eq('id', stocktakeId)
      .single();
    expect((st as { status: string }).status).toBe('da_dieu_chinh');
  });

  it('kiểm kê xong thì kho nhập xuất lại được', async () => {
    const { error } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 10, unit_cost: 20_000 }],
    });
    expect(error).toBeNull();
  });

  it('từ chối biên bản thì kho đếm lại, sổ kho giữ nguyên', async () => {
    // Kho B trong bối cảnh này còn trống, mà kiểm kê một kho không có gì thì không có chênh
    // lệch nào để trình duyệt. Nhập trước một ít hàng.
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialBulong, quantity: 100, unit_cost: 12_000 }],
    });

    const { data: newStocktake } = await kho.rpc('start_stocktake', {
      p_warehouse_id: fixture.warehouseB,
    });
    const id = newStocktake as string;

    const { data: items } = await kho
      .from('stocktake_items')
      .select('material_id')
      .eq('stocktake_id', id);

    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: id,
      p_items: (items as { material_id: string }[]).map((i) => ({
        material_id: i.material_id,
        counted_quantity: 1,
      })),
    });
    await kho.rpc('submit_stocktake_approval', {
      p_stocktake_id: id,
      p_variance_reason: 'Nghi ngờ đếm sót, cần rà lại.',
    });

    const { data: approval } = await kho
      .from('approvals')
      .select('id')
      .eq('entity_type', 'stocktakes')
      .eq('entity_id', id)
      .single();

    await cfo.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'rejected',
      p_note: 'Số lệch quá lớn, đếm lại trước khi điều chỉnh.',
    });

    const { data: st } = await kho.from('stocktakes').select('status').eq('id', id).single();
    expect((st as { status: string }).status).toBe('dang_kiem');

    // Từ chối KHÔNG phải là chấp nhận số đếm: sổ kho vẫn là 100, không phải 1.
    expect(await onHand(fixture.warehouseB, fixture.materialBulong)).toBe(100);

    await kho.rpc('cancel_stocktake', { p_stocktake_id: id, p_reason: 'Kết thúc kịch bản thử.' });
  });
});

describeDb('KHO — vòng đời giàn giáo (KHO-06)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
  });

  it('không tự đặt tình trạng bằng một câu UPDATE', async () => {
    const { error } = await kho
      .from('scaffolding_assets')
      .update({ condition: 'con_dung_duoc' })
      .eq('id', fixture.scaffoldingAssetId);
    expect(error).toBeTruthy();
  });

  it('biên bản không có nguyên nhân bị chặn', async () => {
    const { error } = await kho.rpc('record_scaffolding_event', {
      p_asset_id: fixture.scaffoldingAssetId,
      p_event_type: 'sua_chua',
      p_quantity: 10,
      p_reason: '  ',
      p_result_condition: 'hong_cho_sua',
    });
    expect(error?.message).toMatch(/nguyên nhân/i);
  });

  it('biên bản vượt số lượng của lô bị chặn', async () => {
    const { error } = await kho.rpc('record_scaffolding_event', {
      p_asset_id: fixture.scaffoldingAssetId,
      p_event_type: 'mat_mat',
      p_quantity: 100_000,
      p_reason: 'Thử vượt số lượng.',
    });
    expect(error?.message).toMatch(/chỉ còn/i);
  });

  it('hàng hỏng tách khỏi lượng dùng được, không nhập chung (KHO-06)', async () => {
    const { error } = await kho.rpc('record_scaffolding_event', {
      p_asset_id: fixture.scaffoldingAssetId,
      p_event_type: 'sua_chua',
      p_quantity: 80,
      p_reason: 'Cong vênh sau đợt tháo dỡ ở công trình A.',
      p_result_condition: 'hong_cho_sua',
      p_amount: 4_000_000,
      p_responsible_party: 'Ban công trường A',
    });
    expect(error).toBeNull();

    const { data: source } = await kho
      .from('scaffolding_assets')
      .select('quantity, condition')
      .eq('id', fixture.scaffoldingAssetId)
      .single();
    expect(Number((source as { quantity: string }).quantity)).toBe(420);

    const { data: all } = await kho
      .from('scaffolding_assets')
      .select('quantity, condition')
      .eq('material_id', fixture.materialGiao);

    const rows = all as { quantity: string; condition: string }[];
    const damaged = rows.filter((r) => r.condition === 'hong_cho_sua');
    expect(damaged.length).toBe(1);
    expect(Number(damaged[0]!.quantity)).toBe(80);

    // Con số đem hứa với khách là 420, không phải 500.
    const usable = rows
      .filter((r) => r.condition === 'moi' || r.condition === 'con_dung_duoc')
      .reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(usable).toBe(420);
  });

  it('mất mát rời khỏi sổ và để lại biên bản có bên chịu trách nhiệm', async () => {
    const { error } = await kho.rpc('record_scaffolding_event', {
      p_asset_id: fixture.scaffoldingAssetId,
      p_event_type: 'mat_mat',
      p_quantity: 20,
      p_reason: 'Thiếu khi kiểm đếm thu hồi từ công trình B.',
      p_amount: 6_000_000,
      p_responsible_party: 'Tổ đội thi công B',
    });
    expect(error).toBeNull();

    const { data: source } = await kho
      .from('scaffolding_assets')
      .select('quantity')
      .eq('id', fixture.scaffoldingAssetId)
      .single();
    expect(Number((source as { quantity: string }).quantity)).toBe(400);

    const { data: events } = await kho
      .from('scaffolding_events')
      .select('event_type, quantity, responsible_party, amount')
      .eq('scaffolding_asset_id', fixture.scaffoldingAssetId)
      .eq('event_type', 'mat_mat');

    const rows = events as { responsible_party: string; amount: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.responsible_party).toMatch(/Tổ đội/);
    expect(BigInt(rows[0]!.amount)).toBe(6_000_000n);
  });
});

/**
 * Ba lỗi phát hiện khi rà soát `0039`, vá ở `0040`/`0041`. Cả ba đều không có triệu chứng cho
 * tới lúc kho thật sự dùng: một cái khoá cứng kho, một cái làm cảnh báo tồn không cấu hình
 * được, một cái bào mòn giá vốn và kéo theo sai cả cấp phê duyệt.
 */
describe('KHO — vá lỗi sau rà soát (0040, 0041)', () => {
  let fixture: Awaited<ReturnType<typeof seedFixture>>;
  let kho: SupabaseClient;
  let cfo: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    cfo = await signInAs(ACCOUNTS.cfo);
  });

  it('đếm KHỚP SỔ thì đóng được đợt, và kho mở lại nhập xuất', async () => {
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialThep, quantity: 500, unit_cost: 20_000 }],
    });
    const { data: id } = await kho.rpc('start_stocktake', { p_warehouse_id: fixture.warehouseB });

    // Đếm đúng bằng sổ — kết quả tốt nhất của một đợt kiểm kê.
    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: id as string,
      p_items: [{ material_id: fixture.materialThep, counted_quantity: 500 }],
    });

    // Trước bản vá đây là ngõ cụt: đường phê duyệt từ chối chênh lệch 0, mà không có hàm nào
    // đưa đợt kiểm ra khỏi `dang_kiem` — kho bị khoá nhập xuất vĩnh viễn.
    const { error } = await kho.rpc('close_stocktake', { p_stocktake_id: id as string });
    expect(error).toBeNull();

    const { data: st } = await kho
      .from('stocktakes')
      .select('status')
      .eq('id', id as string)
      .single();
    expect((st as { status: string }).status).toBe('khop_so');

    // Kho đã mở lại: đây là điều kiện thật sự quan trọng, không phải cái nhãn trạng thái.
    const { error: moveError } = await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialThep, quantity: 10, unit_cost: 20_000 }],
    });
    expect(moveError).toBeNull();
  });

  it('có chênh lệch thì KHÔNG đóng thẳng được — phải đi đường phê duyệt (KHO-07)', async () => {
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialThep, quantity: 100, unit_cost: 20_000 }],
    });
    const { data: id } = await kho.rpc('start_stocktake', { p_warehouse_id: fixture.warehouseA });
    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: id as string,
      p_items: [{ material_id: fixture.materialThep, counted_quantity: 60 }],
    });

    // Thiếu chốt này thì "Đóng đợt" thành đường tắt bỏ qua toàn bộ KHO-07: mất 40 tấn thép mà
    // không biên bản, không ai duyệt, sổ kho giữ nguyên số cũ.
    const { error } = await kho.rpc('close_stocktake', { p_stocktake_id: id as string });
    expect(error?.message).toMatch(/lệch|phê duyệt/i);

    await kho.rpc('cancel_stocktake', {
      p_stocktake_id: id as string,
      p_reason: 'Dọn dẹp sau kiểm thử.',
    });
  });

  it('mức tồn tối thiểu sửa được từ màn hình — cảnh báo sắp hết mới cấu hình được (KHO-08)', async () => {
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialBulong, quantity: 50, unit_cost: 12_000 }],
    });
    const { data: row } = await kho
      .from('inventory_items')
      .select('id')
      .eq('warehouse_id', fixture.warehouseA)
      .eq('material_id', fixture.materialBulong)
      .single();

    const { error } = await kho
      .from('inventory_items')
      .update({ min_quantity: 20, location: 'Kệ A3' })
      .eq('id', (row as { id: string }).id)
      .select('id')
      .single();
    expect(error).toBeNull();
  });

  it('nhưng số tồn và giá vốn vẫn KHÔNG sửa thẳng được — sổ kho chỉ đổi qua phiếu', async () => {
    const { data: row } = await kho
      .from('inventory_items')
      .select('id')
      .eq('warehouse_id', fixture.warehouseA)
      .eq('material_id', fixture.materialBulong)
      .single();

    const { error } = await kho
      .from('inventory_items')
      .update({ quantity_on_hand: 9999 })
      .eq('id', (row as { id: string }).id)
      .select('id')
      .single();
    expect(error).not.toBeNull();
  });

  it('điều chuyển giữ NGUYÊN giá vốn ở kho nhận — giá vốn đi theo hàng', async () => {
    // Bu lông chưa từng vào kho B, nên giá vốn ở đó do đúng phiếu điều chuyển này quyết định.
    // Dùng vật tư sạch là điểm mấu chốt: nếu kho nhận đã có tồn sẵn thì bình quân bị pha
    // loãng và phép thử "khác 0" vẫn đúng ngay cả khi bản vá bị gỡ.
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseA,
      p_items: [{ material_id: fixture.materialBulong, quantity: 100, unit_cost: 12_000 }],
    });

    const { error } = await kho.rpc('transfer_stock', {
      p_from_warehouse_id: fixture.warehouseA,
      p_to_warehouse_id: fixture.warehouseB,
      p_items: [{ material_id: fixture.materialBulong, quantity: 10 }],
    });
    expect(error).toBeNull();

    // Màn hình Phiếu kho chỉ hiện ô đơn giá cho phiếu NHẬP, nên phiếu điều chuyển luôn gửi lên
    // 0 — trước bản vá, chuyển hàng sang kho khác làm hàng mất sạch giá trị trong sổ.
    expect(await averageCost(fixture.warehouseB, fixture.materialBulong)).toBe(12_000n);
  });

  it('điều chỉnh kiểm kê tăng KHÔNG kéo giá vốn xuống — con số đó quyết định cấp phê duyệt', async () => {
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseC,
      p_items: [{ material_id: fixture.materialThep, quantity: 100, unit_cost: 200_000 }],
    });
    const { data: id } = await kho.rpc('start_stocktake', { p_warehouse_id: fixture.warehouseC });
    await kho.rpc('save_stocktake_count', {
      p_stocktake_id: id as string,
      p_items: [{ material_id: fixture.materialThep, counted_quantity: 110 }],
    });
    const { data: approvalId } = await kho.rpc('submit_stocktake_approval', {
      p_stocktake_id: id as string,
      p_variance_reason: 'Đếm sót ở lần kiểm trước.',
    });
    await cfo.rpc('decide_approval', {
      p_approval_id: approvalId as string,
      p_decision: 'approved',
      p_note: 'Đồng ý điều chỉnh.',
    });

    expect(await onHand(fixture.warehouseC, fixture.materialThep)).toBe(110);
    // Trước bản vá: (100×200.000 + 10×0) / 110 ≈ 181.818 đ, và mỗi lần kiểm kê lại tụt thêm.
    // Giá vốn thổi thấp đưa chênh lệch lớn lọt xuống dưới hạn mức phê duyệt của Kho.
    expect(await averageCost(fixture.warehouseC, fixture.materialThep)).toBe(200_000n);
  });

  /**
   * Phát hiện ở đợt rà 4B: `average_cost` từng đọc thẳng được qua vai trò `kho`, dù Thủ kho
   * không nằm trong danh sách được xem giá vốn (CLAUDE.md 6.6) — khoá ở `0064`, cùng chuẩn
   * với giá vốn dự toán (`estimate_cost_breakdown`).
   */
  it('Thủ kho không đọc thẳng được giá vốn tồn kho, Ban Giám đốc/Tài chính đọc được qua hàm', async () => {
    // Bu lông chưa từng vào kho C trong khối test này — như ghi chú `warehouseC` ở đầu tệp,
    // dùng cặp kho/vật tư sạch để phép thử không lẫn với bình quân của ca khác.
    await kho.rpc('receive_stock', {
      p_warehouse_id: fixture.warehouseC,
      p_items: [{ material_id: fixture.materialBulong, quantity: 5, unit_cost: 777_000 }],
    });

    const { error: selectError } = await kho
      .from('inventory_items')
      .select('average_cost')
      .eq('warehouse_id', fixture.warehouseC)
      .eq('material_id', fixture.materialBulong)
      .single();
    expect(selectError).toBeTruthy();
    expect(selectError!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);

    const { error: rpcErrorForKho } = await kho.rpc('inventory_items_cost', {
      p_warehouse_id: fixture.warehouseC,
    });
    expect(rpcErrorForKho).toBeTruthy();

    const { data: rows, error: rpcErrorForCfo } = await cfo.rpc('inventory_items_cost', {
      p_warehouse_id: fixture.warehouseC,
    });
    expect(rpcErrorForCfo).toBeNull();
    const found = (rows as { inventory_item_id: string; average_cost: string }[]).some(
      (r) => BigInt(r.average_cost) === 777_000n,
    );
    expect(found).toBe(true);
  });
});
