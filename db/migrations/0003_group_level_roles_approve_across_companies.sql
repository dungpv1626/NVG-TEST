-- ============================================================================
-- Vai trò cấp tập đoàn phải phê duyệt được xuyên pháp nhân
--
-- VẤN ĐỀ: `auth_approval_permission` lọc `uc.company_id = target_company_id`, tức là
-- người dùng phải được gán trực tiếp vào ĐÚNG pháp nhân của hồ sơ mới duyệt được.
--
-- Điều này chặn sai khối Back Office: theo PRD Mục 1.1 và Phụ lục C, Tài chính, Kế toán
-- và Hành chính – Nhân sự là chức năng DÙNG CHUNG phục vụ cả ba pháp nhân. Giám đốc Tài
-- chính thuộc cấp tập đoàn (NVG) nhưng phải duyệt chi cho NVC/NVS/NVO.
--
-- Triệu chứng đã quan sát: CFO có hạn mức 200 triệu cho đề nghị thanh toán, nhưng
-- `rls_can_approve` trả false với MỌI giá trị khi hồ sơ thuộc NVC.
--
-- GIẢI PHÁP: bỏ qua điều kiện lọc pháp nhân khi vai trò được đánh dấu `sees_all_companies`
-- — nhất quán với `rls_company_access` vốn đã tôn trọng cờ này.
-- ============================================================================

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
    count(*) > 0                                    AS can_approve,
    COALESCE(bool_or(al.max_amount IS NULL), false) AS is_unlimited,
    max(al.max_amount)                              AS max_amount
  FROM public.approval_limits al
  JOIN public.user_companies uc ON uc.role_id = al.role_id
  JOIN public.roles r           ON r.id = uc.role_id
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL
    AND al.subject = target_subject
    AND al.is_active
    -- Hạn mức áp dụng chung (company_id NULL) hoặc riêng cho pháp nhân của hồ sơ.
    AND (al.company_id IS NULL OR al.company_id = target_company_id)
    -- Người dùng phải thuộc pháp nhân của hồ sơ, TRỪ vai trò cấp tập đoàn
    -- (Ban Giám đốc, Tài chính, Quản trị hệ thống) vốn hoạt động xuyên pháp nhân.
    AND (
      target_company_id IS NULL
      OR uc.company_id = target_company_id
      OR r.sees_all_companies
    );
$$;

COMMENT ON FUNCTION public.auth_approval_permission(approval_subject, uuid) IS
  'Quyền phê duyệt của người dùng hiện tại. LUÔN kiểm tra can_approve trước khi đọc max_amount — NULL max_amount chỉ có nghĩa "không giới hạn" KHI can_approve = true. Vai trò có sees_all_companies phê duyệt được xuyên pháp nhân (PRD Mục 1.1: Back Office dùng chung).';
