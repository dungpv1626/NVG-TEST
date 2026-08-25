-- ============================================================================
-- Hạ tầng phân quyền Row Level Security
--
-- Nguồn: Backend Schema Mục 3.3 (4 mẫu chuẩn A/B/C/D) + Tech Stack Mục 3.3 và 4.2.
--
-- Nguyên tắc: quy tắc phân quyền viết TRỰC TIẾP trong cơ sở dữ liệu, không kiểm ở
-- tầng giao diện hay tầng API — để dù người dùng gọi thẳng Supabase (PostgREST) hay
-- đi qua Cloudflare Workers, quyền luôn được kiểm ở đúng MỘT nơi và không vòng qua được.
--
-- Thay vì viết policy riêng cho từng bảng trong ~65 bảng, mọi bảng áp dụng ĐÚNG MỘT
-- trong 4 mẫu dưới đây, dựng trên bộ hàm trợ giúp chung.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Hàm trợ giúp — nền của cả 4 mẫu
-- ----------------------------------------------------------------------------

-- `id` trong bảng `users` (hồ sơ nghiệp vụ) của người đang đăng nhập.
-- Khác `auth.uid()` — đó là id trong `auth.users` do Supabase Auth quản lý.
CREATE OR REPLACE FUNCTION public.auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND u.is_active
    AND u.deleted_at IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_user_id() IS
  'id nghiệp vụ (public.users.id) của người dùng đang đăng nhập. NULL nếu chưa đăng nhập hoặc tài khoản đã vô hiệu hóa.';


-- Vai trò người dùng đang giữ (ở mọi pháp nhân).
CREATE OR REPLACE FUNCTION public.auth_role_codes()
RETURNS role_code[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT r.code), ARRAY[]::role_code[])
  FROM public.user_companies uc
  JOIN public.roles r ON r.id = uc.role_id
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL;
$$;


-- Người dùng có giữ ít nhất một trong các vai trò truyền vào không.
CREATE OR REPLACE FUNCTION public.auth_has_role(VARIADIC codes role_code[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_role_codes() && codes;
$$;


-- Người dùng xem được dữ liệu của MỌI pháp nhân (Ban Giám đốc, Quản trị hệ thống).
-- Backend Schema 3.3 mẫu A: "vai trò Ban Giám đốc/Quản trị hệ thống xem được mọi pháp nhân".
CREATE OR REPLACE FUNCTION public.auth_sees_all_companies()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.roles r ON r.id = uc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND r.sees_all_companies
  );
$$;


-- Danh sách pháp nhân người dùng thuộc về. Nền của mẫu A.
CREATE OR REPLACE FUNCTION public.auth_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT uc.company_id), ARRAY[]::uuid[])
  FROM public.user_companies uc
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL;
$$;


-- ----------------------------------------------------------------------------
-- 2. MẪU A — theo pháp nhân
--
-- "Người dùng chỉ xem/sửa được dòng dữ liệu có company_id nằm trong danh sách pháp nhân
--  họ thuộc; vai trò Ban Giám đốc/Quản trị hệ thống xem được mọi pháp nhân."
--
-- Áp dụng: đa số bảng giao dịch (opportunities, bidding_projects, contracts,
-- construction_sites, purchase_requests, inventory…).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_company_access(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_id() IS NOT NULL
     AND (
       public.auth_sees_all_companies()
       OR target_company_id = ANY (public.auth_company_ids())
     );
$$;

COMMENT ON FUNCTION public.rls_company_access(uuid) IS
  'Mẫu A (Backend Schema 3.3) — quyền truy cập theo pháp nhân.';


-- ----------------------------------------------------------------------------
-- 3. MẪU B — theo người chịu trách nhiệm
--
-- "Ngoài điều kiện Mẫu A, chỉ người được gán là người chịu trách nhiệm/phối hợp hoặc
--  vai trò quản lý trực tiếp mới SỬA được (người khác trong cùng công ty chỉ XEM)."
--
-- Áp dụng: hồ sơ cá nhân phụ trách — nháp báo giá, dự toán đang soạn, nháp hợp đồng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_owner_can_write(
  target_company_id uuid,
  owner_user_id uuid,
  collaborator_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_company_access(target_company_id)
     AND (
       owner_user_id = public.auth_user_id()
       OR public.auth_user_id() = ANY (collaborator_ids)
       OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
     );
$$;

COMMENT ON FUNCTION public.rls_owner_can_write(uuid, uuid, uuid[]) IS
  'Mẫu B (Backend Schema 3.3) — chỉ người chịu trách nhiệm/phối hợp/quản lý mới sửa được.';


-- ----------------------------------------------------------------------------
-- 4. MẪU C — theo hạn mức phê duyệt
--
-- "Chỉ hiển thị trong Hộp thư Phê duyệt (và cho phép duyệt) nếu giá trị hồ sơ nằm trong
--  hạn mức của vai trò người dùng (đối chiếu approval_limits)."
--
-- Áp dụng: price_approvals, payment_requests, contracts.
-- PRD NEN-02: hạn mức PHẢI cấu hình được — hàm này đọc bảng, không hard-code con số.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_approval_limit(
  target_subject approval_subject,
  target_company_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_unlimited boolean;
  max_limit bigint;
BEGIN
  -- Hạn mức riêng của pháp nhân được ưu tiên hơn hạn mức áp dụng chung (company_id IS NULL).
  SELECT
    bool_or(al.max_amount IS NULL),
    max(al.max_amount)
  INTO has_unlimited, max_limit
  FROM public.approval_limits al
  JOIN public.user_companies uc ON uc.role_id = al.role_id
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL
    AND al.subject = target_subject
    AND al.is_active
    AND (al.company_id IS NULL OR al.company_id = target_company_id)
    AND (target_company_id IS NULL OR uc.company_id = target_company_id);

  -- NULL nghĩa là KHÔNG GIỚI HẠN (ví dụ Tổng Giám đốc), khác hẳn với "không có quyền".
  IF has_unlimited THEN
    RETURN NULL;
  END IF;

  RETURN max_limit;
END;
$$;

COMMENT ON FUNCTION public.auth_approval_limit(approval_subject, uuid) IS
  'Hạn mức phê duyệt cao nhất của người dùng cho một loại nghiệp vụ. NULL = không giới hạn. Đọc từ approval_limits (PRD NEN-02: không hard-code).';


CREATE OR REPLACE FUNCTION public.rls_can_approve(
  target_subject approval_subject,
  target_company_id uuid,
  target_amount bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  limit_amount bigint;
  has_any_limit boolean;
BEGIN
  IF NOT public.rls_company_access(target_company_id) THEN
    RETURN false;
  END IF;

  -- Phân biệt "không có dòng hạn mức nào" (không có quyền duyệt loại này)
  -- với "có dòng hạn mức max_amount NULL" (được duyệt không giới hạn).
  SELECT EXISTS (
    SELECT 1
    FROM public.approval_limits al
    JOIN public.user_companies uc ON uc.role_id = al.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND al.subject = target_subject
      AND al.is_active
      AND (al.company_id IS NULL OR al.company_id = target_company_id)
  ) INTO has_any_limit;

  IF NOT has_any_limit THEN
    RETURN false;
  END IF;

  limit_amount := public.auth_approval_limit(target_subject, target_company_id);

  -- NULL = không giới hạn.
  IF limit_amount IS NULL THEN
    RETURN true;
  END IF;

  -- Hồ sơ chưa có giá trị tiền (ví dụ nghỉ phép) thì hạn mức không ràng buộc.
  IF target_amount IS NULL THEN
    RETURN true;
  END IF;

  RETURN target_amount <= limit_amount;
END;
$$;

COMMENT ON FUNCTION public.rls_can_approve(approval_subject, uuid, bigint) IS
  'Mẫu C (Backend Schema 3.3) — hồ sơ có nằm trong hạn mức phê duyệt của người dùng không.';


-- ----------------------------------------------------------------------------
-- 5. MẪU D — dữ liệu nhạy cảm, hạn chế theo CỘT
--
-- "Toàn bộ dòng dữ liệu xem được theo Mẫu A, nhưng một số CỘT (giá vốn, lợi nhuận, lương)
--  chỉ trả về giá trị thật cho vai trò được phép — vai trò khác nhận giá trị rỗng/ẩn."
--
-- Áp dụng: estimates (giá vốn), project_budgets (lợi nhuận), employees (lương).
-- PRD NEN-07: mọi lượt xem/sửa dữ liệu Mẫu D phải ghi nhật ký.
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
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.rls_sees_sensitive(text) IS
  'Mẫu D (Backend Schema 3.3) — quyền xem cột nhạy cảm: cost | profit | salary. Mọi lượt truy cập phải ghi sensitive_access_logs (PRD NEN-07).';


-- ----------------------------------------------------------------------------
-- 6. Bật RLS cho các bảng nền tảng
--
-- Mặc định Postgres KHÔNG bật RLS — bảng nào quên bật là lộ toàn bộ dữ liệu qua
-- PostgREST. Bật ngay từ bảng đầu tiên để không tạo thói quen sai.
-- ----------------------------------------------------------------------------

ALTER TABLE public.companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_limits ENABLE ROW LEVEL SECURITY;


-- companies: mọi người đăng nhập đều xem được danh mục pháp nhân (cần cho bộ chọn
-- pháp nhân ở Webapp Flow 2.2). Chỉ Quản trị hệ thống được sửa.
CREATE POLICY companies_select ON public.companies
  FOR SELECT TO authenticated
  USING (public.auth_user_id() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY companies_admin_write ON public.companies
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN'))
  WITH CHECK (public.auth_has_role('ADMIN'));


-- users: xem được người cùng pháp nhân (cần để gán người chịu trách nhiệm).
-- Tự sửa được hồ sơ của chính mình; Quản trị hệ thống và Nhân sự sửa được mọi hồ sơ.
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    public.auth_user_id() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      id = public.auth_user_id()
      OR public.auth_sees_all_companies()
      OR EXISTS (
        SELECT 1 FROM public.user_companies uc
        WHERE uc.user_id = public.users.id
          AND uc.deleted_at IS NULL
          AND uc.company_id = ANY (public.auth_company_ids())
      )
    )
  );

CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = public.auth_user_id())
  WITH CHECK (id = public.auth_user_id());

CREATE POLICY users_admin_write ON public.users
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN', 'NS'))
  WITH CHECK (public.auth_has_role('ADMIN', 'NS'));


-- roles / permissions: mọi người đăng nhập đọc được (giao diện cần biết quyền để
-- ẩn/hiện menu — Webapp Flow 6.5). Chỉ Quản trị hệ thống sửa.
CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (public.auth_user_id() IS NOT NULL);

CREATE POLICY roles_admin_write ON public.roles
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN'))
  WITH CHECK (public.auth_has_role('ADMIN'));

CREATE POLICY permissions_select ON public.permissions
  FOR SELECT TO authenticated
  USING (public.auth_user_id() IS NOT NULL);

CREATE POLICY permissions_admin_write ON public.permissions
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN'))
  WITH CHECK (public.auth_has_role('ADMIN'));


-- user_companies: xem được dòng của chính mình và của người cùng pháp nhân.
-- Chỉ Quản trị hệ thống và Nhân sự thay đổi việc gán vai trò.
CREATE POLICY user_companies_select ON public.user_companies
  FOR SELECT TO authenticated
  USING (
    public.auth_user_id() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      user_id = public.auth_user_id()
      OR public.auth_sees_all_companies()
      OR company_id = ANY (public.auth_company_ids())
    )
  );

CREATE POLICY user_companies_admin_write ON public.user_companies
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN', 'NS'))
  WITH CHECK (public.auth_has_role('ADMIN', 'NS'));


-- approval_limits: đọc được để giao diện biết ai duyệt được mức nào.
-- Chỉ Quản trị hệ thống sửa — đây là dữ liệu cấu hình quyền lực nhất hệ thống.
CREATE POLICY approval_limits_select ON public.approval_limits
  FOR SELECT TO authenticated
  USING (public.auth_user_id() IS NOT NULL);

CREATE POLICY approval_limits_admin_write ON public.approval_limits
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN'))
  WITH CHECK (public.auth_has_role('ADMIN'));


-- ----------------------------------------------------------------------------
-- 7. Thu hồi quyền mặc định
--
-- Vai trò `anon` (chưa đăng nhập) KHÔNG được đọc bất kỳ bảng nghiệp vụ nào.
-- Backend Schema 3.1: hệ thống nội bộ, không có luồng tự đăng ký công khai.
-- ----------------------------------------------------------------------------

REVOKE ALL ON public.companies       FROM anon;
REVOKE ALL ON public.users           FROM anon;
REVOKE ALL ON public.roles           FROM anon;
REVOKE ALL ON public.permissions     FROM anon;
REVOKE ALL ON public.user_companies  FROM anon;
REVOKE ALL ON public.approval_limits FROM anon;
