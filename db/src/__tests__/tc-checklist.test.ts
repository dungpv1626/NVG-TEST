/**
 * TC-13 — nghiệm thu có danh mục kiểm tra và ảnh từng mục (migration 0136).
 *
 * Canh:
 *  1. Biên bản và kết quả từng mục ghi CÙNG một giao dịch — không có biên bản đã ký mà thiếu
 *     phần kiểm tra.
 *  2. Mục bắt buộc ảnh phải có ảnh đúng công trình; có mục Không đạt thì phải ghi tồn tại.
 *  3. Kết quả đã ký không sửa được, kể cả ghi thẳng bằng kết nối quản trị.
 *  4. Lỗ Mẫu E cũ: chỉ huy trưởng lập được biên bản cho công trình KHÔNG được giao.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-checklist.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

interface Fixture {
  companyId: string;
  siteA: string;
  siteB: string;
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
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      VALUES
        (${nvc!.id}, ${'NVC-CT-NT-A-' + stamp}, ${TEST_PREFIX + ' Công trình nghiệm thu A ' + stamp}, current_date + 90),
        (${nvc!.id}, ${'NVC-CT-NT-B-' + stamp}, ${TEST_PREFIX + ' Công trình nghiệm thu B ' + stamp}, current_date + 90)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${sites[0]!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvc}`;
    return { companyId: nvc!.id, siteA: sites[0]!.id, siteB: sites[1]!.id };
  });
}

describeDb('TC-13 — nghiệm thu có danh mục kiểm tra (0136)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let vanPhong: SupabaseClient;
  let checklistId: string;
  let photo: string;

  function results(over: Record<string, unknown>[] = []) {
    const base = [
      { key: 'kich_thuoc', result: 'dat', photo_paths: [photo] },
      { key: 've_sinh', result: 'dat', photo_paths: [] },
    ];
    return base.map((r, i) => ({ ...r, ...(over[i] ?? {}) }));
  }

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);

    const { data, error } = await vanPhong
      .from('acceptance_checklists')
      .insert({
        company_id: fixture.companyId,
        name: `${TEST_PREFIX} Nghiệm thu cốt thép ${Date.now()}`,
        items: [
          {
            key: 'kich_thuoc',
            label: 'Đường kính, số lượng thanh đúng bản vẽ',
            requires_photo: true,
          },
          { key: 've_sinh', label: 'Cốt thép sạch gỉ, sạch dầu', requires_photo: false },
        ],
      })
      .select('id')
      .single();
    if (error) throw new Error(`Không lập được danh mục kiểm tra: ${error.message}`);
    checklistId = (data as { id: string }).id;

    photo = `${fixture.siteA}/nghiem-thu/${crypto.randomUUID()}.png`;
    const up = await chiHuy.storage
      .from('construction-photos')
      .upload(photo, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
    if (up.error) throw new Error(`Không tải được ảnh nghiệm thu: ${up.error.message}`);
  });

  it('CHT lập biên bản kèm kết quả từng mục và ảnh', async () => {
    const { data: id, error } = await chiHuy.rpc('record_acceptance_with_checklist', {
      p_site_id: fixture.siteA,
      p_acceptance_type: 'noi_bo',
      p_stage_name: `${TEST_PREFIX} Cốt thép móng M1–M6`,
      p_checklist_id: checklistId,
      p_results: results(),
    });
    expect(error).toBeNull();

    const { data: rows } = await chiHuy
      .from('acceptance_checklist_results')
      .select('item_label, result, photo_paths')
      .eq('acceptance_record_id', id as string)
      .order('position');
    expect(rows).toHaveLength(2);
    expect(rows![0]!.item_label).toBe('Đường kính, số lượng thanh đúng bản vẽ');
    expect(rows![0]!.photo_paths).toEqual([photo]);
  });

  it('mục bắt buộc ảnh mà thiếu ảnh thì không ký được — và không để lại biên bản nào', async () => {
    const stage = `${TEST_PREFIX} Thiếu ảnh ${Date.now()}`;
    const { error } = await chiHuy.rpc('record_acceptance_with_checklist', {
      p_site_id: fixture.siteA,
      p_acceptance_type: 'noi_bo',
      p_stage_name: stage,
      p_checklist_id: checklistId,
      p_results: results([{ photo_paths: [] }]),
    });
    expect(error!.message).toContain('cần ít nhất một ảnh');
    const { data } = await chiHuy.from('acceptance_records').select('id').eq('stage_name', stage);
    expect(data).toEqual([]);
  });

  it('có mục Không đạt thì phải ghi tồn tại cần khắc phục', async () => {
    const { error } = await chiHuy.rpc('record_acceptance_with_checklist', {
      p_site_id: fixture.siteA,
      p_acceptance_type: 'noi_bo',
      p_stage_name: `${TEST_PREFIX} Có mục không đạt`,
      p_checklist_id: checklistId,
      p_results: results([{}, { result: 'khong_dat' }]),
    });
    expect(error!.message).toContain('ghi rõ tồn tại');
  });

  it('ảnh nằm dưới thư mục công trình khác bị từ chối', async () => {
    const { error } = await chiHuy.rpc('record_acceptance_with_checklist', {
      p_site_id: fixture.siteA,
      p_acceptance_type: 'noi_bo',
      p_stage_name: `${TEST_PREFIX} Ảnh công trình khác`,
      p_checklist_id: checklistId,
      p_results: results([{ photo_paths: [`${fixture.siteB}/nghiem-thu/x.png`] }]),
    });
    expect(error!.message).toContain('không thuộc công trình');
  });

  it('CHT KHÔNG lập được biên bản cho công trình không được giao (lỗ Mẫu E cũ)', async () => {
    const { error } = await chiHuy.rpc('record_acceptance', {
      p_site_id: fixture.siteB,
      p_acceptance_type: 'noi_bo',
      p_stage_name: `${TEST_PREFIX} Công trình không được giao`,
    });
    expect(error!.message).toContain('Không thao tác được trên công trình này');
  });

  it('kết quả đã ký không sửa được, kể cả bằng kết nối quản trị', async () => {
    const attempt = withSql(
      (sql) => sql`
        UPDATE acceptance_checklist_results SET result = 'khong_dat'
        WHERE acceptance_record_id IN (
          SELECT id FROM acceptance_records WHERE construction_site_id = ${fixture.siteA})`,
    );
    await expect(attempt).rejects.toThrow('đã ký');
  });

  it('chỉ huy trưởng không tự soạn danh mục kiểm tra', async () => {
    const { error } = await chiHuy.from('acceptance_checklists').insert({
      company_id: fixture.companyId,
      name: `${TEST_PREFIX} Danh mục do CHT tự soạn`,
      items: [{ key: 'a', label: 'A', requires_photo: false }],
    });
    expect(error).toBeTruthy();
  });
});
