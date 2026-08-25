-- ============================================================================
-- Sửa nhập nhằng của auth_approval_limit()
--
-- VẤN ĐỀ: hàm cũ trả NULL cho HAI tình huống hoàn toàn khác nhau:
--   (a) người dùng được duyệt KHÔNG GIỚI HẠN (ví dụ Tổng Giám đốc, max_amount IS NULL)
--   (b) người dùng KHÔNG có quyền duyệt loại nghiệp vụ này (không có dòng hạn mức nào)
--
-- Giao diện đọc NULL rồi hiển thị "không giới hạn" sẽ cho nhân viên kinh doanh thấy
-- mình duyệt được mọi khoản chi — sai hoàn toàn về mặt kiểm soát (PRD NEN-02).
--
-- GIẢI PHÁP: thay bằng hàm trả về bản ghi tường minh, không thể đọc nhầm.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rls_can_approve(approval_subject, uuid, bigint);
DROP FUNCTION IF EXISTS public.auth_approval_limit(approval_subject, uuid);


-- Trả về quyền phê duyệt của người dùng hiện tại cho một loại nghiệp vụ.
--
--   can_approve  = có bất kỳ hạn mức nào cho loại nghiệp vụ này không
--   is_unlimited = có dòng hạn mức với max_amount NULL (duyệt không giới hạn)
--   max_amount   = mức cao nhất; NULL khi is_unlimited, hoặc khi can_approve = false
--
-- Giao diện PHẢI kiểm tra `can_approve` trước, rồi mới đọc `is_unlimited`/`max_amount`.
CREATE OR REPLACE FUNCTION public.auth_approval_permission(
  target_subject approval_subject,
  target_company_id uuid DEFAULT NULL
)
RETURNS TABLE (can_approve boolean, is_unlimited boolean, max_amount bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) > 0                             AS can_approve,
    COALESCE(bool_or(al.max_amount IS NULL), false) AS is_unlimited,
    max(al.max_amount)                       AS max_amount
  FROM public.approval_limits al
  JOIN public.user_companies uc ON uc.role_id = al.role_id
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL
    AND al.subject = target_subject
    AND al.is_active
    AND (al.company_id IS NULL OR al.company_id = target_company_id)
    AND (target_company_id IS NULL OR uc.company_id = target_company_id);
$$;

COMMENT ON FUNCTION public.auth_approval_permission(approval_subject, uuid) IS
  'Quyền phê duyệt của người dùng hiện tại. LUÔN kiểm tra can_approve trước khi đọc max_amount — NULL max_amount chỉ có nghĩa "không giới hạn" KHI can_approve = true.';


-- Mẫu C (Backend Schema 3.3) — hồ sơ có nằm trong hạn mức phê duyệt của người dùng không.
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
  perm record;
BEGIN
  IF NOT public.rls_company_access(target_company_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO perm
  FROM public.auth_approval_permission(target_subject, target_company_id);

  IF NOT perm.can_approve THEN
    RETURN false;
  END IF;

  IF perm.is_unlimited THEN
    RETURN true;
  END IF;

  -- Hồ sơ không gắn giá trị tiền (ví dụ nghỉ phép) thì hạn mức không ràng buộc.
  IF target_amount IS NULL THEN
    RETURN true;
  END IF;

  RETURN target_amount <= perm.max_amount;
END;
$$;

COMMENT ON FUNCTION public.rls_can_approve(approval_subject, uuid, bigint) IS
  'Mẫu C (Backend Schema 3.3) — kiểm tra hồ sơ có nằm trong hạn mức phê duyệt của người dùng.';
