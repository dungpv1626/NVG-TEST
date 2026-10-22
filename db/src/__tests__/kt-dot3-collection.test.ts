/**
 * Đợt 3 — 3A: đợt thu gắn mốc thi công / biên bản nghiệm thu (migration 0195).
 *
 * Bất biến canh ở đây:
 *   · chỉ người chịu trách nhiệm hợp đồng hoặc Kế toán của pháp nhân gắn được căn cứ; căn cứ phải
 *     thuộc công trình của chính hợp đồng; chỉ đợt thanh toán mới gắn được;
 *   · «đến hạn thu» do máy ghi — không sửa tay;
 *   · mốc đạt / biên bản ký hai bên → đợt đến hạn thu, Kế toán và người chịu trách nhiệm được báo;
 *   · danh sách đợt thu chỉ cho người xem được Kế toán; tên mốc đi qua hàm (Kinh doanh không xem
 *     phân hệ Thi công) và chỉ cho người xem được hợp đồng.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/kt-dot3-collection.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  contractId: string;
  siteId: string;
  otherSiteMilestoneId: string;
  mongId: string;
  acceptanceId: string;
  percentTermId: string;
  amountTermId: string;
  scopeTermId: string;
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

async function seed(): Promise<Fixture> {
  return withSql(async (sql) => {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    const [kd] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
    const [cht] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
    const contracts = await sql<{ id: string }[]>`
      INSERT INTO contracts (company_id, code, title, type, stage, value, responsible_user_id, signed_date)
      VALUES
        (${nvo!.id}, ${'NVO-HD-THU-A-' + stamp}, ${TEST_PREFIX + ' Đợt thu A ' + stamp},
         'thi_cong', 'da_ky', 1000000000, ${kd!.id}, current_date),
        (${nvo!.id}, ${'NVO-HD-THU-B-' + stamp}, ${TEST_PREFIX + ' Đợt thu B ' + stamp},
         'thi_cong', 'da_ky', 500000000, ${kd!.id}, current_date)
      RETURNING id`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites
        (company_id, code, name, stage, contract_id, responsible_user_id, planned_start_date, planned_end_date)
      VALUES
        (${nvo!.id}, ${'NVO-CT-THU-A-' + stamp}, ${TEST_PREFIX + ' Đợt thu A ' + stamp},
         'dang_thi_cong', ${contracts[0]!.id}, ${cht!.id}, current_date, current_date + 90),
        (${nvo!.id}, ${'NVO-CT-THU-B-' + stamp}, ${TEST_PREFIX + ' Đợt thu B ' + stamp},
         'dang_thi_cong', ${contracts[1]!.id}, ${cht!.id}, current_date, current_date + 90)
      RETURNING id`;
    const [mong] = await sql<{ id: string }[]>`
      SELECT id FROM site_milestones WHERE construction_site_id = ${sites[0]!.id} AND step_key = 'mong'`;
    const [other] = await sql<{ id: string }[]>`
      SELECT id FROM site_milestones WHERE construction_site_id = ${sites[1]!.id} AND step_key = 'mong'`;
    const [acc] = await sql<{ id: string }[]>`
      INSERT INTO acceptance_records
        (company_id, construction_site_id, code, acceptance_type, status, stage_name, value, accepted_date, accepted_at)
      VALUES (${nvo!.id}, ${sites[0]!.id}, ${'NVO-NT-THU-' + stamp}, 'khach_hang', 'da_nghiem_thu',
              ${TEST_PREFIX + ' Phần thô'}, 400000000, current_date, now())
      RETURNING id`;
    const terms = await sql<{ id: string }[]>`
      INSERT INTO contract_terms (company_id, contract_id, term_type, description, amount, percent_value, position)
      VALUES
        (${nvo!.id}, ${contracts[0]!.id}, 'tien_do_thanh_toan', 'Hoàn thành móng', NULL, '30', '1'),
        (${nvo!.id}, ${contracts[0]!.id}, 'tien_do_thanh_toan', 'Hoàn thành phần thô', 400000000, NULL, '2'),
        (${nvo!.id}, ${contracts[0]!.id}, 'pham_vi', 'Phạm vi công việc', NULL, NULL, '3')
      RETURNING id`;
    return {
      contractId: contracts[0]!.id,
      siteId: sites[0]!.id,
      otherSiteMilestoneId: other!.id,
      mongId: mong!.id,
      acceptanceId: acc!.id,
      percentTermId: terms[0]!.id,
      amountTermId: terms[1]!.id,
      scopeTermId: terms[2]!.id,
    };
  });
}

async function dueAt(termId: string): Promise<string | null> {
  return withSql(async (sql) => {
    const [row] = await sql<{ collection_due_at: string | null }[]>`
      SELECT collection_due_at FROM contract_terms WHERE id = ${termId}`;
    return row!.collection_due_at;
  });
}

async function notices(client: SupabaseClient, termId: string) {
  const { count } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'collection_due')
    .eq('related_entity_id', termId);
  return count ?? 0;
}

describeDb('3A — đợt thu gắn mốc / biên bản (0195)', () => {
  let fx: Fixture;
  let ketoan: SupabaseClient;
  let kdNvo: SupabaseClient;
  let kdNvc: SupabaseClient;

  beforeAll(async () => {
    fx = await seed();
    [ketoan, kdNvo, kdNvc] = await Promise.all([
      signInAs(ACCOUNTS.ketoan),
      signInAs(ACCOUNTS.kinhDoanhNvo),
      signInAs(ACCOUNTS.kinhDoanhNvc),
    ]);
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM construction_sites WHERE name LIKE ${TEST_PREFIX + ' Đợt thu%'}`;
      await sql`DELETE FROM contracts WHERE title LIKE ${TEST_PREFIX + ' Đợt thu%'}`;
    });
  });

  it('người ngoài hợp đồng không gắn được; căn cứ phải thuộc công trình của hợp đồng; chỉ đợt thanh toán', async () => {
    const outsider = await kdNvc.rpc('link_collection_term', {
      p_term_id: fx.percentTermId,
      p_milestone_id: fx.mongId,
    });
    expect(outsider.error).not.toBeNull();

    const wrongSite = await ketoan.rpc('link_collection_term', {
      p_term_id: fx.percentTermId,
      p_milestone_id: fx.otherSiteMilestoneId,
    });
    expect(wrongSite.error!.message).toContain('không thuộc công trình');

    const scope = await ketoan.rpc('link_collection_term', {
      p_term_id: fx.scopeTermId,
      p_milestone_id: fx.mongId,
    });
    expect(scope.error!.message).toContain('Chỉ đợt');

    const ok = await ketoan.rpc('link_collection_term', {
      p_term_id: fx.percentTermId,
      p_milestone_id: fx.mongId,
    });
    expect(ok.error).toBeNull();
    expect(ok.data).toBeNull();
  });

  it('«đến hạn thu» không sửa tay được', async () => {
    const { error } = await kdNvo
      .from('contract_terms')
      .update({ collection_due_at: new Date().toISOString() })
      .eq('id', fx.amountTermId)
      .select('id');
    expect(error).not.toBeNull();
    expect(await dueAt(fx.amountTermId)).toBeNull();
  });

  it('mốc đạt → đợt đến hạn thu, Kế toán và người chịu trách nhiệm được báo, danh sách đúng số', async () => {
    expect(await dueAt(fx.percentTermId)).toBeNull();
    await withSql(
      (sql) => sql`
      UPDATE site_milestones SET status = 'dat', passed_at = now() WHERE id = ${fx.mongId}`,
    );
    expect(await dueAt(fx.percentTermId)).not.toBeNull();
    expect(await notices(ketoan, fx.percentTermId)).toBe(1);
    expect(await notices(kdNvo, fx.percentTermId)).toBe(1);

    const { data, error } = await ketoan.rpc('kt_collection_schedule');
    expect(error).toBeNull();
    const row = (
      (data ?? []) as { term_id: string; state: string; amount: number; basis_label: string }[]
    ).find((r) => r.term_id === fx.percentTermId);
    expect(row?.state).toBe('den_han');
    expect(Number(row?.amount)).toBe(300_000_000);
    expect(row?.basis_label).toContain('móng');
  });

  it('người chịu trách nhiệm gắn biên bản bằng cập nhật thường; ký hai bên → đến hạn thu', async () => {
    const { error } = await kdNvo
      .from('contract_terms')
      .update({ acceptance_record_id: fx.acceptanceId })
      .eq('id', fx.amountTermId)
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(await dueAt(fx.amountTermId)).toBeNull();

    await withSql(
      (sql) => sql`
      UPDATE acceptance_records SET signed_at = now() WHERE id = ${fx.acceptanceId}`,
    );
    expect(await dueAt(fx.amountTermId)).not.toBeNull();
    expect(await notices(ketoan, fx.amountTermId)).toBe(1);
  });

  it('danh sách đợt thu chỉ cho Kế toán; căn cứ chọn được chỉ cho người xem được hợp đồng', async () => {
    const kdList = await kdNvo.rpc('kt_collection_schedule');
    expect(kdList.error).not.toBeNull();

    const targets = await kdNvo.rpc('contract_collection_targets', {
      p_contract_id: fx.contractId,
    });
    expect(targets.error).toBeNull();
    const kinds = ((targets.data ?? []) as { kind: string }[]).map((t) => t.kind);
    expect(kinds.filter((k) => k === 'moc')).toHaveLength(7);
    expect(kinds).toContain('bien_ban');

    const outsider = await kdNvc.rpc('contract_collection_targets', {
      p_contract_id: fx.contractId,
    });
    expect(outsider.error).not.toBeNull();
  });

  it('quét nhắc theo ngày không mở cho trình duyệt', async () => {
    const { error } = await ketoan.rpc('scan_collection_reminders');
    expect(error).not.toBeNull();
  });
});
