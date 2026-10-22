-- ============================================================================
-- Đợt 5 — 5E: Nhân sự — nhắc hợp đồng lao động sắp / đã hết hạn (doc/KE_HOACH_LAM_HO.md).
--
-- Bảng công dựng từ điểm danh KHÔNG làm ở đây (chặn bởi câu hỏi 6 — cách tính công).
--
--   · Tham số `ns.contract_remind_days` để TRỐNG (NVG chưa quyết, CLAUDE.md 5.2): trống thì chỉ
--     báo khi hợp đồng ĐÃ hết hạn; đặt số thì báo thêm trước N ngày. Mỗi mốc một lần; sửa ngày
--     kết thúc (gia hạn bằng phụ lục) thì nhắc lại từ đầu.
--   · Hợp đồng đã có hợp đồng KẾ TIẾP (ký lại / chuyển loại, bắt đầu sau) thì không nhắc.
--   · Người nhận: Hành chính – Nhân sự của pháp nhân. Câu thông báo chỉ có tên, mã hợp đồng, ngày
--     — KHÔNG có lương (Mẫu D: `salary_amount` không cấp quyền đọc).
--   · `ns_expiring_contracts()` cho màn hình «Việc cần xử lý» — SECURITY INVOKER: RLS quyết.
-- Chạy lại được.
-- ============================================================================

ALTER TABLE public.employment_contracts
  ADD COLUMN IF NOT EXISTS last_reminded_stage smallint;

COMMENT ON COLUMN public.employment_contracts.last_reminded_stage IS
  'Mốc nhắc hết hạn đã gửi (5E): 0 = đã hết hạn, 1 = trước hạn theo ns.contract_remind_days. Đổi ngày kết thúc thì xoá.';

CREATE OR REPLACE FUNCTION public.employment_contracts_reset_reminder()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    NEW.last_reminded_stage := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employment_contracts_reset_reminder ON public.employment_contracts;
CREATE TRIGGER employment_contracts_reset_reminder
  BEFORE UPDATE OF end_date ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.employment_contracts_reset_reminder();

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ns.contract_remind_days', 'global', NULL,
       'Nhắc trước khi hợp đồng lao động hết hạn (ngày)',
       'Số ngày trước ngày kết thúc hợp đồng thì báo Hành chính – Nhân sự. Để trống = chỉ báo khi đã hết hạn.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'ns.contract_remind_days' AND p.scope_type = 'global'
);

/** Hợp đồng đang hiệu lực có ngày kết thúc, nhân sự chưa nghỉ, chưa có hợp đồng kế tiếp. */
CREATE OR REPLACE FUNCTION public.ns_expiring_contracts()
RETURNS TABLE (
  contract_id   uuid,
  company_id    uuid,
  employee_id   uuid,
  employee_name text,
  contract_code text,
  contract_type public.employment_contract_type,
  end_date      date,
  days_left     integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, c.company_id, c.employee_id, e.full_name::text, c.code::text, c.type, c.end_date,
         (c.end_date - (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::integer
  FROM public.employment_contracts c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE c.deleted_at IS NULL
    AND c.status = 'dang_hieu_luc'
    AND c.end_date IS NOT NULL
    AND e.deleted_at IS NULL AND e.status <> 'da_nghi'
    AND NOT EXISTS (
      SELECT 1 FROM public.employment_contracts n
      WHERE n.employee_id = c.employee_id AND n.id <> c.id AND n.deleted_at IS NULL
        AND n.status IN ('nhap', 'dang_hieu_luc') AND n.start_date > c.start_date
    )
  ORDER BY c.end_date;
$$;

REVOKE ALL ON FUNCTION public.ns_expiring_contracts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ns_expiring_contracts() TO authenticated;

CREATE OR REPLACE FUNCTION public.scan_employment_contract_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c       record;
  v_lead  numeric := public.system_parameter_number('ns.contract_remind_days');
  v_stage smallint;
  v_sent  integer := 0;
BEGIN
  FOR c IN
    SELECT x.*, ec.last_reminded_stage
    FROM public.ns_expiring_contracts() x
    JOIN public.employment_contracts ec ON ec.id = x.contract_id
  LOOP
    v_stage := CASE
      WHEN c.days_left < 0 THEN 0
      WHEN v_lead IS NOT NULL AND c.days_left <= v_lead THEN 1
      ELSE NULL
    END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN c.last_reminded_stage IS NOT NULL AND c.last_reminded_stage <= v_stage;

    PERFORM public.create_notification(
      u.id, c.company_id, 'employment_contract_expiry',
      CASE WHEN v_stage = 0 THEN
        format('Hợp đồng lao động %s của %s đã hết hạn ngày %s — ký hợp đồng mới hoặc làm thủ tục kết thúc.',
               COALESCE(c.contract_code, ''), c.employee_name, to_char(c.end_date, 'DD/MM/YYYY'))
      ELSE
        format('Hợp đồng lao động %s của %s hết hạn ngày %s, còn %s ngày.',
               COALESCE(c.contract_code, ''), c.employee_name, to_char(c.end_date, 'DD/MM/YYYY'),
               c.days_left)
      END,
      'employment_contracts', c.contract_id, '/ns/viec-can-xu-ly'
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = c.company_id AND r.code = 'NS';

    UPDATE public.employment_contracts SET last_reminded_stage = v_stage WHERE id = c.contract_id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_employment_contract_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_employment_contract_reminders() TO service_role;
