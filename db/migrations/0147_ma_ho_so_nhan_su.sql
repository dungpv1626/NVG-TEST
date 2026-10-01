-- ============================================================================
-- Hồ sơ nhân sự luôn có mã {PHÁP NHÂN}-NS-{NĂM}-{4 số}.
--
-- Phát hiện khi làm hướng dẫn Nhân sự (01/10/2026): chỉ hồ sơ sinh ra từ «nhận việc» ứng viên
-- (`hire_candidate`) mới được cấp mã; hồ sơ lập ở màn hình «Thêm hồ sơ nhân sự» để trống mã —
-- cột đầu của danh sách trống trơn, và tìm kiếm theo mã không ra. Cùng khuôn tài sản (0132):
-- cấp lúc INSERT, người dùng không tự đặt được mã. Hàm nghiệp vụ đã tự cấp mã (hire_candidate)
-- thì giữ nguyên mã đó, không cấp số thứ hai.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_company_code text;
BEGIN
  -- Cố ý KHÔNG SECURITY DEFINER: `current_user` phải là vai trò của câu lệnh gọi trigger —
  -- `authenticated` khi trình duyệt chèn thẳng qua REST (mã gửi lên bị bỏ, cấp qua
  -- `next_record_code` mà vai trò này được gọi), chủ hàm khi đi qua hàm nghiệp vụ đã cấp mã
  -- sẵn (`hire_candidate`) thì giữ nguyên, không cấp số thứ hai.
  IF current_user = 'authenticated' OR NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    SELECT code INTO v_company_code FROM public.companies WHERE id = NEW.company_id;
    IF v_company_code IS NULL THEN
      RAISE EXCEPTION 'Không cấp được mã hồ sơ nhân sự: chưa chọn pháp nhân.';
    END IF;
    IF current_user = 'authenticated' THEN
      NEW.code := public.next_record_code(v_company_code, 'NS');
    ELSE
      NEW.code := public.issue_record_code(v_company_code, 'NS');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_employee_code() IS
  'Cấp mã hồ sơ nhân sự {PHÁP NHÂN}-NS-{NĂM}-{4 số} lúc INSERT. Người dùng không tự đặt được mã.';

REVOKE ALL ON FUNCTION public.assign_employee_code() FROM anon, public;

DROP TRIGGER IF EXISTS employees_assign_code ON public.employees;
CREATE TRIGGER employees_assign_code
  BEFORE INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_employee_code();

-- Hồ sơ đang thiếu mã: cấp theo thứ tự tạo, năm theo năm tạo hồ sơ.
ALTER TABLE public.employees DISABLE TRIGGER employees_freeze_identity;
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT e.id, c.code AS company_code,
           EXTRACT(YEAR FROM (e.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS y
      FROM public.employees e
      JOIN public.companies c ON c.id = e.company_id
     WHERE e.code IS NULL OR btrim(e.code) = ''
     ORDER BY e.created_at
  LOOP
    UPDATE public.employees
       SET code = public.issue_record_code(r.company_code, 'NS', r.y)
     WHERE id = r.id;
  END LOOP;
END;
$$;
ALTER TABLE public.employees ENABLE TRIGGER employees_freeze_identity;
