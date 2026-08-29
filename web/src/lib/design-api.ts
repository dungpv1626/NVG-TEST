/**
 * Gọi API của Module Thiết kế AI (Worker `nvg-api`, tiền tố `/design`).
 *
 * ⚠️ Đây là lớp gọi Worker ĐẦU TIÊN của `web/`. Mười hai module còn lại gọi thẳng Supabase và
 * đó vẫn là mặc định đúng (CLAUDE.md 3.1) — chỉ dùng lớp này khi thao tác thoả một trong ba
 * điều kiện của quy tắc đó. Việc chú giải hồ sơ thoả điều kiện (a): nó gọi mô hình nhúng bên
 * ngoài, thứ mà trình duyệt không được cầm khoá.
 *
 * Phần đọc danh sách và chi tiết bản ghi vẫn gọi thẳng Supabase — đừng thêm endpoint ở đây
 * cho việc RLS đã đủ sức làm.
 */

import { supabase } from './supabase';

/**
 * Địa chỉ Worker. Rỗng nghĩa là chưa cấu hình — trả câu tiếng Việt đọc được thay vì để
 * `fetch` ném ra một lỗi mạng khó hiểu ở giữa màn hình.
 */
const BASE = (import.meta.env.VITE_DESIGN_API_URL ?? '').replace(/\/+$/, '');

export class DesignApiError extends Error {}

export async function designApi<T>(path: string, body: unknown): Promise<T> {
  if (!BASE) {
    throw new DesignApiError(
      'Chưa cấu hình địa chỉ dịch vụ thiết kế. Quản trị hệ thống bổ sung biến VITE_DESIGN_API_URL rồi phát hành lại ứng dụng.',
    );
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DesignApiError('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DesignApiError(
      'Không kết nối được dịch vụ thiết kế. Kiểm tra đường truyền rồi thử lại.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    // Không hiện mã HTTP cho người dùng (CGD 5.5) — Worker đã trả sẵn câu tiếng Việt.
    throw new DesignApiError(
      payload.error ?? 'Không thực hiện được thao tác. Thử lại sau ít phút.',
    );
  }
  return payload as T;
}
