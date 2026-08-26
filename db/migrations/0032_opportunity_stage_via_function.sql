-- ============================================================================
-- 0032 — Giai đoạn cơ hội chỉ đổi qua hàm nghiệp vụ
--
-- Migration 0028 đã bịt lỗ "đặt thẳng cột trạng thái" cho DA, TK, HD và báo giá của CRM,
-- nhưng BỎ SÓT chính bảng `opportunities`. Kiểm chứng bằng tài khoản thật cho thấy một câu
-- PATCH của PostgREST là đủ để:
--
--   - đưa cơ hội sang "Mất cơ hội" mà `lost_reason` vẫn rỗng — trong khi PRD CRM-09 liệt kê
--     "nguyên nhân mất cơ hội" là một trong các báo cáo bắt buộc. Báo cáo đó chỉ có nghĩa
--     khi KHÔNG có đường nào bỏ trống ô nguyên nhân;
--   - nhảy thẳng từ "Tiếp nhận" sang "Ký hợp đồng", bỏ qua toàn bộ phễu bán hàng, làm tỷ lệ
--     chuyển đổi theo từng bước (CRM-09, BC-03) mất ý nghĩa.
--
-- Lịch sử giai đoạn VẪN được ghi trong cả hai trường hợp (trigger của 0010), nên đây không
-- phải lỗ hổng truy vết — nó là lỗ hổng RÀNG BUỘC NGHIỆP VỤ. Đúng bài học của 0028: `USING`
-- quyết định ĐƯỢC ĐỤNG VÀO dòng nào, còn dòng đó BIẾN THÀNH GÌ thì phải kiểm riêng.
--
-- Cách vá giống hệt 0031: hàm nghiệp vụ vốn để SECURITY INVOKER cho RLS tự gác, nay chuyển
-- sang SECURITY DEFINER và kiểm quyền tường minh — vì trigger canh không phân biệt được một
-- câu UPDATE của trình duyệt với một câu UPDATE phát ra từ hàm INVOKER (cả hai đều chạy dưới
-- vai trò `authenticated`). Làm ngược lại — nới trigger cho INVOKER đi qua — là mở lại đúng
-- cái lỗ vừa bịt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Chuyển `move_opportunity_stage` sang SECURITY DEFINER, kiểm quyền tường minh
--
-- Điều kiện kiểm ở đây phải khớp ĐÚNG policy `opportunities_update` của migration 0009,
-- không nới thêm chút nào: cùng phạm vi pháp nhân, cùng quy tắc người chịu trách nhiệm.
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
  v_user  uuid := public.auth_user_id();
  o       record;
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

  -- Hàm chạy bằng quyền chủ sở hữu nên RLS không còn tự gác — phải tự kiểm, đúng bằng
  -- điều kiện của policy `opportunities_update`.
  IF NOT public.rls_owner_can_write(o.company_id, o.owner_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội này mới chuyển được giai đoạn. Liên hệ % để được bàn giao.',
      COALESCE((SELECT u.full_name FROM public.users u WHERE u.id = o.owner_id), 'người phụ trách');
  END IF;

  IF o.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cơ hội đã bàn giao nên không đổi được giai đoạn.';
  END IF;

  IF o.stage = p_to_stage THEN
    RETURN; -- không có gì thay đổi
  END IF;

  -- CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội" — không cho bỏ trống.
  IF p_to_stage = 'mat_co_hoi' AND (p_lost_reason IS NULL OR btrim(p_lost_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân mất cơ hội.';
  END IF;

  UPDATE public.opportunities
     SET stage       = p_to_stage,
         lost_reason = CASE WHEN p_to_stage = 'mat_co_hoi' THEN p_lost_reason ELSE lost_reason END,
         updated_at  = now(),
         updated_by  = v_user
   WHERE id = p_opportunity_id;

  INSERT INTO public.opportunity_stage_history
    (opportunity_id, from_stage, to_stage, note, changed_by)
  VALUES (p_opportunity_id, o.stage, p_to_stage, p_note, v_user);
END;
$$;

COMMENT ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, text, text) IS
  'Chuyển giai đoạn pipeline và ghi lịch sử trong cùng một giao dịch (PRD CRM-02, NEN-03). '
  'SECURITY DEFINER từ 0032 để trigger canh trạng thái phân biệt được với UPDATE của trình duyệt.';


-- ----------------------------------------------------------------------------
-- 2. Canh cột trạng thái của `opportunities`
--
-- `lost_reason` nằm trong danh sách canh cùng `stage`: nguyên nhân mất cơ hội phải được nêu
-- NGAY LÚC đánh dấu mất, không phải điền bù sau. Cho sửa rời rạc thì ô nguyên nhân lại có
-- đường bỏ trống, chỉ là đi vòng thêm một bước.
--
-- `handed_over_at` canh sẵn cho bàn giao CRM-06 (chưa triển khai): cột đó là thứ đóng băng
-- cả hồ sơ, đặt tay được nghĩa là tự khoá hồ sơ của mình mà chưa bàn giao gì.
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS opportunities_stage_guard ON public.opportunities;

CREATE TRIGGER opportunities_stage_guard
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'lost_reason', 'handed_over_at'
  );
