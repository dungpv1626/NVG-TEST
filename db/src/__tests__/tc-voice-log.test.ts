/**
 * Đợt 2 — 2B: nhật ký công trường bằng giọng nói (migration 0190).
 *
 * Đoạn ghi âm là bằng chứng gốc của mục nhật ký: tệp đi theo công trình ở thư mục đầu, cùng hàng
 * rào Mẫu A + E với nhật ký — chỉ huy trưởng chỉ ghi và chỉ nghe được đoạn ghi âm của công trình
 * được giao; Kinh doanh không ghi được; không ai xoá được. Mục nhật ký không được trỏ vào đoạn
 * ghi âm của công trình khác.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-voice-log.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, anonClient, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const BUCKET = 'site-log-audio';
const AUDIO = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);

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
        (${nvc!.id}, ${'NVC-CT-NOI-A-' + stamp}, ${TEST_PREFIX + ' Công trình nói A ' + stamp}, current_date + 90),
        (${nvc!.id}, ${'NVC-CT-NOI-B-' + stamp}, ${TEST_PREFIX + ' Công trình nói B ' + stamp}, current_date + 90)
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
    .upload(path, new Blob([AUDIO], { type: 'audio/webm' }), { contentType: 'audio/webm' });
}

describeDb('2B — nhật ký giọng nói theo phạm vi công trình (0190)', () => {
  let fixture: Fixture;
  let chiHuy: SupabaseClient;
  let vanPhong: SupabaseClient;
  let audioB: string;

  beforeAll(async () => {
    fixture = await seedFixture();
    chiHuy = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    audioB = `${fixture.siteB}/${crypto.randomUUID()}.webm`;
    const { error } = await upload(vanPhong, audioB);
    if (error) throw new Error(`Văn phòng Thi công không tải được ghi âm B: ${error.message}`);
  });

  it('CHT ghi âm công trình được giao, lưu nhật ký kèm đoạn ghi âm + bản chép chữ', async () => {
    const path = `${fixture.siteA}/${crypto.randomUUID()}.webm`;
    expect((await upload(chiHuy, path)).error).toBeNull();

    const { data, error } = await chiHuy
      .from('site_logs')
      .insert({
        company_id: fixture.companyId,
        construction_site_id: fixture.siteA,
        log_date: new Date().toISOString().slice(0, 10),
        content: `${TEST_PREFIX} Việc đã làm: xong cốp pha dầm sàn tầng 2.`,
        voice_path: path,
        voice_transcript: 'Hôm nay xong cốp pha dầm sàn tầng hai.',
        ai_drafted: true,
      })
      .select('voice_path, voice_transcript, ai_drafted')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      voice_path: path,
      voice_transcript: 'Hôm nay xong cốp pha dầm sàn tầng hai.',
      ai_drafted: true,
    });

    const signed = await chiHuy.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
  });

  it('CHT KHÔNG ghi âm lên công trình không được giao, không nghe được ghi âm của nó', async () => {
    expect(
      (await upload(chiHuy, `${fixture.siteB}/${crypto.randomUUID()}.webm`)).error,
    ).toBeTruthy();
    const signed = await chiHuy.storage.from(BUCKET).createSignedUrl(audioB, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });

  it('Kinh doanh KHÔNG ghi âm nhật ký công trường', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    expect((await upload(kd, `${fixture.siteA}/${crypto.randomUUID()}.webm`)).error).toBeTruthy();
  });

  it('nhật ký KHÔNG trỏ được vào đoạn ghi âm của công trình khác', async () => {
    const { error } = await vanPhong.from('site_logs').insert({
      company_id: fixture.companyId,
      construction_site_id: fixture.siteA,
      log_date: new Date().toISOString().slice(0, 10),
      content: `${TEST_PREFIX} Nhật ký gắn nhầm ghi âm công trình khác.`,
      voice_path: audioB,
    });
    expect(error!.message).toContain('không thuộc công trình');
  });

  it('không ai xoá được đoạn ghi âm — kể cả người đã tải lên', async () => {
    await vanPhong.storage.from(BUCKET).remove([audioB]);
    const still = await vanPhong.storage.from(BUCKET).createSignedUrl(audioB, 60);
    expect(still.error).toBeNull();
  });

  it('khách vô danh KHÔNG tải lên và không nghe được', async () => {
    const anon = anonClient();
    expect((await upload(anon, `${fixture.siteA}/x.webm`)).error).toBeTruthy();
    const signed = await anon.storage.from(BUCKET).createSignedUrl(audioB, 60);
    expect(signed.data?.signedUrl ?? null).toBeNull();
  });
});
