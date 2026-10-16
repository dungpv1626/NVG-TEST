/**
 * Kiểm soát nội bộ (KSNB) — XEM mọi pháp nhân, mọi phân hệ; KHÔNG ghi, KHÔNG phê duyệt.
 *
 * Quyền xem đến từ `permissions` (seed: mọi module chỉ `view`) và `roles.sees_all_companies`.
 * Quyền ghi của gần như mọi bảng đã đòi `auth_can_edit_module` / `can_create` / `can_approve` /
 * `rls_owner_can_write` (danh sách vai trò quản lý) — KSNB không có cái nào. Rà toàn bộ chỗ dùng
 * `sees_all_companies` (0168, rà soát trước khi thêm vai trò): đúng HAI bảng cho ghi chỉ vì
 * «xem mọi pháp nhân» — danh mục kiểm tra nghiệm thu (0136) và phân công người vào công trình
 * (0115). Cả hai đổi sang `auth_manages_all_companies()` = xem mọi pháp nhân VÀ không phải vai
 * trò chỉ xem. `ksnb.test.ts` thử ghi trên các bảng và hàm chính để canh chỗ sót.
 *
 * Dữ liệu nhạy cảm (Mẫu D): kiểm soát cần thấy giá vốn, lợi nhuận và tài chính để kiểm; KHÔNG
 * thấy lương và hồ sơ cá nhân (mặc định trong kế hoạch, chờ Haan — câu hỏi 5). Đọc được nhật ký
 * kiểm toán và nhật ký truy cập dữ liệu nhạy cảm.
 *
 * Chữ 'KSNB' luôn so dưới dạng `text` (`r.code::text`, `auth_role_codes()::text[]`): giá trị enum
 * vừa thêm ở 0167 chưa commit khi các migration chạy chung một giao dịch.
 *
 * Trang mặc định của lãnh đạo (TGĐ, CFO, BGĐ) đổi sang «Tổng quan điều hành» `/tong-quan`.
 */

-- ----------------------------------------------------------------------------
-- 1. Vai trò chỉ xem
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_is_read_only()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Chỉ xem khi MỌI vai trò của người dùng đều là vai trò chỉ xem — giữ thêm một vai trò làm
  -- việc thì làm việc được, đúng cách các hàm quyền khác hợp nhất vai trò.
  SELECT EXISTS (
           SELECT 1 FROM public.user_companies uc JOIN public.roles r ON r.id = uc.role_id
            WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
              AND r.code::text = 'KSNB')
     AND NOT EXISTS (
           SELECT 1 FROM public.user_companies uc JOIN public.roles r ON r.id = uc.role_id
            WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
              AND r.code::text <> 'KSNB');
$$;

COMMENT ON FUNCTION public.auth_is_read_only() IS
  'Người dùng chỉ giữ vai trò chỉ xem (Kiểm soát nội bộ, 0168).';

CREATE OR REPLACE FUNCTION public.auth_manages_all_companies()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_sees_all_companies() AND NOT public.auth_is_read_only();
$$;

COMMENT ON FUNCTION public.auth_manages_all_companies() IS
  'Xem mọi pháp nhân VÀ được làm việc (0168). Dùng thay auth_sees_all_companies() ở điều kiện GHI '
  '— «xem mọi pháp nhân» không còn đồng nghĩa «quản lý mọi pháp nhân» từ khi có Kiểm soát nội bộ.';

GRANT EXECUTE ON FUNCTION public.auth_is_read_only() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_manages_all_companies() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Hai bảng cho ghi chỉ vì «xem mọi pháp nhân»
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS acceptance_checklists_insert ON public.acceptance_checklists;
CREATE POLICY acceptance_checklists_insert ON public.acceptance_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  );

DROP POLICY IF EXISTS acceptance_checklists_update ON public.acceptance_checklists;
CREATE POLICY acceptance_checklists_update ON public.acceptance_checklists
  FOR UPDATE TO authenticated
  USING (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  )
  WITH CHECK (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  );

DROP POLICY IF EXISTS user_site_assignments_insert ON public.user_site_assignments;
CREATE POLICY user_site_assignments_insert ON public.user_site_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  );

DROP POLICY IF EXISTS user_site_assignments_update ON public.user_site_assignments;
CREATE POLICY user_site_assignments_update ON public.user_site_assignments
  FOR UPDATE TO authenticated
  USING (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  )
  WITH CHECK (
    public.auth_manages_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  );

-- ----------------------------------------------------------------------------
-- 3. Dữ liệu nhạy cảm và nhật ký
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_sees_sensitive(kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE kind
    WHEN 'cost'   THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'DA_DT', 'TKE', 'MH')
                       OR public.auth_role_codes()::text[] && ARRAY['KSNB']
    WHEN 'profit' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
                       OR public.auth_role_codes()::text[] && ARRAY['KSNB']
    -- Lương và hồ sơ cá nhân: KSNB KHÔNG xem (mặc định, chờ Haan).
    WHEN 'salary' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'NS', 'KT')
    WHEN 'personal' THEN public.auth_has_role('TGD', 'BGD', 'ADMIN', 'NS')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.rls_sees_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KT')
      OR public.auth_role_codes()::text[] && ARRAY['KSNB'];
$$;

DROP POLICY IF EXISTS audit_logs_supervisors_read ON public.audit_logs;
CREATE POLICY audit_logs_supervisors_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
         OR public.auth_role_codes()::text[] && ARRAY['KSNB']);

DROP POLICY IF EXISTS sensitive_access_logs_supervisors_read ON public.sensitive_access_logs;
CREATE POLICY sensitive_access_logs_supervisors_read ON public.sensitive_access_logs
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
         OR public.auth_role_codes()::text[] && ARRAY['KSNB']);

-- ----------------------------------------------------------------------------
-- 4. Lãnh đạo vào thẳng «Tổng quan điều hành»
-- ----------------------------------------------------------------------------

UPDATE public.roles SET default_route = '/tong-quan', updated_at = now()
 WHERE code IN ('TGD', 'CFO', 'BGD');
