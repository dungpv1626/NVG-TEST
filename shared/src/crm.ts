/**
 * Hằng số nghiệp vụ Module CRM.
 *
 * Nguồn: PRD CRM-02 (pipeline) và CRM-08 (khiếu nại).
 * Đặt ở `shared` để Frontend và Backend dùng chung đúng một danh sách — thêm giai đoạn ở
 * đây sẽ buộc phải sinh migration cho enum tương ứng trong CSDL.
 */

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
  /** Ánh xạ về 1 trong 5 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
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

/** Nguồn khách hàng — PRD CRM-01. */
export const CUSTOMER_SOURCES = [
  'Giới thiệu',
  'BNI',
  'Facebook',
  'Website',
  'Môi giới bất động sản công nghiệp',
  'Mời thầu',
  'Khác',
] as const;

/** Mức độ nghiêm trọng của khiếu nại — PRD CRM-08. */
export const COMPLAINT_SEVERITIES = ['thap', 'trung_binh', 'cao'] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_SEVERITY_LABELS: Readonly<Record<ComplaintSeverity, string>> = {
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
};
