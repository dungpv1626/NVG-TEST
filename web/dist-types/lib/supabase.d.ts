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
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
//# sourceMappingURL=supabase.d.ts.map