-- ============================================================================
-- `request_quote_approval` chuyển sang SECURITY DEFINER, kèm kiểm quyền tường minh
--
-- Hệ quả cuối cùng của migration 0028.
--
-- Hàm này cố ý để `SECURITY INVOKER` từ 0013, với lý do ghi rõ trong migration đó: "giữ
-- INVOKER để chính RLS quyết định ai được gửi". Lý do đó đúng vào thời điểm ấy, nhưng nó
-- khiến câu `UPDATE quotes SET status = 'pending_approval'` bên trong chạy dưới vai trò
-- `authenticated` — không phân biệt được với một câu PATCH gõ thẳng vào PostgREST. Trigger
-- canh trạng thái ở 0028 vì thế chặn cả hàm.
--
-- KHÔNG nới lỏng trigger canh trạng thái để tránh chuyện này. Nới ra là mở lại đúng lỗ hổng
-- 0028 vừa bịt: `quotes.status` đặt tay được thì báo giá tự nhảy sang "đã duyệt" mà không
-- ai duyệt, và CRM-04 ("báo giá phải qua phê duyệt nội bộ trước khi gửi") mất hiệu lực.
--
-- Thay vào đó, chuyển hàm sang `SECURITY DEFINER` và diễn đạt TƯỜNG MINH đúng điều kiện mà
-- RLS đang ngầm áp: `rls_quote_writable(opportunity_id)` — chính là hàm mà policy
-- `quotes_update` của 0013 dùng. Quyền không đổi, chỉ chuyển từ ngầm sang rõ.
--
-- Đổi lại được một thứ có giá trị: thông báo lỗi nói đúng việc. Trước đây, người không có
-- quyền nhận được "Không tìm thấy báo giá" (vì RLS lọc mất dòng) — Content Guidelines 5.5
-- yêu cầu lỗi vượt quyền phải nói rõ AI xử lý được, không chỉ báo không thấy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_quote_approval(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  -- Điều kiện này trước đây do RLS áp ngầm qua SECURITY INVOKER. Nay khai tường minh vì
  -- hàm chạy dưới quyền chủ sở hữu và không còn bị RLS lọc.
  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội và quản lý trực tiếp mới gửi được báo giá này đi phê duyệt.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã gửi khách hàng. Tạo phiên bản mới nếu cần thay đổi giá.';
  END IF;

  IF q.status = 'pending_approval' THEN
    RAISE EXCEPTION 'Báo giá này đang chờ phê duyệt.';
  END IF;

  IF q.status = 'completed' THEN
    RAISE EXCEPTION 'Báo giá này đã được phê duyệt.';
  END IF;

  IF q.total_value IS NULL OR q.total_value <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị báo giá trước khi gửi phê duyệt.';
  END IF;

  -- CRM-05: giảm giá phải có căn cứ, vì đây chính là thứ Tổng Giám đốc cần để quyết định.
  IF COALESCE(q.discount_amount, 0) > 0
     AND (q.discount_reason IS NULL OR btrim(q.discount_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do giảm giá trước khi gửi phê duyệt.';
  END IF;

  IF COALESCE(q.discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Mức giảm giá không được là số âm.';
  END IF;

  IF COALESCE(q.discount_amount, 0) > q.total_value THEN
    RAISE EXCEPTION 'Mức giảm giá không được lớn hơn giá trị báo giá.';
  END IF;

  UPDATE public.quotes
     SET status = 'pending_approval', updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.request_quote_approval(uuid) IS
  'Gửi báo giá đi phê duyệt nội bộ (PRD CRM-04). Dòng trong Hộp thư Phê duyệt do trigger quotes_open_approval tạo.';
