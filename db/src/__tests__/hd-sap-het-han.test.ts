/**
 * Câu 8 (anh Dũng 22/10/2026): hợp đồng đã ký còn ≤ 90 ngày tới ngày kết thúc là «sắp hết hạn»
 * (`hd.expiring_soon_days`, `contracts_expiring_soon()`, migration 0218). Hàm SECURITY INVOKER —
 * người khác pháp nhân không thấy hợp đồng của pháp nhân kia.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/hd-sap-het-han.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Row {
  id: string;
  days_left: number;
}

describeDb('hợp đồng sắp hết hạn (0218)', () => {
  const ids: Record<'in30' | 'in120' | 'past' | 'draft', string> = {
    in30: '',
    in120: '',
    past: '',
    draft: '',
  };

  beforeAll(async () => {
    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const stamp = `${Date.now()}`;
      const today = sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;
      const make = async (key: keyof typeof ids, stage: string, offset: number) => {
        const [r] = await sql<{ id: string }[]>`
          INSERT INTO contracts (company_id, code, title, type, stage, end_date)
          VALUES (${nvc!.id}, ${'HDTEST-HH-' + key + '-' + stamp}, ${TEST_PREFIX + ' Hết hạn ' + key},
                  'thi_cong', ${stage}, ${today} + ${offset}::int)
          RETURNING id`;
        ids[key] = r!.id;
      };
      await make('in30', 'da_ky', 30);
      await make('in120', 'da_ky', 120);
      await make('past', 'da_ky', -1);
      await make('draft', 'nhap', 30);
    } finally {
      await sql.end();
    }
  });

  it('chỉ hợp đồng đã ký còn trong 90 ngày, kèm số ngày còn lại', async () => {
    const tgd = await signInAs(ACCOUNTS.tgd);
    const { data, error } = await tgd.rpc('contracts_expiring_soon');
    expect(error).toBeNull();
    const rows = (data ?? []) as Row[];
    const mine = rows.filter((r) => Object.values(ids).includes(r.id));
    expect(mine.map((r) => r.id)).toEqual([ids.in30]);
    expect(mine[0]!.days_left).toBe(30);
  });

  it('người khác pháp nhân không thấy (RLS hợp đồng)', async () => {
    const kdNvo = await signInAs(ACCOUNTS.kinhDoanhNvo);
    const { data, error } = await kdNvo.rpc('contracts_expiring_soon');
    expect(error).toBeNull();
    expect(((data ?? []) as Row[]).some((r) => r.id === ids.in30)).toBe(false);
  });
});
