/**
 * Gói thầu tự sang bước khi đã làm việc của bước (migration 0226).
 *
 * Trước 0226 không đường nào đưa gói thầu vào Khảo sát / Bóc tách / Lập dự toán — gói thầu đang lập dự toán vẫn ghi
 * «Tiếp nhận hồ sơ». Canh: người Đấu thầu lưu ghi chú khảo sát (qua trình duyệt, đi qua trigger chặn sửa bước tay của
 * 0028) thì sang Khảo sát; dòng khối lượng đầu tiên → Bóc tách (bỏ qua khảo sát được); dự toán → Lập dự toán; chỉ đi
 * tới, không đụng gói thầu đã gửi duyệt giá; người dùng vẫn không tự đặt bước được.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/goi-thau-tu-sang-buoc.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
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

let nvcId = '';

async function newProject(label: string, stage = 'tiep_nhan_ho_so'): Promise<string> {
  return withSql(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO bidding_projects (company_id, code, name, stage)
      VALUES (${nvcId}, ${'DA-TSB-' + label + '-' + Date.now()}, ${TEST_PREFIX + ' Tự sang bước ' + label},
              ${stage}::bidding_stage)
      RETURNING id`;
    return row!.id;
  });
}

async function stageOf(id: string): Promise<string> {
  return withSql(async (sql) => {
    const [row] = await sql<
      { stage: string }[]
    >`SELECT stage FROM bidding_projects WHERE id = ${id}`;
    return row!.stage;
  });
}

async function addBoq(client: SupabaseClient, projectId: string) {
  return client.from('boq_items').insert({
    company_id: nvcId,
    bidding_project_id: projectId,
    position: 1,
    name: 'Bê tông móng',
    unit: 'm3',
    quantity: 12,
  });
}

async function addEstimate(projectId: string): Promise<void> {
  await withSql(
    (sql) => sql`
      INSERT INTO estimates (company_id, bidding_project_id, code)
      VALUES (${nvcId}, ${projectId}, ${'DT-TSB-' + Date.now()})`,
  );
}

describeDb('Gói thầu tự sang bước (0226)', () => {
  let dt: SupabaseClient;

  beforeAll(async () => {
    nvcId = await withSql(async (sql) => {
      const [c] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      return c!.id;
    });
    dt = await signInAs(ACCOUNTS.dauThauNvc);
  });

  it('lưu ghi chú khảo sát → Khảo sát hiện trạng; khối lượng → Bóc tách; dự toán → Lập dự toán', async () => {
    const id = await newProject('A');
    const blank = await dt.from('bidding_projects').update({ survey_notes: '   ' }).eq('id', id);
    expect(blank.error).toBeNull();
    expect(await stageOf(id)).toBe('tiep_nhan_ho_so');

    const saved = await dt
      .from('bidding_projects')
      .update({ survey_notes: 'Mặt bằng chật, đường vào xe 10 tấn' })
      .eq('id', id);
    expect(saved.error).toBeNull();
    expect(await stageOf(id)).toBe('khao_sat');

    expect((await addBoq(dt, id)).error).toBeNull();
    expect(await stageOf(id)).toBe('boc_tach');

    await addEstimate(id);
    expect(await stageOf(id)).toBe('du_toan');

    const history = await withSql(
      (sql) => sql<{ to_stage: string }[]>`
        SELECT to_stage FROM stage_transitions WHERE entity_id = ${id} ORDER BY changed_at, id`,
    );
    expect(history.map((h) => h.to_stage)).toEqual([
      'tiep_nhan_ho_so',
      'khao_sat',
      'boc_tach',
      'du_toan',
    ]);
  });

  it('bỏ qua khảo sát được: có BOQ ngay từ đầu thì sang thẳng Bóc tách', async () => {
    const id = await newProject('B');
    expect((await addBoq(dt, id)).error).toBeNull();
    expect(await stageOf(id)).toBe('boc_tach');
  });

  it('chỉ đi tới: gói thầu đã gửi duyệt giá không bị kéo lùi khi thêm khối lượng / dự toán', async () => {
    const id = await newProject('C', 'cho_duyet_gia');
    await withSql(
      (sql) => sql`
      INSERT INTO boq_items (company_id, bidding_project_id, position, name, unit, quantity)
      VALUES (${nvcId}, ${id}, 1, 'Cốt thép', 'kg', 100)`,
    );
    await addEstimate(id);
    expect(await stageOf(id)).toBe('cho_duyet_gia');
  });

  it('người dùng vẫn không tự đặt bước được', async () => {
    const id = await newProject('D');
    const { error } = await dt.from('bidding_projects').update({ stage: 'du_toan' }).eq('id', id);
    expect(error?.message).toMatch(/Không đổi trực tiếp được trạng thái/);
    expect(await stageOf(id)).toBe('tiep_nhan_ho_so');
  });
});
