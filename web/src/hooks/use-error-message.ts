/**
 * Chuyển lỗi kỹ thuật của Supabase/Postgres sang ngôn ngữ nghiệp vụ.
 *
 * Content Guidelines 4.6: "KHÔNG hiển thị mã lỗi kỹ thuật (mã HTTP, stack trace) cho người
 * dùng thường — chỉ ghi vào nhật ký hệ thống; người dùng chỉ thấy thông báo bằng ngôn ngữ
 * nghiệp vụ."
 *
 * Cấu trúc chuẩn: [việc gì không thực hiện được] + [vì sao / cần làm gì].
 */

import { ERRORS, SUPPORT_CONTACT_PLACEHOLDER } from '@nvg/shared';

/** Mã lỗi Postgres thường gặp qua PostgREST. */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;

/**
 * PostgREST trả mã này khi `.single()` không nhận được đúng một dòng.
 *
 * Với lệnh UPDATE, nguyên nhân gần như luôn là RLS đã lọc mất dòng: người dùng không có
 * quyền sửa hồ sơ này. PostgREST KHÔNG dùng 42501 cho tình huống đó — nó lặng lẽ cập nhật
 * 0 dòng — nên nếu không dịch mã này thành ngôn ngữ nghiệp vụ, người dùng sẽ nhận thông báo
 * "có lỗi xảy ra" chung chung cho một việc hoàn toàn giải thích được.
 */
const PGRST_NO_SINGLE_ROW = 'PGRST116';

/** Hành động đang thực hiện — quyết định cách diễn đạt lỗi thiếu quyền. */
export type ActionContext = 'view' | 'create' | 'edit' | 'delete' | 'approve';

const NO_PERMISSION_BY_ACTION: Record<ActionContext, string> = {
  view: ERRORS.noPermission,
  create: 'Vai trò hiện tại không có quyền tạo hồ sơ ở mục này. Liên hệ quản lý trực tiếp nếu cần.',
  edit: 'Vai trò hiện tại không có quyền chỉnh sửa hồ sơ này. Chỉ người chịu trách nhiệm hoặc quản lý trực tiếp mới sửa được.',
  delete: 'Vai trò hiện tại không có quyền xóa hồ sơ này.',
  approve: 'Vai trò hiện tại không có quyền phê duyệt hồ sơ này.',
};

export function toUserMessage(error: unknown, action: ActionContext = 'view'): string {
  if (!error) return '';

  const err = error as { code?: string; message?: string };
  const code = err.code;
  const raw = (err.message ?? String(error)).toLowerCase();

  if (code === PG.INSUFFICIENT_PRIVILEGE || raw.includes('row-level security')) {
    return NO_PERMISSION_BY_ACTION[action];
  }

  if (code === PGRST_NO_SINGLE_ROW) {
    // Có thể là thiếu quyền, cũng có thể là hồ sơ vừa bị xóa hoặc đổi trạng thái ở phiên
    // khác — nêu cả hai khả năng kèm việc cần làm, thay vì khẳng định sai một trong hai.
    return action === 'view'
      ? 'Không tìm thấy hồ sơ này. Có thể hồ sơ đã được xóa, hoặc vai trò hiện tại chưa được cấp quyền xem.'
      : 'Không lưu được thay đổi. Hồ sơ đã đổi trạng thái ở nơi khác, hoặc vai trò hiện tại không được sửa hồ sơ này. Tải lại trang để xem dữ liệu mới nhất.';
  }

  if (code === PG.UNIQUE_VIOLATION) {
    return 'Giá trị này đã tồn tại trong hệ thống. Kiểm tra lại hoặc dùng hồ sơ đã có.';
  }

  if (code === PG.FOREIGN_KEY_VIOLATION) {
    return 'Hồ sơ liên quan không còn tồn tại. Tải lại trang để xem dữ liệu mới nhất.';
  }

  if (code === PG.NOT_NULL_VIOLATION || code === PG.CHECK_VIOLATION) {
    return 'Dữ liệu nhập chưa hợp lệ. Kiểm tra lại các trường bắt buộc.';
  }

  if (raw.includes('failed to fetch') || raw.includes('networkerror')) {
    return ERRORS.offline;
  }

  // Thông báo do hàm nghiệp vụ tự phát (RAISE EXCEPTION) đã viết bằng tiếng Việt —
  // giữ nguyên vì đó chính là ngôn ngữ nghiệp vụ.
  const message = err.message ?? '';
  if (/[àáảãạăâđêôơư]/i.test(message)) {
    return message.replace(/^.*?:\s*/, '');
  }

  return ERRORS.unknown(SUPPORT_CONTACT_PLACEHOLDER);
}
