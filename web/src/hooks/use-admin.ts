/**
 * Truy vấn và thao tác của phân hệ Quản trị hệ thống (Module NEN).
 *
 * Nguồn: PRD NEN-02 (vai trò và hạn mức), NEN-07 (nhật ký truy cập), NEN-12 (tham số hệ
 * thống), Backend Schema v1.1 4.1, migration `0111` `0113` `0115`.
 *
 * ## Vì sao gọi thẳng Supabase, không qua Workers
 *
 * Mọi bảng dưới đây đã có policy ghi đúng người trong CSDL: `system_parameters` và
 * `sla_definitions` chỉ TGĐ/CFO/BGĐ/ADMIN sửa, `approval_limits` và `users`/`roles`/
 * `permissions`/`user_companies` chỉ ADMIN sửa, `user_site_assignments` theo Mẫu E. Quyền
 * diễn đạt hết bằng RLS nên không có lý do dựng endpoint (Tech Stack 3.2).
 *
 * ## Hai bảng chỉ đọc
 *
 * `audit_logs` và `sensitive_access_logs` KHÔNG ai ghi được từ trình duyệt — đường ghi duy
 * nhất là hàm `SECURITY DEFINER` và trigger. Ở đây chỉ có hàm đọc, cố ý không có hàm ghi.
 *
 * ## Lịch sử tham số do trigger ghi
 *
 * Sửa một dòng `system_parameters` là trigger tự chèn `system_parameter_history`. Màn hình
 * KHÔNG được tự ghi lịch sử — ghi hai lần thì lịch sử có hai dòng cho một lần sửa.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ Người dùng và vai trò */

export interface AdminRole {
  id: string;
  code: string;
  /** Cột trong CSDL tên là `label`, không phải `name` — đừng đổi khi chép sang bảng khác. */
  label: string;
  site_scoped: boolean;
}

export interface AdminUserCompany {
  id: string;
  company_id: string;
  is_primary: boolean;
  role: AdminRole | null;
}

export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  is_active: boolean;
  user_companies: AdminUserCompany[];
}

export function useAdminUsers() {
  return useQuery<AdminUser[], Error>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select(
          // ⚠️ Phải chỉ đích danh khoá ngoại: `user_companies` có BA cột trỏ về `users`
          // (`user_id`, `created_by`, `updated_by`). Không nêu tên khoá thì PostgREST trả
          // 300 Multiple Choices, và supabase-js KHÔNG coi đó là lỗi — màn hình nhận danh
          // sách rỗng, đọc y như "chưa có tài khoản nào". Lỗi im lặng, chỉ thấy khi mở thật.
          'id, full_name, email, phone, job_title, is_active,' +
            ' user_companies!user_companies_user_id_users_id_fk' +
            '(id, company_id, is_primary, role:roles(id, code, label, site_scoped))',
        )
        .is('deleted_at', null)
        .order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AdminUser[];
    },
  });
}

export function useRoles() {
  return useQuery<AdminRole[], Error>({
    queryKey: ['admin', 'roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('id, code, label, site_scoped')
        .order('code');
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminRole[];
    },
  });
}

/**
 * Bật/tắt một tài khoản.
 *
 * Cố ý KHÔNG có hàm xoá: NEN-10 đòi giữ nguyên lịch sử khi người nghỉ việc, và `audit_logs`
 * trỏ tới `users.id`. Tắt tài khoản là thu hồi quyền truy cập mà vẫn đọc được dấu vết cũ.
 */
export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase.from('users').update({ is_active: isActive }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

/* --------------------------------------------------------------------- Hạn mức phê duyệt */

export interface ApprovalLimitRecord {
  id: string;
  role_id: string;
  subject: string;
  max_amount: string | number | null;
  step: number;
  company_id: string | null;
  is_active: boolean;
  role: { code: string; label: string } | null;
}

export function useApprovalLimits() {
  return useQuery<ApprovalLimitRecord[], Error>({
    queryKey: ['admin', 'approval_limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_limits')
        .select(
          'id, role_id, subject, max_amount, step, company_id, is_active, role:roles(code, label)',
        )
        .order('subject')
        .order('step');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ApprovalLimitRecord[];
    },
  });
}

export function useSaveApprovalLimit() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; maxAmount: string | null; isActive: boolean }>({
    mutationFn: async ({ id, maxAmount, isActive }) => {
      const { error } = await supabase
        .from('approval_limits')
        // Rỗng nghĩa là KHÔNG giới hạn (ví dụ Tổng Giám đốc), không phải bằng không.
        .update({
          max_amount: maxAmount === null || maxAmount === '' ? null : maxAmount,
          is_active: isActive,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'approval_limits'] });
    },
  });
}

/* ---------------------------------------------------------------- Tham số hệ thống NEN-12 */

export interface SystemParameterRecord {
  id: string;
  param_key: string;
  scope_type: 'global' | 'company' | 'product' | 'role';
  scope_id: string | null;
  /** Rỗng nghĩa là CHƯA CÓ DỮ LIỆU THẬT — màn hình hiện "Chưa đủ dữ liệu", không hiện 0. */
  value: unknown;
  unit: string | null;
  label: string;
  description: string | null;
  is_sensitive: boolean;
  is_active: boolean;
  effective_from: string;
}

export function useSystemParameters() {
  return useQuery<SystemParameterRecord[], Error>({
    queryKey: ['admin', 'system_parameters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameters')
        .select(
          'id, param_key, scope_type, scope_id, value, unit, label, description,' +
            ' is_sensitive, is_active, effective_from',
        )
        .order('param_key');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SystemParameterRecord[];
    },
  });
}

export interface ParameterHistoryRecord {
  id: string;
  param_key: string;
  old_value: unknown;
  new_value: unknown;
  effective_from: string | null;
  reason: string | null;
  changed_at: string;
  changed_by_user: { full_name: string } | null;
}

export function useParameterHistory(parameterId: string | null) {
  return useQuery<ParameterHistoryRecord[], Error>({
    queryKey: ['admin', 'system_parameter_history', parameterId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameter_history')
        .select(
          'id, param_key, old_value, new_value, effective_from, reason, changed_at,' +
            ' changed_by_user:users!system_parameter_history_changed_by_fkey(full_name)',
        )
        .eq('parameter_id', parameterId!)
        .order('changed_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ParameterHistoryRecord[];
    },
    enabled: Boolean(parameterId),
  });
}

/**
 * Ghi giá trị mới cho một tham số.
 *
 * `value` là `jsonb`, nên truyền `null` để TRẢ VỀ trạng thái chưa cấu hình — khác hẳn số 0.
 * Lịch sử do trigger ghi, nơi gọi không tự chèn.
 */
export function useSaveSystemParameter() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; value: unknown; effectiveFrom: string; isActive: boolean }
  >({
    mutationFn: async ({ id, value, effectiveFrom, isActive }) => {
      const { error } = await supabase
        .from('system_parameters')
        .update({ value, effective_from: effectiveFrom, is_active: isActive })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'system_parameters'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'system_parameter_history', variables.id],
      });
    },
  });
}

/* ------------------------------------------------------------- Thời hạn cam kết xử lý SLA */

export interface SlaRecord {
  id: string;
  request_type: string;
  responsible_role_id: string | null;
  company_id: string | null;
  target_hours: number;
  label: string;
  is_active: boolean;
  role: { code: string; label: string } | null;
}

export function useSlaDefinitions() {
  return useQuery<SlaRecord[], Error>({
    queryKey: ['admin', 'sla_definitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sla_definitions')
        .select(
          'id, request_type, responsible_role_id, company_id, target_hours, label, is_active,' +
            ' role:roles(code, label)',
        )
        .order('request_type');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SlaRecord[];
    },
  });
}

export interface SlaInput {
  requestType: string;
  responsibleRoleId: string | null;
  companyId: string | null;
  targetHours: number;
  label: string;
}

export function useCreateSla() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SlaInput>({
    mutationFn: async (input) => {
      const { error } = await supabase.from('sla_definitions').insert({
        request_type: input.requestType,
        responsible_role_id: input.responsibleRoleId,
        company_id: input.companyId,
        target_hours: input.targetHours,
        label: input.label,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sla_definitions'] });
    },
  });
}

export function useSaveSla() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; targetHours: number; isActive: boolean }>({
    mutationFn: async ({ id, targetHours, isActive }) => {
      const { error } = await supabase
        .from('sla_definitions')
        .update({ target_hours: targetHours, is_active: isActive })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sla_definitions'] });
    },
  });
}

/* ------------------------------------------------------------------------ Nhật ký NEN-07 */

export interface AuditLogRecord {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

export function useAuditLogs(limit = 200) {
  return useQuery<AuditLogRecord[], Error>({
    queryKey: ['admin', 'audit_logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(
          'id, action, entity_type, entity_id, reason, created_at,' +
            ' actor:users!audit_logs_user_id_users_id_fk(full_name)',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AuditLogRecord[];
    },
  });
}

export interface SensitiveAccessRecord {
  id: string;
  sensitive_kind: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  created_at: string;
  actor: { full_name: string } | null;
}

export function useSensitiveAccessLogs(limit = 200) {
  return useQuery<SensitiveAccessRecord[], Error>({
    queryKey: ['admin', 'sensitive_access_logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sensitive_access_logs')
        .select(
          'id, sensitive_kind, entity_type, entity_id, action, created_at,' +
            ' actor:users!sensitive_access_logs_user_id_users_id_fk(full_name)',
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SensitiveAccessRecord[];
    },
  });
}

/* ------------------------------------------------------- Phân công công trường (Mẫu E) */

export interface SiteAssignmentRecord {
  id: string;
  user_id: string;
  construction_site_id: string;
  site_role: string | null;
  assigned_from: string;
  assigned_to: string | null;
  assigned_user: { full_name: string } | null;
  site: { code: string; name: string; company_id: string } | null;
}

export function useSiteAssignments() {
  return useQuery<SiteAssignmentRecord[], Error>({
    queryKey: ['admin', 'user_site_assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_site_assignments')
        .select(
          'id, user_id, construction_site_id, site_role, assigned_from, assigned_to,' +
            ' assigned_user:users!user_site_assignments_user_id_fkey(full_name),' +
            ' site:construction_sites(code, name, company_id)',
        )
        .is('deleted_at', null)
        .order('assigned_from', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteAssignmentRecord[];
    },
  });
}

export function useCreateSiteAssignment() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { userId: string; siteId: string; siteRole: string | null; assignedFrom: string }
  >({
    mutationFn: async ({ userId, siteId, siteRole, assignedFrom }) => {
      const { error } = await supabase.from('user_site_assignments').insert({
        user_id: userId,
        construction_site_id: siteId,
        site_role: siteRole,
        assigned_from: assignedFrom,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user_site_assignments'] });
    },
  });
}

/**
 * Kết thúc một phân công.
 *
 * Đặt ngày kết thúc chứ không xoá dòng: quên phân công phải dẫn tới thấy ÍT đi, và vẫn phải
 * dựng lại được ai từng vào công trình nào trong khoảng nào (Mẫu E, CLAUDE.md 3.4).
 */
export function useEndSiteAssignment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; assignedTo: string }>({
    mutationFn: async ({ id, assignedTo }) => {
      const { error } = await supabase
        .from('user_site_assignments')
        .update({ assigned_to: assignedTo })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user_site_assignments'] });
    },
  });
}
