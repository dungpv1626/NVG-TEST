/**
 * Thuật ngữ chuẩn hoá — Content Guidelines Mục 4.4.
 *
 * Mỗi khái niệm dùng ĐÚNG MỘT cách gọi trong toàn hệ thống. Đây là giải pháp ở cấp
 * ngôn ngữ cho vướng mắc "số liệu giữa các bộ phận không khớp nhau" (PRD 1.3, #7).
 *
 * Dùng hằng số ở đây thay vì gõ chuỗi trực tiếp trong component — để không ai vô tình
 * viết "Gửi duyệt" ở màn hình này và "Submit" ở màn hình kia.
 */

export const TERMS = {
  /** Người phụ trách chính một hồ sơ. KHÔNG dùng: Người sở hữu, Chủ hồ sơ, Owner. */
  responsiblePerson: 'Người chịu trách nhiệm',
  /** Người cùng tham gia xử lý hồ sơ. */
  collaborator: 'Người phối hợp',
  /** Đưa hồ sơ cho người có thẩm quyền. KHÔNG dùng: Submit, Gửi duyệt, Gửi xin ý kiến. */
  submitForApproval: 'Gửi phê duyệt',
  /** Đồng ý một đề xuất. KHÔNG dùng: Approve, Chấp thuận. */
  approve: 'Phê duyệt',
  /** Rút gọn của "Phê duyệt" — CHỈ dùng trên nút bấm khi chật chỗ (Content Guidelines 4.5). */
  approveShort: 'Duyệt',
  /** Đưa hồ sơ cho bộ phận tiếp theo. KHÔNG dùng: Chuyển giao, Handover, Chuyển tiếp. */
  handover: 'Bàn giao',
  /** Tài liệu đang có hiệu lực. KHÔNG dùng: Mới nhất, Hiện hành, Active. */
  currentVersion: 'Đang hiệu lực',
  /** Công ty thành viên. KHÔNG dùng: Công ty con, Chi nhánh, Entity. */
  company: 'Pháp nhân',
  /** Quá thời hạn xử lý. KHÔNG dùng: Trễ hạn, Chậm, Overdue. */
  overdue: 'Quá hạn',
  deadline: 'Thời hạn',
  status: 'Trạng thái',
} as const;

/**
 * Các cách gọi BỊ CẤM, ánh xạ sang từ chuẩn.
 * Dùng cho test/lint nội dung ở Phase 4C (rà soát microcopy toàn hệ thống).
 */
export const FORBIDDEN_TERMS: Readonly<Record<string, string>> = {
  'Người sở hữu': TERMS.responsiblePerson,
  'Chủ hồ sơ': TERMS.responsiblePerson,
  Owner: TERMS.responsiblePerson,
  Submit: TERMS.submitForApproval,
  'Gửi duyệt': TERMS.submitForApproval,
  'Gửi xin ý kiến': TERMS.submitForApproval,
  Approve: TERMS.approve,
  'Chấp thuận': TERMS.approve,
  'Chuyển giao': TERMS.handover,
  Handover: TERMS.handover,
  'Chuyển tiếp': TERMS.handover,
  'Mới nhất': TERMS.currentVersion,
  'Hiện hành': TERMS.currentVersion,
  Active: TERMS.currentVersion,
  'Công ty con': TERMS.company,
  'Chi nhánh': TERMS.company,
  Entity: TERMS.company,
  'Trễ hạn': TERMS.overdue,
  Overdue: TERMS.overdue,
} as const;
