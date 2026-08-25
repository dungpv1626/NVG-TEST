-- ============================================================================
-- Ghi lịch sử chuyển giai đoạn bằng TRIGGER thay vì lệnh INSERT trong hàm
--
-- VẤN ĐỀ: `move_opportunity_stage` là SECURITY INVOKER (cố ý — để RLS vẫn kiểm tra người
-- gọi có quyền sửa cơ hội hay không). Nhưng lệnh INSERT vào `opportunity_stage_history`
-- bên trong hàm cũng chạy dưới quyền người gọi, mà bảng đó cố tình KHÔNG có policy INSERT
-- (lịch sử chỉ được ghi có kiểm soát). Kết quả: mọi lần chuyển giai đoạn đều lỗi 42501
-- "new row violates row-level security policy".
--
-- GIẢI PHÁP: chuyển việc ghi lịch sử sang AFTER UPDATE trigger chạy SECURITY DEFINER.
--
-- Đây không chỉ là cách vá lỗi — nó MẠNH HƠN cách cũ: dù cột `stage` bị đổi bằng đường nào
-- (hàm này, cập nhật trực tiếp, script quản trị), lịch sử vẫn được ghi. Không còn khả năng
-- đổi giai đoạn mà thiếu vết, đúng yêu cầu NEN-03.
--
-- Ghi chú `note` truyền sang trigger qua biến cấu hình phạm vi GIAO DỊCH
-- (`set_config(..., true)`), nên không rò rỉ sang phiên khác hay giao dịch khác.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_opportunity_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.opportunity_stage_history
      (opportunity_id, from_stage, to_stage, note, changed_by)
    VALUES (
      NEW.id,
      OLD.stage,
      NEW.stage,
      NULLIF(current_setting('nvg.stage_note', true), ''),
      COALESCE(public.auth_user_id(), NEW.updated_by)
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_opportunity_stage_change() IS
  'Ghi lịch sử mỗi khi cột stage đổi, bất kể đổi bằng đường nào (PRD NEN-03).';

CREATE TRIGGER opportunities_log_stage_change
  AFTER UPDATE OF stage ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.log_opportunity_stage_change();


-- Hàm chuyển giai đoạn chỉ còn lo QUY TẮC NGHIỆP VỤ và cập nhật cơ hội;
-- việc ghi vết do trigger đảm nhiệm.
CREATE OR REPLACE FUNCTION public.move_opportunity_stage(
  p_opportunity_id uuid,
  p_to_stage opportunity_stage,
  p_note text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER          -- giữ RLS: người gọi phải thực sự có quyền sửa cơ hội
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  v_from   opportunity_stage;
  v_handed timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT stage, handed_over_at INTO v_from, v_handed
  FROM public.opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;

  IF v_handed IS NOT NULL THEN
    RAISE EXCEPTION 'Cơ hội đã bàn giao nên không đổi được giai đoạn.';
  END IF;

  IF v_from = p_to_stage THEN
    RETURN;
  END IF;

  -- CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội" — không cho bỏ trống.
  IF p_to_stage = 'mat_co_hoi' AND (p_lost_reason IS NULL OR btrim(p_lost_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân mất cơ hội.';
  END IF;

  -- Ghi chú đi kèm lần chuyển này; phạm vi giao dịch, trigger đọc ngay sau đó.
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
  'Chuyển giai đoạn pipeline sau khi kiểm tra quy tắc nghiệp vụ (PRD CRM-02, CRM-09). Lịch sử do trigger opportunities_log_stage_change ghi.';
