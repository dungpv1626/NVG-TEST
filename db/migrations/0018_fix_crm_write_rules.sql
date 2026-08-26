-- ============================================================================
-- Ba lỗi phân quyền tìm được khi rà soát luồng khảo sát và khiếu nại
--
-- Cả ba đều thuộc loại "RLS quá chặt hoặc quá lỏng mà không có triệu chứng" — không lỗi,
-- không cảnh báo, chỉ là hành vi sai âm thầm.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- LỖI 1 — quyền tạo hồ sơ không gắn với ĐÚNG pháp nhân của hồ sơ
--
-- Điều kiện cũ chỉ hỏi "người này có quyền tạo hồ sơ CRM ở ĐÂU ĐÓ không", không hỏi
-- "ở CHÍNH pháp nhân này không". Người vừa làm kinh doanh ở NVC vừa được cấp quyền chỉ xem
-- ở NVO sẽ tạo được cơ hội và khiếu nại dưới tên NVO — vượt qua đúng ranh giới tách P&L mà
-- NEN-01 dựng lên.
--
-- Gom thành một hàm để 10 module còn lại dùng lại, thay vì chép đoạn EXISTS đi khắp nơi
-- rồi sót một chỗ.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_can_create_in(
  target_module text,
  target_company_id uuid
)
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
    JOIN public.roles r       ON r.id = uc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND p.module_code = target_module
      AND p.can_create
      -- Vai trò cấp tập đoàn (Quản trị hệ thống) làm việc xuyên pháp nhân, giống
      -- `auth_approval_permission` — PRD Mục 1.1: Back Office dùng chung.
      AND (uc.company_id = target_company_id OR r.sees_all_companies)
  );
$$;

COMMENT ON FUNCTION public.auth_can_create_in(text, uuid) IS
  'Người dùng có quyền tạo hồ sơ của module này TRONG ĐÚNG pháp nhân này không (PRD NEN-01).';


DROP POLICY IF EXISTS opportunities_insert ON public.opportunities;
CREATE POLICY opportunities_insert ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_create_in('CRM', company_id)
  );

DROP POLICY IF EXISTS complaints_insert ON public.complaints;
CREATE POLICY complaints_insert ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_create_in('CRM', company_id)
  );

COMMENT ON POLICY complaints_insert ON public.complaints IS
  'Tiếp nhận khiếu nại: người có quyền tạo hồ sơ CRM TRONG ĐÚNG pháp nhân đó (CRM-08).';


-- ----------------------------------------------------------------------------
-- LỖI 2 — khiếu nại CHƯA PHÂN CÔNG bị đóng băng vĩnh viễn
--
-- `rls_owner_can_write(company_id, NULL, '{}')` cho ra `NULL OR false OR false` = NULL,
-- và policy coi NULL là từ chối. Hệ quả: người tiếp nhận ghi nhận khiếu nại mà chưa biết
-- giao cho ai (ô "Chưa phân công" trên biểu mẫu) thì SAU ĐÓ KHÔNG AI phân công được nữa —
-- trừ Tổng Giám đốc. Đúng nửa "phân luồng" của CRM-08 trở thành không thể thực hiện.
--
-- Nghịch lý dễ thấy: bỏ trống người chủ trì thì hồ sơ khoá chặt hơn là điền tên ai đó.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS complaints_update ON public.complaints;
CREATE POLICY complaints_update ON public.complaints
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      -- Đã có người chịu trách nhiệm → Mẫu B như cũ.
      public.rls_owner_can_write(company_id, assignee_id, collaborator_ids)
      -- Chưa phân công → ai ghi nhận được thì phân luồng được. Hồ sơ vô chủ không được
      -- phép là hồ sơ bất khả xâm phạm.
      OR (
        assignee_id IS NULL
        AND cardinality(collaborator_ids) = 0
        AND public.rls_company_access(company_id)
        AND public.auth_can_create_in('CRM', company_id)
      )
    )
  )
  WITH CHECK (public.rls_company_access(company_id));

COMMENT ON POLICY complaints_update ON public.complaints IS
  'Xử lý khiếu nại: người chủ trì, người phối hợp và quản lý (Mẫu B); hồ sơ chưa phân công thì người có quyền tạo cũng phân luồng được (CRM-08).';


-- ----------------------------------------------------------------------------
-- LỖI 3 — sửa được `company_id` là chuyển hồ sơ sang pháp nhân khác
--
-- `WITH CHECK` không tham chiếu được giá trị CŨ của dòng, nên policy không thể tự chặn
-- việc đổi pháp nhân: người thuộc hai pháp nhân đổi `company_id` sang pháp nhân kia là
-- lệnh vẫn hợp lệ ở cả hai đầu. Khiếu nại (và chi phí xử lý kèm theo) nhảy sang P&L khác
-- mà không để lại vết gì.
--
-- Ràng buộc kiểu "cột này bất biến sau khi tạo" phải làm bằng trigger, không làm bằng policy.
-- Khoá luôn `customer_id`: đổi khách hàng của một khiếu nại đã ghi nhận là viết lại lịch sử,
-- không phải sửa dữ liệu.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complaints_freeze_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Không đổi được pháp nhân của khiếu nại đã ghi nhận.';
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'Không đổi được khách hàng của khiếu nại đã ghi nhận. Ghi nhận khiếu nại mới nếu nhầm khách hàng.';
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Không đổi được mã hồ sơ.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER complaints_freeze_identity
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_freeze_identity();

COMMENT ON FUNCTION public.complaints_freeze_identity() IS
  'Pháp nhân, khách hàng và mã hồ sơ là bất biến sau khi ghi nhận (PRD NEN-01, NEN-03).';
