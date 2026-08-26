-- ============================================================================
-- 0033 — Sửa hai sai sót của 0032
--
-- Migration 0032 vá đúng lỗ hổng (đổi thẳng giai đoạn cơ hội bằng một câu UPDATE), nhưng bản
-- viết lại hàm `move_opportunity_stage` CHÉP TỪ MIGRATION 0009 — trong khi 0010 đã thay thân
-- hàm đó rồi. Hai hệ quả:
--
--   1. Lịch sử giai đoạn bị ghi HAI LẦN cho mỗi lần chuyển: một lần bởi câu INSERT còn sót
--      trong thân hàm cũ, một lần bởi trigger `opportunities_log_stage_change` mà 0010 dựng.
--      Số liệu phễu bán hàng (CRM-09, BC-03) đếm gấp đôi số lần chuyển bước.
--   2. Ghi chú đi kèm lần chuyển bị mất: 0010 truyền `p_note` sang trigger qua
--      `set_config('nvg.stage_note', …)`, bản chép lại không có bước đó.
--
-- Bài học lặp lại của 0030: khi sửa một hàm đã qua nhiều lần thay đổi, phải đọc BẢN MỚI NHẤT
-- của nó chứ không phải bản ở migration đặt tên giống chủ đề nhất.
--
-- Sai sót thứ hai: 0032 canh luôn cột `handed_over_at`, nhưng bàn giao cơ hội (CRM-06) CHƯA
-- được triển khai nên chưa có hàm nghiệp vụ nào ghi cột đó — canh vào là biến nó thành cột
-- không ai ghi được, và mất luôn phần kiểm thử "cơ hội đã bàn giao chuyển chế độ chỉ xem".
-- Canh một cột trước khi có nghiệp vụ ghi nó là áp một quy tắc chưa tồn tại. Đưa cột này trở
-- lại đúng lúc làm CRM-06, cùng với hàm bàn giao.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hàm chuyển giai đoạn — dựa trên bản 0010, thêm kiểm quyền tường minh
--
-- SECURITY DEFINER là bắt buộc để trigger canh trạng thái phân biệt được câu UPDATE này với
-- câu UPDATE của trình duyệt (cả hai đều chạy dưới vai trò `authenticated` nếu để INVOKER).
-- Đổi lại, RLS không còn tự gác nên phải tự kiểm — đúng bằng điều kiện của policy
-- `opportunities_update` ở 0009, không nới thêm chút nào.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_opportunity_stage(
  p_opportunity_id uuid,
  p_to_stage opportunity_stage,
  p_note text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  o      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT id, company_id, owner_id, stage, handed_over_at, deleted_at
    INTO o
    FROM public.opportunities
   WHERE id = p_opportunity_id
   FOR UPDATE;

  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;

  IF NOT public.rls_owner_can_write(o.company_id, o.owner_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội này mới chuyển được giai đoạn. Liên hệ % để được bàn giao.',
      COALESCE((SELECT u.full_name FROM public.users u WHERE u.id = o.owner_id), 'người phụ trách');
  END IF;

  IF o.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cơ hội đã bàn giao nên không đổi được giai đoạn.';
  END IF;

  IF o.stage = p_to_stage THEN
    RETURN;
  END IF;

  -- CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội" — không cho bỏ trống.
  IF p_to_stage = 'mat_co_hoi' AND (p_lost_reason IS NULL OR btrim(p_lost_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân mất cơ hội.';
  END IF;

  -- Ghi chú đi kèm lần chuyển này; phạm vi giao dịch, trigger đọc ngay sau đó.
  -- KHÔNG ghi lịch sử ở đây: trigger `opportunities_log_stage_change` (0010) lo việc đó, và
  -- ghi cả ở hai nơi là đếm gấp đôi số lần chuyển bước.
  PERFORM set_config('nvg.stage_note', COALESCE(p_note, ''), true);

  UPDATE public.opportunities
     SET stage       = p_to_stage,
         lost_reason = CASE WHEN p_to_stage = 'mat_co_hoi' THEN p_lost_reason ELSE lost_reason END,
         updated_at  = now(),
         updated_by  = v_user
   WHERE id = p_opportunity_id;
END;
$$;

COMMENT ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, text, text) IS
  'Chuyển giai đoạn pipeline sau khi kiểm tra quy tắc nghiệp vụ (PRD CRM-02, CRM-09). '
  'Lịch sử do trigger opportunities_log_stage_change ghi. SECURITY DEFINER từ 0032/0033 để '
  'trigger canh trạng thái phân biệt được với UPDATE của trình duyệt.';


-- ----------------------------------------------------------------------------
-- 2. Bỏ `handed_over_at` khỏi danh sách cột bị canh
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS opportunities_stage_guard ON public.opportunities;

CREATE TRIGGER opportunities_stage_guard
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'lost_reason'
  );
