/**
 * Hợp đồng lao động tới hạn (Đợt 5 — 5E, migration 0207). Hàm `ns_expiring_contracts` chạy dưới
 * quyền người gọi (RLS quyết) và không trả cột lương.
 */

import { useQuery } from '@tanstack/react-query';
import type { EmploymentContractType } from '@nvg/shared';
import { supabase } from '@/lib/supabase';
import { useCompanyScope } from '@/lib/company-scope';

export interface ExpiringContract {
  contract_id: string;
  company_id: string;
  employee_id: string;
  employee_name: string;
  contract_code: string | null;
  contract_type: EmploymentContractType;
  end_date: string;
  days_left: number;
}

export function useExpiringContracts() {
  const scope = useCompanyScope();
  return useQuery<ExpiringContract[], Error>({
    queryKey: ['ns_expiring_contracts', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ns_expiring_contracts');
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ExpiringContract[];
      return scope.isAggregate || !scope.companyId
        ? rows
        : rows.filter((r) => r.company_id === scope.companyId);
    },
    enabled: scope.isReady,
  });
}
