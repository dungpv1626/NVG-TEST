/**
 * Module KT — Kế toán và Tài chính: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD KT-01 → KT-10, Backend Schema 4.9.
 *
 * Sáu thứ được canh kỹ nhất, vì mất thứ nào cũng dẫn tới tiền ra sai hoặc số báo cáo sai:
 *  1. luồng duyệt chi bốn bước không có đường tắt (KT-01);
 *  2. chi phí gắn vào mã công trình ngay khi phát sinh, và KHÔNG bị đếm hai lần (KT-05);
 *  3. tạm ứng quá hạn chặn ứng tiếp, trừ khi nêu lý do (KT-03);
 *  4. số "đã thu" của hợp đồng chỉ đổi qua chứng từ thu (KT-04, HD-03);
 *  5. kỳ đã khóa là khóa thật (KT-09);
 *  6. công nợ và dòng tiền không hiển thị đại trà (KT-10).
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

const COST_CODE = 'KT-TEST-NC-01';
const BUDGETED = '500000000';

interface Fixture {
  nvcCompanyId: string;
  nvoCompanyId: string;
  nvcSiteId: string;
  budgetLineId: string;
  supplierId: string;
  customerId: string;
  contractId: string;
  congTruongUserId: string;
}

/**
 * Dựng bối cảnh bằng kết nối trực tiếp (vượt RLS): một công trình NVC có một dòng ngân sách,
 * một nhà cung cấp, và một hợp đồng đã ký để thử phần "đã thu" của HD-03.
 *
 * Đây là DỰNG BỐI CẢNH, không phải chạy luồng — luồng thật đã được chứng minh ở
 * `golden-path.test.ts` và `mh.test.ts` bằng đúng vai trò.
 */
async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const sites = await sql<{ id: string; company_id: string; code: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      SELECT c.id,
             c.code || '-CT-KTTEST-' || ${stamp},
             ${TEST_PREFIX + ' Công trình KT '} || c.code || ' ' || ${stamp},
             current_date + 120
        FROM companies c
       WHERE c.code IN ('NVC', 'NVO')
       RETURNING id, company_id, (SELECT code FROM companies WHERE id = company_id) AS code
    `;
    const byCode = new Map(sites.map((s) => [s.code, s]));
    const nvc = byCode.get('NVC')!;
    const nvo = byCode.get('NVO')!;

    const [bidding] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name, stage)
      VALUES (${nvc.company_id}, ${'NVC-DA-KTTEST-' + stamp},
              ${TEST_PREFIX + ' Gói thầu nền ngân sách KT ' + stamp}, 'da_duyet_gia')
      RETURNING id
    `;

    const [budget] = await sql<{ id: string }[]>`
      INSERT INTO project_budgets (company_id, bidding_project_id, construction_site_id,
                                   cost_group, cost_code, name, budgeted_amount)
      VALUES (${nvc.company_id}, ${bidding!.id}, ${nvc.id},
              'nhan_cong', ${COST_CODE}, ${TEST_PREFIX + ' Nhân công tổ đội'}, ${BUDGETED})
      RETURNING id
    `;

    const [supplier] = await sql<{ id: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class)
      VALUES (${'NCC-KT-' + stamp}, ${TEST_PREFIX + ' Nhà cung cấp KT ' + stamp}, 'chinh')
      RETURNING id
    `;

    const [customer] = await sql<{ id: string }[]>`
      INSERT INTO customers (code, name, source)
      VALUES (${'KH-KT-' + stamp}, ${TEST_PREFIX + ' Khách hàng KT ' + stamp}, 'Mời thầu')
      RETURNING id
    `;

    const [contract] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, customer_id, value, signed_date)
      VALUES (${nvc.company_id}, ${'NVC-HD-KTTEST-' + stamp},
              ${TEST_PREFIX + ' Hợp đồng thi công KT ' + stamp},
              'thi_cong', 'da_ky', ${customer!.id}, ${'1000000000'}, current_date)
      RETURNING id
    `;

    const [chiHuy] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.congTruongNvc}
    `;

    return {
      nvcCompanyId: nvc.company_id,
      nvoCompanyId: nvo.company_id,
      nvcSiteId: nvc.id,
      budgetLineId: budget!.id,
      supplierId: supplier!.id,
      customerId: customer!.id,
      contractId: contract!.id,
      congTruongUserId: chiHuy!.id,
    };
  } finally {
    await sql.end();
  }
}

async function budgetActual(id: string): Promise<bigint> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ actual_amount: string }[]>`
      SELECT actual_amount FROM project_budgets WHERE id = ${id}
    `;
    return BigInt(row!.actual_amount);
  } finally {
    await sql.end();
  }
}

async function contractCollected(id: string): Promise<bigint> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ collected_amount: string }[]>`
      SELECT collected_amount FROM contracts WHERE id = ${id}
    `;
    return BigInt(row!.collected_amount);
  } finally {
    await sql.end();
  }
}

async function stageOf(id: string): Promise<string> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ stage: string }[]>`
      SELECT stage FROM payment_requests WHERE id = ${id}
    `;
    return row!.stage;
  } finally {
    await sql.end();
  }
}

interface DraftOptions {
  client: SupabaseClient;
  fixture: Fixture;
  amount: bigint;
  title?: string;
  requestType?: 'thanh_toan' | 'tam_ung' | 'hoan_ung';
  originModule?: string;
  allocate?: boolean;
  siteId?: string | null;
  costCode?: string | null;
  advanceUserId?: string | null;
  advanceDueDate?: string | null;
  receivableId?: string | null;
  settlesAdvanceId?: string | null;
  purchaseOrderId?: string | null;
}

/** Tạo một đề nghị chi ở bước Nháp kèm một dòng phân bổ, bằng đúng vai trò của người gọi. */
async function draftRequest(options: DraftOptions): Promise<string> {
  const {
    client,
    fixture,
    amount,
    title = `${TEST_PREFIX} Đề nghị chi ${Date.now()}`,
    requestType = 'thanh_toan',
    originModule = 'TC',
    allocate = true,
    siteId = fixture.nvcSiteId,
    costCode = COST_CODE,
  } = options;

  const { data, error } = await client
    .from('payment_requests')
    .insert({
      company_id: fixture.nvcCompanyId,
      request_type: requestType,
      title,
      amount: amount.toString(),
      origin_module: originModule,
      department: 'Ban công trường',
      supplier_id: requestType === 'tam_ung' ? null : fixture.supplierId,
      advance_user_id: options.advanceUserId ?? null,
      advance_due_date: options.advanceDueDate ?? null,
      settles_advance_id: options.settlesAdvanceId ?? null,
      receivable_id: options.receivableId ?? null,
      due_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Không tạo được đề nghị chi: ${error.message}`);
  const id = (data as { id: string }).id;

  if (allocate) {
    const { error: allocError } = await client.from('payment_request_allocations').insert({
      payment_request_id: id,
      construction_site_id: siteId,
      cost_code: costCode,
      cost_group: 'nhan_cong',
      amount: amount.toString(),
    });
    if (allocError) throw new Error(`Không thêm được dòng phân bổ: ${allocError.message}`);
  }

  return id;
}

describeDb('KT — phạm vi xem dữ liệu tài chính (KT-10, NEN-07)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let kho: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    kho = await signInAs(ACCOUNTS.kho);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('vai trò anon không đọc được đề nghị chi', async () => {
    const { data, error } = await anonClient().from('payment_requests').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('vai trò anon không đọc được công nợ', async () => {
    const { data, error } = await anonClient().from('receivables_payables').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('Kho không mở được phân hệ Kế toán — công nợ khuất hoàn toàn (KT-10)', async () => {
    const { data } = await kho.from('receivables_payables').select('id').limit(1);
    expect(data).toEqual([]);
  });

  it('Ban công trường KHÔNG đọc được công nợ dù có quyền gửi đề nghị chi (KT-10)', async () => {
    // Quyền `view` trên phân hệ KT chỉ để họ theo dõi đề nghị của mình. Công nợ, dòng tiền
    // và lương vẫn nằm sau `rls_sees_finance`.
    const { data } = await chiHuy.from('receivables_payables').select('id').limit(1);
    expect(data).toEqual([]);

    const { data: plans } = await chiHuy.from('cash_flow_plans').select('id').limit(1);
    expect(plans).toEqual([]);
  });

  it('Ban công trường chỉ thấy đề nghị của CHÍNH MÌNH, không thấy của Kế toán', async () => {
    const hidden = await draftRequest({
      client: ketoan,
      fixture,
      amount: 12_000_000n,
      title: `${TEST_PREFIX} Đề nghị chi của Kế toán ${Date.now()}`,
      originModule: 'KT',
    });

    const mine = await draftRequest({
      client: chiHuy,
      fixture,
      amount: 8_000_000n,
      title: `${TEST_PREFIX} Đề nghị chi của công trường ${Date.now()}`,
    });

    const { data } = await chiHuy.from('payment_requests').select('id').in('id', [hidden, mine]);
    expect((data ?? []).map((r) => (r as { id: string }).id)).toEqual([mine]);
  });
});

describeDb('KT — luồng duyệt chi bốn bước (KT-01, KT-02)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;
  let cfo: SupabaseClient;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    cfo = await signInAs(ACCOUNTS.cfo);
    kho = await signInAs(ACCOUNTS.kho);
  });

  it('không đặt thẳng được trạng thái — mọi bước phải đi qua nút thao tác', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 5_000_000n });

    const { error } = await ketoan
      .from('payment_requests')
      .update({ stage: 'da_duyet' })
      .eq('id', id)
      .select('id')
      .single();

    expect(error).toBeTruthy();
    expect(await stageOf(id)).toBe('nhap');
  });

  it('không gửi đi được khi chưa phân bổ chi phí (KT-05)', async () => {
    const id = await draftRequest({
      client: ketoan,
      fixture,
      amount: 5_000_000n,
      allocate: false,
    });

    const { error } = await ketoan.rpc('submit_payment_request', { p_request_id: id });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('phân bổ');
  });

  it('không gửi đi được khi tổng phân bổ khác số tiền đề nghị', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 5_000_000n });

    await ketoan
      .from('payment_request_allocations')
      .update({ amount: '4000000' })
      .eq('payment_request_id', id);

    const { error } = await ketoan.rpc('submit_payment_request', { p_request_id: id });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('khác số tiền đề nghị');
  });

  it('không gửi đi được khi mã chi phí không có trong ngân sách công trình (KT-05)', async () => {
    const id = await draftRequest({
      client: ketoan,
      fixture,
      amount: 5_000_000n,
      costCode: 'KHONG-CO-TRONG-NGAN-SACH',
    });

    const { error } = await ketoan.rpc('submit_payment_request', { p_request_id: id });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('không có trong ngân sách');
  });

  it('sai người thì không xử lý được bước kiểm tra (KT-01)', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 5_000_000n });
    await ketoan.rpc('submit_payment_request', { p_request_id: id });
    expect(await stageOf(id)).toBe('cho_don_vi');

    // Kho không có quyền phê duyệt trên phân hệ Thi công — không phải "trưởng đơn vị" ở đây.
    const { error } = await kho.rpc('advance_payment_step', {
      p_request_id: id,
      p_decision: 'approved',
    });
    expect(error).toBeTruthy();
    expect(await stageOf(id)).toBe('cho_don_vi');
  });

  it('Kế toán không nhảy cóc được bước xác nhận của đơn vị', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 5_000_000n });
    await ketoan.rpc('submit_payment_request', { p_request_id: id });

    // Kế toán là người của bước 2, không phải bước 1.
    const { error } = await ketoan.rpc('advance_payment_step', {
      p_request_id: id,
      p_decision: 'approved',
    });
    expect(error).toBeTruthy();
    expect(await stageOf(id)).toBe('cho_don_vi');
  });

  it('trả lại ở bất kỳ bước nào cũng đưa hồ sơ về người đề nghị kèm lý do', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 5_000_000n });
    await ketoan.rpc('submit_payment_request', { p_request_id: id });

    const { error: noReason } = await chiHuy.rpc('advance_payment_step', {
      p_request_id: id,
      p_decision: 'rejected',
    });
    expect(noReason).toBeTruthy();

    await chiHuy.rpc('advance_payment_step', {
      p_request_id: id,
      p_decision: 'rejected',
      p_note: 'Khoản này đã nằm trong hợp đồng khoán của tổ đội.',
    });
    expect(await stageOf(id)).toBe('tu_choi');

    const { data } = await ketoan
      .from('payment_request_steps')
      .select('step, decision, note')
      .eq('payment_request_id', id);
    expect(data).toHaveLength(1);
    expect((data![0] as { step: string }).step).toBe('don_vi');
    expect((data![0] as { decision: string }).decision).toBe('rejected');
  });

  it('đi hết ba bước kiểm thì hồ sơ vào Hộp thư Phê duyệt theo hạn mức (KT-01)', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 50_000_000n });
    await ketoan.rpc('submit_payment_request', { p_request_id: id });

    await chiHuy.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    expect(await stageOf(id)).toBe('cho_ke_toan');

    await ketoan.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    expect(await stageOf(id)).toBe('cho_tai_chinh');

    await cfo.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    expect(await stageOf(id)).toBe('cho_phe_duyet');

    // Ba bước kiểm đều để lại dấu vết, không ghi đè lên nhau (Backend Schema 2.3).
    const { data: steps } = await ketoan
      .from('payment_request_steps')
      .select('step')
      .eq('payment_request_id', id);
    expect((steps ?? []).map((s) => (s as { step: string }).step).sort()).toEqual([
      'don_vi',
      'ke_toan',
      'tai_chinh',
    ]);

    // Hộp thư Phê duyệt: 50 triệu vượt hạn mức của Kế toán (10 triệu) nhưng nằm trong hạn
    // mức của Giám đốc Tài chính (200 triệu).
    const { data: ktInbox } = await ketoan.rpc('my_pending_approvals');
    expect((ktInbox ?? []).some((row: { entity_id: string }) => row.entity_id === id)).toBe(false);

    const { data: cfoInbox } = await cfo.rpc('my_pending_approvals');
    const mine = (cfoInbox ?? []).find((row: { entity_id: string }) => row.entity_id === id);
    expect(mine).toBeTruthy();
    expect((mine as { subject: string }).subject).toBe('payment_request');
  });
});

describeDb('KT — chi tiền, ngân sách và hạch toán (KT-01, KT-05)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;
  let cfo: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    cfo = await signInAs(ACCOUNTS.cfo);
  });

  /** Đưa một đề nghị đi hết ba bước kiểm và được phê duyệt. */
  async function approve(id: string): Promise<void> {
    await ketoan.rpc('submit_payment_request', { p_request_id: id });
    await chiHuy.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await ketoan.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await cfo.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });

    const { data } = await cfo
      .from('approvals')
      .select('id')
      .eq('entity_type', 'payment_requests')
      .eq('entity_id', id)
      .eq('status', 'pending_approval')
      .single();

    const { error } = await cfo.rpc('decide_approval', {
      p_approval_id: (data as { id: string }).id,
      p_decision: 'approved',
      p_note: 'Đủ chứng từ, dòng tiền tuần này đáp ứng được.',
    });
    if (error) throw new Error(`Không phê duyệt được: ${error.message}`);
  }

  it('phê duyệt xong mới ghi nhận chi được, và chi phí vào đúng mã công trình (KT-05)', async () => {
    const id = await draftRequest({ client: ketoan, fixture, amount: 30_000_000n });

    // Chưa duyệt thì không chi được, dù người gọi là Kế toán.
    const { error: tooEarly } = await ketoan.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: new Date().toISOString().slice(0, 10),
      p_method: 'chuyen_khoan',
    });
    expect(tooEarly).toBeTruthy();

    await approve(id);
    expect(await stageOf(id)).toBe('da_duyet');

    const before = await budgetActual(fixture.budgetLineId);

    const { error } = await ketoan.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: new Date().toISOString().slice(0, 10),
      p_method: 'chuyen_khoan',
      p_reference: 'UNC-2026-0001',
    });
    expect(error).toBeNull();
    expect(await stageOf(id)).toBe('da_chi');
    expect(await budgetActual(fixture.budgetLineId)).toBe(before + 30_000_000n);

    await ketoan.rpc('post_payment', { p_request_id: id, p_reference: 'MISA-PC-001' });
    expect(await stageOf(id)).toBe('da_hach_toan');
  });

  it('người đề nghị KHÔNG tự ghi nhận đã chi cho hồ sơ của mình (PRD 2.3)', async () => {
    const id = await draftRequest({ client: chiHuy, fixture, amount: 20_000_000n });
    await approve(id);

    const { error } = await chiHuy.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: new Date().toISOString().slice(0, 10),
      p_method: 'tien_mat',
    });
    expect(error).toBeTruthy();
    expect(await stageOf(id)).toBe('da_duyet');
  });

  it('khoản chi cho một đơn hàng KHÔNG cộng chi phí lần thứ hai (KT-05)', async () => {
    // Chi phí vật tư đã được ghi ở Module MH lúc hàng về. Ở đây chỉ là dòng tiền.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    let orderId: string;
    try {
      const stamp = String(Date.now());
      const [req] = await sql<{ id: string }[]>`
        INSERT INTO purchase_requests (company_id, code, title, stage, construction_site_id, cost_code)
        VALUES (${fixture.nvcCompanyId}, ${'NVC-DNM-KTTEST-' + stamp},
                ${TEST_PREFIX + ' Đề nghị mua nền KT ' + stamp}, 'da_duyet',
                ${fixture.nvcSiteId}, ${COST_CODE})
        RETURNING id
      `;
      const [order] = await sql<{ id: string }[]>`
        INSERT INTO purchase_orders (company_id, code, purchase_request_id, supplier_id, stage, total_value)
        VALUES (${fixture.nvcCompanyId}, ${'NVC-DH-KTTEST-' + stamp}, ${req!.id},
                ${fixture.supplierId}, 'da_giao_du', ${'25000000'})
        RETURNING id
      `;
      orderId = order!.id;
    } finally {
      await sql.end();
    }

    const id = await draftRequest({ client: ketoan, fixture, amount: 25_000_000n });
    const { createConnection: connect } = await import('../client');
    const { sql: sql2 } = connect();
    try {
      await sql2`UPDATE payment_requests SET purchase_order_id = ${orderId} WHERE id = ${id}`;
    } finally {
      await sql2.end();
    }

    await approve(id);
    const before = await budgetActual(fixture.budgetLineId);

    await ketoan.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: new Date().toISOString().slice(0, 10),
      p_method: 'chuyen_khoan',
    });

    expect(await stageOf(id)).toBe('da_chi');
    expect(await budgetActual(fixture.budgetLineId)).toBe(before);
  });
});

describeDb('KT — tạm ứng (KT-03)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;
  let cfo: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    cfo = await signInAs(ACCOUNTS.cfo);
  });

  it('tạm ứng phải có người nhận và hạn hoàn ứng', async () => {
    const id = await draftRequest({
      client: ketoan,
      fixture,
      amount: 10_000_000n,
      requestType: 'tam_ung',
    });

    const { error } = await ketoan.rpc('submit_payment_request', { p_request_id: id });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('người nhận tạm ứng');
  });

  it('còn khoản ứng quá hạn thì phải nêu lý do mới ứng tiếp được (KT-03)', async () => {
    // Dựng sẵn một khoản ứng đã quá hạn của chính người nhận.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [paid] = await sql<{ id: string }[]>`
        INSERT INTO payment_requests (company_id, code, request_type, title, stage, amount,
                                      advance_user_id, advance_due_date, paid_date, paid_amount)
        VALUES (${fixture.nvcCompanyId}, ${'NVC-DNTU-KTOLD-' + Date.now()}, 'tam_ung',
                ${TEST_PREFIX + ' Tạm ứng cũ quá hạn'}, 'da_hach_toan', ${'5000000'},
                ${fixture.congTruongUserId}, current_date - 30, current_date - 45, ${'5000000'})
        RETURNING id
      `;
      await sql`
        INSERT INTO advances (company_id, payment_request_id, user_id, purpose, amount,
                              advance_date, due_date, status)
        VALUES (${fixture.nvcCompanyId}, ${paid!.id}, ${fixture.congTruongUserId},
                ${TEST_PREFIX + ' Ứng mua vật tư lẻ'}, ${'5000000'},
                current_date - 45, current_date - 30, 'dang_no')
      `;
    } finally {
      await sql.end();
    }

    const blocked = await draftRequest({
      client: ketoan,
      fixture,
      amount: 7_000_000n,
      requestType: 'tam_ung',
      advanceUserId: fixture.congTruongUserId,
      advanceDueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });

    const { error } = await ketoan.rpc('submit_payment_request', { p_request_id: blocked });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('quá hạn');

    // Nêu lý do thì đi tiếp được — KT-03 cho phép "trừ trường hợp được người có thẩm quyền
    // phê duyệt", và lý do được đưa thẳng vào hồ sơ chờ duyệt.
    await ketoan
      .from('payment_requests')
      .update({ advance_override_reason: 'Công trường cần tiền mặt trả nhân công trong ngày.' })
      .eq('id', blocked);

    const { error: allowed } = await ketoan.rpc('submit_payment_request', {
      p_request_id: blocked,
    });
    expect(allowed).toBeNull();
    expect(await stageOf(blocked)).toBe('cho_don_vi');
  });

  it('tạm ứng đã chi sinh ra khoản nợ, và KHÔNG tính là chi phí công trình', async () => {
    const id = await draftRequest({
      client: ketoan,
      fixture,
      amount: 6_000_000n,
      requestType: 'tam_ung',
      advanceUserId: fixture.congTruongUserId,
      advanceDueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });
    await ketoan
      .from('payment_requests')
      .update({ advance_override_reason: 'Ứng trước cho đợt đổ bê tông cuối tuần.' })
      .eq('id', id);

    await ketoan.rpc('submit_payment_request', { p_request_id: id });
    await chiHuy.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await ketoan.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await cfo.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });

    const { data: approval } = await cfo
      .from('approvals')
      .select('id, subject')
      .eq('entity_type', 'payment_requests')
      .eq('entity_id', id)
      .single();
    // Tạm ứng dùng loại nghiệp vụ riêng để NVG đặt hạn mức khác được (NEN-02).
    expect((approval as { subject: string }).subject).toBe('advance');

    await cfo.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'approved',
      p_note: 'Đồng ý ứng, hoàn ứng trong tháng.',
    });

    const before = await budgetActual(fixture.budgetLineId);
    await ketoan.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: new Date().toISOString().slice(0, 10),
      p_method: 'tien_mat',
    });

    // Tiền ra khỏi quỹ nhưng chưa có chi phí nào phát sinh — người nhận còn nợ lại.
    expect(await budgetActual(fixture.budgetLineId)).toBe(before);

    const { data: advances } = await ketoan
      .from('advances')
      .select('id, amount, status')
      .eq('payment_request_id', id);
    expect(advances).toHaveLength(1);
    expect((advances![0] as { status: string }).status).toBe('dang_no');
  });
});

describeDb('KT — công nợ và số đã thu của hợp đồng (KT-04, HD-03)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;
  let receivableId: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);

    const { data, error } = await ketoan
      .from('receivables_payables')
      .insert({
        company_id: fixture.nvcCompanyId,
        direction: 'phai_thu',
        party_type: 'khach_hang',
        customer_id: fixture.customerId,
        contract_id: fixture.contractId,
        description: `${TEST_PREFIX} Đợt 1 — tạm ứng hợp đồng`,
        amount: '300000000',
        due_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      })
      .select('id')
      .single();
    if (error) throw new Error(`Không tạo được công nợ: ${error.message}`);
    receivableId = (data as { id: string }).id;
  });

  it('không sửa tay được số đã thu — nó là tổng của các chứng từ', async () => {
    const { error } = await ketoan
      .from('receivables_payables')
      .update({ settled_amount: '300000000' })
      .eq('id', receivableId)
      .select('id')
      .single();
    expect(error).toBeTruthy();
  });

  it('ghi chứng từ thu thì cập nhật cả công nợ lẫn số đã thu của hợp đồng (HD-03)', async () => {
    const before = await contractCollected(fixture.contractId);

    const { error } = await ketoan.rpc('record_receivable_settlement', {
      p_receivable_id: receivableId,
      p_settled_date: new Date().toISOString().slice(0, 10),
      p_amount: 120_000_000,
      p_method: 'chuyen_khoan',
      p_reference: 'BC-2026-0001',
    });
    expect(error).toBeNull();

    const { data } = await ketoan
      .from('receivables_payables')
      .select('settled_amount, settled_at')
      .eq('id', receivableId)
      .single();
    // PostgREST trả `bigint` dưới dạng số khi giá trị còn nằm trong khoảng an toàn của
    // JavaScript, nên so bằng `BigInt(...)` thay vì so chuỗi.
    expect(BigInt((data as { settled_amount: string | number }).settled_amount)).toBe(120_000_000n);
    expect((data as { settled_at: string | null }).settled_at).toBeNull();

    expect(await contractCollected(fixture.contractId)).toBe(before + 120_000_000n);
  });

  it('thu quá số còn nợ bị chặn — công nợ không được âm', async () => {
    const { error } = await ketoan.rpc('record_receivable_settlement', {
      p_receivable_id: receivableId,
      p_settled_date: new Date().toISOString().slice(0, 10),
      p_amount: 500_000_000,
      p_method: 'chuyen_khoan',
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('lớn hơn phần còn lại');
  });

  it('Ban công trường không ghi được chứng từ thu', async () => {
    const { error } = await chiHuy.rpc('record_receivable_settlement', {
      p_receivable_id: receivableId,
      p_settled_date: new Date().toISOString().slice(0, 10),
      p_amount: 1_000_000,
    });
    expect(error).toBeTruthy();
  });
});

describeDb('KT — khung tuổi nợ là cấu hình, không phải hằng số (KT-04)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);

    // Một khoản quá hạn 45 ngày: với mốc mặc định 30/60/90 nó nằm ở khung 31–60.
    await ketoan.from('receivables_payables').insert({
      company_id: fixture.nvcCompanyId,
      direction: 'phai_thu',
      party_type: 'khach_hang',
      customer_id: fixture.customerId,
      description: `${TEST_PREFIX} Khoản quá hạn 45 ngày`,
      amount: '90000000',
      due_date: new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10),
    });
  });

  it('bảng tuổi nợ chia theo đúng mốc đang cấu hình', async () => {
    const { data, error } = await ketoan.rpc('receivable_aging', {
      p_direction: 'phai_thu',
      p_company_id: fixture.nvcCompanyId,
    });
    expect(error).toBeNull();

    const rows = (data ?? []) as { code: string; total: number | string }[];
    // Khung "chưa đến hạn" luôn có mặt, kể cả khi không cấu hình gì.
    expect(rows.map((r) => r.code)).toContain('chua_den_han');

    const bucket = rows.find((r) => r.code === 'qua_31_60');
    expect(bucket).toBeTruthy();
    expect(BigInt(bucket!.total)).toBeGreaterThanOrEqual(90_000_000n);
  });

  it('đổi mốc trong cấu hình thì khoản nợ chuyển sang khung khác — không phải sửa mã', async () => {
    // NVG ban hành mốc chặt hơn cho một pháp nhân: 20 ngày là đã đáng lo.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await sql`
        INSERT INTO aging_buckets (company_id, code, label, position, from_days, to_days)
        VALUES (${fixture.nvcCompanyId}, 'nvc_gap', ${TEST_PREFIX + ' Quá hạn trên 20 ngày'},
                1, 20, NULL)
      `;
    } finally {
      await sql.end();
    }

    try {
      const { data } = await ketoan.rpc('receivable_aging', {
        p_direction: 'phai_thu',
        p_company_id: fixture.nvcCompanyId,
      });
      const rows = (data ?? []) as { code: string; total: number | string }[];

      // Mốc riêng của pháp nhân THAY THẾ mốc chung, không trộn: khung 31–60 biến mất hẳn.
      expect(rows.map((r) => r.code).sort()).toEqual(['chua_den_han', 'nvc_gap']);

      const bucket = rows.find((r) => r.code === 'nvc_gap');
      expect(BigInt(bucket!.total)).toBeGreaterThanOrEqual(90_000_000n);
    } finally {
      const { createConnection: connect } = await import('../client');
      const { sql: cleanup } = connect();
      try {
        await cleanup`DELETE FROM aging_buckets WHERE code = 'nvc_gap'`;
      } finally {
        await cleanup.end();
      }
    }
  });

  it('chỉ Tài chính cấp trên sửa được mốc — Kế toán và công trường thì không', async () => {
    // Đổi mốc là đổi cách đọc toàn bộ báo cáo công nợ của cả tập đoàn, ngang hàng với hạn mức
    // phê duyệt (NEN-02) chứ không phải một tuỳ chọn hiển thị.
    for (const client of [ketoan, chiHuy]) {
      const { error } = await client
        .from('aging_buckets')
        .insert({
          company_id: fixture.nvcCompanyId,
          code: `tu_dat_${Date.now()}`,
          label: `${TEST_PREFIX} Khung tự đặt`,
          position: 9,
          from_days: 5,
          to_days: null,
        })
        .select('id')
        .single();
      expect(error).toBeTruthy();
    }
  });

  it('Kho không đọc được cấu hình khung vì không có quyền xem phân hệ Kế toán', async () => {
    const kho = await signInAs(ACCOUNTS.kho);
    const { data } = await kho.from('aging_buckets').select('id').limit(1);
    expect(data).toEqual([]);
  });
});

describeDb('KT — kỳ kế toán (KT-09)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;
  let cfo: SupabaseClient;
  let periodId: string;
  let periodStart: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    cfo = await signInAs(ACCOUNTS.cfo);

    // Kỳ thử nằm ở QUÁ KHỨ XA để không khóa nhầm các phép thử khác đang ghi vào hôm nay.
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [row] = await sql<{ id: string; period_start: string }[]>`
        INSERT INTO accounting_periods (company_id, period_code, period_start, period_end, notes)
        VALUES (${fixture.nvcCompanyId},
                to_char(current_date - interval '13 months', 'YYYY-MM'),
                date_trunc('month', current_date - interval '13 months')::date,
                (date_trunc('month', current_date - interval '13 months')
                  + interval '1 month - 1 day')::date,
                ${TEST_PREFIX + ' Kỳ thử khóa sổ'})
        ON CONFLICT (company_id, period_code) DO UPDATE
          SET notes = EXCLUDED.notes, status = 'dang_mo'
        RETURNING id, period_start
      `;
      periodId = row!.id;
      periodStart = row!.period_start;
    } finally {
      await sql.end();
    }
  });

  it('Kế toán KHÔNG tự khóa kỳ — đó là quyết định của Tài chính', async () => {
    const { error } = await ketoan.rpc('close_accounting_period', { p_period_id: periodId });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('Trưởng Tài chính');
  });

  it('khóa kỳ rồi thì không ghi được khoản chi mang ngày trong kỳ đó', async () => {
    const { error: closeError } = await cfo.rpc('close_accounting_period', {
      p_period_id: periodId,
    });
    expect(closeError).toBeNull();

    const id = await draftRequest({ client: ketoan, fixture, amount: 9_000_000n });
    await ketoan.rpc('submit_payment_request', { p_request_id: id });
    await chiHuy.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await ketoan.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });
    await cfo.rpc('advance_payment_step', { p_request_id: id, p_decision: 'approved' });

    const { data: approval } = await cfo
      .from('approvals')
      .select('id')
      .eq('entity_type', 'payment_requests')
      .eq('entity_id', id)
      .single();
    await cfo.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'approved',
      p_note: 'Đồng ý chi.',
    });

    const { error } = await ketoan.rpc('record_payment', {
      p_request_id: id,
      p_paid_date: periodStart,
      p_method: 'chuyen_khoan',
    });
    expect(error).toBeTruthy();
    expect(error!.message).toContain('đã khóa');
    expect(await stageOf(id)).toBe('da_duyet');
  });

  it('mở lại kỳ đã khóa bắt buộc nêu nguyên nhân (KT-09)', async () => {
    const { error: noReason } = await cfo.rpc('reopen_accounting_period', {
      p_period_id: periodId,
      p_reason: '   ',
    });
    expect(noReason).toBeTruthy();

    const { error } = await cfo.rpc('reopen_accounting_period', {
      p_period_id: periodId,
      p_reason: 'Bổ sung hóa đơn về muộn của nhà cung cấp vật tư.',
    });
    expect(error).toBeNull();

    const { data } = await ketoan
      .from('accounting_periods')
      .select('status, reopen_reason, reopened_by')
      .eq('id', periodId)
      .single();
    expect((data as { status: string }).status).toBe('dang_mo');
    expect((data as { reopened_by: string | null }).reopened_by).toBeTruthy();
  });
});

describeDb('KT — dòng tiền (KT-06)', () => {
  let fixture: Fixture;
  let ketoan: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    ketoan = await signInAs(ACCOUNTS.ketoan);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('bảng dòng tiền chỉ trả về pháp nhân người dùng được xem', async () => {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    const { data, error } = await ketoan.rpc('cash_flow_current', { p_from: from, p_to: to });
    expect(error).toBeNull();

    const codes = (data ?? []).map((r: { company_code: string }) => r.company_code);
    // Tài khoản Kế toán được gán cả ba pháp nhân giao dịch, KHÔNG có mã tổng hợp NVG.
    expect(codes).not.toContain('NVG');
    expect(codes.length).toBeGreaterThan(0);
  });

  it('Ban công trường không đọc được kế hoạch dòng tiền (KT-10)', async () => {
    const { error } = await chiHuy.from('cash_flow_plans').insert({
      company_id: fixture.nvcCompanyId,
      period_type: 'thang',
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      opening_balance: '1000000',
    });
    expect(error).toBeTruthy();
  });
});
