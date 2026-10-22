/**
 * Đợt 5 — 5E: nhắc hợp đồng lao động hết hạn (migration 0207).
 *
 * Canh:
 *  1. Hợp đồng đã hết hạn → Hành chính – Nhân sự được báo một lần; câu báo không có lương.
 *  2. Số ngày nhắc trước để TRỐNG → hợp đồng còn hạn không bị báo; đặt số → báo.
 *  3. Đã có hợp đồng kế tiếp → không báo hợp đồng cũ.
 *  4. Trình duyệt không gọi được hàm quét; Kinh doanh không đọc được danh sách hợp đồng tới hạn.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/dot5-ns-hop-dong.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const isoDate = (offset: number) => {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

describeDb('5E — nhắc hợp đồng lao động hết hạn (0207)', () => {
  let ns: SupabaseClient;
  let kd: SupabaseClient;
  let nvc: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ns = await signInAs(ACCOUNTS.nhanSu);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    nvc = (await ns.from('companies').select('id').eq('code', 'NVC').single()).data!.id;
    await sqlRun(async (sql) => {
      const emps = await sql<{ id: string; full_name: string }[]>`
        INSERT INTO employees (company_id, full_name, position, status)
        VALUES (${nvc}, ${TEST_PREFIX + ' NV hết hạn'}, 'Kỹ sư', 'chinh_thuc'),
               (${nvc}, ${TEST_PREFIX + ' NV sắp hết'}, 'Kỹ sư', 'chinh_thuc'),
               (${nvc}, ${TEST_PREFIX + ' NV đã ký lại'}, 'Kỹ sư', 'chinh_thuc')
        RETURNING id, full_name`;
      const [a, b, c] = emps;
      const rows = await sql<{ id: string; code: string }[]>`
        INSERT INTO employment_contracts
          (company_id, employee_id, code, type, status, start_date, end_date, salary_amount)
        VALUES
          (${nvc}, ${a!.id}, 'HDLD-THU5-A', 'xac_dinh_han', 'dang_hieu_luc', ${isoDate(-400)}, ${isoDate(-2)}, 98765432),
          (${nvc}, ${b!.id}, 'HDLD-THU5-B', 'xac_dinh_han', 'dang_hieu_luc', ${isoDate(-300)}, ${isoDate(12)}, 98765432),
          (${nvc}, ${c!.id}, 'HDLD-THU5-C', 'xac_dinh_han', 'dang_hieu_luc', ${isoDate(-400)}, ${isoDate(-1)}, 98765432),
          (${nvc}, ${c!.id}, 'HDLD-THU5-C2', 'khong_xac_dinh_han', 'dang_hieu_luc', ${isoDate(0)}, NULL, 98765432)
        RETURNING id, code`;
      for (const r of rows) ids[r.code] = r.id;
    });
  });

  afterAll(async () => {
    await sqlRun(async (sql) => {
      await sql`DELETE FROM notifications WHERE related_entity_id IN ${sql(Object.values(ids))}`;
      await sql`DELETE FROM employment_contracts WHERE code LIKE 'HDLD-THU5-%'`;
      await sql`UPDATE system_parameters SET value = NULL
                WHERE param_key = 'ns.contract_remind_days' AND scope_type = 'global'`;
    });
  });

  const notes = (id: string) =>
    sqlRun(
      (sql) => sql<{ message: string }[]>`SELECT message FROM notifications
        WHERE related_entity_id = ${id} AND type = 'employment_contract_expiry'`,
    );

  it('hết hạn: báo Hành chính một lần, không có lương; số ngày trống thì hợp đồng còn hạn không báo', async () => {
    await sqlRun((sql) => sql`SELECT scan_employment_contract_reminders()`);
    const a = await notes(ids['HDLD-THU5-A']!);
    expect(a.length).toBeGreaterThan(0);
    const first = a.length;
    expect(
      a.every((n) => !n.message.includes('98765432') && !n.message.includes('98.765.432')),
    ).toBe(true);
    expect(await notes(ids['HDLD-THU5-B']!)).toHaveLength(0);

    await sqlRun((sql) => sql`SELECT scan_employment_contract_reminders()`);
    expect(await notes(ids['HDLD-THU5-A']!)).toHaveLength(first);
  });

  it('đặt số ngày nhắc trước thì báo hợp đồng sắp hết', async () => {
    await sqlRun(
      (sql) => sql`UPDATE system_parameters SET value = '30'::jsonb
                   WHERE param_key = 'ns.contract_remind_days' AND scope_type = 'global'`,
    );
    await sqlRun((sql) => sql`SELECT scan_employment_contract_reminders()`);
    expect((await notes(ids['HDLD-THU5-B']!)).length).toBeGreaterThan(0);
  });

  it('đã có hợp đồng kế tiếp thì không báo hợp đồng cũ', async () => {
    await sqlRun((sql) => sql`SELECT scan_employment_contract_reminders()`);
    expect(await notes(ids['HDLD-THU5-C']!)).toHaveLength(0);
  });

  it('trình duyệt không gọi được hàm quét; Kinh doanh không thấy hợp đồng tới hạn', async () => {
    const r = await ns.rpc('scan_employment_contract_reminders');
    expect(r.error).toBeTruthy();
    const list = await ns.rpc('ns_expiring_contracts');
    expect(
      (list.data as { contract_id: string }[]).some((x) => x.contract_id === ids['HDLD-THU5-A']),
    ).toBe(true);
    const kdList = await kd.rpc('ns_expiring_contracts');
    expect(
      ((kdList.data ?? []) as { contract_id: string }[]).some(
        (x) => x.contract_id === ids['HDLD-THU5-A'],
      ),
    ).toBe(false);
  });
});
