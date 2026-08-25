/**
 * Kiểu liệt kê (enum) dùng chung ở tầng CSDL.
 *
 * Giá trị lấy trực tiếp từ `@nvg/shared` để chỉ có MỘT nguồn chân lý:
 * thêm/sửa trạng thái ở `shared` sẽ buộc phải sinh migration tương ứng —
 * đúng tinh thần "một khái niệm chỉ có một bảng/định nghĩa sở hữu" (Backend Schema 2.3).
 */

import { pgEnum } from 'drizzle-orm/pg-core';
import { APPROVAL_SUBJECTS, ROLE_CODES, STATUS_GROUPS } from '@nvg/shared';

/**
 * 5 nhóm trạng thái chuẩn — Content Guidelines 5.1, Webapp Flow 5.5, Backend Schema 1.4.
 * Module có trạng thái con riêng vẫn phải quy về một trong 5 giá trị này khi hiển thị.
 */
export const statusGroupEnum = pgEnum('status_group', STATUS_GROUPS);

/** Mã vai trò — Webapp Flow 2.3 + PRD Mục 3. */
export const roleCodeEnum = pgEnum('role_code', ROLE_CODES);

/** Loại nghiệp vụ có luồng phê duyệt theo hạn mức — PRD NEN-02. */
export const approvalSubjectEnum = pgEnum('approval_subject', APPROVAL_SUBJECTS);

/** Quyết định của một lượt phê duyệt. */
export const approvalDecisionEnum = pgEnum('approval_decision', ['approved', 'rejected']);
