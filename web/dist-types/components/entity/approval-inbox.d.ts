/**
 * Hộp thư Phê duyệt — mẫu bố cục 6 (Webapp Flow Mục 4.6).
 *
 * "Dùng cho MỌI loại phê duyệt trong hệ thống (giá dự thầu, hợp đồng, đề nghị thanh toán,
 *  tạm ứng, nghỉ phép...) — GOM VỀ MỘT MẪU DUY NHẤT dù nội dung phê duyệt thuộc module nào."
 *
 * Đây là màn hình giải quyết trực tiếp vướng mắc #6 trong khảo sát ("chờ cấp trên duyệt lâu
 * mới làm tiếp được") bằng cách gom mọi phê duyệt về một nơi thay vì rải rác từng module.
 *
 * Quy tắc bắt buộc:
 *  - Danh sách bên trái sắp theo MỨC ĐỘ KHẨN / thời gian chờ, không phải theo thứ tự tạo.
 *  - Xem nhanh bên phải đủ thông tin để QUYẾT ĐỊNH mà không cần rời Hộp thư; có nút
 *    "Xem đầy đủ hồ sơ" nếu cần xem sâu hơn.
 *  - Sau khi phê duyệt/từ chối, TỰ ĐỘNG chuyển sang hồ sơ tiếp theo — không bắt người duyệt
 *    quay lại danh sách sau mỗi lần xử lý.
 *  - Chỉ hiển thị hồ sơ nằm trong hạn mức của người dùng (mẫu RLS C) — việc lọc do RLS lo,
 *    component này không tự suy diễn quyền.
 */
import { type ReactNode } from 'react';
import { type ApprovalSubject } from '@nvg/shared';
export interface ApprovalItem {
    id: string;
    /** Loại nghiệp vụ — quyết định hạn mức áp dụng (PRD NEN-02). */
    subject: ApprovalSubject;
    code: string;
    title: string;
    /** Người gửi phê duyệt. */
    requestedBy: string;
    requestedAt: string;
    /** Giá trị hồ sơ, đơn vị đồng. `null` với nghiệp vụ không gắn tiền (nghỉ phép). */
    amount: bigint | string | null;
    /** Đường dẫn tới hồ sơ đầy đủ ở module tương ứng. */
    fullRecordPath: string;
    /** Nội dung xem nhanh — đủ để quyết định mà không rời Hộp thư. */
    preview: ReactNode;
}
export interface ApprovalInboxProps {
    items: ApprovalItem[] | undefined;
    isLoading: boolean;
    error?: unknown;
    onRetry?: () => void;
    onDecision: (item: ApprovalItem, decision: 'approved' | 'rejected', note: string) => Promise<void>;
}
export declare function ApprovalInbox({ items, isLoading, error, onRetry, onDecision, }: ApprovalInboxProps): import("react").JSX.Element;
//# sourceMappingURL=approval-inbox.d.ts.map