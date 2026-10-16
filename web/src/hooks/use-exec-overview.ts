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
