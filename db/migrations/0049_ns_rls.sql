-- ============================================================================
-- Module NS — phân quyền và luồng nghiệp vụ hành chính, nhân sự
--
-- Nguồn: PRD NS-01 → NS-11, Backend Schema 4.10, Webapp Flow 3.8 + 7.
--
-- Năm thứ file này phải giữ được, xếp theo thiệt hại nếu mất:
--
--  1. LƯƠNG VÀ CĂN CƯỚC KHÔNG HIỂN THỊ ĐẠI TRÀ (PRD NS ranh giới, NEN-07). Các cột đó bị
--     THU HỒI quyền đọc ở tầng CSDL, không phải ẩn ở giao diện: PostgREST cho phép gọi thẳng
--     bảng, nên cột nào không được phép đọc thì phải không đọc được, kể cả khi biết tên cột.
--     Đọc qua `employee_private_details` — có ghi `sensitive_access_logs` từng lượt.
--  2. BẢNG CÔNG ĐÃ CHỐT LÀ CHỐT THẬT (NS-04). Sau khi HCNS chốt kỳ, không ai UPDATE được số
--     công nữa; muốn sửa phải đi qua `adjust_timesheet` — hàm bắt buộc nêu lý do và ghi tên
--     người phê duyệt vào bảng lịch sử. Đây là nguyên văn yêu cầu của NS-04.
--  3. KHÔNG CHỐT CÔNG THAY NGƯỜI CHỊU TRÁCH NHIỆM (NS-04). Kỳ chỉ chốt được khi CẢ BA khối
--     của tháng đó đã được trưởng đơn vị xác nhận. HCNS là đầu mối tổng hợp, không phải
--     người thay mặt xác nhận số liệu của khối khác.
--  4. TÀI SẢN ĐANG GIỮ PHẢI TỰ HIỆN RA KHI NGHỈ VIỆC (NS-08, NS-11). `offboard_employee`
--     sinh checklist bàn giao gồm ĐÚNG những tài sản người đó đang giữ. Ghi cứng một dòng
--     "thu hồi tài sản" thì người làm thủ tục vẫn phải đi tìm xem thu hồi cái gì.
--  5. PHẦN MỀM KHÔNG TỰ QUYẾT VIỆC CỦA NGƯỜI (PRD NS ranh giới). Không có hàm nào ở đây tự
--     kết luận đạt/không đạt thử việc, tự chọn ứng viên, tự tính lương hay tự kỷ luật. Hàm
--     chỉ tổng hợp số liệu và nhắc hạn; quyết định luôn do người có thẩm quyền bấm.
--
-- ⚠️ NS-06 (công thức lương) KHÔNG có trong file này. PRD Mục 10 ghi quy chế lương phải do
--    Kế toán – HCNS xác nhận trước khi cấu hình. Ở đây dừng ở chỗ ĐẾM công và bàn giao số
--    liệu đã chốt sang Kế toán.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Khóa ngoại còn thiếu, ràng buộc dữ liệu, bộ theo dõi chuẩn
--
-- Ba khóa ngoại dưới đây không khai được ở tầng Drizzle vì tạo vòng tham chiếu giữa các
-- bảng khai sau nhau — cùng cách Module KT đã xử lý ở migration 0043.
-- ----------------------------------------------------------------------------

ALTER TABLE public.hr_documents
  ADD CONSTRAINT hr_documents_labor_worker_fk
  FOREIGN KEY (labor_worker_id) REFERENCES public.labor_workers(id) ON DELETE CASCADE;

ALTER TABLE public.timesheet_entries
  ADD CONSTRAINT timesheet_entries_leave_request_fk
  FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON DELETE SET NULL;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_approval_fk
  FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;

ALTER TABLE public.recruitment_positions
  ADD CONSTRAINT recruitment_positions_approval_fk
  FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;

-- Một giấy tờ thuộc về ĐÚNG MỘT người: hoặc nhân sự chính thức, hoặc lao động thời vụ.
-- Không ràng buộc thì một dòng treo lơ lửng không thuộc ai vẫn lọt vào danh sách nhắc hạn.
ALTER TABLE public.hr_documents
  ADD CONSTRAINT hr_documents_owner_check
  CHECK (num_nonnulls(employee_id, labor_worker_id) = 1);

ALTER TABLE public.timesheet_periods
  ADD CONSTRAINT timesheet_periods_month_check CHECK (month BETWEEN 1 AND 12);

ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_month_check CHECK (month BETWEEN 1 AND 12);

ALTER TABLE public.payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_month_check CHECK (month BETWEEN 1 AND 12);

-- Số tiền thưởng/phạt không âm: chiều của khoản nằm ở `kind`, không nằm ở dấu của số tiền.
-- Cho phép số âm thì một khoản "phạt -5 triệu" thành ra thưởng mà không ai đọc ra.
ALTER TABLE public.payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_amount_check CHECK (amount >= 0);

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_date_check CHECK (to_date >= from_date);

SELECT public.attach_audit_touch('public.employees');
SELECT public.attach_audit_touch('public.employment_contracts');
SELECT public.attach_audit_touch('public.hr_documents');
SELECT public.attach_audit_touch('public.timesheet_periods');
SELECT public.attach_audit_touch('public.timesheet_entries');
SELECT public.attach_audit_touch('public.timesheets');
SELECT public.attach_audit_touch('public.leave_requests');
SELECT public.attach_audit_touch('public.payroll_adjustments');
SELECT public.attach_audit_touch('public.recruitment_positions');
SELECT public.attach_audit_touch('public.recruitment_candidates');
SELECT public.attach_audit_touch('public.assets');
SELECT public.attach_audit_touch('public.asset_events');
SELECT public.attach_audit_touch('public.hr_checklists');
SELECT public.attach_audit_touch('public.hr_checklist_items');
SELECT public.attach_audit_touch('public.labor_workers');

CREATE TRIGGER employees_freeze_identity
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

CREATE TRIGGER employment_contracts_freeze_identity
  BEFORE UPDATE ON public.employment_contracts
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'employee_id');

CREATE TRIGGER timesheet_periods_freeze_identity
  BEFORE UPDATE ON public.timesheet_periods
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'year', 'month', 'source_type'
  );

CREATE TRIGGER timesheet_entries_freeze_identity
  BEFORE UPDATE ON public.timesheet_entries
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'timesheet_period_id', 'employee_id', 'work_date'
  );

CREATE TRIGGER timesheets_freeze_identity
  BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'timesheet_period_id', 'employee_id', 'year', 'month'
  );

CREATE TRIGGER leave_requests_freeze_identity
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'employee_id');

CREATE TRIGGER assets_freeze_identity
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

/*
 * Cột chỉ đổi được qua hàm nghiệp vụ (migration 0028).
 *
 * `status` của kỳ chấm công nằm trong danh sách vì đó là ranh giới "còn sửa được hay không"
 * của toàn bộ NS-04: đặt thẳng `da_chot` bằng một câu UPDATE là bỏ qua cả bước xác nhận của
 * trưởng đơn vị lẫn bước tổng hợp của HCNS.
 */
CREATE TRIGGER timesheet_periods_stage_guard
  BEFORE UPDATE ON public.timesheet_periods
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'confirmed_by', 'confirmed_at', 'closed_by', 'closed_at'
  );

-- Số công đã chốt: mọi cột số của `timesheets` chỉ đổi qua `adjust_timesheet` (NS-04).
CREATE TRIGGER timesheets_stage_guard
  BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'workdays', 'worked_hours', 'overtime_hours', 'leave_days', 'unpaid_absence_days',
    'holiday_days', 'business_trip_days', 'output_quantity',
    'bonus_amount', 'penalty_amount', 'closed_at', 'transferred_at', 'transferred_by'
  );

CREATE TRIGGER leave_requests_stage_guard
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'approval_id', 'decided_at', 'reject_reason'
  );

CREATE TRIGGER recruitment_positions_stage_guard
  BEFORE UPDATE ON public.recruitment_positions
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'approval_id', 'approved_at', 'hired_count'
  );

-- Hiện trạng tài sản là hệ quả của biên bản gần nhất (NS-08) — đổi tay hai cột này thì lịch
-- sử và hiện trạng lệch nhau ngay lần đầu.
CREATE TRIGGER assets_stage_guard
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'current_holder_id', 'condition'
  );

-- Ngày nghỉ việc do `offboard_employee` ghi; đặt tay thì checklist bàn giao không tồn tại.
CREATE TRIGGER employees_stage_guard
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only('termination_date');


-- ----------------------------------------------------------------------------
-- 1. Ai nhìn thấy hồ sơ nhân sự — PRD NS ranh giới, NEN-07
--
-- Backend Schema 4.10 xếp `employees` vào Mẫu B (theo người chịu trách nhiệm). "Người chịu
-- trách nhiệm" của một hồ sơ nhân sự KHÔNG phải người tạo ra nó mà là Hành chính – Nhân sự;
-- ngoài họ còn ba nhóm phải đọc được, mỗi nhóm vì một lý do nghiệp vụ khác nhau:
--
--   - CHÍNH MÌNH: xem hồ sơ, đơn nghỉ phép và bảng công của mình là quyền tối thiểu.
--   - QUẢN LÝ TRỰC TIẾP: NS-04 giao trưởng đơn vị xác nhận công của người mình quản lý.
--   - CHỈ HUY CÔNG TRƯỜNG: NS-04 giao họ ghi quân số hằng ngày, nên phải đọc được danh sách
--     nhân sự đang làm ở công trường đó.
--
-- Ban Giám đốc và Quản trị hệ thống đi qua `auth_can_view_module('NS')` như mọi module khác.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_hr_manages()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_can_edit_module('NS');
$$;

COMMENT ON FUNCTION public.rls_hr_manages() IS
  'Ai sửa được hồ sơ nhân sự — Hành chính – Nhân sự và Quản trị hệ thống (NS-01).';


CREATE OR REPLACE FUNCTION public.rls_employee_readable(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id
       AND e.deleted_at IS NULL
       AND public.rls_company_access(e.company_id)
       AND (
         public.auth_can_view_module('NS')
         OR e.user_id = public.auth_user_id()
         OR e.manager_user_id = public.auth_user_id()
         OR (e.construction_site_id IS NOT NULL AND public.rls_site_writable(e.construction_site_id))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_employee_readable(uuid) IS
  'Đọc được hồ sơ nhân sự này không — HCNS, chính mình, quản lý trực tiếp, chỉ huy công trường (NS-01, NS-04).';


/**
 * Là hồ sơ của CHÍNH người đang đăng nhập.
 *
 * Tách riêng vì nhiều bảng con dùng lại: đơn nghỉ phép, bảng công, thưởng – phạt của mình
 * thì mình xem được mà không cần quyền xem module NS.
 */
CREATE OR REPLACE FUNCTION public.rls_is_self_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id
       AND e.deleted_at IS NULL
       AND e.user_id = public.auth_user_id()
  );
$$;

COMMENT ON FUNCTION public.rls_is_self_employee(uuid) IS
  'Hồ sơ nhân sự này là của chính người đang đăng nhập.';


/**
 * Ai ghi được công cho một kỳ — NS-04.
 *
 * Ba khối ba người ghi khác nhau, và đó KHÔNG phải chi tiết trang trí: giao cho HCNS ghi hộ
 * công trường là quay lại đúng hiện trạng Excel mà PRD Mục 1.2 mô tả. Chỉ huy trưởng ghi
 * quân số khối công trường, HCNS ghi khối văn phòng và xưởng (xưởng chưa có khảo sát riêng
 * — xem PRD Mục 10; khi có Module SX thì thêm điều kiện vai trò xưởng ở ĐÚNG hàm này).
 *
 * Điều kiện chung: kỳ phải còn ở bước `dang_ghi`. Sau khi gửi xác nhận thì số liệu đứng yên.
 */
CREATE OR REPLACE FUNCTION public.rls_timesheet_period_writable(p_period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_periods p
     WHERE p.id = p_period_id
       AND p.status = 'dang_ghi'
       AND public.rls_company_access(p.company_id)
       AND (
         public.rls_hr_manages()
         OR (p.source_type = 'cong_truong' AND public.auth_can_edit_module('TC'))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_timesheet_period_writable(uuid) IS
  'Ghi được công vào kỳ này không — HCNS mọi khối, chỉ huy công trường với khối công trường (NS-04).';


-- ----------------------------------------------------------------------------
-- 2. Chính sách RLS từng bảng
--
-- Event trigger `ensure_rls` của Supabase đã tự bật RLS cho bảng mới; lệnh ENABLE dưới đây
-- là dư nhưng giữ lại để migration tự mô tả đầy đủ (xem CLAUDE.md 3.4).
-- ----------------------------------------------------------------------------

ALTER TABLE public.employees              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employment_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_adjustments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_adjustments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_checklists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_checklist_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_workers          ENABLE ROW LEVEL SECURITY;


-- --- Hồ sơ nhân sự (NS-01) --------------------------------------------------

CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR user_id = public.auth_user_id()
      OR manager_user_id = public.auth_user_id()
      OR (construction_site_id IS NOT NULL AND public.rls_site_writable(construction_site_id))
    )
  );

CREATE POLICY employees_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('NS', company_id));

CREATE POLICY employees_update ON public.employees
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_hr_manages()
  )
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());


-- --- Hợp đồng lao động (NS-07) ----------------------------------------------
--
-- Hẹp hơn hồ sơ nhân sự một bậc: chỉ HCNS và chính người lao động: hợp đồng có mức lương ghi
-- trên đó, mà lương là dữ liệu hạn chế chặt nhất của module này.

CREATE POLICY employment_contracts_select ON public.employment_contracts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (public.auth_can_view_module('NS') OR public.rls_is_self_employee(employee_id))
  );

CREATE POLICY employment_contracts_write ON public.employment_contracts
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_hr_manages()
  )
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());

-- Cột lương trên hợp đồng: thu hồi quyền đọc trực tiếp, đọc qua hàm có ghi nhật ký (mục 3).
-- ⚠️ Cú pháp phải viết danh sách cột cho TỪNG quyền: `GRANT SELECT, UPDATE (cols)` bị
-- Postgres hiểu là cấp SELECT ở mức BẢNG rồi mới tới UPDATE theo cột.
REVOKE SELECT, INSERT, UPDATE ON public.employment_contracts FROM authenticated, anon;

GRANT
  SELECT (
    id, company_id, employee_id, code, type, status, start_date, end_date,
    signed_date, signed_by, insurance_status, insurance_from_date, insurance_to_date,
    notes, created_at, updated_at, created_by, updated_by, deleted_at
  ),
  INSERT (
    id, company_id, employee_id, code, type, status, start_date, end_date,
    signed_date, signed_by, salary_amount, insurance_status, insurance_number,
    insurance_from_date, insurance_to_date, notes
  ),
  UPDATE (
    type, status, start_date, end_date, signed_date, signed_by, salary_amount,
    insurance_status, insurance_number, insurance_from_date, insurance_to_date,
    notes, updated_at, updated_by, deleted_at
  )
ON public.employment_contracts TO authenticated;

-- `salary_amount` và `insurance_number`: CỐ Ý không cấp quyền ĐỌC. Ghi thì được (HCNS nhập
-- hợp đồng), đọc thì phải qua `employee_private_details` để có dấu vết ai đã xem.


-- --- Giấy tờ có thời hạn (NS-10, NS-09) -------------------------------------

CREATE POLICY hr_documents_select ON public.hr_documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR (employee_id IS NOT NULL AND public.rls_is_self_employee(employee_id))
      -- Giấy tờ của lao động thời vụ: công trường phải đọc được để biết ai đủ điều kiện vào
      -- công trường hôm nay (NS-09 chứng chỉ an toàn, cam kết nội quy).
      OR (labor_worker_id IS NOT NULL AND public.auth_can_view_module('TC'))
    )
  );

CREATE POLICY hr_documents_write ON public.hr_documents
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (public.rls_hr_manages() OR public.auth_can_edit_module('TC'))
  )
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (public.rls_hr_manages() OR public.auth_can_edit_module('TC'))
  );

-- Số hiệu căn cước và giấy khám sức khỏe là dữ liệu nhạy cảm (PRD NS ranh giới): không cấp
-- quyền đọc cột `document_number` — đọc qua `hr_document_number` có ghi nhật ký.
REVOKE SELECT, INSERT, UPDATE ON public.hr_documents FROM authenticated, anon;

GRANT
  SELECT (
    id, company_id, employee_id, labor_worker_id, type, title,
    issued_date, expiry_date, original_location, last_reminded_stage, notes,
    created_at, updated_at, created_by, updated_by, deleted_at
  ),
  INSERT (
    id, company_id, employee_id, labor_worker_id, type, title, document_number,
    issued_date, expiry_date, original_location, notes
  ),
  UPDATE (
    type, title, document_number, issued_date, expiry_date, original_location,
    notes, updated_at, updated_by, deleted_at
  )
ON public.hr_documents TO authenticated;


-- --- Chấm công (NS-04) ------------------------------------------------------

CREATE POLICY timesheet_periods_select ON public.timesheet_periods
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      -- Chỉ huy công trường xem kỳ của khối mình để biết đã tới hạn xác nhận chưa.
      OR (source_type = 'cong_truong' AND public.auth_can_view_module('TC'))
      -- Kế toán đọc để biết kỳ nào đã chốt, sẵn sàng tính lương (NS-05).
      OR public.auth_has_role('KT', 'CFO')
    )
  );

CREATE POLICY timesheet_periods_insert ON public.timesheet_periods
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('NS', company_id));

-- UPDATE mở cho HCNS nhưng các cột bước đã bị trigger chặn — sửa được `notes`, không sửa
-- được `status`. Hai lớp bổ sung nhau: policy nói ai đụng được dòng, trigger nói đụng cột nào.
CREATE POLICY timesheet_periods_update ON public.timesheet_periods
  FOR UPDATE TO authenticated
  USING (public.rls_company_access(company_id) AND public.rls_hr_manages())
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());

CREATE POLICY timesheet_entries_select ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.rls_is_self_employee(employee_id)
      OR (construction_site_id IS NOT NULL AND public.rls_site_readable(construction_site_id))
      OR EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = employee_id AND e.manager_user_id = public.auth_user_id()
      )
    )
  );

CREATE POLICY timesheet_entries_write ON public.timesheet_entries
  FOR ALL TO authenticated
  USING (public.rls_timesheet_period_writable(timesheet_period_id))
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_timesheet_period_writable(timesheet_period_id)
  );

-- Bảng công đã chốt: Kế toán đọc để tính lương (NS-05), người lao động đọc bảng của mình.
CREATE POLICY timesheets_select ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN')
      OR public.rls_is_self_employee(employee_id)
    )
  );

-- KHÔNG mở INSERT/UPDATE/DELETE cho trình duyệt: bảng này chỉ do `consolidate_timesheets`
-- sinh ra và chỉ do `adjust_timesheet` sửa (NS-04).
REVOKE INSERT, UPDATE, DELETE ON public.timesheets FROM authenticated, anon;

CREATE POLICY timesheet_adjustments_select ON public.timesheet_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.timesheets t
       WHERE t.id = timesheet_id
         AND public.rls_company_access(t.company_id)
         AND (
           public.auth_can_view_module('NS')
           OR public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN')
           OR public.rls_is_self_employee(t.employee_id)
         )
    )
  );

-- Nhật ký điều chỉnh KHÔNG ai ghi/sửa/xóa được từ trình duyệt — cùng nguyên tắc với
-- `audit_logs` (NEN-07): chỉ `adjust_timesheet` ghi vào đây.
REVOKE INSERT, UPDATE, DELETE ON public.timesheet_adjustments FROM authenticated, anon;


-- --- Nghỉ phép và thưởng – phạt (NS-05) -------------------------------------

CREATE POLICY leave_requests_select ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.rls_is_self_employee(employee_id)
      OR EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = employee_id AND e.manager_user_id = public.auth_user_id()
      )
    )
  );

-- Đơn nghỉ do CHÍNH người lao động lập (hoặc HCNS lập hộ với người không dùng phần mềm).
CREATE POLICY leave_requests_insert ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (public.rls_is_self_employee(employee_id) OR public.rls_hr_manages())
  );

-- Sửa được khi còn Nháp. Đơn đã gửi đi thì đứng yên — người duyệt cần đọc đúng thứ đã gửi.
CREATE POLICY leave_requests_update ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND status = 'nhap'
    AND public.rls_company_access(company_id)
    AND (public.rls_is_self_employee(employee_id) OR public.rls_hr_manages())
  )
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (public.rls_is_self_employee(employee_id) OR public.rls_hr_manages())
  );

CREATE POLICY payroll_adjustments_select ON public.payroll_adjustments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN')
      OR public.rls_is_self_employee(employee_id)
    )
  );

CREATE POLICY payroll_adjustments_write ON public.payroll_adjustments
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_hr_manages()
  )
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());


-- --- Tuyển dụng (NS-02) -----------------------------------------------------
--
-- `recruitment_positions` là Mẫu A theo Backend Schema 4.10: nhu cầu nhân sự của pháp nhân
-- là thông tin nội bộ chung. `recruitment_candidates` thì KHÔNG — đó là dữ liệu cá nhân của
-- người ngoài công ty, chỉ HCNS và người phỏng vấn đọc.

CREATE POLICY recruitment_positions_select ON public.recruitment_positions
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('NS')
  );

CREATE POLICY recruitment_positions_insert ON public.recruitment_positions
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('NS', company_id));

CREATE POLICY recruitment_positions_update ON public.recruitment_positions
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND status IN ('nhap', 'dang_tuyen')
    AND public.rls_company_access(company_id)
    AND (public.rls_hr_manages() OR requested_by = public.auth_user_id())
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY recruitment_candidates_select ON public.recruitment_candidates
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('NS')
  );

CREATE POLICY recruitment_candidates_write ON public.recruitment_candidates
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_hr_manages()
  )
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());


-- --- Tài sản cấp phát (NS-08) -----------------------------------------------

CREATE POLICY assets_select ON public.assets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      -- Người đang giữ tài sản xem được món mình giữ — họ là người phải trả lại.
      OR (current_holder_id IS NOT NULL AND public.rls_is_self_employee(current_holder_id))
      OR (construction_site_id IS NOT NULL AND public.rls_site_readable(construction_site_id))
    )
  );

CREATE POLICY assets_insert ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('NS', company_id));

CREATE POLICY assets_update ON public.assets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_hr_manages()
  )
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());

CREATE POLICY asset_events_select ON public.asset_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
       WHERE a.id = asset_id
         AND a.deleted_at IS NULL
         AND public.rls_company_access(a.company_id)
         AND (
           public.auth_can_view_module('NS')
           OR (a.current_holder_id IS NOT NULL AND public.rls_is_self_employee(a.current_holder_id))
         )
    )
  );

-- Biên bản chỉ ghi qua `record_asset_event` — nó là nơi cập nhật đồng thời hiện trạng tài sản.
REVOKE INSERT, UPDATE, DELETE ON public.asset_events FROM authenticated, anon;


-- --- Checklist tiếp nhận và nghỉ việc (NS-03, NS-11) ------------------------

CREATE POLICY hr_checklists_select ON public.hr_checklists
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (public.auth_can_view_module('NS') OR public.rls_is_self_employee(employee_id))
  );

-- Checklist do `start_onboarding`/`offboard_employee` sinh; HCNS sửa được ghi chú.
CREATE POLICY hr_checklists_update ON public.hr_checklists
  FOR UPDATE TO authenticated
  USING (public.rls_company_access(company_id) AND public.rls_hr_manages())
  WITH CHECK (public.rls_company_access(company_id) AND public.rls_hr_manages());

REVOKE INSERT, DELETE ON public.hr_checklists FROM authenticated, anon;

CREATE POLICY hr_checklist_items_select ON public.hr_checklist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hr_checklists c
       WHERE c.id = hr_checklist_id
         AND public.rls_company_access(c.company_id)
         AND (
           public.auth_can_view_module('NS')
           OR public.rls_is_self_employee(c.employee_id)
           OR assignee_user_id = public.auth_user_id()
         )
    )
  );

-- Đánh dấu xong: người được giao việc hoặc HCNS. Thêm dòng mới cũng cho phép — mỗi lần bàn
-- giao lại phát sinh việc riêng mà mẫu dựng sẵn không đoán trước được.
CREATE POLICY hr_checklist_items_write ON public.hr_checklist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hr_checklists c
       WHERE c.id = hr_checklist_id
         AND public.rls_company_access(c.company_id)
         AND (public.rls_hr_manages() OR assignee_user_id = public.auth_user_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_checklists c
       WHERE c.id = hr_checklist_id
         AND public.rls_company_access(c.company_id)
         AND (public.rls_hr_manages() OR assignee_user_id = public.auth_user_id())
    )
  );


-- --- Lao động thời vụ (NS-09) -----------------------------------------------
--
-- Công trường ghi và đọc được: NS-09 là danh sách người đang có mặt tại công trường, chỉ huy
-- trưởng là người biết rõ nhất ai đến ai nghỉ.

CREATE POLICY labor_workers_select ON public.labor_workers
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR (construction_site_id IS NOT NULL AND public.rls_site_readable(construction_site_id))
    )
  );

CREATE POLICY labor_workers_write ON public.labor_workers
  FOR ALL TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.rls_hr_manages()
      OR (construction_site_id IS NOT NULL AND public.rls_site_writable(construction_site_id))
    )
  )
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (
      public.rls_hr_manages()
      OR (construction_site_id IS NOT NULL AND public.rls_site_writable(construction_site_id))
    )
  );


-- ----------------------------------------------------------------------------
-- 3. Dữ liệu nhạy cảm của nhân sự — Mẫu D ở mức CỘT (PRD NS ranh giới, NEN-07)
--
-- PRD NS ranh giới nguyên văn: "Thông tin nhạy cảm như lương, sức khỏe, kỷ luật, căn cước,
-- tài khoản ngân hàng và đánh giá nhân sự phải được phân quyền rất chặt, ghi lịch sử truy
-- cập, không hiển thị đại trà." (Tài khoản ngân hàng thì hệ thống KHÔNG lưu — CLAUDE.md 5.2.)
--
-- Hai nhóm khác nhau, KHÔNG gộp làm một quyền:
--
--   `salary`   — lương, phụ cấp, lương đóng bảo hiểm. Kế toán cần để tính lương.
--   `personal` — căn cước, ghi chú sức khỏe, ghi chú kỷ luật. Kế toán KHÔNG cần.
--
-- Gộp lại thì mở căn cước và hồ sơ sức khỏe của toàn công ty cho phòng Kế toán chỉ vì họ
-- phải tính lương — rộng hơn hẳn mức cần thiết.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_sees_sensitive(kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE kind
    -- Giá vốn và lợi nhuận: Ban Giám đốc, Tài chính, và Dự án – Đấu thầu (người lập giá).
    WHEN 'cost'   THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'DA_DT')
    WHEN 'profit' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
    -- Lương: Ban Giám đốc, Tài chính, Hành chính – Nhân sự.
    WHEN 'salary' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'NS', 'KT')
    -- Căn cước, sức khỏe, kỷ luật: hẹp hơn lương — Kế toán không cần và không được.
    WHEN 'personal' THEN public.auth_has_role('TGD', 'BGD', 'ADMIN', 'NS')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.rls_sees_sensitive(text) IS
  'Mẫu D (Backend Schema 3.3) — quyền xem cột nhạy cảm: cost | profit | salary | personal. Mọi lượt truy cập phải ghi sensitive_access_logs (PRD NEN-07).';


CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  p_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_action text DEFAULT 'view',
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
BEGIN
  IF v_user IS NULL THEN
    RETURN; -- chưa đăng nhập thì không có gì để ghi
  END IF;

  IF p_kind NOT IN ('cost', 'profit', 'salary', 'personal') THEN
    RAISE EXCEPTION 'Loại dữ liệu nhạy cảm không hợp lệ: %', p_kind;
  END IF;

  INSERT INTO public.sensitive_access_logs
    (user_id, company_id, sensitive_kind, entity_type, entity_id, action)
  VALUES (v_user, p_company_id, p_kind, p_entity_type, p_entity_id, p_action);
END;
$$;

COMMENT ON FUNCTION public.log_sensitive_access(text, text, uuid, text, uuid) IS
  'Ghi nhật ký truy cập dữ liệu nhạy cảm (PRD NEN-07). Gọi mỗi khi hiển thị giá vốn, lợi nhuận, lương hoặc dữ liệu cá nhân.';


-- Thu hồi quyền đọc các cột nhạy cảm của hồ sơ nhân sự.
--
-- ⚠️ HỆ QUẢ CẦN NHỚ KHI VIẾT TRUY VẤN: `select=*` trên `employees` sẽ bị từ chối vì có cột
-- không được cấp quyền. Luôn liệt kê cột tường minh — `web/src/hooks/use-hr.ts` đang làm vậy.
REVOKE SELECT, INSERT, UPDATE ON public.employees FROM authenticated, anon;

GRANT
  SELECT (
    id, company_id, code, full_name, user_id, block, department, position,
    manager_user_id, construction_site_id, status, hire_date, probation_end_date,
    termination_date, phone, email, date_of_birth, address, salary_type, notes,
    created_at, updated_at, created_by, updated_by, deleted_at
  ),
  INSERT (
    id, company_id, code, full_name, user_id, block, department, position,
    manager_user_id, construction_site_id, status, hire_date, probation_end_date,
    phone, email, date_of_birth, address, salary_type, notes,
    id_number, id_issued_date, id_issued_place,
    base_salary, allowance, insurance_salary, health_notes, discipline_notes
  ),
  UPDATE (
    full_name, user_id, block, department, position, manager_user_id,
    construction_site_id, status, hire_date, probation_end_date,
    phone, email, date_of_birth, address, salary_type, notes,
    id_number, id_issued_date, id_issued_place,
    base_salary, allowance, insurance_salary, health_notes, discipline_notes,
    updated_at, updated_by, deleted_at
  )
ON public.employees TO authenticated;

-- id_number, id_issued_*, base_salary, allowance, insurance_salary, health_notes,
-- discipline_notes: CỐ Ý không cấp quyền ĐỌC. Ghi thì được (HCNS nhập hồ sơ), đọc phải qua
-- hai hàm dưới đây để mỗi lượt xem đều có dấu vết.


/**
 * Lương và phụ cấp của một nhân sự — NS-01, NS-06.
 *
 * Ghi nhật ký TRƯỚC khi trả dữ liệu: ghi sau thì một lỗi giữa chừng sẽ để lọt lượt xem không
 * dấu vết. Cùng cách `estimate_cost_breakdown` đã làm với giá vốn.
 */
CREATE OR REPLACE FUNCTION public.employee_salary(p_employee_id uuid)
RETURNS TABLE (
  salary_type salary_type,
  base_salary bigint,
  allowance bigint,
  insurance_salary bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.employees WHERE id = p_employee_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nhân sự này.';
  END IF;

  IF NOT public.rls_employee_readable(p_employee_id) THEN
    RAISE EXCEPTION 'Không xem được hồ sơ nhân sự này.';
  END IF;

  -- Người lao động luôn xem được lương của CHÍNH MÌNH — đó là thông tin của họ.
  IF NOT (public.rls_sees_sensitive('salary') OR e.user_id = public.auth_user_id()) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem lương. Liên hệ Phòng Hành chính – Nhân sự nếu cần số liệu này.';
  END IF;

  PERFORM public.log_sensitive_access('salary', 'employees', p_employee_id, 'view', e.company_id);

  RETURN QUERY
  SELECT e.salary_type, e.base_salary, e.allowance, e.insurance_salary;
END;
$$;

COMMENT ON FUNCTION public.employee_salary(uuid) IS
  'Đọc lương, phụ cấp của một nhân sự — cửa DUY NHẤT vào các cột đó, có ghi nhật ký NEN-07.';


/**
 * Căn cước, ghi chú sức khỏe và kỷ luật — PRD NS ranh giới.
 *
 * Hẹp hơn lương một bậc và KHÔNG có ngoại lệ "xem của chính mình" cho ghi chú kỷ luật: đó là
 * ghi chép của người quản lý về người lao động, mở ra là biến ô ghi chú thành thứ không ai
 * dám viết thật.
 */
CREATE OR REPLACE FUNCTION public.employee_personal_details(p_employee_id uuid)
RETURNS TABLE (
  id_number varchar(32),
  id_issued_date date,
  id_issued_place varchar(128),
  health_notes text,
  discipline_notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.employees WHERE id = p_employee_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nhân sự này.';
  END IF;

  IF NOT public.rls_sees_sensitive('personal') OR NOT public.rls_employee_readable(p_employee_id) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem thông tin cá nhân của nhân sự. Liên hệ Phòng Hành chính – Nhân sự nếu cần.';
  END IF;

  PERFORM public.log_sensitive_access('personal', 'employees', p_employee_id, 'view', e.company_id);

  RETURN QUERY
  SELECT e.id_number, e.id_issued_date, e.id_issued_place, e.health_notes, e.discipline_notes;
END;
$$;

COMMENT ON FUNCTION public.employee_personal_details(uuid) IS
  'Đọc căn cước, ghi chú sức khỏe và kỷ luật — cửa DUY NHẤT vào các cột đó, có ghi nhật ký NEN-07.';


/**
 * Số hiệu một giấy tờ (NS-09, NS-10).
 *
 * Căn cước và giấy khám sức khỏe đòi quyền `personal`; chứng chỉ nghề, giấy phép lái xe và
 * bảo hiểm thì chỉ cần đọc được hồ sơ — số hiệu chứng chỉ an toàn không phải bí mật, và
 * chỉ huy công trường cần đối chiếu nó với bản gốc người lao động cầm tay.
 */
CREATE OR REPLACE FUNCTION public.hr_document_number(p_document_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.hr_documents WHERE id = p_document_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy giấy tờ này.';
  END IF;

  IF NOT public.rls_company_access(d.company_id) THEN
    RAISE EXCEPTION 'Không xem được giấy tờ của pháp nhân khác.';
  END IF;

  IF d.type IN ('can_cuoc', 'kham_suc_khoe') THEN
    IF NOT public.rls_sees_sensitive('personal') THEN
      RAISE EXCEPTION 'Vai trò hiện tại không được xem số hiệu giấy tờ này. Liên hệ Phòng Hành chính – Nhân sự nếu cần.';
    END IF;
    PERFORM public.log_sensitive_access('personal', 'hr_documents', p_document_id, 'view', d.company_id);
  ELSIF NOT (public.auth_can_view_module('NS') OR public.auth_can_view_module('TC')) THEN
    RAISE EXCEPTION 'Không xem được giấy tờ nhân sự.';
  END IF;

  RETURN d.document_number;
END;
$$;

COMMENT ON FUNCTION public.hr_document_number(uuid) IS
  'Đọc số hiệu một giấy tờ nhân sự; căn cước và giấy sức khỏe đòi quyền personal và ghi nhật ký (NEN-07).';


/**
 * Ghi nhật ký khi SỬA dữ liệu nhạy cảm — NEN-07 nói "mọi lượt XEM/SỬA".
 *
 * Làm bằng trigger chứ không bằng hàm ghi riêng: quyền UPDATE các cột đó đã cấp cho HCNS nên
 * họ sửa bằng lệnh thường: nếu chờ ứng dụng gọi một hàm để ghi nhật ký thì chỉ cần một màn
 * hình quên gọi là mất dấu vết. Trigger thì không quên được.
 */
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
    IF NEW.base_salary IS NOT NULL OR NEW.allowance IS NOT NULL THEN
      PERFORM public.log_sensitive_access('salary', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
    IF NEW.id_number IS NOT NULL OR NEW.health_notes IS NOT NULL THEN
      PERFORM public.log_sensitive_access('personal', 'employees', NEW.id, 'update', NEW.company_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER employees_log_sensitive_edit
  AFTER INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.log_employee_sensitive_edit();


-- ----------------------------------------------------------------------------
-- 4. Chấm công ba khối — NS-04, NS-05
--
-- Chuỗi bắt buộc, không có đường tắt nào khác:
--
--   mở kỳ → ghi công hằng ngày → gửi xác nhận → trưởng đơn vị xác nhận
--         → HCNS tổng hợp và chốt CẢ BA KHỐI → Kế toán nhận số liệu
--
-- Số giờ của một ngày công đủ là 8 (Bộ luật Lao động 2019 Điều 105) — con số này được viết
-- LẦN THỨ HAI ở đây bằng SQL, bản gốc là `HOURS_PER_WORKDAY` trong `@nvg/shared/ns`. Có phép
-- thử đối chiếu hai bản trong `db/src/__tests__/ns.test.ts`; đổi một bên mà quên bên kia thì
-- test đỏ ngay. **Cần NVG xác nhận** vì xưởng có thể tính theo ca 12 giờ.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_timesheet_period(
  p_company_id uuid,
  p_year integer,
  p_month integer,
  p_source_type work_block
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  v_period uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_can_create_in('NS', p_company_id) THEN
    RAISE EXCEPTION 'Chỉ Phòng Hành chính – Nhân sự mở được kỳ chấm công.';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Tháng chấm công phải nằm trong khoảng 1 đến 12.';
  END IF;

  SELECT id INTO v_period FROM public.timesheet_periods
   WHERE company_id = p_company_id AND year = p_year AND month = p_month
     AND source_type = p_source_type;

  IF FOUND THEN
    RETURN v_period;
  END IF;

  INSERT INTO public.timesheet_periods (company_id, year, month, source_type, status, created_by, updated_by)
  VALUES (p_company_id, p_year, p_month, p_source_type, 'dang_ghi', v_user, v_user)
  RETURNING id INTO v_period;

  RETURN v_period;
END;
$$;

COMMENT ON FUNCTION public.open_timesheet_period(uuid, integer, integer, work_block) IS
  'Mở (hoặc lấy lại) kỳ chấm công của một khối trong một tháng — NS-04.';


/**
 * Ghi công hằng ngày cho một kỳ — NS-04.
 *
 * Nhận cả mảng thay vì từng dòng: công trường ghi quân số cả tổ một lần, và một mảng đi
 * trong MỘT giao dịch thì không có tình trạng nửa tổ đã ghi nửa tổ chưa khi mạng rớt.
 *
 * `nghi_co_phep` bắt buộc có ĐƠN NGHỈ ĐÃ DUYỆT phủ đúng ngày đó (NS-05: nghỉ phép gắn với
 * dữ liệu chấm công). "Có phép" mà không có đơn nào thì tự nó mâu thuẫn — và đó chính là
 * cách một ngày nghỉ không phép lặng lẽ thành ngày có phép lúc tính lương.
 */
CREATE OR REPLACE FUNCTION public.save_attendance(p_period_id uuid, p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.auth_user_id();
  p         record;
  item      jsonb;
  v_emp     record;
  v_kind    attendance_kind;
  v_date    date;
  v_leave   uuid;
  v_count   integer := 0;
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
      NULLIF(item ->> 'hours', '')::numeric,
      NULLIF(item ->> 'overtime_hours', '')::numeric,
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
  'Ghi/sửa công hằng ngày của cả một nhóm trong một giao dịch — NS-04. Nghỉ có phép bắt buộc có đơn đã duyệt (NS-05).';


CREATE OR REPLACE FUNCTION public.submit_timesheet_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
  v_rows integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.timesheet_periods WHERE id = p_period_id;
  IF NOT FOUND OR NOT public.rls_timesheet_period_writable(p_period_id) THEN
    RAISE EXCEPTION 'Không gửi xác nhận được kỳ chấm công này.';
  END IF;

  SELECT count(*) INTO v_rows FROM public.timesheet_entries WHERE timesheet_period_id = p_period_id;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Chưa có ngày công nào trong kỳ. Ghi công trước khi gửi xác nhận.';
  END IF;

  UPDATE public.timesheet_periods
     SET status = 'cho_xac_nhan', updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;

  -- Gửi đúng người phải xác nhận, không gửi hàng loạt (Content Guidelines 3.4).
  PERFORM public.create_notification(
    u.id, p.company_id, 'timesheet_pending_confirm',
    format('Bảng chấm công khối %s tháng %s/%s chờ xác nhận.',
           CASE p.source_type WHEN 'van_phong' THEN 'văn phòng'
                              WHEN 'cong_truong' THEN 'công trường'
                              ELSE 'xưởng sản xuất' END,
           p.month, p.year),
    'timesheet_periods', p_period_id, '/ns/cham-cong'
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p.company_id
    AND r.code = (CASE WHEN p.source_type = 'cong_truong' THEN 'TC' ELSE 'NS' END)::role_code;
END;
$$;

COMMENT ON FUNCTION public.submit_timesheet_period(uuid) IS
  'Gửi bảng công của một khối cho trưởng đơn vị xác nhận — NS-04.';


/**
 * Trưởng đơn vị xác nhận số liệu đúng — NS-04.
 *
 * ⚠️ SUY LUẬN (cùng vướng mắc với "trưởng đơn vị" của KT-01): hệ thống chưa có cây tổ chức
 * (Module NS mới dựng hồ sơ, chưa có sơ đồ quản lý được NVG duyệt). Tạm hiểu người xác nhận
 * là người có quyền PHÊ DUYỆT trên phân hệ phụ trách khối đó: khối công trường là TC, hai
 * khối còn lại là NS. Khi NVG chốt cây tổ chức, đổi điều kiện ở ĐÚNG hàm này.
 */
CREATE OR REPLACE FUNCTION public.confirm_timesheet_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
  v_ok   boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.timesheet_periods WHERE id = p_period_id;
  IF NOT FOUND OR NOT public.rls_company_access(p.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ chấm công này.';
  END IF;

  IF p.status <> 'cho_xac_nhan' THEN
    RAISE EXCEPTION 'Kỳ chấm công này chưa được gửi xác nhận, hoặc đã xác nhận rồi.';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.permissions pm ON pm.role_id = uc.role_id
     WHERE uc.user_id = v_user
       AND uc.deleted_at IS NULL
       AND uc.company_id = p.company_id
       AND pm.module_code = (CASE WHEN p.source_type = 'cong_truong' THEN 'TC' ELSE 'NS' END)
       AND pm.can_approve
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Chỉ trưởng đơn vị phụ trách khối này xác nhận được bảng chấm công.';
  END IF;

  UPDATE public.timesheet_periods
     SET status = 'da_xac_nhan', confirmed_by = v_user, confirmed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_timesheet_period(uuid) IS
  'Trưởng đơn vị xác nhận bảng công của khối mình — NS-04. Người xác nhận là SUY LUẬN, chờ cây tổ chức.';


/**
 * Tổng hợp ba khối và chốt kỳ — NS-04, NS-05.
 *
 * Đây là `POST /api/timesheets/consolidate` của Backend Schema 4.10, làm bằng hàm CSDL thay
 * vì endpoint Workers: nó chỉ đọc/ghi các bảng trong cùng một CSDL và cần đúng một giao
 * dịch — theo quy tắc chọn lớp ở CLAUDE.md 3.1 thì chưa có lý do để dựng endpoint.
 *
 * Hai điều kiện KHÔNG được nới:
 *
 *  1. CẢ BA KHỐI phải xác nhận xong. HCNS là đầu mối TỔNG HỢP, không phải người thay mặt ba
 *     trưởng đơn vị ký. Chốt khi còn khối chưa xác nhận là chốt một bảng lương thiếu người.
 *  2. Kỳ đã chốt thì không chốt lại. Muốn sửa thì đi qua `adjust_timesheet` — có lý do và
 *     có tên người phê duyệt, đúng nguyên văn NS-04.
 */
CREATE OR REPLACE FUNCTION public.consolidate_timesheets(
  p_company_id uuid,
  p_year integer,
  p_month integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v_periods  integer;
  v_pending  integer;
  v_closed   integer;
  v_rows     integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT (public.rls_company_access(p_company_id) AND public.rls_hr_manages()) THEN
    RAISE EXCEPTION 'Chỉ Phòng Hành chính – Nhân sự chốt được kỳ chấm công.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'da_xac_nhan'),
         count(*) FILTER (WHERE status = 'da_chot')
    INTO v_periods, v_pending, v_closed
    FROM public.timesheet_periods
   WHERE company_id = p_company_id AND year = p_year AND month = p_month;

  IF v_periods = 0 THEN
    RAISE EXCEPTION 'Chưa có kỳ chấm công nào của tháng %/%.', p_month, p_year;
  END IF;

  IF v_closed > 0 THEN
    RAISE EXCEPTION 'Kỳ chấm công tháng %/% đã chốt. Điều chỉnh sau khi chốt phải nêu lý do và người phê duyệt.', p_month, p_year;
  END IF;

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % khối chưa được trưởng đơn vị xác nhận. Chốt được khi cả ba khối đã xác nhận.', v_pending;
  END IF;

  /*
   * Quy giờ ra ngày công: 8 giờ một công (xem chú thích đầu mục 4). Ngày công tác không có
   * giờ ghi nhận thì tính đủ một công — người đi công tác không bấm máy chấm công được, và
   * trừ công của họ là sai bản chất.
   */
  INSERT INTO public.timesheets (
    company_id, timesheet_period_id, employee_id, year, month, source_type,
    workdays, worked_hours, overtime_hours, leave_days, unpaid_absence_days,
    holiday_days, business_trip_days, output_quantity,
    bonus_amount, penalty_amount, closed_at, created_by, updated_by
  )
  SELECT
    p.company_id, p.id, e.employee_id, p.year, p.month, p.source_type,
    round(e.worked_hours / 8.0, 2),
    e.worked_hours,
    e.overtime_hours,
    e.leave_days,
    e.unpaid_absence_days,
    e.holiday_days,
    e.business_trip_days,
    e.output_quantity,
    COALESCE(adj.bonus, 0),
    COALESCE(adj.penalty, 0),
    now(), v_user, v_user
  FROM public.timesheet_periods p
  JOIN LATERAL (
    SELECT
      te.employee_id,
      COALESCE(SUM(
        CASE te.kind
          WHEN 'lam_viec' THEN COALESCE(te.hours, 0)
          WHEN 'cong_tac' THEN COALESCE(te.hours, 8)
          ELSE 0
        END
      ), 0)::numeric                                                        AS worked_hours,
      COALESCE(SUM(COALESCE(te.overtime_hours, 0)), 0)::numeric             AS overtime_hours,
      COALESCE(SUM(COALESCE(te.output_quantity, 0)), 0)::numeric            AS output_quantity,
      count(*) FILTER (WHERE te.kind = 'nghi_co_phep')::int                 AS leave_days,
      count(*) FILTER (WHERE te.kind = 'nghi_khong_phep')::int              AS unpaid_absence_days,
      count(*) FILTER (WHERE te.kind = 'nghi_le')::int                      AS holiday_days,
      count(*) FILTER (WHERE te.kind = 'cong_tac')::int                     AS business_trip_days
    FROM public.timesheet_entries te
    WHERE te.timesheet_period_id = p.id
    GROUP BY te.employee_id
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'thuong'), 0)::bigint AS bonus,
      COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'phat'), 0)::bigint   AS penalty
    FROM public.payroll_adjustments pa
    WHERE pa.employee_id = e.employee_id
      AND pa.year = p.year AND pa.month = p.month
      AND pa.deleted_at IS NULL
  ) adj ON true
  WHERE p.company_id = p_company_id AND p.year = p_year AND p.month = p_month;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.timesheet_periods
     SET status = 'da_chot', closed_by = v_user, closed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE company_id = p_company_id AND year = p_year AND month = p_month;

  -- Kế toán là người chờ số liệu này để tính lương (NS-05) — báo đúng họ, không báo cả công ty.
  PERFORM public.create_notification(
    u.id, p_company_id, 'timesheet_closed',
    format('Bảng chấm công tháng %s/%s đã chốt, %s người. Số liệu sẵn sàng để tính lương.',
           p_month, p_year, v_rows),
    'timesheet_periods', NULL, '/ns/cham-cong'
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p_company_id
    AND r.code = 'KT';

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.consolidate_timesheets(uuid, integer, integer) IS
  'Tổng hợp chấm công ba khối và chốt kỳ, chuyển số liệu sang Kế toán — NS-04, NS-05 (Backend Schema: POST /api/timesheets/consolidate).';


/**
 * Điều chỉnh bảng công SAU khi đã chốt — NS-04 nguyên văn.
 *
 * Bắt buộc: lý do không rỗng, và người bấm phải có quyền phê duyệt trên phân hệ NS. Một dòng
 * lịch sử được ghi lại kèm giá trị cũ — số cũ không biến mất khỏi hệ thống.
 */
CREATE OR REPLACE FUNCTION public.adjust_timesheet(
  p_timesheet_id uuid,
  p_field text,
  p_new_value numeric,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  t      record;
  v_old  numeric;
  v_ok   boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO t FROM public.timesheets WHERE id = p_timesheet_id;
  IF NOT FOUND OR NOT public.rls_company_access(t.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy bảng chấm công này.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do điều chỉnh. Mọi điều chỉnh sau khi chốt đều phải ghi rõ lý do.';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.permissions pm ON pm.role_id = uc.role_id
     WHERE uc.user_id = v_user
       AND uc.deleted_at IS NULL
       AND uc.company_id = t.company_id
       AND pm.module_code = 'NS'
       AND pm.can_approve
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Điều chỉnh bảng công đã chốt cần người có thẩm quyền phê duyệt của Phòng Hành chính – Nhân sự.';
  END IF;

  IF p_field NOT IN (
    'workdays', 'worked_hours', 'overtime_hours', 'leave_days',
    'unpaid_absence_days', 'holiday_days', 'business_trip_days', 'output_quantity'
  ) THEN
    RAISE EXCEPTION 'Không điều chỉnh được cột %.', p_field;
  END IF;

  IF p_new_value IS NULL OR p_new_value < 0 THEN
    RAISE EXCEPTION 'Giá trị điều chỉnh phải là số không âm.';
  END IF;

  EXECUTE format('SELECT %I FROM public.timesheets WHERE id = $1', p_field)
    INTO v_old USING p_timesheet_id;

  IF v_old = p_new_value THEN
    RAISE EXCEPTION 'Giá trị mới trùng giá trị hiện tại, không có gì để điều chỉnh.';
  END IF;

  EXECUTE format(
    'UPDATE public.timesheets SET %I = $1, updated_at = now(), updated_by = $2 WHERE id = $3',
    p_field
  ) USING p_new_value, v_user, p_timesheet_id;

  INSERT INTO public.timesheet_adjustments (timesheet_id, field, old_value, new_value, reason, approved_by)
  VALUES (p_timesheet_id, p_field, v_old, p_new_value, btrim(p_reason), v_user);
END;
$$;

COMMENT ON FUNCTION public.adjust_timesheet(uuid, text, numeric, text) IS
  'Điều chỉnh số công đã chốt, bắt buộc lý do và người phê duyệt, ghi lịch sử — NS-04.';


/**
 * Bàn giao số liệu đã chốt cho Kế toán — NS-05 "không cần nhập lại".
 *
 * Chỉ đánh dấu ĐÃ NHẬN, không tính tiền: quy chế lương chưa ban hành (NS-06, PRD Mục 10).
 * Khi có quy chế, phần tính lương đọc từ đây và ghi ở Module KT, không sửa bảng này.
 */
CREATE OR REPLACE FUNCTION public.transfer_timesheets_to_accounting(
  p_company_id uuid,
  p_year integer,
  p_month integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  v_rows integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.rls_company_access(p_company_id)
     OR NOT public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN') THEN
    RAISE EXCEPTION 'Chỉ Kế toán – Tài chính xác nhận đã nhận bảng chấm công.';
  END IF;

  UPDATE public.timesheets
     SET transferred_at = now(), transferred_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE company_id = p_company_id AND year = p_year AND month = p_month
     AND transferred_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Không có bảng chấm công nào của tháng %/% đang chờ nhận.', p_month, p_year;
  END IF;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.transfer_timesheets_to_accounting(uuid, integer, integer) IS
  'Kế toán xác nhận đã nhận số công đã chốt của một kỳ — NS-05.';


-- ----------------------------------------------------------------------------
-- 5. Nghỉ phép — NS-05
--
-- Đơn nghỉ đi qua Hộp thư Phê duyệt dùng chung. KHÔNG dựng màn hình duyệt riêng: Webapp Flow
-- 4.6 chỉ cho phép MỘT mẫu phê duyệt trên toàn hệ thống, và người duyệt không phải mở thêm
-- một chỗ nữa để biết mình còn việc.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_leave_request(p_leave_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  lr         record;
  emp        record;
  v_approval uuid;
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
  'Gửi đơn nghỉ phép đi phê duyệt qua Hộp thư dùng chung — NS-05.';


CREATE OR REPLACE FUNCTION public.cancel_leave_request(p_leave_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  lr     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO lr FROM public.leave_requests WHERE id = p_leave_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT (public.rls_is_self_employee(lr.employee_id) OR public.rls_hr_manages()) THEN
    RAISE EXCEPTION 'Không thao tác được trên đơn nghỉ phép này.';
  END IF;

  IF lr.status IN ('da_huy', 'tu_choi') THEN
    RAISE EXCEPTION 'Đơn này đã đóng.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đơn.';
  END IF;

  -- Đã có ngày công ghi theo đơn này thì hủy đơn là làm ngày đó thành nghỉ không phép mà
  -- không ai biết. Bỏ ngày công trước, rồi hủy đơn.
  IF EXISTS (SELECT 1 FROM public.timesheet_entries te WHERE te.leave_request_id = p_leave_id) THEN
    RAISE EXCEPTION 'Đơn này đã được ghi vào bảng chấm công. Sửa bảng chấm công trước, rồi hủy đơn.';
  END IF;

  UPDATE public.leave_requests
     SET status = 'da_huy', reject_reason = btrim(p_reason), decided_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_leave_id;

  UPDATE public.approvals
     SET status = 'completed', final_decision = 'rejected', decided_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = lr.approval_id AND status = 'pending_approval';
END;
$$;

COMMENT ON FUNCTION public.cancel_leave_request(uuid, text) IS
  'Hủy đơn nghỉ phép kèm lý do; chặn hủy khi đơn đã đi vào bảng chấm công — NS-05.';


-- ----------------------------------------------------------------------------
-- 6. Tài sản cấp phát — NS-08
-- ----------------------------------------------------------------------------

/**
 * Lập một biên bản tài sản và cập nhật hiện trạng trong CÙNG một giao dịch.
 *
 * Đây là cửa duy nhất đổi `assets.current_holder_id` và `assets.condition` (trigger chặn
 * đường còn lại). Hai việc phải đi cùng nhau: biên bản không kèm cập nhật thì màn hình vẫn
 * hiện người cũ đang giữ, còn cập nhật không kèm biên bản thì không ai biết vì sao đổi.
 */
CREATE OR REPLACE FUNCTION public.record_asset_event(
  p_asset_id uuid,
  p_type asset_event_type,
  p_event_date date,
  p_to_employee_id uuid DEFAULT NULL,
  p_condition asset_condition DEFAULT NULL,
  p_amount bigint DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  a        record;
  v_to     uuid := p_to_employee_id;
  v_cond   asset_condition;
  v_event  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.assets WHERE id = p_asset_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(a.company_id) OR NOT public.rls_hr_manages() THEN
    RAISE EXCEPTION 'Không lập được biên bản cho tài sản này.';
  END IF;

  IF a.condition = 'da_thanh_ly' THEN
    RAISE EXCEPTION 'Tài sản này đã thanh lý, không lập thêm biên bản được.';
  END IF;

  IF p_type IN ('cap_phat', 'dieu_chuyen') THEN
    IF v_to IS NULL THEN
      RAISE EXCEPTION 'Chưa chọn người nhận. Biên bản cấp phát và điều chuyển phải có người nhận.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = v_to AND e.deleted_at IS NULL
         AND e.company_id = a.company_id AND e.status <> 'da_nghi'
    ) THEN
      RAISE EXCEPTION 'Người nhận không thuộc pháp nhân này, hoặc đã nghỉ việc.';
    END IF;
  ELSE
    -- Thu hồi, sửa chữa, thanh lý: tài sản rời tay người đang giữ (hoặc đứng yên tại chỗ).
    v_to := NULL;
  END IF;

  v_cond := COALESCE(
    p_condition,
    CASE p_type WHEN 'thanh_ly' THEN 'da_thanh_ly'::asset_condition ELSE a.condition END
  );

  IF p_type = 'thanh_ly' AND v_cond <> 'da_thanh_ly' THEN
    RAISE EXCEPTION 'Biên bản thanh lý phải kết thúc ở tình trạng "Đã thanh lý".';
  END IF;

  INSERT INTO public.asset_events (
    asset_id, type, event_date, from_employee_id, to_employee_id,
    condition, amount, notes, created_by, updated_by
  )
  VALUES (
    p_asset_id, p_type, COALESCE(p_event_date, current_date), a.current_holder_id, v_to,
    v_cond, p_amount, NULLIF(btrim(COALESCE(p_notes, '')), ''), v_user, v_user
  )
  RETURNING id INTO v_event;

  UPDATE public.assets
     SET current_holder_id = CASE WHEN p_type = 'sua_chua' THEN a.current_holder_id ELSE v_to END,
         condition = v_cond,
         updated_at = now(), updated_by = v_user
   WHERE id = p_asset_id;

  RETURN v_event;
END;
$$;

COMMENT ON FUNCTION public.record_asset_event(uuid, asset_event_type, date, uuid, asset_condition, bigint, text) IS
  'Lập biên bản cấp phát/điều chuyển/sửa chữa/thu hồi/thanh lý và cập nhật hiện trạng tài sản — NS-08.';


-- ----------------------------------------------------------------------------
-- 7. Tiếp nhận và nghỉ việc — NS-03, NS-11
--
-- Danh sách việc dựng sẵn được viết LẦN THỨ HAI ở đây bằng SQL; bản gốc là
-- `ONBOARDING_CHECKLIST` / `OFFBOARDING_CHECKLIST` trong `@nvg/shared/ns` (giao diện dùng để
-- hiện trước cho người xem). Có phép thử đối chiếu hai bản trong `db/src/__tests__/ns.test.ts`.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_onboarding(
  p_employee_id uuid,
  p_effective_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  e           record;
  v_checklist uuid;
  v_date      date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = p_employee_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(e.company_id) OR NOT public.rls_hr_manages() THEN
    RAISE EXCEPTION 'Không lập được checklist tiếp nhận cho hồ sơ này.';
  END IF;

  SELECT id INTO v_checklist FROM public.hr_checklists
   WHERE employee_id = p_employee_id AND kind = 'tiep_nhan';
  IF FOUND THEN
    RETURN v_checklist;
  END IF;

  v_date := COALESCE(p_effective_date, e.hire_date, current_date);

  INSERT INTO public.hr_checklists (company_id, employee_id, kind, effective_date, created_by, updated_by)
  VALUES (e.company_id, p_employee_id, 'tiep_nhan', v_date, v_user, v_user)
  RETURNING id INTO v_checklist;

  INSERT INTO public.hr_checklist_items (hr_checklist_id, item_group, title, assignee_user_id, created_by, updated_by)
  SELECT v_checklist, t.item_group::checklist_item_group, t.title, v_user, v_user, v_user
    FROM (VALUES
      ('ho_so',          'Nhận đủ hồ sơ cá nhân và giấy tờ định danh', NULL),
      ('ho_so',          'Ký hợp đồng thử việc',                        NULL),
      ('ho_so',          'Đăng ký thông tin bảo hiểm',                  NULL),
      ('quyen_truy_cap', 'Cấp tài khoản hệ thống và hộp thư',           NULL),
      ('tai_san',        'Cấp công cụ làm việc',                        NULL),
      -- NS-03 nguyên văn: đồng phục/bảo hộ lao động "đối với công trường/xưởng".
      ('tai_san',        'Cấp đồng phục và bảo hộ lao động',            'cong_truong,xuong'),
      ('cong_viec',      'Bàn giao kế hoạch công việc tuần đầu',        NULL),
      ('cong_viec',      'Phổ biến nội quy và huấn luyện an toàn',      NULL)
    ) AS t(item_group, title, blocks)
   WHERE t.blocks IS NULL OR e.block::text = ANY (string_to_array(t.blocks, ','));

  RETURN v_checklist;
END;
$$;

COMMENT ON FUNCTION public.start_onboarding(uuid, date) IS
  'Dựng checklist tiếp nhận nhân sự mới theo khối làm việc — NS-03.';


/**
 * Quy trình nghỉ việc — NS-11, và là `POST /api/employees/:id/offboard` của Backend Schema 4.10.
 *
 * Điểm quan trọng nhất: danh sách tài sản phải thu hồi được SINH RA từ chính những tài sản
 * người đó đang giữ (NS-08 "tự động tạo danh sách tài sản/chìa khóa/tài khoản cần bàn giao").
 * Một dòng chung chung "thu hồi tài sản" thì người làm thủ tục vẫn phải đi tra ở màn hình
 * khác — và thứ không nằm trước mắt là thứ bị bỏ sót.
 *
 * Hàm KHÔNG tự thu hồi tài sản và KHÔNG tự khóa tài khoản: PRD NS ranh giới đặt quyết định
 * và trách nhiệm ở người quản lý. Nó dựng danh sách việc, người làm bấm xong từng dòng.
 */
CREATE OR REPLACE FUNCTION public.offboard_employee(
  p_employee_id uuid,
  p_termination_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  e           record;
  v_checklist uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = p_employee_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(e.company_id) OR NOT public.rls_hr_manages() THEN
    RAISE EXCEPTION 'Không thao tác được trên hồ sơ nhân sự này.';
  END IF;

  IF e.status = 'da_nghi' THEN
    RAISE EXCEPTION 'Hồ sơ này đã ghi nhận nghỉ việc.';
  END IF;

  IF p_termination_date IS NULL THEN
    RAISE EXCEPTION 'Chưa có ngày nghỉ việc.';
  END IF;

  IF e.hire_date IS NOT NULL AND p_termination_date < e.hire_date THEN
    RAISE EXCEPTION 'Ngày nghỉ việc không thể trước ngày vào làm.';
  END IF;

  INSERT INTO public.hr_checklists (company_id, employee_id, kind, effective_date, created_by, updated_by)
  VALUES (e.company_id, p_employee_id, 'nghi_viec', p_termination_date, v_user, v_user)
  RETURNING id INTO v_checklist;

  -- Việc cố định (NS-11)
  INSERT INTO public.hr_checklist_items (hr_checklist_id, item_group, title, created_by, updated_by)
  SELECT v_checklist, t.item_group::checklist_item_group, t.title, v_user, v_user
    FROM (VALUES
      ('cong_viec',      'Xác nhận biên bản bàn giao công việc'),
      ('quyen_truy_cap', 'Khóa tài khoản hệ thống và hộp thư'),
      ('ho_so',          'Chốt công, phép và các khoản còn lại'),
      ('ho_so',          'Báo giảm bảo hiểm'),
      ('ho_so',          'Thanh lý hợp đồng lao động')
    ) AS t(item_group, title);

  -- Một dòng cho MỖI tài sản người đó đang giữ (NS-08).
  INSERT INTO public.hr_checklist_items (hr_checklist_id, item_group, title, asset_id, created_by, updated_by)
  SELECT v_checklist, 'tai_san', format('Thu hồi %s%s', a.name,
           COALESCE(' — ' || NULLIF(a.code, ''), '')), a.id, v_user, v_user
    FROM public.assets a
   WHERE a.current_holder_id = p_employee_id
     AND a.deleted_at IS NULL
     AND a.condition <> 'da_thanh_ly';

  UPDATE public.employees
     SET status = 'da_nghi', termination_date = p_termination_date,
         updated_at = now(), updated_by = v_user
   WHERE id = p_employee_id;

  -- Hợp đồng lao động đang hiệu lực kết thúc theo ngày nghỉ (NS-07).
  UPDATE public.employment_contracts
     SET status = 'da_ket_thuc',
         end_date = LEAST(COALESCE(end_date, p_termination_date), p_termination_date),
         updated_at = now(), updated_by = v_user
   WHERE employee_id = p_employee_id AND status = 'dang_hieu_luc' AND deleted_at IS NULL;

  RETURN v_checklist;
END;
$$;

COMMENT ON FUNCTION public.offboard_employee(uuid, date) IS
  'Ghi nhận nghỉ việc và dựng checklist bàn giao gồm đúng tài sản đang giữ — NS-11, NS-08 (Backend Schema: POST /api/employees/:id/offboard).';


-- ----------------------------------------------------------------------------
-- 8. Nhắc hạn giấy tờ — NS-10, liên kết NEN-04
--
-- Bốn mốc 90/60/30/7 ngày. `last_reminded_stage` chặn nhắc lại cùng một mốc — Content
-- Guidelines 3.4 cấm lặp lại thông báo đã gửi ("nhàm cảnh báo" làm người ta bỏ qua cả những
-- cảnh báo thật).
--
-- Hàm này dành cho tác vụ nền chạy hằng ngày (Cloudflare Cron Triggers — Tech Stack 1.4).
-- Nó chạy dưới quyền chủ sở hữu nên quét được mọi pháp nhân; người dùng thường không gọi.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_hr_document_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       record;
  v_stage smallint;
  v_days  integer;
  v_sent  integer := 0;
BEGIN
  FOR d IN
    SELECT hd.*, e.full_name AS employee_name, lw.full_name AS worker_name
      FROM public.hr_documents hd
      LEFT JOIN public.employees    e  ON e.id  = hd.employee_id
      LEFT JOIN public.labor_workers lw ON lw.id = hd.labor_worker_id
     WHERE hd.deleted_at IS NULL
       AND hd.expiry_date IS NOT NULL
       AND hd.expiry_date <= current_date + 90
       AND (e.id IS NULL OR e.status <> 'da_nghi')
       AND (lw.id IS NULL OR lw.status <> 'da_nghi')
  LOOP
    v_days := d.expiry_date - current_date;

    v_stage := CASE
      WHEN v_days < 0  THEN 0
      WHEN v_days <= 7  THEN 7
      WHEN v_days <= 30 THEN 30
      WHEN v_days <= 60 THEN 60
      ELSE 90
    END;

    -- Đã nhắc ở mốc này (hoặc mốc gần hơn) rồi thì thôi. Mốc nhỏ hơn nghĩa là gần hạn hơn.
    CONTINUE WHEN d.last_reminded_stage IS NOT NULL AND d.last_reminded_stage <= v_stage;

    PERFORM public.create_notification(
      u.id, d.company_id, 'expiring_soon',
      CASE
        WHEN v_stage = 0 THEN
          format('%s của %s đã hết hạn ngày %s.', d.title,
                 COALESCE(d.employee_name, d.worker_name, 'nhân sự'),
                 to_char(d.expiry_date, 'DD/MM/YYYY'))
        ELSE
          format('%s của %s hết hạn ngày %s, còn %s ngày.', d.title,
                 COALESCE(d.employee_name, d.worker_name, 'nhân sự'),
                 to_char(d.expiry_date, 'DD/MM/YYYY'), v_days)
      END,
      'hr_documents', d.id, '/ns/giay-to'
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = d.company_id
      AND r.code = 'NS';

    UPDATE public.hr_documents SET last_reminded_stage = v_stage WHERE id = d.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.scan_hr_document_reminders() IS
  'Quét giấy tờ sắp hết hạn và nhắc ở bốn mốc 90/60/30/7 ngày, không nhắc lại cùng một mốc — NS-10, NEN-04.';

-- Chỉ tác vụ nền gọi; không mở cho trình duyệt để không ai bắn lại loạt thông báo cho cả công ty.
REVOKE EXECUTE ON FUNCTION public.scan_hr_document_reminders() FROM authenticated, anon;


-- ----------------------------------------------------------------------------
-- 9. Tuyển dụng — NS-02
--
-- ⚠️ Ranh giới PRD NS: phần mềm KHÔNG tự quyết định tuyển dụng. Không có hàm chấm điểm ứng
-- viên, không có xếp hạng, không có gợi ý chọn ai. Hai hàm dưới đây chỉ chuyển hồ sơ đúng
-- chuỗi mà người có thẩm quyền đã bấm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_recruitment_approval(p_position_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  rp         record;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO rp FROM public.recruitment_positions WHERE id = p_position_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(rp.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu tuyển dụng này.';
  END IF;

  IF NOT (public.rls_hr_manages() OR rp.requested_by = v_user) THEN
    RAISE EXCEPTION 'Chỉ người đề nghị hoặc Phòng Hành chính – Nhân sự gửi được yêu cầu này.';
  END IF;

  IF rp.status <> 'nhap' THEN
    RAISE EXCEPTION 'Yêu cầu tuyển dụng này đã được gửi đi.';
  END IF;

  IF rp.headcount < 1 THEN
    RAISE EXCEPTION 'Số lượng cần tuyển phải từ 1 người trở lên.';
  END IF;

  IF rp.requirements IS NULL OR btrim(rp.requirements) = '' THEN
    RAISE EXCEPTION 'Chưa nêu yêu cầu chuyên môn. Nhập yêu cầu trước khi gửi phê duyệt.';
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    rp.company_id, 'recruitment_position', 'recruitment_positions', rp.id, rp.code,
    format('Yêu cầu tuyển dụng %s — %s người', rp.title, rp.headcount),
    NULL, rp.requirements, 'pending_approval', v_user,
    rp.needed_by_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.recruitment_positions
     SET status = 'cho_duyet', approval_id = v_approval,
         updated_at = now(), updated_by = v_user
   WHERE id = p_position_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_recruitment_approval(uuid) IS
  'Gửi yêu cầu tuyển dụng đi phê duyệt qua Hộp thư dùng chung — NS-02.';


/**
 * Ứng viên nhận việc → sinh hồ sơ nhân sự (NS-02 → NS-01 → NS-03).
 *
 * Đây là chỗ "một nguồn dữ liệu duy nhất" của PRD 2.3 thể hiện rõ nhất: tên, điện thoại,
 * email đã có từ lúc nộp hồ sơ, không ai phải gõ lại. Hồ sơ nhân sự vừa tạo mở luôn checklist
 * tiếp nhận NS-03.
 */
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

  SELECT * INTO rp FROM public.recruitment_positions WHERE id = c.recruitment_position_id;

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
  'Ứng viên nhận việc → sinh hồ sơ nhân sự và checklist tiếp nhận, không nhập lại dữ liệu — NS-02, NS-03.';


-- ----------------------------------------------------------------------------
-- 10. Hộp thư Phê duyệt nhận thêm hai loại hồ sơ của NS
--
-- `decide_approval` là MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6), nên mỗi module mới
-- viết lại toàn bộ hàm kèm nhánh của mình — cách các module trước đã làm. Hai nhánh mới nằm
-- ở cuối; phần trên giữ NGUYÊN VĂN bản của migration 0043 để không module nào đổi hành vi.
-- ----------------------------------------------------------------------------

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
  e      record;
  st     record;
  adj    jsonb;
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

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'payment_requests' THEN
    /*
     * KT-01 bước 5 — phê duyệt theo hạn mức. Ba bước kiểm trước đó đã xong và đã ghi vào
     * `payment_request_steps`; ở đây chỉ còn quyết định cuối cùng về tiền.
     *
     * Từ chối thì hồ sơ về "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy hồ sơ của
     * mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa. Sửa xong gửi lại là
     * đi LẠI TỪ ĐẦU cả ba bước kiểm — người kiểm trước đó đã ký trên một con số khác.
     */
    UPDATE public.payment_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::payment_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Khoản đã duyệt là việc cần làm của Kế toán – Tài chính: họ lập phiếu chi và thực
      -- hiện chi (KT-01 bước 6, 7). Người đề nghị thường không mở màn hình KT hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'payment_request_approved',
        format('Đề nghị chi %s đã được phê duyệt, giá trị %s đồng. Lập phiếu chi để thực hiện.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'payment_requests', a.entity_id,
        format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code = 'KT';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'payment_request_approved' ELSE 'payment_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị chi %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị chi %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'payment_requests', a.entity_id,
      format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'leave_requests' THEN
    /*
     * NS-05 — đơn nghỉ phép. Từ chối thì đơn ĐÓNG kèm lý do, không quay về Nháp: người lao
     * động cần đọc được vì sao bị từ chối trước khi xin lại ngày khác.
     */
    UPDATE public.leave_requests
       SET status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::leave_request_status,
           decided_at = now(),
           reject_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN 'Đơn nghỉ phép đã được duyệt.'
           ELSE format('Đơn nghỉ phép bị từ chối. %s', COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'leave_requests', a.entity_id, '/ns/nghi-phep'
    );

  ELSIF a.entity_type = 'recruitment_positions' THEN
    /*
     * NS-02 — yêu cầu tuyển dụng. Được duyệt thì chuyển sang "Đang tuyển" và HCNS bắt đầu
     * đăng tuyển; từ chối thì dừng hẳn, người đề nghị lập yêu cầu mới nếu vẫn cần người.
     */
    UPDATE public.recruitment_positions
       SET status = (CASE WHEN p_decision = 'approved' THEN 'dang_tuyen' ELSE 'dung_tuyen' END)::recruitment_position_status,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      PERFORM public.create_notification(
        u.id, a.company_id, 'recruitment_approved',
        format('Yêu cầu tuyển dụng %s đã được duyệt. Bắt đầu đăng tuyển.', COALESCE(a.entity_code, '')),
        'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'NS';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'recruitment_approved' ELSE 'recruitment_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Yêu cầu tuyển dụng %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Yêu cầu tuyển dụng %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6).';
