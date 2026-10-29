/**
 * Báo giá có giá vốn, lợi nhuận tối thiểu và loại thiết kế / thi công (migration 0244, gói G1).
 *
 * Hàng rào phải đứng:
 *  - Kinh doanh không đọc được giá vốn (bảng, hàm, hộp duyệt) và không nhập được giá vốn.
 *  - Tham số `min_margin_percent` trống: không chuyển cấp, người duyệt thường duyệt được.
 *  - Có tham số mà lợi nhuận dưới mức (hoặc chưa đủ giá vốn): chỉ Tổng Giám đốc duyệt — người có hạn
 *    mức báo giá thường bị từ chối, kể cả khi hồ sơ lách được sang loại thường (lưới an toàn).
 *  - Giá vốn nhập lúc đang chờ duyệt thì hồ sơ duyệt đổi loại cho đúng.
 *  - Hai báo giá đang hiệu lực khác loại cùng tồn tại; cùng loại thì bản mới thay bản cũ; trọn gói
 *    không đi cùng loại khác.
 *  - Soạn hợp đồng từ cơ hội lấy giá trị từ báo giá đúng loại.
 *  - Dự toán thầu dưới mức tối thiểu → Tổng Giám đốc; có ghi chú rủi ro.
 *
 * Người duyệt «thường» trong phép thử: Dự toán NVC (`DA_DT`) được cấp TẠM hạn mức `quote_price` — Kinh
 * doanh là người gửi nên không tự duyệt được, và hệ thống chưa có vai trò thứ hai giữ hạn mức này.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/bao-gia-gia-von.test.ts`
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

/** Doanh thu 100.000.000 đồng (không thuế). */
const ITEMS = [
  { description: 'Phần móng', unit: 'gói', quantity: '1', unit_price: 60_000_000 },
  { description: 'Phần thân', unit: 'gói', quantity: '2', unit_price: 20_000_000 },
];
/** Báo giá thiết kế 120.000.000 đồng. */
const DESIGN_ITEMS = [
  { description: 'Thiết kế kiến trúc', unit: 'gói', quantity: '1', unit_price: 120_000_000 },
];

interface Fixture {
  nvcId: string;
  customerId: string;
  opp1: string;
  opp2: string;
  limitId: string;
  bidId: string;
}

describeDb('báo giá có giá vốn, lợi nhuận tối thiểu (0244)', () => {
  let fx: Fixture;
  let kd: SupabaseClient;
  let dt: SupabaseClient;
  let tgd: SupabaseClient;

  const setMinMargin = (value: number | null) =>
    withSql(
      (sql) => sql`UPDATE system_parameters
                      SET value = ${value === null ? null : String(value)}::jsonb
                    WHERE param_key = 'min_margin_percent' AND scope_type = 'company'
                      AND scope_id = ${fx.nvcId}`,
    );

  async function newQuote(opp: string, kind: string | null, items = ITEMS): Promise<string> {
    const { data, error } = await kd.rpc('create_quote_version', {
      p_opportunity_id: opp,
      p_company_id: fx.nvcId,
      p_items: items,
      p_scope_kind: kind,
    });
    expect(error).toBeNull();
    return data as string;
  }

  async function itemIds(quoteId: string): Promise<string[]> {
    return withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM quote_items WHERE quote_id = ${quoteId} ORDER BY position`;
      return rows.map((r) => r.id);
    });
  }

  /** Giá vốn hai dòng: 60 tr × costA/60 tr… — truyền thẳng đơn giá vốn. */
  async function saveCosts(client: SupabaseClient, quoteId: string, unitCosts: number[]) {
    const ids = await itemIds(quoteId);
    return client.rpc('save_quote_costs', {
      p_quote_id: quoteId,
      p_items: ids.map((id, i) => ({ quote_item_id: id, unit_cost: unitCosts[i] })),
    });
  }

  async function openApproval(entity: string) {
    return withSql(async (sql) => {
      const [a] = await sql<{ id: string; subject: string; amount: string }[]>`
        SELECT id, subject::text AS subject, amount::text AS amount FROM approvals
         WHERE entity_id = ${entity} AND status = 'pending_approval' AND deleted_at IS NULL`;
      return a;
    });
  }

  beforeAll(async () => {
    fx = await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [kdUser] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvc}`;
      const [cu] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name, phone)
        VALUES (${'KH-BGGV-' + stamp}, ${TEST_PREFIX + ' Khách giá vốn ' + stamp}, '0912000244')
        RETURNING id`;
      const opps: string[] = [];
      for (const n of [1, 2]) {
        const [o] = await sql<{ id: string }[]>`
          INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
          VALUES (${nvc!.id}, ${'NVC-CH-BGGV' + n + '-' + stamp}, ${cu!.id},
                  ${TEST_PREFIX + ' Cơ hội giá vốn ' + n + ' ' + stamp}, ${kdUser!.id}, 'bao_gia')
          RETURNING id`;
        opps.push(o!.id);
      }
      const [lim] = await sql<{ id: string }[]>`
        INSERT INTO approval_limits (role_id, subject, max_amount, step, company_id)
        SELECT id, 'quote_price', 1000000000, 1, ${nvc!.id} FROM roles WHERE code = 'DA_DT'
        RETURNING id`;
      const [bid] = await sql<{ id: string }[]>`
        INSERT INTO bidding_projects (company_id, code, name)
        VALUES (${nvc!.id}, ${'DA-BGGV-' + stamp}, ${TEST_PREFIX + ' Gói thầu giá vốn ' + stamp})
        RETURNING id`;
      return {
        nvcId: nvc!.id,
        customerId: cu!.id,
        opp1: opps[0]!,
        opp2: opps[1]!,
        limitId: lim!.id,
        bidId: bid!.id,
      };
    });
    [kd, dt, tgd] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.dauThauNvc),
      signInAs(ACCOUNTS.tgd),
    ]);
  });

  afterEach(async () => {
    if (fx) await setMinMargin(null);
  });

  afterAll(async () => {
    if (!fx) return;
    await withSql(async (sql) => {
      const opps = [fx.opp1, fx.opp2];
      const quoteIds = sql`SELECT id FROM quotes WHERE opportunity_id IN ${sql(opps)}`;
      const estIds = sql`SELECT id FROM estimates WHERE bidding_project_id = ${fx.bidId}`;
      await sql`DELETE FROM approvals WHERE entity_id IN (${quoteIds}) OR entity_id IN (${estIds})`;
      await sql`DELETE FROM contracts WHERE source_id IN ${sql(opps)}`;
      await sql`DELETE FROM quotes WHERE opportunity_id IN ${sql(opps)}`;
      await sql`DELETE FROM estimates WHERE bidding_project_id = ${fx.bidId}`;
      await sql`DELETE FROM bidding_projects WHERE id = ${fx.bidId}`;
      await sql`DELETE FROM notifications WHERE related_entity_id IN ${sql(opps)}`;
      await sql`DELETE FROM opportunities WHERE id IN ${sql(opps)}`;
      await sql`DELETE FROM customers WHERE id = ${fx.customerId}`;
      await sql`DELETE FROM approval_limits WHERE id = ${fx.limitId}`;
    });
    await setMinMargin(null);
  });

  it('Kinh doanh không đọc, không nhập được giá vốn; Dự toán nhập và đọc được, có nhật ký', async () => {
    const quoteId = await newQuote(fx.opp1, 'thi_cong');

    const denied = await saveCosts(kd, quoteId, [55_000_000, 20_000_000]);
    expect(denied.error).not.toBeNull();

    const saved = await saveCosts(dt, quoteId, [55_000_000, 20_000_000]);
    expect(saved.error?.message ?? null).toBeNull();

    const table = await kd.from('quote_item_costs').select('unit_cost').eq('quote_id', quoteId);
    expect(table.error).not.toBeNull();
    const lines = await kd.rpc('quote_cost_lines', { p_quote_id: quoteId });
    expect(lines.error).not.toBeNull();

    const kdBrief = await kd.rpc('price_margin_brief', {
      p_entity_type: 'quotes',
      p_entity_id: quoteId,
    });
    expect(kdBrief.error).toBeNull();
    const kb = (kdBrief.data as Record<string, unknown>[])[0]!;
    expect(kb.sees_cost).toBe(false);
    expect(kb.cost).toBeNull();
    expect(kb.profit).toBeNull();
    expect(kb.margin_percent).toBeNull();
    expect(Number(kb.revenue)).toBe(100_000_000);

    const dtBrief = await dt.rpc('price_margin_brief', {
      p_entity_type: 'quotes',
      p_entity_id: quoteId,
    });
    const db = (dtBrief.data as Record<string, unknown>[])[0]!;
    expect(db.sees_cost).toBe(true);
    expect(Number(db.cost)).toBe(95_000_000);
    expect(Number(db.profit)).toBe(5_000_000);
    expect(Number(db.margin_percent)).toBe(5);
    expect(db.cost_complete).toBe(true);

    const logs = await withSql(
      (sql) => sql<{ action: string }[]>`
        SELECT action FROM sensitive_access_logs
         WHERE entity_type = 'quotes' AND entity_id = ${quoteId} AND sensitive_kind = 'cost'`,
    );
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['edit', 'view']));
  });

  it('tham số trống: không chuyển cấp — người có hạn mức báo giá thường duyệt được', async () => {
    const quoteId = await newQuote(fx.opp1, 'thi_cong');
    expect((await saveCosts(dt, quoteId, [55_000_000, 20_000_000])).error).toBeNull();
    const req = await kd.rpc('request_quote_approval', { p_quote_id: quoteId });
    expect(req.error?.message ?? null).toBeNull();
    const a = await openApproval(quoteId);
    expect(a!.subject).toBe('quote_price');
    const ok = await dt.rpc('decide_approval', { p_approval_id: a!.id, p_decision: 'approved' });
    expect(ok.error).toBeNull();
  });

  it('dưới mức tối thiểu: chuyển Tổng Giám đốc, người duyệt thường bị từ chối, hộp duyệt có rủi ro', async () => {
    await setMinMargin(10);
    const quoteId = await newQuote(fx.opp1, 'thi_cong');
    expect((await saveCosts(dt, quoteId, [55_000_000, 20_000_000])).error).toBeNull(); // 5 %
    const req = await kd.rpc('request_quote_approval', {
      p_quote_id: quoteId,
      p_risk_note: 'Giá thép biến động, chủ đầu tư thanh toán chậm',
    });
    expect(req.error?.message ?? null).toBeNull();

    const a = await openApproval(quoteId);
    expect(a!.subject).toBe('low_margin_price');

    const blocked = await dt.rpc('decide_approval', {
      p_approval_id: a!.id,
      p_decision: 'approved',
    });
    expect(blocked.error).not.toBeNull();

    const brief = await tgd.rpc('price_margin_brief', {
      p_entity_type: 'quotes',
      p_entity_id: quoteId,
    });
    const b = (brief.data as Record<string, unknown>[])[0]!;
    expect(b.routed_to_ceo).toBe(true);
    expect(b.needs_ceo).toBe(true);
    expect(Number(b.min_margin)).toBe(10);
    expect(b.risk_note).toBe('Giá thép biến động, chủ đầu tư thanh toán chậm');

    const ok = await tgd.rpc('decide_approval', { p_approval_id: a!.id, p_decision: 'approved' });
    expect(ok.error).toBeNull();
  });

  it('chưa có giá vốn khi tham số có số: Tổng Giám đốc; nhập giá vốn đủ mức thì hồ sơ về loại thường', async () => {
    await setMinMargin(10);
    const quoteId = await newQuote(fx.opp1, 'thi_cong');
    expect((await kd.rpc('request_quote_approval', { p_quote_id: quoteId })).error).toBeNull();
    expect((await openApproval(quoteId))!.subject).toBe('low_margin_price');

    // Tham số đổi sau khi gửi không hồi tố: hồ sơ dùng mức 10 % đã chụp.
    await setMinMargin(50);
    expect((await saveCosts(dt, quoteId, [40_000_000, 20_000_000])).error).toBeNull(); // 20 %
    const a = await openApproval(quoteId);
    expect(a!.subject).toBe('quote_price');
    const ok = await dt.rpc('decide_approval', { p_approval_id: a!.id, p_decision: 'approved' });
    expect(ok.error).toBeNull();
  });

  it('lưới an toàn: hồ sơ dưới mức lách sang loại thường vẫn không duyệt được', async () => {
    await setMinMargin(10);
    const quoteId = await newQuote(fx.opp1, 'thi_cong');
    expect((await saveCosts(dt, quoteId, [55_000_000, 20_000_000])).error).toBeNull();
    expect((await kd.rpc('request_quote_approval', { p_quote_id: quoteId })).error).toBeNull();
    const a = await openApproval(quoteId);
    await withSql((sql) => sql`UPDATE approvals SET subject = 'quote_price' WHERE id = ${a!.id}`);
    const blocked = await dt.rpc('decide_approval', {
      p_approval_id: a!.id,
      p_decision: 'approved',
    });
    expect(blocked.error?.message).toMatch(/Tổng Giám đốc/);
  });

  it('báo giá thiết kế và thi công cùng hiệu lực; cùng loại thì bản mới thay; trọn gói bị chặn', async () => {
    const design1 = await newQuote(fx.opp2, 'thiet_ke', DESIGN_ITEMS);
    const build1 = await newQuote(fx.opp2, 'thi_cong');
    const current = await withSql(
      (sql) => sql<{ id: string; scope_kind: string; code: string }[]>`
        SELECT id, scope_kind, code FROM quotes
         WHERE opportunity_id = ${fx.opp2} AND is_current_version AND deleted_at IS NULL`,
    );
    expect(current.map((q) => q.id).sort()).toEqual([design1, build1].sort());
    // Hai chuỗi mã riêng.
    expect(new Set(current.map((q) => q.code)).size).toBe(2);

    const design2 = await newQuote(fx.opp2, 'thiet_ke', DESIGN_ITEMS);
    const after = await withSql(
      (sql) => sql<{ id: string }[]>`
        SELECT id FROM quotes
         WHERE opportunity_id = ${fx.opp2} AND is_current_version AND deleted_at IS NULL`,
    );
    expect(after.map((q) => q.id).sort()).toEqual([design2, build1].sort());

    // Ép hai bản thiết kế cùng hiệu lực: chỉ số duy nhất chặn.
    await expect(
      withSql((sql) => sql`UPDATE quotes SET is_current_version = true WHERE id = ${design1}`),
    ).rejects.toThrow();

    const pkg = await kd.rpc('create_quote_version', {
      p_opportunity_id: fx.opp2,
      p_company_id: fx.nvcId,
      p_items: ITEMS,
      p_scope_kind: 'tron_goi',
    });
    expect(pkg.error?.message).toMatch(/trọn gói/);
  });

  it('soạn hợp đồng thiết kế từ cơ hội lấy giá trị báo giá thiết kế', async () => {
    await withSql(
      (sql) => sql`UPDATE quotes SET status = 'completed'
                    WHERE opportunity_id = ${fx.opp2} AND is_current_version`,
    );
    const { data, error } = await kd.rpc('create_contract_from_source', {
      p_source_type: 'opportunities',
      p_source_id: fx.opp2,
      p_type: 'thiet_ke',
    });
    expect(error).toBeNull();
    const [c] = await withSql(
      (sql) =>
        sql<{ value: string }[]>`SELECT value::text FROM contracts WHERE id = ${data as string}`,
    );
    expect(c!.value).toBe('120000000');
  });

  it('dự toán thầu dưới mức tối thiểu → Tổng Giám đốc, kèm rủi ro; tham số trống → loại thường', async () => {
    const mk = (code: string) =>
      withSql(async (sql) => {
        const [e] = await sql<{ id: string }[]>`
          INSERT INTO estimates (company_id, bidding_project_id, code, bid_price, profit_margin_percent)
          VALUES (${fx.nvcId}, ${fx.bidId}, ${code}, 300000000, 3)
          RETURNING id`;
        return e!.id;
      });

    const plain = await mk('DT-BGGV-A-' + Date.now());
    expect((await dt.rpc('request_estimate_approval', { p_estimate_id: plain })).error).toBeNull();
    expect((await openApproval(plain))!.subject).toBe('estimate_price');
    await withSql((sql) => sql`DELETE FROM approvals WHERE entity_id = ${plain}`);

    await setMinMargin(8);
    const low = await mk('DT-BGGV-B-' + Date.now());
    const req = await dt.rpc('request_estimate_approval', {
      p_estimate_id: low,
      p_risk_note: 'Hạn nộp gấp, khối lượng BOQ chưa khớp bản vẽ',
    });
    expect(req.error?.message ?? null).toBeNull();
    const a = await openApproval(low);
    expect(a!.subject).toBe('low_margin_price');
    const brief = await tgd.rpc('price_margin_brief', {
      p_entity_type: 'estimates',
      p_entity_id: low,
    });
    const b = (brief.data as Record<string, unknown>[])[0]!;
    expect(b.risk_note).toBe('Hạn nộp gấp, khối lượng BOQ chưa khớp bản vẽ');
    expect(Number(b.margin_percent)).toBe(3);
    const ok = await tgd.rpc('decide_approval', { p_approval_id: a!.id, p_decision: 'approved' });
    expect(ok.error).toBeNull();
  });
});
