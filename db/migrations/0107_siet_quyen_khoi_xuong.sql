/**
 * Siết lại phạm vi quyền của khối xưởng — vá lỗi do chính migration 0106 mở quá tay.
 *
 * ## Lỗi
 *
 * 0106 mở khối `xuong` (chấm công và hồ sơ nhân sự) bằng vị từ `auth_can_edit_module('SX')`
 * và `auth_can_view_module('SX')`. Hai cờ đó KHÔNG chọn ra Xưởng: bảng `permissions` cho
 * `can_edit` trên phân hệ SX với ba vai trò — `SX`, `ADMIN`, và **`KHO`**. Kho giữ `SX: WORK`
 * để kiểm đếm và bàn giao lô giàn giáo lúc giao/thu hồi (khảo sát Xưởng: "Kho/Xưởng chuẩn bị
 * hàng, kiểm đếm, tổ chức bốc xếp và bàn giao").
 *
 * Hậu quả đo được trước khi vá — đăng nhập `kho@nhavietgroup.test`:
 *   · gọi `save_attendance` trên một kỳ chấm công khối xưởng → THÀNH CÔNG;
 *   · đọc hồ sơ nhân sự khối xưởng → THÀNH CÔNG.
 *
 * Nghĩa là Thủ kho ghi được đầu vào tính lương của một bộ phận không thuộc quyền mình. Lương,
 * căn cước và ghi chú sức khỏe vẫn khuất — chúng chặn bằng column-level GRANT ở 0049, không
 * bằng policy dòng — nhưng đó là may, không phải thiết kế.
 *
 * ## Vì sao vá bằng vai trò chứ không bằng quyền phân hệ
 *
 * Phân hệ SX gộp hai thẩm quyền khác hẳn nhau: ĐIỀU HÀNH XƯỞNG (kế hoạch sản xuất, nhân công,
 * chất lượng) và CẦM HÀNG GIÀN GIÁO (xuất, kiểm đếm, thu hồi). Kho đúng ở vế thứ hai và không
 * liên quan gì vế thứ nhất. Ma trận `permissions` chỉ tới mức phân hệ nên không diễn đạt được
 * ranh giới đó; chỗ này phải hỏi thẳng vai trò, đúng cách `auth_has_role('KHO')` trong
 * `record_delivery` và `auth_has_role('KT','CFO')` trong 0050 đã làm.
 *
 * KHÔNG đụng tới `SX: WORK` của Kho: hai hàm cho thuê giàn giáo vẫn cần nó.
 *
 * Ba vai trò cấp tập đoàn (TGĐ, Ban Giám đốc, Quản trị hệ thống) KHÔNG mất gì: họ đã đi qua
 * nhánh `auth_can_view_module('NS')` ngay phía trên trong cùng điều kiện.
 */

-- ----------------------------------------------------------------------------
-- 1. Ghi công khối xưởng — chỉ Xưởng, không phải Kho
-- ----------------------------------------------------------------------------

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
         OR (p.source_type = 'xuong'       AND public.auth_has_role('SX'))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_timesheet_period_writable(uuid) IS
  'Ghi được công vào kỳ này không — HCNS mọi khối, Ban chỉ huy với khối công trường, Xưởng với khối xưởng (NS-04).';


-- ----------------------------------------------------------------------------
-- 2. Đọc hồ sơ nhân sự và bảng công khối xưởng — chỉ Xưởng, không phải Kho
-- ----------------------------------------------------------------------------

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
         -- Kế toán – Tài chính: cần tên và khối để đối chiếu bảng công đã chốt (NS-05, 0050).
         OR public.auth_has_role('KT', 'CFO')
         -- Xưởng: cùng lý lẽ với chỉ huy công trường ngay trên, chỉ khác là người khối xưởng
         -- không gắn công trình nào nên không lọt vào vế `construction_site_id`.
         OR (e.block = 'xuong' AND public.auth_has_role('SX'))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_employee_readable(uuid) IS
  'Đọc được hồ sơ nhân sự này không — HCNS, chính mình, quản lý trực tiếp, chỉ huy công trường, Kế toán – Tài chính, Xưởng với người khối xưởng (NS-01, NS-04, NS-05).';

-- ⚠️ `employees_select` KHÔNG gọi `rls_employee_readable` mà chép lại điều kiện (di sản từ
-- 0049/0050). Hai chỗ phải sửa cùng lúc, nếu không thì hàm nói đọc được còn policy nói không.
DROP POLICY IF EXISTS employees_select ON public.employees;

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
      OR public.auth_has_role('KT', 'CFO')
      OR (block = 'xuong' AND public.auth_has_role('SX'))
    )
  );

DROP POLICY IF EXISTS timesheet_periods_select ON public.timesheet_periods;

CREATE POLICY timesheet_periods_select ON public.timesheet_periods
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      -- Chỉ huy công trường và Xưởng xem kỳ của khối mình để biết đã tới hạn xác nhận chưa.
      OR (source_type = 'cong_truong' AND public.auth_can_view_module('TC'))
      OR (source_type = 'xuong'       AND public.auth_has_role('SX'))
      -- Kế toán đọc để biết kỳ nào đã chốt, sẵn sàng tính lương (NS-05).
      OR public.auth_has_role('KT', 'CFO')
    )
  );

DROP POLICY IF EXISTS timesheet_entries_select ON public.timesheet_entries;

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
      OR EXISTS (
        SELECT 1 FROM public.timesheet_periods p
         WHERE p.id = timesheet_period_id
           AND p.source_type = 'xuong'
           AND public.auth_has_role('SX')
      )
    )
  );

DROP POLICY IF EXISTS timesheets_select ON public.timesheets;

CREATE POLICY timesheets_select ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN')
      OR public.rls_is_self_employee(employee_id)
      OR (source_type = 'xuong' AND public.auth_has_role('SX'))
    )
  );
