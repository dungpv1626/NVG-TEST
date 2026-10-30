/**
 * Kế hoạch tuần (T3) và báo cáo tuần / tháng (T4) của công trường — migration 0242.
 *
 * Đầu việc + dấu tiến độ đọc / ghi thẳng bảng (RLS cùng nhật ký: Mẫu E). Số liệu báo cáo là HÀM
 * (`site_report_data`) — dựng từ dữ liệu đã có, không nhập thêm số nào. Gửi báo cáo là HÀM
 * (`send_site_report`): trình duyệt không ghi được bảng `site_reports`, số liệu do máy chụp.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SitePlanStatus, SiteReportData, SiteReportKind } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface SitePlanItem {
  id: string;
  construction_site_id: string;
  company_id: string;
  week_start: string;
  position: number;
  name: string;
  subcontractor_id: string | null;
  assigned_user_id: string | null;
  target_quantity: number | null;
  quantity_unit: string | null;
  site_milestone_id: string | null;
  note: string | null;
  status: SitePlanStatus;
  done_at: string | null;
  copied_from_id: string | null;
  created_at: string;
  crew: { name: string } | null;
  assignee: { full_name: string } | null;
  milestone: { label: string } | null;
  progress: { quantity_done: number | null; marked_done: boolean; site_log_id: string }[];
}

const PLAN_KEY = ['site-plan-items'] as const;
const REPORT_KEY = ['site-reports'] as const;

const PLAN_SELECT =
  'id, construction_site_id, company_id, week_start, position, name, subcontractor_id, assigned_user_id, ' +
  'target_quantity, quantity_unit, site_milestone_id, note, status, done_at, copied_from_id, created_at, ' +
  'crew:subcontractors!site_plan_items_subcontractor_id_fkey(name), ' +
  'assignee:users!site_plan_items_assigned_user_id_fkey(full_name), ' +
  'milestone:site_milestones!site_plan_items_site_milestone_id_fkey(label), ' +
  'progress:site_log_plan_progress(quantity_done, marked_done, site_log_id)';

/** Đầu việc của một tuần (`weekStart` = thứ Hai). */
export function useSitePlanItems(siteId: string | undefined, weekStart: string) {
  return useQuery<SitePlanItem[], Error>({
    queryKey: [...PLAN_KEY, siteId, weekStart],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_plan_items')
        .select(PLAN_SELECT)
        .eq('construction_site_id', siteId!)
        .eq('week_start', weekStart)
        .is('deleted_at', null)
        .order('position')
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SitePlanItem[];
    },
  });
}

/** Tên đầu việc đã dùng ở công trình — gợi ý thay gõ lại (mới nhất trước, không trùng). */
export function useSitePlanNameSuggestions(siteId: string | undefined) {
  return useQuery<{ name: string; quantity_unit: string | null }[], Error>({
    queryKey: [...PLAN_KEY, siteId, 'names'],
    enabled: Boolean(siteId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_plan_items')
        .select('name, quantity_unit, created_at')
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const seen = new Set<string>();
      const out: { name: string; quantity_unit: string | null }[] = [];
      for (const r of (data ?? []) as { name: string; quantity_unit: string | null }[]) {
        const k = r.name.toLocaleLowerCase('vi');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: r.name, quantity_unit: r.quantity_unit });
      }
      return out;
    },
  });
}

export interface NewSitePlanItem {
  construction_site_id: string;
  company_id: string;
  week_start: string;
  position: number;
  name: string;
  subcontractor_id: string | null;
  assigned_user_id: string | null;
  target_quantity: number | null;
  quantity_unit: string | null;
  site_milestone_id: string | null;
  note: string | null;
}

function useInvalidatePlan() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: PLAN_KEY });
    void queryClient.invalidateQueries({ queryKey: REPORT_KEY });
  };
}

export function useCreateSitePlanItem() {
  const invalidate = useInvalidatePlan();
  return useMutation<void, Error, NewSitePlanItem>({
    mutationFn: async (row) => {
      const { error } = await supabase.from('site_plan_items').insert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateSitePlanItem() {
  const invalidate = useInvalidatePlan();
  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<Pick<SitePlanItem, 'status' | 'name' | 'note'>>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase.from('site_plan_items').update(changes).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/**
 * Bỏ một đầu việc nhập nhầm — qua hàm `remove_site_plan_item` (0250). UPDATE thẳng `deleted_at`
 * từ trình duyệt luôn bị RLS chặn (chính sách đọc kiểm dòng MỚI có `deleted_at IS NULL`).
 */
export function useRemoveSitePlanItem() {
  const invalidate = useInvalidatePlan();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('remove_site_plan_item', { p_item_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useCopyUnfinishedPlanItems() {
  const invalidate = useInvalidatePlan();
  return useMutation<number, Error, { siteId: string; weekStart: string }>({
    mutationFn: async ({ siteId, weekStart }) => {
      const { data, error } = await supabase.rpc('copy_unfinished_plan_items', {
        p_site_id: siteId,
        p_week_start: weekStart,
      });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: invalidate,
  });
}

export interface PlanTick {
  planItemId: string;
  quantityDone: number | null;
  markedDone: boolean;
}

/** Ghi các dấu đầu việc của một mục nhật ký vừa lưu — một lệnh chèn. */
export function useRecordPlanProgress() {
  const invalidate = useInvalidatePlan();
  return useMutation<
    void,
    Error,
    { siteId: string; companyId: string; logId: string; ticks: PlanTick[] }
  >({
    mutationFn: async ({ siteId, companyId, logId, ticks }) => {
      if (ticks.length === 0) return;
      const { error } = await supabase.from('site_log_plan_progress').insert(
        ticks.map((t) => ({
          site_log_id: logId,
          plan_item_id: t.planItemId,
          construction_site_id: siteId,
          company_id: companyId,
          quantity_done: t.quantityDone,
          marked_done: t.markedDone,
        })),
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Báo cáo
// ---------------------------------------------------------------------------

/** Số liệu báo cáo dựng tại chỗ (chưa gửi) — xem trước trước khi gửi. */
export function useSiteReportData(siteId: string | undefined, kind: SiteReportKind, date: string) {
  return useQuery<SiteReportData, Error>({
    queryKey: [...REPORT_KEY, 'data', siteId, kind, date],
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_report_data', {
        p_site_id: siteId!,
        p_kind: kind,
        p_date: date,
      });
      if (error) throw new Error(error.message);
      return data as SiteReportData;
    },
  });
}

export interface SiteReportRecord {
  id: string;
  code: string;
  kind: SiteReportKind;
  construction_site_id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  highlights: string | null;
  problems: string | null;
  next_plan: string | null;
  sent_at: string;
  sender: { full_name: string } | null;
  site: { code: string; name: string } | null;
  company: { code: string; short_name: string | null } | null;
}

export interface SiteReportFull extends SiteReportRecord {
  data: SiteReportData;
}

const REPORT_SELECT =
  'id, code, kind, construction_site_id, company_id, period_start, period_end, highlights, problems, ' +
  'next_plan, sent_at, sender:users!site_reports_sent_by_fkey(full_name), ' +
  'site:construction_sites!site_reports_construction_site_id_fkey(code, name), ' +
  'company:companies!site_reports_company_id_fkey(code, short_name)';

/** Báo cáo đã gửi — của một công trình, hoặc mọi công trình người xem đọc được (RLS quyết). */
export function useSiteReports(filter: { siteId?: string; companyId?: string | null }) {
  return useQuery<SiteReportRecord[], Error>({
    queryKey: [...REPORT_KEY, 'list', filter.siteId ?? null, filter.companyId ?? null],
    queryFn: async () => {
      let q = supabase.from('site_reports').select(REPORT_SELECT);
      if (filter.siteId) q = q.eq('construction_site_id', filter.siteId);
      if (filter.companyId) q = q.eq('company_id', filter.companyId);
      const { data, error } = await q.order('sent_at', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteReportRecord[];
    },
  });
}

export function useSiteReport(id: string | undefined) {
  return useQuery<SiteReportFull | null, Error>({
    queryKey: [...REPORT_KEY, 'one', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_reports')
        .select(`${REPORT_SELECT}, data`)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as SiteReportFull | null) ?? null;
    },
  });
}

export function useSendSiteReport() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    {
      siteId: string;
      kind: SiteReportKind;
      date: string;
      highlights: string;
      problems: string;
      nextPlan: string;
    }
  >({
    mutationFn: async (v) => {
      const { data, error } = await supabase.rpc('send_site_report', {
        p_site_id: v.siteId,
        p_kind: v.kind,
        p_date: v.date,
        p_highlights: v.highlights,
        p_problems: v.problems,
        p_next_plan: v.nextPlan,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORT_KEY });
    },
  });
}
