/**
 * Danh sách nhân sự chọn được để giao việc.
 *
 * Lọc `is_active` chứ không chỉ `deleted_at`: NEN-10 quy định người nghỉ việc bị THU HỒI
 * QUYỀN TRUY CẬP nhưng hồ sơ vẫn giữ lại để lịch sử không đứt. Nếu ô chọn vẫn liệt kê họ,
 * người dùng sẽ giao việc cho một tài khoản không còn đăng nhập được — hồ sơ nằm đó không ai
 * xử lý mà nhìn vào vẫn thấy "đã phân công".
 *
 * Dùng chung cho mọi ô chọn người trong hệ thống, để không nơi nào quên bộ lọc này.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ActiveUser {
  id: string;
  full_name: string;
}

export function useActiveUsers() {
  return useQuery<ActiveUser[], Error>({
    queryKey: ['users', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ActiveUser[];
    },
  });
}
