/**
 * Hợp đồng đã ký sắp tới ngày kết thúc (`contracts_expiring_soon`, 0218). Mốc số ngày là tham số
 * `hd.expiring_soon_days` (anh Dũng 22/10/2026: 90 ngày); để trống thì hàm không trả dòng nào.
 * Hàm SECURITY INVOKER — RLS hợp đồng quyết người xem thấy hợp đồng nào.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ExpiringContract {
  id: string;
  company_id: string;
  company_code: string;
  code: string;
  contract_number: string | null;
  title: string;
  end_date: string;
  days_left: number;
  responsible: string | null;
}

export function useExpiringContracts() {
  return useQuery<ExpiringContract[], Error>({
    queryKey: ['contracts', 'expiring-soon'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contracts_expiring_soon');
      if (error) throw error;
      return (data ?? []) as ExpiringContract[];
    },
  });
}

/** «Còn 12 ngày» / «Hết hạn hôm nay». */
export function daysLeftLabel(days: number): string {
  return days <= 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`;
}
