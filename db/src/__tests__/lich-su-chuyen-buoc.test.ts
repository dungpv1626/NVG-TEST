/**
 * Lịch sử chuyển bước chung của hợp đồng / gói thầu / công trình (`stage_transitions` — migration 0225).
 *
 * Canh ba chỗ: mọi đường đổi bước đều được ghi (trigger trên bảng, kèm lý do vừa nhập), người không xem được hồ sơ thì
 * không xem được lịch sử của nó (kể cả phạm vi công trường — Mẫu E), và không ai ghi lịch sử từ trình duyệt.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/lich-su-chuyen-buoc.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Transition {
  entity_id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
}

interface Fixture {
  siteMine: string;
  siteOther: string;
  contract: string;
  bidding: string;
}

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function seedFixture(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const [cht] = await sql<
      { id: string }[]
    >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
      VALUES
        (${nvo!.id}, ${'NVO-CT-LS-A-' + stamp}, ${TEST_PREFIX + ' Lịch sử A ' + stamp}, 'dang_thi_cong', current_date + 90, ${cht!.id}),
        (${nvo!.id}, ${'NVO-CT-LS-B-' + stamp}, ${TEST_PREFIX + ' Lịch sử B ' + stamp}, 'dang_thi_cong', current_date + 90, NULL)
      RETURNING id`;
    for (const s of sites) {
      await sql`UPDATE construction_sites SET stage = 'tam_dung', pause_reason = 'Chờ giấy phép xây dựng' WHERE id = ${s.id}`;
      await sql`UPDATE construction_sites SET notes = 'Sửa ghi chú, không đổi bước' WHERE id = ${s.id}`;
      await sql`UPDATE construction_sites SET stage = 'dang_thi_cong' WHERE id = ${s.id}`;
    }
    const [contract] = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage)
      VALUES (${nvo!.id}, ${'HDTEST-LS-' + stamp}, ${TEST_PREFIX + ' Lịch sử hợp đồng ' + stamp}, 'thi_cong', 'nhap')
      RETURNING id`;
    await sql`UPDATE contracts SET stage = 'huy', cancel_reason = 'Khách đổi ý' WHERE id = ${contract!.id}`;
    const [bidding] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name)
      VALUES (${nvc!.id}, ${'DA-LS-' + stamp}, ${TEST_PREFIX + ' Lịch sử gói thầu ' + stamp})
      RETURNING id`;
    await sql`UPDATE bidding_projects SET stage = 'truot_thau', lost_reason = 'Giá cao hơn đối thủ' WHERE id = ${bidding!.id}`;
    return {
      siteMine: sites[0]!.id,
      siteOther: sites[1]!.id,
      contract: contract!.id,
      bidding: bidding!.id,
    };
  });
}

async function history(client: SupabaseClient, ids: string[]): Promise<Transition[]> {
  const { data, error } = await client
    .from('stage_transitions')
    .select('entity_id, from_stage, to_stage, note')
    .in('entity_id', ids)
    .order('changed_at')
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as Transition[];
}

async function rows(ids: string[]): Promise<Transition[]> {
  return withSql(
    (sql) => sql<Transition[]>`
      SELECT entity_id, from_stage, to_stage, note FROM stage_transitions
       WHERE entity_id = ANY(${ids}::uuid[]) ORDER BY changed_at, id`,
  );
}

describeDb('Lịch sử chuyển bước (0225)', () => {
  let f: Fixture;
  let cht: SupabaseClient;
  let kd: SupabaseClient;

  beforeAll(async () => {
    f = await seedFixture();
    cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
  });

  it('ghi lần tạo và mỗi lần đổi bước kèm lý do vừa nhập; sửa không đổi bước thì không ghi', async () => {
    const site = (await rows([f.siteMine])).map((r) => [r.from_stage, r.to_stage, r.note]);
    expect(site).toEqual([
      [null, 'dang_thi_cong', null],
      ['dang_thi_cong', 'tam_dung', 'Chờ giấy phép xây dựng'],
      ['tam_dung', 'dang_thi_cong', null],
    ]);
    expect((await rows([f.contract])).map((r) => [r.to_stage, r.note])).toEqual([
      ['nhap', null],
      ['huy', 'Khách đổi ý'],
    ]);
    expect((await rows([f.bidding])).at(-1)).toMatchObject({
      from_stage: 'tiep_nhan_ho_so',
      to_stage: 'truot_thau',
      note: 'Giá cao hơn đối thủ',
    });
  });

  it('chỉ huy trưởng chỉ đọc lịch sử công trình được phân công', async () => {
    const seen = new Set((await history(cht, [f.siteMine, f.siteOther])).map((r) => r.entity_id));
    expect([...seen]).toEqual([f.siteMine]);
  });

  it('người không xem được Thi công không đọc được lịch sử công trình, vẫn đọc được lịch sử hợp đồng', async () => {
    expect(await history(kd, [f.siteMine, f.siteOther])).toEqual([]);
    expect((await history(kd, [f.contract])).length).toBe(2);
  });

  it('không ai ghi lịch sử từ trình duyệt', async () => {
    const { error } = await kd.from('stage_transitions').insert({
      company_id: '00000000-0000-0000-0000-000000000000',
      entity_type: 'contracts',
      entity_id: f.contract,
      to_stage: 'da_ky',
    });
    expect(error).not.toBeNull();
    expect((await rows([f.contract])).length).toBe(2);
  });
});
