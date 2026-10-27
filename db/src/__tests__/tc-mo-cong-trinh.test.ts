/**
 * Trưởng phòng Thi công và Chỉ huy trưởng mở công trình từ hợp đồng (0230, câu 5).
 *
 * Thi công không xem phân hệ Hợp đồng, nên `contracts_awaiting_site` chỉ trả đủ để nhận ra hợp đồng — không giá trị.
 * Canh: TC thấy hợp đồng đã ký chờ mở; Kinh doanh (không phê duyệt Thi công / Hợp đồng) không thấy gì; Chỉ huy trưởng mở
 * được và — khi tự ghi mình phụ trách — thấy ngay công trình vừa mở; mở xong hợp đồng rời danh sách.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-mo-cong-trinh.test.ts`
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

describeDb('Thi công mở công trình từ hợp đồng (0230)', () => {
  let tc: SupabaseClient;
  let cht: SupabaseClient;
  let kd: SupabaseClient;
  let contractId = '';
  let chtId = '';

  beforeAll(async () => {
    [tc, cht, kd] = await Promise.all([
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
    ]);
    await withSql(async (sql) => {
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      chtId = u!.id;
      const [c] = await sql<{ id: string }[]>`
        INSERT INTO contracts (company_id, code, contract_number, title, type, stage, value, signed_date)
        VALUES (${nvc!.id}, ${'NVC-HD-MCT-' + Date.now()}, '09/2026/HĐTC', ${TEST_PREFIX + ' Chờ mở công trình'},
                'thi_cong', 'da_ky', 5000000000, current_date)
        RETURNING id`;
      contractId = c!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`UPDATE construction_sites SET deleted_at = now() WHERE contract_id = ${contractId}`;
    });
  });

  it('Trưởng phòng Thi công thấy hợp đồng chờ mở, không kèm giá trị; Kinh doanh không thấy', async () => {
    const { data, error } = await tc.rpc('contracts_awaiting_site');
    expect(error).toBeNull();
    const row = (data as Record<string, unknown>[]).find((r) => r.contract_id === contractId);
    expect(row).toMatchObject({ contract_number: '09/2026/HĐTC' });
    expect(row).not.toHaveProperty('value');

    const other = await kd.rpc('contracts_awaiting_site');
    expect(
      ((other.data ?? []) as { contract_id: string }[]).some((r) => r.contract_id === contractId),
    ).toBe(false);
  });

  it('Chỉ huy trưởng mở được, tự ghi phụ trách thì thấy ngay công trình; hợp đồng rời danh sách', async () => {
    const opened = await cht.rpc('open_site_from_contract', {
      p_contract_id: contractId,
      p_responsible_user_id: chtId,
    });
    expect(opened.error).toBeNull();
    const siteId = opened.data as string;
    const { data: sites } = await cht.from('construction_sites').select('id').eq('id', siteId);
    expect(sites).toHaveLength(1);

    const after = await tc.rpc('contracts_awaiting_site');
    expect(
      ((after.data ?? []) as { contract_id: string }[]).some((r) => r.contract_id === contractId),
    ).toBe(false);
  });
});
