/**
 * Thư viện nội dung dùng lại — Content Guidelines Mục 5.
 *
 * Mục đích: không ai phải tự nghĩ lại cách diễn đạt cho các tình huống lặp lại ở nhiều module.
 *
 * Giọng nói bắt buộc (Content Guidelines 2.1–2.3):
 *  - KHÔNG đại từ nhân xưng (ngoại lệ duy nhất: lời chào Dashboard dùng tên).
 *  - KHÔNG emoji, KHÔNG IN HOA nhấn mạnh, KHÔNG nhiều dấu chấm than.
 *  - Lỗi: [việc gì không thực hiện được] + [vì sao / cần làm gì]. KHÔNG lộ mã kỹ thuật.
 */

import { TERMS } from './terminology';

/** Nhãn nút chuẩn — Content Guidelines 5.2. Động từ mệnh lệnh, không dùng danh từ. */
export const BUTTONS = {
  create: (entity: string) => `Tạo ${entity} mới`,
  saveDraft: 'Lưu nháp',
  save: 'Lưu',
  submitForApproval: TERMS.submitForApproval,
  approve: TERMS.approveShort,
  reject: 'Từ chối',
  edit: 'Chỉnh sửa',
  delete: 'Xóa',
  cancel: 'Hủy',
  back: 'Quay lại',
  handover: TERMS.handover,
  exportExcel: 'Xuất Excel',
  exportPdf: 'Xuất PDF',
  viewAll: 'Xem tất cả',
  viewFullRecord: 'Xem đầy đủ hồ sơ',
  retry: 'Thử lại',
} as const;

/** Mẫu thông báo lỗi chuẩn — Content Guidelines 5.5. */
export const ERRORS = {
  requiredField: (field: string) => `Vui lòng nhập ${field}.`,
  invalidFormat: (field: string, expected: string) => `${field} chưa đúng định dạng (${expected}).`,
  /** Nêu rõ AI xử lý được, không chỉ nói "Không đủ quyền" (Content Guidelines 4.6). */
  exceedsApprovalLimit: (authorityRole: string) =>
    `Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại. Chuyển cho ${authorityRole}.`,
  noPermission:
    'Vai trò hiện tại chưa có quyền xem hồ sơ này. Liên hệ quản lý trực tiếp nếu cần hỗ trợ.',
  offline: 'Không thể lưu do mất kết nối mạng. Dữ liệu đã nhập vẫn được giữ — thử lại khi có mạng.',
  conflict: (otherUser: string) =>
    `${otherUser} vừa cập nhật hồ sơ này. Tải lại để xem bản mới nhất trước khi tiếp tục.`,
  unknown: (supportContact: string) =>
    `Có lỗi xảy ra, vui lòng thử lại. Nếu vẫn gặp lỗi, liên hệ ${supportContact}.`,
} as const;

/**
 * Đầu mối hỗ trợ kỹ thuật — Content Guidelines Mục 7 ghi đây là VẤN ĐỀ CÒN MỞ,
 * cần NVG xác định. Giá trị dưới đây là tạm thời.
 */
export const SUPPORT_CONTACT_PLACEHOLDER = 'quản trị hệ thống';

/** Mẫu trạng thái rỗng — Content Guidelines 4.7 + 5.6. Luôn 2 phần: tình trạng + hành động gợi ý. */
export const EMPTY_STATES = {
  list: (entity: string, createLabel: string) =>
    `Chưa có ${entity} nào. Bấm '${createLabel}' để bắt đầu.`,
  filtered: 'Không tìm thấy kết quả phù hợp. Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.',
  inbox: 'Không có việc nào cần xử lý. Mọi thứ đã được cập nhật.',
  noAccess: 'Bạn chưa được gán vào hồ sơ nào ở mục này. Liên hệ quản lý trực tiếp nếu cần quyền truy cập.',
} as const;

/** Trạng thái rỗng riêng theo module — Content Guidelines 5.6 (nguyên văn). */
export const MODULE_EMPTY_STATES: Readonly<Record<string, string>> = {
  CRM: "Chưa có cơ hội kinh doanh nào. Bấm 'Tạo cơ hội mới' để bắt đầu.",
  DA: "Chưa có gói thầu/dự án nào. Bấm 'Tạo dự án mới' để bắt đầu.",
  TK: "Chưa có dự án thiết kế nào. Bấm 'Tạo dự án thiết kế mới' để bắt đầu.",
  HD: 'Chưa có hợp đồng nào. Hợp đồng được tạo từ một Cơ hội kinh doanh hoặc Dự án đã chốt.',
  TC: 'Chưa có công trình nào được bàn giao cho bạn.',
  MH: 'Chưa có đề nghị mua nào. Đề nghị mua được tạo từ Dự án hoặc Công trình cần vật tư.',
  KHO: 'Chưa có phiếu nhập/xuất nào trong hôm nay.',
  KT: 'Không có đề nghị thanh toán nào đang chờ xử lý.',
  NS: "Chưa có hồ sơ nhân sự nào. Bấm 'Thêm nhân sự' để bắt đầu.",
} as const;

/** Mẫu thông báo hệ thống — Content Guidelines 5.3. Nêu sự việc trước, mức độ khẩn sau. */
export const NOTIFICATIONS = {
  expiringSoon: (docName: string, subject: string, days: number) =>
    `${docName} của ${subject} hết hạn trong ${days} ngày.`,
  budgetExceeded: (siteName: string, percent: string) =>
    `${siteName} vượt ngân sách được duyệt ${percent}. Xem chi tiết.`,
  debtDue: (party: string, amount: string, date: string) =>
    `${party} có khoản công nợ ${amount} đến hạn vào ${date}.`,
  handedOver: (fromPerson: string, recordName: string) =>
    `${fromPerson} đã bàn giao ${recordName} cho bạn.`,
  awaitingApproval: (recordName: string, waitingDays: number) =>
    `${recordName} đang chờ bạn phê duyệt (chờ ${waitingDays} ngày).`,
  newVersion: (docName: string, updatedBy: string) =>
    `${docName} vừa được cập nhật phiên bản mới bởi ${updatedBy}.`,
} as const;

/** Xác nhận hành động không thể hoàn tác — Content Guidelines 2.3. Rõ hậu quả, không hù dọa. */
export const CONFIRMS = {
  destructive: (action: string) => `${action} sẽ không thể khôi phục. Tiếp tục?`,
  unsavedChanges: 'Các thay đổi chưa lưu sẽ bị mất nếu rời trang. Tiếp tục?',
} as const;

/**
 * Lời chào Dashboard — NGOẠI LỆ DUY NHẤT được phép cá nhân hoá (Content Guidelines 4.2).
 * Dùng TÊN, KHÔNG dùng đại từ anh/chị (tránh phải đoán giới tính/cấp bậc).
 */
export function dashboardGreeting(name: string): string {
  return `Chào ${name}, đây là việc cần làm hôm nay`;
}
