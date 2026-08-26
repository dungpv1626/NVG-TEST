/**
 * Danh mục pháp nhân — dùng khi màn hình GỘP nhiều pháp nhân ("Toàn NVG").
 *
 * Không lấy từ `profile.assignments`: danh sách đó chỉ có pháp nhân người dùng được GÁN vào,
 * mà Giám đốc Tài chính chỉ được gán vào NVG trong khi vẫn xem được dữ liệu cả ba pháp nhân
 * (vai trò có `sees_all_companies`). Dùng `assignments` thì cột "Pháp nhân" của họ sẽ trống.
 *
 * Danh mục này gần như không đổi nên giữ trong bộ nhớ đệm lâu, tránh gọi lại ở mọi màn hình.
 */

import { useQuery } from '@tanstack/react-query';
import type { CompanyCode } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface CompanyRecord {
  id: string;
  code: CompanyCode;
  short_name: string;
  is_transactional: boolean;
  display_order: number;
}

export function useCompanies(enabled = true) {
  return useQuery<CompanyRecord[], Error>({
    queryKey: ['companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, code, short_name, is_transactional, display_order')
        .is('deleted_at', null)
        .order('display_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as CompanyRecord[];
    },
    staleTime: 30 * 60_000,
    enabled,
  });
}

/**
 * Tra pháp nhân từ `company_id` của một dòng dữ liệu.
 *
 * `enabled` để tắt hẳn truy vấn khi màn hình KHÔNG gộp pháp nhân — lúc đó mọi dòng đều thuộc
 * cùng một pháp nhân đã hiện ở thanh bên, tra thêm là thừa một lượt gọi trên mỗi màn hình.
 */
export function useCompanyLookup(
  enabled = true,
): (companyId: string | null | undefined) => CompanyRecord | null {
  const { data } = useCompanies(enabled);
  return (companyId) => (companyId ? (data ?? []).find((c) => c.id === companyId) ?? null : null);
}
