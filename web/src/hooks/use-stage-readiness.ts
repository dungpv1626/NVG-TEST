/**
 * Điều kiện để sang từng bước của một hồ sơ — đọc thẳng `stage_readiness` của CSDL (0155).
 *
 * Cùng MỘT hàm với hàm chặn chuyển bước, nên dải tiến trình không thể nói «đủ điều kiện» trong
 * khi CSDL từ chối. Khoá truy vấn nằm dưới khoá gốc của module (`['opportunities', …]`), để mọi
 * lần làm mới dữ liệu cơ hội làm mới luôn điều kiện.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface StageRequirement {
  for_stage: string;
  requirement: string;
  met: boolean;
  label: string;
  /** Miễn được bằng lý do (0160 — bỏ qua khảo sát). */
  waivable: boolean;
}

const ROOT_KEY: Record<string, string> = {
  opportunity: 'opportunities',
};

export function useStageReadiness(entityType: 'opportunity', id: string | undefined) {
  return useQuery<StageRequirement[], Error>({
    queryKey: [ROOT_KEY[entityType], 'readiness', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('stage_readiness', {
        p_entity_type: entityType,
        p_id: id!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as StageRequirement[];
    },
    enabled: Boolean(id),
  });
}
