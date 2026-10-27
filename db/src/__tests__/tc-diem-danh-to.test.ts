/**
 * Điểm danh tổ đội và bảng công thời vụ (0232, câu 6).
 *
 * Hàng rào phải đứng:
 *  - Chỉ huy trưởng điểm danh hộ: số công theo tham số (cả ngày 1, nửa ngày 0,5, vắng 0), khoảng cách tới tâm công
 *    trình tính ra cảnh báo «ngoài bán kính» — không chặn.
 *  - Người không thuộc tổ không ghi vào phiếu của tổ; người ngoài công trình không đọc được.
 *  - Gửi bảng công tháng thì khoá điểm danh; chỉ huy trưởng không tự xác nhận; Trưởng phòng Thi công xác nhận hoặc trả
 *    lại (phải có lý do); Kế toán đọc bảng công đã xác nhận qua hàm riêng.
 *
 * Chạy: `npx vitest run --project db db/src/__tests__/tc-diem-danh-to.test.ts`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, hasCredentials, signInAs, TEST_PREFIX } from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
// Tâm công trình thử: Hưng Yên.
const SITE_LAT = 20.6464;
const SITE_LNG = 106.0511;

async function withSql<T>(fn: (sql: import('postgres').Sql) => Promise<T>): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

describeDb('Điểm danh tổ đội (0232)', () => {
  let cht: SupabaseClient;
  let tc: SupabaseClient;
  let kd: SupabaseClient;
  let ketoan: SupabaseClient;
  let siteId = '';
  let crewId = '';
  let otherCrewId = '';
  let memberIds: string[] = [];
  let outsiderMember = '';
  let sheetId = '';

  beforeAll(async () => {
    [cht, tc, kd, ketoan] = await Promise.all([
      signInAs(ACCOUNTS.chiHuyTruongNvc),
      signInAs(ACCOUNTS.congTruongNvc),
      signInAs(ACCOUNTS.kinhDoanhNvc),
      signInAs(ACCOUNTS.ketoan),
    ]);
    await withSql(async (sql) => {
      const stamp = String(Date.now());
      const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;
      const [u] = await sql<
        { id: string }[]
      >`SELECT id FROM users WHERE email = ${ACCOUNTS.chiHuyTruongNvc}`;
      const [site] = await sql<{ id: string }[]>`
        INSERT INTO construction_sites (company_id, code, name, stage, planned_end_date, responsible_user_id,
                                        latitude, longitude)
        VALUES (${nvc!.id}, ${'NVC-CT-DD-' + stamp}, ${TEST_PREFIX + ' Điểm danh tổ ' + stamp}, 'dang_thi_cong',
                current_date + 90, ${u!.id}, ${SITE_LAT}, ${SITE_LNG})
        RETURNING id`;
      siteId = site!.id;
      const crews = await sql<{ id: string }[]>`
        INSERT INTO subcontractors (company_id, construction_site_id, name, scope_of_work)
        VALUES (${nvc!.id}, ${siteId}, ${TEST_PREFIX + ' Tổ nề anh Lâm'}, 'Xây, trát'),
               (${nvc!.id}, ${siteId}, ${TEST_PREFIX + ' Tổ sắt anh Hùng'}, 'Cốt thép')
        RETURNING id`;
      crewId = crews[0]!.id;
      otherCrewId = crews[1]!.id;
    });
  });

  afterAll(async () => {
    await withSql(async (sql) => {
      await sql`DELETE FROM crew_timesheet_months WHERE construction_site_id = ${siteId}`;
      await sql`DELETE FROM crew_attendance_sheets WHERE construction_site_id = ${siteId}`;
      await sql`DELETE FROM crew_members WHERE subcontractor_id IN (${crewId}, ${otherCrewId})`;
    });
  });

  async function newSheet(day: string, lat: number | null, lng: number | null) {
    const path = `${siteId}/diem-danh-to/${Date.now()}.jpg`;
    const up = await cht.storage
      .from('construction-photos')
      .upload(path, new Blob([JPG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    return cht
      .from('crew_attendance_sheets')
      .insert({
        company_id: '00000000-0000-0000-0000-000000000000',
        construction_site_id: siteId,
        subcontractor_id: crewId,
        work_date: day,
        photo_path: path,
        latitude: lat,
        longitude: lng,
      })
      .select('id, location_flag, distance_m')
      .single();
  }

  it('chỉ huy trưởng lập danh sách tổ và điểm danh: số công theo tham số, cảnh báo khoảng cách', async () => {
    const { data: members, error } = await cht
      .from('crew_members')
      .insert(
        ['Nguyễn Văn Lâm', 'Trần Văn Bảy', 'Lê Thị Hoa'].map((full_name) => ({
          company_id: '00000000-0000-0000-0000-000000000000',
          subcontractor_id: crewId,
          full_name,
        })),
      )
      .select('id');
    expect(error).toBeNull();
    memberIds = members!.map((m) => m.id as string);
    const other = await cht
      .from('crew_members')
      .insert({
        company_id: '00000000-0000-0000-0000-000000000000',
        subcontractor_id: otherCrewId,
        full_name: 'Phạm Văn Hùng',
      })
      .select('id')
      .single();
    outsiderMember = other.data!.id;

    // Cách tâm ~110 m — trong bán kính 300 m.
    const near = await newSheet(today(), SITE_LAT + 0.001, SITE_LNG);
    expect(near.error).toBeNull();
    expect(near.data).toMatchObject({ location_flag: 'trong_ban_kinh' });
    expect(near.data!.distance_m).toBeGreaterThan(80);
    sheetId = near.data!.id;

    const rows = await cht
      .from('crew_attendance')
      .insert([
        {
          company_id: '00000000-0000-0000-0000-000000000000',
          sheet_id: sheetId,
          crew_member_id: memberIds[0],
          status: 'ca_ngay',
          overtime_hours: 2,
        },
        {
          company_id: '00000000-0000-0000-0000-000000000000',
          sheet_id: sheetId,
          crew_member_id: memberIds[1],
          status: 'nua_ngay',
        },
        {
          company_id: '00000000-0000-0000-0000-000000000000',
          sheet_id: sheetId,
          crew_member_id: memberIds[2],
          status: 'vang',
          overtime_hours: 3,
        },
      ])
      .select('status, workday, overtime_hours');
    expect(rows.error).toBeNull();
    const by = Object.fromEntries((rows.data ?? []).map((r) => [r.status, r]));
    expect(Number(by.ca_ngay!.workday)).toBe(1);
    expect(Number(by.ca_ngay!.overtime_hours)).toBe(2);
    expect(Number(by.nua_ngay!.workday)).toBe(0.5);
    expect(Number(by.vang!.workday)).toBe(0);
    expect(Number(by.vang!.overtime_hours)).toBe(0);
  });

  it('phiếu lập xa công trình chỉ cảnh báo, không chặn; người tổ khác không vào được phiếu', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      yesterday,
    );
    const far = await newSheet(day, SITE_LAT + 0.02, SITE_LNG); // ~2,2 km
    expect(far.error).toBeNull();
    expect(far.data!.location_flag).toBe('ngoai_ban_kinh');

    const wrong = await cht.from('crew_attendance').insert({
      company_id: '00000000-0000-0000-0000-000000000000',
      sheet_id: sheetId,
      crew_member_id: outsiderMember,
      status: 'ca_ngay',
    });
    expect(wrong.error?.message).toMatch(/không thuộc tổ/);
  });

  it('chỉ huy trưởng ghi lại vị trí công trình được; người ngoài không ghi được', async () => {
    const ok = await cht
      .from('construction_sites')
      .update({ latitude: SITE_LAT, longitude: SITE_LNG })
      .eq('id', siteId)
      .select('latitude')
      .single();
    expect(ok.error).toBeNull();
    const denied = await kd
      .from('construction_sites')
      .update({ latitude: 10, longitude: 106 })
      .eq('id', siteId)
      .select('id');
    expect(denied.data ?? []).toEqual([]);
  });

  it('người ngoài công trình không đọc được điểm danh', async () => {
    const { data } = await kd
      .from('crew_attendance_sheets')
      .select('id')
      .eq('construction_site_id', siteId);
    expect(data ?? []).toEqual([]);
  });

  it('gửi bảng công thì khoá; chỉ huy trưởng không tự xác nhận; trả lại phải có lý do; Trưởng phòng xác nhận; Kế toán đọc', async () => {
    const month = today().slice(0, 7) + '-01';
    expect(
      (await cht.rpc('submit_crew_month', { p_subcontractor: crewId, p_month: month })).error,
    ).toBeNull();

    const locked = await cht
      .from('crew_attendance')
      .update({ status: 'ca_ngay' })
      .eq('sheet_id', sheetId)
      .eq('crew_member_id', memberIds[1]!);
    expect(locked.error?.message).toMatch(/đã gửi/);

    const self = await cht.rpc('decide_crew_month', {
      p_subcontractor: crewId,
      p_month: month,
      p_confirm: true,
    });
    expect(self.error?.message).toMatch(/Trưởng phòng Thi công/);

    const noReason = await tc.rpc('decide_crew_month', {
      p_subcontractor: crewId,
      p_month: month,
      p_confirm: false,
    });
    expect(noReason.error?.message).toMatch(/lý do/);

    expect(
      (
        await tc.rpc('decide_crew_month', {
          p_subcontractor: crewId,
          p_month: month,
          p_confirm: true,
        })
      ).error,
    ).toBeNull();

    const { data, error } = await ketoan.rpc('kt_crew_timesheets', { p_month: month });
    expect(error).toBeNull();
    const row = (
      data as { crew_name: string; workdays: number; overtime_hours: number; people: number }[]
    ).find((r) => r.crew_name.includes('Tổ nề anh Lâm'));
    expect(Number(row!.workdays)).toBe(1.5);
    expect(Number(row!.overtime_hours)).toBe(2);
    expect(row!.people).toBe(2);

    const denied = await kd.rpc('kt_crew_timesheets', { p_month: month });
    expect(denied.error).not.toBeNull();
  });
});
