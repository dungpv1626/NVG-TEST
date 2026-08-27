/**
 * Hàm nghiệp vụ thuần của Module NS — chạy trong bộ nhớ, không cần CSDL.
 *
 * Trọng tâm là ba chỗ dễ sai theo hướng nguy hiểm:
 *
 *  - `documentReminderStage` phải trả về ĐÚNG mốc 90/60/30/7 của NS-10. Trả sai mốc thì
 *    thông báo nói "còn 30 ngày" trong khi thực tế còn 80 — người đọc yên tâm nhầm, và
 *    chứng chỉ an toàn hết hạn giữa lúc công trường đang chạy.
 *  - Giấy tờ ĐÃ hết hạn không được rơi vào khoảng trống. Đây là nhóm nguy hiểm nhất mà
 *    một điều kiện `days > 0` vô tình loại bỏ.
 *  - `summarizeAttendance` chỉ ĐẾM công, không quy ra tiền: quy chế lương NS-06 chưa có
 *    (PRD Mục 10). Ngày nghỉ có phép và nghỉ không phép phải đếm tách nhau vì hệ quả tính
 *    lương khác hẳn.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSET_RELEASING_EVENTS,
  CANDIDATE_STAGES,
  CANDIDATE_STAGE_META,
  DOCUMENT_REMINDER_DAYS,
  EMPLOYEE_STATUS_META,
  HOURS_PER_WORKDAY,
  OFFBOARDING_CHECKLIST,
  ONBOARDING_CHECKLIST,
  STATUS_GROUPS,
  TIMESHEET_PERIOD_STATUS_META,
  checklistAppliesTo,
  documentReminderStage,
  isSensitiveHrDocument,
  leaveDayCount,
  summarizeAttendance,
} from '../index';

const TODAY = new Date(2026, 7, 27); // 27/08/2026, giờ địa phương

/** Ngày cách hôm nay `days` ngày về tương lai, dạng `yyyy-MM-dd`. */
function inDays(days: number): string {
  const d = new Date(TODAY.getTime() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Nhắc hạn giấy tờ (NS-10, NEN-04)', () => {
  it('bốn mốc đúng như tài liệu, không thêm không bớt', () => {
    expect([...DOCUMENT_REMINDER_DAYS]).toEqual([90, 60, 30, 7]);
  });

  it('chưa tới mốc xa nhất thì chưa nhắc', () => {
    expect(documentReminderStage(inDays(120), TODAY)).toBeNull();
    expect(documentReminderStage(inDays(91), TODAY)).toBeNull();
  });

  it('rơi vào khoảng nào thì nhắc đúng mốc bao khoảng đó', () => {
    expect(documentReminderStage(inDays(90), TODAY)).toBe(90);
    expect(documentReminderStage(inDays(80), TODAY)).toBe(90);
    expect(documentReminderStage(inDays(60), TODAY)).toBe(60);
    expect(documentReminderStage(inDays(45), TODAY)).toBe(60);
    expect(documentReminderStage(inDays(30), TODAY)).toBe(30);
    expect(documentReminderStage(inDays(8), TODAY)).toBe(30);
    expect(documentReminderStage(inDays(7), TODAY)).toBe(7);
    expect(documentReminderStage(inDays(1), TODAY)).toBe(7);
  });

  it('giấy tờ đã hết hạn KHÔNG bị bỏ sót — trả về mốc 0', () => {
    expect(documentReminderStage(inDays(-1), TODAY)).toBe(0);
    expect(documentReminderStage(inDays(-400), TODAY)).toBe(0);
  });

  it('không có hạn thì không nhắc, và ngày hỏng không làm vỡ màn hình', () => {
    expect(documentReminderStage(null, TODAY)).toBeNull();
    expect(documentReminderStage(undefined, TODAY)).toBeNull();
    expect(documentReminderStage('ngày không hợp lệ', TODAY)).toBeNull();
  });

  it('căn cước và giấy sức khỏe là dữ liệu nhạy cảm, chứng chỉ hành nghề thì không', () => {
    expect(isSensitiveHrDocument('can_cuoc')).toBe(true);
    expect(isSensitiveHrDocument('kham_suc_khoe')).toBe(true);
    expect(isSensitiveHrDocument('chung_chi_hanh_nghe')).toBe(false);
  });
});

describe('Tổng hợp chấm công (NS-04, NS-05)', () => {
  it('quy giờ làm ra ngày công theo đúng một hằng số duy nhất', () => {
    const s = summarizeAttendance([
      { kind: 'lam_viec', hours: HOURS_PER_WORKDAY },
      { kind: 'lam_viec', hours: HOURS_PER_WORKDAY },
      { kind: 'lam_viec', hours: 4 },
    ]);
    expect(s.workdays).toBe(2.5);
    expect(s.workedHours).toBe(20);
  });

  it('nghỉ có phép và nghỉ không phép đếm TÁCH nhau', () => {
    const s = summarizeAttendance([
      { kind: 'nghi_co_phep' },
      { kind: 'nghi_co_phep' },
      { kind: 'nghi_khong_phep' },
      { kind: 'nghi_le' },
    ]);
    expect(s.leaveDays).toBe(2);
    expect(s.unpaidAbsenceDays).toBe(1);
    expect(s.holidayDays).toBe(1);
    expect(s.workdays).toBe(0);
  });

  it('tăng ca cộng riêng, không lẫn vào giờ làm chính', () => {
    const s = summarizeAttendance([
      { kind: 'lam_viec', hours: 8, overtimeHours: 2 },
      { kind: 'lam_viec', hours: 8, overtimeHours: 1.5 },
    ]);
    expect(s.workedHours).toBe(16);
    expect(s.overtimeHours).toBe(3.5);
    expect(s.workdays).toBe(2);
  });

  it('sản lượng của ca cộng dồn — NS-04 đòi xưởng xác nhận cả sản lượng', () => {
    const s = summarizeAttendance([
      { kind: 'lam_viec', hours: 8, outputQuantity: 12.5 },
      { kind: 'lam_viec', hours: 8, outputQuantity: 10 },
    ]);
    expect(s.outputQuantity).toBe(22.5);
  });

  it('ngày công tác vẫn là ngày làm việc, mặc định tính đủ một công', () => {
    const s = summarizeAttendance([{ kind: 'cong_tac' }]);
    expect(s.businessTripDays).toBe(1);
    expect(s.workedHours).toBe(HOURS_PER_WORKDAY);
    expect(s.workdays).toBe(1);
  });

  it('chuỗi rỗng cho ra số 0, không phải NaN', () => {
    const s = summarizeAttendance([]);
    expect(s.workdays).toBe(0);
    expect(s.overtimeHours).toBe(0);
    expect(Number.isNaN(s.workedHours)).toBe(false);
  });
});

describe('Đơn nghỉ phép (NS-05)', () => {
  it('tính cả ngày đầu và ngày cuối', () => {
    expect(leaveDayCount('2026-09-01', '2026-09-03')).toBe(3);
    expect(leaveDayCount('2026-09-01', '2026-09-01')).toBe(1);
  });

  it('ngày kết thúc trước ngày bắt đầu cho ra 0, không cho ra số âm', () => {
    expect(leaveDayCount('2026-09-05', '2026-09-01')).toBe(0);
  });
});

describe('Checklist tiếp nhận và nghỉ việc (NS-03, NS-11)', () => {
  it('bảo hộ lao động chỉ áp cho công trường và xưởng', () => {
    const bhld = ONBOARDING_CHECKLIST.find((i) => i.title.includes('bảo hộ lao động'));
    expect(bhld).toBeDefined();
    expect(checklistAppliesTo(bhld!, 'cong_truong')).toBe(true);
    expect(checklistAppliesTo(bhld!, 'xuong')).toBe(true);
    expect(checklistAppliesTo(bhld!, 'van_phong')).toBe(false);
  });

  it('việc không giới hạn khối thì áp cho cả ba khối', () => {
    const hopDong = ONBOARDING_CHECKLIST.find((i) => i.title.includes('hợp đồng thử việc'));
    expect(checklistAppliesTo(hopDong!, 'van_phong')).toBe(true);
    expect(checklistAppliesTo(hopDong!, 'cong_truong')).toBe(true);
  });

  it('checklist nghỉ việc KHÔNG ghi cứng dòng thu hồi tài sản — danh sách đó sinh theo tài sản đang giữ', () => {
    expect(OFFBOARDING_CHECKLIST.some((i) => i.group === 'tai_san')).toBe(false);
    expect(OFFBOARDING_CHECKLIST.some((i) => i.group === 'quyen_truy_cap')).toBe(true);
  });
});

describe('Quy ước chung của module', () => {
  it('mọi trạng thái riêng của NS đều quy về 5 nhóm chuẩn (CLAUDE.md 5.4)', () => {
    const groups = [
      ...Object.values(EMPLOYEE_STATUS_META),
      ...Object.values(TIMESHEET_PERIOD_STATUS_META),
      ...Object.values(CANDIDATE_STAGE_META),
    ].map((m) => m.group);
    for (const g of groups) {
      expect(STATUS_GROUPS).toContain(g);
    }
  });

  it('mỗi cột Kanban tuyển dụng có đúng một nhãn chữ', () => {
    for (const stage of CANDIDATE_STAGES) {
      expect(CANDIDATE_STAGE_META[stage].label.length).toBeGreaterThan(0);
    }
  });

  it('biên bản làm tài sản rời tay người giữ gồm đủ thu hồi, thanh lý, điều chuyển', () => {
    expect([...ASSET_RELEASING_EVENTS].sort()).toEqual(
      ['dieu_chuyen', 'thanh_ly', 'thu_hoi'].sort(),
    );
    expect(ASSET_RELEASING_EVENTS).not.toContain('cap_phat');
  });
});
