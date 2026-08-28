-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `move_opportunity_stage`
-- không chặn chuyển giai đoạn khi cơ hội đã ở một trong hai giai đoạn KẾT THÚC pipeline
-- (`ky_hop_dong`/`mat_co_hoi`, `isTerminal: true` — shared/src/crm.ts). Quy tắc "kết thúc rồi
-- không đổi được nữa" hiện CHỈ áp ở tầng giao diện (ẩn nút chuyển bước —
-- opportunity-detail.tsx, kanban-board.tsx `draggable={... && !column.isTerminal}`), KHÔNG có
-- ở tầng hàm CSDL — gọi thẳng RPC vẫn đổi được giai đoạn của một cơ hội đã chốt hoặc đã mất.
--
-- Hệ quả cụ thể: một cơ hội đã `mat_co_hoi` (có `lost_reason`) mà bị chuyển sang giai đoạn
-- khác qua đường này thì `lost_reason` VẪN GIỮ NGUYÊN (không có nhánh nào xoá nó khi
-- p_to_stage khác `mat_co_hoi`) — cơ hội đang "hoạt động lại" vẫn hiện nguyên nhân mất cơ hội
-- cũ trên Chi tiết. So sánh: `record_bid_result` (DA, cùng lớp nghiệp vụ) làm ĐÚNG việc xoá
-- lý do khi đảo ngược kết quả.
--
-- Vá: chặn NGAY Ở TẦNG HÀM khi cơ hội đã ở giai đoạn kết thúc — đúng nguyên tắc CLAUDE.md
-- "điều hướng phản ánh phân quyền/quy tắc, không chỉ ẩn nút giao diện". Sau khi chặn, đường
-- "hồi sinh cơ hội đã mất mà không xoá lost_reason" không còn gọi tới được nữa — không cần vá
-- riêng cột đó.
-- ============================================================================

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

  -- Giai đoạn kết thúc pipeline (ky_hop_dong/mat_co_hoi) không đổi tiếp được nữa (0076) — đúng
  -- ý đồ isTerminal ở giao diện, chặn thêm ở CSDL vì gọi thẳng RPC bỏ qua được kiểm tra UI.
  IF o.stage IN ('ky_hop_dong', 'mat_co_hoi') THEN
    RAISE EXCEPTION 'Cơ hội đã ở giai đoạn kết thúc, không đổi giai đoạn được nữa.';
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
  'Chặn chuyển tiếp khi đã ở giai đoạn kết thúc pipeline (0076). '
  'Lịch sử do trigger opportunities_log_stage_change ghi. SECURITY DEFINER từ 0032/0033 để '
  'trigger canh trạng thái phân biệt được với UPDATE của trình duyệt.';
