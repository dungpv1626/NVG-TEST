-- ============================================================================
-- RLS cho bảng customers (CRM-01)
--
-- `customers` là bảng DÙNG CHUNG giữa các pháp nhân (Backend Schema 2.2) nên KHÔNG có
-- `company_id` — không áp dụng được Mẫu A theo cách thông thường.
--
-- Áp dụng biến thể của MẪU B (theo người chịu trách nhiệm):
--  - XEM: mọi người dùng đã đăng nhập có quyền xem module CRM.
--    Lý do: PRD CRM-01 yêu cầu "hồ sơ khách hàng TẬP TRUNG"; giấu khách hàng giữa các
--    pháp nhân sẽ tái tạo đúng vướng mắc #3 và #5 trong khảo sát (mất thời gian đi tìm,
--    phải hỏi đi hỏi lại). Ba công ty vốn liên kết về khách hàng (PRD Mục 1.1).
--  - SỬA: chỉ người chịu trách nhiệm, hoặc vai trò quản lý.
--    PRD CRM-10 + NEN-10: khi nhân viên kinh doanh nghỉ việc, hồ sơ chuyển sang người
--    kế nhiệm — nên quyền sửa gắn với người chịu trách nhiệm, không gắn với người tạo.
--  - XOÁ: không cho xoá cứng từ trình duyệt; chỉ xoá mềm qua cập nhật `deleted_at`.
-- ============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customers FROM anon;

-- Quyền xem module CRM của người dùng hiện tại.
CREATE OR REPLACE FUNCTION public.auth_can_view_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.permissions p ON p.role_id = uc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND p.module_code = p_module
      AND p.can_view
  );
$$;

COMMENT ON FUNCTION public.auth_can_view_module(text) IS
  'Người dùng có quyền xem một module hay không. Dùng cho bảng DÙNG CHUNG không có company_id.';


CREATE OR REPLACE FUNCTION public.auth_can_edit_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.permissions p ON p.role_id = uc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND p.module_code = p_module
      AND p.can_edit
  );
$$;


CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.auth_can_view_module('CRM'));

CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_companies uc
      JOIN public.permissions p ON p.role_id = uc.role_id
      WHERE uc.user_id = public.auth_user_id()
        AND uc.deleted_at IS NULL
        AND p.module_code = 'CRM'
        AND p.can_create
    )
  );

-- Mẫu B: chỉ người chịu trách nhiệm hoặc vai trò quản lý mới sửa được.
CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.auth_can_edit_module('CRM')
    AND (
      responsible_user_id = public.auth_user_id()
      OR responsible_user_id IS NULL
      OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
    )
  )
  WITH CHECK (public.auth_can_edit_module('CRM'));

-- Không có policy DELETE ⇒ xoá cứng bị chặn. Xoá mềm thực hiện qua UPDATE deleted_at,
-- giữ lịch sử theo NEN-03.


-- ----------------------------------------------------------------------------
-- Cấp mã hồ sơ tự động
--
-- Quy tắc mã: {PHÁP NHÂN}-{LOẠI}-{NĂM}-{SỐ THỨ TỰ 4 CHỮ SỐ} (xem @nvg/shared/codes).
-- Số thứ tự PHẢI do cơ sở dữ liệu cấp: nếu để trình duyệt tự đếm, hai người tạo hồ sơ
-- cùng lúc sẽ nhận cùng một mã.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.record_sequences (
  company_code varchar(8)  NOT NULL,
  record_type  varchar(8)  NOT NULL,
  year         integer     NOT NULL,
  last_value   integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (company_code, record_type, year)
);

ALTER TABLE public.record_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_sequences FROM anon;
-- Không policy nào ⇒ không đọc/ghi được từ trình duyệt; chỉ hàm bên dưới đụng tới.

CREATE OR REPLACE FUNCTION public.next_record_code(
  p_company_code text,
  p_record_type text,
  p_year integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int);
  v_next integer;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  INSERT INTO public.record_sequences (company_code, record_type, year, last_value)
  VALUES (upper(p_company_code), upper(p_record_type), v_year, 1)
  ON CONFLICT (company_code, record_type, year)
  DO UPDATE SET last_value = public.record_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s-%s', upper(p_company_code), upper(p_record_type), v_year,
                lpad(v_next::text, 4, '0'));
END;
$$;

COMMENT ON FUNCTION public.next_record_code(text, text, integer) IS
  'Cấp mã hồ sơ kế tiếp theo pháp nhân/loại/năm. Số thứ tự do CSDL cấp để không trùng khi nhiều người tạo cùng lúc.';
