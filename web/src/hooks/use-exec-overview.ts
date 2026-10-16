/**
 * «Tổng quan điều hành» — đọc `exec_overview` (0169). Một lời gọi cho cả trang: các ô được tính
 * ở CSDL theo đúng quy tắc «quá hạn» của các danh sách, không đếm lại ở trình duyệt.
 */

import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_REMINDER_DAYS, PENDING_APPROVAL_AGING_DAYS } from '@nvg/shared';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export type ExecLevel = 'red' | 'amber' | 'ok' | 'no_data';

export interface ExecItem {
  code: string | null;
  title: string | null;
  detail: string | null;
  link: string | null;
}

export interface ExecTile {
  key: string;
  area: string;
  label: string;
  level: ExecLevel;
  total: number | null;
  amount: string | null;
  link: string | null;
  note: string | null;
  items: ExecItem[];
}

/** Mốc nhắc gần nhất của giấy tờ nhân sự — một nguồn với nhắc việc của Nhân sự (shared/ns.ts). */
const HR_NOTICE_DAYS = Math.min(...DOCUMENT_REMINDER_DAYS.filter((d) => d > 7));

export function useExecOverview() {
  const scope = useCompanyScope();
  return useQuery<ExecTile[], Error>({
    queryKey: ['exec-overview', scope.isAggregate ? 'all' : scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('exec_overview', {
        p_company_id: scope.isAggregate ? null : scope.companyId,
        p_stale_days: PENDING_APPROVAL_AGING_DAYS,
        p_hr_notice_days: HR_NOTICE_DAYS,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ExecTile[];
    },
    enabled: scope.isReady,
  });
}

export interface ExecCompanyTile extends ExecTile {
  company_id: string;
  company_code: string;
  company_name: string;
}

/** Cùng các ô cảnh báo, tách theo từng pháp nhân giao dịch (`exec_overview_by_company`, 0170). */
export function useExecOverviewByCompany() {
  return useQuery<ExecCompanyTile[], Error>({
    queryKey: ['exec-overview', 'by-company'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('exec_overview_by_company', {
        p_stale_days: PENDING_APPROVAL_AGING_DAYS,
        p_hr_notice_days: HR_NOTICE_DAYS,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ExecCompanyTile[];
    },
  });
}

export interface CompanyPulseRow {
  company_id: string;
  company_code: string;
  company_name: string;
  metric: string;
  label: string;
  total: number;
  amount: string | null;
}

/** Hoạt động đang chạy của từng công ty (`exec_company_pulse`, 0170). */
export function useCompanyPulse() {
  return useQuery<CompanyPulseRow[], Error>({
    queryKey: ['exec-overview', 'pulse'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('exec_company_pulse');
      if (error) throw new Error(error.message);
      return (data ?? []) as CompanyPulseRow[];
    },
  });
}

export interface FinanceByCompany {
  revenue: bigint;
  signed: bigint;
  collected: bigint;
  paidOut: bigint;
}

/**
 * Tài chính tháng này theo từng công ty — dùng lại `finance_daily` (cùng nguồn với Dashboard và
 * báo cáo tài chính), gộp theo `company_id` ở đây. Khoá `null` = cả tập đoàn.
 */
export function useFinanceThisMonthByCompany() {
  return useQuery<Map<string | null, FinanceByCompany>, Error>({
    queryKey: ['exec-overview', 'finance-month'],
    queryFn: async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const { data, error } = await supabase.rpc('finance_daily', {
        p_from: from,
        p_to: to,
        p_company_id: null,
      });
      if (error) throw new Error(error.message);
      const out = new Map<string | null, FinanceByCompany>();
      const add = (k: string | null, r: Record<string, unknown>) => {
        const cur = out.get(k) ?? { revenue: 0n, signed: 0n, collected: 0n, paidOut: 0n };
        const big = (v: unknown) => BigInt(String(v ?? 0).split('.')[0] || '0');
        cur.revenue += big(r.revenue_accepted) + big(r.rental_revenue);
        cur.signed += big(r.contracts_signed);
        cur.collected += big(r.collected);
        cur.paidOut += big(r.paid_out);
        out.set(k, cur);
      };
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        add(String(r.company_id), r);
        add(null, r);
      }
      return out;
    },
  });
}
