-- ============================================================================
-- Kế toán đọc được hồ sơ nhân sự ở mức TÊN và KHỐI — NS-05
--
-- PHÁT HIỆN KHI VIẾT TEST: `rls_employee_readable` chỉ mở cho Hành chính – Nhân sự, chính
-- mình, quản lý trực tiếp và chỉ huy công trường. Kết quả là Kế toán — vai trò được
-- `rls_sees_sensitive('salary')` cho phép xem lương từ migration 0001 — lại không đọc nổi
-- hồ sơ để gọi `employee_salary`, và cũng không đọc được TÊN người trên bảng công đã chốt mà
-- chính họ phải dùng để tính lương (NS-05: "chuyển dữ liệu đã chốt cho Kế toán tính lương").
--
-- Bảng công thì họ đọc được (`timesheets_select` đã mở cho KT), nên tình trạng cũ là: có số
-- công, không có tên người. Vô dụng, và dễ bị "sửa" bằng cách gõ lại tên vào Excel — đúng thứ
-- PRD Mục 2.3 cấm.
--
-- Mở đúng phần cần: DÒNG hồ sơ nhân sự trong pháp nhân của họ. Các cột nhạy cảm KHÔNG đổi —
-- căn cước, sức khỏe, kỷ luật vẫn đóng với Kế toán (`rls_sees_sensitive('personal')` không
-- gồm KT), lương vẫn phải đi qua `employee_salary` và vẫn ghi nhật ký từng lượt (NEN-07).
-- ============================================================================

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
         -- Kế toán – Tài chính: cần tên và khối để đối chiếu bảng công đã chốt (NS-05).
         OR public.auth_has_role('KT', 'CFO')
       )
  );
$$;

COMMENT ON FUNCTION public.rls_employee_readable(uuid) IS
  'Đọc được hồ sơ nhân sự này không — HCNS, chính mình, quản lý trực tiếp, chỉ huy công trường, Kế toán – Tài chính (NS-01, NS-04, NS-05).';

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
    )
  );
