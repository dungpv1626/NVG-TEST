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
import { useCompanyStore } from './company-store';
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

/**
 * Một mục trong bộ chọn phạm vi pháp nhân.
 *
 * KHÔNG đồng nhất với `CompanyAssignment`: dòng gán trong `user_companies` nói người này
 * LÀM VIỆC ở pháp nhân nào, còn danh sách này nói họ XEM ĐƯỢC phạm vi nào. Vai trò cấp tập
 * đoàn (`sees_all_companies`) đọc được dữ liệu cả ba pháp nhân dù chỉ được gán vào NVG —
 * dựng bộ chọn từ `assignments` thì họ chỉ có đúng một mục, tức là không có cách nào thoát
 * chế độ gộp, trong khi Bảng điều khiển vẫn bảo họ "chọn một pháp nhân để xem riêng".
 */
export interface CompanyOption {
  companyId: string;
  companyCode: CompanyCode;
  companyShortName: string;
  /** Nhãn mọi vai trò người dùng giữ ở pháp nhân này — một người có thể giữ nhiều vai trò. */
  roleLabels: string[];
  /** `true` khi mục này có được nhờ `sees_all_companies`, không nhờ dòng gán trực tiếp. */
  viaSeesAll: boolean;
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
  /**
   * Các pháp nhân người dùng được phép CHỌN ở bộ chọn phạm vi — luôn là tập cha của
   * `assignments`. Đây là danh sách duy nhất mà bộ chọn, `useCompanyScope` và các màn hình
   * tra `company_id` → mã pháp nhân được phép dùng.
   */
  scopeCompanies: CompanyOption[];
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

/** Một dòng `user_companies` kèm hai bảng liên kết, như PostgREST trả về. */
export interface CompanyRow {
  is_primary: boolean;
  companies: { id: string; code: string; short_name: string; display_order: number };
  roles: { code: string; label: string; sees_all_companies: boolean; default_route: string | null };
}

/** Một dòng của danh mục `companies` — chỉ tải khi vai trò xem được mọi pháp nhân. */
export interface CompanyCatalogRow {
  id: string;
  code: string;
  short_name: string;
  display_order: number;
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

  const rawRows = (rows ?? []) as unknown as CompanyRow[];

  const assignments: CompanyAssignment[] = rawRows
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
  const seesAllCompanies = assignments.some((a) => a.seesAllCompanies);

  // Hợp nhất quyền của mọi vai trò người dùng giữ: quyền rộng nhất thắng.
  //
  // Danh mục pháp nhân chỉ tải khi người dùng giữ vai trò cấp tập đoàn — người thường không
  // cần tới nó, và hai truy vấn này không phụ thuộc nhau nên chạy song song.
  const [{ data: permRows }, { data: companyRows }] = await Promise.all([
    supabase
      .from('permissions')
      .select(
        'module_code, can_view, can_create, can_edit, can_delete, can_approve, roles!inner(code)',
      )
      .in('roles.code', roleCodes.length ? roleCodes : ['__none__']),
    seesAllCompanies
      ? supabase
          .from('companies')
          .select('id, code, short_name, display_order')
          .is('deleted_at', null)
          .order('display_order')
      : Promise.resolve({ data: null }),
  ]);

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
    scopeCompanies: buildScopeCompanies(rawRows, companyRows),
    permissions: [...merged.values()],
    seesAllCompanies,
  };
}

/**
 * Ghép danh sách pháp nhân chọn được: các dòng gán trực tiếp, cộng thêm MỌI pháp nhân nếu
 * người dùng giữ vai trò cấp tập đoàn.
 *
 * Bổ sung ở đây, không bằng cách thêm dòng vào `user_companies`: "xem mọi pháp nhân" là một
 * thuộc tính của VAI TRÒ, nhân bản nó thành bốn dòng gán là tạo nguồn sự thật thứ hai —
 * quản trị viên đổi vai trò mà quên sửa dòng gán thì hai nơi nói khác nhau.
 *
 * ⚠️ Đây chỉ là danh sách HIỂN THỊ. Người dùng có sửa state trong trình duyệt để chọn một
 * pháp nhân không thuộc phạm vi của mình thì RLS vẫn trả về rỗng — hàng rào nằm trong CSDL.
 */
export function buildScopeCompanies(
  rows: CompanyRow[],
  allCompanies: CompanyCatalogRow[] | null,
): CompanyOption[] {
  const byId = new Map<string, CompanyOption & { displayOrder: number }>();

  for (const r of rows) {
    const existing = byId.get(r.companies.id);
    if (existing) {
      if (!existing.roleLabels.includes(r.roles.label)) existing.roleLabels.push(r.roles.label);
      continue;
    }
    byId.set(r.companies.id, {
      companyId: r.companies.id,
      companyCode: r.companies.code as CompanyCode,
      companyShortName: r.companies.short_name,
      roleLabels: [r.roles.label],
      viaSeesAll: false,
      displayOrder: r.companies.display_order,
    });
  }

  // Nhãn vai trò cho pháp nhân thêm vào: chính vai trò đã mở phạm vi đó ra, chứ không phải
  // một vai trò khác người dùng tình cờ giữ ở pháp nhân khác.
  const seesAllLabels = [
    ...new Set(rows.filter((r) => r.roles.sees_all_companies).map((r) => r.roles.label)),
  ];
  for (const c of allCompanies ?? []) {
    if (byId.has(c.id)) continue;
    byId.set(c.id, {
      companyId: c.id,
      companyCode: c.code as CompanyCode,
      companyShortName: c.short_name,
      roleLabels: seesAllLabels,
      viaSeesAll: true,
      displayOrder: c.display_order,
    });
  }

  return [...byId.values()]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ displayOrder: _drop, ...rest }) => rest);
}

/** Tra mã pháp nhân từ `company_id` của một dòng dữ liệu — dùng để đặt mã hồ sơ mới. */
export function companyCodeOf(
  profile: UserProfile | null | undefined,
  companyId: string | null | undefined,
): CompanyCode | null {
  if (!profile || !companyId) return null;
  return profile.scopeCompanies.find((c) => c.companyId === companyId)?.companyCode ?? null;
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

  /**
   * Chốt pháp nhân đang làm việc ngay khi có hồ sơ người dùng.
   *
   * Không làm bước này thì `selectedCompanyId` chỉ được đặt lúc người dùng TỰ BẤM vào bộ
   * chọn pháp nhân — mà người chỉ thuộc một pháp nhân thì không bao giờ bấm. Hệ quả: mọi
   * truy vấn lọc theo pháp nhân bị tắt và mọi biểu mẫu cần `company_id` báo "chưa chọn pháp
   * nhân", trong khi màn hình vẫn hiển thị đúng tên công ty ở thanh bên — sai mà nhìn như đúng.
   *
   * Cũng xử lý trường hợp id đã lưu không còn hợp lệ (quản trị viên đổi phân quyền): rơi về
   * pháp nhân đầu tiên thay vì kẹt ở một id không còn thuộc về người này.
   *
   * Kiểm tra tính hợp lệ theo `scopeCompanies`, nhưng giá trị rơi về lấy từ `assignments`:
   * người giữ vai trò cấp tập đoàn được PHÉP chọn cả ba pháp nhân, song nơi họ làm việc vẫn
   * là pháp nhân được gán — lấy phần tử đầu của `scopeCompanies` sẽ đẩy Phó Giám đốc NVS vào
   * chế độ gộp mỗi lần đăng nhập, dù họ chưa hề chọn như vậy.
   *
   * ⚠️ Chờ `loading` xong mới làm gì cả. Trong lúc còn khôi phục phiên, `profile` là rỗng vì
   * CHƯA TẢI XONG, không phải vì đã đăng xuất — mà hai trường hợp đó cần hai xử lý ngược
   * nhau. Coi lẫn chúng thì mỗi lần tải trang chạy đúng chuỗi này: xoá lựa chọn đã lưu, rồi
   * khi hồ sơ về thì thấy rỗng nên rơi về pháp nhân được gán. Người giữ vai trò cấp tập đoàn
   * vì thế mất lựa chọn sau MỌI lần tải lại và bị đẩy về chế độ gộp — đúng cái chế độ không
   * tạo được hồ sơ. Bộ nhớ `persist` của kho trạng thái khi đó là vô dụng: nó khôi phục đúng
   * giá trị, chỉ để bị ghi đè vài mili giây sau.
   */
  useEffect(() => {
    if (loading) return;

    const { selectedCompanyId, setSelectedCompany, reset } = useCompanyStore.getState();

    if (!profile || profile.assignments.length === 0) {
      if (selectedCompanyId !== null) reset();
      return;
    }

    const stillValid = profile.scopeCompanies.some((c) => c.companyId === selectedCompanyId);
    if (!stillValid) setSelectedCompany(profile.assignments[0]!.companyId);
  }, [profile, loading]);

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

/**
 * Người dùng hiện tại có phải người chịu trách nhiệm hồ sơ này không — mẫu RLS B.
 *
 * `useCan(module, 'edit')` chỉ trả lời "vai trò này được sửa hồ sơ CRM nói chung không";
 * nó KHÔNG biết ai phụ trách hồ sơ cụ thể. Dùng một mình nó để hiện nút là tái tạo đúng
 * tình huống Webapp Flow 6.5 cấm: đồng nghiệp cùng phòng thấy nút "Ghi biên bản" trên cơ hội
 * của người khác, bấm vào thì RLS chặn.
 *
 * Nhận nhiều id để dùng được cho cả người phối hợp (`collaborator_ids` của khiếu nại).
 */
export function useIsResponsible(...responsibleUserIds: (string | null | undefined)[]): boolean {
  const { profile } = useAuth();
  if (!profile) return false;
  // Vai trò cấp tập đoàn quản lý mọi hồ sơ — khớp đúng `rls_owner_can_write` trong CSDL.
  if (profile.seesAllCompanies) return true;
  return responsibleUserIds.some((id) => id != null && id === profile.id);
}
