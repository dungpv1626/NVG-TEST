/**
 * Phiên đăng nhập và hồ sơ quyền của người dùng.
 *
 * Backend Schema Mục 3.1: hệ thống nội bộ, KHÔNG có luồng tự đăng ký công khai —
 * tài khoản do quản trị viên cấp. Vì vậy ở đây chỉ có đăng nhập, quên mật khẩu,
 * đăng xuất; không có màn hình đăng ký.
 *
 * ⚠️ Dữ liệu quyền lấy về ở đây CHỈ để quyết định hiển thị (ẩn menu/nút — Webapp Flow 6.5).
 * Nó KHÔNG phải hàng rào bảo mật: hàng rào thật là RLS trong cơ sở dữ liệu. Người dùng
 * sửa state trong trình duyệt vẫn không đọc/ghi được gì ngoài phạm vi quyền.
 */
import type { Session } from '@supabase/supabase-js';
import { type ReactNode } from 'react';
import type { CompanyCode, ModuleCode, RoleCode } from '@nvg/shared';
export interface CompanyAssignment {
    companyId: string;
    companyCode: CompanyCode;
    companyShortName: string;
    roleCode: RoleCode;
    roleLabel: string;
    seesAllCompanies: boolean;
    defaultRoute: string | null;
    isPrimary: boolean;
}
export interface ModulePermission {
    moduleCode: ModuleCode;
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
}
export interface UserProfile {
    id: string;
    email: string;
    fullName: string;
    jobTitle: string | null;
    department: string | null;
    assignments: CompanyAssignment[];
    permissions: ModulePermission[];
    /** Xem được dữ liệu của mọi pháp nhân — chỉ vai trò cấp tập đoàn. */
    seesAllCompanies: boolean;
}
interface AuthState {
    session: Session | null;
    profile: UserProfile | null;
    /** `true` trong lúc khôi phục phiên hoặc tải hồ sơ — chưa biết đã đăng nhập hay chưa. */
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{
        error: string | null;
    }>;
    signOut: () => Promise<void>;
    requestPasswordReset: (email: string) => Promise<{
        error: string | null;
    }>;
}
export declare function AuthProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useAuth(): AuthState;
/** Kiểm tra quyền trên một module — dùng để ẩn menu và nút (Webapp Flow 6.5). */
export declare function useCan(moduleCode: ModuleCode, action?: 'view' | 'create' | 'edit' | 'delete' | 'approve'): boolean;
export {};
//# sourceMappingURL=auth.d.ts.map