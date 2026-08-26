/**
 * Hằng số và phép tính dùng chung cho Module BC — Báo cáo và Dashboard điều hành.
 *
 * Nguồn: PRD BC-01, BC-05, BC-07; Webapp Flow 4.1 (mẫu bố cục Dashboard) và 2.2 (pháp nhân).
 *
 * Ở đây CHỈ có logic thuần: gom nhóm, đếm, cộng, tính mốc thời gian. Định nghĩa từng thẻ chỉ
 * số nằm ở `web/` vì nó phụ thuộc quyền và đường dẫn màn hình — nhưng cách ĐẾM thì đặt ở đây
 * để thẻ trên Dashboard và danh sách nó dẫn tới không bao giờ đếm theo hai cách khác nhau.
 *
 * ⚠️ Ranh giới Giai đoạn 1: BC-01 liệt kê mười nhóm chỉ số, trong đó dòng tiền, công nợ, tồn
 * kho, chấm công thuộc các module chưa xây (KT, KHO, NS). Dashboard hiện tại chỉ hiển thị
 * phần đã có dữ liệu thật — KHÔNG dựng thẻ rỗng cho phần chưa có, vì một con số 0 không phân
 * biệt được với "chưa có dữ liệu" là loại sai lệch nguy hiểm nhất trên màn hình điều hành
 * (BC-06 yêu cầu nêu rõ mức độ hoàn thiện của dữ liệu).
 */

import { toNvgDateInput, type DateInput } from './format';
import { STATUS_GROUPS, type StatusGroup } from './status';

/**
 * Khoảng thời gian của bộ lọc nhanh trên Dashboard — Webapp Flow 4.1:
 * "Vùng trên cùng luôn có bộ lọc nhanh theo pháp nhân/khoảng thời gian, giữ trạng thái khi
 * quay lại".
 *
 * Giá trị dùng thẳng làm tham số trên thanh địa chỉ nên phải ổn định và đọc được.
 */
export const DASHBOARD_PERIODS = ['thang-nay', 'quy-nay', 'nam-nay', 'tat-ca'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_PERIOD_LABELS: Readonly<Record<DashboardPeriod, string>> = {
  'thang-nay': 'Tháng này',
  'quy-nay': 'Quý này',
  'nam-nay': 'Năm nay',
  'tat-ca': 'Tất cả',
};

/**
 * Kỳ mặc định khi mở Dashboard.
 *
 * Chọn "Năm nay" chứ không phải "Tháng này": NVC làm ~30 dự án/năm, NVO ~70 — một tháng
 * bất kỳ có thể không có hợp đồng nào ký, và màn hình toàn số 0 vào đầu tháng đọc ra như hệ
 * thống hỏng chứ không phải như kỳ chưa phát sinh (PRD Mục 1.1).
 */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 'nam-nay';

export function isDashboardPeriod(value: string | null | undefined): value is DashboardPeriod {
  return DASHBOARD_PERIODS.includes(value as DashboardPeriod);
}

/**
 * Mốc đầu kỳ, dạng `yyyy-MM-dd` theo MÚI GIỜ NGHIỆP VỤ. `null` = không giới hạn.
 *
 * Trả về chuỗi ngày chứ không phải `Date` là có chủ ý: dữ liệu từ PostgREST cũng là chuỗi
 * ISO, và so sánh hai chuỗi `yyyy-MM-dd` cho đúng kết quả mà không phải làm phép cộng trừ
 * múi giờ ở từng chỗ gọi — nơi rất dễ lệch một ngày (xem `toNvgDateInput`).
 */
export function periodStartDate(period: DashboardPeriod, now: DateInput = new Date()): string | null {
  if (period === 'tat-ca') return null;

  const today = toNvgDateInput(now);
  if (!today) return null;

  const [year, month] = today.split('-') as [string, string, string];
  switch (period) {
    case 'thang-nay':
      return `${year}-${month}-01`;
    case 'quy-nay': {
      // Quý 1 bắt đầu tháng 1, quý 2 tháng 4, quý 3 tháng 7, quý 4 tháng 10.
      const firstMonthOfQuarter = Math.floor((Number(month) - 1) / 3) * 3 + 1;
      return `${year}-${String(firstMonthOfQuarter).padStart(2, '0')}-01`;
    }
    case 'nam-nay':
      return `${year}-01-01`;
  }
}

/**
 * Mốc thời gian này có nằm trong kỳ đang chọn không.
 *
 * Ô ngày để trống thì coi là KHÔNG thuộc kỳ nào — trừ kỳ "Tất cả". Hồ sơ thiếu ngày mà vẫn
 * được đếm vào tháng này sẽ làm số liệu tăng vọt mỗi lần đổi kỳ, và người xem không có cách
 * nào biết vì sao.
 */
export function isWithinPeriod(
  value: DateInput | null | undefined,
  period: DashboardPeriod,
  now: DateInput = new Date(),
): boolean {
  if (period === 'tat-ca') return true;
  if (value === null || value === undefined || value === '') return false;

  const start = periodStartDate(period, now);
  if (!start) return true;

  const at = toNvgDateInput(value);
  return at !== '' && at >= start;
}

/** Đếm hồ sơ theo 5 nhóm trạng thái chuẩn. Nhóm không có hồ sơ nào vẫn có mặt với số 0. */
export function countByStatus(
  rows: readonly { readonly status: StatusGroup }[],
): Record<StatusGroup, number> {
  const counts = Object.fromEntries(STATUS_GROUPS.map((s) => [s, 0])) as Record<
    StatusGroup,
    number
  >;
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * Tỷ lệ chuyển đổi của phễu bán hàng, tính bằng phần trăm (PRD CRM-09, BC-03).
 *
 * Mẫu số 0 trả về `null` chứ không phải 0: "chưa có cơ hội nào" và "có cơ hội nhưng không
 * chốt được cái nào" là hai tình huống kinh doanh khác hẳn nhau, hiển thị 0% cho cả hai là
 * báo cáo sai (Content Guidelines 4.7 — trạng thái rỗng phải nói rõ tình trạng).
 */
export function conversionRate(won: number, total: number): number | null {
  if (total <= 0) return null;
  return (won / total) * 100;
}
