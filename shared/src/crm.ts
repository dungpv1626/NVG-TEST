/**
 * Hằng số nghiệp vụ Module CRM.
 *
 * Nguồn: PRD CRM-02 (pipeline) và CRM-08 (khiếu nại).
 * Đặt ở `shared` để Frontend và Backend dùng chung đúng một danh sách — thêm giai đoạn ở
 * đây sẽ buộc phải sinh migration cho enum tương ứng trong CSDL.
 */

import { daysUntil } from './format';
import type { StatusGroup } from './status';

/**
 * Giai đoạn pipeline — PRD CRM-02 (nguyên văn):
 * "Tiếp nhận → Xác minh/Phân loại → Khảo sát → Báo giá → Đàm phán → Ký hợp đồng hoặc Mất cơ hội".
 *
 * Thứ tự khai báo chính là thứ tự cột trên bảng Kanban (Webapp Flow 4.5).
 */
export const OPPORTUNITY_STAGES = [
  'tiep_nhan',
  'xac_minh',
  'khao_sat',
  'bao_gia',
  'dam_phan',
  'ky_hop_dong',
  'mat_co_hoi',
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface StageMeta {
  readonly label: string;
  /** Ánh xạ về 1 trong 6 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  /** Giai đoạn kết thúc pipeline — không kéo đi tiếp được. */
  readonly isTerminal: boolean;
}

export const OPPORTUNITY_STAGE_META: Readonly<Record<OpportunityStage, StageMeta>> = {
  tiep_nhan: {
    label: 'Tiếp nhận',
    statusGroup: 'draft',
    description: 'Vừa nhận thông tin khách hàng, chưa xác minh nhu cầu.',
    isTerminal: false,
  },
  xac_minh: {
    label: 'Xác minh / Phân loại',
    statusGroup: 'in_progress',
    description: 'Phân loại M1 Lưu trữ · M2 Có nhu cầu thực · M3 Cần báo giá · M4 Chốt–Đàm phán.',
    isTerminal: false,
  },
  khao_sat: {
    label: 'Khảo sát',
    statusGroup: 'in_progress',
    description: 'Đặt lịch và ghi biên bản khảo sát hiện trạng.',
    isTerminal: false,
  },
  bao_gia: {
    label: 'Báo giá',
    statusGroup: 'pending_approval',
    description: 'Lập báo giá, phê duyệt nội bộ rồi gửi khách hàng.',
    isTerminal: false,
  },
  dam_phan: {
    label: 'Đàm phán',
    statusGroup: 'in_progress',
    description: 'Theo dõi phản hồi khách hàng và các phiên bản báo giá.',
    isTerminal: false,
  },
  ky_hop_dong: {
    label: 'Ký hợp đồng',
    statusGroup: 'completed',
    description: 'Khách hàng đồng ý; chuyển sang soạn hợp đồng và bàn giao.',
    isTerminal: true,
  },
  mat_co_hoi: {
    label: 'Mất cơ hội',
    statusGroup: 'overdue',
    description: 'Không thành công. Bắt buộc ghi nguyên nhân để phục vụ báo cáo CRM-09.',
    isTerminal: true,
  },
} as const;

/** Phân loại ở bước Xác minh — PRD CRM-02. */
export const OPPORTUNITY_CLASSIFICATIONS = ['M1', 'M2', 'M3', 'M4'] as const;
export type OpportunityClassification = (typeof OPPORTUNITY_CLASSIFICATIONS)[number];

export const OPPORTUNITY_CLASSIFICATION_LABELS: Readonly<
  Record<OpportunityClassification, string>
> = {
  M1: 'M1 — Lưu trữ',
  M2: 'M2 — Có nhu cầu thực',
  M3: 'M3 — Cần báo giá',
  M4: 'M4 — Chốt / Đàm phán',
};

/** Giải thích từng mức — hiện dưới ô chọn để người phân loại không phải nhớ. Nguồn: hồ sơ khảo sát Phòng Kinh doanh. */
export const OPPORTUNITY_CLASSIFICATION_HINTS: Readonly<Record<OpportunityClassification, string>> =
  {
    M1: 'Chưa có nhu cầu hoặc nhu cầu chưa rõ — lưu để chăm sóc sau, chưa đi tiếp.',
    M2: 'Khách thật sự định xây — cần khảo sát để hiểu yêu cầu.',
    M3: 'Đã rõ yêu cầu, khách đang chờ báo giá.',
    M4: 'Khách sắp chốt, đang thương lượng điều khoản.',
  };

/** Loại công trình gợi ý theo ba mảng của NVG (PRD Mục 1.1). */
export const OPPORTUNITY_PROJECT_TYPES = [
  'Nhà xưởng công nghiệp',
  'Cải tạo nhà máy',
  'Nhà cao tầng',
  'Nhà phố',
  'Biệt thự',
  'Nhà ở nông thôn',
  'Cải tạo nhà ở',
  'Giàn giáo — bán',
  'Giàn giáo — cho thuê',
  'Kết cấu thép',
  'Khác',
] as const;

/**
 * Nguồn khách hàng — PRD CRM-01. Thêm các kênh ba website NVG đang mở (hotline, Zalo,
 * Messenger, YouTube — website chưa có ô để lại thông tin) và khách cũ quay lại (Đợt 1 — 1A).
 * Lưu NGUYÊN CHỮ vào `customers.source` / `leads.source`, nên đổi chữ ở đây không đổi dữ liệu cũ.
 */
export const CUSTOMER_SOURCES = [
  'Giới thiệu',
  'Hotline website',
  'Zalo',
  'Messenger',
  'Facebook',
  'YouTube',
  'BNI',
  'Website',
  'Khách cũ',
  'Môi giới bất động sản công nghiệp',
  'Mời thầu',
  'Khác',
] as const;

/**
 * Đầu mối (Đợt 1 — 1A): người / doanh nghiệp đã tiếp cận nhưng chưa thành cơ hội.
 * Khớp enum `lead_status` (migration 0172).
 */
export const LEAD_STATUSES = [
  'moi',
  'da_lien_he',
  'co_nhu_cau',
  'luu_tru',
  'khong_phu_hop',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_META: Readonly<
  Record<LeadStatus, { label: string; statusGroup: StatusGroup; hint: string }>
> = {
  moi: { label: 'Mới', statusGroup: 'draft', hint: 'Chưa liên hệ lần nào.' },
  da_lien_he: {
    label: 'Đã liên hệ',
    statusGroup: 'in_progress',
    hint: 'Đang trao đổi, chưa rõ nhu cầu.',
  },
  co_nhu_cau: {
    label: 'Đã thành cơ hội',
    statusGroup: 'completed',
    hint: 'Có nhu cầu thật — việc chăm sóc tiếp tục trên cơ hội.',
  },
  luu_tru: {
    label: 'M1 Lưu trữ',
    statusGroup: 'draft',
    hint: 'Chưa có nhu cầu — hệ thống nhắc liên hệ lại vào ngày đã hẹn.',
  },
  khong_phu_hop: {
    label: 'Không phù hợp',
    statusGroup: 'completed',
    hint: 'Đã đóng, kèm lý do — giữ lại để không gọi trùng.',
  },
};

/** Đầu mối còn đang theo dõi (chưa thành cơ hội, chưa đóng). */
export function isLeadOpen(status: LeadStatus): boolean {
  return status === 'moi' || status === 'da_lien_he' || status === 'luu_tru';
}

/**
 * Trạng thái hiển thị của đầu mối: quá ngày hẹn (hoặc quá ngày liên hệ lại với M1) thì Quá hạn.
 * Suy lúc hiển thị như khiếu nại — không cần tác vụ nền.
 */
export function leadDisplayStatus(
  lead: {
    status: LeadStatus;
    next_action_at: string | null | undefined;
    recontact_at: string | null | undefined;
  },
  now: Date = new Date(),
): StatusGroup {
  const meta = LEAD_STATUS_META[lead.status];
  if (!isLeadOpen(lead.status)) return meta.statusGroup;
  const due = lead.status === 'luu_tru' ? lead.recontact_at : lead.next_action_at;
  if (!due) return meta.statusGroup;
  const remaining = daysUntil(due, now);
  return remaining !== null && remaining < 0 ? 'overdue' : meta.statusGroup;
}

/** Kênh liên hệ của nhật ký chăm sóc (1B) — khớp enum `contact_channel`. */
export const CONTACT_CHANNELS = ['goi_dien', 'zalo', 'gap_mat', 'email', 'khac'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_CHANNEL_LABELS: Readonly<Record<ContactChannel, string>> = {
  goi_dien: 'Gọi điện',
  zalo: 'Zalo',
  gap_mat: 'Gặp trực tiếp',
  email: 'Email',
  khac: 'Khác',
};

/** Chỉ giữ chữ số — cùng quy tắc với cột sinh `leads.phone_digits`. */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** Mức độ nghiêm trọng của khiếu nại — PRD CRM-08. */
export const COMPLAINT_SEVERITIES = ['thap', 'trung_binh', 'cao'] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_SEVERITY_LABELS: Readonly<Record<ComplaintSeverity, string>> = {
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
};

/**
 * Trạng thái HIỂN THỊ của một khiếu nại, có tính tới hạn phản hồi (PRD CRM-08).
 *
 * Vì sao tính lúc hiển thị thay vì lưu sẵn `overdue` vào cột `status`:
 * "quá hạn" không phải một hành động của ai cả — nó xảy ra do thời gian trôi qua. Muốn cột
 * `status` tự chuyển sang `overdue` thì phải có tác vụ nền quét định kỳ; tác vụ đó chết
 * hoặc chạy trễ là số liệu sai âm thầm. Suy từ `response_due_date` thì luôn đúng ở mọi thời
 * điểm xem, không phụ thuộc thứ gì chạy nền.
 *
 * Vẫn quy về đúng 5 nhóm trạng thái chuẩn — không tạo màu mới (Content Guidelines 6.4).
 *
 * @see NEN-04 — cảnh báo quá hạn dùng chung một định nghĩa với chỗ này.
 */
export function complaintDisplayStatus(
  status: StatusGroup,
  responseDueDate: string | null | undefined,
  now: Date = new Date(),
): StatusGroup {
  // Đã xử lý xong thì hạn phản hồi không còn ý nghĩa — hồ sơ đóng lúc nào cũng là đóng.
  if (status === 'completed') return 'completed';
  if (!responseDueDate) return status;

  const remaining = daysUntil(responseDueDate, now);
  return remaining !== null && remaining < 0 ? 'overdue' : status;
}

/**
 * Trạng thái báo cáo khảo sát (Đợt 1 — 1D, migration 0175) — khớp enum `survey_report_status`.
 * Ban Giám đốc duyệt; chưa duyệt thì chưa sang Báo giá.
 */
export const SURVEY_REPORT_STATUSES = ['nhap', 'cho_duyet', 'da_duyet', 'tra_ve'] as const;
export type SurveyReportStatus = (typeof SURVEY_REPORT_STATUSES)[number];

export const SURVEY_REPORT_STATUS_META: Readonly<
  Record<SurveyReportStatus, { label: string; statusGroup: StatusGroup }>
> = {
  nhap: { label: 'Báo cáo nháp', statusGroup: 'draft' },
  cho_duyet: { label: 'Chờ Ban Giám đốc duyệt', statusGroup: 'pending_approval' },
  da_duyet: { label: 'Báo cáo đã duyệt', statusGroup: 'completed' },
  // Trả về = quay lại nháp để sửa; ý kiến Ban Giám đốc hiện ngay dưới nhãn.
  tra_ve: { label: 'Bị trả về — cần sửa', statusGroup: 'draft' },
};

/** Sáu ô của báo cáo khảo sát (CRM-03) — máy viết nháp đúng các ô này từ bản ghi âm. */
export const SURVEY_REPORT_FIELDS = [
  { key: 'needs', label: 'Nhu cầu của khách' },
  { key: 'decision_maker', label: 'Người quyết định' },
  { key: 'budget_note', label: 'Ngân sách' },
  { key: 'schedule_note', label: 'Tiến độ mong muốn' },
  { key: 'commercial_terms', label: 'Điều kiện thương mại' },
  { key: 'notes', label: 'Hiện trạng và ghi chú khác' },
] as const;
export type SurveyReportFieldKey = (typeof SURVEY_REPORT_FIELDS)[number]['key'];
