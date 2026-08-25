-- ============================================================================
-- Sửa lỗi ép kiểu trong decide_approval
--
-- VẤN ĐỀ: câu lệnh cập nhật hồ sơ nguồn viết
--     SET status = CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END
-- Postgres suy kiểu của CASE gồm hai hằng chuỗi thành `text`, không tự khớp với cột kiểu
-- enum `status_group`, nên MỌI lần phê duyệt hoặc từ chối đều lỗi ngay lúc chạy:
--     42804  column "status" is of type status_group but expression is of type text
--
-- Không bắt được lúc tạo hàm: thân plpgsql chỉ phân tích kiểu khi thực thi lần đầu.
-- Đây chính là lý do bộ test RLS phải chạy thật với tài khoản thật — build xanh và
-- migration chạy trót lọt KHÔNG chứng minh được hàm nghiệp vụ hoạt động.
--
-- GIẢI PHÁP: ép kiểu tường minh về `status_group`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  -- Mẫu C (Backend Schema 3.3) — hàng rào thật sự của hàm này, vì SECURITY DEFINER
  -- khiến RLS không tự chặn.
  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;
  END IF;
END;
$$;
