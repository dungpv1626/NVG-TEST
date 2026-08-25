/**
 * Supabase client cho Frontend.
 *
 * Tech Stack Mục 2.3 và 5.6: Frontend gọi TRỰC TIẾP Supabase cho thao tác CRUD thông thường,
 * dùng khóa CÔNG KHAI (anon key) bị Row Level Security giới hạn hoàn toàn.
 *
 * ⚠️ KHÔNG BAO GIỜ đưa khóa `service_role` vào đây — khóa đó vượt qua RLS và chỉ được
 * dùng trong Cloudflare Workers cho tác vụ hệ thống.
 *
 * Quy tắc chọn lớp khi thêm tính năng (Tech Stack 3.2, CLAUDE.md 3.1):
 *  - Đọc/ghi một hoặc vài bảng, quyền diễn đạt được bằng RLS → gọi thẳng client này.
 *  - Cần gọi dịch vụ ngoài, ghi nhiều bảng toàn vẹn cùng lúc, hoặc quy tắc nghiệp vụ
 *    phức tạp hơn RLS → tạo endpoint trên Cloudflare Workers.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. ' +
      'Kiểm tra file .env ở gốc repo (xem .env.example).',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
