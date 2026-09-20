/**
 * Kiểu liệt kê (enum) dùng chung ở tầng CSDL.
 *
 * Giá trị lấy trực tiếp từ `@nvg/shared` để chỉ có MỘT nguồn chân lý:
 * thêm/sửa trạng thái ở `shared` sẽ buộc phải sinh migration tương ứng —
 * đúng tinh thần "một khái niệm chỉ có một bảng/định nghĩa sở hữu" (Backend Schema 2.3).
 */

import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ACCOUNTING_PERIOD_STATUSES,
  ASSET_CONDITIONS,
  ASSET_EVENT_TYPES,
  ATTENDANCE_KINDS,
  CANDIDATE_STAGES,
  CHECKLIST_ITEM_GROUPS,
  CHECKLIST_KINDS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_CONTRACT_STATUSES,
  EMPLOYMENT_CONTRACT_TYPES,
  HR_DOCUMENT_TYPES,
  INSURANCE_STATUSES,
  LABOR_WORKER_STATUSES,
  LEAVE_REQUEST_STATUSES,
  LEAVE_TYPES,
  PAYROLL_ADJUSTMENT_KINDS,
  RECRUITMENT_POSITION_STATUSES,
  SALARY_TYPES,
  TIMESHEET_PERIOD_STATUSES,
  WORK_BLOCKS,
  ADVANCE_STATUSES,
  CASH_FLOW_PERIOD_TYPES,
  PARTY_TYPES,
  PAYMENT_CHECK_STEPS,
  PAYMENT_METHODS,
  PAYMENT_REQUEST_STAGES,
  PAYMENT_REQUEST_TYPES,
  RECEIVABLE_DIRECTIONS,
  AMENDMENT_STAGES,
  ASSET_LOCATION_TYPES,
  SCAFFOLDING_CONDITIONS,
  SCAFFOLDING_EVENT_TYPES,
  STOCKTAKE_STATUSES,
  STOCK_ISSUE_REASONS,
  STOCK_MOVEMENT_TYPES,
  WAREHOUSE_TYPES,
  DELIVERY_ISSUE_TYPES,
  PURCHASE_ORDER_STAGES,
  PURCHASE_REQUEST_STAGES,
  PURCHASE_URGENCIES,
  QUOTATION_STATUSES,
  SUPPLIER_CLASSES,
  PRODUCTION_ORDER_STATUSES,
  RENTAL_AGREEMENT_STATUSES,
  APPROVAL_SUBJECTS,
  BIDDING_STAGES,
  BID_DOCUMENT_CATEGORIES,
  CHANGE_REQUEST_ORIGINS,
  CHANGE_REQUEST_STATUSES,
  CONTRACT_SOURCE_TYPES,
  CONTRACT_STAGES,
  CONTRACT_TERM_TYPES,
  CONTRACT_TYPES,
  COST_GROUPS,
  DESIGN_DISCIPLINES,
  DESIGN_REVIEWER_TYPES,
  DESIGN_REVIEW_DECISIONS,
  DESIGN_STAGES,
  DISCIPLINE_TASK_STATUSES,
  ROLE_CODES,
  STATUS_GROUPS,
  UNIT_PRICE_SOURCES,
  ACCEPTANCE_STATUSES,
  ACCEPTANCE_TYPES,
  SITE_LOG_TYPES,
  SITE_STAGES,
  SUBCONTRACTOR_STATUSES,
  SUBCONTRACT_FORMS,
  WARRANTY_CLAIM_STATUSES,
  WARRANTY_STATUSES,
} from '@nvg/shared';

/**
 * 6 nhóm trạng thái chuẩn — Content Guidelines v1.2 5.1, Webapp Flow v1.1 5.5, Backend Schema v1.1 1.4.
 * Module có trạng thái con riêng vẫn phải quy về một trong 6 giá trị này khi hiển thị.
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

/** Bộ môn thiết kế + bước phương án kiến trúc — PRD TK-03, TK-04, TK-05. */
export const designDisciplineEnum = pgEnum('design_discipline', DESIGN_DISCIPLINES);

/** Bước của một dự án thiết kế — Webapp Flow 3.3. */
export const designStageEnum = pgEnum('design_stage', DESIGN_STAGES);

/** Tiến độ từng bộ môn — PRD TK-04. */
export const disciplineTaskStatusEnum = pgEnum('discipline_task_status', DISCIPLINE_TASK_STATUSES);

/** Kết luận của một vòng góp ý trên phiên bản thiết kế — PRD TK-03. */
export const designReviewDecisionEnum = pgEnum('design_review_decision', DESIGN_REVIEW_DECISIONS);

/** Người góp ý là khách hàng hay nội bộ — PRD TK-03. */
export const designReviewerTypeEnum = pgEnum('design_reviewer_type', DESIGN_REVIEWER_TYPES);

/** Trạng thái xử lý một yêu cầu thay đổi thiết kế — PRD TK-06. */
export const changeRequestStatusEnum = pgEnum('change_request_status', CHANGE_REQUEST_STATUSES);

/** Nguồn phát sinh yêu cầu thay đổi — PRD TK-06. */
export const changeRequestOriginEnum = pgEnum('change_request_origin', CHANGE_REQUEST_ORIGINS);

/** Bốn loại hợp đồng — PRD HD-01. */
export const contractTypeEnum = pgEnum('contract_type', CONTRACT_TYPES);

/** Vòng đời hợp đồng — PRD HD-01, HD-05. */
export const contractStageEnum = pgEnum('contract_stage', CONTRACT_STAGES);

/** Hồ sơ nguồn sinh ra hợp đồng — Backend Schema 4.5 (`source_type`). */
export const contractSourceTypeEnum = pgEnum('contract_source_type', CONTRACT_SOURCE_TYPES);

/** Tám nhóm điều khoản phải theo dõi — PRD HD-02. */
export const contractTermTypeEnum = pgEnum('contract_term_type', CONTRACT_TERM_TYPES);

/** Trạng thái xử lý một phát sinh ngoài hợp đồng — PRD HD-04. */
export const amendmentStageEnum = pgEnum('amendment_stage', AMENDMENT_STAGES);

/**
 * Module TC — Thi công và Ngân sách công trình.
 *
 * ⚠️ Enum dưới đây phủ phạm vi TC CŨ (TC-01 → TC-08). Phiếu khảo sát Chỉ huy – Giám sát công
 * trường đã có (02/09/2026); chỗ nào khảo sát không trả lời vẫn giữ dấu `SUY LUẬN`. Xem lý
 * do từng danh sách ở `@nvg/shared/tc`.
 */

/** Vòng đời một công trình — SUY LUẬN từ trình tự TC-01 → TC-07. */
export const siteStageEnum = pgEnum('site_stage', SITE_STAGES);

/** Loại mục nhật ký công trường — PRD TC-02, TC-08. */
export const siteLogTypeEnum = pgEnum('site_log_type', SITE_LOG_TYPES);

/** Ba loại nghiệm thu — PRD TC-04. Chỉ `khach_hang` mới là căn cứ thu tiền. */
export const acceptanceTypeEnum = pgEnum('acceptance_type', ACCEPTANCE_TYPES);

/** Trạng thái một biên bản nghiệm thu. */
export const acceptanceStatusEnum = pgEnum('acceptance_status', ACCEPTANCE_STATUSES);

/** Hình thức giao khoán tổ đội — PRD TC-06 ("hợp đồng hoặc đơn giá khoán"). */
export const subcontractFormEnum = pgEnum('subcontract_form', SUBCONTRACT_FORMS);

/** Trạng thái làm việc của tổ đội tại công trình — PRD TC-06. */
export const subcontractorStatusEnum = pgEnum('subcontractor_status', SUBCONTRACTOR_STATUSES);

/** Trạng thái bảo hành của một hạng mục — PRD TC-07. */
export const warrantyStatusEnum = pgEnum('warranty_status', WARRANTY_STATUSES);

/** Trạng thái xử lý một phản ánh bảo hành — PRD TC-07. */
export const warrantyClaimStatusEnum = pgEnum('warranty_claim_status', WARRANTY_CLAIM_STATUSES);

/**
 * Module MH — Mua hàng và Vật tư (Backend Schema 4.7).
 *
 * Khác TC, module này CÓ khảo sát trực tiếp từ Phòng Mua hàng – Vật tư (PRD Mục 3), nên
 * các danh sách dưới đây bám câu chữ PRD. Lý do từng giá trị xem `@nvg/shared/mh`.
 */

/** Phân loại nhà cung cấp — PRD MH-03. */
export const supplierClassEnum = pgEnum('supplier_class', SUPPLIER_CLASSES);

/** Vòng đời một đề nghị mua — PRD MH-01 → MH-06. */
export const purchaseRequestStageEnum = pgEnum('purchase_request_stage', PURCHASE_REQUEST_STAGES);

/** Mức cấp bách của đề nghị mua — cách đọc nhanh cột "thời điểm cần" của MH-01. */
export const purchaseUrgencyEnum = pgEnum('purchase_urgency', PURCHASE_URGENCIES);

/** Trạng thái một báo giá trong bảng so sánh — PRD MH-04. */
export const quotationStatusEnum = pgEnum('quotation_status', QUOTATION_STATUSES);

/** Vòng đời một đơn đặt hàng — PRD MH-06. */
export const purchaseOrderStageEnum = pgEnum('purchase_order_stage', PURCHASE_ORDER_STAGES);

/** Ba trường hợp hàng không đạt khi giao nhận — PRD MH-07. */
export const deliveryIssueTypeEnum = pgEnum('delivery_issue_type', DELIVERY_ISSUE_TYPES);

/**
 * Module KHO — Quản lý Kho (Backend Schema 4.8).
 *
 * Bộ phận Kho CÓ khảo sát trực tiếp (PRD Mục 3) nên các danh sách này bám câu chữ PRD.
 * Lý do từng giá trị xem `@nvg/shared/kho`.
 */

/** Năm loại kho — PRD KHO-01. */
export const warehouseTypeEnum = pgEnum('warehouse_type', WAREHOUSE_TYPES);

/** Bốn loại phiếu kho — PRD KHO-03 → KHO-07. */
export const stockMovementTypeEnum = pgEnum('stock_movement_type', STOCK_MOVEMENT_TYPES);

/** Lý do xuất kho — SUY LUẬN từ ba nơi tiêu vật tư mà tài liệu có nhắc. */
export const stockIssueReasonEnum = pgEnum('stock_issue_reason', STOCK_ISSUE_REASONS);

/** Trạng thái một đợt kiểm kê — PRD KHO-07. */
export const stocktakeStatusEnum = pgEnum('stocktake_status', STOCKTAKE_STATUSES);

/** Bốn tình trạng giàn giáo — PRD KHO-06. */
export const scaffoldingConditionEnum = pgEnum('scaffolding_condition', SCAFFOLDING_CONDITIONS);

/** Ba loại biên bản riêng của giàn giáo — PRD KHO-06. */
export const scaffoldingEventTypeEnum = pgEnum('scaffolding_event_type', SCAFFOLDING_EVENT_TYPES);

/** Nơi một lô giàn giáo đang nằm — PRD KHO-06. */
export const assetLocationTypeEnum = pgEnum('asset_location_type', ASSET_LOCATION_TYPES);

/**
 * Module KT — Kế toán và Tài chính (Backend Schema 4.9).
 *
 * Bộ phận Kế toán – Tài chính CÓ khảo sát trực tiếp (PRD Mục 3: Trưởng Tài chính, phụ trách
 * Kế toán, Kế toán nội bộ) nên các danh sách này bám câu chữ PRD. Lý do từng giá trị xem
 * `@nvg/shared/kt`.
 */

/** Ba loại đề nghị chi tiền — PRD KT-01 "thanh toán/tạm ứng – hoàn ứng". */
export const paymentRequestTypeEnum = pgEnum('payment_request_type', PAYMENT_REQUEST_TYPES);

/** Tám bước xử lý của một đề nghị chi, cộng hai kết cục đóng hồ sơ — PRD KT-01. */
export const paymentRequestStageEnum = pgEnum('payment_request_stage', PAYMENT_REQUEST_STAGES);

/** Ba bước KIỂM TRA tuần tự trước khi vào Hộp thư Phê duyệt — PRD KT-01. */
export const paymentCheckStepEnum = pgEnum('payment_check_step', PAYMENT_CHECK_STEPS);

/** Hình thức chi — PRD KT-01 "lập phiếu chi/ủy nhiệm chi". */
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);

/** Trạng thái một khoản đã ứng — PRD KT-03. Quá hạn là trạng thái SUY RA, không lưu. */
export const advanceStatusEnum = pgEnum('advance_status', ADVANCE_STATUSES);

/** Hai chiều công nợ — PRD KT-04. */
export const receivableDirectionEnum = pgEnum('receivable_direction', RECEIVABLE_DIRECTIONS);

/** Đối tượng công nợ — PRD KT-04 "theo khách hàng/nhà cung cấp". */
export const partyTypeEnum = pgEnum('party_type', PARTY_TYPES);

/** Kỳ kế hoạch dòng tiền — PRD KT-06 "theo tuần/tháng". */
export const cashFlowPeriodTypeEnum = pgEnum('cash_flow_period_type', CASH_FLOW_PERIOD_TYPES);

/** Trạng thái khóa kỳ kế toán — PRD KT-09. */
export const accountingPeriodStatusEnum = pgEnum(
  'accounting_period_status',
  ACCOUNTING_PERIOD_STATUSES,
);

/**
 * Module NS — Hành chính và Nhân sự (Backend Schema 4.10).
 *
 * Phòng Hành chính – Nhân sự CÓ khảo sát trực tiếp (PRD Mục 3) nên các danh sách này bám
 * câu chữ PRD NS-01 → NS-11. Lý do từng giá trị xem `@nvg/shared/ns`.
 */

/** Ba khối lao động, khác nhau ở CÁCH chấm công — PRD NS-04. */
export const workBlockEnum = pgEnum('work_block', WORK_BLOCKS);

/** Tình trạng làm việc của một nhân sự — PRD NS-01, NS-03. */
export const employeeStatusEnum = pgEnum('employee_status', EMPLOYEE_STATUSES);

/** Bốn hình thức trả lương — PRD NS-06. Chỉ phân loại, KHÔNG kèm công thức. */
export const salaryTypeEnum = pgEnum('salary_type', SALARY_TYPES);

/** Loại hợp đồng lao động — PRD NS-07. */
export const employmentContractTypeEnum = pgEnum(
  'employment_contract_type',
  EMPLOYMENT_CONTRACT_TYPES,
);

/** Trạng thái một hợp đồng lao động — PRD NS-07. */
export const employmentContractStatusEnum = pgEnum(
  'employment_contract_status',
  EMPLOYMENT_CONTRACT_STATUSES,
);

/** Tình trạng tham gia bảo hiểm bắt buộc — PRD NS-07 "theo dõi tăng – giảm". */
export const insuranceStatusEnum = pgEnum('insurance_status', INSURANCE_STATUSES);

/** Loại giấy tờ có thời hạn — PRD NS-10, dùng chung cho nhân sự và lao động thời vụ NS-09. */
export const hrDocumentTypeEnum = pgEnum('hr_document_type', HR_DOCUMENT_TYPES);

/** Vòng đời một kỳ chấm công — PRD NS-04. */
export const timesheetPeriodStatusEnum = pgEnum(
  'timesheet_period_status',
  TIMESHEET_PERIOD_STATUSES,
);

/** Loại công của một ngày — PRD NS-04, NS-05. */
export const attendanceKindEnum = pgEnum('attendance_kind', ATTENDANCE_KINDS);

/** Loại nghỉ phép — PRD NS-05. */
export const leaveTypeEnum = pgEnum('leave_type', LEAVE_TYPES);

/** Trạng thái một đơn nghỉ phép — PRD NS-05. */
export const leaveRequestStatusEnum = pgEnum('leave_request_status', LEAVE_REQUEST_STATUSES);

/** Thưởng hay phạt — PRD NS-05. */
export const payrollAdjustmentKindEnum = pgEnum(
  'payroll_adjustment_kind',
  PAYROLL_ADJUSTMENT_KINDS,
);

/** Vòng đời một yêu cầu tuyển dụng — PRD NS-02. */
export const recruitmentPositionStatusEnum = pgEnum(
  'recruitment_position_status',
  RECRUITMENT_POSITION_STATUSES,
);

/** Cột Kanban của màn hình Tuyển dụng — PRD NS-02, Webapp Flow Mục 7. */
export const candidateStageEnum = pgEnum('candidate_stage', CANDIDATE_STAGES);

/** Tình trạng một tài sản, công cụ dụng cụ — PRD NS-08. */
export const assetConditionEnum = pgEnum('asset_condition', ASSET_CONDITIONS);

/** Năm loại biên bản tài sản — PRD NS-08. */
export const assetEventTypeEnum = pgEnum('asset_event_type', ASSET_EVENT_TYPES);

/** Hai chiều của checklist: tiếp nhận (NS-03) và bàn giao nghỉ việc (NS-11). */
export const checklistKindEnum = pgEnum('checklist_kind', CHECKLIST_KINDS);

/** Bốn nhóm việc trong một checklist — PRD NS-03, NS-11. */
export const checklistItemGroupEnum = pgEnum('checklist_item_group', CHECKLIST_ITEM_GROUPS);

/** Tình trạng một lao động thời vụ tại công trường — PRD NS-09. */
export const laborWorkerStatusEnum = pgEnum('labor_worker_status', LABOR_WORKER_STATUSES);

/**
 * Module SX — Sản xuất và Cho thuê giàn giáo (Backend Schema 4.12).
 *
 * Phủ phạm vi SX CŨ (SX-01 → SX-03), không trùng SX-01 → SX-22 của PRD v1.4. Phiếu khảo sát
 * Xưởng đã có (02/09/2026); phần còn thiếu chặn bởi dữ liệu, xem câu hỏi #28 của
 * `BUILD_PLAN.md`. Lý do từng giá trị xem `@nvg/shared/sx`.
 */

/** Vòng đời một lệnh sản xuất — PRD SX-01 theo số cũ, mới ở mức khung. */
export const productionOrderStatusEnum = pgEnum(
  'production_order_status',
  PRODUCTION_ORDER_STATUSES,
);

/** Vòng đời một hợp đồng cho thuê giàn giáo — PRD SX-03. */
export const rentalAgreementStatusEnum = pgEnum(
  'rental_agreement_status',
  RENTAL_AGREEMENT_STATUSES,
);
