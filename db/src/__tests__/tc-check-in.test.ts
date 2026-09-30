/**
 * Điểm danh bằng ảnh tại công trường (migration 0139) — bằng chứng có mặt, chưa phải chấm công.
 *
 * Canh bốn điều làm bản ghi đáng tin hơn ảnh gửi qua Zalo: giờ do máy chủ đặt, người điểm danh
 * là chính người đăng nhập, không sửa / xoá được, và chỉ điểm danh ở công trình được giao.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-check-in.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, anonClient, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
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
        (${nvc!.id}, ${'NVC-CT-DD-A-' + stamp}, ${TEST_PREFIX + ' Công trình điểm danh A ' + stamp}, current_date + 90),
        (${nvc!.id}, ${'NVC-CT-DD-B-' + stamp}, ${TEST_PREFIX + ' Công trình điểm danh B ' + stamp}, current_date + 90)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${sites[0]!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvc}`;
    return { siteA: sites[0]!.id, siteB: sites[1]!.id };
  } finally {
    await sql.end();
  }
}

function row(siteId: string, extra: Record<string, unknown> = {}) {
  return {
    construction_site_id: siteId,
    photo_path: `${siteId}/diem-danh/${crypto.randomUUID()}.jpg`,
    location_status: 'khong_cho_phep',
    client_created_at: new Date().toISOString(),
    ...extra,
  };
}

describeDb('Điểm danh bằng ảnh tại công trường (0139)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let vanPhong: SupabaseClient;
  let chiHuyId: string;
  let vanPhongId: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    chiHuyId = (await chiHuy.rpc('auth_user_id')).data as string;
    vanPhongId = (await vanPhong.rpc('auth_user_id')).data as string;
  });

  it('CHT điểm danh ở công trình được giao, kèm vị trí', async () => {
    const { data, error } = await chiHuy
      .from('site_check_ins')
      .insert(
        row(fixture.siteA, {
          location_status: 'co_vi_tri',
          latitude: 20.4,
          longitude: 106.4,
          accuracy_m: 25,
        }),
      )
      .select('user_id, company_id, latitude')
      .single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(chiHuyId);
    expect(Number(data!.latitude)).toBeCloseTo(20.4);
  });

  it('không điểm danh hộ, không lùi giờ: người và giờ do máy chủ đặt', async () => {
    const past = '2026-01-01T07:00:00Z';
    const { data, error } = await chiHuy
      .from('site_check_ins')
      .insert(row(fixture.siteA, { user_id: vanPhongId, checked_in_at: past }))
      .select('user_id, checked_in_at, client_created_at')
      .single();
    expect(error).toBeNull();
    expect(data!.user_id).toBe(chiHuyId);
    expect(new Date(data!.checked_in_at as string).getTime()).toBeGreaterThan(
      Date.now() - 5 * 60_000,
    );
  });

  it('CHT KHÔNG điểm danh được ở công trình không được giao', async () => {
    const { error } = await chiHuy.from('site_check_ins').insert(row(fixture.siteB));
    expect(error).not.toBeNull();
  });

  it('ảnh phải nằm trong thư mục điểm danh của đúng công trình', async () => {
    const { error } = await chiHuy
      .from('site_check_ins')
      .insert(row(fixture.siteA, { photo_path: `${fixture.siteB}/diem-danh/x.jpg` }));
    expect(error!.message).toContain('không thuộc công trình');
  });

  it('khai có vị trí thì phải có toạ độ', async () => {
    const { error } = await chiHuy
      .from('site_check_ins')
      .insert(row(fixture.siteA, { location_status: 'co_vi_tri' }));
    expect(error).not.toBeNull();
  });

  it('điểm danh đã ghi không sửa, không xoá được', async () => {
    const { data } = await chiHuy
      .from('site_check_ins')
      .insert(row(fixture.siteA))
      .select('id')
      .single();
    const id = (data as { id: string }).id;
    await chiHuy.from('site_check_ins').update({ note: 'sửa' }).eq('id', id);
    await chiHuy.from('site_check_ins').delete().eq('id', id);
    const { data: still } = await chiHuy
      .from('site_check_ins')
      .select('id, note')
      .eq('id', id)
      .single();
    expect(still).toEqual({ id, note: null });

    const { createConnection } = await import('../client');
    const { sql } = createConnection();
    try {
      await expect(sql`DELETE FROM site_check_ins WHERE id = ${id}`).rejects.toThrow('bằng chứng');
    } finally {
      await sql.end();
    }
  });

  it('văn phòng thi công xem được điểm danh; khách chưa đăng nhập thì không', async () => {
    const { data } = await vanPhong
      .from('site_check_ins')
      .select('id')
      .eq('construction_site_id', fixture.siteA);
    expect((data ?? []).length).toBeGreaterThan(0);
    const { data: anon } = await anonClient().from('site_check_ins').select('id').limit(1);
    expect(anon ?? []).toEqual([]);
  });

  it('CHT không xem được điểm danh của công trình không được giao', async () => {
    await vanPhong.from('site_check_ins').insert(row(fixture.siteB));
    const { data } = await chiHuy
      .from('site_check_ins')
      .select('id')
      .eq('construction_site_id', fixture.siteB);
    expect(data).toEqual([]);
  });
});
