/**
 * Tìm kiếm toàn hệ thống — `global_search` (AFD 5.3, migration `0057_global_search.sql`).
 *
 * SECURITY INVOKER: hàm không tự kiểm quyền, nó dựa hẳn vào RLS của từng bảng nguồn. Vì
 * vậy cái đáng test không phải là "hàm trả đúng cột" (chuyện đó tầm thường), mà là "một
 * người dùng KHÔNG thấy được hồ sơ của pháp nhân khác qua tìm kiếm" — đúng lỗ hổng dễ gặp
 * nhất khi thêm một cách đọc dữ liệu mới song song với danh sách đã có RLS.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  stamp: string;
  customerCode: string;
  opportunityCode: string;
  opportunityId: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  const customerCode = 'TESTSEARCH-KH-' + stamp;
  const opportunityCode = 'TESTSEARCH-CH-' + stamp;
  try {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;

    const [customer] = await sql<{ id: string }[]>`
      INSERT INTO customers (code, name)
      VALUES (${customerCode}, ${TEST_PREFIX + ' Khách tìm kiếm ' + stamp})
      RETURNING id
    `;

    const [opportunity] = await sql<{ id: string }[]>`
      INSERT INTO opportunities (company_id, code, customer_id, name)
      VALUES (${nvc!.id}, ${opportunityCode}, ${customer!.id},
              ${TEST_PREFIX + ' Cơ hội tìm kiếm ' + stamp})
      RETURNING id
    `;

    return {
      stamp,
      customerCode,
      opportunityCode,
      opportunityId: opportunity!.id,
    };
  } finally {
    await sql.end();
  }
}

async function cleanupFixture(): Promise<void> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    await sql`DELETE FROM opportunities WHERE name LIKE ${TEST_PREFIX + '%'}`;
    await sql`DELETE FROM customers WHERE name LIKE ${TEST_PREFIX + '%'}`;
  } finally {
    await sql.end();
  }
}

describeDb('global_search — tìm kiếm toàn hệ thống (Mẫu A qua RLS có sẵn)', () => {
  let fixture: Fixture;
  let kinhDoanhNvc: SupabaseClient;
  let kinhDoanhNvo: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    [kinhDoanhNvc, kinhDoanhNvo] = await Promise.all([
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.kinhDoanhNvo),
    ]);
  });

  afterAll(async () => {
    await cleanupFixture();
  });

  it('tìm theo mã trả đúng module, đúng đường dẫn chi tiết', async () => {
    const { data, error } = await kinhDoanhNvc.rpc('global_search', {
      p_query: fixture.opportunityCode,
    });
    expect(error).toBeNull();

    const rows = data as Array<Record<string, unknown>>;
    const hit = rows.find((r) => r.entity_id === fixture.opportunityId);
    expect(hit).toBeTruthy();
    expect(hit!.module_code).toBe('CRM');
    expect(hit!.entity_type).toBe('opportunity');
    expect(hit!.path).toBe(`/crm/co-hoi/${fixture.opportunityId}`);
  });

  // Đây là phép thử thật của SECURITY INVOKER: NVO không có quan hệ gì với cơ hội của NVC,
  // nên RLS Mẫu A của `opportunities` phải tự loại dòng này ra — không phải hàm tự lọc.
  it('vai trò của pháp nhân KHÁC không thấy cơ hội qua tìm kiếm (RLS Mẫu A)', async () => {
    const { data, error } = await kinhDoanhNvo.rpc('global_search', {
      p_query: fixture.opportunityCode,
    });
    expect(error).toBeNull();

    const rows = data as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.entity_id === fixture.opportunityId)).toBeUndefined();
  });

  // `customers` là bảng DÙNG CHUNG (CLAUDE.md 3.5, không có company_id) — cả hai vai trò
  // đều thấy được, khác với opportunities ở trên.
  it('khách hàng dùng chung thì cả hai pháp nhân đều tìm thấy', async () => {
    const [nvc, nvo] = await Promise.all([
      kinhDoanhNvc.rpc('global_search', { p_query: fixture.customerCode }),
      kinhDoanhNvo.rpc('global_search', { p_query: fixture.customerCode }),
    ]);
    expect(nvc.error).toBeNull();
    expect(nvo.error).toBeNull();

    for (const { data } of [nvc, nvo]) {
      const rows = data as Array<Record<string, unknown>>;
      const hit = rows.find((r) => r.code === fixture.customerCode);
      expect(hit).toBeTruthy();
      expect(hit!.module_code).toBe('CRM');
      expect(hit!.entity_type).toBe('customer');
    }
  });

  it('ô tìm kiếm rỗng thì trả về rỗng, không phải toàn bộ danh sách', async () => {
    const { data, error } = await kinhDoanhNvc.rpc('global_search', { p_query: '   ' });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
