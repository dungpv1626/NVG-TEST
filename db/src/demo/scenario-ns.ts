/**
 * Hành chính – Nhân sự của NVC — để hướng dẫn và buổi demo có một phòng HCNS đang chạy thật.
 *
 * Sáu nhân sự trải ba khối chấm công (văn phòng, công trường, xưởng), mỗi người mang đúng một
 * việc HCNS phải xử lý trong tuần demo (04/10/2026):
 *   · giấy tờ sắp hết hạn (chứng chỉ an toàn còn ~2 tuần) và đã hết hạn (khám sức khoẻ);
 *   · thử việc sắp hết (10/10) — việc nhắc đánh giá trước hạn, có checklist tiếp nhận;
 *   · hợp đồng xác định hạn hết 31/10;
 *   · tài sản đang cấp phát, một món cần sửa;
 *   · một đơn nghỉ đã duyệt (vào chấm công tháng 9) và một đơn đang chờ duyệt;
 *   · chấm công tháng 9: văn phòng đã xác nhận, công trường đang ghi, xưởng chưa mở — đúng
 *     cảnh «chưa chốt được, còn thiếu khối nào»;
 *   · một yêu cầu tuyển dụng đã duyệt, ba ứng viên ở ba bước.
 *
 * Mọi lượt ghi đi bằng tài khoản HCNS (và Trưởng phòng Thi công cho công khối công trường),
 * qua đúng bảng / hàm nghiệp vụ màn hình dùng. Gốc nhận diện: hồ sơ «Trần Quốc Bảo» của NVC.
 */

import { ACCOUNTS, check, companyId, one, signIn, userId } from './client';
import { clean } from './names';

export const NS_DEMO_EMPLOYEES = [
  'Trần Quốc Bảo',
  'Nguyễn Thị Lan',
  'Phạm Minh Thư',
  'Lê Văn Hùng',
  'Đỗ Văn Tài',
  'Võ Văn Nam',
] as const;
export const NS_DEMO_ASSETS = [
  'Máy tính xách tay Dell Latitude 5450',
  'Máy toàn đạc điện tử Leica TS07',
  'Máy hàn MIG Jasic 250A',
] as const;
export const NS_DEMO_POSITION = 'Kỹ sư giám sát hiện trường nhà xưởng';

/** 02/09 — Quốc khánh: ghi «nghỉ lễ», không bỏ trống. */
const HOLIDAY = '2026-09-02';

/** Ngày làm việc (thứ Hai → thứ Bảy) của tháng 9/2026. */
function septemberWorkdays(): string[] {
  const out: string[] = [];
  for (let d = 1; d <= 30; d++) {
    const date = new Date(Date.UTC(2026, 8, d));
    if (date.getUTCDay() !== 0) out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

export async function loadNs(): Promise<'created' | 'skipped'> {
  const hr = await signIn(ACCOUNTS.nhanSu);
  const nvc = await companyId(hr, 'NVC');

  const existing = await hr
    .from('employees')
    .select('id')
    .eq('company_id', nvc)
    .eq('full_name', NS_DEMO_EMPLOYEES[0])
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.data) return 'skipped';

  const tc = await signIn(ACCOUNTS.truongPhongTc);
  const site = (
    await tc
      .from('construction_sites')
      .select('id')
      .eq('company_id', nvc)
      .ilike('name', '%Phố Nối A%')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
  ).data as { id: string } | null;
  const chiHuy = await signIn(ACCOUNTS.chiHuyTruong);
  const chiHuyId = await userId(chiHuy);
  // Quản lý trực tiếp: trưởng phòng của từng người, đều là tài khoản seed.
  const truongDuAn = await userId(await signIn(ACCOUNTS.dauThauNvc));
  const truongKeToan = await userId(await signIn(ACCOUNTS.ketoan));
  const truongHcns = await userId(hr);
  const truongThiCong = await userId(tc);

  // --- Hồ sơ nhân sự ---------------------------------------------------------------------------
  const base = { company_id: nvc, salary_type: 'thang' };
  const people: Record<string, unknown>[] = [
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[0],
      position: 'Kỹ sư dự toán',
      block: 'van_phong',
      department: 'Phòng Dự án – Đấu thầu',
      manager_user_id: truongDuAn,
      status: 'chinh_thuc',
      hire_date: '2023-04-03',
      phone: '0912 340 101',
      base_salary: 22_000_000,
      allowance: 1_500_000,
    },
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[1],
      position: 'Kế toán viên',
      block: 'van_phong',
      department: 'Phòng Kế toán',
      manager_user_id: truongKeToan,
      status: 'chinh_thuc',
      hire_date: '2025-11-01',
      phone: '0912 340 102',
      base_salary: 15_000_000,
      allowance: 1_000_000,
    },
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[2],
      position: 'Nhân viên hành chính',
      block: 'van_phong',
      department: 'Phòng Hành chính – Nhân sự',
      manager_user_id: truongHcns,
      status: 'thu_viec',
      hire_date: '2026-08-11',
      probation_end_date: '2026-10-10',
      phone: '0912 340 103',
      base_salary: 10_000_000,
      allowance: 500_000,
    },
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[3],
      position: 'Kỹ sư giám sát',
      block: 'cong_truong',
      department: 'Ban chỉ huy công trường',
      status: 'chinh_thuc',
      hire_date: '2024-03-01',
      construction_site_id: site?.id ?? null,
      manager_user_id: chiHuyId,
      phone: '0912 340 104',
      base_salary: 20_000_000,
      allowance: 3_000_000,
    },
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[4],
      position: 'Thủ kho công trường',
      block: 'cong_truong',
      department: 'Ban chỉ huy công trường',
      status: 'chinh_thuc',
      hire_date: '2025-05-12',
      construction_site_id: site?.id ?? null,
      manager_user_id: chiHuyId,
      phone: '0912 340 105',
      base_salary: 11_000_000,
      allowance: 2_000_000,
    },
    {
      ...base,
      full_name: NS_DEMO_EMPLOYEES[5],
      position: 'Thợ hàn bậc 4',
      block: 'xuong',
      department: 'Xưởng gia công kết cấu',
      manager_user_id: truongThiCong,
      status: 'chinh_thuc',
      hire_date: '2022-07-18',
      phone: '0912 340 106',
      salary_type: 'ngay_cong',
      base_salary: 550_000,
    },
  ];
  const ids: Record<string, string> = {};
  for (const p of people) {
    const row = await one<{ id: string }>(
      `lập hồ sơ ${String(p.full_name)}`,
      hr.from('employees').insert(p).select('id').single(),
    );
    ids[String(p.full_name)] = row.id;
  }
  const [bao, lan, thu, hung, tai, nam] = NS_DEMO_EMPLOYEES.map((n) => ids[n]!) as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  // --- Hợp đồng lao động và bảo hiểm ----------------------------------------------------------
  const contracts = [
    {
      employee_id: bao,
      type: 'khong_xac_dinh_han',
      start_date: '2024-04-03',
      signed_date: '2024-04-01',
      salary_amount: 22_000_000,
      insurance_status: 'dang_tham_gia',
    },
    {
      employee_id: lan,
      type: 'xac_dinh_han',
      start_date: '2025-11-01',
      end_date: '2026-10-31',
      signed_date: '2025-10-30',
      salary_amount: 15_000_000,
      insurance_status: 'dang_tham_gia',
    },
    {
      employee_id: thu,
      type: 'thu_viec',
      start_date: '2026-08-11',
      end_date: '2026-10-10',
      signed_date: '2026-08-10',
      salary_amount: 8_500_000,
      insurance_status: 'chua_tham_gia',
    },
    {
      employee_id: hung,
      type: 'khong_xac_dinh_han',
      start_date: '2025-03-01',
      signed_date: '2025-02-26',
      salary_amount: 20_000_000,
      insurance_status: 'dang_tham_gia',
    },
    {
      employee_id: tai,
      type: 'xac_dinh_han',
      start_date: '2025-05-12',
      end_date: '2027-05-11',
      signed_date: '2025-05-10',
      salary_amount: 11_000_000,
      insurance_status: 'dang_tham_gia',
    },
    {
      employee_id: nam,
      type: 'khong_xac_dinh_han',
      start_date: '2023-07-18',
      signed_date: '2023-07-15',
      insurance_status: 'dang_tham_gia',
    },
  ];
  for (const c of contracts) {
    check(
      'lập hợp đồng lao động',
      await hr
        .from('employment_contracts')
        .insert({ company_id: nvc, status: 'dang_hieu_luc', ...c }),
    );
  }

  // --- Giấy tờ có hạn --------------------------------------------------------------------------
  const docs = [
    {
      employee_id: hung,
      type: 'chung_chi_an_toan',
      title: 'Chứng chỉ huấn luyện an toàn nhóm 2',
      document_number: 'ATLD-2024-1187',
      issued_date: '2024-10-20',
      expiry_date: '2026-10-20',
    },
    {
      employee_id: nam,
      type: 'kham_suc_khoe',
      title: 'Giấy khám sức khỏe định kỳ',
      document_number: 'KSK-2025-0442',
      issued_date: '2025-09-20',
      expiry_date: '2026-09-20',
    },
    {
      employee_id: bao,
      type: 'chung_chi_hanh_nghe',
      title: 'Chứng chỉ hành nghề định giá xây dựng hạng II',
      document_number: 'CCHN-DG-II-3391',
      issued_date: '2023-05-04',
      expiry_date: '2028-05-04',
    },
    {
      employee_id: tai,
      type: 'giay_phep_lai_xe',
      title: 'Giấy phép lái xe hạng C',
      document_number: 'GPLX-C-0218',
      issued_date: '2021-12-15',
      expiry_date: '2026-12-15',
    },
  ];
  for (const d of docs) {
    check(
      'lập giấy tờ',
      await hr
        .from('hr_documents')
        .insert({ company_id: nvc, original_location: clean('Tủ hồ sơ HCNS'), ...d }),
    );
  }

  // --- Tài sản cấp phát -----------------------------------------------------------------------
  const assets = [
    {
      name: NS_DEMO_ASSETS[0],
      serial_number: 'DL5450-2291',
      category: 'Thiết bị văn phòng',
      value: 24_500_000,
      purchase_date: '2025-11-03',
      location: 'Văn phòng NVC',
      holder: lan,
    },
    {
      name: NS_DEMO_ASSETS[1],
      serial_number: 'TS07-4471',
      category: 'Thiết bị đo đạc',
      value: 96_000_000,
      purchase_date: '2024-11-03',
      location: 'Công trường Phố Nối A',
      holder: hung,
    },
    {
      name: NS_DEMO_ASSETS[2],
      serial_number: 'JAS250-1129',
      category: 'Thiết bị xưởng',
      value: 21_900_000,
      purchase_date: '2025-01-20',
      location: 'Xưởng gia công',
      holder: nam,
    },
  ];
  const assetIds: string[] = [];
  for (const { holder, ...a } of assets) {
    const row = await one<{ id: string }>(
      `lập tài sản ${a.name}`,
      hr
        .from('assets')
        .insert({ company_id: nvc, ...a })
        .select('id')
        .single(),
    );
    assetIds.push(row.id);
    check(
      `cấp phát ${a.name}`,
      await hr.rpc('record_asset_event', {
        p_asset_id: row.id,
        p_type: 'cap_phat',
        p_event_date: a.purchase_date,
        p_to_employee_id: holder,
        p_condition: 'tot',
        p_amount: null,
        p_notes: clean('Biên bản bàn giao khi nhận việc'),
      }),
    );
  }
  check(
    'máy hàn cần sửa',
    await hr.rpc('record_asset_event', {
      p_asset_id: assetIds[2]!,
      p_type: 'sua_chua',
      p_event_date: '2026-09-24',
      p_to_employee_id: null,
      p_condition: 'can_sua_chua',
      p_amount: 1_800_000,
      p_notes: clean('Mỏ hàn chập chờn, gửi hãng kiểm tra'),
    }),
  );

  // --- Nghỉ phép: một đơn đã duyệt (vào công tháng 9), một đơn chờ duyệt ------------------------
  // Đơn nghỉ và yêu cầu tuyển dụng do Trưởng phòng HCNS duyệt (approval_limits: chỉ vai trò NS).
  async function leave(employee: string, from: string, to: string, days: number, reason: string) {
    const row = await one<{ id: string }>(
      `lập đơn nghỉ ${from}`,
      hr
        .from('leave_requests')
        .insert({
          company_id: nvc,
          employee_id: employee,
          type: 'phep_nam',
          from_date: from,
          to_date: to,
          day_count: days,
          reason: clean(reason),
        })
        .select('id')
        .single(),
    );
    check(`gửi đơn nghỉ ${from}`, await hr.rpc('submit_leave_request', { p_leave_id: row.id }));
    return row.id;
  }
  const approvedLeave = await leave(bao, '2026-09-15', '2026-09-16', 2, 'Việc gia đình');
  const approval = await one<{ approval_id: string }>(
    'đọc phê duyệt đơn nghỉ',
    hr.from('leave_requests').select('approval_id').eq('id', approvedLeave).single(),
  );
  check(
    'duyệt đơn nghỉ 15/09',
    await hr.rpc('decide_approval', {
      p_approval_id: approval.approval_id,
      p_decision: 'approved',
      p_note: null,
    }),
  );
  await leave(lan, '2026-10-08', '2026-10-09', 2, 'Về quê dự đám cưới em gái');

  // --- Chấm công tháng 9 ----------------------------------------------------------------------
  const days = septemberWorkdays();
  const office = check(
    'mở kỳ công văn phòng',
    await hr.rpc('open_timesheet_period', {
      p_company_id: nvc,
      p_year: 2026,
      p_month: 9,
      p_source_type: 'van_phong',
    }),
  ) as string;
  const officeEntries = [bao, lan, thu].flatMap((emp) =>
    days.map((d) => ({
      employee_id: emp,
      work_date: d,
      kind:
        d === HOLIDAY
          ? 'nghi_le'
          : emp === bao && (d === '2026-09-15' || d === '2026-09-16')
            ? 'nghi_co_phep'
            : 'lam_viec',
      hours:
        d === HOLIDAY || (emp === bao && (d === '2026-09-15' || d === '2026-09-16')) ? null : 8,
    })),
  );
  check(
    'ghi công văn phòng',
    await hr.rpc('save_attendance', { p_period_id: office, p_entries: officeEntries }),
  );
  check(
    'gửi xác nhận công văn phòng',
    await hr.rpc('submit_timesheet_period', { p_period_id: office }),
  );
  check(
    'xác nhận công văn phòng',
    await hr.rpc('confirm_timesheet_period', { p_period_id: office }),
  );

  // Công trường: HCNS mở kỳ, Trưởng phòng Thi công ghi — đang ghi dở tới 25/09.
  const siteP = check(
    'mở kỳ công công trường',
    await hr.rpc('open_timesheet_period', {
      p_company_id: nvc,
      p_year: 2026,
      p_month: 9,
      p_source_type: 'cong_truong',
    }),
  ) as string;
  const siteEntries = [hung, tai].flatMap((emp) =>
    days
      .filter((d) => d <= '2026-09-25')
      .map((d) => ({
        employee_id: emp,
        work_date: d,
        kind: 'lam_viec',
        hours: 8,
        overtime_hours: d >= '2026-09-21' ? 2 : null,
      })),
  );
  check(
    'ghi công công trường',
    await tc.rpc('save_attendance', { p_period_id: siteP, p_entries: siteEntries }),
  );

  // --- Tiếp nhận nhân sự thử việc ---------------------------------------------------------------
  check(
    'mở checklist tiếp nhận',
    await hr.rpc('start_onboarding', { p_employee_id: thu, p_effective_date: '2026-08-11' }),
  );

  // --- Tuyển dụng -------------------------------------------------------------------------------
  const position = await one<{ id: string }>(
    'lập yêu cầu tuyển dụng',
    hr
      .from('recruitment_positions')
      .insert({
        company_id: nvc,
        title: NS_DEMO_POSITION,
        department: clean('Ban chỉ huy công trường'),
        block: 'cong_truong',
        headcount: 2,
        needed_by_date: '2026-10-31',
        requirements: clean(
          'Tốt nghiệp Xây dựng, tối thiểu 3 năm giám sát nhà xưởng công nghiệp, có chứng chỉ an toàn.',
        ),
      })
      .select('id')
      .single(),
  );
  check(
    'gửi duyệt tuyển dụng',
    await hr.rpc('submit_recruitment_approval', { p_position_id: position.id }),
  );
  const pos = await one<{ approval_id: string }>(
    'đọc phê duyệt tuyển dụng',
    hr.from('recruitment_positions').select('approval_id').eq('id', position.id).single(),
  );
  check(
    'duyệt tuyển dụng',
    await hr.rpc('decide_approval', {
      p_approval_id: pos.approval_id,
      p_decision: 'approved',
      p_note: null,
    }),
  );
  const candidates = [
    {
      full_name: 'Bùi Quốc Toản',
      phone: '0987 120 301',
      applied_date: '2026-09-18',
      stage: 'sang_loc',
    },
    {
      full_name: 'Hoàng Thị Ngọc',
      phone: '0987 120 302',
      applied_date: '2026-09-15',
      stage: 'phong_van',
    },
    {
      full_name: 'Đinh Văn Kiên',
      phone: '0987 120 303',
      applied_date: '2026-09-08',
      stage: 'moi_nhan_viec',
    },
  ];
  for (const { stage, ...c } of candidates) {
    const row = await one<{ id: string }>(
      `nhận hồ sơ ${c.full_name}`,
      hr
        .from('recruitment_candidates')
        .insert({ company_id: nvc, recruitment_position_id: position.id, ...c })
        .select('id')
        .single(),
    );
    check(
      `chuyển bước ${c.full_name}`,
      await hr.from('recruitment_candidates').update({ stage }).eq('id', row.id),
    );
  }

  return 'created';
}
