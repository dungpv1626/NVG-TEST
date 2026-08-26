/**
 * Kiểu liệt kê (enum) dùng chung ở tầng CSDL.
 *
 * Giá trị lấy trực tiếp từ `@nvg/shared` để chỉ có MỘT nguồn chân lý:
 * thêm/sửa trạng thái ở `shared` sẽ buộc phải sinh migration tương ứng —
 * đúng tinh thần "một khái niệm chỉ có một bảng/định nghĩa sở hữu" (Backend Schema 2.3).
 */

import { pgEnum } from 'drizzle-orm/pg-core';
import {
  APPROVAL_SUBJECTS,
  BIDDING_STAGES,
  BID_DOCUMENT_CATEGORIES,
  COST_GROUPS,
  ROLE_CODES,
  STATUS_GROUPS,
  UNIT_PRICE_SOURCES,
} from '@nvg/shared';

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

/**
 * Giai đoạn pipeline cơ hội kinh doanh — PRD CRM-02 (nguyên văn):
 * "Tiếp nhận → Xác minh/Phân loại → Khảo sát → Báo giá → Đàm phán → Ký hợp đồng hoặc Mất cơ hội".
 *
 * Thứ tự khai báo chính là thứ tự cột trên bảng Kanban (Webapp Flow 4.5).
 */
export const opportunityStageEnum = pgEnum('opportunity_stage', [
  'tiep_nhan',
  'xac_minh',
  'khao_sat',
  'bao_gia',
  'dam_phan',
  'ky_hop_dong',
  'mat_co_hoi',
]);

/**
 * Phân loại ở bước Xác minh — PRD CRM-02:
 * M1 Lưu trữ · M2 Có nhu cầu thực · M3 Cần báo giá · M4 Chốt–Đàm phán.
 */
export const opportunityClassificationEnum = pgEnum('opportunity_classification', [
  'M1',
  'M2',
  'M3',
  'M4',
]);

/** Mức độ nghiêm trọng của khiếu nại — PRD CRM-08. */
export const complaintSeverityEnum = pgEnum('complaint_severity', ['thap', 'trung_binh', 'cao']);

/** Bước của một gói thầu — PRD DA-01, Webapp Flow 3.2. */
export const biddingStageEnum = pgEnum('bidding_stage', BIDDING_STAGES);

/**
 * Nhóm chi phí — PRD DA-09. Dùng CHUNG cho dòng dự toán và dòng ngân sách thi công,
 * nhờ vậy DA-09 chỉ là ánh xạ một-một chứ không phải quy đổi thủ công.
 */
export const costGroupEnum = pgEnum('cost_group', COST_GROUPS);

/** Nguồn của một dòng đơn giá — PRD DA-05. */
export const unitPriceSourceEnum = pgEnum('unit_price_source', UNIT_PRICE_SOURCES);

/** Chín nhóm hồ sơ dự thầu — PRD DA-08. */
export const bidDocumentCategoryEnum = pgEnum('bid_document_category', BID_DOCUMENT_CATEGORIES);
