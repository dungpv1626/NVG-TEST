/**
 * Đợt 2 — 2G: công trình bàn giao → mẫu nháp trong thư viện công trình mẫu (migration 0194).
 *
 * Bất biến canh ở đây:
 *   · công trình sang «Bảo hành» → đúng MỘT mẫu nháp, thông số lấy từ đầu bài thiết kế đã xác
 *     nhận, tên KHÔNG mang tên công trình (thường là tên chủ nhà); Thiết kế được báo;
 *   · mẫu nháp chỉ Thiết kế / Giám đốc thấy; Kinh doanh không thấy, không gửi khách được;
 *   · Thiết kế xem được ảnh của công trình đó khi đang có mẫu nháp — xác nhận xong thì thôi;
 *   · xác nhận cần ít nhất một ảnh + ảnh bìa; sửa thường không tự đổi trạng thái.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/showcase-draft.test.ts`
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

async function sqlRun<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

interface Fixture {
  siteId: string;
  siteCode: string;
  designProjectId: string | null;
}

async function seed(): Promise<Fixture> {
  return sqlRun(async (sql) => {
    const stamp = String(Date.now());
    const [nvo] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVO'`;
    // Một hồ sơ thiết kế NVO có đầu bài đã xác nhận (seed) — để kiểm thông số tự điền.
    const [dp] = await sql<{ id: string }[]>`
      SELECT db.design_project_id AS id
        FROM design_briefs db JOIN design_projects d ON d.id = db.design_project_id
       WHERE d.company_id = ${nvo!.id} AND db.is_current_version AND db.confirmed_at IS NOT NULL
         AND db.deleted_at IS NULL AND db.structured ? 'floors'
       LIMIT 1`;
    const code = 'NVO-CT-MAU-' + stamp;
    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, design_project_id)
      VALUES (${nvo!.id}, ${code}, ${TEST_PREFIX + ' Nhà anh Chủ Nhà ' + stamp}, 'nghiem_thu',
              current_date + 10, ${dp?.id ?? null})
      RETURNING id`;
    return { siteId: site!.id, siteCode: code, designProjectId: dp?.id ?? null };
  });
}

describeDb('2G — công trình bàn giao → mẫu nháp (0194)', () => {
  let f: Fixture;
  let tke: SupabaseClient;
  let kd: SupabaseClient;
  let tc: SupabaseClient;
  let itemId: string;
  let sitePhoto: string;

  beforeAll(async () => {
    f = await seed();
    tke = await signInAs(ACCOUNTS.thietKeNvo);
    kd = await signInAs(ACCOUNTS.kinhDoanhNvo);
    tc = await signInAs(ACCOUNTS.congTruongNvo);
    // Ảnh nhật ký của công trình — ứng viên cho mẫu.
    sitePhoto = `${f.siteId}/nhat-ky/${crypto.randomUUID()}.png`;
    const up = await tc.storage
      .from('construction-photos')
      .upload(sitePhoto, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
    if (up.error) throw new Error(up.error.message);
    await sqlRun(async (sql) => {
      await sql`
        INSERT INTO site_logs (company_id, construction_site_id, log_date, content, photo_urls)
        SELECT company_id, id, current_date, ${TEST_PREFIX + ' Hoàn thiện mặt tiền'}, ARRAY[${sitePhoto}]
          FROM construction_sites WHERE id = ${f.siteId}`;
      // Bàn giao: chuyển thẳng ở CSDL (luồng bàn giao đủ điều kiện đã có phép thử riêng).
      await sql`UPDATE construction_sites SET stage = 'bao_hanh', handed_over_at = now()
                 WHERE id = ${f.siteId}`;
    });
  });

  it('bàn giao → một mẫu nháp, thông số từ đầu bài, tên không mang tên công trình; Thiết kế được báo', async () => {
    const { data, error } = await tke
      .from('showcase_items')
      .select('id, title, status, kind, floors, land_area, completed_year, construction_site_id')
      .eq('construction_site_id', f.siteId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const item = data![0]!;
    itemId = item.id as string;
    expect(item.status).toBe('nhap');
    expect(item.title).toContain(f.siteCode);
    expect(item.title).not.toContain('Chủ Nhà');
    expect(item.completed_year).toBe(new Date().getFullYear());
    if (f.designProjectId) expect(item.floors).not.toBeNull();

    const { count } = await tke
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'showcase_draft')
      .eq('related_entity_id', itemId);
    expect(count).toBe(1);
  });

  it('chuyển bước lại không sinh mẫu thứ hai', async () => {
    await sqlRun(async (sql) => {
      await sql`UPDATE construction_sites SET stage = 'nghiem_thu' WHERE id = ${f.siteId}`;
      await sql`UPDATE construction_sites SET stage = 'bao_hanh' WHERE id = ${f.siteId}`;
    });
    const { data } = await tke
      .from('showcase_items')
      .select('id')
      .eq('construction_site_id', f.siteId);
    expect(data).toHaveLength(1);
  });

  it('Kinh doanh không thấy mẫu nháp và không gửi khách được', async () => {
    const { data } = await kd.from('showcase_items').select('id').eq('id', itemId);
    expect(data).toHaveLength(0);
    const share = await kd.from('showcase_shares').insert({
      item_ids: [itemId],
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(share.error).not.toBeNull();
  });

  it('Thiết kế thấy ảnh công trình làm ứng viên và mở được ảnh đó', async () => {
    const { data, error } = await tke.rpc('showcase_draft_photo_candidates', { p_item_id: itemId });
    expect(error).toBeNull();
    expect((data as { path: string }[]).map((r) => r.path)).toContain(sitePhoto);
    const signed = await tke.storage.from('construction-photos').createSignedUrl(sitePhoto, 60);
    expect(signed.error).toBeNull();
    // Kinh doanh thì không.
    const kdCandidates = await kd.rpc('showcase_draft_photo_candidates', { p_item_id: itemId });
    expect(kdCandidates.error).not.toBeNull();
  });

  it('sửa thường không tự đưa vào kho; xác nhận cần ảnh + ảnh bìa', async () => {
    const edit = await tke
      .from('showcase_items')
      .update({ title: `${TEST_PREFIX} Nhà phố 4 tầng mẫu`, status: 'da_xac_nhan' })
      .eq('id', itemId)
      .select('status')
      .single();
    expect(edit.data!.status).toBe('nhap');

    const noPhoto = await tke.rpc('confirm_showcase_draft', { p_item_id: itemId });
    expect(noPhoto.error!.message).toContain('ít nhất một ảnh');

    const path = `${itemId}/${crypto.randomUUID()}.png`;
    expect(
      (
        await tke.storage
          .from('showcase')
          .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' })
      ).error,
    ).toBeNull();
    const media = await tke
      .from('showcase_media')
      .insert({ item_id: itemId, storage_path: path, kind: 'anh_thuc_te' })
      .select('id')
      .single();
    expect(media.error).toBeNull();

    const noCover = await tke.rpc('confirm_showcase_draft', { p_item_id: itemId });
    expect(noCover.error!.message).toContain('ảnh bìa');

    await tke.from('showcase_items').update({ cover_media_id: media.data!.id }).eq('id', itemId);
    const ok = await tke.rpc('confirm_showcase_draft', { p_item_id: itemId });
    expect(ok.error).toBeNull();
  });

  it('đã vào kho: Kinh doanh thấy; Thiết kế thôi đọc được ảnh công trình', async () => {
    const { data } = await kd.from('showcase_items').select('status').eq('id', itemId).single();
    expect(data!.status).toBe('da_xac_nhan');
    const signed = await tke.storage.from('construction-photos').createSignedUrl(sitePhoto, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });
});
