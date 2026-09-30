/**
 * TC-05 — ảnh hiện trường của nhật ký công trường (migration 0135).
 *
 * Tệp ảnh đi theo công trình ở thư mục đầu, cùng hàng rào Mẫu A + E với chính nhật ký: chỉ huy
 * trưởng chỉ tải lên và chỉ xem được ảnh của công trình được giao. Nhật ký không được trỏ vào
 * ảnh nằm dưới thư mục công trình khác — nếu không, quyền đọc tệp và quyền đọc nhật ký sẽ nói
 * hai điều khác nhau.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-photos.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, anonClient, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const BUCKET = 'construction-photos';

// Ảnh PNG 1×1 điểm ảnh — đủ để Storage nhận là ảnh.
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

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      VALUES
        (${nvc!.id}, ${'NVC-CT-ANH-A-' + stamp}, ${TEST_PREFIX + ' Công trình ảnh A ' + stamp}, current_date + 90),
        (${nvc!.id}, ${'NVC-CT-ANH-B-' + stamp}, ${TEST_PREFIX + ' Công trình ảnh B ' + stamp}, current_date + 90)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${sites[0]!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvc}`;
    return { companyId: nvc!.id, siteA: sites[0]!.id, siteB: sites[1]!.id };
  } finally {
    await sql.end();
  }
}

async function upload(client: SupabaseClient, path: string) {
  return client.storage
    .from(BUCKET)
    .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
}

describeDb('TC-05 — ảnh hiện trường theo phạm vi công trình (0135)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let vanPhong: SupabaseClient;
  let chiHuyId: string;
  let photoB: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    chiHuyId = (await chiHuy.rpc('auth_user_id')).data as string;
    photoB = `${fixture.siteB}/nhat-ky/${crypto.randomUUID()}.png`;
    const { error } = await upload(vanPhong, photoB);
    if (error) throw new Error(`Văn phòng không tải được ảnh công trình B: ${error.message}`);
  });

  it('CHT tải ảnh lên công trình được giao và ghi nhật ký kèm ảnh', async () => {
    const path = `${fixture.siteA}/nhat-ky/${crypto.randomUUID()}.png`;
    expect((await upload(chiHuy, path)).error).toBeNull();

    const { error } = await chiHuy.from('site_logs').insert({
      company_id: fixture.companyId,
      construction_site_id: fixture.siteA,
      log_date: new Date().toISOString().slice(0, 10),
      content: `${TEST_PREFIX} Đổ bê tông giằng móng, ảnh kèm theo.`,
      logged_by: chiHuyId,
      photo_urls: [path],
    });
    expect(error).toBeNull();

    const signed = await chiHuy.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
  });

  it('CHT KHÔNG tải ảnh lên công trình không được giao', async () => {
    const { error } = await upload(chiHuy, `${fixture.siteB}/nhat-ky/${crypto.randomUUID()}.png`);
    expect(error).toBeTruthy();
  });

  it('CHT KHÔNG mở được ảnh của công trình không được giao', async () => {
    const signed = await chiHuy.storage.from(BUCKET).createSignedUrl(photoB, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });

  it('nhật ký KHÔNG trỏ được vào ảnh nằm dưới thư mục công trình khác', async () => {
    const { error } = await vanPhong.from('site_logs').insert({
      company_id: fixture.companyId,
      construction_site_id: fixture.siteA,
      log_date: new Date().toISOString().slice(0, 10),
      content: `${TEST_PREFIX} Nhật ký gắn nhầm ảnh công trình khác.`,
      logged_by: (await vanPhong.rpc('auth_user_id')).data as string,
      photo_urls: [photoB],
    });
    expect(error!.message).toContain('không thuộc công trình');
  });

  it('khách vô danh KHÔNG tải và không đọc được ảnh', async () => {
    const anon = anonClient();
    expect((await upload(anon, `${fixture.siteA}/nhat-ky/x.png`)).error).toBeTruthy();
    const signed = await anon.storage.from(BUCKET).createSignedUrl(photoB, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });
});
