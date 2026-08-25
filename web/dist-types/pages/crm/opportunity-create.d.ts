/**
 * Tạo cơ hội kinh doanh mới (CRM-01, CRM-02).
 *
 * Cơ hội là bảng GIAO DỊCH nên phải gắn `company_id` của pháp nhân đang chọn (NEN-01) —
 * hook `useCreateEntity` tự gắn.
 *
 * Khách hàng chọn từ danh mục đã có, KHÔNG nhập lại tên khách hàng ở đây:
 * PRD Mục 2.3 — "mỗi nghiệp vụ chỉ nhập một lần tại nơi phát sinh; các bộ phận liên quan
 * sử dụng lại, không nhập trùng".
 */
export declare function OpportunityCreatePage(): import("react").JSX.Element;
//# sourceMappingURL=opportunity-create.d.ts.map