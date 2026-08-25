/**
 * Màn hình Chi tiết "Hồ sơ 360°" — mẫu bố cục 3, QUAN TRỌNG NHẤT (Webapp Flow Mục 4.3).
 *
 * "Đây là mẫu quan trọng nhất vì là nơi diễn ra phần lớn thao tác và điều hướng liên kết
 * chéo module."
 *
 * Quy tắc bắt buộc:
 *  - Header CỐ ĐỊNH khi cuộn: tên, mã, trạng thái, người chịu trách nhiệm, nút hành động chính.
 *  - Nội dung chia theo TAB — mỗi tab là một khía cạnh của CÙNG MỘT hồ sơ, KHÔNG phải các
 *    trang riêng biệt. Giữ nguyên URL gốc, chỉ đổi tham số `tab` (Webapp Flow 4.3).
 *  - Panel bên PHẢI hiển thị hồ sơ liên quan ở module khác — đây là cách chính để di chuyển
 *    giữa các phần mà không cần quay lại menu (Webapp Flow 5.1).
 *  - Tab "Lịch sử" LUÔN có ở mọi hồ sơ, phục vụ truy vết theo NEN-03 và NEN-07.
 *  - Mọi trường tham chiếu tới hồ sơ khác là LIÊN KẾT BẤM ĐƯỢC, không phải chữ tĩnh
 *    (Webapp Flow 5.2).
 */
import { type ReactNode } from 'react';
import { type StatusGroup } from '@nvg/shared';
import { type Crumb } from '@/components/layout/breadcrumb';
export interface DetailTab {
    /** Định danh trong URL (`?tab=khoi-luong`) — dùng tiếng Việt không dấu. */
    id: string;
    label: string;
    content: ReactNode;
    /** Số hiệu hiển thị cạnh nhãn tab (ví dụ số phiên bản, số chứng từ). */
    badge?: number;
}
/** Một hồ sơ liên quan ở module khác — hiển thị trong panel ngữ cảnh. */
export interface RelatedRecord {
    label: string;
    value: string;
    to?: string;
    /** Trạng thái của hồ sơ liên quan, nếu có. */
    status?: StatusGroup;
}
export interface RelatedGroup {
    title: string;
    records: RelatedRecord[];
}
export interface EntityDetailProps {
    breadcrumbs: Crumb[];
    title: string;
    code: string;
    status: StatusGroup;
    responsiblePerson: string | null;
    deadline?: string | null;
    /** Nút hành động chính (Phê duyệt, Bàn giao, Gửi phê duyệt…). */
    actions?: ReactNode;
    tabs: DetailTab[];
    /**
     * Tab Lịch sử — LUÔN được thêm vào cuối, không cần khai báo trong `tabs`.
     * Truyền `undefined` chỉ khi hồ sơ chưa có bảng lịch sử (hiếm).
     */
    historyContent?: ReactNode;
    /** Hồ sơ liên quan ở module khác — panel ngữ cảnh bên phải (Webapp Flow 5.1). */
    related?: RelatedGroup[];
}
export declare function EntityDetail({ breadcrumbs, title, code, status, responsiblePerson, deadline, actions, tabs, historyContent, related, }: EntityDetailProps): import("react").JSX.Element;
/**
 * Bảng thông tin dạng nhãn – giá trị, dùng trong tab Tổng quan.
 * Nhãn KHÔNG có dấu hai chấm ở cuối (Content Guidelines 4.9).
 */
export declare function DetailFields({ fields, }: {
    fields: {
        label: string;
        value: ReactNode;
    }[];
}): import("react").JSX.Element;
//# sourceMappingURL=entity-detail.d.ts.map