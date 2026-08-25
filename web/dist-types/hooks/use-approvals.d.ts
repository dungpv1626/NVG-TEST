/**
 * Hồ sơ chờ phê duyệt — nguồn dữ liệu cho Hộp thư Phê duyệt (Webapp Flow 4.6).
 *
 * KHÔNG lọc theo hạn mức ở đây. RLS Mẫu C đã lọc ở tầng CSDL: truy vấn này chỉ trả về hồ sơ
 * người dùng thực sự duyệt được, hoặc hồ sơ chính họ gửi đi. Nếu lọc thêm ở trình duyệt thì
 * quy tắc phân quyền tồn tại ở hai nơi và sớm muộn sẽ lệch nhau.
 *
 * Cũng KHÔNG lọc theo pháp nhân đang chọn: Webapp Flow 3.6 yêu cầu Hộp thư gom "toàn bộ việc
 * chờ duyệt từ mọi module" về một nơi, và khối Back Office (Tài chính, Kế toán) duyệt xuyên
 * pháp nhân theo PRD Mục 1.1. Pháp nhân của từng hồ sơ hiển thị ngay trong phần xem nhanh.
 */
import type { ApprovalSubject, MoneyValue } from '@nvg/shared';
export interface PendingApproval {
    id: string;
    subject: ApprovalSubject;
    entity_type: string;
    entity_id: string;
    entity_code: string | null;
    title: string;
    /** Đơn vị đồng. `null` với nghiệp vụ không gắn tiền (nghỉ phép). */
    amount: MoneyValue | null;
    reason: string | null;
    requested_at: string;
    requested_by_name: string | null;
    company_code: string | null;
    company_name: string | null;
    /**
     * Hồ sơ CHA để mở màn hình đầy đủ — báo giá không có trang riêng, nó là một tab của Chi
     * tiết Cơ hội. Hàm CSDL giải sẵn để Hộp thư chỉ cần một lượt gọi.
     */
    parent_id: string | null;
}
/**
 * Hồ sơ người dùng THỰC SỰ XỬ LÝ ĐƯỢC — không phải mọi hồ sơ họ nhìn thấy.
 *
 * Hai thứ khác nhau: người gửi phê duyệt vẫn XEM được hồ sơ mình gửi (để biết đang nằm ở
 * ai), nhưng đó không phải việc của họ. Truy vấn thẳng bảng `approvals` sẽ trả về cả hai
 * nhóm và huy hiệu "Việc cần làm" đếm nhầm — lỗi đã gặp thật khi chạy thử.
 */
export declare function usePendingApprovals(): import("@tanstack/react-query").UseQueryResult<PendingApproval[], Error>;
export declare function useDecideApproval(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    approvalId: string;
    decision: "approved" | "rejected";
    note: string;
}, unknown>;
export interface ApprovalHistoryEntry {
    id: string;
    entity_id: string;
    subject: ApprovalSubject;
    title: string;
    amount: MoneyValue | null;
    reason: string | null;
    final_decision: 'approved' | 'rejected' | null;
    requested_at: string;
    decided_at: string | null;
    requested_by_user: {
        full_name: string;
    } | null;
    decisions: {
        id: string;
        decision: 'approved' | 'rejected';
        note: string | null;
        decided_at: string;
        approver_unlimited: boolean;
        approver_limit_at_time: MoneyValue | null;
        decided_by_user: {
            full_name: string;
        } | null;
    }[];
}
/**
 * Lịch sử phê duyệt của một nhóm hồ sơ — CRM-05: "ghi lại lịch sử phê duyệt giá đặc biệt".
 *
 * Nhận NHIỀU id một lần thay vì gọi từng hồ sơ: một cơ hội có thể có vài phiên bản báo giá,
 * mở tab Báo giá mà bắn 5 truy vấn song song là lãng phí không cần thiết.
 *
 * Dòng nào người dùng không được xem sẽ bị RLS loại bỏ, nên kết quả có thể rỗng với người
 * không liên quan — đó là hành vi đúng của Mẫu C, không phải lỗi tải dữ liệu.
 */
export declare function useApprovalHistory(entityType: string, entityIds: string[]): import("@tanstack/react-query").UseQueryResult<Map<string, ApprovalHistoryEntry[]>, Error>;
//# sourceMappingURL=use-approvals.d.ts.map