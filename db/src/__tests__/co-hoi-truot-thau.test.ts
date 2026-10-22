/**
 * Câu 4 (anh Dũng 22/10/2026): gói thầu trượt → cơ hội gốc tự sang «Mất cơ hội» kèm lý do trượt
 * (migration 0217). Còn gói thầu khác của cùng cơ hội đang chạy thì cơ hội chưa mất.
 * Câu 1: tham số `tk.handover_requires_signed_contract` mặc định đã bật.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/co-hoi-truot-thau.test.ts`
 */

import { describe, expect, it } from 'vitest';
import { hasCredentials, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

describeDb('cơ hội tự sang Mất cơ hội khi trượt thầu (0217)', () => {
  type Sql = ReturnType<typeof import('../client').createConnection>['sql'];

  async function withSql<T>(fn: (sql: Sql) => Promise<T>) {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      return await fn(sql);
    } finally {
      await sql.end();
    }
  }

  async function fixture(sql: Sql, bids: number) {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [nvc] = await sql`SELECT id FROM companies WHERE code = 'NVC'`;
    const [customer] = await sql`SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1`;
    const [owner] = await sql`SELECT id FROM users WHERE email = 'kinhdoanh.nvc@nhavietgroup.test'`;
    const [opp] = await sql`
      INSERT INTO opportunities (company_id, code, customer_id, name, owner_id, stage)
      VALUES (${nvc!.id}, ${'TT-CH-' + stamp}, ${customer!.id}, ${TEST_PREFIX + ' Trượt thầu ' + stamp},
              ${owner!.id}, 'dam_phan')
      RETURNING id`;
    const ids: string[] = [];
    for (let i = 0; i < bids; i++) {
      const [b] = await sql`
        INSERT INTO bidding_projects (company_id, code, name, opportunity_id, stage)
        VALUES (${nvc!.id}, ${'TT-GT-' + i + '-' + stamp}, ${TEST_PREFIX + ' Gói ' + i + ' ' + stamp},
                ${opp!.id}, 'nop_thau')
        RETURNING id`;
      ids.push(b!.id);
    }
    return { oppId: opp!.id as string, bidIds: ids, ownerId: owner!.id as string };
  }

  it('gói thầu duy nhất trượt → cơ hội Mất cơ hội, lý do mang mã gói + lý do trượt, người phụ trách được báo', async () => {
    await withSql(async (sql) => {
      const f = await fixture(sql, 1);
      await sql`UPDATE bidding_projects SET stage = 'truot_thau', lost_reason = 'Giá cao hơn 7%'
                 WHERE id = ${f.bidIds[0]!}`;
      const [o] =
        await sql`SELECT stage::text, lost_reason FROM opportunities WHERE id = ${f.oppId}`;
      expect(o!.stage).toBe('mat_co_hoi');
      expect(o!.lost_reason).toMatch(/^Trượt thầu gói TT-GT-0-.*: Giá cao hơn 7%$/);
      const [n] = await sql`SELECT count(*)::int AS c FROM notifications
                             WHERE related_entity_id = ${f.oppId} AND user_id = ${f.ownerId}
                               AND type = 'bid_lost'`;
      expect(n!.c).toBe(1);
      const [h] = await sql`SELECT count(*)::int AS c FROM opportunity_stage_history
                             WHERE opportunity_id = ${f.oppId} AND to_stage = 'mat_co_hoi'`;
      expect(h!.c, 'lịch sử bước phải ghi lần chuyển tự động').toBe(1);
    });
  });

  it('còn gói thầu khác đang chạy → cơ hội giữ nguyên bước', async () => {
    await withSql(async (sql) => {
      const f = await fixture(sql, 2);
      await sql`UPDATE bidding_projects SET stage = 'truot_thau', lost_reason = 'Thiếu năng lực'
                 WHERE id = ${f.bidIds[0]!}`;
      const [o] = await sql`SELECT stage::text FROM opportunities WHERE id = ${f.oppId}`;
      expect(o!.stage).toBe('dam_phan');
      // Gói còn lại cũng trượt → lúc đó mới mất.
      await sql`UPDATE bidding_projects SET stage = 'truot_thau', lost_reason = 'Giá cao'
                 WHERE id = ${f.bidIds[1]!}`;
      const [o2] = await sql`SELECT stage::text FROM opportunities WHERE id = ${f.oppId}`;
      expect(o2!.stage).toBe('mat_co_hoi');
    });
  });

  it('không thi công trước hợp đồng: tham số bàn giao cần hợp đồng đã ký đang bật', async () => {
    await withSql(async (sql) => {
      const [p] = await sql`SELECT value::text AS v FROM system_parameters
                             WHERE param_key = 'tk.handover_requires_signed_contract' AND scope_type = 'global'`;
      expect(p!.v).toBe('true');
    });
  });
});
