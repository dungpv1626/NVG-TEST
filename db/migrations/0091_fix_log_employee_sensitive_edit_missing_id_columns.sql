-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `log_employee_sensitive_edit`
-- (sửa gần nhất ở 0081 cho lỗi khác — thiếu cột ở nhánh INSERT) vẫn thiếu HAI cột trong nhóm
-- "personal" ở CẢ hai nhánh UPDATE và INSERT: `id_issued_date`, `id_issued_place`.
--
-- Hai cột này được gate đọc là dữ liệu nhạy cảm nhóm 'personal' (0049_ns_rls.sql, cùng nhóm
-- với `id_number`/`health_notes`/`discipline_notes`) và cùng cấp quyền ghi qua GRANT cột —
-- nhưng KHÔNG nằm trong bộ so sánh IS DISTINCT FROM để quyết định có ghi
-- `sensitive_access_logs` hay không. Sửa riêng một mình `id_issued_place` (không đụng
-- `id_number`/`health_notes`/`discipline_notes` cùng lúc) là sửa xong mà không để lại dấu vết
-- nào — vi phạm thẳng PRD NEN-07 ("ghi nhật ký mọi lượt xem/sửa dữ liệu Mẫu D").
--
-- Vá: thêm `id_issued_date`, `id_issued_place` vào đúng bộ so sánh 'personal' ở cả hai nhánh,
-- giữ nguyên mọi phần khác (0081 vẫn đúng, không lặp lại lỗi CHỈ sửa một nhánh).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_employee_sensitive_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.base_salary, NEW.allowance, NEW.insurance_salary, NEW.salary_type)
       IS DISTINCT FROM (OLD.base_salary, OLD.allowance, OLD.insurance_salary, OLD.salary_type) THEN
      PERFORM public.log_sensitive_access('salary', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;

    IF (NEW.id_number, NEW.id_issued_date, NEW.id_issued_place, NEW.health_notes, NEW.discipline_notes)
       IS DISTINCT FROM
       (OLD.id_number, OLD.id_issued_date, OLD.id_issued_place, OLD.health_notes, OLD.discipline_notes) THEN
      PERFORM public.log_sensitive_access('personal', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Kiểm đủ 4 cột lương và 3 cột cá nhân — cùng bộ cột nhánh UPDATE kiểm (0081).
    IF NEW.base_salary IS NOT NULL OR NEW.allowance IS NOT NULL
       OR NEW.insurance_salary IS NOT NULL OR NEW.salary_type IS NOT NULL THEN
      PERFORM public.log_sensitive_access('salary', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
    IF NEW.id_number IS NOT NULL OR NEW.id_issued_date IS NOT NULL OR NEW.id_issued_place IS NOT NULL
       OR NEW.health_notes IS NOT NULL OR NEW.discipline_notes IS NOT NULL THEN
      PERFORM public.log_sensitive_access('personal', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.log_employee_sensitive_edit() IS
  'Ghi sensitive_access_logs khi tạo/sửa cột lương hoặc hồ sơ cá nhân của nhân viên (NEN-07). Nhánh INSERT kiểm đủ cùng bộ cột với UPDATE (0081); nhóm personal kiểm đủ cả id_issued_date/id_issued_place (0091).';
