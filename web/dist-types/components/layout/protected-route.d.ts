/**
 * Chặn truy cập khi chưa đăng nhập.
 *
 * Trong lúc còn đang khôi phục phiên (`loading`) thì hiển thị khung xám placeholder,
 * KHÔNG dùng vòng xoay toàn màn hình gây cảm giác treo máy (Webapp Flow 6.7).
 * Cũng không được chuyển hướng vội về trang đăng nhập trong lúc chờ — người dùng đã
 * đăng nhập sẽ bị đá ra oan mỗi lần tải lại trang.
 */
import type { ReactNode } from 'react';
export declare function ProtectedRoute({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=protected-route.d.ts.map