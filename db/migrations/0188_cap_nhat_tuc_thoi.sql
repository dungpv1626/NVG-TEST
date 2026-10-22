-- 0188 — Cập nhật tức thời: thông báo và phê duyệt đi qua Supabase Realtime.
--
-- Anh Dũng 22/10/2026: «khi nhận task hay duyệt phải load lại trang mới nhận được thông báo
-- mới nhất». Trước đây trình duyệt hỏi lại 60 giây một lần (thông báo) hoặc chỉ khi tải trang
-- (Việc cần làm). Đưa hai bảng vào publication `supabase_realtime`: mỗi dòng thêm / sửa được
-- đẩy tới trình duyệt NGAY, và Realtime kiểm RLS SELECT của từng người nhận trước khi đẩy —
-- `notifications_own` (chỉ chủ thông báo), `approvals_select` (người gửi + người duyệt được) —
-- nên không ai nhận sự kiện của dòng mình không được xem. Trình duyệt coi sự kiện là tín hiệu
-- «có việc mới» rồi tải lại dữ liệu qua đường thường, không dùng nội dung sự kiện.
--
-- Chạy lại được; bỏ qua nếu CSDL không có publication (CSDL không phải Supabase).

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Không có publication supabase_realtime — bỏ qua';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['notifications', 'approvals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
