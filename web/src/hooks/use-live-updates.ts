/**
 * Cập nhật tức thời (0188): nghe Supabase Realtime trên `notifications` và `approvals`, có sự
 * kiện thì tải lại dữ liệu đang hiện trên màn hình.
 *
 * Anh Dũng 22/10/2026: nhận việc hay được duyệt phải tải lại trang mới thấy. Thông báo trước
 * đây chỉ hỏi lại 60 giây một lần, Việc cần làm và trang hồ sơ thì không hỏi lại.
 *
 * Sự kiện chỉ là TÍN HIỆU «có thay đổi» — không đọc nội dung dòng trong sự kiện; dữ liệu tải lại
 * qua đường thường nên vẫn đi qua RLS và đúng một nguồn. Realtime cũng tự kiểm RLS SELECT trước
 * khi đẩy, nên người nhận chỉ được báo về dòng mình xem được.
 *
 * `invalidateQueries()` không kèm khoá: chỉ truy vấn ĐANG HIỆN được tải lại ngay, phần còn lại
 * đánh dấu cũ để lần mở sau tải mới. Dữ liệu không đổi thì React Query giữ nguyên tham chiếu,
 * ô đang gõ không bị vẽ lại. Gộp các sự kiện dồn dập (một lần duyệt sinh vài thông báo) bằng
 * một nhịp chờ ngắn.
 *
 * Mất kết nối Realtime thì vẫn còn lớp dự phòng `refetchInterval` của thông báo.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const COALESCE_MS = 400;

export function useLiveUpdates(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries();
      }, COALESCE_MS);
    };

    const channel = supabase
      .channel('nvg-live-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        refresh,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, refresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}
