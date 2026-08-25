/**
 * Báo giá gửi khách hàng (PRD CRM-04, CRM-05).
 *
 * Mọi thao tác đổi trạng thái đều gọi hàm CSDL thay vì UPDATE trực tiếp. Không phải để cho
 * "đẹp kiến trúc": policy chỉ cho sửa báo giá còn NHÁP, nên gửi duyệt, gửi khách và ghi nhận
 * phản hồi buộc phải đi qua hàm có kiểm tra — quy tắc nghiệp vụ nằm cùng một chỗ với dữ liệu,
 * không thể lách bằng cách gọi thẳng API (Tech Stack 3.2, 3.3).
 */
import type { MoneyValue, StatusGroup } from '@nvg/shared';
export interface QuoteRecord {
    id: string;
    code: string;
    version: number;
    is_current_version: boolean;
    /** Đơn vị đồng. */
    total_value: MoneyValue | null;
    discount_amount: MoneyValue | null;
    discount_reason: string | null;
    status: StatusGroup;
    sent_to_customer_at: string | null;
    customer_response: string | null;
    responded_at: string | null;
    valid_until: string | null;
    notes: string | null;
    created_at: string;
    created_by_user: {
        full_name: string;
    } | null;
}
/** Danh sách phiên bản báo giá của một cơ hội — mới nhất trước (NEN-05). */
export declare function useQuotes(opportunityId: string | undefined): import("@tanstack/react-query").UseQueryResult<QuoteRecord[], Error>;
export interface NewQuoteInput {
    opportunityId: string;
    companyId: string;
    totalValue: string;
    discountAmount: string | null;
    discountReason: string | null;
    validUntil: string | null;
    notes: string | null;
}
/**
 * Tạo phiên bản báo giá mới.
 *
 * KHÔNG truyền `version`, `code` hay `is_current_version`: trigger `quotes_assign_version`
 * cấp số phiên bản, sinh mã và hạ cờ "đang hiệu lực" của bản cũ trong cùng một thao tác.
 * Để trình duyệt tự tính sẽ trùng số khi hai người soạn cùng lúc.
 */
export declare function useCreateQuoteVersion(): import("@tanstack/react-query").UseMutationResult<{
    id: string;
}, Error, NewQuoteInput, unknown>;
/** Gửi phê duyệt nội bộ — bắt buộc trước khi gửi khách hàng (CRM-04). */
export declare function useRequestQuoteApproval(): import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
/** Đánh dấu đã gửi khách hàng. Hàm CSDL chặn nếu chưa qua phê duyệt nội bộ. */
export declare function useSendQuote(): import("@tanstack/react-query").UseMutationResult<void, Error, string, unknown>;
/** Ghi nhận phản hồi của khách hàng với phiên bản đã gửi (CRM-04). */
export declare function useRecordQuoteResponse(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    quoteId: string;
    response: string;
}, unknown>;
//# sourceMappingURL=use-quotes.d.ts.map