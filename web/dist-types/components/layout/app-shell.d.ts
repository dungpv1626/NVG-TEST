/**
 * App Shell — khung giao diện DUY NHẤT cho cả 12 module (Webapp Flow Mục 2.1).
 *
 * "Người dùng không bao giờ thấy một kiểu giao diện khác khi chuyển module, chỉ có vùng
 * nội dung ở giữa thay đổi."
 *
 * 5 vùng cố định:
 *   1. Sidebar (menu chính, trái)
 *   2. Top bar (tìm kiếm, thông báo, việc cần làm, tài khoản)
 *   3. Breadcrumb (đường dẫn phân cấp)
 *   4. Content area (vùng nội dung chính)
 *   5. Panel ngữ cảnh (phải, chỉ ở màn hình Chi tiết) — bổ sung ở Phase 2/4A
 */
import type { ReactNode } from 'react';
import { type Crumb } from './breadcrumb';
export interface PageHeaderProps {
    title: string;
    description?: string;
    breadcrumbs?: Crumb[];
    actions?: ReactNode;
}
/**
 * Tiêu đề trang — lớp định vị thứ ba cùng với menu tô đậm và breadcrumb (Webapp Flow 6.2).
 * Quy tắc đặt tiêu đề: Content Guidelines 4.8.
 */
export declare function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps): import("react").JSX.Element;
export declare function AppShell(): import("react").JSX.Element;
//# sourceMappingURL=app-shell.d.ts.map