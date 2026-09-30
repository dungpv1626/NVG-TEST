/**
 * Vai trò hiện tại có được xem số liệu tài chính và lãi/lỗ không — hỏi thẳng CSDL.
 *
 * Nhóm «ai được xem» sửa ở MỘT chỗ trong CSDL (`rls_sees_sensitive`, `rls_sees_finance` —
 * CLAUDE.md 3.4). Giao diện không chép lại danh sách vai trò: chép lại là có hai bản để lệch.
 *
 * Vì sao cần: quyền XEM phân hệ KT/BC rộng hơn quyền xem số tiền. Chỉ huy trưởng xem được phân
 * hệ KT (để gửi đề nghị), nhưng RLS lọc hết công nợ và dòng tiền — nếu vẫn hiện thẻ, thẻ nói
 * «0 đồng» và «Không còn khoản nào phải thu»: sai sự thật chứ không phải thiếu quyền.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SensitiveAccess {
  /** Được xem lãi/lỗ (Mẫu D, quyền `profit`). */
  profit: boolean;
  /** Được xem dòng tiền, công nợ của cả pháp nhân. */
  finance: boolean;
}

export function useSensitiveAccess() {
  return useQuery<SensitiveAccess, Error>({
    queryKey: ['sensitive-access'],
    queryFn: async () => {
      const [profit, finance] = await Promise.all([
        supabase.rpc('rls_sees_sensitive', { kind: 'profit' }),
        supabase.rpc('rls_sees_finance'),
      ]);
      // Hỏi không được thì coi như KHÔNG được xem: ẩn nhầm một thẻ còn hơn hiện một con số sai.
      return { profit: profit.data === true, finance: finance.data === true };
    },
    staleTime: 5 * 60 * 1000,
  });
}
