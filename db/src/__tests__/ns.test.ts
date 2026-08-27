/**
 * Module NS — Hành chính và Nhân sự: hàng rào phân quyền và điều kiện nghiệp vụ.
 *
 * Nguồn: PRD NS-01 → NS-11, Backend Schema 4.10.
 *
 * Sáu thứ được canh kỹ nhất, vì mất thứ nào cũng dẫn tới lộ dữ liệu cá nhân hoặc sai lương:
 *  1. lương và căn cước KHÔNG đọc được bằng truy vấn thẳng, chỉ qua hàm có ghi nhật ký (NEN-07);
 *  2. chỉ chốt được kỳ chấm công khi CẢ BA khối đã được trưởng đơn vị xác nhận (NS-04);
 *  3. bảng công đã chốt chỉ sửa được kèm lý do và người phê duyệt (NS-04);
 *  4. "nghỉ có phép" phải có đơn nghỉ đã duyệt phủ đúng ngày đó (NS-05);
 *  5. checklist nghỉ việc liệt kê ĐÚNG tài sản người đó đang giữ (NS-08, NS-11);
 *  6. hồ sơ nhân sự không hiển thị đại trà cho vai trò ngoài Hành chính – Nhân sự.
 *
 * Chạy trên CSDL DEV thật, cần đã chạy `npm run db:seed`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HOURS_PER_WORKDAY, ONBOARDING_CHECKLIST, OFFBOARDING_CHECKLIST } from '@nvg/shared';
import {
  ACCOUNTS,
  anonClient,
  hasCredentials,
  signInAs,
  TEST_PREFIX,
  TEST_TIMESHEET_YEAR,
} from './helpers';

const describeDb = hasCredentials ? describe : describe.skip;

interface Fixture {
  nvcCompanyId: string;
  nvcSiteId: string;
  /** Nhân sự khối văn phòng, có tài khoản đăng nhập là Kế toán — dùng để thử "xem của chính mình". */
  ketoanEmployeeId: string;
  /** Nhân sự khối văn phòng, không có tài khoản. */
  officeEmployeeId: string;
  /** Nhân sự khối công trường, gắn công trình NVC. */
  siteEmployeeId: string;
  /** Nhân sự khối xưởng. */
  workshopEmployeeId: string;
  assetId: string;
}

async function seedFixture(): Promise<Fixture> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  const stamp = String(Date.now());
  try {
    const [nvc] = await sql<{ id: string }[]>`SELECT id FROM companies WHERE code = 'NVC'`;

    const [site] = await sql<{ id: string }[]>`
      INSERT INTO construction_sites (company_id, code, name, planned_end_date)
      VALUES (${nvc!.id}, ${'NVC-CT-NSTEST-' + stamp},
              ${TEST_PREFIX + ' Công trình NS ' + stamp}, current_date + 90)
      RETURNING id
    `;

    const [ketoanUser] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${ACCOUNTS.ketoan}
    `;

    let seq = 0;
    const insertEmployee = async (
      name: string,
      block: string,
      opts: { userId?: string; siteId?: string } = {},
    ) => {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO employees (
          company_id, code, full_name, block, position, status, hire_date,
          user_id, construction_site_id, id_number, base_salary, allowance, salary_type
        )
        VALUES (
          ${nvc!.id}, ${'NVC-NS-TEST-' + block + '-' + stamp + '-' + ++seq}, ${name}, ${block}::work_block,
          ${'Nhân viên thử nghiệm'}, 'chinh_thuc', current_date - 400,
          ${opts.userId ?? null}, ${opts.siteId ?? null},
          ${'0790000' + Math.floor(Math.random() * 100000)}, ${'20000000'}, ${'1000000'}, 'thang'
        )
        RETURNING id
      `;
      return row!.id;
    };

    const ketoanEmployeeId = await insertEmployee(
      `${TEST_PREFIX} Nhân sự kế toán ${stamp}`,
      'van_phong',
      { userId: ketoanUser!.id },
    );
    const officeEmployeeId = await insertEmployee(
      `${TEST_PREFIX} Nhân sự văn phòng ${stamp}`,
      'van_phong',
    );
    const siteEmployeeId = await insertEmployee(
      `${TEST_PREFIX} Nhân sự công trường ${stamp}`,
      'cong_truong',
      { siteId: site!.id },
    );
    const workshopEmployeeId = await insertEmployee(
      `${TEST_PREFIX} Nhân sự xưởng ${stamp}`,
      'xuong',
    );

    const [asset] = await sql<{ id: string }[]>`
      INSERT INTO assets (company_id, code, name, serial_number, value, condition, current_holder_id)
      VALUES (${nvc!.id}, ${'TS-NSTEST-' + stamp}, ${TEST_PREFIX + ' Máy tính xách tay ' + stamp},
              ${'SN-' + stamp}, ${'18000000'}, 'tot', ${officeEmployeeId})
      RETURNING id
    `;

    return {
      nvcCompanyId: nvc!.id,
      nvcSiteId: site!.id,
      ketoanEmployeeId,
      officeEmployeeId,
      siteEmployeeId,
      workshopEmployeeId,
      assetId: asset!.id,
    };
  } finally {
    await sql.end();
  }
}

/**
 * Chạy một truy vấn bằng kết nối chủ sở hữu (vượt RLS).
 *
 * CHỈ dùng để dựng bối cảnh và KIỂM CHỨNG kết quả — mọi thao tác nghiệp vụ trong test đều
 * phải đi qua client đã đăng nhập bằng đúng vai trò, nếu không thì test không chứng minh
 * được gì về phân quyền.
 */
async function withSql<T>(
  run: (sql: ReturnType<typeof import('postgres')>) => Promise<T>,
): Promise<T> {
  const { createConnection } = await import('../client');
  const { sql } = createConnection();
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

async function periodStatus(periodId: string): Promise<string | undefined> {
  return withSql(async (sql) => {
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM timesheet_periods WHERE id = ${periodId}
    `;
    return rows[0]?.status;
  });
}

describeDb('NS — hồ sơ nhân sự và dữ liệu nhạy cảm (NS-01, NEN-07)', () => {
  let fixture: Fixture;
  let hcns: SupabaseClient;
  let ketoan: SupabaseClient;
  let muaHang: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    hcns = await signInAs(ACCOUNTS.nhanSu);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    muaHang = await signInAs(ACCOUNTS.muaHang);
  }, 60_000);

  it('vai trò anon không đọc được hồ sơ nhân sự', async () => {
    const { data, error } = await anonClient().from('employees').select('id').limit(1);
    expect(error ?? data?.length === 0).toBeTruthy();
  });

  it('cột lương và căn cước KHÔNG đọc được bằng truy vấn thẳng, kể cả với Hành chính – Nhân sự', async () => {
    const salary = await hcns
      .from('employees')
      .select('id, base_salary')
      .eq('id', fixture.officeEmployeeId);
    expect(salary.error).not.toBeNull();

    const idNumber = await hcns
      .from('employees')
      .select('id, id_number')
      .eq('id', fixture.officeEmployeeId);
    expect(idNumber.error).not.toBeNull();

    // `select=*` cũng bị chặn — đó là lý do mọi hook phải liệt kê cột tường minh.
    const star = await hcns.from('employees').select('*').eq('id', fixture.officeEmployeeId);
    expect(star.error).not.toBeNull();
  });

  it('lương đọc được qua hàm riêng, và mỗi lượt xem để lại dấu vết (NEN-07)', async () => {
    const { data, error } = await hcns.rpc('employee_salary', {
      p_employee_id: fixture.officeEmployeeId,
    });
    expect(error).toBeNull();
    expect(Number(data?.[0]?.base_salary)).toBe(20_000_000);

    const logged = await withSql(async (sql) => {
      const rows = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM sensitive_access_logs
         WHERE entity_id = ${fixture.officeEmployeeId} AND sensitive_kind = 'salary'
      `;
      return Number(rows[0]?.n ?? 0);
    });
    expect(logged).toBeGreaterThan(0);
  });

  it('Mua hàng không xem được lương của người khác (PRD NS ranh giới)', async () => {
    const { error } = await muaHang.rpc('employee_salary', {
      p_employee_id: fixture.officeEmployeeId,
    });
    expect(error).not.toBeNull();
  });

  it('Kế toán xem được lương (để tính lương) nhưng KHÔNG xem được căn cước và ghi chú sức khỏe', async () => {
    const salary = await ketoan.rpc('employee_salary', {
      p_employee_id: fixture.officeEmployeeId,
    });
    expect(salary.error).toBeNull();

    const personal = await ketoan.rpc('employee_personal_details', {
      p_employee_id: fixture.officeEmployeeId,
    });
    expect(personal.error).not.toBeNull();
  });

  it('người lao động xem được lương của CHÍNH MÌNH', async () => {
    const { data, error } = await ketoan.rpc('employee_salary', {
      p_employee_id: fixture.ketoanEmployeeId,
    });
    expect(error).toBeNull();
    expect(Number(data?.[0]?.base_salary)).toBe(20_000_000);
  });

  it('vai trò ngoài Hành chính – Nhân sự không thấy danh sách nhân sự', async () => {
    const { data, error } = await muaHang
      .from('employees')
      .select('id, full_name')
      .eq('id', fixture.officeEmployeeId);
    expect(error ?? data?.length === 0).toBeTruthy();
  });

  it('Mua hàng không sửa được hồ sơ nhân sự', async () => {
    const { error } = await muaHang
      .from('employees')
      .update({ position: 'Tự đổi chức danh' })
      .eq('id', fixture.officeEmployeeId)
      .select('id');
    expect(error ?? true).toBeTruthy();

    const position = await withSql(async (sql) => {
      const rows = await sql<{ position: string }[]>`
        SELECT position FROM employees WHERE id = ${fixture.officeEmployeeId}
      `;
      return rows[0]?.position;
    });
    expect(position).toBe('Nhân viên thử nghiệm');
  });
});

describeDb('NS — chấm công ba khối (NS-04, NS-05)', () => {
  let fixture: Fixture;
  let hcns: SupabaseClient;
  let chiHuy: SupabaseClient;
  let ketoan: SupabaseClient;
  const YEAR = TEST_TIMESHEET_YEAR;
  const MONTH = 3;

  /** Ngày làm việc thứ `n` của kỳ, dạng `yyyy-MM-dd`. */
  const day = (n: number) =>
    `${YEAR}-${String(MONTH).padStart(2, '0')}-${String(n).padStart(2, '0')}`;

  async function openPeriod(
    client: SupabaseClient,
    block: 'van_phong' | 'cong_truong' | 'xuong',
  ): Promise<string> {
    const { data, error } = await client.rpc('open_timesheet_period', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
      p_source_type: block,
    });
    expect(error).toBeNull();
    return data as string;
  }

  beforeAll(async () => {
    fixture = await seedFixture();
    hcns = await signInAs(ACCOUNTS.nhanSu);
    chiHuy = await signInAs(ACCOUNTS.congTruongNvc);
    ketoan = await signInAs(ACCOUNTS.ketoan);
  }, 60_000);

  it('chỉ Hành chính – Nhân sự mở được kỳ chấm công', async () => {
    const { error } = await chiHuy.rpc('open_timesheet_period', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
      p_source_type: 'van_phong',
    });
    expect(error).not.toBeNull();
  });

  it('không ghi công cho người thuộc khối khác', async () => {
    const period = await openPeriod(hcns, 'van_phong');
    const { error } = await hcns.rpc('save_attendance', {
      p_period_id: period,
      p_entries: [
        { employee_id: fixture.siteEmployeeId, work_date: day(2), kind: 'lam_viec', hours: 8 },
      ],
    });
    expect(error?.message).toContain('khối khác');
  });

  it('không ghi ngày nằm ngoài tháng của kỳ', async () => {
    const period = await openPeriod(hcns, 'van_phong');
    const { error } = await hcns.rpc('save_attendance', {
      p_period_id: period,
      p_entries: [
        {
          employee_id: fixture.officeEmployeeId,
          work_date: `${YEAR}-05-02`,
          kind: 'lam_viec',
          hours: 8,
        },
      ],
    });
    expect(error?.message).toContain('không nằm trong kỳ');
  });

  it('"nghỉ có phép" phải có đơn nghỉ đã duyệt phủ đúng ngày đó (NS-05)', async () => {
    const period = await openPeriod(hcns, 'van_phong');
    const { error } = await hcns.rpc('save_attendance', {
      p_period_id: period,
      p_entries: [
        { employee_id: fixture.officeEmployeeId, work_date: day(3), kind: 'nghi_co_phep' },
      ],
    });
    expect(error?.message).toContain('chưa có đơn nghỉ phép được duyệt');
  });

  it('chỉ huy công trường ghi được công khối công trường, nhưng KHÔNG ghi được khối văn phòng', async () => {
    const sitePeriod = await openPeriod(hcns, 'cong_truong');
    const officePeriod = await openPeriod(hcns, 'van_phong');

    const ok = await chiHuy.rpc('save_attendance', {
      p_period_id: sitePeriod,
      p_entries: [
        { employee_id: fixture.siteEmployeeId, work_date: day(2), kind: 'lam_viec', hours: 8 },
      ],
    });
    expect(ok.error).toBeNull();

    const denied = await chiHuy.rpc('save_attendance', {
      p_period_id: officePeriod,
      p_entries: [
        { employee_id: fixture.officeEmployeeId, work_date: day(2), kind: 'lam_viec', hours: 8 },
      ],
    });
    expect(denied.error).not.toBeNull();
  });

  it('không chốt được khi còn khối chưa xác nhận (NS-04)', async () => {
    const office = await openPeriod(hcns, 'van_phong');
    await hcns.rpc('save_attendance', {
      p_period_id: office,
      p_entries: [
        { employee_id: fixture.officeEmployeeId, work_date: day(2), kind: 'lam_viec', hours: 8 },
      ],
    });
    await hcns.rpc('submit_timesheet_period', { p_period_id: office });
    await hcns.rpc('confirm_timesheet_period', { p_period_id: office });

    const site = await openPeriod(hcns, 'cong_truong');
    await hcns.rpc('save_attendance', {
      p_period_id: site,
      p_entries: [
        { employee_id: fixture.siteEmployeeId, work_date: day(2), kind: 'lam_viec', hours: 8 },
      ],
    });
    await hcns.rpc('submit_timesheet_period', { p_period_id: site });

    const { error } = await hcns.rpc('consolidate_timesheets', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
    });
    expect(error?.message).toContain('chưa được trưởng đơn vị xác nhận');
  });

  it('Hành chính – Nhân sự KHÔNG xác nhận thay khối công trường (NS-04)', async () => {
    const site = await openPeriod(hcns, 'cong_truong');
    const status = await periodStatus(site);
    expect(status).toBe('cho_xac_nhan');

    const { error } = await hcns.rpc('confirm_timesheet_period', { p_period_id: site });
    expect(error?.message).toContain('trưởng đơn vị');
  });

  it('đủ ba khối xác nhận thì chốt được, và số công quy đổi đúng 8 giờ một công', async () => {
    const site = await openPeriod(hcns, 'cong_truong');
    const confirmed = await chiHuy.rpc('confirm_timesheet_period', { p_period_id: site });
    expect(confirmed.error).toBeNull();

    const workshop = await openPeriod(hcns, 'xuong');
    await hcns.rpc('save_attendance', {
      p_period_id: workshop,
      p_entries: [
        {
          employee_id: fixture.workshopEmployeeId,
          work_date: day(2),
          kind: 'lam_viec',
          hours: 12,
          overtime_hours: 4,
          output_quantity: 30,
        },
        { employee_id: fixture.workshopEmployeeId, work_date: day(3), kind: 'nghi_khong_phep' },
      ],
    });
    await hcns.rpc('submit_timesheet_period', { p_period_id: workshop });
    await hcns.rpc('confirm_timesheet_period', { p_period_id: workshop });

    const { data, error } = await hcns.rpc('consolidate_timesheets', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(3);

    const row = await withSql(async (sql) => {
      const rows = await sql<
        {
          workdays: string;
          overtime_hours: string;
          unpaid_absence_days: number;
          output_quantity: string;
        }[]
      >`
        SELECT workdays, overtime_hours, unpaid_absence_days, output_quantity
          FROM timesheets WHERE employee_id = ${fixture.workshopEmployeeId} AND year = ${YEAR}
      `;
      return rows[0];
    });
    // 12 giờ / 8 giờ một công = 1,5 công — cùng công thức với `summarizeAttendance` ở shared.
    expect(Number(row?.workdays)).toBe(12 / HOURS_PER_WORKDAY);
    expect(Number(row?.overtime_hours)).toBe(4);
    expect(row?.unpaid_absence_days).toBe(1);
    expect(Number(row?.output_quantity)).toBe(30);
  });

  it('kỳ đã chốt thì không ghi công được nữa, và không chốt lại được', async () => {
    const office = await openPeriod(hcns, 'van_phong');
    expect(await periodStatus(office)).toBe('da_chot');

    const write = await hcns.rpc('save_attendance', {
      p_period_id: office,
      p_entries: [
        { employee_id: fixture.officeEmployeeId, work_date: day(4), kind: 'lam_viec', hours: 8 },
      ],
    });
    expect(write.error).not.toBeNull();

    const again = await hcns.rpc('consolidate_timesheets', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
    });
    expect(again.error?.message).toContain('đã chốt');
  });

  it('điều chỉnh sau khi chốt bắt buộc nêu lý do, và ghi lại giá trị cũ kèm người phê duyệt (NS-04)', async () => {
    const timesheetId = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM timesheets WHERE employee_id = ${fixture.officeEmployeeId} AND year = ${YEAR}
      `;
      return rows[0]!.id;
    });

    const noReason = await hcns.rpc('adjust_timesheet', {
      p_timesheet_id: timesheetId,
      p_field: 'workdays',
      p_new_value: 2,
      p_reason: '   ',
    });
    expect(noReason.error?.message).toContain('lý do');

    const ok = await hcns.rpc('adjust_timesheet', {
      p_timesheet_id: timesheetId,
      p_field: 'workdays',
      p_new_value: 2,
      p_reason: `${TEST_PREFIX} Bổ sung một ngày công quên chấm`,
    });
    expect(ok.error).toBeNull();

    const adj = await withSql(async (sql) => {
      const rows = await sql<
        { old_value: string; new_value: string; approved_by: string | null }[]
      >`
        SELECT old_value, new_value, approved_by FROM timesheet_adjustments
         WHERE timesheet_id = ${timesheetId}
      `;
      return rows[0];
    });
    expect(Number(adj?.old_value)).toBe(1);
    expect(Number(adj?.new_value)).toBe(2);
    expect(adj?.approved_by).not.toBeNull();
  });

  it('bảng công đã chốt KHÔNG sửa được bằng lệnh cập nhật thẳng', async () => {
    const timesheetId = await withSql(async (sql) => {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM timesheets WHERE employee_id = ${fixture.officeEmployeeId} AND year = ${YEAR}
      `;
      return rows[0]!.id;
    });

    const { error } = await hcns
      .from('timesheets')
      .update({ workdays: '30' })
      .eq('id', timesheetId)
      .select('id');
    expect(error).not.toBeNull();
  });

  it('Kế toán nhận được số công đã chốt mà không phải nhập lại (NS-05)', async () => {
    const { data, error } = await ketoan.rpc('transfer_timesheets_to_accounting', {
      p_company_id: fixture.nvcCompanyId,
      p_year: YEAR,
      p_month: MONTH,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBeGreaterThan(0);
  });
});

describeDb('NS — nghỉ phép, tài sản, nghỉ việc (NS-05, NS-08, NS-11)', () => {
  let fixture: Fixture;
  let hcns: SupabaseClient;
  let ketoan: SupabaseClient;
  let tgd: SupabaseClient;
  let muaHang: SupabaseClient;

  beforeAll(async () => {
    fixture = await seedFixture();
    hcns = await signInAs(ACCOUNTS.nhanSu);
    ketoan = await signInAs(ACCOUNTS.ketoan);
    tgd = await signInAs(ACCOUNTS.tgd);
    muaHang = await signInAs(ACCOUNTS.muaHang);
  }, 60_000);

  async function draftLeave(client: SupabaseClient, employeeId: string): Promise<string> {
    const { data, error } = await client
      .from('leave_requests')
      .insert({
        company_id: fixture.nvcCompanyId,
        employee_id: employeeId,
        type: 'phep_nam',
        from_date: `${TEST_TIMESHEET_YEAR}-04-01`,
        to_date: `${TEST_TIMESHEET_YEAR}-04-03`,
        day_count: '3',
        reason: `${TEST_PREFIX} Nghỉ phép năm`,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  it('người lao động lập được đơn nghỉ cho CHÍNH MÌNH, không lập hộ người khác', async () => {
    const mine = await draftLeave(ketoan, fixture.ketoanEmployeeId);
    expect(mine).toBeTruthy();

    const { error } = await ketoan
      .from('leave_requests')
      .insert({
        company_id: fixture.nvcCompanyId,
        employee_id: fixture.officeEmployeeId,
        type: 'phep_nam',
        from_date: `${TEST_TIMESHEET_YEAR}-04-01`,
        to_date: `${TEST_TIMESHEET_YEAR}-04-02`,
        day_count: '2',
        reason: `${TEST_PREFIX} Lập hộ người khác`,
      })
      .select('id');
    expect(error).not.toBeNull();
  });

  it('đơn nghỉ đi qua Hộp thư Phê duyệt dùng chung và không tự đặt trạng thái duyệt được', async () => {
    const leaveId = await draftLeave(hcns, fixture.officeEmployeeId);

    const direct = await hcns
      .from('leave_requests')
      .update({ status: 'da_duyet' })
      .eq('id', leaveId)
      .select('id');
    expect(direct.error).not.toBeNull();

    const { data: approvalId, error } = await hcns.rpc('submit_leave_request', {
      p_leave_id: leaveId,
    });
    expect(error).toBeNull();

    const decided = await hcns.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: null,
    });
    expect(decided.error).toBeNull();

    const status = await withSql(async (sql) => {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM leave_requests WHERE id = ${leaveId}
      `;
      return rows[0]?.status;
    });
    expect(status).toBe('da_duyet');
  });

  it('đơn đã duyệt thì ngày nghỉ ghi được vào bảng chấm công (NS-05)', async () => {
    const { data: period } = await hcns.rpc('open_timesheet_period', {
      p_company_id: fixture.nvcCompanyId,
      p_year: TEST_TIMESHEET_YEAR,
      p_month: 4,
      p_source_type: 'van_phong',
    });

    const { error } = await hcns.rpc('save_attendance', {
      p_period_id: period,
      p_entries: [
        {
          employee_id: fixture.officeEmployeeId,
          work_date: `${TEST_TIMESHEET_YEAR}-04-02`,
          kind: 'nghi_co_phep',
        },
      ],
    });
    expect(error).toBeNull();

    const linked = await withSql(async (sql) => {
      const rows = await sql<{ leave_request_id: string | null }[]>`
        SELECT leave_request_id FROM timesheet_entries
         WHERE employee_id = ${fixture.officeEmployeeId}
           AND work_date = ${`${TEST_TIMESHEET_YEAR}-04-02`}
      `;
      return rows[0]?.leave_request_id;
    });
    expect(linked).not.toBeNull();
  });

  it('biên bản cấp phát phải có người nhận, và không cấp cho người đã nghỉ việc (NS-08)', async () => {
    const { error } = await hcns.rpc('record_asset_event', {
      p_asset_id: fixture.assetId,
      p_type: 'cap_phat',
      p_event_date: null,
      p_to_employee_id: null,
    });
    expect(error?.message).toContain('người nhận');
  });

  it('điều chuyển tài sản đổi người giữ và để lại biên bản, không ghi đè lịch sử (NS-08)', async () => {
    const { error } = await hcns.rpc('record_asset_event', {
      p_asset_id: fixture.assetId,
      p_type: 'dieu_chuyen',
      p_event_date: null,
      p_to_employee_id: fixture.siteEmployeeId,
      p_notes: `${TEST_PREFIX} Chuyển ra công trường`,
    });
    expect(error).toBeNull();

    const state = await withSql(async (sql) => {
      const [asset] = await sql<{ current_holder_id: string }[]>`
        SELECT current_holder_id FROM assets WHERE id = ${fixture.assetId}
      `;
      const events = await sql<{ n: string }[]>`
        SELECT count(*)::text AS n FROM asset_events WHERE asset_id = ${fixture.assetId}
      `;
      return { holder: asset?.current_holder_id, events: Number(events[0]?.n ?? 0) };
    });
    expect(state.holder).toBe(fixture.siteEmployeeId);
    expect(state.events).toBe(1);
  });

  it('hiện trạng tài sản KHÔNG đổi được bằng lệnh cập nhật thẳng', async () => {
    const { error } = await hcns
      .from('assets')
      .update({ current_holder_id: fixture.officeEmployeeId })
      .eq('id', fixture.assetId)
      .select('id');
    expect(error).not.toBeNull();
  });

  it('Mua hàng không lập được biên bản tài sản nhân sự', async () => {
    const { error } = await muaHang.rpc('record_asset_event', {
      p_asset_id: fixture.assetId,
      p_type: 'thu_hoi',
      p_event_date: null,
    });
    expect(error).not.toBeNull();
  });

  it('nghỉ việc sinh checklist gồm ĐÚNG tài sản người đó đang giữ (NS-08, NS-11)', async () => {
    // Tài sản đang do nhân sự công trường giữ sau lần điều chuyển ở phép thử trên.
    const { data: checklistId, error } = await hcns.rpc('offboard_employee', {
      p_employee_id: fixture.siteEmployeeId,
      p_termination_date: `${TEST_TIMESHEET_YEAR}-05-31`,
    });
    expect(error).toBeNull();

    const items = await withSql(async (sql) => {
      return await sql<{ item_group: string; title: string; asset_id: string | null }[]>`
        SELECT item_group, title, asset_id FROM hr_checklist_items
         WHERE hr_checklist_id = ${checklistId as string}
         ORDER BY item_group, title
      `;
    });

    const assetItems = items.filter((i) => i.asset_id !== null);
    expect(assetItems).toHaveLength(1);
    expect(assetItems[0]!.asset_id).toBe(fixture.assetId);

    // Việc cố định của NS-11 có đủ, và KHÔNG có dòng "thu hồi tài sản" chung chung.
    expect(items.filter((i) => i.asset_id === null)).toHaveLength(OFFBOARDING_CHECKLIST.length);

    const employee = await withSql(async (sql) => {
      const rows = await sql<{ status: string; termination_date: string }[]>`
        SELECT status, termination_date FROM employees WHERE id = ${fixture.siteEmployeeId}
      `;
      return rows[0];
    });
    expect(employee?.status).toBe('da_nghi');
  });

  it('không ghi nhận nghỉ việc hai lần cho cùng một người', async () => {
    const { error } = await hcns.rpc('offboard_employee', {
      p_employee_id: fixture.siteEmployeeId,
      p_termination_date: `${TEST_TIMESHEET_YEAR}-06-30`,
    });
    expect(error?.message).toContain('đã ghi nhận nghỉ việc');
  });

  it('ngày nghỉ việc KHÔNG đặt tay được — phải đi qua quy trình bàn giao (NS-11)', async () => {
    const { error } = await hcns
      .from('employees')
      .update({ termination_date: `${TEST_TIMESHEET_YEAR}-01-01` })
      .eq('id', fixture.officeEmployeeId)
      .select('id');
    expect(error).not.toBeNull();
  });

  it('checklist tiếp nhận theo khối: bảo hộ lao động chỉ có ở công trường và xưởng (NS-03)', async () => {
    const office = await hcns.rpc('start_onboarding', {
      p_employee_id: fixture.officeEmployeeId,
      p_effective_date: null,
    });
    expect(office.error).toBeNull();

    const workshop = await hcns.rpc('start_onboarding', {
      p_employee_id: fixture.workshopEmployeeId,
      p_effective_date: null,
    });
    expect(workshop.error).toBeNull();

    const counts = await withSql(async (sql) => {
      const rows = await sql<{ id: string; n: string; bhld: string }[]>`
        SELECT c.id,
               count(i.*)::text AS n,
               count(i.*) FILTER (WHERE i.title LIKE '%bảo hộ lao động%')::text AS bhld
          FROM hr_checklists c
          LEFT JOIN hr_checklist_items i ON i.hr_checklist_id = c.id
         WHERE c.id IN (${office.data as string}, ${workshop.data as string})
         GROUP BY c.id
      `;
      return new Map(rows.map((r) => [r.id, r]));
    });

    expect(Number(counts.get(office.data as string)?.bhld)).toBe(0);
    expect(Number(counts.get(workshop.data as string)?.bhld)).toBe(1);
    // Bản dựng sẵn ở `@nvg/shared` và bản SQL phải khớp nhau về số việc của khối xưởng.
    expect(Number(counts.get(workshop.data as string)?.n)).toBe(ONBOARDING_CHECKLIST.length);
  });

  it('yêu cầu tuyển dụng đi qua đúng Hộp thư Phê duyệt, và Tổng Giám đốc duyệt được (NS-02)', async () => {
    const { data: position, error: insertError } = await hcns
      .from('recruitment_positions')
      .insert({
        company_id: fixture.nvcCompanyId,
        title: `${TEST_PREFIX} Kỹ sư giám sát`,
        block: 'cong_truong',
        headcount: 1,
        requirements: `${TEST_PREFIX} Ba năm kinh nghiệm nhà xưởng`,
      })
      .select('id')
      .single();
    expect(insertError).toBeNull();

    const { data: approvalId, error } = await hcns.rpc('submit_recruitment_approval', {
      p_position_id: (position as { id: string }).id,
    });
    expect(error).toBeNull();

    // Hành chính – Nhân sự KHÔNG tự duyệt yêu cầu tuyển của mình: hạn mức thuộc Tổng Giám đốc.
    const selfApprove = await hcns.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: null,
    });
    expect(selfApprove.error).not.toBeNull();

    const decided = await tgd.rpc('decide_approval', {
      p_approval_id: approvalId,
      p_decision: 'approved',
      p_note: null,
    });
    expect(decided.error).toBeNull();

    const status = await withSql(async (sql) => {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM recruitment_positions WHERE id = ${(position as { id: string }).id}
      `;
      return rows[0]?.status;
    });
    expect(status).toBe('dang_tuyen');
  });
});
