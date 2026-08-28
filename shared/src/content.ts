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
  /**
   * Vượt quyền ở mức PHÂN HỆ — khác `noPermission` (mức một hồ sơ).
   *
   * Phải nói đúng lý do là THIẾU QUYỀN, không được để màn hình rơi vào trạng thái rỗng
   * "chưa có dữ liệu": kho trống và kho không được xem trông giống hệt nhau trên màn hình
   * nhưng dẫn tới hai quyết định trái ngược (Content Guidelines 4.6, 4.7).
   */
  noModuleAccess: (moduleLabel: string) =>
    `Vai trò hiện tại chưa có quyền xem phân hệ ${moduleLabel}. Liên hệ quản trị hệ thống nếu công việc cần tới phân hệ này.`,
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
  noAccess:
    'Chưa được gán vào hồ sơ nào ở mục này. Liên hệ quản lý trực tiếp nếu cần quyền truy cập.',
} as const;

/** Trạng thái rỗng riêng theo module — Content Guidelines 5.6 (nguyên văn). */
export const MODULE_EMPTY_STATES: Readonly<Record<string, string>> = {
  CRM: "Chưa có cơ hội kinh doanh nào. Bấm 'Tạo cơ hội mới' để bắt đầu.",
  DA: "Chưa có gói thầu/dự án nào. Bấm 'Tạo dự án mới' để bắt đầu.",
  TK: "Chưa có dự án thiết kế nào. Bấm 'Tạo dự án thiết kế mới' để bắt đầu.",
  HD: 'Chưa có hợp đồng nào. Hợp đồng được tạo từ một Cơ hội kinh doanh hoặc Dự án đã chốt.',
  TC: 'Chưa có công trình nào được bàn giao.',
  MH: 'Chưa có đề nghị mua nào. Đề nghị mua được tạo từ Dự án hoặc Công trình cần vật tư.',
  KHO: 'Chưa có phiếu nhập/xuất nào trong hôm nay.',
  KT: 'Không có đề nghị thanh toán nào đang chờ xử lý.',
  NS: "Chưa có hồ sơ nhân sự nào. Bấm 'Thêm nhân sự' để bắt đầu.",
  SX: "Chưa có hợp đồng thuê giàn giáo nào. Bấm 'Lập hợp đồng thuê' để bắt đầu.",
} as const;

/**
 * Trạng thái rỗng của các màn hình phụ trong một module.
 *
 * Tách khỏi `MODULE_EMPTY_STATES` vì một module có nhiều màn hình Danh sách, mà bảng trên
 * chỉ có đúng một dòng cho mỗi mã module.
 */
export const SCREEN_EMPTY_STATES = {
  /** CRM-08 — trạng thái rỗng ở đây là tin TỐT, nên nói theo hướng tích cực. */
  complaints:
    'Chưa ghi nhận khiếu nại nào. Ghi nhận ngay khi khách phản ánh để không bỏ sót hạn xử lý.',
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
    `${fromPerson} đã bàn giao ${recordName}.`,
  awaitingApproval: (recordName: string, waitingDays: number) =>
    `${recordName} đang chờ phê duyệt (chờ ${waitingDays} ngày).`,
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

/**
 * Rút TÊN GỌI từ họ tên đầy đủ — tiếng Việt gọi nhau bằng TỪ CUỐI.
 *
 * "Bùi Thị Hà" phải ra "Hà", không phải "Thị Hà": "Thị" và "Văn" là chữ đệm, không ai dùng để
 * xưng hô, và ghép vào lời chào thì nghe như đọc hồ sơ hộ khẩu chứ không phải chào một người.
 * Lời chào Dashboard là ngoại lệ cá nhân hoá duy nhất của hệ thống (Content Guidelines 4.2),
 * nên nó phải đúng.
 *
 * Tên kép ("Ngọc Anh", "Minh Châu") sẽ bị rút còn từ cuối. Chấp nhận: không có cách nào phân
 * biệt tên kép với chữ đệm từ chuỗi họ tên, và gọi thiếu một chữ vẫn tự nhiên hơn nhiều so
 * với gọi kèm chữ đệm.
 */
export function shortNameFromFullName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) ?? '';
}
