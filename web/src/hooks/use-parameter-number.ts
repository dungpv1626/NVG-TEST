/**
 * Đọc MỘT tham số số (phạm vi chung) của `system_parameters` — NEN-12.
 *
 * Trả `null` khi NVG chưa đặt: màn hình phải nói «Chưa cấu hình», không tự điền mặc định
 * (CLAUDE.md 5.2). Cùng quy ước `system_parameter_number()` phía CSDL.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useParameterNumber(key: string) {
  return useQuery<number | null, Error>({
    queryKey: ['system-parameter-number', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameters')
        .select('value')
        .eq('param_key', key)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const value = (data as { value: unknown } | null)?.value;
      return typeof value === 'number' ? value : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
