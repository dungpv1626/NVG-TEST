/**
 * Module SX — Sản xuất và Cho thuê giàn giáo: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD SX-01 → SX-03, Backend Schema 4.12.
 *
 * Khảo sát Xưởng sản xuất giàn giáo đã có (02/09/2026, `doc/khao-sat/`). SX-01/SX-02 (định
 * mức, giá thành) vẫn chưa dựng — xem BUILD_PLAN 3F. Ở đây test ba bất biến của SX-03:
 *  1. Xuất/thu hồi giàn giáo LUÔN di chuyển đúng lô vật lý (không xuất quá tồn, không tự ý
 *     đổi `quantity`/`condition` bằng một câu UPDATE trần).
 *  2. Hai khách thuê cùng một loại giàn giáo KHÔNG bị gộp chung một lô.
 *  3. Khách trả NHIỀU ĐỢT: doanh thu cộng dồn theo số ngày thuê thật của từng đợt, hợp đồng
 *     chỉ đóng khi đã trả hết.
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
  /** Chỉ có lô tình trạng "mới" trong kho. */
  materialGiaoMoi: string;
  /** Tồn kho chia làm HAI lô khác tình trạng: 6 "còn dùng được" + 9 "mới". */
  materialGiaoHaiLo: string;
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
         ${TEST_PREFIX + ' Giáo nêm SX B ' + stamp}, 'bộ', true),
        (${'GIANGIAO-SXTEST-C-' + stamp}, 'GIANGIAO',
         ${TEST_PREFIX + ' Giáo nêm SX C ' + stamp}, 'bộ', true),
        (${'GIANGIAO-SXTEST-D-' + stamp}, 'GIANGIAO',
         ${TEST_PREFIX + ' Giáo nêm SX D ' + stamp}, 'bộ', true)
      RETURNING id
    `;

    // Lô "còn dùng được" VÀ lô "mới" đều cho thuê được (khảo sát Xưởng 02/09/2026) — vật tư
    // thứ ba chỉ có hàng mới, dùng để chứng minh điều đó.
    await sql`
      INSERT INTO scaffolding_assets (company_id, asset_code, material_id, quantity, condition, location_type)
      VALUES
        (${nvs!.id}, ${'TEST-SXTEST-A-' + stamp}, ${materials[0]!.id}, 100, 'con_dung_duoc', 'kho'),
        (${nvs!.id}, ${'TEST-SXTEST-B-' + stamp}, ${materials[1]!.id}, 50, 'con_dung_duoc', 'kho'),
        (${nvs!.id}, ${'TEST-SXTEST-C-' + stamp}, ${materials[2]!.id}, 40, 'moi', 'kho'),
        (${nvs!.id}, ${'TEST-SXTEST-D1-' + stamp}, ${materials[3]!.id}, 6, 'con_dung_duoc', 'kho'),
        (${nvs!.id}, ${'TEST-SXTEST-D2-' + stamp}, ${materials[3]!.id}, 9, 'moi', 'kho')
    `;

    return {
      nvsCompanyId: nvs!.id,
      customerId: customer!.id,
      materialGiao: materials[0]!.id,
      materialGiao2: materials[1]!.id,
      materialGiaoMoi: materials[2]!.id,
      materialGiaoHaiLo: materials[3]!.id,
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

  /*
   * Khảo sát Xưởng 02/09/2026: hàng mới kết thúc dây chuyền bằng "kiểm tra thành phẩm →
   * đếm, bó kiện, dán nhận diện → lập phiếu nhập kho thành phẩm", nên đã sẵn sàng cho thuê.
   * Giả định cũ ("lô mới coi như chưa phân loại xong") không có căn cứ.
   */
  it('lô tình trạng "mới" cho thuê được, và lô giao cho khách giữ nguyên tình trạng đó', async () => {
    const { data: agreementId, error } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-03-01',
      p_expected_end_date: '2026-03-10',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} hàng mới`,
      p_items: [{ material_id: fixture.materialGiaoMoi, quantity: 12, daily_rate: 1000 }],
    });
    expect(error).toBeNull();

    const { data: lots } = await kho
      .from('scaffolding_assets')
      .select('quantity, condition, location_type')
      .eq('current_rental_agreement_id', agreementId as string);
    expect(lots).toHaveLength(1);
    expect(lots![0]!.quantity).toBe(12);
    expect(lots![0]!.condition).toBe('moi');
    expect(lots![0]!.location_type).toBe('khach_thue');
  });

  /*
   * Khảo sát Xưởng 02/09/2026: "Nếu khách giao hoặc trả nhiều lần, tiền thuê phải tính riêng
   * theo từng đợt hoặc theo số dư hằng ngày." Bản trước bắt khai đủ MỌI loại trong một lần
   * gọi — đúng với giả định "khách trả một lần", sai với thực tế.
   */
  it('thu hồi nhiều đợt: doanh thu cộng dồn theo ngày thuê thật của từng đợt, đóng khi trả hết', async () => {
    const { data: agreementId } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-04-01',
      p_expected_end_date: '2026-04-30',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} trả nhiều đợt`,
      p_items: [
        { material_id: fixture.materialGiao, quantity: 10, daily_rate: 1000 },
        { material_id: fixture.materialGiao2, quantity: 5, daily_rate: 2000 },
      ],
    });

    // Đợt 1 — trả 4 cái loại A vào 05/04: 5 ngày (01/04 → 05/04) × 4 × 1000 = 20.000.
    const first = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-04-05',
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
    expect(first.error).toBeNull();

    const { data: midway } = await kho
      .from('rental_agreements')
      .select('status, total_revenue, actual_return_date')
      .eq('id', agreementId as string)
      .single();
    expect(midway!.status).toBe('dang_thue');
    expect(Number(midway!.total_revenue)).toBe(20_000);
    expect(midway!.actual_return_date).toBeNull();

    // Đợt 2 — trả nốt vào 10/04: 10 ngày × (6 × 1000 + 5 × 2000) = 10 × 16.000 = 160.000.
    const second = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-04-10',
      p_items: [
        {
          material_id: fixture.materialGiao,
          quantity_ok: 6,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
        {
          material_id: fixture.materialGiao2,
          quantity_ok: 4,
          quantity_damaged: 1,
          quantity_lost: 0,
          compensation_amount: 300_000,
        },
      ],
    });
    expect(second.error).toBeNull();

    const { data: closed } = await kho
      .from('rental_agreements')
      .select('status, total_revenue, total_compensation, actual_return_date')
      .eq('id', agreementId as string)
      .single();
    expect(closed!.status).toBe('da_thu_hoi');
    expect(Number(closed!.total_revenue)).toBe(180_000);
    expect(Number(closed!.total_compensation)).toBe(300_000);
    expect(closed!.actual_return_date).toBe('2026-04-10');

    // Trả thêm sau khi đã đóng thì bị chặn — không cộng thêm tiền thuê vào hợp đồng đã tất toán.
    const extra = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-04-12',
      p_items: [
        {
          material_id: fixture.materialGiao,
          quantity_ok: 1,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(extra.error).toBeTruthy();
  });

  /*
   * Một dòng thuê gom hàng từ nhiều lô kho thì bên khách cũng thành nhiều lô — `create_rental_
   * agreement` sinh một lô cho mỗi lô nguồn nó rút ra. Bản trước của `return_rental_agreement`
   * chỉ lấy lô ĐẦU TIÊN rồi báo "không đủ để trả": khách trả đủ hàng mà hệ thống từ chối.
   * Cho phép xuất cả lô "mới" khiến chuyện này dễ xảy ra hơn hẳn.
   */
  it('dòng thuê trải trên nhiều lô vẫn thu hồi được trọn vẹn', async () => {
    const { data: agreementId, error: createError } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-05-01',
      p_expected_end_date: '2026-05-10',
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} hai lô nguồn`,
      // 12 bộ = 6 của lô "còn dùng được" + 6 của lô "mới".
      p_items: [{ material_id: fixture.materialGiaoHaiLo, quantity: 12, daily_rate: 1000 }],
    });
    expect(createError).toBeNull();

    const { data: lots } = await kho
      .from('scaffolding_assets')
      .select('quantity, condition')
      .eq('current_rental_agreement_id', agreementId as string);
    expect(lots).toHaveLength(2);

    const { error: returnError } = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-05-06',
      p_items: [
        {
          material_id: fixture.materialGiaoHaiLo,
          quantity_ok: 12,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(returnError).toBeNull();

    const { data: agreement } = await kho
      .from('rental_agreements')
      .select('status, total_revenue')
      .eq('id', agreementId as string)
      .single();
    expect(agreement!.status).toBe('da_thu_hoi');
    // 6 ngày (01/05 → 06/05) × 12 × 1000.
    expect(Number(agreement!.total_revenue)).toBe(72_000);

    const { data: emptied } = await kho
      .from('scaffolding_assets')
      .select('quantity')
      .eq('current_rental_agreement_id', agreementId as string);
    expect(emptied!.every((l) => Number(l.quantity) === 0)).toBe(true);
  });

  it('trả vượt số còn lại của một dòng thuê bị chặn, và không ghi nhận gì cả', async () => {
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

    // Dòng đầu hợp lệ, dòng sau vượt số đã thuê — cả hai cùng bị rollback trong MỘT giao
    // dịch, kể cả dòng hợp lệ. Đây là bất biến giữ nguyên từ trước khi cho trả nhiều đợt.
    const { error: overError } = await kho.rpc('return_rental_agreement', {
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
        {
          material_id: fixture.materialGiao2,
          quantity_ok: 99,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(overError).toBeTruthy();

    const { data: afterFailure } = await kho
      .from('rental_agreements')
      .select('status, total_revenue')
      .eq('id', agreementId as string)
      .single();
    expect(afterFailure!.status).toBe('dang_thue');
    expect(Number(afterFailure!.total_revenue)).toBe(0);

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
