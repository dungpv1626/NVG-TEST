/**
 * Bảng Kanban / Pipeline — mẫu bố cục 5 (Webapp Flow Mục 4.5).
 *
 * "Chỉ dùng cho các quy trình có SỐ LƯỢNG TRẠNG THÁI CỐ ĐỊNH và người dùng cần nhìn tổng quan
 *  phân bổ — các quy trình phê duyệt tuần tự dùng mẫu Hộp thư Phê duyệt thay vì Kanban."
 *
 * Kéo–thả để chuyển trạng thái, hoặc bấm vào thẻ để mở Chi tiết.
 *
 * Dùng HTML Drag and Drop có sẵn của trình duyệt thay vì thư viện kéo–thả:
 * đủ cho nhu cầu ở đây, không thêm phụ thuộc, và hoạt động với bàn phím qua nút chuyển
 * trạng thái trên từng thẻ (khả năng tiếp cận — Content Guidelines 6.8: kéo–thả KHÔNG
 * được là cách duy nhất để thực hiện một thao tác).
 */
import { type ReactNode } from 'react';
import { type MoneyValue } from '@nvg/shared';
export interface KanbanColumn {
    id: string;
    label: string;
    description?: string;
    /** Cột kết thúc quy trình — thẻ ở đây không kéo đi tiếp được. */
    isTerminal?: boolean;
}
export interface KanbanCard {
    id: string;
    columnId: string;
    title: string;
    code: string;
    /** Người chịu trách nhiệm — một trong ba thông tin luôn hiển thị (Webapp Flow 1.3). */
    responsiblePerson: string | null;
    deadline: string | null;
    amount: MoneyValue | null;
    detailPath: string;
    /** Nhãn phụ, ví dụ phân loại M1–M4 hoặc tên khách hàng. */
    subtitle?: string | null;
}
export interface KanbanBoardProps {
    columns: KanbanColumn[];
    cards: KanbanCard[] | undefined;
    isLoading: boolean;
    error?: unknown;
    onRetry?: () => void;
    /** Gọi khi thẻ được chuyển sang cột khác. Trả về `false` để hủy (ví dụ người dùng bấm Hủy). */
    onMove: (card: KanbanCard, toColumnId: string) => Promise<boolean | void>;
    /** `false` khi người dùng không có quyền sửa — thẻ vẫn xem được nhưng không kéo được. */
    canMove?: boolean;
    emptyMessage: string;
    emptyAction?: ReactNode;
}
export declare function KanbanBoard({ columns, cards, isLoading, error, onRetry, onMove, canMove, emptyMessage, emptyAction, }: KanbanBoardProps): import("react").JSX.Element;
//# sourceMappingURL=kanban-board.d.ts.map