/**
 * Trung tâm Thông báo (Webapp Flow 5.4, NEN-03/04) — thông tin MỘT CHIỀU ("biết để đó"),
 * khác Việc cần làm (`use-approvals.ts`, "phải xử lý"). Nội dung đã dựng sẵn ở cột `message`
 * (Content Guidelines 5.3, hàm `create_notification` — `db/migrations/0021_da_rls.sql`), trình
 * duyệt chỉ đọc và đánh dấu đã đọc, KHÔNG tự soạn lại câu chữ.
 *
 * RLS Mẫu B (`notifications_own`/`notifications_mark_read`, `db/migrations/0005_...rls.sql`):
 * mỗi người chỉ thấy và chỉ sửa được thông báo của chính mình — không có ngoại lệ cho BGĐ.
 *
 * Huy hiệu đếm và panel liệt kê là HAI truy vấn khác nhau, cố ý — dữ liệu thử ở CSDL dùng
 * chung (CLAUDE.md 6.3) đã tích luỹ hàng nghìn thông báo chưa đọc cho một số tài khoản. Nếu
 * đếm bằng cách lọc trên danh sách 30 dòng gần nhất, huy hiệu sẽ báo sai (30 thay vì con số
 * thật), đúng kiểu lỗi CLAUDE.md 3.5 đã cảnh báo: "đếm bằng một truy vấn riêng thì hai con số
 * sớm muộn lệch nhau". `count: 'exact', head: true` không tải dữ liệu, chỉ lấy số — rẻ.
 *
 * ⚠️ CHƯA dùng Supabase Realtime dù BUILD_PLAN 1.4 có nhắc — bảng `notifications` chưa được
 * thêm vào publication `supabase_realtime`, và đây sẽ là lần đầu dùng cơ chế đó trong dự án
 * (chưa có tiền lệ nào khác để soi). Dùng tạm `refetchInterval` — đủ cho quy mô demo, nâng
 * cấp lên Realtime sau nếu cần cập nhật tức thời hơn 60 giây.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  actionUrl: string;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATIONS_QUERY_KEY = ['notifications'];
const UNREAD_COUNT_QUERY_KEY = ['notifications', 'unread-count'];

/** 30 thông báo gần nhất — đủ cho một panel thả xuống, không phải một màn hình lưu trữ. */
export function useNotifications() {
  return useQuery<AppNotification[], Error>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, action_url, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        type: r.type as string,
        message: r.message as string,
        actionUrl: r.action_url as string,
        readAt: r.read_at as string | null,
        createdAt: r.created_at as string,
      }));
    },
    refetchInterval: 60_000,
  });
}

/** Số CHƯA đọc THẬT SỰ — có thể lớn hơn số dòng đang hiện trong panel (giới hạn 30). */
export function useUnreadNotificationCount() {
  return useQuery<number, Error>({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

function invalidateNotificationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidateNotificationQueries(queryClient),
  });
}

/**
 * Đánh dấu TẤT CẢ thông báo chưa đọc của người dùng hiện tại — không chỉ 30 dòng đang hiện
 * trong panel. Nhãn nút ghi "tất cả" nên hành vi phải đúng nghĩa "tất cả", không phải "những
 * dòng đang nhìn thấy".
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidateNotificationQueries(queryClient),
  });
}
