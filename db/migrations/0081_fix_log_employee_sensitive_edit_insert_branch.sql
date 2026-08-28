-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: trigger
-- `log_employee_sensitive_edit` kiểm KHÔNG ĐỦ cột ở nhánh INSERT so với nhánh UPDATE.
--
-- Nhánh UPDATE kiểm đủ 4 cột lương (`base_salary, allowance, insurance_salary, salary_type`)
-- và đủ 3 cột hồ sơ cá nhân (`id_number, health_notes, discipline_notes`). Nhánh INSERT chỉ
-- kiểm 2/4 cột lương (`base_salary, allowance`) và 2/3 cột cá nhân (`id_number,
-- health_notes`) — tạo mới một nhân viên chỉ điền `insurance_salary`/`salary_type` hoặc chỉ
-- `discipline_notes` sẽ ÂM THẦM BỎ QUA việc ghi `sensitive_access_logs` (NEN-07 yêu cầu ghi
-- log mọi lượt xem/sửa dữ liệu Mẫu D).
--
-- Vá: nhánh INSERT kiểm đủ đúng bộ cột như nhánh UPDATE.
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

    IF (NEW.id_number, NEW.health_notes, NEW.discipline_notes)
       IS DISTINCT FROM (OLD.id_number, OLD.health_notes, OLD.discipline_notes) THEN
      PERFORM public.log_sensitive_access('personal', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Kiểm đủ 4 cột lương và 3 cột cá nhân — cùng bộ cột nhánh UPDATE kiểm (0081).
    IF NEW.base_salary IS NOT NULL OR NEW.allowance IS NOT NULL
       OR NEW.insurance_salary IS NOT NULL OR NEW.salary_type IS NOT NULL THEN
      PERFORM public.log_sensitive_access('salary', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
    IF NEW.id_number IS NOT NULL OR NEW.health_notes IS NOT NULL OR NEW.discipline_notes IS NOT NULL THEN
      PERFORM public.log_sensitive_access('personal', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.log_employee_sensitive_edit() IS
  'Ghi sensitive_access_logs khi tạo/sửa cột lương hoặc hồ sơ cá nhân của nhân viên (NEN-07). Nhánh INSERT kiểm đủ cùng bộ cột với UPDATE (0081).';
