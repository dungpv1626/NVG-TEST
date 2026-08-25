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
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CompanyCode, ModuleCode, RoleCode } from '@nvg/shared';
import { supabase } from './supabase';

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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Chuyển thông báo lỗi kỹ thuật của Supabase sang ngôn ngữ nghiệp vụ (Content Guidelines 4.6). */
function toVietnameseAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Email hoặc mật khẩu chưa đúng.';
  }
  if (m.includes('email not confirmed')) {
    return 'Địa chỉ email chưa được xác nhận. Kiểm tra hộp thư để hoàn tất bước xác nhận.';
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'Đã thử đăng nhập quá nhiều lần. Chờ ít phút rồi thử lại.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Không kết nối được máy chủ. Kiểm tra kết nối mạng rồi thử lại.';
  }
  return 'Không đăng nhập được. Thử lại hoặc liên hệ quản trị hệ thống.';
}

async function loadProfile(authUserId: string): Promise<UserProfile | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, job_title, department')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error || !user) return null;

  const { data: rows } = await supabase
    .from('user_companies')
    .select(
      `is_primary,
       companies!inner ( id, code, short_name, display_order ),
       roles!inner ( code, label, sees_all_companies, default_route )`,
    )
    .eq('user_id', user.id);

  type Row = {
    is_primary: boolean;
    companies: { id: string; code: string; short_name: string; display_order: number };
    roles: { code: string; label: string; sees_all_companies: boolean; default_route: string | null };
  };

  const assignments: CompanyAssignment[] = ((rows ?? []) as unknown as Row[])
    .map((r) => ({
      companyId: r.companies.id,
      companyCode: r.companies.code as CompanyCode,
      companyShortName: r.companies.short_name,
      roleCode: r.roles.code as RoleCode,
      roleLabel: r.roles.label,
      seesAllCompanies: r.roles.sees_all_companies,
      defaultRoute: r.roles.default_route,
      isPrimary: r.is_primary,
      displayOrder: r.companies.display_order,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ displayOrder: _drop, ...rest }) => rest);

  const roleCodes = [...new Set(assignments.map((a) => a.roleCode))];

  // Hợp nhất quyền của mọi vai trò người dùng giữ: quyền rộng nhất thắng.
  const { data: permRows } = await supabase
    .from('permissions')
    .select('module_code, can_view, can_create, can_edit, can_delete, can_approve, roles!inner(code)')
    .in('roles.code', roleCodes.length ? roleCodes : ['__none__']);

  const merged = new Map<string, ModulePermission>();
  for (const p of (permRows ?? []) as unknown as Array<Record<string, boolean | string>>) {
    const code = p.module_code as ModuleCode;
    const prev = merged.get(code);
    merged.set(code, {
      moduleCode: code,
      canView: Boolean(p.can_view) || Boolean(prev?.canView),
      canCreate: Boolean(p.can_create) || Boolean(prev?.canCreate),
      canEdit: Boolean(p.can_edit) || Boolean(prev?.canEdit),
      canDelete: Boolean(p.can_delete) || Boolean(prev?.canDelete),
      canApprove: Boolean(p.can_approve) || Boolean(prev?.canApprove),
    });
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    jobTitle: user.job_title,
    department: user.department,
    assignments,
    permissions: [...merged.values()],
    seesAllCompanies: assignments.some((a) => a.seesAllCompanies),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Khôi phục phiên đã lưu trước, rồi lắng nghe thay đổi.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) setProfile(await loadProfile(data.session.user.id));
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      setProfile(next ? await loadProfile(next.user.id) : null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? toVietnameseAuthError(error.message) : null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/dat-lai-mat-khau`,
        });
        return { error: error ? toVietnameseAuthError(error.message) : null };
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>.');
  return ctx;
}

/** Kiểm tra quyền trên một module — dùng để ẩn menu và nút (Webapp Flow 6.5). */
export function useCan(
  moduleCode: ModuleCode,
  action: 'view' | 'create' | 'edit' | 'delete' | 'approve' = 'view',
): boolean {
  const { profile } = useAuth();
  const p = profile?.permissions.find((x) => x.moduleCode === moduleCode);
  if (!p) return false;
  switch (action) {
    case 'view':
      return p.canView;
    case 'create':
      return p.canCreate;
    case 'edit':
      return p.canEdit;
    case 'delete':
      return p.canDelete;
    case 'approve':
      return p.canApprove;
  }
}
