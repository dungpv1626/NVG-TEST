-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `submit_leave_request`
-- không kiểm chồng lấn ngày nghỉ — một nhân viên có thể gửi phê duyệt hai đơn nghỉ phép có
-- khoảng ngày [from_date, to_date] chồng nhau, và cả hai đều có thể được duyệt độc lập (Hộp
-- thư Phê duyệt xét từng đơn riêng, không đối chiếu đơn khác của cùng người). Không phải câu
-- hỏi chính sách "còn bao nhiêu ngày phép" (NS-06, đang treo — CLAUDE.md 6.6), mà là tính toàn
-- vẹn của chính bảng `leave_requests`: hai đơn cùng ngày cùng được duyệt làm sai số ngày nghỉ
-- cộng dồn và gây nhầm lẫn phân công (ai cũng tưởng người kia đi làm bù).
--
-- Vá: chặn gửi phê duyệt nếu nhân viên đã có đơn KHÁC đang chờ duyệt hoặc đã duyệt
-- (`cho_duyet`/`da_duyet`) có khoảng ngày chồng lấn. Đơn nháp/đã từ chối/đã huỷ của người
-- khác không tính — đơn nháp chưa gửi thì không có gì để chồng lấn thật, còn tu_choi/da_huy
-- không còn hiệu lực.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_leave_request(p_leave_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  lr          record;
  emp         record;
  v_approval  uuid;
  v_conflict  record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO lr FROM public.leave_requests WHERE id = p_leave_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đơn nghỉ phép này.';
  END IF;

  IF NOT (public.rls_is_self_employee(lr.employee_id) OR public.rls_hr_manages()) THEN
    RAISE EXCEPTION 'Chỉ người lập đơn hoặc Phòng Hành chính – Nhân sự gửi được đơn này.';
  END IF;

  IF lr.status <> 'nhap' THEN
    RAISE EXCEPTION 'Đơn này đã được gửi đi.';
  END IF;

  IF lr.reason IS NULL OR btrim(lr.reason) = '' THEN
    RAISE EXCEPTION 'Chưa nêu lý do nghỉ. Nhập lý do trước khi gửi phê duyệt.';
  END IF;

  -- Chặn chồng lấn ngày với đơn khác đang chờ/đã duyệt của CHÍNH nhân viên này (0083).
  SELECT * INTO v_conflict FROM public.leave_requests o
   WHERE o.employee_id = lr.employee_id AND o.id <> lr.id AND o.deleted_at IS NULL
     AND o.status IN ('cho_duyet', 'da_duyet')
     AND o.from_date <= lr.to_date AND o.to_date >= lr.from_date
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Đã có đơn nghỉ phép % (từ % đến %) trùng ngày với đơn này.',
      COALESCE(v_conflict.code, ''), to_char(v_conflict.from_date, 'DD/MM/YYYY'),
      to_char(v_conflict.to_date, 'DD/MM/YYYY');
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = lr.employee_id;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    lr.company_id, 'leave_request', 'leave_requests', lr.id, lr.code,
    format('Đơn nghỉ phép — %s, %s ngày từ %s',
           emp.full_name, trim(to_char(lr.day_count, 'FM999990.99')),
           to_char(lr.from_date, 'DD/MM/YYYY')),
    NULL, lr.reason, 'pending_approval', v_user,
    -- Hạn duyệt là ngày bắt đầu nghỉ: duyệt sau đó thì người ta đã nghỉ rồi.
    lr.from_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.leave_requests
     SET status = 'cho_duyet', approval_id = v_approval, reject_reason = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = p_leave_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_leave_request(uuid) IS
  'Gửi phê duyệt đơn nghỉ phép — chặn chồng lấn ngày với đơn khác đang chờ/đã duyệt của cùng nhân viên (0083).';
