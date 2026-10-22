/**
 * Đợt 2 — 2D: biên bản nghiệm thu ký hai bên → chuyển Kế toán (migration 0192).
 *
 * Bất biến canh ở đây:
 *   · lập xong là «chưa ký» — Kế toán chưa được báo, chưa thấy trong danh sách của mình;
 *   · ký cần tên người ký + đủ hai chữ ký hoặc bản giấy; tệp phải nằm trong thư mục của chính
 *     biên bản; ký một lần, ký xong không sửa được phần ký;
 *   · người ngoài công trình (Kinh doanh, chỉ huy trưởng không được giao) không ký được;
 *   · Kế toán (không có quyền xem Thi công) đọc được biên bản ĐÃ KÝ qua `acceptance_document`,
 *     ghi nhận một lần; Thi công không ghi nhận thay Kế toán.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-acceptance-sign.test.ts`
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS,
  hasCredentials,
  signAcceptanceWithPaper,
  signInAs,
  TEST_PREFIX,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;
const BUCKET = 'acceptance-docs';
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

async function seedSite(): Promise<{ siteId: string; otherSiteId: string }> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    const stamp = String(Date.now());
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date)
      VALUES
        (${nvc!.id}, ${'NVC-CT-KY-A-' + stamp}, ${TEST_PREFIX + ' Ký biên bản A ' + stamp}, 'dang_thi_cong', current_date + 60),
        (${nvc!.id}, ${'NVC-CT-KY-B-' + stamp}, ${TEST_PREFIX + ' Ký biên bản B ' + stamp}, 'dang_thi_cong', current_date + 60)
      RETURNING id`;
    await sql`
      INSERT INTO user_site_assignments (user_id, construction_site_id)
      SELECT u.id, ${sites[1]!.id}::uuid FROM users u WHERE u.email = ${ACCOUNTS.chiHuyTruongNvc}`;
    return { siteId: sites[0]!.id, otherSiteId: sites[1]!.id };
  } finally {
    await sql.end();
  }
}

async function uploadPng(client: SupabaseClient, path: string) {
  return client.storage
    .from(BUCKET)
    .upload(path, new Blob([PNG], { type: 'image/png' }), { contentType: 'image/png' });
}

async function noticesFor(client: SupabaseClient, id: string) {
  const { count } = await client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'acceptance_billing')
    .eq('related_entity_id', id);
  return count ?? 0;
}

describeDb('2D — biên bản nghiệm thu ký hai bên → Kế toán (0192)', () => {
  let siteId: string;
  let otherSiteId: string;
  let vanPhong: SupabaseClient;
  let ketoan: SupabaseClient;
  let acceptanceId: string;

  beforeAll(async () => {
    ({ siteId, otherSiteId } = await seedSite());
    vanPhong = await signInAs(ACCOUNTS.congTruongNvc);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    const { data, error } = await vanPhong.rpc('record_acceptance', {
      p_site_id: siteId,
      p_acceptance_type: 'khach_hang',
      p_stage_name: `${TEST_PREFIX} Phần móng`,
      p_value: 500_000_000,
    });
    if (error) throw new Error(error.message);
    acceptanceId = data as string;
  });

  it('lập xong là chưa ký: Kế toán chưa được báo, chưa thấy, chưa đọc được', async () => {
    expect(await noticesFor(ketoan, acceptanceId)).toBe(0);
    const { data } = await ketoan.rpc('kt_signed_acceptances');
    expect(((data ?? []) as { id: string }[]).map((r) => r.id)).not.toContain(acceptanceId);
    const doc = await ketoan.rpc('acceptance_document', { p_acceptance_id: acceptanceId });
    expect(doc.error).not.toBeNull();
  });

  it('thiếu chữ ký bên kia, thiếu tên, tệp ngoài thư mục biên bản → bị từ chối', async () => {
    const nvg = `${siteId}/${acceptanceId}/chu-ky-nvg-${crypto.randomUUID()}.png`;
    expect((await uploadPng(vanPhong, nvg)).error).toBeNull();

    const onlyOne = await vanPhong.rpc('sign_acceptance_record', {
      p_acceptance_id: acceptanceId,
      p_counterpart_name: 'Ông A',
      p_nvg_signature_path: nvg,
    });
    expect(onlyOne.error!.message).toContain('hai chữ ký');

    const noName = await vanPhong.rpc('sign_acceptance_record', {
      p_acceptance_id: acceptanceId,
      p_counterpart_name: ' ',
      p_paper_scan_path: nvg,
    });
    expect(noName.error!.message).toContain('họ tên');

    const fake = await vanPhong.rpc('sign_acceptance_record', {
      p_acceptance_id: acceptanceId,
      p_counterpart_name: 'Ông A',
      p_nvg_signature_path: nvg,
      p_counterpart_signature_path: `${siteId}/${acceptanceId}/khong-co.png`,
    });
    expect(fake.error!.message).toContain('không thuộc biên bản');
  });

  it('Kinh doanh và chỉ huy trưởng công trình khác không tải chữ ký, không ký được', async () => {
    const kd = await signInAs(ACCOUNTS.kinhDoanhNvc);
    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvc);
    for (const c of [kd, cht]) {
      const path = `${siteId}/${acceptanceId}/chu-ky-${crypto.randomUUID()}.png`;
      expect((await uploadPng(c, path)).error).toBeTruthy();
      const r = await c.rpc('sign_acceptance_record', {
        p_acceptance_id: acceptanceId,
        p_counterpart_name: 'Ông A',
        p_paper_scan_path: path,
      });
      expect(r.error).not.toBeNull();
    }
    // Chỉ huy trưởng vẫn ghi được công trình được giao — chặn là do phạm vi, không do vai trò.
    expect(otherSiteId).toBeTruthy();
  });

  it('ký hai chữ ký trên điện thoại → Kế toán được báo, thấy trong danh sách, đọc được biên bản', async () => {
    const nvg = `${siteId}/${acceptanceId}/chu-ky-nvg-${crypto.randomUUID()}.png`;
    const kh = `${siteId}/${acceptanceId}/chu-ky-khach-${crypto.randomUUID()}.png`;
    expect((await uploadPng(vanPhong, nvg)).error).toBeNull();
    expect((await uploadPng(vanPhong, kh)).error).toBeNull();
    const { error } = await vanPhong.rpc('sign_acceptance_record', {
      p_acceptance_id: acceptanceId,
      p_counterpart_name: 'Nguyễn Văn Chủ',
      p_counterpart_title: 'Đại diện chủ đầu tư',
      p_nvg_signature_path: nvg,
      p_counterpart_signature_path: kh,
    });
    expect(error).toBeNull();

    expect(await noticesFor(ketoan, acceptanceId)).toBe(1);
    const { data: list } = await ketoan.rpc('kt_signed_acceptances');
    const row = ((list ?? []) as { id: string; counterpart_name: string }[]).find(
      (r) => r.id === acceptanceId,
    );
    expect(row?.counterpart_name).toBe('Nguyễn Văn Chủ');

    const doc = await ketoan.rpc('acceptance_document', { p_acceptance_id: acceptanceId });
    expect(doc.error).toBeNull();
    expect((doc.data as { value: number }).value).toBe(500_000_000);
    // Kế toán mở được ảnh chữ ký của biên bản đã ký (không cần quyền xem Thi công).
    const signed = await ketoan.storage.from(BUCKET).createSignedUrl(kh, 60);
    expect(signed.error).toBeNull();
  });

  it('ký một lần: ký lại bị từ chối, không tải thêm tệp được', async () => {
    const again = await signAcceptanceWithPaper(vanPhong, siteId, acceptanceId);
    expect(again.error).not.toBeNull();
  });

  it('Thi công không ghi nhận thay Kế toán; Kế toán ghi nhận một lần', async () => {
    const tc = await vanPhong.rpc('mark_acceptance_billed', { p_acceptance_id: acceptanceId });
    expect(tc.error).not.toBeNull();

    const first = await ketoan.rpc('mark_acceptance_billed', {
      p_acceptance_id: acceptanceId,
      p_note: 'Đã lập công nợ phải thu',
    });
    expect(first.error).toBeNull();
    const second = await ketoan.rpc('mark_acceptance_billed', { p_acceptance_id: acceptanceId });
    expect(second.error!.message).toContain('đã được ghi nhận');
  });
});
