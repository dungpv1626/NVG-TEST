/**
 * Hằng số nghiệp vụ Module TC — Thi công và Ngân sách công trình.
 *
 * Nguồn: PRD TC-01 → TC-08, Backend Schema 4.6, Webapp Flow 3.4 và 7.
 *
 * ⚠️ MODULE ĐỊNH HƯỚNG. PRD Mục 1.2 và Mục 10 ghi rõ: bộ phận Chỉ huy – Giám sát công
 * trường (NVC/NVO) CHƯA có phiếu khảo sát trực tiếp; toàn bộ yêu cầu TC được tổng hợp gián
 * tiếp từ Ban Giám đốc, Kinh doanh và Dự toán – Kỹ thuật. Mọi danh sách giá trị trong file
 * này là ĐỀ XUẤT của đội triển khai, không phải yêu cầu đã chốt.
 *
 * Chỗ nào là suy luận gián tiếp đều được đánh dấu `SUY LUẬN` kèm căn cứ, để khi có dữ liệu
 * khảo sát thật thì biết chính xác phải rà lại cái gì — thay vì phải đọc lại cả module.
 */

import { toMoney } from './format';
import type { StatusGroup } from './status';

/**
 * Vòng đời một công trình thi công.
 *
 * SUY LUẬN — PRD không liệt kê các bước của một công trình. Sáu giá trị dưới đây suy ra từ
 * trình tự công việc mà TC-01 → TC-07 mô tả: nhận ngân sách và lập kế hoạch (TC-01) → thi
 * công có nhật ký (TC-02) → nghiệm thu bàn giao (TC-04) → bảo hành (TC-07).
 *
 * `tam_dung` tách riêng chứ không gộp vào `chuan_bi`: công trình dừng giữa chừng vẫn còn
 * chi phí đã cam kết và tổ đội đang chờ, khác hẳn công trình chưa khởi công.
 */
export const SITE_STAGES = [
  'chuan_bi',
  'dang_thi_cong',
  'nghiem_thu',
  'bao_hanh',
  'hoan_thanh',
  'tam_dung',
] as const;

export type SiteStage = (typeof SITE_STAGES)[number];

export interface SiteStageMeta {
  readonly label: string;
  /** Quy về 1 trong 6 nhóm trạng thái chuẩn khi hiển thị (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  readonly isTerminal: boolean;
}

export const SITE_STAGE_META: Readonly<Record<SiteStage, SiteStageMeta>> = {
  chuan_bi: {
    label: 'Chuẩn bị',
    statusGroup: 'draft',
    description: 'Đã nhận ngân sách và hồ sơ thi công, đang lập kế hoạch nhân sự, vật tư, tiến độ.',
    isTerminal: false,
  },
  dang_thi_cong: {
    label: 'Đang thi công',
    statusGroup: 'in_progress',
    description: 'Đang thi công tại hiện trường, ghi nhật ký theo ngày.',
    isTerminal: false,
  },
  nghiem_thu: {
    label: 'Nghiệm thu bàn giao',
    statusGroup: 'in_progress',
    description: 'Đã thi công xong, đang nghiệm thu và bàn giao cho chủ đầu tư.',
    isTerminal: false,
  },
  bao_hanh: {
    label: 'Trong thời gian bảo hành',
    statusGroup: 'in_progress',
    description: 'Đã bàn giao, đang trong thời hạn bảo hành theo từng hạng mục.',
    isTerminal: false,
  },
  hoan_thanh: {
    label: 'Kết thúc',
    statusGroup: 'completed',
    description: 'Hết bảo hành, không còn việc phải xử lý tại công trình.',
    isTerminal: true,
  },
  tam_dung: {
    label: 'Tạm dừng',
    statusGroup: 'draft',
    description: 'Tạm dừng thi công. Nguyên nhân được ghi lại.',
    isTerminal: false,
  },
};

/**
 * Thứ tự các bước được phép đi tới.
 *
 * Không cho nhảy bước vì mỗi bước mở ra một loại chứng từ khác nhau: nghiệm thu bàn giao
 * chỉ có nghĩa sau khi đã thi công, bảo hành chỉ bắt đầu sau khi đã bàn giao. Từ `tam_dung`
 * quay lại đúng bước đang dở, nên nó nhận mọi bước chưa kết thúc.
 */
export const SITE_STAGE_TRANSITIONS: Readonly<Record<SiteStage, readonly SiteStage[]>> = {
  chuan_bi: ['dang_thi_cong', 'tam_dung'],
  dang_thi_cong: ['nghiem_thu', 'tam_dung'],
  nghiem_thu: ['bao_hanh', 'hoan_thanh', 'tam_dung'],
  bao_hanh: ['hoan_thanh'],
  hoan_thanh: [],
  tam_dung: ['chuan_bi', 'dang_thi_cong', 'nghiem_thu'],
};

export function canMoveSiteStage(from: SiteStage, to: SiteStage): boolean {
  return SITE_STAGE_TRANSITIONS[from].includes(to);
}

/**
 * Loại mục nhật ký công trường — TC-02 nguyên văn: "tiến độ, khối lượng thực hiện, ảnh hiện
 * trường, vướng mắc, an toàn". `su_viec` thêm cho TC-08 ("nhật ký sự việc … phục vụ truy vết
 * khi phát sinh tranh chấp trách nhiệm").
 *
 * Ảnh KHÔNG phải một loại riêng: ảnh đính kèm được vào bất kỳ mục nào, vì ảnh an toàn và
 * ảnh tiến độ đều là ảnh hiện trường.
 */
export const SITE_LOG_TYPES = ['tien_do', 'khoi_luong', 'vuong_mac', 'an_toan', 'su_viec'] as const;

export type SiteLogType = (typeof SITE_LOG_TYPES)[number];

export const SITE_LOG_TYPE_LABELS: Readonly<Record<SiteLogType, string>> = {
  tien_do: 'Tiến độ',
  khoi_luong: 'Khối lượng thực hiện',
  vuong_mac: 'Vướng mắc',
  an_toan: 'An toàn lao động',
  su_viec: 'Sự việc cần truy vết',
};

/**
 * Ba loại nghiệm thu — TC-04 nguyên văn: "nội bộ, với tổ đội/nhà thầu phụ, và với khách
 * hàng/chủ đầu tư".
 *
 * Phân biệt ba loại là điều kiện để TC-04 chạy đúng: chỉ nghiệm thu VỚI KHÁCH HÀNG mới là
 * căn cứ để Kế toán thông báo thu tiền theo hợp đồng. Nghiệm thu nội bộ mà cũng báo thu
 * tiền thì Kế toán đòi tiền một khối lượng khách chưa từng xác nhận.
 */
export const ACCEPTANCE_TYPES = ['noi_bo', 'thau_phu', 'khach_hang'] as const;

export type AcceptanceType = (typeof ACCEPTANCE_TYPES)[number];

export const ACCEPTANCE_TYPE_LABELS: Readonly<Record<AcceptanceType, string>> = {
  noi_bo: 'Nghiệm thu nội bộ',
  thau_phu: 'Nghiệm thu với tổ đội / nhà thầu phụ',
  khach_hang: 'Nghiệm thu với chủ đầu tư',
};

/** Chỉ nghiệm thu với chủ đầu tư mới sinh ra quyền đòi tiền theo hợp đồng (TC-04). */
export function triggersBilling(type: AcceptanceType): boolean {
  return type === 'khach_hang';
}

/** Trạng thái một biên bản nghiệm thu. */
export const ACCEPTANCE_STATUSES = ['nhap', 'da_nghiem_thu', 'huy'] as const;

export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

export const ACCEPTANCE_STATUS_META: Readonly<
  Record<AcceptanceStatus, { label: string; statusGroup: StatusGroup }>
> = {
  nhap: { label: 'Nháp', statusGroup: 'draft' },
  da_nghiem_thu: { label: 'Đã nghiệm thu', statusGroup: 'completed' },
  huy: { label: 'Đã hủy', statusGroup: 'draft' },
};

/**
 * Hình thức giao việc cho tổ đội / nhà thầu phụ — TC-06 nguyên văn: "hợp đồng hoặc đơn giá
 * khoán".
 */
export const SUBCONTRACT_FORMS = ['hop_dong', 'don_gia_khoan'] as const;

export type SubcontractForm = (typeof SUBCONTRACT_FORMS)[number];

export const SUBCONTRACT_FORM_LABELS: Readonly<Record<SubcontractForm, string>> = {
  hop_dong: 'Hợp đồng thầu phụ',
  don_gia_khoan: 'Đơn giá khoán',
};

/** Trạng thái làm việc của một tổ đội tại công trình. */
export const SUBCONTRACTOR_STATUSES = ['dang_thuc_hien', 'tam_dung', 'hoan_thanh'] as const;

export type SubcontractorStatus = (typeof SUBCONTRACTOR_STATUSES)[number];

export const SUBCONTRACTOR_STATUS_META: Readonly<
  Record<SubcontractorStatus, { label: string; statusGroup: StatusGroup }>
> = {
  dang_thuc_hien: { label: 'Đang thực hiện', statusGroup: 'in_progress' },
  tam_dung: { label: 'Tạm dừng', statusGroup: 'draft' },
  hoan_thanh: { label: 'Hoàn thành', statusGroup: 'completed' },
};

/** Trạng thái bảo hành của một hạng mục (TC-07). */
export const WARRANTY_STATUSES = ['con_han', 'dang_xu_ly', 'het_han'] as const;

export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];

export const WARRANTY_STATUS_META: Readonly<
  Record<WarrantyStatus, { label: string; statusGroup: StatusGroup }>
> = {
  con_han: { label: 'Còn hạn bảo hành', statusGroup: 'in_progress' },
  dang_xu_ly: { label: 'Đang xử lý phản ánh', statusGroup: 'in_progress' },
  het_han: { label: 'Hết hạn bảo hành', statusGroup: 'completed' },
};

/** Trạng thái xử lý một phản ánh bảo hành (TC-07). */
export const WARRANTY_CLAIM_STATUSES = ['tiep_nhan', 'dang_xu_ly', 'da_xu_ly', 'tu_choi'] as const;

export type WarrantyClaimStatus = (typeof WARRANTY_CLAIM_STATUSES)[number];

export const WARRANTY_CLAIM_STATUS_META: Readonly<
  Record<WarrantyClaimStatus, { label: string; statusGroup: StatusGroup }>
> = {
  tiep_nhan: { label: 'Đã tiếp nhận', statusGroup: 'draft' },
  dang_xu_ly: { label: 'Đang xử lý', statusGroup: 'in_progress' },
  da_xu_ly: { label: 'Đã xử lý xong', statusGroup: 'completed' },
  tu_choi: { label: 'Không thuộc phạm vi bảo hành', statusGroup: 'draft' },
};

/**
 * Ngưỡng cảnh báo sớm vượt ngân sách — TC-05.
 *
 * ⚠️ SUY LUẬN. PRD TC-05 yêu cầu "cảnh báo SỚM khi có NGUY CƠ vượt ngân sách" nhưng không
 * nói sớm là bao nhiêu phần trăm. 90% là mức đội triển khai đề xuất để bắt đầu; NVG xác
 * nhận hoặc đổi sau.
 *
 * Từ NEN-12, ngưỡng THẬT nằm ở tham số `budget_warning_threshold` trong `system_parameters` và
 * do CSDL áp dụng (`sites_budget_status`, `budget_overrun_alert` — migration 0112). Hằng số này
 * còn lại chỉ là giá trị DỰ PHÒNG cho phần tính trong trình duyệt khi tham số chưa cấu hình —
 * đừng đổi ở đây rồi tưởng đã đổi cho cả hệ thống.
 *
 * "Nguy cơ" tính trên ĐÃ PHÁT SINH + ĐÃ CAM KẾT, không chỉ đã phát sinh: đơn hàng đã ký mà
 * chưa nhận hoá đơn vẫn là tiền chắc chắn phải trả. Chỉ nhìn chi phí đã ghi sổ thì cảnh báo
 * luôn đến sau khi đã vượt — tức là không còn sớm.
 */
export const BUDGET_WARNING_THRESHOLD = 0.9;

export type BudgetHealth = 'trong_ngan_sach' | 'sap_vuot' | 'vuot_ngan_sach';

export const BUDGET_HEALTH_META: Readonly<
  Record<BudgetHealth, { label: string; statusGroup: StatusGroup }>
> = {
  trong_ngan_sach: { label: 'Trong ngân sách', statusGroup: 'completed' },
  sap_vuot: { label: 'Sắp vượt ngân sách', statusGroup: 'pending_approval' },
  vuot_ngan_sach: { label: 'Vượt ngân sách', statusGroup: 'overdue' },
};

export interface BudgetLineInput {
  readonly budgetedAmount: bigint | number | string | null;
  readonly actualAmount: bigint | number | string | null;
  readonly committedAmount: bigint | number | string | null;
}

export interface BudgetSummary {
  readonly budgeted: bigint;
  readonly actual: bigint;
  readonly committed: bigint;
  /** Đã phát sinh + đã cam kết — con số dùng để cảnh báo, xem ghi chú ở ngưỡng. */
  readonly engaged: bigint;
  /** Dự kiến còn được phép chi. Âm nghĩa là đã vượt (TC-05). */
  readonly remaining: bigint;
  readonly health: BudgetHealth;
  /** Tỷ lệ đã dùng, 0–1+ theo `engaged / budgeted`. `null` khi chưa có ngân sách. */
  readonly engagedRatio: number | null;
}

/**
 * Tổng hợp một nhóm dòng ngân sách (TC-05).
 *
 * Tính ở đây thay vì ở từng màn hình: cùng công thức dùng cho thẻ tổng, bảng theo mã chi
 * phí và cảnh báo trên Dashboard — ba nơi tự cộng lấy là ba con số lệch nhau.
 */
export function summarizeBudget(lines: readonly BudgetLineInput[]): BudgetSummary {
  let budgeted = 0n;
  let actual = 0n;
  let committed = 0n;

  for (const line of lines) {
    budgeted += toMoney(line.budgetedAmount);
    actual += toMoney(line.actualAmount);
    committed += toMoney(line.committedAmount);
  }

  const engaged = actual + committed;
  const remaining = budgeted - engaged;

  let health: BudgetHealth = 'trong_ngan_sach';
  let engagedRatio: number | null = null;

  if (budgeted > 0n) {
    // Chia bằng Number sau khi đã cộng bằng bigint: phép chia chỉ để so ngưỡng hiển thị,
    // còn mọi con số tiền đưa ra màn hình vẫn là bigint nguyên vẹn.
    engagedRatio = Number(engaged) / Number(budgeted);
    if (engaged > budgeted) health = 'vuot_ngan_sach';
    else if (engagedRatio >= BUDGET_WARNING_THRESHOLD) health = 'sap_vuot';
  } else if (engaged > 0n) {
    // Chi mà không có ngân sách nào được duyệt — luôn là vượt, dù chia cho 0 không tính được.
    health = 'vuot_ngan_sach';
  }

  return { budgeted, actual, committed, engaged, remaining, health, engagedRatio };
}

/**
 * Trạng thái hiển thị của một công trình.
 *
 * Quá hạn tính theo mốc hoàn thành dự kiến và chỉ có nghĩa khi công trình chưa kết thúc —
 * giống cách `contractDisplayStatus` làm, để hai màn hình không nói hai kiểu về cùng một
 * khái niệm "quá hạn".
 */
export function siteDisplayStatus(stage: SiteStage, plannedEndDate: string | null): StatusGroup {
  const meta = SITE_STAGE_META[stage];

  if (!meta.isTerminal && plannedEndDate) {
    const due = new Date(plannedEndDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
  }

  return meta.statusGroup;
}

/**
 * Bảo hành còn hạn hay đã hết, tính theo ngày (TC-07).
 *
 * Trả `null` khi chưa đặt thời hạn — chưa biết thì nói chưa biết, không mặc định là còn hạn.
 */
export function warrantyDaysLeft(
  warrantyUntil: string | null,
  today: Date = new Date(),
): number | null {
  if (!warrantyUntil) return null;
  const until = new Date(warrantyUntil);
  if (Number.isNaN(until.getTime())) return null;

  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(until) - startOfDay(today)) / 86_400_000);
}

/**
 * Loại hồ sơ của công trình — cột `documents.category` (NEN-06).
 *
 * Nguồn: khảo sát Chỉ huy – Giám sát công trường 02/09/2026, câu "Những giấy tờ nào anh/chị
 * phải làm tại công trường". Chỉ giữ những loại có PHIÊN BẢN và có bản đang hiệu lực — đó là
 * điều kiện để một tài liệu thuộc về cơ chế `documents`/`document_versions` (NEN-05).
 *
 * Nhật ký và ảnh hiện trường KHÔNG nằm ở đây: ảnh chụp lúc 9 giờ sáng không có "phiên bản mới
 * hơn", nhét vào kho hồ sơ chỉ làm loãng nó (xem ghi chú `site_logs.photo_urls`).
 */
export const SITE_DOCUMENT_CATEGORIES = [
  'ban_ve_thi_cong',
  'bien_phap_thi_cong',
  'tien_do',
  'ban_ve_hoan_cong',
  'ho_so_chat_luong',
  'khac',
] as const;

export type SiteDocumentCategory = (typeof SITE_DOCUMENT_CATEGORIES)[number];

export const SITE_DOCUMENT_CATEGORY_LABELS: Readonly<Record<SiteDocumentCategory, string>> = {
  ban_ve_thi_cong: 'Bản vẽ thi công',
  bien_phap_thi_cong: 'Biện pháp thi công',
  tien_do: 'Tiến độ',
  ban_ve_hoan_cong: 'Bản vẽ hoàn công',
  ho_so_chat_luong: 'Hồ sơ chất lượng',
  khac: 'Tài liệu khác',
};
