/**
 * Hằng số nghiệp vụ Module TK — Thiết kế (NVO, hỗ trợ NVC khi cần).
 *
 * Nguồn: PRD TK-01 → TK-09, Backend Schema 4.4, Webapp Flow 3.3.
 *
 * 📐 TK-10 → TK-17 (AI Preliminary Design Engine) nằm ở `@nvg/shared/design` — đường dẫn con
 * riêng, cố ý không gộp vào đây: kiểu `DesignBrief` bên đó là HỢP ĐỒNG DỮ LIỆU của engine,
 * khác `design_briefs` của TK-01. Hai khái niệm trùng tên nhưng khác nghĩa (việc hợp nhất
 * chúng là Mốc 2, đang chờ Haan trả lời câu hỏi Q-2).
 */

import type { StatusGroup } from './status';

/**
 * Bộ môn thiết kế.
 *
 * `phuong_an` KHÔNG phải một bộ môn kỹ thuật mà là bước phương án kiến trúc sơ bộ (TK-03) —
 * xếp chung vào đây vì nó cũng là một hồ sơ có phiên bản và cũng chỉ có MỘT bản đang hiệu
 * lực tại một thời điểm. Tách thành bảng riêng thì cơ chế phiên bản phải viết hai lần.
 *
 * Ba bộ môn kỹ thuật còn lại lấy nguyên văn PRD TK-04: "kiến trúc, kết cấu, điện nước".
 */
export const DESIGN_DISCIPLINES = ['phuong_an', 'kien_truc', 'ket_cau', 'dien_nuoc'] as const;

export type DesignDiscipline = (typeof DESIGN_DISCIPLINES)[number];

export const DESIGN_DISCIPLINE_LABELS: Readonly<Record<DesignDiscipline, string>> = {
  phuong_an: 'Phương án kiến trúc',
  kien_truc: 'Kiến trúc',
  ket_cau: 'Kết cấu',
  dien_nuoc: 'Điện nước',
};

/**
 * Ba bộ môn phải đồng bộ với nhau trước khi phát hành hồ sơ (TK-04) và trước khi bàn giao
 * thi công (TK-08). Phương án kiến trúc không nằm trong danh sách này: nó là bước trước đó,
 * không phải một phần của bộ hồ sơ kỹ thuật giao cho công trường.
 */
export const TECHNICAL_DISCIPLINES = ['kien_truc', 'ket_cau', 'dien_nuoc'] as const;

export type TechnicalDiscipline = (typeof TECHNICAL_DISCIPLINES)[number];

/**
 * Các bước của một dự án thiết kế — dựng đúng theo hành trình Webapp Flow 3.3:
 * đầu bài → phương án kiến trúc → khách duyệt → hồ sơ kỹ thuật đa bộ môn →
 * dự toán NVO → bàn giao hồ sơ thi công.
 *
 * KHÔNG dùng Kanban kéo-thả (Webapp Flow 4.5): chuyển bước ở đây là HỆ QUẢ của việc đã làm
 * xong ở tab tương ứng (khách duyệt phương án, đủ ba bộ môn…), không phải một cú kéo.
 */
export const DESIGN_STAGES = [
  'dau_bai',
  'phuong_an',
  'cho_khach_duyet',
  'ho_so_ky_thuat',
  'du_toan',
  'ban_giao',
  'dung_thiet_ke',
] as const;

export type DesignStage = (typeof DESIGN_STAGES)[number];

export interface DesignStageMeta {
  readonly label: string;
  /** Quy về 1 trong 5 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  readonly isTerminal: boolean;
}

export const DESIGN_STAGE_META: Readonly<Record<DesignStage, DesignStageMeta>> = {
  dau_bai: {
    label: 'Lập đầu bài',
    statusGroup: 'draft',
    description:
      'Chốt nhiệm vụ thiết kế, nhu cầu công năng, ngân sách, phong cách và hiện trạng khu đất.',
    isTerminal: false,
  },
  phuong_an: {
    label: 'Phương án kiến trúc',
    statusGroup: 'in_progress',
    description: 'Dựng và điều chỉnh phương án mặt bằng, phối cảnh theo góp ý của khách hàng.',
    isTerminal: false,
  },
  cho_khach_duyet: {
    label: 'Chờ khách hàng duyệt',
    statusGroup: 'pending_approval',
    description: 'Phương án đã gửi khách hàng, đang chờ xác nhận để chuyển sang hồ sơ kỹ thuật.',
    isTerminal: false,
  },
  ho_so_ky_thuat: {
    label: 'Hồ sơ kỹ thuật',
    statusGroup: 'in_progress',
    description: 'Triển khai song song kiến trúc, kết cấu, điện nước và kiểm tra đồng bộ.',
    isTerminal: false,
  },
  du_toan: {
    label: 'Dự toán và báo giá',
    statusGroup: 'in_progress',
    description: 'Bóc tách khối lượng và lập dự toán NVO trên cùng cơ chế với Module DA.',
    isTerminal: false,
  },
  ban_giao: {
    label: 'Đã bàn giao thi công',
    statusGroup: 'completed',
    description: 'Hồ sơ đã đủ và đồng bộ giữa các bộ môn, đã phát hành cho Ban công trường.',
    isTerminal: true,
  },
  dung_thiet_ke: {
    label: 'Dừng thiết kế',
    statusGroup: 'draft',
    description: 'Dự án dừng lại. Nguyên nhân được ghi lại để rút kinh nghiệm cho dự án sau.',
    isTerminal: true,
  },
};

/**
 * Tiến độ một bộ môn (TK-04). Quy về 4 trong 5 nhóm trạng thái chuẩn; "quá hạn" không phải
 * một lựa chọn người dùng đặt tay mà tính từ hạn hoàn thành — xem `disciplineDisplayStatus`.
 */
export const DISCIPLINE_TASK_STATUSES = [
  'chua_bat_dau',
  'dang_lam',
  'cho_kiem_tra',
  'hoan_thanh',
] as const;

export type DisciplineTaskStatus = (typeof DISCIPLINE_TASK_STATUSES)[number];

export const DISCIPLINE_TASK_STATUS_META: Readonly<
  Record<DisciplineTaskStatus, { label: string; statusGroup: StatusGroup }>
> = {
  chua_bat_dau: { label: 'Chưa bắt đầu', statusGroup: 'draft' },
  dang_lam: { label: 'Đang triển khai', statusGroup: 'in_progress' },
  cho_kiem_tra: { label: 'Chờ kiểm tra chéo', statusGroup: 'pending_approval' },
  hoan_thanh: { label: 'Hoàn thành', statusGroup: 'completed' },
};

/**
 * Vòng góp ý / duyệt của khách hàng trên một phiên bản (TK-03).
 *
 * `gop_y` khác `yeu_cau_sua`: góp ý là ý kiến ghi nhận, yêu cầu sửa là đòi hỏi phải ra bản
 * mới. Phân biệt được thì mới trả lời được câu "bản này khách đã duyệt hay chưa".
 */
export const DESIGN_REVIEW_DECISIONS = ['gop_y', 'yeu_cau_sua', 'duyet'] as const;

export type DesignReviewDecision = (typeof DESIGN_REVIEW_DECISIONS)[number];

export const DESIGN_REVIEW_DECISION_LABELS: Readonly<Record<DesignReviewDecision, string>> = {
  gop_y: 'Ghi nhận góp ý',
  yeu_cau_sua: 'Yêu cầu chỉnh sửa',
  duyet: 'Khách hàng duyệt',
};

/** Ai đang góp ý — khách hàng hay nội bộ. Cả hai đều lưu chung một bảng lịch sử. */
export const DESIGN_REVIEWER_TYPES = ['khach_hang', 'noi_bo'] as const;
export type DesignReviewerType = (typeof DESIGN_REVIEWER_TYPES)[number];

export const DESIGN_REVIEWER_TYPE_LABELS: Readonly<Record<DesignReviewerType, string>> = {
  khach_hang: 'Khách hàng',
  noi_bo: 'Nội bộ',
};

/** Trạng thái xử lý một yêu cầu thay đổi (TK-06). */
export const CHANGE_REQUEST_STATUSES = [
  'moi',
  'dang_danh_gia',
  'chap_thuan',
  'tu_choi',
  'da_thuc_hien',
] as const;

export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_REQUEST_STATUS_META: Readonly<
  Record<ChangeRequestStatus, { label: string; statusGroup: StatusGroup }>
> = {
  moi: { label: 'Mới ghi nhận', statusGroup: 'draft' },
  dang_danh_gia: { label: 'Đang đánh giá ảnh hưởng', statusGroup: 'in_progress' },
  chap_thuan: { label: 'Chấp thuận', statusGroup: 'pending_approval' },
  tu_choi: { label: 'Không thực hiện', statusGroup: 'draft' },
  da_thuc_hien: { label: 'Đã thực hiện', statusGroup: 'completed' },
};

/** Nguồn phát sinh yêu cầu thay đổi (TK-06: "người yêu cầu"). */
export const CHANGE_REQUEST_ORIGINS = ['khach_hang', 'noi_bo', 'cong_truong', 'phap_ly'] as const;
export type ChangeRequestOrigin = (typeof CHANGE_REQUEST_ORIGINS)[number];

export const CHANGE_REQUEST_ORIGIN_LABELS: Readonly<Record<ChangeRequestOrigin, string>> = {
  khach_hang: 'Khách hàng',
  noi_bo: 'Nội bộ Phòng Thiết kế',
  cong_truong: 'Ban công trường',
  phap_ly: 'Yêu cầu pháp lý, cơ quan quản lý',
};

/**
 * Một hạng mục chưa đạt khi kiểm tra đồng bộ đa bộ môn (TK-04, TK-08).
 *
 * `blocking = true` thì chặn bàn giao; `false` chỉ là cảnh báo để người phụ trách cân nhắc.
 * Kiểu này dùng chung giữa hàm CSDL `check_design_sync` và màn hình bàn giao — đổi một chỗ
 * là hai bên cùng đổi.
 */
export interface DesignSyncFinding {
  readonly code: string;
  readonly discipline: DesignDiscipline | null;
  readonly message: string;
  readonly blocking: boolean;
}

/**
 * Trạng thái hiển thị của một dự án thiết kế.
 *
 * Quá hạn tính theo hạn bàn giao hồ sơ, và chỉ có nghĩa khi chưa bàn giao: đã bàn giao rồi
 * thì hạn đó không còn là việc phải làm, hiện "Quá hạn" lúc ấy chỉ gây hoang mang.
 */
export function designDisplayStatus(
  stage: DesignStage,
  handoverDeadline: string | null,
): StatusGroup {
  const meta = DESIGN_STAGE_META[stage];

  if (!meta.isTerminal && handoverDeadline) {
    const deadline = new Date(handoverDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()) return 'overdue';
  }

  return meta.statusGroup;
}

/**
 * Trạng thái hiển thị của một bộ môn (TK-04) — cùng nguyên tắc: đã hoàn thành thì hạn cũ
 * không còn ý nghĩa.
 */
export function disciplineDisplayStatus(
  status: DisciplineTaskStatus,
  dueDate: string | null,
): StatusGroup {
  if (status !== 'hoan_thanh' && dueDate) {
    const due = new Date(dueDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
  }
  return DISCIPLINE_TASK_STATUS_META[status].statusGroup;
}
