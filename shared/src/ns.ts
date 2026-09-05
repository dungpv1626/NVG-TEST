/**
 * Hằng số nghiệp vụ Module NS — Hành chính và Nhân sự.
 *
 * Nguồn: PRD NS-01 → NS-11, Backend Schema 4.10, Webapp Flow 3.8 + 7 (bản đồ màn hình).
 *
 * Ranh giới của cả module (PRD NS, mục "Ranh giới KHÔNG làm") chi phối từng dòng dưới đây:
 *
 *  1. Phần mềm KHÔNG tự quyết định tuyển dụng, tăng – giảm lương, đánh giá năng lực, khen
 *     thưởng, kỷ luật, điều chuyển hay chấm dứt hợp đồng. Vì vậy trong file này không có
 *     hàm nào tự kết luận "nên tuyển", "nên tăng lương", "đạt/không đạt". Mọi hàm chỉ TỔNG
 *     HỢP số liệu và NÊU cảnh báo để người quản lý đọc rồi tự quyết.
 *  2. Lương, sức khỏe, kỷ luật, căn cước là dữ liệu nhạy cảm — phân quyền chặt và ghi nhật
 *     ký truy cập (PRD NEN-07). Ở tầng CSDL, các cột đó không cấp quyền đọc trực tiếp mà đi
 *     qua hàm có ghi nhật ký; ở đây chỉ có nhãn và kiểu, không có giá trị thật nào.
 *  3. Hồ sơ giấy bắt buộc lưu bản gốc vẫn lưu bản giấy; hệ thống theo dõi vị trí, tình
 *     trạng và bản scan — nên bảng giấy tờ có cột "nơi lưu bản gốc", không phải chỗ thay thế.
 *
 * ⚠️ NS-06 (công thức lương) CỐ Ý chưa làm: PRD Mục 10 ghi rõ quy chế lương của từng công ty
 * và từng nhóm nhân sự phải do Kế toán – HCNS xác nhận trước khi cấu hình. Ở đây chỉ khai
 * báo HÌNH THỨC trả lương (`SALARY_TYPES`) — thứ PRD NS-06 đã liệt kê đủ — chứ không có
 * công thức tính tiền nào.
 */

import type { StatusGroup } from './status';

/* ========================================================================== *
 * Hồ sơ nhân sự — NS-01
 * ========================================================================== */

/**
 * Ba khối lao động — PRD NS-04 nguyên văn: "văn phòng", "công trường", "xưởng sản xuất".
 *
 * Đây KHÔNG phải phòng ban. Ba khối này khác nhau ở CÁCH chấm công (máy chấm công / chỉ huy
 * trưởng ghi quân số / ca + sản lượng), nên chúng quyết định màn hình nhập liệu và người
 * xác nhận, chứ không quyết định sơ đồ tổ chức.
 */
export const WORK_BLOCKS = ['van_phong', 'cong_truong', 'xuong'] as const;
export type WorkBlock = (typeof WORK_BLOCKS)[number];

export const WORK_BLOCK_LABELS: Readonly<Record<WorkBlock, string>> = {
  van_phong: 'Văn phòng',
  cong_truong: 'Công trường',
  xuong: 'Xưởng sản xuất',
};

/** Cách chấm công của từng khối — PRD NS-04. Hiện ở đầu màn hình để không ai nhập nhầm kiểu. */
export const WORK_BLOCK_TIMEKEEPING: Readonly<Record<WorkBlock, string>> = {
  van_phong: 'Dữ liệu máy chấm công, đối chiếu đơn từ',
  cong_truong: 'Chỉ huy trưởng ghi quân số và thời gian theo nhân sự, tổ đội',
  xuong: 'Máy chấm công kèm quản đốc xác nhận ca, tăng ca và sản lượng',
};

/**
 * Tình trạng làm việc của một nhân sự.
 *
 * `thu_viec` tách riêng vì NS-03 đòi nhắc đánh giá thử việc TRƯỚC thời hạn — gộp vào
 * `chinh_thuc` thì không còn mốc nào để nhắc.
 */
export const EMPLOYEE_STATUSES = ['thu_viec', 'chinh_thuc', 'tam_nghi', 'da_nghi'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_META: Readonly<
  Record<EmployeeStatus, { label: string; group: StatusGroup }>
> = {
  thu_viec: { label: 'Đang thử việc', group: 'in_progress' },
  chinh_thuc: { label: 'Chính thức', group: 'completed' },
  tam_nghi: { label: 'Tạm nghỉ', group: 'draft' },
  da_nghi: { label: 'Đã nghỉ việc', group: 'completed' },
};

/**
 * Hình thức trả lương — PRD NS-06 liệt kê đủ bốn, không thêm không bớt.
 *
 * ⚠️ Chỉ là PHÂN LOẠI. Công thức quy ra tiền của từng hình thức thuộc quy chế lương mà NVG
 * chưa ban hành (PRD Mục 10) — không đoán, không hard-code ở bất kỳ đâu.
 */
export const SALARY_TYPES = ['thang', 'ngay_cong', 'san_pham', 'khoan_khoi_luong'] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const SALARY_TYPE_LABELS: Readonly<Record<SalaryType, string>> = {
  thang: 'Lương tháng',
  ngay_cong: 'Lương theo ngày công / ca',
  san_pham: 'Khoán sản phẩm, năng suất',
  khoan_khoi_luong: 'Khoán theo khối lượng công việc',
};

/** Mã loại hồ sơ khi cấp mã nhân sự (`next_record_code`) — ví dụ `NVC-NS-2026-0001`. */
export const EMPLOYEE_CODE_PREFIX = 'NS';

/* ========================================================================== *
 * Hợp đồng lao động và bảo hiểm — NS-07
 * ========================================================================== */

/**
 * Loại hợp đồng lao động.
 *
 * Bám Bộ luật Lao động 2019 (hai loại chính thức: xác định thời hạn và không xác định thời
 * hạn) cộng hai dạng NVG thực tế đang dùng theo khảo sát PRD Mục 1.2: thử việc và khoán
 * việc cho lao động thời vụ 50–200 người.
 */
export const EMPLOYMENT_CONTRACT_TYPES = [
  'thu_viec',
  'xac_dinh_han',
  'khong_xac_dinh_han',
  'khoan_viec',
] as const;
export type EmploymentContractType = (typeof EMPLOYMENT_CONTRACT_TYPES)[number];

export const EMPLOYMENT_CONTRACT_TYPE_LABELS: Readonly<Record<EmploymentContractType, string>> = {
  thu_viec: 'Hợp đồng thử việc',
  xac_dinh_han: 'Hợp đồng xác định thời hạn',
  khong_xac_dinh_han: 'Hợp đồng không xác định thời hạn',
  khoan_viec: 'Hợp đồng khoán việc, thời vụ',
};

/** Trạng thái một hợp đồng lao động — NS-07 "theo dõi tăng – giảm, thời hạn hiệu lực". */
export const EMPLOYMENT_CONTRACT_STATUSES = [
  'nhap',
  'dang_hieu_luc',
  'da_ket_thuc',
  'da_huy',
] as const;
export type EmploymentContractStatus = (typeof EMPLOYMENT_CONTRACT_STATUSES)[number];

export const EMPLOYMENT_CONTRACT_STATUS_META: Readonly<
  Record<EmploymentContractStatus, { label: string; group: StatusGroup }>
> = {
  nhap: { label: 'Nháp', group: 'draft' },
  dang_hieu_luc: { label: 'Đang hiệu lực', group: 'in_progress' },
  da_ket_thuc: { label: 'Đã kết thúc', group: 'completed' },
  da_huy: { label: 'Đã hủy', group: 'completed' },
};

/** Tình trạng tham gia bảo hiểm bắt buộc — NS-07 "theo dõi tăng – giảm". */
export const INSURANCE_STATUSES = ['chua_tham_gia', 'dang_tham_gia', 'da_bao_giam'] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export const INSURANCE_STATUS_LABELS: Readonly<Record<InsuranceStatus, string>> = {
  chua_tham_gia: 'Chưa tham gia',
  dang_tham_gia: 'Đang tham gia',
  da_bao_giam: 'Đã báo giảm',
};

/* ========================================================================== *
 * Giấy tờ có thời hạn — NS-10 (liên kết NEN-04)
 * ========================================================================== */

/**
 * Bốn mốc nhắc trước hạn — PRD NS-10 và NEN-04 nguyên văn "90, 60, 30 và 7 ngày".
 *
 * Xếp GIẢM DẦN để `documentReminderStage` trả về mốc xa nhất còn đúng, tránh nhắc dồn bốn
 * lần trong cùng một ngày.
 */
export const DOCUMENT_REMINDER_DAYS = [90, 60, 30, 7] as const;
export type DocumentReminderDay = (typeof DOCUMENT_REMINDER_DAYS)[number];

/**
 * Loại giấy tờ có thời hạn cần theo dõi — NS-10 "giấy tờ pháp lý, chứng chỉ, giấy phép,
 * bảo hiểm". NS-09 thêm giấy tờ định danh và chứng chỉ huấn luyện an toàn của lao động
 * thời vụ, nên danh sách này dùng chung cho cả nhân sự lẫn lao động thuê ngoài.
 */
export const HR_DOCUMENT_TYPES = [
  'can_cuoc',
  'chung_chi_hanh_nghe',
  'chung_chi_an_toan',
  'giay_phep_lai_xe',
  'kham_suc_khoe',
  'bao_hiem',
  'khac',
] as const;
export type HrDocumentType = (typeof HR_DOCUMENT_TYPES)[number];

export const HR_DOCUMENT_TYPE_LABELS: Readonly<Record<HrDocumentType, string>> = {
  can_cuoc: 'Căn cước công dân',
  chung_chi_hanh_nghe: 'Chứng chỉ hành nghề',
  chung_chi_an_toan: 'Chứng chỉ huấn luyện an toàn',
  giay_phep_lai_xe: 'Giấy phép lái xe',
  kham_suc_khoe: 'Giấy khám sức khỏe',
  bao_hiem: 'Bảo hiểm',
  khac: 'Giấy tờ khác',
};

/**
 * Giấy tờ chứa dữ liệu nhạy cảm theo PRD NS (ranh giới): căn cước và sức khỏe.
 *
 * Số hiệu của hai loại này chỉ hiện cho vai trò được phép và mỗi lượt xem đều ghi nhật ký —
 * cùng cơ chế với lương, xem `rls_sees_sensitive('personal')` ở tầng CSDL.
 */
export const SENSITIVE_HR_DOCUMENT_TYPES: readonly HrDocumentType[] = ['can_cuoc', 'kham_suc_khoe'];

export function isSensitiveHrDocument(type: HrDocumentType): boolean {
  return SENSITIVE_HR_DOCUMENT_TYPES.includes(type);
}

/**
 * Mốc nhắc đang áp cho một giấy tờ, hoặc `null` nếu chưa tới mốc nào.
 *
 * Trả về SỐ NGÀY của mốc (90 | 60 | 30 | 7) chứ không phải true/false, để thông báo nói
 * được "còn 30 ngày" thay vì "sắp hết hạn" — Content Guidelines 3.4 cấm cảnh báo suông.
 *
 * Giấy tờ ĐÃ hết hạn trả về `0`: nó không còn là "sắp", nhưng bỏ qua thì mất hẳn cảnh báo
 * cho đúng nhóm nguy hiểm nhất.
 */
export function documentReminderStage(
  expiryDate: string | Date | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!expiryDate) return null;
  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;

  const days = Math.ceil((startOfDay(expiry).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (days < 0) return 0;

  // Danh sách xếp giảm dần, nên vòng lặp kết thúc ở mốc NHỎ NHẤT còn bao được `days`:
  // còn 80 ngày → mốc 90; còn 5 ngày → mốc 7; còn 100 ngày → chưa tới mốc nào.
  let chosen: number | null = null;
  for (const mark of DOCUMENT_REMINDER_DAYS) {
    if (days <= mark) chosen = mark;
  }
  return chosen;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/* ========================================================================== *
 * Chấm công ba khối — NS-04
 * ========================================================================== */

/**
 * Vòng đời một kỳ chấm công.
 *
 * PRD NS-04 mô tả ba việc nối nhau, do BA người khác nhau làm: khối GHI dữ liệu → trưởng
 * đơn vị XÁC NHẬN tính đúng → HCNS CHỐT và chuyển Kế toán. Gộp lại thì không biết bảng công
 * còn được sửa tự do hay không, mà đó chính là ranh giới NS-04 đòi ("mọi điều chỉnh SAU
 * thời điểm chốt phải ghi rõ lý do và người phê duyệt").
 *
 * Mỗi kỳ thuộc về MỘT KHỐI của MỘT pháp nhân, không phải một kỳ chung cho cả ba khối: ba
 * khối chấm công bằng ba cách và ba người xác nhận khác nhau, ghép chung thì khối xong sớm
 * phải chờ khối xong muộn mới xác nhận được.
 */
export const TIMESHEET_PERIOD_STATUSES = [
  'dang_ghi',
  'cho_xac_nhan',
  'da_xac_nhan',
  'da_chot',
] as const;
export type TimesheetPeriodStatus = (typeof TIMESHEET_PERIOD_STATUSES)[number];

export const TIMESHEET_PERIOD_STATUS_META: Readonly<
  Record<TimesheetPeriodStatus, { label: string; group: StatusGroup }>
> = {
  dang_ghi: { label: 'Đang ghi công', group: 'draft' },
  cho_xac_nhan: { label: 'Chờ trưởng đơn vị xác nhận', group: 'pending_approval' },
  da_xac_nhan: { label: 'Đã xác nhận, chờ chốt', group: 'in_progress' },
  da_chot: { label: 'Đã chốt', group: 'completed' },
};

/**
 * Loại công của một ngày.
 *
 * `nghi_co_phep` và `nghi_khong_phep` tách nhau vì hệ quả tính lương khác hẳn, và NS-05
 * yêu cầu nghỉ phép phải khớp với đơn đã duyệt — hai loại chung một mã thì không đối chiếu
 * được đơn nào với ngày nào.
 */
export const ATTENDANCE_KINDS = [
  'lam_viec',
  'nghi_co_phep',
  'nghi_khong_phep',
  'nghi_le',
  'cong_tac',
] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

export const ATTENDANCE_KIND_LABELS: Readonly<Record<AttendanceKind, string>> = {
  lam_viec: 'Làm việc',
  nghi_co_phep: 'Nghỉ có phép',
  nghi_khong_phep: 'Nghỉ không phép',
  nghi_le: 'Nghỉ lễ',
  cong_tac: 'Công tác',
};

/**
 * Số giờ của một ngày công đủ.
 *
 * ⚠️ SUY LUẬN — tài liệu không nêu. 8 giờ theo Bộ luật Lao động 2019 Điều 105. Dùng để quy
 * giờ ra ngày công khi tổng hợp; **cần NVG xác nhận** vì xưởng có thể tính theo ca 12 giờ.
 * Khảo sát Xưởng (02/09/2026) xác nhận có máy chấm công nhưng để trống cách tính lương, nên
 * chưa loại trừ được ca 12 giờ.
 *
 * Từ NEN-12, giá trị THẬT nằm ở tham số `hours_per_workday` trong `system_parameters` và do
 * CSDL áp dụng khi chốt kỳ (`consolidate_timesheets` — migration 0112). Hằng số này còn lại chỉ
 * là giá trị DỰ PHÒNG cho phần tính trong trình duyệt khi tham số chưa cấu hình.
 */
export const HOURS_PER_WORKDAY = 8;

export interface AttendanceEntryInput {
  readonly kind: AttendanceKind;
  /** Giờ làm trong ngày. Rỗng với ngày nghỉ. */
  readonly hours?: number | string | null;
  /** Giờ tăng ca — NS-05 quản lý tăng ca gắn với chấm công đã xác nhận. */
  readonly overtimeHours?: number | string | null;
  /** Sản lượng của ca (khối xưởng) — NS-04 "xác nhận ca làm, tăng ca, sản lượng". */
  readonly outputQuantity?: number | string | null;
}

export interface AttendanceSummary {
  /** Ngày công quy đổi từ giờ làm — làm tròn 2 chữ số để không nuốt mất nửa ngày công. */
  readonly workdays: number;
  readonly workedHours: number;
  readonly overtimeHours: number;
  readonly leaveDays: number;
  readonly unpaidAbsenceDays: number;
  readonly holidayDays: number;
  readonly businessTripDays: number;
  readonly outputQuantity: number;
}

/**
 * Tổng hợp một chuỗi ngày công thành các con số Kế toán cần (NS-05 "chuyển dữ liệu đã chốt
 * cho Kế toán tính lương mà không cần nhập lại").
 *
 * Hàm này KHÔNG quy ra tiền: quy chế lương chưa có (NS-06). Nó dừng đúng ở chỗ đếm công.
 */
export function summarizeAttendance(entries: readonly AttendanceEntryInput[]): AttendanceSummary {
  let workedHours = 0;
  let overtimeHours = 0;
  let leaveDays = 0;
  let unpaidAbsenceDays = 0;
  let holidayDays = 0;
  let businessTripDays = 0;
  let outputQuantity = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours ?? 0) || 0;
    overtimeHours += Number(entry.overtimeHours ?? 0) || 0;
    outputQuantity += Number(entry.outputQuantity ?? 0) || 0;

    switch (entry.kind) {
      case 'lam_viec':
        workedHours += hours;
        break;
      case 'cong_tac':
        workedHours += hours || HOURS_PER_WORKDAY;
        businessTripDays += 1;
        break;
      case 'nghi_co_phep':
        leaveDays += 1;
        break;
      case 'nghi_khong_phep':
        unpaidAbsenceDays += 1;
        break;
      case 'nghi_le':
        holidayDays += 1;
        break;
    }
  }

  return {
    workdays: Math.round((workedHours / HOURS_PER_WORKDAY) * 100) / 100,
    workedHours: Math.round(workedHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    leaveDays,
    unpaidAbsenceDays,
    holidayDays,
    businessTripDays,
    outputQuantity: Math.round(outputQuantity * 1000) / 1000,
  };
}

/* ========================================================================== *
 * Nghỉ phép, thưởng – phạt — NS-05
 * ========================================================================== */

export const LEAVE_TYPES = ['phep_nam', 'khong_luong', 'om_dau', 'thai_san', 'viec_rieng'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Readonly<Record<LeaveType, string>> = {
  phep_nam: 'Nghỉ phép năm',
  khong_luong: 'Nghỉ không lương',
  om_dau: 'Nghỉ ốm',
  thai_san: 'Nghỉ thai sản',
  viec_rieng: 'Nghỉ việc riêng',
};

/**
 * Trạng thái một đơn nghỉ phép.
 *
 * Đi qua Hộp thư Phê duyệt dùng chung (`approval_subject = 'leave_request'`) như mọi loại
 * phê duyệt khác — Webapp Flow 4.6 chỉ cho phép MỘT mẫu phê duyệt cho toàn hệ thống.
 */
export const LEAVE_REQUEST_STATUSES = [
  'nhap',
  'cho_duyet',
  'da_duyet',
  'tu_choi',
  'da_huy',
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_STATUS_META: Readonly<
  Record<LeaveRequestStatus, { label: string; group: StatusGroup }>
> = {
  nhap: { label: 'Nháp', group: 'draft' },
  cho_duyet: { label: 'Chờ duyệt', group: 'pending_approval' },
  da_duyet: { label: 'Đã duyệt', group: 'completed' },
  tu_choi: { label: 'Từ chối', group: 'completed' },
  da_huy: { label: 'Đã hủy', group: 'completed' },
};

/**
 * Số ngày nghỉ của một đơn, tính cả ngày đầu và ngày cuối.
 *
 * KHÔNG trừ thứ Bảy, Chủ nhật và ngày lễ: NVG làm việc theo lịch công trường, ngày nghỉ
 * thực tế khác nhau giữa ba khối. Số ngày TÍNH LƯƠNG lấy từ bảng chấm công đã chốt, còn số
 * này chỉ để hiển thị trên đơn.
 */
export function leaveDayCount(fromDate: string | Date, toDate: string | Date): number {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const days = Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

/** Thưởng hay phạt — NS-05. Hai chiều của cùng một khoản điều chỉnh gắn kỳ lương. */
export const PAYROLL_ADJUSTMENT_KINDS = ['thuong', 'phat'] as const;
export type PayrollAdjustmentKind = (typeof PAYROLL_ADJUSTMENT_KINDS)[number];

export const PAYROLL_ADJUSTMENT_KIND_LABELS: Readonly<Record<PayrollAdjustmentKind, string>> = {
  thuong: 'Thưởng',
  phat: 'Phạt',
};

/* ========================================================================== *
 * Tuyển dụng — NS-02
 * ========================================================================== */

/** Vòng đời một YÊU CẦU tuyển dụng (vị trí cần tuyển) — NS-02 nửa đầu. */
export const RECRUITMENT_POSITION_STATUSES = [
  'nhap',
  'cho_duyet',
  'dang_tuyen',
  'da_tuyen_du',
  'dung_tuyen',
] as const;
export type RecruitmentPositionStatus = (typeof RECRUITMENT_POSITION_STATUSES)[number];

export const RECRUITMENT_POSITION_STATUS_META: Readonly<
  Record<RecruitmentPositionStatus, { label: string; group: StatusGroup }>
> = {
  nhap: { label: 'Nháp', group: 'draft' },
  cho_duyet: { label: 'Chờ duyệt', group: 'pending_approval' },
  dang_tuyen: { label: 'Đang tuyển', group: 'in_progress' },
  da_tuyen_du: { label: 'Đã tuyển đủ', group: 'completed' },
  dung_tuyen: { label: 'Dừng tuyển', group: 'completed' },
};

/**
 * Các cột Kanban của màn hình Tuyển dụng (Webapp Flow 7: "NS | Tuyển dụng | Kanban").
 *
 * Bám ĐÚNG chuỗi của NS-02 kể từ khi đã có vị trí được duyệt: sàng lọc CV → lên lịch phỏng
 * vấn → tổng hợp đánh giá → phản hồi ứng viên → thư mời nhận việc. Thêm `moi` ở đầu (CV vừa
 * nhận, chưa ai đọc) và hai kết cục đóng hồ sơ.
 *
 * Thứ tự khai báo CHÍNH LÀ thứ tự cột trên bảng Kanban (Webapp Flow 4.5).
 */
export const CANDIDATE_STAGES = [
  'moi',
  'sang_loc',
  'phong_van',
  'danh_gia',
  'moi_nhan_viec',
  'nhan_viec',
  'tu_choi',
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const CANDIDATE_STAGE_META: Readonly<
  Record<CandidateStage, { label: string; group: StatusGroup }>
> = {
  moi: { label: 'Hồ sơ mới', group: 'draft' },
  sang_loc: { label: 'Sàng lọc CV', group: 'in_progress' },
  phong_van: { label: 'Phỏng vấn', group: 'in_progress' },
  danh_gia: { label: 'Tổng hợp đánh giá', group: 'in_progress' },
  moi_nhan_viec: { label: 'Đã gửi thư mời', group: 'pending_approval' },
  nhan_viec: { label: 'Đã nhận việc', group: 'completed' },
  tu_choi: { label: 'Không tuyển', group: 'completed' },
};

/** Cột cuối cùng còn nằm trong quy trình — sau hai cột này hồ sơ đóng lại. */
export const OPEN_CANDIDATE_STAGES: readonly CandidateStage[] = [
  'moi',
  'sang_loc',
  'phong_van',
  'danh_gia',
  'moi_nhan_viec',
];

/* ========================================================================== *
 * Tài sản cấp phát — NS-08
 * ========================================================================== */

/** Tình trạng một tài sản, công cụ dụng cụ — NS-08 nguyên văn "tình trạng". */
export const ASSET_CONDITIONS = ['tot', 'can_sua_chua', 'hong', 'da_thanh_ly'] as const;
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const ASSET_CONDITION_LABELS: Readonly<Record<AssetCondition, string>> = {
  tot: 'Tốt',
  can_sua_chua: 'Cần sửa chữa',
  hong: 'Hỏng',
  da_thanh_ly: 'Đã thanh lý',
};

/**
 * Năm loại biên bản của NS-08 — nguyên văn: "biên bản cấp phát/điều chuyển/sửa chữa/thu
 * hồi/thanh lý". Mỗi biên bản là một dòng lịch sử, KHÔNG ghi đè lên tài sản (Backend
 * Schema 2.3), nhờ vậy trả lời được "cái máy này đã qua tay ai".
 */
export const ASSET_EVENT_TYPES = [
  'cap_phat',
  'dieu_chuyen',
  'sua_chua',
  'thu_hoi',
  'thanh_ly',
] as const;
export type AssetEventType = (typeof ASSET_EVENT_TYPES)[number];

export const ASSET_EVENT_TYPE_LABELS: Readonly<Record<AssetEventType, string>> = {
  cap_phat: 'Cấp phát',
  dieu_chuyen: 'Điều chuyển',
  sua_chua: 'Sửa chữa',
  thu_hoi: 'Thu hồi',
  thanh_ly: 'Thanh lý',
};

/** Biên bản làm tài sản RỜI khỏi tay người đang giữ. Dùng khi dựng danh sách bàn giao NS-11. */
export const ASSET_RELEASING_EVENTS: readonly AssetEventType[] = [
  'thu_hoi',
  'thanh_ly',
  'dieu_chuyen',
];

/* ========================================================================== *
 * Tiếp nhận và nghỉ việc — NS-03, NS-11
 * ========================================================================== */

/**
 * Bốn nhóm việc trong một checklist tiếp nhận hoặc bàn giao.
 *
 * NS-03 (chuẩn bị hồ sơ, hợp đồng, tài khoản, công cụ làm việc, bảo hộ lao động) và NS-11
 * (bàn giao công việc, thu hồi tài sản và quyền truy cập, chốt công/phép/bảo hiểm/hồ sơ)
 * chia đúng bốn nhóm này, chỉ khác chiều: một bên cấp ra, một bên thu về.
 */
export const CHECKLIST_ITEM_GROUPS = ['ho_so', 'tai_san', 'quyen_truy_cap', 'cong_viec'] as const;
export type ChecklistItemGroup = (typeof CHECKLIST_ITEM_GROUPS)[number];

export const CHECKLIST_ITEM_GROUP_LABELS: Readonly<Record<ChecklistItemGroup, string>> = {
  ho_so: 'Hồ sơ, chế độ',
  tai_san: 'Tài sản, công cụ',
  quyen_truy_cap: 'Quyền truy cập',
  cong_viec: 'Bàn giao công việc',
};

export const CHECKLIST_KINDS = ['tiep_nhan', 'nghi_viec'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

export const CHECKLIST_KIND_LABELS: Readonly<Record<ChecklistKind, string>> = {
  tiep_nhan: 'Tiếp nhận nhân sự mới',
  nghi_viec: 'Bàn giao nghỉ việc',
};

/**
 * Việc cố định của checklist TIẾP NHẬN (NS-03).
 *
 * Danh sách dựng sẵn để HCNS không phải gõ lại mỗi lần; thiếu người nào thì thêm dòng
 * riêng tại hồ sơ đó. Bảo hộ lao động chỉ áp cho hai khối công trường và xưởng — NS-03 ghi
 * rõ "đối với công trường/xưởng".
 */
export interface ChecklistTemplateItem {
  readonly group: ChecklistItemGroup;
  readonly title: string;
  /** Rỗng = áp cho mọi khối. */
  readonly blocks?: readonly WorkBlock[];
}

export const ONBOARDING_CHECKLIST: readonly ChecklistTemplateItem[] = [
  { group: 'ho_so', title: 'Nhận đủ hồ sơ cá nhân và giấy tờ định danh' },
  { group: 'ho_so', title: 'Ký hợp đồng thử việc' },
  { group: 'ho_so', title: 'Đăng ký thông tin bảo hiểm' },
  { group: 'quyen_truy_cap', title: 'Cấp tài khoản hệ thống và hộp thư' },
  { group: 'tai_san', title: 'Cấp công cụ làm việc' },
  {
    group: 'tai_san',
    title: 'Cấp đồng phục và bảo hộ lao động',
    blocks: ['cong_truong', 'xuong'],
  },
  { group: 'cong_viec', title: 'Bàn giao kế hoạch công việc tuần đầu' },
  { group: 'cong_viec', title: 'Phổ biến nội quy và huấn luyện an toàn' },
];

/**
 * Việc cố định của checklist NGHỈ VIỆC (NS-11).
 *
 * Dòng tài sản KHÔNG nằm ở đây: nó được sinh động theo đúng những tài sản người đó đang
 * giữ (NS-08 "tự động tạo danh sách tài sản/chìa khóa/tài khoản cần bàn giao"). Ghi cứng
 * một dòng "thu hồi tài sản" thì lại phải mở màn hình khác để biết thu hồi cái gì.
 */
export const OFFBOARDING_CHECKLIST: readonly ChecklistTemplateItem[] = [
  { group: 'cong_viec', title: 'Xác nhận biên bản bàn giao công việc' },
  { group: 'quyen_truy_cap', title: 'Khóa tài khoản hệ thống và hộp thư' },
  { group: 'ho_so', title: 'Chốt công, phép và các khoản còn lại' },
  { group: 'ho_so', title: 'Báo giảm bảo hiểm' },
  { group: 'ho_so', title: 'Thanh lý hợp đồng lao động' },
];

/** Việc trong checklist áp cho khối này hay không. */
export function checklistAppliesTo(item: ChecklistTemplateItem, block: WorkBlock): boolean {
  return !item.blocks || item.blocks.includes(block);
}

/* ========================================================================== *
 * Lao động thời vụ, tổ đội thuê ngoài — NS-09
 * ========================================================================== */

/**
 * Tình trạng một lao động thời vụ tại công trường.
 *
 * NS-09 quản lý "danh sách lao động, giấy tờ định danh, chứng chỉ/huấn luyện an toàn, cam
 * kết nội quy". `thieu_giay_to` là trạng thái NÊU RA chứ không chặn: người đã có mặt ở
 * công trường thì phần mềm không xóa họ đi được, nhưng phải hiện rõ để HCNS đi đòi giấy.
 */
export const LABOR_WORKER_STATUSES = ['dang_lam', 'thieu_giay_to', 'da_nghi'] as const;
export type LaborWorkerStatus = (typeof LABOR_WORKER_STATUSES)[number];

export const LABOR_WORKER_STATUS_META: Readonly<
  Record<LaborWorkerStatus, { label: string; group: StatusGroup }>
> = {
  dang_lam: { label: 'Đang làm việc', group: 'in_progress' },
  thieu_giay_to: { label: 'Thiếu giấy tờ', group: 'overdue' },
  da_nghi: { label: 'Đã nghỉ', group: 'completed' },
};
