-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `hire_candidate` kiểm
-- `rp.hired_count >= rp.headcount` từ một `SELECT` KHÔNG khoá dòng `recruitment_positions`,
-- rồi sau đó mới `UPDATE ... SET hired_count = rp.hired_count + 1`. Hai lượt gọi
-- `hire_candidate` cho hai ứng viên khác nhau cùng vị trí, gần như đồng thời, có thể cùng đọc
-- `hired_count` cũ và cùng qua được điều kiện chặn trước khi cái nào commit trước — tuyển
-- vượt `headcount` mà không có exception nào chặn. Khả năng thấp trong thao tác tay bình
-- thường của HR nhưng vẫn là một khoảng hở race thật, cùng lớp đã vá ở `advance_payment_step`
-- (payment_requests FOR UPDATE) và `record_payment` (0078, advances FOR UPDATE).
--
-- Vá: khoá dòng `recruitment_positions FOR UPDATE` trước khi kiểm, để hai lượt gọi cùng vị
-- trí tuần tự hoá tại chính câu khoá này.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hire_candidate(
  p_candidate_id uuid,
  p_hire_date date,
  p_position text DEFAULT NULL,
  p_probation_end_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  c              record;
  rp             record;
  v_company_code text;
  v_employee     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.recruitment_candidates WHERE id = p_candidate_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id) OR NOT public.rls_hr_manages() THEN
    RAISE EXCEPTION 'Không thao tác được trên hồ sơ ứng viên này.';
  END IF;

  IF c.employee_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ứng viên này đã có hồ sơ nhân sự.';
  END IF;

  IF c.stage <> 'moi_nhan_viec' THEN
    RAISE EXCEPTION 'Chỉ ứng viên đã nhận thư mời mới chuyển thành nhân sự được.';
  END IF;

  IF p_hire_date IS NULL THEN
    RAISE EXCEPTION 'Chưa có ngày vào làm.';
  END IF;

  -- FOR UPDATE: hai ứng viên cùng vị trí tuyển gần như đồng thời sẽ tuần tự hoá ở đây thay vì
  -- cùng đọc hired_count cũ và cùng qua được điều kiện chặn (0082).
  SELECT * INTO rp FROM public.recruitment_positions WHERE id = c.recruitment_position_id FOR UPDATE;

  IF rp.hired_count >= rp.headcount THEN
    RAISE EXCEPTION 'Vị trí này đã tuyển đủ % người.', rp.headcount;
  END IF;

  SELECT code INTO v_company_code FROM public.companies WHERE id = c.company_id;

  INSERT INTO public.employees (
    company_id, code, full_name, block, department, position, status,
    hire_date, probation_end_date, phone, email, created_by, updated_by
  )
  VALUES (
    c.company_id, public.next_record_code(v_company_code, 'NS'), c.full_name,
    rp.block, rp.department, COALESCE(NULLIF(btrim(COALESCE(p_position, '')), ''), rp.title),
    'thu_viec', p_hire_date, p_probation_end_date, c.phone, c.email, v_user, v_user
  )
  RETURNING id INTO v_employee;

  UPDATE public.recruitment_candidates
     SET stage = 'nhan_viec', employee_id = v_employee,
         updated_at = now(), updated_by = v_user
   WHERE id = p_candidate_id;

  UPDATE public.recruitment_positions
     SET hired_count = rp.hired_count + 1,
         status = CASE WHEN rp.hired_count + 1 >= rp.headcount
                       THEN 'da_tuyen_du'::recruitment_position_status
                       ELSE status END,
         updated_at = now(), updated_by = v_user
   WHERE id = rp.id;

  PERFORM public.start_onboarding(v_employee, p_hire_date);

  RETURN v_employee;
END;
$$;

COMMENT ON FUNCTION public.hire_candidate(uuid, date, text, date) IS
  'Chuyển ứng viên đã nhận thư mời thành nhân viên chính thức (NS-02) — khoá dòng vị trí tuyển FOR UPDATE để tránh tuyển vượt headcount khi hai lượt gọi cùng lúc (0082).';
