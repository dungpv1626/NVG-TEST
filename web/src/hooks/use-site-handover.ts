/**
 * G4 (0249): gói bàn giao sang Thi công, điều kiện khởi công, điều chỉnh ngân sách, vượt ngân sách,
 * lãi dự kiến lúc nhận việc. Mọi quyền do CSDL quyết — hàm trả cờ `can_*` cho giao diện ẩn nút (5.4).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CostGroup, MoneyValue } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export type ChecklistKind = 'ban_giao' | 'khoi_cong';
export type HandoverDepartment = 'du_an' | 'thiet_ke' | 'kinh_doanh';

export const HANDOVER_DEPARTMENT_LABELS: Record<HandoverDepartment, string> = {
  du_an: 'Dự án',
  thiet_ke: 'Thiết kế',
  kinh_doanh: 'Kinh doanh',
};

export const HANDOVER_BUCKET = 'site-handover-files';

export interface ChecklistItem {
  id: string;
  item_key: string;
  label: string;
  description: string | null;
  giver_department: HandoverDepartment | null;
  is_required: boolean;
  is_sensitive: boolean;
  status: 'cho_giao' | 'da_giao' | 'da_nhan' | 'thieu' | 'chua_dat' | 'da_dat';
  link_url: string | null;
  attachment_path: string | null;
  note: string | null;
  given_by_name: string | null;
  given_at: string | null;
  received_by_name: string | null;
  received_at: string | null;
  issue_note: string | null;
  issue_at: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  auto_available: boolean;
  auto_label: string | null;
  can_give: boolean;
  can_receive: boolean;
  can_confirm: boolean;
}

export function useSiteChecklist(siteId: string | undefined, kind: ChecklistKind) {
  return useQuery<ChecklistItem[], Error>({
    queryKey: ['construction-sites', siteId, 'checklist', kind],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_checklist', {
        p_site_id: siteId!,
        p_kind: kind,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ChecklistItem[];
    },
    enabled: Boolean(siteId),
  });
}

export interface HandoverHeader {
  site_id: string;
  site_code: string;
  site_name: string;
  stage: string;
  company_id: string;
  missing_required: number;
  open_issues: number;
  can_open_site: boolean;
}

export function useHandoverHeader(siteId: string | undefined) {
  return useQuery<HandoverHeader | null, Error>({
    queryKey: ['construction-sites', siteId, 'handover-header'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_handover_header', { p_site_id: siteId! });
      if (error) throw new Error(error.message);
      return ((data ?? []) as HandoverHeader[])[0] ?? null;
    },
    enabled: Boolean(siteId),
  });
}

/** Tải tệp căn cứ của một mục vào kho — đường dẫn `<công trình>/<mục>/<tên>`. */
export async function uploadChecklistFile(siteId: string, itemId: string, file: File) {
  const safe = file.name.replace(/[^\w.-]+/g, '-').slice(-80);
  const path = `${siteId}/${itemId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from(HANDOVER_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export async function openChecklistFile(path: string) {
  const { data, error } = await supabase.storage.from(HANDOVER_BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? 'Không mở được tệp.');
  window.open(data.signedUrl, '_blank', 'noopener');
}

function useInvalidateSite() {
  const queryClient = useQueryClient();
  return (siteId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId] });
  };
}

interface EvidenceInput {
  siteId: string;
  itemId: string;
  note?: string;
  link?: string;
  file?: File | null;
}

export function useGiveHandoverItem() {
  const invalidate = useInvalidateSite();
  return useMutation<void, Error, EvidenceInput>({
    mutationFn: async ({ siteId, itemId, note, link, file }) => {
      const path = file ? await uploadChecklistFile(siteId, itemId, file) : null;
      const { error } = await supabase.rpc('give_handover_item', {
        p_item_id: itemId,
        p_note: note || null,
        p_link_url: link || null,
        p_attachment_path: path,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidate(v.siteId),
  });
}

export function useReceiveHandoverItem() {
  const invalidate = useInvalidateSite();
  return useMutation<
    void,
    Error,
    { siteId: string; itemId: string; accept: boolean; note?: string }
  >({
    mutationFn: async ({ itemId, accept, note }) => {
      const { error } = await supabase.rpc('receive_handover_item', {
        p_item_id: itemId,
        p_accept: accept,
        p_note: note || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidate(v.siteId),
  });
}

export function useConfirmStartCondition() {
  const invalidate = useInvalidateSite();
  return useMutation<void, Error, EvidenceInput & { done: boolean }>({
    mutationFn: async ({ siteId, itemId, note, link, file, done }) => {
      const path = file ? await uploadChecklistFile(siteId, itemId, file) : null;
      const { error } = await supabase.rpc('confirm_start_condition', {
        p_item_id: itemId,
        p_done: done,
        p_note: note || null,
        p_link_url: link || null,
        p_attachment_path: path,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      invalidate(v.siteId);
    },
  });
}

// --- Điều chỉnh ngân sách --------------------------------------------------------------------

export interface BudgetAdjustment {
  id: string;
  code: string | null;
  construction_site_id: string;
  project_budget_id: string | null;
  action: 'sua' | 'them' | 'xoa';
  cost_group: CostGroup;
  cost_code: string;
  name: string;
  old_amount: MoneyValue;
  new_amount: MoneyValue;
  delta: MoneyValue;
  reason: string;
  cause: string;
  responsibility: string;
  impact: string;
  status: 'cho_duyet' | 'da_duyet' | 'tu_choi' | 'huy';
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
  approval_id: string | null;
}

const ADJ_COLUMNS =
  'id, code, construction_site_id, project_budget_id, action, cost_group, cost_code, name, old_amount, new_amount, delta, reason, cause, responsibility, impact, status, requested_at, decided_at, decision_note, approval_id';

export function useBudgetAdjustments(siteId: string | undefined) {
  return useQuery<BudgetAdjustment[], Error>({
    queryKey: ['construction-sites', siteId, 'budget-adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_adjustments')
        .select(ADJ_COLUMNS)
        .eq('construction_site_id', siteId!)
        .order('requested_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as BudgetAdjustment[];
    },
    enabled: Boolean(siteId),
  });
}

export function useBudgetAdjustment(id: string | undefined) {
  return useQuery<
    (BudgetAdjustment & { site: { code: string; name: string } | null }) | null,
    Error
  >({
    queryKey: ['budget-adjustments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_adjustments')
        .select(`${ADJ_COLUMNS}, site:construction_sites(code, name)`)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as unknown as
        (BudgetAdjustment & { site: { code: string; name: string } | null }) | null;
    },
    enabled: Boolean(id),
  });
}

export function useCanRequestBudgetAdjustment(siteId: string | undefined) {
  return useQuery<boolean, Error>({
    queryKey: ['construction-sites', siteId, 'can-adjust-budget'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('auth_can_request_budget_adjustment', {
        p_site_id: siteId!,
      });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    enabled: Boolean(siteId),
  });
}

export interface BudgetAdjustmentInput {
  siteId: string;
  lineId: string | null;
  action: 'sua' | 'them' | 'xoa';
  costGroup: CostGroup;
  costCode: string;
  name: string;
  /** Số đồng dạng chuỗi chữ số (từ `MoneyInput`). */
  newAmount: string;
  reason: string;
  cause: string;
  responsibility: string;
  impact: string;
}

export function useRequestBudgetAdjustment() {
  const invalidate = useInvalidateSite();
  return useMutation<string, Error, BudgetAdjustmentInput>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('request_budget_adjustment', {
        p_site_id: i.siteId,
        p_line_id: i.lineId,
        p_action: i.action,
        p_cost_group: i.costGroup,
        p_cost_code: i.costCode,
        p_name: i.name,
        p_new_amount: i.newAmount || '0',
        p_reason: i.reason,
        p_cause: i.cause,
        p_responsibility: i.responsibility,
        p_impact: i.impact,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (_d, v) => invalidate(v.siteId),
  });
}

export function useCancelBudgetAdjustment() {
  const invalidate = useInvalidateSite();
  return useMutation<void, Error, { siteId: string; id: string; reason: string }>({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase.rpc('cancel_budget_adjustment', {
        p_id: id,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => invalidate(v.siteId),
  });
}

// --- Vượt ngân sách (hộp duyệt) --------------------------------------------------------------

export interface ApprovalBudgetBrief {
  site_code: string;
  site_name: string;
  cost_code: string;
  line_name: string | null;
  budgeted: MoneyValue;
  committed: MoneyValue;
  actual: MoneyValue;
  reserved: MoneyValue;
  remaining: MoneyValue;
  amount: MoneyValue;
  overrun: MoneyValue;
  tolerance_percent: number | null;
  checked_at: string;
  current_remaining: MoneyValue | null;
}

export function useApprovalBudgetBrief(approvalId: string | undefined, enabled: boolean) {
  return useQuery<ApprovalBudgetBrief | null, Error>({
    queryKey: ['approvals', approvalId, 'budget-brief'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('approval_budget_brief', {
        p_approval_id: approvalId!,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as ApprovalBudgetBrief[])[0] ?? null;
    },
    enabled: Boolean(approvalId) && enabled,
  });
}
