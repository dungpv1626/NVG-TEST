/**
 * Màn hình Danh sách — mẫu bố cục 2 (Webapp Flow Mục 4.2).
 *
 * Thay thế ~20 màn hình Danh sách của 12 module. Quy tắc bắt buộc từ tài liệu:
 *
 *  - Cột đầu tiên LUÔN là mã/tên hồ sơ, bấm để mở Chi tiết.
 *  - Ba cột cố định luôn hiển thị: NGƯỜI CHỊU TRÁCH NHIỆM, TRẠNG THÁI (có màu), THỜI HẠN
 *    (Webapp Flow 1.3 — "ba thông tin này xuất hiện ở vị trí cố định trên mọi màn hình").
 *  - Bộ lọc và tìm kiếm ở đầu bảng; trạng thái lọc được GIỮ LẠI khi quay lại từ Chi tiết
 *    (Webapp Flow 4.2 — "không mất bộ lọc khi bấm Back"). Lưu vào query string để hoạt động
 *    cả khi mở tab mới hoặc chia sẻ đường dẫn.
 *  - Hành động hàng loạt khi chọn nhiều dòng.
 *  - Trạng thái rỗng LUÔN kèm nút hành động gợi ý, không để trang trắng.
 */
import { type ReactNode } from 'react';
import { type StatusGroup } from '@nvg/shared';
/** Bản ghi tối thiểu mà mọi danh sách phải cung cấp. */
export interface EntityRow {
    id: string;
    /** Mã hồ sơ hiển thị (ví dụ `NVC-DA-2026-0001`) hoặc tên nếu chưa có mã. */
    code: string;
    title: string;
    /** Người chịu trách nhiệm — thuật ngữ chuẩn, Content Guidelines 4.4. */
    responsiblePerson: string | null;
    status: StatusGroup;
    deadline: string | null;
}
export interface EntityColumn<T extends EntityRow> {
    key: string;
    header: string;
    render: (row: T) => ReactNode;
    /** Căn phải cho cột số/tiền — dễ so sánh theo cột. */
    numeric?: boolean;
}
export interface EntityTableProps<T extends EntityRow> {
    rows: T[] | undefined;
    isLoading: boolean;
    error?: unknown;
    onRetry?: () => void;
    /** Đường dẫn tới trang Chi tiết của một dòng. */
    detailPath: (row: T) => string;
    /** Cột bổ sung riêng của module, chèn giữa cột tên và ba cột cố định. */
    columns?: EntityColumn<T>[];
    /** Nội dung trạng thái rỗng — lấy từ `MODULE_EMPTY_STATES` trong `@nvg/shared`. */
    emptyMessage: string;
    emptyAction?: ReactNode;
    searchPlaceholder?: string;
    /** Bộ lọc bổ sung hiển thị cạnh ô tìm kiếm. */
    filters?: ReactNode;
    /** Bật chọn nhiều dòng để thao tác hàng loạt (Webapp Flow 4.2). */
    selection?: {
        selectedIds: string[];
        onChange: (ids: string[]) => void;
        actions: ReactNode;
    };
}
export declare function EntityTable<T extends EntityRow>({ rows, isLoading, error, onRetry, detailPath, columns, emptyMessage, emptyAction, searchPlaceholder, filters, selection, }: EntityTableProps<T>): import("react").JSX.Element;
/** Nút tạo mới — đặt ở `emptyAction` và ở header trang. */
export declare function CreateButton({ label, to }: {
    label: string;
    to: string;
}): import("react").JSX.Element;
//# sourceMappingURL=entity-table.d.ts.map