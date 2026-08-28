-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `save_attendance` không
-- kiểm biên `hours`/`overtime_hours` (0–24 giờ/ngày). Đây là RPC gọi THẲNG từ Frontend (không
-- qua Workers) — Zod ở giao diện chặn được thao tác bình thường, nhưng không phải hàng rào
-- thật ở biên hệ thống (CLAUDE.md 4.1: chỉ tin ràng buộc nội bộ, phải tự validate ở biên).
-- Giờ công âm hoặc phi thực tế lọt vào `timesheet_entries` sẽ đi thẳng vào `consolidate_timesheets`
-- và ra lương — sai số ở đây không có gì cảnh báo cho tới khi đối soát lương thủ công.
--
-- Vá: chặn hours/overtime_hours ngoài khoảng [0, 24] khi có giá trị (vẫn cho phép NULL —
-- dòng chấm công không phải lúc nào cũng có cả hai).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_attendance(p_period_id uuid, p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  p           record;
  item        jsonb;
  v_emp       record;
  v_kind      attendance_kind;
  v_date      date;
  v_hours     numeric;
  v_overtime  numeric;
  v_leave     uuid;
  v_count     integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.timesheet_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ chấm công này.';
  END IF;

  IF NOT public.rls_timesheet_period_writable(p_period_id) THEN
    RAISE EXCEPTION 'Không ghi công được vào kỳ này. Kỳ đã gửi xác nhận, hoặc vai trò hiện tại không phụ trách khối này.';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'Chưa có dòng chấm công nào để lưu.';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO v_emp FROM public.employees
     WHERE id = (item ->> 'employee_id')::uuid AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Có dòng chấm công trỏ tới hồ sơ nhân sự không tồn tại.';
    END IF;

    IF v_emp.company_id <> p.company_id THEN
      RAISE EXCEPTION 'Nhân sự % không thuộc pháp nhân của kỳ chấm công này.', v_emp.full_name;
    END IF;

    IF v_emp.block <> p.source_type THEN
      RAISE EXCEPTION 'Nhân sự % thuộc khối khác, không ghi công vào kỳ của khối này được.', v_emp.full_name;
    END IF;

    v_date := (item ->> 'work_date')::date;
    v_kind := COALESCE(item ->> 'kind', 'lam_viec')::attendance_kind;

    IF EXTRACT(YEAR FROM v_date)::int <> p.year OR EXTRACT(MONTH FROM v_date)::int <> p.month THEN
      RAISE EXCEPTION 'Ngày % không nằm trong kỳ chấm công tháng %/%.', to_char(v_date, 'DD/MM/YYYY'), p.month, p.year;
    END IF;

    v_hours := NULLIF(item ->> 'hours', '')::numeric;
    v_overtime := NULLIF(item ->> 'overtime_hours', '')::numeric;

    -- Chặn giờ công âm/phi thực tế ngay ở biên RPC, không chỉ tin Zod của Frontend (0084).
    IF v_hours IS NOT NULL AND (v_hours < 0 OR v_hours > 24) THEN
      RAISE EXCEPTION 'Số giờ công ngày % của % phải trong khoảng 0–24.', to_char(v_date, 'DD/MM/YYYY'), v_emp.full_name;
    END IF;
    IF v_overtime IS NOT NULL AND (v_overtime < 0 OR v_overtime > 24) THEN
      RAISE EXCEPTION 'Số giờ tăng ca ngày % của % phải trong khoảng 0–24.', to_char(v_date, 'DD/MM/YYYY'), v_emp.full_name;
    END IF;

    v_leave := NULL;
    IF v_kind = 'nghi_co_phep' THEN
      SELECT lr.id INTO v_leave FROM public.leave_requests lr
       WHERE lr.employee_id = v_emp.id
         AND lr.status = 'da_duyet'
         AND lr.deleted_at IS NULL
         AND v_date BETWEEN lr.from_date AND lr.to_date
       LIMIT 1;

      IF v_leave IS NULL THEN
        RAISE EXCEPTION 'Ngày % của % chưa có đơn nghỉ phép được duyệt. Lập đơn nghỉ phép trước, hoặc ghi là nghỉ không phép.',
          to_char(v_date, 'DD/MM/YYYY'), v_emp.full_name;
      END IF;
    END IF;

    INSERT INTO public.timesheet_entries (
      company_id, timesheet_period_id, employee_id, work_date, kind,
      hours, overtime_hours, output_quantity,
      subcontractor_id, construction_site_id, source, leave_request_id, notes,
      created_by, updated_by
    )
    VALUES (
      p.company_id, p_period_id, v_emp.id, v_date, v_kind,
      v_hours, v_overtime,
      NULLIF(item ->> 'output_quantity', '')::numeric,
      NULLIF(item ->> 'subcontractor_id', '')::uuid,
      COALESCE(NULLIF(item ->> 'construction_site_id', '')::uuid, v_emp.construction_site_id),
      COALESCE(NULLIF(item ->> 'source', ''), 'tay'),
      v_leave,
      NULLIF(item ->> 'notes', ''),
      v_user, v_user
    )
    ON CONFLICT (timesheet_period_id, employee_id, work_date) DO UPDATE
      SET kind = EXCLUDED.kind,
          hours = EXCLUDED.hours,
          overtime_hours = EXCLUDED.overtime_hours,
          output_quantity = EXCLUDED.output_quantity,
          subcontractor_id = EXCLUDED.subcontractor_id,
          construction_site_id = EXCLUDED.construction_site_id,
          source = EXCLUDED.source,
          leave_request_id = EXCLUDED.leave_request_id,
          notes = EXCLUDED.notes,
          updated_at = now(), updated_by = v_user;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.save_attendance(uuid, jsonb) IS
  'Ghi các dòng chấm công của một kỳ — chặn hours/overtime_hours ngoài 0–24 ở biên RPC (0084).';
