/**
 * Đợt 3 — 3E: danh sách bất thường cho Kiểm soát nội bộ (migration 0199).
 *
 * Bất biến canh ở đây:
 *   · chỉ KSNB / Ban Giám đốc / Tài chính xem; Kế toán, Kinh doanh, Thi công bị từ chối;
 *   · bỏ qua khảo sát, phát sinh khẩn cấp, mốc bị trả lại hiện đúng hồ sơ, có đường dẫn;
 *   · «duyệt sát hạn mức» KHÔNG liệt kê khi NVG chưa đặt ngưỡng; đặt ngưỡng thì liệt kê đúng ca.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dot3-anomalies.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

interface Row {
  kind: string;
  entity_id: string;
  link: string;
  detail: string;
}

describeDb('3E — danh sách bất thường KSNB (0199)', () => {
  const ids: Record<string, string> = {};
  let ksnb: SupabaseClient;

  beforeAll(async () => {
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [tgd] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${ACCOUNTS.tgd}`;
      const [cus] = await sql<{ id: string }[]>`
        INSERT INTO customers (code, name) VALUES (${'KH-BT-' + stamp}, ${TEST_PREFIX + ' Bất thường ' + stamp})
        RETURNING id`;
      const [opp] = await sql<{ id: string }[]>`
        INSERT INTO opportunities (company_id, code, name, customer_id, survey_waived_reason)
        VALUES (${nvc!.id}, ${'NVC-CH-BT-' + stamp}, ${TEST_PREFIX + ' Bất thường ' + stamp}, ${cus!.id},
                'Khách quen, không cần khảo sát')
        RETURNING id`;
      ids.opp = opp!.id;
      const [contract] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, title, type, stage, value, signed_date)
        VALUES (${nvc!.id}, ${'NVC-HD-BT-' + stamp}, ${TEST_PREFIX + ' Bất thường ' + stamp}, 'thi_cong', 'da_ky', 500000000, current_date)
        RETURNING id`;
      const [am] = await sql<{ id: string }[]>`
        INSERT INTO contract_amendments (company_id, contract_id, title, content, reason, stage, value_change,
                                         is_emergency, emergency_authorized_by, emergency_reason)
        VALUES (${nvc!.id}, ${contract!.id}, 'Gia cố móng gấp', 'x', 'Sụt lún', 'da_thuc_hien', 80000000,
                true, ${tgd!.id}, 'Nguy cơ sập')
        RETURNING id`;
      ids.amendment = am!.id;
      const [site] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_start_date, planned_end_date)
        SELECT id, ${'NVO-CT-BT-' + stamp}, ${TEST_PREFIX + ' Bất thường ' + stamp}, 'dang_thi_cong', current_date, current_date + 60
          FROM companies WHERE code = 'NVO'
        RETURNING id`;
      ids.site = site!.id;
      await sql`
        INSERT INTO site_milestone_events (company_id, site_milestone_id, event, note, actor_id)
        SELECT company_id, id, 'tra_lai', 'Thép đai sai khoảng cách', ${tgd!.id}
          FROM site_milestones WHERE construction_site_id = ${ids.site} AND step_key = 'mong'`;
      const [ap] = await sql<{ id: string }[]>`
        INSERT INTO approvals (company_id, subject, entity_type, entity_id, title, amount, status, final_decision)
        VALUES (${nvc!.id}, 'contract', 'contracts', ${contract!.id}, ${TEST_PREFIX + ' Bất thường duyệt'},
                95000000, 'completed', 'approved')
        RETURNING id`;
      ids.approvalEntity = contract!.id;
      await sql`
        INSERT INTO approval_decisions (approval_id, step, decision, approver_limit_at_time, decided_by)
        VALUES (${ap!.id}, 1, 'approved', 100000000, ${tgd!.id})`;
    });
    ksnb = await signInAs(ACCOUNTS.ksnb);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`UPDATE system_parameters SET value = NULL
                 WHERE param_key = 'ksnb.near_limit_percent' AND scope_type = 'global'`;
      await sql`DELETE FROM approvals WHERE title = ${TEST_PREFIX + ' Bất thường duyệt'}`;
      await sql`DELETE FROM construction_sites WHERE id = ${ids.site!}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Bất thường%'}`;
      await sql`DELETE FROM opportunities WHERE id = ${ids.opp!}`;
      await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + ' Bất thường%'}`;
    });
  });

  async function list(): Promise<Row[]> {
    const { data, error } = await ksnb.rpc('ksnb_anomalies', {});
    expect(error).toBeNull();
    return (data ?? []) as Row[];
  }

  it('Kế toán, Kinh doanh, Thi công bị từ chối', async () => {
    for (const email of [ACCOUNTS.ketoan, ACCOUNTS.kinhDoanhNvc, ACCOUNTS.congTruongNvc]) {
      const c = await signInAs(email);
      const { error } = await c.rpc('ksnb_anomalies', {});
      expect(error?.message).toContain('Kiểm soát nội bộ');
    }
  });

  it('bỏ qua khảo sát, phát sinh khẩn cấp, mốc bị trả lại hiện đúng hồ sơ kèm đường dẫn', async () => {
    const rows = await list();
    const waived = rows.find((r) => r.kind === 'bo_qua_khao_sat' && r.entity_id === ids.opp);
    expect(waived?.link).toBe(`/crm/co-hoi/${ids.opp}`);
    expect(waived?.detail).toContain('Khách quen');
    const emergency = rows.find(
      (r) => r.kind === 'phat_sinh_khan_cap' && r.entity_id === ids.amendment,
    );
    expect(emergency?.detail).toContain('Nguy cơ sập');
    const returned = rows.find((r) => r.kind === 'moc_tra_lai' && r.entity_id === ids.site);
    expect(returned?.link).toBe(`/tc/cong-trinh/${ids.site}?tab=moc`);
  });

  it('chưa đặt ngưỡng thì không liệt kê duyệt sát hạn mức; đặt 90 % thì liệt kê ca 95 %', async () => {
    const near = (rows: Row[]) =>
      rows.filter((r) => r.kind === 'duyet_sat_han_muc' && r.entity_id === ids.approvalEntity);
    expect(near(await list())).toHaveLength(0);
    await withSql(
      (sql) => sql`UPDATE system_parameters SET value = '90'::jsonb
                    WHERE param_key = 'ksnb.near_limit_percent' AND scope_type = 'global'`,
    );
    const rows = near(await list());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.detail).toContain('95%');
  });
});
