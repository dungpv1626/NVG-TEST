/**
 * Tìm kiếm toàn hệ thống (AFD 5.3) — gọi thẳng hàm `global_search` (migration
 * `0057_global_search.sql`). Hàm đã SECURITY INVOKER nên kết quả tự động đúng phạm vi RLS
 * của người đang đăng nhập — hook này không lọc lại gì thêm.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface GlobalSearchResult {
  module_code: string;
  entity_type: string;
  entity_id: string;
  code: string;
  title: string;
  subtitle: string | null;
  path: string;
}

/** Dưới ngưỡng này không gọi CSDL — một, hai ký tự luôn ra quá nhiều dòng để có ích. */
export const SEARCH_MIN_LENGTH = 2;

export function useGlobalSearch(query: string) {
  const term = query.trim();

  return useQuery<GlobalSearchResult[], Error>({
    queryKey: ['global-search', term],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('global_search', { p_query: term });
      if (error) throw new Error(error.message);
      return (data ?? []) as GlobalSearchResult[];
    },
    enabled: term.length >= SEARCH_MIN_LENGTH,
    staleTime: 30_000,
  });
}
