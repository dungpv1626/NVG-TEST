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

    // 0143: đợt trả một phần ĐÃ vào báo cáo doanh thu theo đúng ngày trả, không đợi trả hết.
    const { data: financeMidway, error: financeError } = await ketoan.rpc('finance_daily', {
      p_from: '2026-04-05',
      p_to: '2026-04-05',
      p_company_id: fixture.nvsCompanyId,
    });
    expect(financeError).toBeNull();
    const rentalOn = (rows: unknown) =>
      ((rows ?? []) as { rental_revenue: string | number }[]).reduce(
        (sum, r) => sum + Number(r.rental_revenue),
        0,
      );
    expect(rentalOn(financeMidway)).toBeGreaterThanOrEqual(20_000);

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

    // Mỗi đợt một dòng, đúng ngày và đúng tiền của đợt; tổng khớp số cộng dồn trên hợp đồng.
    const { data: returns, error: returnsError } = await kho
      .from('rental_returns')
      .select('return_date, revenue, compensation')
      .eq('rental_agreement_id', agreementId as string)
      .order('return_date');
    expect(returnsError).toBeNull();
    expect(
      (returns ?? []).map((r) => [r.return_date, Number(r.revenue), Number(r.compensation)]),
    ).toEqual([
      ['2026-04-05', 20_000, 0],
      ['2026-04-10', 160_000, 300_000],
    ]);

    // Trình duyệt không tự ghi được đợt trả — chỉ hàm nghiệp vụ.
    const { error: forgeError } = await kho.from('rental_returns').insert({
      company_id: fixture.nvsCompanyId,
      rental_agreement_id: agreementId as string,
      return_date: '2026-04-11',
      revenue: 999_999,
    });
    expect(forgeError).toBeTruthy();

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

/** Ảnh PNG 1×1 — đủ làm «chữ ký» cho phép thử tải tệp. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function uploadSignature(client: SupabaseClient, path: string) {
  return client.storage
    .from('rental-return-docs')
    .upload(path, TINY_PNG, { contentType: 'image/png', upsert: false });
}

describeDb('SX — biên bản thu hồi ký hai bên, đối soát và tất toán với Kế toán (0145)', () => {
  let fixture: Fixture;
  let xuong: SupabaseClient;
  let ketoan: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    xuong = await signInAs(ACCOUNTS.xuongNvs);
    ketoan = await signInAs(ACCOUNTS.ketoan);
  });

  async function rentAndReturnAll(deposit: number) {
    const { data: agreementId, error } = await xuong.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: '2026-05-01',
      p_expected_end_date: '2026-05-31',
      p_deposit_amount: deposit,
      p_notes: `${TEST_PREFIX} biên bản thu hồi`,
      p_items: [{ material_id: fixture.materialGiao, quantity: 10, daily_rate: 1000 }],
    });
    expect(error).toBeNull();
    // 01/05 → 05/05 = 5 ngày × 10 × 1.000 = 50.000 đồng.
    const returned = await xuong.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: '2026-05-05',
      p_items: [
        {
          material_id: fixture.materialGiao,
          quantity_ok: 10,
          quantity_damaged: 0,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(returned.error).toBeNull();
    const { data: rr } = await xuong
      .from('rental_returns')
      .select('id, code, signed_at, receivable_id')
      .eq('rental_agreement_id', agreementId as string)
      .single();
    return { agreementId: agreementId as string, rentalReturn: rr! };
  }

  it('mỗi đợt trả là một biên bản có mã BBTH và dòng hàng của riêng đợt, chờ ký', async () => {
    const { rentalReturn } = await rentAndReturnAll(0);
    expect(rentalReturn.code).toMatch(/^NVS-BBTH-2026-\d{4}$/);
    expect(rentalReturn.signed_at).toBeNull();

    const { data: lines, error } = await xuong
      .from('rental_return_items')
      .select('material_id, quantity_ok, rental_days, daily_rate, revenue')
      .eq('rental_return_id', rentalReturn.id);
    expect(error).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines![0]!.rental_days).toBe(5);
    expect(Number(lines![0]!.revenue)).toBe(50_000);
  });

  it('ký: thiếu chữ ký bị từ chối; tệp phải nằm dưới thư mục của đúng biên bản', async () => {
    const { rentalReturn } = await rentAndReturnAll(0);

    const missing = await xuong.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Nguyễn Văn Khách',
    });
    expect(missing.error).toBeTruthy();

    // Không tải được tệp vào thư mục của một biên bản khác (không tồn tại).
    const stray = await uploadSignature(xuong, `${crypto.randomUUID()}/chu-ky-khach/a.png`);
    expect(stray.error).toBeTruthy();

    // Đường dẫn trỏ vào tệp chưa tải lên thì không ký được.
    const ghost = await xuong.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Nguyễn Văn Khách',
      p_customer_signature_path: `${rentalReturn.id}/chu-ky-khach/khong-co.png`,
      p_nvg_signature_path: `${rentalReturn.id}/chu-ky-nvg/khong-co.png`,
    });
    expect(ghost.error).toBeTruthy();
  });

  it('ký xong: biên bản khoá, Kế toán nhận đúng một khoản phải thu; Kế toán không ký thay được', async () => {
    const { agreementId, rentalReturn } = await rentAndReturnAll(0);
    const customerPath = `${rentalReturn.id}/chu-ky-khach/${crypto.randomUUID()}.png`;
    const nvgPath = `${rentalReturn.id}/chu-ky-nvg/${crypto.randomUUID()}.png`;
    expect((await uploadSignature(xuong, customerPath)).error).toBeNull();
    expect((await uploadSignature(xuong, nvgPath)).error).toBeNull();

    const byAccountant = await ketoan.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Nguyễn Văn Khách',
      p_customer_signature_path: customerPath,
      p_nvg_signature_path: nvgPath,
    });
    expect(byAccountant.error).toBeTruthy();

    const signed = await xuong.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Nguyễn Văn Khách',
      p_customer_signature_path: customerPath,
      p_nvg_signature_path: nvgPath,
    });
    expect(signed.error).toBeNull();

    const again = await xuong.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Người khác',
      p_customer_signature_path: customerPath,
      p_nvg_signature_path: nvgPath,
    });
    expect(again.error).toBeTruthy();

    // Kế toán đọc được hợp đồng thuê và biên bản để đối soát (trước 0145 chỉ SX, CRM).
    const { data: seen } = await ketoan
      .from('rental_agreements')
      .select('id')
      .eq('id', agreementId);
    expect(seen).toHaveLength(1);
    const { data: bb } = await ketoan
      .from('rental_returns')
      .select('signed_at, customer_representative, receivable_id')
      .eq('id', rentalReturn.id)
      .single();
    expect(bb!.signed_at).not.toBeNull();
    expect(bb!.customer_representative).toBe('Nguyễn Văn Khách');

    const { data: receivables } = await ketoan
      .from('receivables_payables')
      .select('id, direction, amount, customer_id, rental_return_id')
      .eq('rental_agreement_id', agreementId);
    expect(receivables).toHaveLength(1);
    expect(receivables![0]!.id).toBe(bb!.receivable_id);
    expect(receivables![0]!.direction).toBe('phai_thu');
    expect(Number(receivables![0]!.amount)).toBe(50_000);
    expect(receivables![0]!.customer_id).toBe(fixture.customerId);

    // Không tải thêm tệp vào biên bản đã ký.
    const late = await uploadSignature(xuong, `${rentalReturn.id}/bien-ban-giay/late.png`);
    expect(late.error).toBeTruthy();

    // Nội dung đã ký không đổi được, kể cả bằng kết nối trực tiếp (Backend Schema 3.5).
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await expect(
        sql`UPDATE rental_returns SET revenue = 1 WHERE id = ${rentalReturn.id}`,
      ).rejects.toThrow(/đã ký/);
    } finally {
      await sql.end();
    }
  });

  it('ảnh biên bản giấy đã ký thay được chữ ký trên màn hình', async () => {
    const { rentalReturn } = await rentAndReturnAll(0);
    const scan = `${rentalReturn.id}/bien-ban-giay/${crypto.randomUUID()}.png`;
    expect((await uploadSignature(xuong, scan)).error).toBeNull();
    const signed = await xuong.rpc('sign_rental_return', {
      p_rental_return_id: rentalReturn.id,
      p_customer_representative: 'Trần Thị Bên Thuê',
      p_paper_scan_path: scan,
    });
    expect(signed.error).toBeNull();
  });

  it('tất toán: chỉ Kế toán, chỉ khi mọi biên bản đã ký; cọc cấn trừ phải thu, cọc thừa thành phải trả', async () => {
    const { agreementId, rentalReturn } = await rentAndReturnAll(80_000);

    const early = await ketoan.rpc('settle_rental_agreement', {
      p_rental_agreement_id: agreementId,
    });
    expect(early.error?.message).toMatch(/chưa ký/);

    const scan = `${rentalReturn.id}/bien-ban-giay/${crypto.randomUUID()}.png`;
    expect((await uploadSignature(xuong, scan)).error).toBeNull();
    expect(
      (
        await xuong.rpc('sign_rental_return', {
          p_rental_return_id: rentalReturn.id,
          p_customer_representative: 'Trần Thị Bên Thuê',
          p_paper_scan_path: scan,
        })
      ).error,
    ).toBeNull();

    const byWorkshop = await xuong.rpc('settle_rental_agreement', {
      p_rental_agreement_id: agreementId,
    });
    expect(byWorkshop.error).toBeTruthy();

    const settled = await ketoan.rpc('settle_rental_agreement', {
      p_rental_agreement_id: agreementId,
    });
    expect(settled.error).toBeNull();

    const { data: agreement } = await ketoan
      .from('rental_agreements')
      .select('settled_at, settlement_deposit_offset, settlement_refund')
      .eq('id', agreementId)
      .single();
    expect(agreement!.settled_at).not.toBeNull();
    expect(Number(agreement!.settlement_deposit_offset)).toBe(50_000);
    expect(Number(agreement!.settlement_refund)).toBe(30_000);

    const { data: rows } = await ketoan
      .from('receivables_payables')
      .select('direction, amount, settled_amount')
      .eq('rental_agreement_id', agreementId)
      .order('direction');
    expect(rows!.map((r) => [r.direction, Number(r.amount), Number(r.settled_amount)])).toEqual([
      ['phai_thu', 50_000, 50_000],
      ['phai_tra', 30_000, 0],
    ]);

    const twice = await ketoan.rpc('settle_rental_agreement', {
      p_rental_agreement_id: agreementId,
    });
    expect(twice.error).toBeTruthy();

    // Không tự đánh dấu tất toán bằng một câu UPDATE trần.
    const { error: forge } = await xuong
      .from('rental_agreements')
      .update({ settled_at: new Date().toISOString() })
      .eq('id', agreementId);
    expect(forge).toBeTruthy();
  });
});

describeDb('Kho — sổ giàn giáo tại một ngày (0146)', () => {
  let fixture: Fixture;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    kho = await signInAs(ACCOUNTS.kho);
  });

  interface LedgerRow {
    material_id: string;
    location_type: string;
    condition: string;
    rental_agreement_code: string | null;
    quantity: string | number;
  }

  async function asOf(date: string): Promise<LedgerRow[]> {
    const { data, error } = await kho.rpc('scaffolding_ledger_as_of', {
      p_date: date,
      p_company_id: fixture.nvsCompanyId,
    });
    expect(error).toBeNull();
    return (data ?? []) as LedgerRow[];
  }

  const sum = (rows: LedgerRow[], pick: (r: LedgerRow) => boolean) =>
    rows.filter(pick).reduce((s, r) => s + Number(r.quantity), 0);

  it('ngày trước mốc mở sổ bị từ chối, không trả số ước lượng', async () => {
    const { data: start } = await kho.rpc('scaffolding_ledger_start');
    const before = new Date(`${start as string}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    const { error } = await kho.rpc('scaffolding_ledger_as_of', {
      p_date: before.toISOString().slice(0, 10),
    });
    expect(error?.message).toMatch(/bắt đầu ghi/);
  });

  it('xuất cho thuê và thu hồi ghi vào sổ theo ngày nghiệp vụ của chứng từ', async () => {
    const material = fixture.materialGiao2;
    // 0256: ngày trả thực tế không được sau hôm nay (giờ Việt Nam) — dùng các ngày đã qua, sau mốc mở sổ
    // (trước đây năm 2090).
    const vnDay = (offset: number): string => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
        new Date(),
      );
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const [D09, D10, D14, D15, D31] = [vnDay(-5), vnDay(-4), vnDay(-2), vnDay(-1), vnDay(20)];

    const { data: agreementId, error } = await kho.rpc('create_rental_agreement', {
      p_company_id: fixture.nvsCompanyId,
      p_customer_id: fixture.customerId,
      p_construction_site_id: null,
      p_site_address: null,
      p_start_date: D10,
      p_expected_end_date: D31,
      p_deposit_amount: 0,
      p_notes: `${TEST_PREFIX} sổ theo ngày`,
      p_items: [{ material_id: material, quantity: 5, daily_rate: 1000 }],
    });
    expect(error).toBeNull();
    const { data: agreement } = await kho
      .from('rental_agreements')
      .select('code')
      .eq('id', agreementId as string)
      .single();
    const code = agreement!.code as string;

    // Ghi nhận hôm nay nhưng hàng về kho ngày D15 — sổ ngày D14 phải còn thấy ở khách.
    const returned = await kho.rpc('return_rental_agreement', {
      p_rental_agreement_id: agreementId,
      p_actual_return_date: D15,
      p_items: [
        {
          material_id: material,
          quantity_ok: 2,
          quantity_damaged: 1,
          quantity_lost: 0,
          compensation_amount: 0,
        },
      ],
    });
    expect(returned.error).toBeNull();

    const atRenter = (rows: LedgerRow[]) =>
      sum(rows, (r) => r.rental_agreement_code === code && r.location_type === 'khach_thue');
    const inStock = (rows: LedgerRow[], condition: string) =>
      sum(
        rows,
        (r) => r.material_id === material && r.location_type === 'kho' && r.condition === condition,
      );

    const d09 = await asOf(D09);
    const d10 = await asOf(D10);
    const d14 = await asOf(D14);
    const d15 = await asOf(D15);

    expect(atRenter(d09)).toBe(0);
    expect(atRenter(d10)).toBe(5);
    expect(atRenter(d14)).toBe(5);
    expect(atRenter(d15)).toBe(2);

    const usable = (rows: LedgerRow[]) => inStock(rows, 'con_dung_duoc');
    expect(usable(d10)).toBe(usable(d09) - 5);
    expect(usable(d15)).toBe(usable(d14) + 2);
    expect(inStock(d15, 'hong_cho_sua')).toBe(inStock(d14, 'hong_cho_sua') + 1);

    // Sổ chỉ đọc từ trình duyệt.
    const { error: forge } = await kho.from('scaffolding_ledger_entries').insert({
      company_id: fixture.nvsCompanyId,
      scaffolding_asset_id: crypto.randomUUID(),
      asset_code: 'X',
      material_id: material,
      condition: 'moi',
      location_type: 'kho',
      quantity_delta: 1000,
      effective_date: '2090-01-01',
      source: 'phat_sinh',
    });
    expect(forge).toBeTruthy();
  });
});
