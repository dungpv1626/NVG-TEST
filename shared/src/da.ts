/**
 * Hằng số nghiệp vụ Module DA — Dự án và Đấu thầu (NVC).
 *
 * Nguồn: PRD DA-01 → DA-10, Webapp Flow 3.2 (hành trình Kỹ sư Dự toán – Đấu thầu).
 * Đặt ở `shared` để Frontend, Workers và migration CSDL dùng chung đúng một danh sách.
 */

import type { StatusGroup } from './status';

/**
 * Các bước của một gói thầu — Webapp Flow 3.2 dựng đúng theo thứ tự này:
 * tiếp nhận hồ sơ mời thầu → khảo sát hiện trạng → bóc tách khối lượng → lập dự toán →
 * duyệt giá → nộp thầu → kết quả.
 *
 * KHÔNG dùng Kanban kéo-thả cho danh sách này (Webapp Flow 4.5 giới hạn Kanban cho quy trình
 * có số trạng thái cố định như pipeline CRM); ở đây các bước gắn với việc phải làm xong ở
 * từng tab, nên chuyển bước là hệ quả của thao tác, không phải một cú kéo.
 */
export const BIDDING_STAGES = [
  'tiep_nhan_ho_so',
  'khao_sat',
  'boc_tach',
  'du_toan',
  'cho_duyet_gia',
  'da_duyet_gia',
  'nop_thau',
  'trung_thau',
  'truot_thau',
] as const;

export type BiddingStage = (typeof BIDDING_STAGES)[number];

export interface BiddingStageMeta {
  readonly label: string;
  /** Quy về 1 trong 5 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  /** Bước kết thúc — không đi tiếp được. */
  readonly isTerminal: boolean;
}

export const BIDDING_STAGE_META: Readonly<Record<BiddingStage, BiddingStageMeta>> = {
  tiep_nhan_ho_so: {
    label: 'Tiếp nhận hồ sơ',
    statusGroup: 'draft',
    description: 'Nhận hồ sơ mời thầu, kiểm tra đủ thiếu và lập danh sách nội dung cần làm rõ.',
    isTerminal: false,
  },
  khao_sat: {
    label: 'Khảo sát hiện trạng',
    statusGroup: 'in_progress',
    description: 'Ghi nhận hiện trạng, điều kiện thi công, biện pháp và rủi ro đã nhận diện.',
    isTerminal: false,
  },
  boc_tach: {
    label: 'Bóc tách khối lượng',
    statusGroup: 'in_progress',
    description: 'Nhập bảng khối lượng theo hạng mục, gắn với bản vẽ đang hiệu lực.',
    isTerminal: false,
  },
  du_toan: {
    label: 'Lập dự toán',
    statusGroup: 'in_progress',
    description: 'Tổng hợp chi phí trực tiếp, chi phí chung, dự phòng, thuế và lợi nhuận dự kiến.',
    isTerminal: false,
  },
  cho_duyet_gia: {
    label: 'Chờ duyệt giá',
    statusGroup: 'pending_approval',
    description: 'Giá dự thầu đã trình, đang chờ người có hạn mức phê duyệt.',
    isTerminal: false,
  },
  da_duyet_gia: {
    label: 'Đã duyệt giá',
    statusGroup: 'in_progress',
    description: 'Giá dự thầu đã được phê duyệt. Bước tiếp theo là hoàn thiện hồ sơ và nộp thầu.',
    isTerminal: false,
  },
  nop_thau: {
    label: 'Đã nộp thầu',
    statusGroup: 'in_progress',
    description: 'Hồ sơ đã nộp, đang chờ kết quả từ chủ đầu tư.',
    isTerminal: false,
  },
  trung_thau: {
    label: 'Trúng thầu',
    statusGroup: 'completed',
    description: 'Đã trúng thầu — bước tiếp theo là ký hợp đồng và lập ngân sách thi công.',
    isTerminal: true,
  },
  truot_thau: {
    label: 'Trượt thầu',
    statusGroup: 'draft',
    description: 'Không trúng thầu. Nguyên nhân được ghi lại để rút kinh nghiệm cho gói sau.',
    isTerminal: true,
  },
};

/**
 * Nhóm chi phí — PRD DA-09 (nguyên văn): "ngân sách thi công theo mã công việc và nhóm chi phí
 * (vật tư, nhân công, máy móc, nhà thầu phụ, chi phí chung, dự phòng, lợi nhuận mục tiêu)".
 *
 * Cùng bộ nhóm này dùng cho dòng dự toán (DA-06) và dòng ngân sách (DA-09) — nhờ vậy chuyển
 * dự toán thành ngân sách là ánh xạ một-một, không phải quy đổi thủ công.
 */
export const COST_GROUPS = [
  'vat_tu',
  'nhan_cong',
  'may_moc',
  'thau_phu',
  'chi_phi_chung',
  'du_phong',
  'loi_nhuan',
] as const;

export type CostGroup = (typeof COST_GROUPS)[number];

export const COST_GROUP_LABELS: Readonly<Record<CostGroup, string>> = {
  vat_tu: 'Vật tư',
  nhan_cong: 'Nhân công',
  may_moc: 'Máy móc, thiết bị',
  thau_phu: 'Nhà thầu phụ',
  chi_phi_chung: 'Chi phí chung',
  du_phong: 'Dự phòng rủi ro',
  loi_nhuan: 'Lợi nhuận mục tiêu',
};

/** Nguồn của một dòng đơn giá — PRD DA-05. */
export const UNIT_PRICE_SOURCES = ['lich_su_mua', 'bao_gia_ncc', 'dinh_muc_noi_bo'] as const;
export type UnitPriceSource = (typeof UNIT_PRICE_SOURCES)[number];

export const UNIT_PRICE_SOURCE_LABELS: Readonly<Record<UnitPriceSource, string>> = {
  lich_su_mua: 'Lịch sử mua hàng',
  bao_gia_ncc: 'Báo giá nhà cung cấp',
  dinh_muc_noi_bo: 'Định mức nội bộ',
};

/**
 * Nhóm hồ sơ dự thầu — PRD DA-08 liệt kê đúng chín nhóm này.
 * Dùng làm checklist: thiếu nhóm nào thì nhìn thấy ngay trước hạn nộp.
 */
export const BID_DOCUMENT_CATEGORIES = [
  'phap_ly',
  'nang_luc',
  'kinh_nghiem',
  'nhan_su',
  'thiet_bi',
  'bien_phap_thi_cong',
  'tien_do',
  'an_toan',
  'bang_gia',
] as const;

export type BidDocumentCategory = (typeof BID_DOCUMENT_CATEGORIES)[number];

export const BID_DOCUMENT_CATEGORY_LABELS: Readonly<Record<BidDocumentCategory, string>> = {
  phap_ly: 'Hồ sơ pháp lý',
  nang_luc: 'Năng lực nhà thầu',
  kinh_nghiem: 'Kinh nghiệm tương tự',
  nhan_su: 'Nhân sự chủ chốt',
  thiet_bi: 'Thiết bị thi công',
  bien_phap_thi_cong: 'Biện pháp thi công',
  tien_do: 'Tiến độ thi công',
  an_toan: 'An toàn lao động',
  bang_gia: 'Bảng giá dự thầu',
};

/**
 * Trạng thái hiển thị của một gói thầu.
 *
 * Quá hạn tính theo hạn NỘP THẦU, và chỉ có nghĩa khi hồ sơ chưa nộp: nộp rồi thì hạn nộp
 * không còn là việc phải làm nữa, hiện "Quá hạn" lúc đó chỉ gây hoang mang.
 */
export function biddingDisplayStatus(
  stage: BiddingStage,
  submissionDeadline: string | null,
): StatusGroup {
  const meta = BIDDING_STAGE_META[stage];
  const notSubmittedYet =
    stage !== 'nop_thau' && stage !== 'trung_thau' && stage !== 'truot_thau';

  if (notSubmittedYet && submissionDeadline) {
    const deadline = new Date(submissionDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()) return 'overdue';
  }

  return meta.statusGroup;
}
