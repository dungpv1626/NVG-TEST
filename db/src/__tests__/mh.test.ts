/**
 * Module MH — Mua hàng và Vật tư: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD MH-01 → MH-08, Backend Schema 4.7, Tech Stack 3.6.
 *
 * Bốn thứ được canh kỹ nhất, vì mất thứ nào cũng là mất tiền thật:
 *  1. không đặt hàng trước rồi trình duyệt sau (MH-02);
 *  2. chọn nhà cung cấp đắt hơn phải nêu căn cứ (MH-04);
 *  3. tiền vào ngân sách công trình đúng lúc và đúng số (TC-05, KT-05);
 *  4. không nhận nhiều hơn số đã đặt (MH-07).
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { standardizeQuotationCost } from '@nvg/shared';
import {
  ACCOUNTS,
  anonClient,
  hasCredentials,
  PG_INSUFFICIENT_PRIVILEGE,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const COST_CODE = 'VT-TEST-01';
const BUDGETED = '1000000000';

interface Fixture {
  nvcCompanyId: string;
  nvoCompanyId: string;
  nvcSiteId: string;
  nvoSiteId: string;
  budgetLineId: string;
  supplierA: string;
  supplierB: string;
  supplierStopped: string;
}

/**
 * Dựng bối cảnh bằng kết nối trực tiếp (vượt RLS): một công trình NVC có sẵn một dòng ngân
 * sách, một công trình NVO để thử ranh giới pháp nhân, và ba nhà cung cấp.
 *
 * Đây là DỰNG BỐI CẢNH chứ không phải chạy luồng — luồng thật "hợp đồng ký → mở công trình
 * → sinh ngân sách" đã được chứng minh ở `golden-path.test.ts` bằng đúng vai trò.
 */
async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const sites = await sql<{ id: string; company_id: string; code: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      SELECT c.id,
             c.code || '-CT-MHTEST-' || ${stamp},
             ${TEST_PREFIX + ' Công trình MH '} || c.code || ' ' || ${stamp},
             current_date + 120
        FROM companies c
       WHERE c.code IN ('NVC', 'NVO')
       RETURNING id, company_id, (SELECT code FROM companies WHERE id = company_id) AS code
    `;
    const byCode = new Map(sites.map((s) => [s.code, s]));
    const nvc = byCode.get('NVC')!;
    const nvo = byCode.get('NVO')!;

    // Ngân sách phải treo vào một hồ sơ cha (ràng buộc `project_budgets_one_owner`), nên
    // dựng kèm một gói thầu tối thiểu. Xoá gói thầu sẽ kéo theo ngân sách (CASCADE).
    const [bidding] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name, stage)
      VALUES (${nvc.company_id}, ${'NVC-DA-MHTEST-' + stamp},
              ${TEST_PREFIX + ' Gói thầu nền ngân sách MH ' + stamp}, 'da_duyet_gia')
      RETURNING id
    `;

    const [budget] = await sql<{ id: string }[]>`
      INSERT INTO project_budgets (company_id, bidding_project_id, construction_site_id,
                                   cost_group, cost_code, name, budgeted_amount)
      VALUES (${nvc.company_id}, ${bidding!.id}, ${nvc.id},
              'vat_tu', ${COST_CODE}, ${TEST_PREFIX + ' Vật tư chính'}, ${BUDGETED})
      RETURNING id
    `;

    const suppliers = await sql<{ id: string; code: string }[]>`
      INSERT INTO suppliers (code, name, supplier_class, suspended_reason)
      VALUES
        (${'NCC-A-' + stamp}, ${TEST_PREFIX + ' Nhà cung cấp A ' + stamp}, 'chinh', NULL),
        (${'NCC-B-' + stamp}, ${TEST_PREFIX + ' Nhà cung cấp B ' + stamp}, 'du_phong', NULL),
        (${'NCC-X-' + stamp}, ${TEST_PREFIX + ' Nhà cung cấp X ' + stamp}, 'ngung_giao_dich',
         ${'Giao sai quy cách hai lần liên tiếp.'})
      RETURNING id, code
    `;

    return {
      nvcCompanyId: nvc.company_id,
      nvoCompanyId: nvo.company_id,
      nvcSiteId: nvc.id,
      nvoSiteId: nvo.id,
      budgetLineId: budget!.id,
      supplierA: suppliers[0]!.id,
      supplierB: suppliers[1]!.id,
      supplierStopped: suppliers[2]!.id,
    };
  } finally {
    await sql.end();
  }
}

/** Số tiền của một dòng ngân sách, đọc qua kết nối trực tiếp để không phụ thuộc quyền. */
async function budgetLine(id: string): Promise<{ actual: bigint; committed: bigint }> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const [row] = await sql<{ actual_amount: string; committed_amount: string }[]>`
      SELECT actual_amount, committed_amount FROM project_budgets WHERE id = ${id}
    `;
    return { actual: BigInt(row!.actual_amount), committed: BigInt(row!.committed_amount) };
  } finally {
    await sql.end();
  }
}

/** Đưa một dòng ngân sách về 0 để phép so trước–sau của test kế tiếp không bị nhiễu. */
async function resetBudgetLine(id: string): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`UPDATE project_budgets SET actual_amount = 0, committed_amount = 0 WHERE id = ${id}`;
  } finally {
    await sql.end();
  }
}

interface RequestOptions {
  companyId: string;
  siteId?: string | null;
  costCode?: string | null;
  title?: string;
  items?: { name: string; unit: string; quantity: number; price: number }[];
}

/** Tạo một đề nghị mua kèm dòng hàng bằng đúng tài khoản đang đăng nhập. */
async function createRequest(client: SupabaseClient, opts: RequestOptions): Promise<string> {
  const { data, error } = await client
    .from('purchase_requests')
    .insert({
      company_id: opts.companyId,
      title: `${TEST_PREFIX} ${opts.title ?? 'Đề nghị mua thép'} ${Date.now()}`,
      construction_site_id: opts.siteId ?? null,
      cost_code: opts.costCode === undefined ? COST_CODE : opts.costCode,
      needed_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      delivery_location: 'Công trường',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Không tạo được đề nghị mua: ${error.message}`);
  const id = (data as { id: string }).id;

  const items = opts.items ?? [
    { name: 'Thép hộp 50x50', unit: 'kg', quantity: 1000, price: 20_000 },
  ];
  if (items.length > 0) {
    const { error: itemError } = await client.from('purchase_request_items').insert(
      items.map((item, index) => ({
        purchase_request_id: id,
        position: index + 1,
        item_code: `VT-TEST-${index + 1}`,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        estimated_unit_price: item.price,
      })),
    );
    if (itemError) throw new Error(`Không thêm được dòng đề nghị: ${itemError.message}`);
  }
  return id;
}

/** Gửi phê duyệt rồi duyệt luôn bằng Tổng Giám đốc (không giới hạn hạn mức). */
async function approveRequest(mh: SupabaseClient, tgd: SupabaseClient, requestId: string) {
  const { error } = await mh.rpc('submit_purchase_request_approval', { p_request_id: requestId });
  if (error) throw new Error(`Không gửi phê duyệt được: ${error.message}`);

  const { data } = await tgd
    .from('approvals')
    .select('id')
    .eq('entity_type', 'purchase_requests')
    .eq('entity_id', requestId)
    .eq('status', 'pending_approval')
    .single();

  const { error: decideError } = await tgd.rpc('decide_approval', {
    p_approval_id: (data as { id: string }).id,
    p_decision: 'approved',
    p_note: 'Đồng ý mua theo tiến độ thi công.',
  });
  if (decideError) throw new Error(`Không duyệt được: ${decideError.message}`);
}

interface QuoteOptions {
  supplierId: string;
  unitPrice: number;
  quantity?: number;
  taxRateBp?: number;
  wastageRateBp?: number;
  shippingFee?: number;
  deliveryDays?: number;
  warrantyMonths?: number;
}

/** Nhập một báo giá đầy đủ (kèm dòng hàng) cho một đề nghị. */
async function addQuotation(
  mh: SupabaseClient,
  companyId: string,
  requestId: string,
  opts: QuoteOptions,
): Promise<string> {
  const { data, error } = await mh
    .from('quotations')
    .insert({
      company_id: companyId,
      purchase_request_id: requestId,
      supplier_id: opts.supplierId,
      status: 'da_nhan',
      quoted_date: new Date().toISOString().slice(0, 10),
      tax_rate_bp: opts.taxRateBp ?? 1000,
      wastage_rate_bp: opts.wastageRateBp ?? 0,
      shipping_fee: opts.shippingFee ?? 0,
      delivery_days: opts.deliveryDays ?? 7,
      warranty_months: opts.warrantyMonths ?? 12,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Không nhập được báo giá: ${error.message}`);
  const id = (data as { id: string }).id;

  const { error: itemError } = await mh.from('quotation_items').insert({
    quotation_id: id,
    item_code: 'VT-TEST-1',
    name: 'Thép hộp 50x50',
    unit: 'kg',
    quantity: opts.quantity ?? 1000,
    unit_price: opts.unitPrice,
  });
  if (itemError) throw new Error(`Không nhập được dòng báo giá: ${itemError.message}`);
  return id;
}

describeDb('MH — phạm vi pháp nhân và quyền xem phân hệ', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let chiHuy: SupabaseClient;
  let kho: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    kho = await signInAs(ACCOUNTS.kho);
  });

  it('vai trò anon không đọc được đề nghị mua', async () => {
    const { data, error } = await anonClient().from('purchase_requests').select('*').limit(1);
    if (error) expect(error.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
    else expect(data).toEqual([]);
  });

  it('Ban công trường gửi được đề nghị mua vật tư phát sinh (TC-03)', async () => {
    const id = await createRequest(chiHuy, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Vật tư phát sinh từ công trường',
    });
    expect(id).toBeTruthy();
  });

  it('người đề nghị lấy từ phiên đăng nhập, không nhận từ trình duyệt (MH-01)', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data: tgdUser } = await tgd
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.tgd)
      .single();

    // Cố tình khai người đề nghị là Tổng Giám đốc.
    const { data, error } = await chiHuy
      .from('purchase_requests')
      .insert({
        company_id: fixture.nvcCompanyId,
        title: `${TEST_PREFIX} Đề nghị mạo danh ${Date.now()}`,
        needed_date: new Date().toISOString().slice(0, 10),
        requested_by: (tgdUser as { id: string }).id,
      })
      .select('requested_by')
      .single();

    expect(error).toBeNull();
    expect((data as { requested_by: string }).requested_by).not.toBe(
      (tgdUser as { id: string }).id,
    );
  });

  it('pháp nhân khác KHÔNG thấy đề nghị mua (Mẫu A, NEN-01)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvoCompanyId,
      siteId: fixture.nvoSiteId,
      costCode: null,
      title: 'Đề nghị của NVO',
    });

    const { data } = await chiHuy.from('purchase_requests').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('Kho XEM được đề nghị mua nhưng KHÔNG soạn được (Webapp Flow 2.3)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Đề nghị cho Kho xem',
    });

    const { data } = await kho.from('purchase_requests').select('id').eq('id', id).maybeSingle();
    expect(data).toBeTruthy();

    const { error } = await kho.from('purchase_requests').insert({
      company_id: fixture.nvcCompanyId,
      title: `${TEST_PREFIX} Kho tự soạn ${Date.now()}`,
    });
    expect(error).toBeTruthy();
  });

  it('không gắn được đề nghị mua vào công trình của pháp nhân khác (NEN-01)', async () => {
    // Biết `uuid` của công trình NVO là đủ để thử — RLS chỉ giấu nó khỏi danh sách, không tự
    // chặn việc gán. Không có điều kiện ở policy thì tiền đơn hàng NVC sẽ cộng vào ngân sách
    // của NVO, sai P&L của cả hai công ty.
    const { error } = await muaHang.from('purchase_requests').insert({
      company_id: fixture.nvcCompanyId,
      title: `${TEST_PREFIX} Đề nghị trỏ sang pháp nhân khác ${Date.now()}`,
      construction_site_id: fixture.nvoSiteId,
      needed_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).toBeTruthy();
  });

  it('không xóa hẳn được đề nghị mua (Backend Schema 1.4)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Đề nghị không xóa được',
    });
    const { error } = await muaHang.from('purchase_requests').delete().eq('id', id);
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });
});

describeDb('MH — duyệt theo hạn mức trước khi mua (MH-02)', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let tgd: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    tgd = await signInAs(ACCOUNTS.tgd);
  });

  it('đề nghị chưa có mặt hàng nào thì không gửi phê duyệt được', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      items: [],
    });
    const { error } = await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });
    expect(error?.message).toMatch(/mặt hàng/i);
  });

  it('đề nghị gắn công trình mà thiếu mã chi phí thì không gửi được (KT-05)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      costCode: null,
    });
    const { error } = await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });
    expect(error?.message).toMatch(/mã chi phí/i);
  });

  it('mã chi phí không có trong ngân sách công trình thì không gửi được', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      costCode: 'KHONG-CO-TRONG-NGAN-SACH',
    });
    const { error } = await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });
    expect(error?.message).toMatch(/không có trong ngân sách/i);
  });

  it('vượt hạn mức thì Mua hàng KHÔNG tự duyệt được, Tổng Giám đốc thì được (MH-02)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      // 200 triệu — vượt hạn mức 10 triệu của vai trò Mua hàng (DEFAULT_APPROVAL_LIMITS).
      items: [{ name: 'Thép tấm', unit: 'kg', quantity: 10_000, price: 20_000 }],
    });
    await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });

    const { data: approval } = await muaHang
      .from('approvals')
      .select('id, amount')
      .eq('entity_id', id)
      .single();
    expect(BigInt((approval as { amount: string }).amount)).toBe(200_000_000n);

    const { error: selfError } = await muaHang.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'approved',
    });
    expect(selfError?.message).toMatch(/hạn mức/i);

    const { error: tgdError } = await tgd.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'approved',
      p_note: 'Đồng ý theo tiến độ.',
    });
    expect(tgdError).toBeNull();

    const { data: after } = await muaHang
      .from('purchase_requests')
      .select('stage, approved_at')
      .eq('id', id)
      .single();
    expect((after as { stage: string }).stage).toBe('da_duyet');
  });

  it('bị từ chối thì về bước Bị từ chối kèm lý do, và sửa lại được (MH-02)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
    });
    await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });

    const { data: approval } = await muaHang
      .from('approvals')
      .select('id')
      .eq('entity_id', id)
      .single();

    const { error: noReason } = await tgd.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'rejected',
    });
    expect(noReason?.message).toMatch(/lý do/i);

    await tgd.rpc('decide_approval', {
      p_approval_id: (approval as { id: string }).id,
      p_decision: 'rejected',
      p_note: 'Vật tư này còn tồn ở kho công trình.',
    });

    const { data: after } = await muaHang
      .from('purchase_requests')
      .select('stage, closed_reason')
      .eq('id', id)
      .single();
    expect((after as { stage: string }).stage).toBe('tu_choi');
    expect((after as { closed_reason: string }).closed_reason).toMatch(/còn tồn/i);

    // Bị từ chối vẫn sửa lại được để gửi lần nữa — khác hẳn "đã hủy".
    const { error: editError } = await muaHang
      .from('purchase_requests')
      .update({ notes: 'Đã kiểm tra lại tồn kho, vẫn cần mua.' })
      .eq('id', id);
    expect(editError).toBeNull();
  });

  it('hủy đề nghị đang chờ duyệt để lại dấu vết ai hủy và vì sao', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
    });
    await muaHang.rpc('submit_purchase_request_approval', { p_request_id: id });

    const { data: approval } = await muaHang
      .from('approvals')
      .select('id')
      .eq('entity_id', id)
      .single();
    const approvalId = (approval as { id: string }).id;

    const { error } = await muaHang.rpc('cancel_purchase_request', {
      p_request_id: id,
      p_reason: 'Công trường báo còn tồn đủ dùng.',
    });
    expect(error).toBeNull();

    // Hồ sơ biến khỏi Hộp thư Phê duyệt...
    const { data: after } = await muaHang
      .from('approvals')
      .select('status')
      .eq('id', approvalId)
      .single();
    expect((after as { status: string }).status).toBe('completed');

    // ...nhưng lịch sử vẫn nói ai đóng và vì sao, chứ không phải một hồ sơ "bị từ chối" vô chủ.
    const { data: decisions } = await muaHang
      .from('approval_decisions')
      .select('note, decided_by')
      .eq('approval_id', approvalId);
    expect((decisions as { note: string }[]).length).toBe(1);
    expect((decisions as { note: string }[])[0]!.note).toMatch(/Người đề nghị hủy/);
  });

  it('không tự đặt đề nghị sang Đã duyệt bằng một câu UPDATE — bỏ qua cả hạn mức', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
    });
    const { error } = await muaHang
      .from('purchase_requests')
      .update({ stage: 'da_duyet' })
      .eq('id', id);
    expect(error).toBeTruthy();
  });

  it('đã duyệt rồi thì không sửa được số lượng nữa', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
    });
    await approveRequest(muaHang, tgd, id);

    const { data: item } = await muaHang
      .from('purchase_request_items')
      .select('id')
      .eq('purchase_request_id', id)
      .single();

    const { error } = await muaHang
      .from('purchase_request_items')
      .update({ quantity: 999_999 })
      .eq('id', (item as { id: string }).id);
    // RLS lọc dòng ra khỏi tầm với: không lỗi, nhưng cũng không sửa được gì.
    expect(error).toBeNull();

    const { data: after } = await muaHang
      .from('purchase_request_items')
      .select('quantity')
      .eq('id', (item as { id: string }).id)
      .single();
    expect(Number((after as { quantity: string }).quantity)).toBe(1000);
  });
});

describeDb('MH — so sánh báo giá và chọn nhà cung cấp (MH-04)', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let tgd: SupabaseClient;
  let chiHuy: SupabaseClient;
  let requestId: string;
  let cheapQuote: string;
  let pricierQuote: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    tgd = await signInAs(ACCOUNTS.tgd);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);

    requestId = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'So sánh báo giá',
    });
    await approveRequest(muaHang, tgd, requestId);

    cheapQuote = await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierA,
      unitPrice: 20_000,
      wastageRateBp: 250,
      shippingFee: 2_000_000,
      deliveryDays: 15,
      warrantyMonths: 6,
    });
    // Đắt hơn SAU KHI chuẩn hóa, không chỉ đắt hơn ở đơn giá: 25 triệu + 10% thuế =
    // 27,5 triệu, so với 24,55 triệu của báo giá A (đã gồm hao hụt 2,5% và 2 triệu vận
    // chuyển). Đây đúng là tình huống MH-04 nói tới — rẻ nhất ở cột đơn giá chưa chắc rẻ
    // nhất ở tổng chi phí, và ngược lại.
    pricierQuote = await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierB,
      unitPrice: 25_000,
      wastageRateBp: 0,
      shippingFee: 0,
      deliveryDays: 3,
      warrantyMonths: 24,
    });
  });

  it('công thức chuẩn hóa của CSDL khớp từng đồng với công thức trên màn hình', async () => {
    const { data, error } = await muaHang.rpc('compare_quotations', { p_request_id: requestId });
    expect(error).toBeNull();

    const rows = data as {
      quotation_id: string;
      goods_subtotal: string;
      wastage_amount: string;
      tax_amount: string;
      landed_total: string;
      cost_rank: number;
      cost_gap_vs_lowest: string;
    }[];
    expect(rows).toHaveLength(2);

    const fromDb = rows.find((r) => r.quotation_id === cheapQuote)!;
    const fromShared = standardizeQuotationCost({
      subtotal: 1000n * 20_000n,
      wastageRateBp: 250,
      taxRateBp: 1000,
      shippingFee: 2_000_000n,
    });

    expect(BigInt(fromDb.wastage_amount)).toBe(fromShared.wastageAmount);
    expect(BigInt(fromDb.tax_amount)).toBe(fromShared.taxAmount);
    expect(BigInt(fromDb.landed_total)).toBe(fromShared.landedTotal);
    expect(rows[0]!.cost_rank).toBe(1);
    expect(BigInt(rows[0]!.cost_gap_vs_lowest)).toBe(0n);
  });

  it('chọn báo giá KHÔNG rẻ nhất mà không nêu căn cứ thì bị chặn (MH-04)', async () => {
    const { error } = await muaHang.rpc('select_quotation', { p_quotation_id: pricierQuote });
    expect(error?.message).toMatch(/căn cứ chọn/i);
  });

  it('nêu căn cứ thì chọn được báo giá đắt hơn, và các báo giá còn lại chuyển sang không chọn', async () => {
    const { error } = await muaHang.rpc('select_quotation', {
      p_quotation_id: pricierQuote,
      p_reason: 'Giao trong 3 ngày, kịp tiến độ đổ sàn; bảo hành 24 tháng.',
    });
    expect(error).toBeNull();

    const { data } = await muaHang
      .from('quotations')
      .select('id, status, selection_reason')
      .eq('purchase_request_id', requestId);

    const rows = data as { id: string; status: string; selection_reason: string | null }[];
    expect(rows.find((r) => r.id === pricierQuote)!.status).toBe('duoc_chon');
    expect(rows.find((r) => r.id === pricierQuote)!.selection_reason).toMatch(/3 ngày/);
    expect(rows.find((r) => r.id === cheapQuote)!.status).toBe('khong_chon');
  });

  it('Ban công trường KHÔNG mở được bảng so sánh báo giá (NEN-07)', async () => {
    const { error } = await chiHuy.rpc('compare_quotations', { p_request_id: requestId });
    expect(error?.message).toMatch(/Ban Giám đốc|Mua hàng/i);
  });

  it('Ban công trường chỉ thấy báo giá ĐƯỢC CHỌN, không thấy các báo giá còn lại', async () => {
    const { data } = await chiHuy
      .from('quotations')
      .select('id, status')
      .eq('purchase_request_id', requestId);

    const rows = data as { id: string; status: string }[];
    expect(rows.map((r) => r.id)).toEqual([pricierQuote]);
  });

  it('không chọn được báo giá của nhà cung cấp đã ngừng giao dịch (MH-03)', async () => {
    const otherRequest = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Báo giá của nhà cung cấp đã dừng',
    });
    await approveRequest(muaHang, tgd, otherRequest);

    const quote = await addQuotation(muaHang, fixture.nvcCompanyId, otherRequest, {
      supplierId: fixture.supplierStopped,
      unitPrice: 18_000,
    });

    const { error } = await muaHang.rpc('select_quotation', { p_quotation_id: quote });
    expect(error?.message).toMatch(/ngừng giao dịch/i);
  });

  it('báo giá mới không tự khai là đã được chọn', async () => {
    const { error } = await muaHang.from('quotations').insert({
      company_id: fixture.nvcCompanyId,
      purchase_request_id: requestId,
      supplier_id: fixture.supplierStopped,
      status: 'duoc_chon',
    });
    expect(error).toBeTruthy();
  });
});

describeDb('MH — đơn đặt hàng và ngân sách công trình (MH-06, TC-05)', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let tgd: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    tgd = await signInAs(ACCOUNTS.tgd);
  });

  it('chưa được phê duyệt thì KHÔNG lập được đơn đặt hàng (MH-02)', async () => {
    const id = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
    });
    // Báo giá chỉ nhập được sau khi duyệt, nên ở đây chặn ngay từ bước nhập báo giá.
    const { error } = await muaHang.from('quotations').insert({
      company_id: fixture.nvcCompanyId,
      purchase_request_id: id,
      supplier_id: fixture.supplierA,
      status: 'da_nhan',
    });
    expect(error).toBeTruthy();
  });

  it('không INSERT thẳng được vào đơn đặt hàng', async () => {
    const { error } = await muaHang.from('purchase_orders').insert({
      company_id: fixture.nvcCompanyId,
      purchase_request_id: fixture.nvcSiteId,
      supplier_id: fixture.supplierA,
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('lập đơn hàng cộng đúng giá trị vào phần ĐÃ CAM KẾT của ngân sách công trình', async () => {
    await resetBudgetLine(fixture.budgetLineId);
    const before = await budgetLine(fixture.budgetLineId);

    const requestId = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Đơn hàng ghi cam kết',
    });
    await approveRequest(muaHang, tgd, requestId);
    const quote = await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierA,
      unitPrice: 20_000,
      taxRateBp: 1000,
    });
    await muaHang.rpc('select_quotation', { p_quotation_id: quote });

    const { data, error } = await muaHang.rpc('create_purchase_order', {
      p_quotation_id: quote,
      p_promised_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(error).toBeNull();

    const { data: order } = await muaHang
      .from('purchase_orders')
      .select('total_value, stage, committed_to_budget, code')
      .eq('id', data as string)
      .single();

    // 1000 kg × 20.000 = 20 triệu, thuế 10% = 2 triệu → 22 triệu.
    const total = BigInt((order as { total_value: string }).total_value);
    expect(total).toBe(22_000_000n);
    expect((order as { stage: string }).stage).toBe('da_dat');
    expect((order as { code: string }).code).toMatch(/^NVC-DH-\d{4}-\d{4}$/);

    const after = await budgetLine(fixture.budgetLineId);
    expect(after.committed - before.committed).toBe(total);
    expect(after.actual).toBe(before.actual);

    const { data: req } = await muaHang
      .from('purchase_requests')
      .select('stage')
      .eq('id', requestId)
      .single();
    expect((req as { stage: string }).stage).toBe('dang_mua');
  });

  it('hủy đơn hàng hoàn lại phần cam kết chưa dùng', async () => {
    await resetBudgetLine(fixture.budgetLineId);

    const requestId = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Đơn hàng sẽ hủy',
    });
    await approveRequest(muaHang, tgd, requestId);
    const quote = await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierA,
      unitPrice: 20_000,
    });
    await muaHang.rpc('select_quotation', { p_quotation_id: quote });
    const { data: orderId } = await muaHang.rpc('create_purchase_order', {
      p_quotation_id: quote,
    });

    const committed = (await budgetLine(fixture.budgetLineId)).committed;
    expect(committed).toBeGreaterThan(0n);

    const { error: noReason } = await muaHang.rpc('cancel_purchase_order', {
      p_order_id: orderId as string,
      p_reason: '  ',
    });
    expect(noReason?.message).toMatch(/lý do/i);

    const { error } = await muaHang.rpc('cancel_purchase_order', {
      p_order_id: orderId as string,
      p_reason: 'Nhà cung cấp báo hết hàng.',
    });
    expect(error).toBeNull();

    const after = await budgetLine(fixture.budgetLineId);
    expect(after.committed).toBe(0n);

    // Đề nghị quay về bước đã duyệt để chọn nhà cung cấp khác, không phải làm lại từ đầu.
    const { data: req } = await muaHang
      .from('purchase_requests')
      .select('stage')
      .eq('id', requestId)
      .single();
    expect((req as { stage: string }).stage).toBe('da_duyet');
  });
});

describeDb('MH — giao nhận và bộ chứng từ sang Kế toán (MH-07, MH-08)', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let tgd: SupabaseClient;
  let ketoan: SupabaseClient;
  let cfo: SupabaseClient;
  let requestId: string;
  let orderId: string;
  let orderItemId: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    tgd = await signInAs(ACCOUNTS.tgd);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    cfo = await signInAs(ACCOUNTS.cfo);

    await resetBudgetLine(fixture.budgetLineId);

    requestId = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Giao nhận thép',
    });
    await approveRequest(muaHang, tgd, requestId);
    const quote = await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierA,
      unitPrice: 20_000,
      taxRateBp: 1000,
    });
    await muaHang.rpc('select_quotation', { p_quotation_id: quote });
    const { data } = await muaHang.rpc('create_purchase_order', { p_quotation_id: quote });
    orderId = data as string;

    const { data: item } = await muaHang
      .from('purchase_order_items')
      .select('id')
      .eq('purchase_order_id', orderId)
      .single();
    orderItemId = (item as { id: string }).id;
  });

  it('không INSERT thẳng được vào phiếu giao nhận', async () => {
    const { error } = await muaHang.from('deliveries').insert({
      company_id: fixture.nvcCompanyId,
      purchase_order_id: orderId,
      delivered_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).toBeTruthy();
    expect(error!.code).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('nhận vượt số đã đặt bị chặn (MH-07)', async () => {
    const { error } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [{ purchase_order_item_id: orderItemId, quantity_ok: 1200 }],
    });
    expect(error?.message).toMatch(/vượt số đã đặt/i);
  });

  it('ghi nhận hàng không đạt phải nói rõ không đạt kiểu gì (MH-07)', async () => {
    const { error } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [{ purchase_order_item_id: orderItemId, quantity_ok: 0, quantity_issue: 50 }],
    });
    expect(error).toBeTruthy();
  });

  it('giao từng đợt: đợt đầu chuyển đúng phần cam kết sang đã phát sinh', async () => {
    const before = await budgetLine(fixture.budgetLineId);
    expect(before.committed).toBe(22_000_000n);

    const { error } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [
        {
          purchase_order_item_id: orderItemId,
          quantity_ok: 400,
          quantity_issue: 100,
          issue_type: 'sai_quy_cach',
          issue_note: 'Sai độ dày 0,2mm.',
        },
      ],
      p_delivery_note_number: 'PGH-001',
    });
    expect(error).toBeNull();

    // 400/1000 tiền hàng → 40% của 22 triệu = 8,8 triệu. Phần 100 kg sai quy cách KHÔNG
    // được tính là đã mua được.
    const after = await budgetLine(fixture.budgetLineId);
    expect(after.actual - before.actual).toBe(8_800_000n);
    expect(after.committed).toBe(13_200_000n);

    const { data: order } = await muaHang
      .from('purchase_orders')
      .select('stage')
      .eq('id', orderId)
      .single();
    expect((order as { stage: string }).stage).toBe('dang_giao');
  });

  it('nhận đủ thì đơn hàng và đề nghị đóng lại, cam kết về 0 và Kế toán nhận bộ chứng từ (MH-08)', async () => {
    const { data: userRow } = await ketoan
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.ketoan)
      .single();

    const { error } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [{ purchase_order_item_id: orderItemId, quantity_ok: 600 }],
      p_invoice_number: 'HD-2026-001',
      p_has_quality_certificate: true,
    });
    expect(error).toBeNull();

    const budget = await budgetLine(fixture.budgetLineId);
    expect(budget.committed).toBe(0n);
    expect(budget.actual).toBe(22_000_000n);

    const { data: order } = await muaHang
      .from('purchase_orders')
      .select('stage')
      .eq('id', orderId)
      .single();
    expect((order as { stage: string }).stage).toBe('da_giao_du');

    const { data: req } = await muaHang
      .from('purchase_requests')
      .select('stage')
      .eq('id', requestId)
      .single();
    expect((req as { stage: string }).stage).toBe('hoan_thanh');

    const { count } = await ketoan
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', (userRow as { id: string }).id)
      .eq('type', 'purchase_order_delivered')
      .eq('related_entity_id', orderId);
    expect(count).toBe(1);

    // CFO chỉ được gán vào pháp nhân tổng hợp "NVG", không gán riêng vào NVC — trước
    // migration 0068, điều kiện nhận thông báo lọc cứng company_id nên CFO không bao giờ
    // nhận được, dù nằm trong danh sách người cần biết (MH-08).
    const { data: cfoRow } = await cfo
      .from('users')
      .select('id')
      .eq('email', ACCOUNTS.cfo)
      .single();
    const { count: cfoCount } = await cfo
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', (cfoRow as { id: string }).id)
      .eq('type', 'purchase_order_delivered')
      .eq('related_entity_id', orderId);
    expect(cfoCount).toBe(1);
  });

  it('đơn đã giao đủ thì không nhận thêm được nữa', async () => {
    const { error } = await muaHang.rpc('record_delivery', {
      p_purchase_order_id: orderId,
      p_delivered_date: new Date().toISOString().slice(0, 10),
      p_items: [{ purchase_order_item_id: orderItemId, quantity_ok: 1 }],
    });
    expect(error).toBeTruthy();
  });
});

describeDb('MH — danh mục nhà cung cấp và lịch sử giá (MH-03, MH-05)', () => {
  let fixture: Fixture;
  let muaHang: SupabaseClient;
  let tgd: SupabaseClient;
  let chiHuy: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    muaHang = await signInAs(ACCOUNTS.muaHang);
    tgd = await signInAs(ACCOUNTS.tgd);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
  });

  it('ngừng giao dịch với một nhà cung cấp phải nêu lý do (MH-03)', async () => {
    const { error } = await muaHang
      .from('suppliers')
      .update({ supplier_class: 'ngung_giao_dich' })
      .eq('id', fixture.supplierA);
    expect(error).toBeTruthy();

    const { error: withReason } = await muaHang
      .from('suppliers')
      .update({
        supplier_class: 'ngung_giao_dich',
        suspended_reason: 'Giao chậm ba lần liên tiếp.',
      })
      .eq('id', fixture.supplierA);
    expect(withReason).toBeNull();
  });

  it('điểm đánh giá ngoài thang 1–5 bị chặn (MH-03)', async () => {
    const { error } = await muaHang
      .from('suppliers')
      .update({ rating_delivery: 9 })
      .eq('id', fixture.supplierB);
    expect(error).toBeTruthy();
  });

  it('Ban công trường KHÔNG lập được nhà cung cấp mới', async () => {
    const { error } = await chiHuy.from('suppliers').insert({
      code: `NCC-CT-${Date.now()}`,
      name: `${TEST_PREFIX} Nhà cung cấp do công trường tạo`,
    });
    expect(error).toBeTruthy();
  });

  it('lịch sử giá tra được theo mã vật tư, và Ban công trường không mở được (MH-05, NEN-07)', async () => {
    const requestId = await createRequest(muaHang, {
      companyId: fixture.nvcCompanyId,
      siteId: fixture.nvcSiteId,
      title: 'Lịch sử giá',
    });
    await approveRequest(muaHang, tgd, requestId);
    await addQuotation(muaHang, fixture.nvcCompanyId, requestId, {
      supplierId: fixture.supplierB,
      unitPrice: 19_500,
    });

    const { data, error } = await muaHang.rpc('purchase_price_history', {
      p_item_code: 'VT-TEST-1',
    });
    expect(error).toBeNull();
    expect((data as unknown[]).length).toBeGreaterThan(0);

    const { error: siteError } = await chiHuy.rpc('purchase_price_history', {
      p_item_code: 'VT-TEST-1',
    });
    expect(siteError?.message).toMatch(/Ban Giám đốc|Mua hàng/i);
  });

  it('Mua hàng đọc được TÊN công trình nhưng KHÔNG mở được nhật ký hay ngân sách của nó', async () => {
    // MH-01 bắt buộc đề nghị mua mang mã công trình, nên Mua hàng phải gọi được tên công
    // trình. Nhưng đó là toàn bộ những gì được mở: nhật ký công trường và ngân sách vẫn đi
    // qua `rls_site_readable`, hàm này đòi quyền xem phân hệ Thi công.
    const { data: site } = await muaHang
      .from('construction_sites')
      .select('id, code, name')
      .eq('id', fixture.nvcSiteId)
      .maybeSingle();
    expect(site).toBeTruthy();

    const { data: logs } = await muaHang
      .from('site_logs')
      .select('id')
      .eq('construction_site_id', fixture.nvcSiteId);
    expect(logs).toEqual([]);

    // `construction_budget_status` lọc bằng `rls_site_readable` ngay trong câu truy vấn nên
    // trả về RỖNG thay vì báo lỗi — vẫn là ranh giới đúng: không con số ngân sách nào tới nơi.
    const { data: budget } = await muaHang.rpc('construction_budget_status', {
      p_site_id: fixture.nvcSiteId,
    });
    expect(budget).toEqual([]);

    // Danh sách mã chi phí thì mở — nhưng chỉ có mã và tên, không kèm con số tiền nào.
    const { data: codes, error: codeError } = await muaHang.rpc('site_cost_codes', {
      p_site_id: fixture.nvcSiteId,
    });
    expect(codeError).toBeNull();
    const rows = codes as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]!)).toEqual(['cost_code', 'name', 'cost_group']);
  });

  it('hàm nội bộ không gọi được từ trình duyệt', async () => {
    for (const fn of ['quotation_landed_total', 'quotation_goods_subtotal']) {
      const { error } = await muaHang.rpc(fn, { p_quotation_id: fixture.budgetLineId });
      expect(error, `${fn} phải bị chặn`).toBeTruthy();
    }
    const { error } = await muaHang.rpc('purchase_request_budget_line', {
      p_request_id: fixture.budgetLineId,
    });
    expect(error).toBeTruthy();
  });
});
