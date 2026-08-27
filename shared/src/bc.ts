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

import { OPPORTUNITY_STAGES, type OpportunityStage } from './crm';
import type { BiddingStage } from './da';
import { sumMoney, toMoney, toNvgDateInput, type DateInput, type MoneyValue } from './format';
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
export function periodStartDate(
  period: DashboardPeriod,
  now: DateInput = new Date(),
): string | null {
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

/**
 * Một dòng danh sách có lọt qua bộ lọc kỳ báo cáo không.
 *
 * Ba trạng thái đầu vào, ba nghĩa khác nhau — và nhầm lẫn giữa hai cái đầu là cách một danh
 * sách biến thành rỗng mà không ai hiểu vì sao:
 *
 *  - `undefined` — danh sách này KHÔNG theo dõi ngày lập. Bộ lọc kỳ không áp dụng, giữ dòng.
 *  - `null` / rỗng — hồ sơ CÓ trường ngày nhưng đang để trống, nên không thuộc kỳ nào.
 *  - có giá trị — so với mốc đầu kỳ như thường.
 */
export function matchesPeriodFilter(
  createdAt: DateInput | null | undefined,
  period: DashboardPeriod | null,
  now: DateInput = new Date(),
): boolean {
  if (period === null) return true;
  if (createdAt === undefined) return true;
  return isWithinPeriod(createdAt, period, now);
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

/**
 * Ngưỡng "chờ duyệt lâu" cho thẻ cảnh báo rủi ro tổng hợp (BC-05).
 *
 * ⚠️ Giả định cần Haan xác nhận — PRD không nêu con số cụ thể. Đặt tạm 3 ngày làm việc,
 * cùng tinh thần với mốc `aging_buckets` (KT-04): một hằng số DUY NHẤT ở đây, không lặp lại
 * ở chỗ khác, để đổi một chỗ là đổi khắp hệ thống khi có số chính thức.
 */
export const PENDING_APPROVAL_AGING_DAYS = 3;

/**
 * Hồ sơ chờ phê duyệt đã "để lâu" — quá `PENDING_APPROVAL_AGING_DAYS` ngày kể từ lúc gửi.
 *
 * Đây KHÔNG phải trạng thái "Quá hạn" chuẩn (5 nhóm) của chính hồ sơ — một báo giá đang chờ
 * duyệt không có hạn xử lý riêng, nó chỉ đang NẰM Ở NGƯỜI DUYỆT quá lâu. Tách hàm riêng khỏi
 * `countByStatus` để không trộn hai khái niệm khác nhau vào cùng một con số.
 */
export function isStalePendingApproval(
  requestedAt: DateInput | null | undefined,
  now: DateInput = new Date(),
): boolean {
  if (requestedAt === null || requestedAt === undefined || requestedAt === '') return false;

  const requested = new Date(requestedAt);
  const at = new Date(now);
  if (Number.isNaN(requested.getTime()) || Number.isNaN(at.getTime())) return false;

  const msPerDay = 24 * 60 * 60 * 1000;
  return (at.getTime() - requested.getTime()) / msPerDay > PENDING_APPROVAL_AGING_DAYS;
}

/** Một dòng gốc từ hàm CSDL `opportunity_funnel_by_source` (BC-03, 0059_bc_sales_effectiveness.sql). */
export interface OpportunityFunnelRow {
  readonly source: string;
  readonly stage: OpportunityStage;
  readonly opportunityCount: number;
  readonly estimatedValue: MoneyValue;
}

export interface SourceSummary {
  readonly source: string;
  readonly total: number;
  readonly won: number;
  readonly value: bigint;
  readonly winRate: number | null;
}

/**
 * Gộp cơ hội theo NGUỒN KHÁCH (BC-03, phần 1) — cộng dồn mọi giai đoạn về một dòng mỗi nguồn.
 *
 * Sắp theo tổng số cơ hội giảm dần: nguồn mang lại nhiều cơ hội nhất đứng đầu, đúng thứ tự
 * BGĐ quan tâm khi quyết định rót thêm ngân sách marketing vào đâu.
 */
export function summarizeOpportunitiesBySource(
  rows: readonly OpportunityFunnelRow[],
): SourceSummary[] {
  const bySource = new Map<string, { total: number; won: number; value: bigint }>();

  for (const row of rows) {
    const entry = bySource.get(row.source) ?? { total: 0, won: 0, value: 0n };
    entry.total += row.opportunityCount;
    // 'ky_hop_dong' — giai đoạn kết thúc thắng duy nhất của pipeline (OPPORTUNITY_STAGE_META).
    if (row.stage === 'ky_hop_dong') entry.won += row.opportunityCount;
    entry.value = sumMoney([entry.value, toMoney(row.estimatedValue)]);
    bySource.set(row.source, entry);
  }

  return Array.from(bySource.entries())
    .map(([source, { total, won, value }]) => ({
      source,
      total,
      won,
      value,
      winRate: conversionRate(won, total),
    }))
    .sort((a, b) => b.total - a.total);
}

export interface FunnelStageSummary {
  readonly stage: OpportunityStage;
  readonly count: number;
}

/**
 * Phễu bán hàng theo GIAI ĐOẠN HIỆN TẠI (BC-03, phần 2) — snapshot, không phải chuyển đổi
 * luỹ tiến qua lịch sử (xem ghi chú ở migration nguồn). Luôn trả đủ 7 giai đoạn theo ĐÚNG
 * thứ tự Kanban, kể cả giai đoạn không có cơ hội nào — để biểu đồ phễu không bị lệch cột.
 */
export function summarizeOpportunityFunnel(
  rows: readonly OpportunityFunnelRow[],
): FunnelStageSummary[] {
  const byStage = new Map<OpportunityStage, number>(OPPORTUNITY_STAGES.map((s) => [s, 0]));
  for (const row of rows) {
    byStage.set(row.stage, (byStage.get(row.stage) ?? 0) + row.opportunityCount);
  }
  return OPPORTUNITY_STAGES.map((stage) => ({ stage, count: byStage.get(stage) ?? 0 }));
}

/** Một dòng gốc từ hàm CSDL `bidding_outcomes` (BC-03, 0059_bc_sales_effectiveness.sql). */
export interface BiddingOutcomeRow {
  readonly stage: BiddingStage;
  readonly lostReason: string | null;
  readonly biddingCount: number;
}

export interface LossReasonSummary {
  readonly reason: string;
  readonly count: number;
}

export interface BiddingOutcomeSummary {
  readonly won: number;
  readonly lost: number;
  readonly winRate: number | null;
  /** Xếp theo số lần giảm dần — nguyên nhân trượt thầu phổ biến nhất đứng đầu. */
  readonly lossReasons: LossReasonSummary[];
}

/**
 * Tỷ lệ trúng thầu và nguyên nhân trượt thầu (BC-03, phần 3).
 *
 * Chỉ nhận dòng đã CÓ KẾT QUẢ (`bidding_outcomes` đã tự lọc `trung_thau`/`truot_thau` ở CSDL),
 * nên mẫu số ở đây không cần lọc lại — khác với `conversionRate` dùng ở Dashboard CRM (mẫu số
 * đó CÓ gộp cơ hội đang xử lý dở, vì đơn vị đo là "trong kỳ" chứ không phải "đã ngã ngũ").
 */
export function summarizeBiddingOutcomes(
  rows: readonly BiddingOutcomeRow[],
): BiddingOutcomeSummary {
  let won = 0;
  let lost = 0;
  const byReason = new Map<string, number>();

  for (const row of rows) {
    if (row.stage === 'trung_thau') {
      won += row.biddingCount;
    } else {
      lost += row.biddingCount;
      const reason = row.lostReason?.trim() || 'Chưa ghi nhận';
      byReason.set(reason, (byReason.get(reason) ?? 0) + row.biddingCount);
    }
  }

  const lossReasons = Array.from(byReason.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return { won, lost, winRate: conversionRate(won, won + lost), lossReasons };
}
