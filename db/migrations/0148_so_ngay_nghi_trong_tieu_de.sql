-- ============================================================================
-- Tiêu đề phê duyệt đơn nghỉ phép ghi «2. ngày» (thấy khi làm hướng dẫn Nhân sự, 01/10/2026).
--
-- `to_char(2.00, 'FM999990.99')` bỏ số 0 cuối nhưng GIỮ dấu chấm thập phân → «2.»; nửa ngày ra
-- «1.5» — dấu thập phân kiểu Anh (CGD 4.3 đòi «1,5»). Sửa cách in số ngày, thân hàm giữ nguyên,
-- và sửa lại tiêu đề các hồ sơ phê duyệt đã sinh.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_leave_request(p_leave_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           emp.full_name, replace(rtrim(to_char(lr.day_count, 'FM999990.99'), '.'), '.', ','),
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
$function$;

UPDATE public.approvals
   SET title = regexp_replace(regexp_replace(title, '([0-9])\. ngày', '\1 ngày'),
                              '([0-9])\.([0-9]+) ngày', '\1,\2 ngày')
 WHERE subject = 'leave_request' AND title ~ '[0-9]\.([0-9]+)? ngày';
