/**
 * Truy vấn và thao tác trên công trình thi công (Module TC).
 *
 * Nguồn: PRD TC-01 → TC-08 (phạm vi cũ), Backend Schema 4.6, Webapp Flow 3.4.
 *
 * ⚠️ Giao diện ở đây mới phủ phạm vi CŨ, đủ chạy trọn luồng chứ không dựng sâu. Phiếu khảo
 * sát Chỉ huy – Giám sát công trường đã có (02/09/2026) và PRD v1.4 mở phạm vi thành
 * TC-01 → TC-20; phần còn thiếu ghi ở `BUILD_PLAN.md` mục 6.1, 6.2, 6.5. Ngân sách thao tác
 * hiện trường là tiêu chí nghiệm thu: cập nhật hằng ngày ≤ 10–20 phút, mục tiêu 5–10.
 *
 * Bốn thao tác đi qua hàm CSDL chứ không UPDATE thẳng, vì mỗi cái có điều kiện riêng mà
 * trình duyệt không được phép bỏ qua: mở công trình (hợp đồng phải đã ký), chuyển bước
 * (đúng thứ tự, và bàn giao phải có biên bản nghiệm thu chủ đầu tư), lập biên bản nghiệm
 * thu (tự báo Kế toán), hủy biên bản (bắt buộc nêu nguyên nhân).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AcceptanceStatus,
  AcceptanceType,
  CostGroup,
  MoneyValue,
  SiteLogType,
  SiteStage,
  SubcontractForm,
  SubcontractorStatus,
  WarrantyClaimStatus,
  WarrantyStatus,
} from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export interface ConstructionSiteRecord {
  id: string;
  code: string;
  company_id: string;
  name: string;
  stage: SiteStage;
  site_address: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  progress_percent: string | null;
  responsible_user_id: string | null;
  created_at: string;
  responsible: { full_name: string } | null;
}

const SITE_SELECT =
  'id, code, company_id, name, stage, site_address, planned_start_date, planned_end_date, ' +
  'progress_percent, responsible_user_id, created_at, ' +
  'responsible:users!construction_sites_responsible_user_id_users_id_fk(full_name)';

export function useConstructionSites(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<ConstructionSiteRecord[], Error>({
    queryKey: ['construction-sites', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('construction_sites').select(SITE_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ConstructionSiteRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface ConstructionSiteDetailRecord extends ConstructionSiteRecord {
  contract_id: string | null;
  bidding_project_id: string | null;
  design_project_id: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  handed_over_at: string | null;
  pause_reason: string | null;
  notes: string | null;
  updated_at: string;
  contract: { id: string; code: string; contract_number: string | null; title: string } | null;
}

export function useConstructionSite(id: string | undefined) {
  return useQuery<ConstructionSiteDetailRecord | null, Error>({
    queryKey: ['construction-sites', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('construction_sites')
        .select(
          `${SITE_SELECT}, contract_id, bidding_project_id, design_project_id, ` +
            'actual_start_date, actual_end_date, handed_over_at, pause_reason, notes, updated_at, ' +
            'contract:contracts!construction_sites_contract_id_contracts_id_fk(id, code, contract_number, title)',
        )
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as ConstructionSiteDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

/**
 * Công trình đã mở từ một hợp đồng.
 *
 * Trả về rỗng cả khi hợp đồng chưa có công trình LẪN khi người dùng không có quyền xem phân
 * hệ Thi công — RLS lọc giống nhau ở cả hai trường hợp. Màn hình Hợp đồng vì thế chỉ dùng
 * kết quả này để HIỆN THÊM liên kết, không dùng để kết luận "chưa mở công trình" rồi chặn.
 */
export function useSitesOfContract(contractId: string | undefined) {
  return useQuery<Pick<ConstructionSiteRecord, 'id' | 'code' | 'name' | 'stage'>[], Error>({
    queryKey: ['construction-sites', 'of-contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('construction_sites')
        .select('id, code, name, stage')
        .eq('contract_id', contractId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as Pick<ConstructionSiteRecord, 'id' | 'code' | 'name' | 'stage'>[];
    },
    enabled: Boolean(contractId),
  });
}

/**
 * Mở công trình từ hợp đồng đã ký (TC-01).
 *
 * KHÔNG có hook tạo công trình trắng: công trình phải gắn với hồ sơ sinh ra ngân sách của
 * nó, nếu không thì TC-05 không có gì để so. Với NVO, công trình được mở tự động ngay khi
 * bàn giao hồ sơ thiết kế (TK-08) nên không cần thao tác tay nào.
 */
export function useOpenSiteFromContract() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      contractId: string;
      name?: string;
      siteAddress?: string;
      responsibleUserId?: string | null;
      plannedStartDate?: string | null;
      plannedEndDate?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('open_site_from_contract', {
        p_contract_id: input.contractId,
        p_name: input.name?.trim() || null,
        p_site_address: input.siteAddress?.trim() || null,
        p_responsible_user_id: input.responsibleUserId ?? null,
        p_planned_start_date: input.plannedStartDate || null,
        p_planned_end_date: input.plannedEndDate || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

/** Chuyển bước công trình — CSDL kiểm thứ tự và điều kiện của từng bước. */
export function useMoveSiteStage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { siteId: string; stage: SiteStage; reason?: string }>({
    mutationFn: async ({ siteId, stage, reason }) => {
      const { error } = await supabase.rpc('move_site_stage', {
        p_site_id: siteId,
        p_stage: stage,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

/** Sửa các trường mô tả. `stage` và `handed_over_at` không có ở đây — CSDL cũng từ chối. */
export function useUpdateConstructionSite() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        name: string;
        site_address: string | null;
        responsible_user_id: string | null;
        planned_start_date: string | null;
        planned_end_date: string | null;
        progress_percent: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await supabase
        .from('construction_sites')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Nhật ký công trường (TC-02, TC-08)
// ---------------------------------------------------------------------------

export interface SiteLogRecord {
  id: string;
  log_date: string;
  log_type: SiteLogType;
  content: string;
  workforce_count: number | null;
  weather: string | null;
  photo_urls: string[] | null;
  logged_by: string | null;
  created_at: string;
  author: { full_name: string } | null;
}

export function useSiteLogs(siteId: string | undefined) {
  return useQuery<SiteLogRecord[], Error>({
    queryKey: ['construction-sites', siteId, 'logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_logs')
        .select(
          'id, log_date, log_type, content, workforce_count, weather, photo_urls, logged_by, created_at, ' +
            'author:users!site_logs_logged_by_users_id_fk(full_name)',
        )
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteLogRecord[];
    },
    enabled: Boolean(siteId),
  });
}

/**
 * `logged_by` KHÔNG gửi lên từ đây: CSDL lấy người ghi từ phiên đăng nhập (trigger
 * `site_logs_stamp_author`). Chữ ký dưới một dòng nhật ký là thứ dùng để phân định trách
 * nhiệm khi tranh chấp (TC-08) — để trình duyệt khai thì nó khai được tên người khác.
 */
export function useCreateSiteLog() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      siteId: string;
      companyId: string;
      values: {
        log_date: string;
        log_type: SiteLogType;
        content: string;
        workforce_count: number | null;
        weather: string | null;
      };
    }
  >({
    mutationFn: async ({ siteId, companyId, values }) => {
      const { data, error } = await supabase
        .from('site_logs')
        .insert({
          construction_site_id: siteId,
          company_id: companyId,
          ...values,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (_id, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId, 'logs'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Nghiệm thu (TC-04)
// ---------------------------------------------------------------------------

export interface AcceptanceRecordRow {
  id: string;
  code: string | null;
  acceptance_type: AcceptanceType;
  status: AcceptanceStatus;
  stage_name: string;
  scope: string | null;
  value: MoneyValue | null;
  subcontractor_id: string | null;
  accepted_date: string | null;
  counterpart_signed_by: string | null;
  outstanding_issues: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export function useAcceptanceRecords(siteId: string | undefined) {
  return useQuery<AcceptanceRecordRow[], Error>({
    queryKey: ['construction-sites', siteId, 'acceptances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acceptance_records')
        .select(
          'id, code, acceptance_type, status, stage_name, scope, value, subcontractor_id, ' +
            'accepted_date, counterpart_signed_by, outstanding_issues, cancel_reason, created_at',
        )
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('accepted_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AcceptanceRecordRow[];
    },
    enabled: Boolean(siteId),
  });
}

export function useRecordAcceptance() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      siteId: string;
      acceptanceType: AcceptanceType;
      stageName: string;
      value?: string | null;
      scope?: string | null;
      acceptedDate?: string | null;
      subcontractorId?: string | null;
      counterpartSignedBy?: string | null;
      outstandingIssues?: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_acceptance', {
        p_site_id: input.siteId,
        p_acceptance_type: input.acceptanceType,
        p_stage_name: input.stageName,
        p_value: input.value || null,
        p_scope: input.scope || null,
        p_accepted_date: input.acceptedDate || null,
        p_subcontractor_id: input.subcontractorId || null,
        p_counterpart_signed_by: input.counterpartSignedBy || null,
        p_outstanding_issues: input.outstandingIssues || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId] });
    },
  });
}

export function useCancelAcceptance() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { siteId: string; acceptanceId: string; reason: string }>({
    mutationFn: async ({ acceptanceId, reason }) => {
      const { error } = await supabase.rpc('cancel_acceptance', {
        p_acceptance_id: acceptanceId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Ngân sách so với thực tế (TC-05)
// ---------------------------------------------------------------------------

export interface BudgetStatusRow {
  cost_group: CostGroup;
  cost_code: string;
  name: string;
  budgeted_amount: MoneyValue;
  actual_amount: MoneyValue;
  committed_amount: MoneyValue;
  engaged_amount: MoneyValue;
  remaining_amount: MoneyValue;
}

/**
 * Dòng ngân sách trả về đã được CSDL lọc theo quyền: vai trò không được xem lợi nhuận sẽ
 * KHÔNG nhận dòng "lợi nhuận mục tiêu" — giao diện không phải tự giấu, và cũng không giấu
 * hụt được (Mẫu D, Backend Schema 3.3).
 */
export function useSiteBudgetStatus(siteId: string | undefined) {
  return useQuery<BudgetStatusRow[], Error>({
    queryKey: ['construction-sites', siteId, 'budget'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('construction_budget_status', {
        p_site_id: siteId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetStatusRow[];
    },
    enabled: Boolean(siteId),
  });
}

// ---------------------------------------------------------------------------
// Tổ đội / nhà thầu phụ (TC-06)
// ---------------------------------------------------------------------------

export interface SubcontractorRecord {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  scope_of_work: string;
  form: SubcontractForm;
  status: SubcontractorStatus;
  contract_value: MoneyValue | null;
  responsible_user_id: string | null;
  start_date: string | null;
  end_date: string | null;
  quality_rating: number | null;
  quality_notes: string | null;
  responsible: { full_name: string } | null;
}

export function useSubcontractors(siteId: string | undefined) {
  return useQuery<SubcontractorRecord[], Error>({
    queryKey: ['construction-sites', siteId, 'subcontractors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractors')
        .select(
          'id, name, contact_name, contact_phone, scope_of_work, form, status, contract_value, ' +
            'responsible_user_id, start_date, end_date, quality_rating, quality_notes, ' +
            'responsible:users!subcontractors_responsible_user_id_users_id_fk(full_name)',
        )
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SubcontractorRecord[];
    },
    enabled: Boolean(siteId),
  });
}

export function useSaveSubcontractor() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id?: string; siteId: string; companyId: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ id, siteId, companyId, values }) => {
      const query = id
        ? supabase.from('subcontractors').update(values).eq('id', id)
        : supabase
            .from('subcontractors')
            .insert({ ...values, construction_site_id: siteId, company_id: companyId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { siteId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['construction-sites', siteId, 'subcontractors'],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Bảo hành (TC-07)
// ---------------------------------------------------------------------------

export interface WarrantyRecord {
  id: string;
  item: string;
  status: WarrantyStatus;
  start_date: string | null;
  warranty_until: string | null;
  duration_months: number | null;
  subcontractor_id: string | null;
  notes: string | null;
}

export function useWarranties(siteId: string | undefined) {
  return useQuery<WarrantyRecord[], Error>({
    queryKey: ['construction-sites', siteId, 'warranties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warranties')
        .select(
          'id, item, status, start_date, warranty_until, duration_months, subcontractor_id, notes',
        )
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('warranty_until', { nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as WarrantyRecord[];
    },
    enabled: Boolean(siteId),
  });
}

export function useSaveWarranty() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id?: string; siteId: string; companyId: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ id, siteId, companyId, values }) => {
      const query = id
        ? supabase.from('warranties').update(values).eq('id', id)
        : supabase
            .from('warranties')
            .insert({ ...values, construction_site_id: siteId, company_id: companyId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { siteId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['construction-sites', siteId, 'warranties'],
      });
    },
  });
}

export interface WarrantyClaimRecord {
  id: string;
  warranty_id: string;
  status: WarrantyClaimStatus;
  description: string;
  reported_date: string;
  reported_by: string | null;
  assigned_user_id: string | null;
  root_cause: string | null;
  resolution: string | null;
  cost: MoneyValue | null;
  resolved_at: string | null;
  assignee: { full_name: string } | null;
}

/** Phản ánh của MỌI hạng mục trong công trình — một truy vấn, gom nhóm ở màn hình. */
export function useWarrantyClaims(warrantyIds: readonly string[]) {
  const key = [...warrantyIds].sort().join(',');

  return useQuery<WarrantyClaimRecord[], Error>({
    queryKey: ['warranty-claims', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warranty_claims')
        .select(
          'id, warranty_id, status, description, reported_date, reported_by, assigned_user_id, ' +
            'root_cause, resolution, cost, resolved_at, ' +
            'assignee:users!warranty_claims_assigned_user_id_users_id_fk(full_name)',
        )
        .in('warranty_id', warrantyIds as string[])
        .is('deleted_at', null)
        .order('reported_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as WarrantyClaimRecord[];
    },
    enabled: warrantyIds.length > 0,
  });
}

export function useSaveWarrantyClaim() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id?: string; siteId: string; companyId: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ id, companyId, values }) => {
      const query = id
        ? supabase.from('warranty_claims').update(values).eq('id', id)
        : supabase.from('warranty_claims').insert({ ...values, company_id: companyId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
      void queryClient.invalidateQueries({
        queryKey: ['construction-sites', siteId, 'warranties'],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Hồ sơ và bản vẽ của công trình (NEN-05, NEN-06)
//
// Khảo sát Chỉ huy – Giám sát công trường 02/09/2026 xếp đây là vướng mắc số MỘT, và nêu
// đúng hậu quả: "thi công theo bản vẽ đang lưu tại hiện trường, sau đó phát hiện Chủ đầu tư
// hoặc thiết kế đã có điều chỉnh mà công trường chưa nhận được bản cập nhật chính thức. Một
// phần công việc phải tháo dỡ hoặc sửa lại."
//
// KHÔNG dựng cơ chế phiên bản thứ hai: dùng lại đúng `documents` + `document_versions` mà
// bản vẽ thiết kế (TK-05), dự toán (DA-06) và hợp đồng (HD-01) đang dùng. Ràng buộc "chỉ MỘT
// bản đang hiệu lực" do unique index trong CSDL giữ, không do màn hình này giữ.
// ---------------------------------------------------------------------------

export interface SiteDocumentVersionRecord {
  id: string;
  version: number;
  is_current_version: boolean;
  file_name: string;
  file_url: string;
  change_reason: string | null;
  published_at: string | null;
  publisher: { full_name: string } | null;
}

export interface SiteDocumentRecord {
  id: string;
  title: string;
  category: string;
  description: string | null;
  versions: SiteDocumentVersionRecord[];
}

export function useSiteDocuments(siteId: string | undefined) {
  return useQuery<SiteDocumentRecord[], Error>({
    queryKey: ['construction-sites', siteId, 'documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(
          'id, title, category, description, ' +
            'versions:document_versions(id, version, is_current_version, file_name, file_url, ' +
            'change_reason, published_at, publisher:users!document_versions_published_by_users_id_fk(full_name))',
        )
        .eq('related_entity_type', 'construction_sites')
        .eq('related_entity_id', siteId!)
        .is('deleted_at', null)
        .order('category')
        .order('title');
      if (error) throw new Error(error.message);

      // Bản mới nhất lên đầu — người mở tab này để biết bản NÀO đang dùng được, không phải
      // để đọc lịch sử theo thứ tự thời gian.
      return (data ?? []).map((d) => ({
        ...(d as unknown as SiteDocumentRecord),
        versions: [...((d as unknown as SiteDocumentRecord).versions ?? [])].sort(
          (a, b) => b.version - a.version,
        ),
      }));
    },
    enabled: Boolean(siteId),
  });
}

/**
 * Phát hành một phiên bản mới của hồ sơ công trình.
 *
 * Tài liệu logic được tạo ở lần phát hành ĐẦU TIÊN, không phải bằng một nút "Tạo tài liệu"
 * riêng: một tài liệu chưa có phiên bản nào là một dòng rỗng trong kho hồ sơ, và người dùng
 * sẽ phải nhớ bấm hai nút mới xong một việc.
 *
 * Nguyên nhân thay đổi bắt buộc từ bản thứ hai trở đi — điều kiện đó do
 * `publish_document_version` giữ (NEN-05), ở đây chỉ chặn sớm để báo lỗi ngay tại biểu mẫu.
 */
export function usePublishSiteDocumentVersion() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      siteId: string;
      companyId: string;
      documentId: string | null;
      title: string;
      category: string;
      fileName: string;
      changeReason: string | null;
    }
  >({
    mutationFn: async (input) => {
      let documentId = input.documentId;

      if (!documentId) {
        const { data: created, error: docError } = await supabase
          .from('documents')
          .insert({
            company_id: input.companyId,
            title: input.title,
            category: input.category,
            related_entity_type: 'construction_sites',
            related_entity_id: input.siteId,
          })
          .select('id')
          .single();
        if (docError) throw docError;
        documentId = (created as { id: string }).id;
      }

      const { data, error } = await supabase.rpc('publish_document_version', {
        p_document_id: documentId,
        // ⏳ Tải tệp thật lên Supabase Storage làm ở bước hoàn thiện kho hồ sơ; ở đây ghi
        // nhận đường dẫn để cơ chế phiên bản chạy đúng từ bây giờ — cùng cách `version-panel`
        // của Module Thiết kế đang làm.
        p_file_url: `cong-trinh/${input.siteId}/${Date.now()}-${input.fileName}`,
        p_file_name: input.fileName,
        p_change_reason: input.changeReason,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { siteId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['construction-sites', siteId, 'documents'],
      });
    },
  });
}
