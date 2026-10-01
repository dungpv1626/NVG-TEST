-- ============================================================================
-- Tạo tài khoản người dùng trên giao diện (NEN-02).
--
-- Trước đợt này tài khoản chỉ tạo được bằng bộ nạp dữ liệu: Quản trị viên xem được danh sách
-- nhưng không thêm được người mới. Tạo tài khoản gồm hai nửa ở hai nơi:
--   1. danh tính đăng nhập trong Supabase Auth — chỉ `service_role` làm được, nên nằm ở Worker
--      (`POST /admin/users`, `workers/src/admin/`);
--   2. hồ sơ nghiệp vụ `users` + MỘT cặp pháp nhân – vai trò chính `user_companies` — hàm dưới đây.
--
-- Hàm chạy bằng JWT của NGƯỜI BẤM (Worker gọi bằng token của họ, không bằng service_role), nên
-- nó tự kiểm người gọi là Quản trị hệ thống và ghi đúng `created_by`. Hai bảng ghi trong một
-- giao dịch: không có tài khoản nào có hồ sơ mà thiếu vai trò.
--
-- Chỉ ADMIN — không mở cho Nhân sự dù policy `users_admin_write` cho NS ghi: cấp quyền đăng nhập
-- là việc của Quản trị hệ thống (PRD NEN-02).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_accounts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_id() IS NOT NULL AND public.auth_has_role('ADMIN');
$$;

COMMENT ON FUNCTION public.can_manage_accounts() IS
  'Người đang đăng nhập được tạo tài khoản mới (NEN-02). Worker gọi trước khi tạo danh tính đăng nhập.';

REVOKE ALL ON FUNCTION public.can_manage_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_accounts() TO authenticated;


CREATE OR REPLACE FUNCTION public.create_account_profile(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_job_title text,
  p_department text,
  p_company_id uuid,
  p_role_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.auth_user_id();
  v_user_id uuid;
BEGIN
  IF NOT public.can_manage_accounts() THEN
    RAISE EXCEPTION 'Chỉ Quản trị hệ thống tạo được tài khoản mới.'
      USING ERRCODE = '42501';
  END IF;
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu danh tính đăng nhập của tài khoản.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Chưa nhập họ tên.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_email), '') = '' THEN
    RAISE EXCEPTION 'Chưa nhập email.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'Pháp nhân không tồn tại.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = p_role_id) THEN
    RAISE EXCEPTION 'Vai trò không tồn tại.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = lower(btrim(p_email))) THEN
    RAISE EXCEPTION 'Email này đã có tài khoản.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.users (auth_user_id, email, full_name, phone, job_title, department,
                            created_by, updated_by)
  VALUES (p_auth_user_id, lower(btrim(p_email)), btrim(p_full_name),
          nullif(btrim(p_phone), ''), nullif(btrim(p_job_title), ''),
          nullif(btrim(p_department), ''), v_actor, v_actor)
  RETURNING id INTO v_user_id;

  INSERT INTO public.user_companies (user_id, company_id, role_id, is_primary, created_by, updated_by)
  VALUES (v_user_id, p_company_id, p_role_id, true, v_actor, v_actor);

  RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION public.create_account_profile(uuid, text, text, text, text, text, uuid, uuid) IS
  'Hồ sơ nghiệp vụ + vai trò chính cho một danh tính đăng nhập vừa tạo (NEN-02). Gọi bằng JWT của Quản trị viên.';

REVOKE ALL ON FUNCTION public.create_account_profile(uuid, text, text, text, text, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_account_profile(uuid, text, text, text, text, text, uuid, uuid)
  TO authenticated;


-- ----------------------------------------------------------------------------
-- Tài khoản quản trị mẫu mang họ tên «Quản trị hệ thống», nên lời chào Dashboard rút từ cuối
-- thành «Chào thống» (thấy khi chụp hướng dẫn Quản trị hệ thống, 01/10/2026). Đặt một họ tên
-- người như mọi tài khoản mẫu khác; chỉ đúng tài khoản seed, đúng giá trị cũ.
-- ----------------------------------------------------------------------------
UPDATE public.users
   SET full_name = 'Phan Văn M'
 WHERE email = 'admin@nhavietgroup.test'
   AND full_name = 'Quản trị hệ thống';
