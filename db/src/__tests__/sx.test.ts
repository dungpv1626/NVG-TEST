/**
 * Module SX — Sản xuất và Cho thuê giàn giáo: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD SX-01 → SX-03, Backend Schema 4.12.
 *
 * ⚠️ Module ĐỊNH HƯỚNG (PRD Mục 10) — SX-01/SX-02 (lệnh sản xuất, giá thành) chưa có khảo sát
 * trực tiếp Xưởng giàn giáo, nên chỉ test CRUD cơ bản. SX-03 (cho thuê) đã đủ thông tin nên
 * test đúng hai bất biến quan trọng nhất:
 *  1. Xuất/thu hồi giàn giáo LUÔN di chuyển đúng lô vật lý (không xuất quá tồn, không tự ý
 *     đổi `quantity`/`condition` bằng một câu UPDATE trần).
 *  2. Hai khách thuê cùng một loại giàn giáo KHÔNG bị gộp chung một lô.
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
  nvsCompanyId: string;
  customerId: string;
  materialGiao: string;
  materialGiao2: string;
}

/** Dựng bối cảnh bằng kết nối trực tiếp (vượt RLS): một khách hàng và hai lô giàn giáo NVS. */
async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const [nvs] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVS'`;

    const [customer] = await sql<{ id: string }[]>`
      INSERT INTO customers (code, name)
      VALUES (${'SXTEST-KH-' + stamp}, ${TEST_PREFIX + ' Khách thuê giàn giáo ' + stamp})
      RETURNING id
    `;

    const materials = await sql<{ id: string }[]>`
      INSERT INTO materials (code, group_code, name, unit, is_scaffolding)
      VALUES
        (${'GIANGIAO-SXTEST-A-' + stamp}, 'GIANGIAO',
         ${TEST_PREFIX + ' Giáo nêm SX A ' + stamp}, 'bộ', true),
        (${'GIANGIAO-SXTEST-B-' + stamp}, 'GIANGIAO',
         ${TEST_PREFIX + ' Giáo nêm SX B ' + stamp}, 'bộ', true)
      RETURNING id
    `;

    // Chỉ lô tình trạng "còn dùng được" mới cho thuê được — xem create_rental_agreement.
    await sql`
      INSERT INTO scaffolding_assets (company_id, asset_code, material_id, quantity, condition, location_type)
      VALUES
        (${nvs!.id}, ${'TEST-SXTEST-A-' + stamp}, ${materials[0]!.id}, 100, 'con_dung_duoc', 'kho'),
        (${nvs!.id}, ${'TEST-SXTEST-B-' + stamp}, ${materials[1]!.id}, 50, 'con_dung_duoc', 'kho')
    `;

    return {
      nvsCompanyId: nvs!.id,
      customerId: customer!.id,
      materialGiao: materials[0]!.id,
      materialGiao2: materials[1]!.id,
    };
  } finally {
    await sql.end();
  }
}

/** Tồn "còn dùng được" ở kho cho một vật tư — đọc trực tiếp để không phụ thuộc quyền. */
async function khoUsableQuantity(companyId: string, materialId: string): Promise<number> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const rows = await sql<{ total: string | null }[]>`
      SELECT SUM(quantity)::text AS total FROM scaffolding_assets
       WHERE company_id = ${companyId} AND material_id = ${materialId}
         AND location_type = 'kho' AND condition = 'con_dung_duoc' AND deleted_at IS NULL
    `;
    return Number(rows[0]?.total ?? 0);
  } finally {
    await sql.end();
  }
}

describeDb('SX — cho thuê giàn giáo: xuất và thu hồi (SX-03)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  it('vai trò anon không đọc được hợp đồng thuê', async () => {
    const { data, error } = await anonClient().from('rental_agreements').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('vai trò không có quyền SX không lập được hợp đồng thuê', async () => {
    const { error } = await ketoan.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: 'Công trình thử',
      p_start_date: '2026-01-10',
      p_expected_end_date: '2026-01-20',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} không quyền`,
      p_items: [{ material_id: fixture.materialGiao, quantity: 10, daily_rate: 5000 }],
    });
    expect(error).toBeTruthy();
  });

  it('không chèn thẳng được vào rental_agreements — phải qua hàm nghiệp vụ', async () => {
    const { error } = await kho.from('rental_agreements').insert({
      company_id: fixture.nvsCompanyId,
      code: `HDT-TU-DAT-${Date.now()}`,
      customer_id: fixture.customerId,
      start_date: '2026-01-10',
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('xuất giàn giáo cho thuê trừ đúng tồn kho và gắn đúng lô cho hợp đồng', async () => {
    const before = await khoUsableQuantity(fixture.nvsCompanyId, fixture.materialGiao);

    const { data: agreementId, error } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: 'Công trình khách A',
      p_start_date: '2026-01-10',
      p_expected_end_date: '2026-01-20',
      p_deposit_amount: 2_000_000,
      p_notes: `${TEST_PREFIX} hợp đồng A`,
      p_items: [{ material_id: fixture.materialGiao, quantity: 30, daily_rate: 5_000 }],
    });
    expect(error).toBeNull();
    expect(agreementId).toBeTruthy();

    const after = await khoUsableQuantity(fixture.nvsCompanyId, fixture.materialGiao);
    expect(after).toBe(before - 30);

    const { data: lots } = await kho
      .from('scaffolding_assets')
      .select('quantity, location_type, current_rental_agreement_id')
      .eq('current_rental_agreement_id', agreementId as string);
    expect(lots).toHaveLength(1);
    expect(lots![0]!.quantity).toBe(30);
    expect(lots![0]!.location_type).toBe('khach_thue');
  });

  it('xuất vượt tồn "còn dùng được" bị chặn và không đổi gì', async () => {
    const before = await khoUsableQuantity(fixture.nvsCompanyId, fixture.materialGiao2);

    const { error } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-01-10',
      p_expected_end_date: null,
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} vượt tồn`,
      p_items: [{ material_id: fixture.materialGiao2, quantity: before + 1000, daily_rate: 1000 }],
    });
    expect(error).toBeTruthy();

    const after = await khoUsableQuantity(fixture.nvsCompanyId, fixture.materialGiao2);
    expect(after).toBe(before);
  });

  it('hai khách thuê cùng vật tư KHÔNG bị gộp chung một lô', async () => {
    const { data: agreementIdA } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-02-01',
      p_expected_end_date: '2026-02-10',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} khách A gộp-lô`,
      p_items: [{ material_id: fixture.materialGiao2, quantity: 5, daily_rate: 1000 }],
    });

    const { data: agreementIdB } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-02-01',
      p_expected_end_date: '2026-02-10',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} khách B gộp-lô`,
      p_items: [{ material_id: fixture.materialGiao2, quantity: 7, daily_rate: 1000 }],
    });

    expect(agreementIdA).not.toBe(agreementIdB);

    const { data: lotsA } = await kho
      .from('scaffolding_assets')
      .select('quantity')
      .eq('current_rental_agreement_id', agreementIdA as string);
    const { data: lotsB } = await kho
      .from('scaffolding_assets')
      .select('quantity')
      .eq('current_rental_agreement_id', agreementIdB as string);

    expect(lotsA).toHaveLength(1);
    expect(lotsB).toHaveLength(1);
    expect(lotsA![0]!.quantity).toBe(5);
    expect(lotsB![0]!.quantity).toBe(7);

    // Thu hồi hợp đồng A không đụng vào lô của B.
    const { error: returnError } = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementIdA,
      p_actual_return_date: '2026-02-05',
      p_items: [
        {
          material_id: fixture.materialGiao2,
          quantity_ok: 5,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(returnError).toBeNull();

    const { data: lotsBAfter } = await kho
      .from('scaffolding_assets')
      .select('quantity')
      .eq('current_rental_agreement_id', agreementIdB as string);
    expect(lotsBAfter![0]!.quantity).toBe(7);
  });

  it('không tự đổi trạng thái hợp đồng bằng một câu UPDATE trần', async () => {
    const { data: agreementId } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-03-01',
      p_expected_end_date: '2026-03-10',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} chặn update trạng thái`,
      p_items: [{ material_id: fixture.materialGiao, quantity: 2, daily_rate: 1000 }],
    });

    const { error } = await kho
      .from('rental_agreements')
      .update({ status: 'da_thu_hoi' })
      .eq('id', agreementId as string);
    expect(error).toBeTruthy();

    // Nhưng ghi chú vẫn sửa trực tiếp được — không mọi cột đều bị khoá.
    const { error: notesError } = await kho
      .from('rental_agreements')
      .update({ notes: `${TEST_PREFIX} đã sửa ghi chú` })
      .eq('id', agreementId as string);
    expect(notesError).toBeNull();
  });

  it('thu hồi phải khai đủ mọi loại giàn giáo đã thuê mới đóng được hợp đồng', async () => {
    const { data: agreementId } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-01-01',
      p_expected_end_date: '2026-01-05',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} hai loại`,
      p_items: [
        { material_id: fixture.materialGiao, quantity: 4, daily_rate: 2000 },
        { material_id: fixture.materialGiao2, quantity: 3, daily_rate: 3000 },
      ],
    });

    const { error: partialError } = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-01-03',
      p_items: [
        {
          material_id: fixture.materialGiao,
          quantity_ok: 4,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(partialError).toBeTruthy();

    const { data: statusAfterPartial } = await kho
      .from('rental_agreements')
      .select('status')
      .eq('id', agreementId as string)
      .single();
    // Cả hai dòng đều bị RAISE EXCEPTION rollback trong CÙNG một giao dịch — kể cả dòng đầu
    // (giàn giáo A) cũng KHÔNG được ghi nhận đã trả.
    expect(statusAfterPartial!.status).toBe('dang_thue');

    const { error: fullError, data: fullResult } = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-01-04',
      p_items: [
        {
          material_id: fixture.materialGiao,
          quantity_ok: 4,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
        {
          material_id: fixture.materialGiao2,
          quantity_ok: 1,
          quantity_damaged: 1,
          quantity_lost: 1,
          compensation_amount: 500_000,
          note: `${TEST_PREFIX} hư hỏng và mất`,
        },
      ],
    });
    expect(fullError).toBeNull();
    expect(fullResult).toBe(agreementId);

    const { data: agreement } = await kho
      .from('rental_agreements')
      .select('status, total_compensation, total_revenue')
      .eq('id', agreementId as string)
      .single();
    expect(agreement!.status).toBe('da_thu_hoi');
    expect(Number(agreement!.total_compensation)).toBe(500_000);
    // 4 ngày (01/01 → 04/01) × (4×2000 + 3×3000) = 4 × 17000 = 68000.
    expect(Number(agreement!.total_revenue)).toBe(68_000);
  });
});

describeDb('SX — lệnh sản xuất (SX-01, cần xác nhận thêm)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  it('vai trò có quyền SX tạo được lệnh sản xuất và ghi tiêu hao nguyên liệu', async () => {
    const { data: order, error } = await kho
      .from('production_orders')
      .insert({
        company_id: fixture.nvsCompanyId,
        code: `LSX-TEST-${Date.now()}`,
        product: `${TEST_PREFIX} Giáo nêm 1.5m`,
        unit: 'bộ',
        quantity: 20,
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    const { error: consumptionError } = await kho.from('material_consumption').insert({
      production_order_id: order!.id,
      material_id: fixture.materialGiao,
      quantity: 15,
    });
    expect(consumptionError).toBeNull();
  });

  it('vai trò không có quyền SX không tạo được lệnh sản xuất', async () => {
    const { error } = await ketoan.from('production_orders').insert({
      company_id: fixture.nvsCompanyId,
      code: `LSX-TU-DAT-${Date.now()}`,
      product: `${TEST_PREFIX} không quyền`,
      quantity: 1,
    });
    expect(error).toBeTruthy();
  });
});
