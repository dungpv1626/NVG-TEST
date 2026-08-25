/**
 * Trạng thái rỗng, đang tải, lỗi — Webapp Flow Mục 6.7 và Content Guidelines 4.7.
 *
 * Ba quy tắc bắt buộc:
 *  1. Trạng thái RỖNG: giải thích ngắn gọn tình trạng + gợi ý hành động tiếp theo.
 *     Không để khoảng trắng trơ trọi. Luôn kèm nút thao tác nếu người dùng có quyền tạo.
 *  2. Trạng thái ĐANG TẢI: dùng khung xám placeholder (skeleton) ĐÚNG HÌNH DẠNG nội dung
 *     sắp hiện — KHÔNG dùng vòng xoay toàn màn hình, vì nó gây cảm giác treo máy.
 *  3. Trạng thái LỖI: nói bằng ngôn ngữ nghiệp vụ, KHÔNG hiện mã lỗi kỹ thuật;
 *     luôn có nút thử lại hoặc lối quay lại an toàn.
 */
import type { ReactNode } from 'react';
export declare function EmptyState({ message, action, icon, }: {
    message: string;
    action?: ReactNode;
    icon?: ReactNode;
}): import("react").JSX.Element;
/**
 * Trạng thái lỗi.
 *
 * `message` phải là ngôn ngữ nghiệp vụ (dùng mẫu ở `@nvg/shared/content` ERRORS).
 * `technicalDetail` chỉ để ghi log, KHÔNG hiển thị cho người dùng (Content Guidelines 4.6).
 */
export declare function ErrorState({ message, onRetry, technicalDetail, }: {
    message: string;
    onRetry?: () => void;
    technicalDetail?: string;
}): import("react").JSX.Element;
/** Khối xám cơ bản. Không dùng trực tiếp — dùng các skeleton có hình dạng bên dưới. */
export declare function Skeleton({ className }: {
    className?: string;
}): import("react").JSX.Element;
/** Skeleton hình dạng BẢNG — khớp bố cục `EntityTable` để không nhảy layout khi có dữ liệu. */
export declare function TableSkeleton({ rows, columns }: {
    rows?: number;
    columns?: number;
}): import("react").JSX.Element;
/** Skeleton hình dạng LƯỚI THẺ — dùng cho màn hình Dashboard. */
export declare function CardGridSkeleton({ count }: {
    count?: number;
}): import("react").JSX.Element;
//# sourceMappingURL=states.d.ts.map