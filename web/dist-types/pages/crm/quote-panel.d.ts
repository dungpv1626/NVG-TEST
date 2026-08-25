/**
 * Tab Báo giá của Chi tiết Cơ hội (PRD CRM-04, CRM-05).
 *
 * Hiển thị TOÀN BỘ các phiên bản, không chỉ bản đang hiệu lực: CRM-04 yêu cầu "theo dõi CÁC
 * PHIÊN BẢN báo giá/phương án ĐÃ GỬI khách hàng và phản hồi" — biết đã chào khách mức nào,
 * khách trả lời ra sao, mới hiểu vì sao chốt ở mức hiện tại.
 *
 * Các nút hành động ở đây đều là `secondary`: hành động chính duy nhất của màn hình Chi tiết
 * Cơ hội là nút chuyển giai đoạn trên header (Content Guidelines 6.3).
 */
export declare function QuotePanel({ opportunityId, canEdit, isHandedOver, }: {
    opportunityId: string;
    canEdit: boolean;
    isHandedOver: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=quote-panel.d.ts.map