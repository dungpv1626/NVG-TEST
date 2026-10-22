/**
 * Đợt 2 — 2F: phiếu bảo hành (migration 0193).
 *
 * Bất biến canh ở đây:
 *   · phiếu mới có mã BH, luôn ở «Tiếp nhận», tự giao chỉ huy trưởng của công trình và báo người đó;
 *   · hạn xử lý: tham số trống thì KHÔNG có hạn (không bịa); có tham số thì = ngày tiếp nhận + số ngày;
 *   · người phụ trách phải là người của Thi công;
 *   · hoàn tất phải có kết quả + ảnh sau sửa; từ chối phải có lý do; máy ghi giờ và người hoàn tất;
 *     không quay lại «Tiếp nhận»; phiếu đã đóng không sửa được;
 *   · ảnh phải nằm dưới thư mục của đúng công trình;
 *   · công trình đang bảo hành có phiếu mở hiện trên bảng theo dõi của Trưởng phòng (0191).
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-warranty.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  companyId: string;
  siteId: string;
  otherSiteId: string;
  warrantyId: string;
  chtId: string;
  kdId: string;
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
    const [cht] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvo}`;
    const [kd] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.kinhDoanhNvo}`;
    const sites = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id)
      VALUES
        (${nvo!.id}, ${'NVO-CT-BH-A-' + stamp}, ${TEST_PREFIX + ' Bảo hành A ' + stamp}, 'bao_hanh', current_date - 30, ${cht!.id}),
        (${nvo!.id}, ${'NVO-CT-BH-B-' + stamp}, ${TEST_PREFIX + ' Bảo hành B ' + stamp}, 'bao_hanh', current_date - 30, ${cht!.id})
      RETURNING id`;
    const [w] = await sql<{ id: string }[]>`
      INSERT INTO warranties (company_id, construction_site_id, item, start_date, duration_months)
      VALUES (${nvo!.id}, ${sites[0]!.id}, ${TEST_PREFIX + ' Chống thấm mái'}, current_date - 30, 60)
      RETURNING id`;
    return {
      companyId: nvo!.id,
      siteId: sites[0]!.id,
      otherSiteId: sites[1]!.id,
      warrantyId: w!.id,
      chtId: cht!.id,
      kdId: kd!.id,
    };
  });
}

async function setResponseDays(value: number | null) {
  await withSql(
    (sql) => sql`
      UPDATE system_parameters SET value = ${value === null ? null : String(value)}
       WHERE param_key = 'tc.warranty_response_days' AND scope_type = 'global'`,
  );
}

describeDb('2F — phiếu bảo hành (0193)', () => {
  let f: Fixture;
  let tp: SupabaseClient;
  let claimId: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    f = await seed();
    tp = await signInAs(ACCOUNTS.congTruongNvo);
  });

  afterAll(async () => {
    await setResponseDays(null);
  });

  async function insertClaim(extra: Record<string, unknown> = {}) {
    return tp
      .from('warranty_claims')
      .insert({
        company_id: f.companyId,
        warranty_id: f.warrantyId,
        description: `${TEST_PREFIX} Thấm trần phòng ngủ tầng 3 sau mưa.`,
        reported_date: today,
        ...extra,
      })
      .select('id, code, status, assigned_user_id, due_date, resolved_at')
      .single();
  }

  it('phiếu mới: mã BH, «Tiếp nhận» dù trình duyệt khai khác, giao chỉ huy trưởng, không bịa hạn', async () => {
    await setResponseDays(null);
    const { data, error } = await insertClaim({
      status: 'da_xu_ly',
      resolved_at: new Date().toISOString(),
      before_photo_paths: [`${f.siteId}/bao-hanh/${crypto.randomUUID()}.jpg`],
    });
    expect(error).toBeNull();
    expect(data!.code).toMatch(/^NVO-BH-\d{4}-\d+$/);
    expect(data!.status).toBe('tiep_nhan');
    expect(data!.resolved_at).toBeNull();
    expect(data!.assigned_user_id).toBe(f.chtId);
    expect(data!.due_date).toBeNull();
    claimId = data!.id as string;

    const cht = await signInAs(ACCOUNTS.chiHuyTruongNvo);
    const { count } = await cht
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'warranty_claim_assigned')
      .eq('related_entity_id', claimId);
    expect(count).toBe(1);
  });

  it('có tham số hạn thì hạn = ngày tiếp nhận + số ngày; người tiếp nhận tự đặt thì giữ', async () => {
    await setResponseDays(3);
    const auto = await insertClaim();
    const expected = new Date(Date.parse(today) + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(auto.data!.due_date).toBe(expected);
    const own = await insertClaim({ due_date: today });
    expect(own.data!.due_date).toBe(today);
    await setResponseDays(null);
  });

  it('không giao được cho người ngoài Thi công; ảnh công trình khác bị từ chối', async () => {
    const kd = await insertClaim({ assigned_user_id: f.kdId });
    expect(kd.error!.message).toContain('người của Thi công');
    const photo = await insertClaim({
      before_photo_paths: [`${f.otherSiteId}/bao-hanh/${crypto.randomUUID()}.jpg`],
    });
    expect(photo.error!.message).toContain('không thuộc công trình');
  });

  it('đóng phiếu phải đủ căn cứ; không quay lại «Tiếp nhận»', async () => {
    const start = await tp
      .from('warranty_claims')
      .update({ status: 'dang_xu_ly' })
      .eq('id', claimId)
      .select('started_at')
      .single();
    expect(start.error).toBeNull();
    expect(start.data!.started_at).not.toBeNull();

    const back = await tp.from('warranty_claims').update({ status: 'tiep_nhan' }).eq('id', claimId);
    expect(back.error!.message).toContain('không quay lại');

    const noResult = await tp
      .from('warranty_claims')
      .update({
        status: 'da_xu_ly',
        after_photo_paths: [`${f.siteId}/bao-hanh/${crypto.randomUUID()}.jpg`],
      })
      .eq('id', claimId);
    expect(noResult.error!.message).toContain('kết quả xử lý');

    const noPhoto = await tp
      .from('warranty_claims')
      .update({ status: 'da_xu_ly', resolution: 'Xử lý lại lớp chống thấm sàn mái.' })
      .eq('id', claimId);
    expect(noPhoto.error!.message).toContain('ảnh');

    const rejectNoReason = await tp
      .from('warranty_claims')
      .update({ status: 'tu_choi' })
      .eq('id', claimId);
    expect(rejectNoReason.error!.message).toContain('lý do');
  });

  it('hoàn tất: máy ghi giờ + người hoàn tất; phiếu đã đóng không sửa được', async () => {
    const tpId = (await tp.rpc('auth_user_id')).data as string;
    const done = await tp
      .from('warranty_claims')
      .update({
        status: 'da_xu_ly',
        resolution: 'Xử lý lại lớp chống thấm sàn mái.',
        after_photo_paths: [`${f.siteId}/bao-hanh/${crypto.randomUUID()}.jpg`],
        customer_confirmed_by: 'Chủ nhà',
        resolved_at: '2000-01-01T00:00:00Z',
      })
      .eq('id', claimId)
      .select('resolved_at, resolved_by')
      .single();
    expect(done.error).toBeNull();
    expect(done.data!.resolved_by).toBe(tpId);
    expect(new Date(done.data!.resolved_at as string).getFullYear()).toBeGreaterThan(2000);

    const edit = await tp
      .from('warranty_claims')
      .update({ resolution: 'Sửa lời' })
      .eq('id', claimId);
    expect(edit.error!.message).toContain('đã đóng');
  });

  it('công trình đang bảo hành còn phiếu mở hiện trên bảng theo dõi của Trưởng phòng', async () => {
    const { data, error } = await tp.rpc('tc_site_board');
    expect(error).toBeNull();
    const row = (data as { site_id: string; open_warranty_claims: number }[]).find(
      (r) => r.site_id === f.siteId,
    );
    // Các phiếu lập ở bài «tham số hạn» vẫn mở.
    expect(row?.open_warranty_claims).toBeGreaterThan(0);
    const other = (data as { site_id: string }[]).find((r) => r.site_id === f.otherSiteId);
    expect(other).toBeUndefined();
  });
});
