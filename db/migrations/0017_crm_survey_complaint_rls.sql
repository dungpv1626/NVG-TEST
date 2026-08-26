-- ============================================================================
-- Siết quyền ghi cho biên bản khảo sát (CRM-03) và khiếu nại (CRM-08)
--
-- Policy cũ ở 0009 dùng `FOR ALL` cho cả hai bảng. Hai vấn đề:
--
--  1. `FOR ALL` bao gồm cả DELETE, tức là xoá HẲN một dòng. Backend Schema 1.4 quy định
--     bảng nghiệp vụ quan trọng dùng xoá mềm (`deleted_at`), KHÔNG xoá hẳn — một biên bản
--     khảo sát hay khiếu nại biến mất khỏi cơ sở dữ liệu là mất luôn vết, không truy được.
--
--  2. Với `complaints`, điều kiện ghi là `rls_owner_can_write(company_id, assignee_id)` áp
--     cho CẢ lệnh INSERT. Hệ quả: người tiếp nhận khiếu nại chỉ tạo được hồ sơ nếu tự nhận
--     mình là người chủ trì. Nhưng CRM-08 nói rõ "ghi nhận và PHÂN LUỒNG" — người nhận điện
--     thoại của khách thường không phải người xử lý. Quy tắc cũ đẩy họ tới chỗ ghi bừa tên
--     mình rồi sửa lại, hoặc tệ hơn là không ghi nhận gì.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. site_surveys — bỏ DELETE, giữ nguyên phạm vi ghi theo cơ hội mẹ
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS site_surveys_write ON public.site_surveys;

CREATE POLICY site_surveys_insert ON public.site_surveys
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_quote_writable(opportunity_id));

CREATE POLICY site_surveys_update ON public.site_surveys
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_quote_writable(opportunity_id))
  WITH CHECK (public.rls_quote_writable(opportunity_id));

COMMENT ON POLICY site_surveys_insert ON public.site_surveys IS
  'Biên bản khảo sát thừa hưởng quyền ghi từ cơ hội mẹ — cùng điều kiện với báo giá (Mẫu B).';


-- ----------------------------------------------------------------------------
-- 2. complaints — tách TIẾP NHẬN khỏi XỬ LÝ
--
-- Ai cũng ghi nhận được khiếu nại (miễn có quyền tạo hồ sơ trong CRM ở pháp nhân đó);
-- chỉ người chủ trì, người PHỐI HỢP và quản lý mới sửa được diễn biến xử lý.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS complaints_write ON public.complaints;

CREATE POLICY complaints_insert ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.user_companies uc
      JOIN public.permissions p ON p.role_id = uc.role_id
      WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
        AND p.module_code = 'CRM' AND p.can_create
    )
  );

CREATE POLICY complaints_update ON public.complaints
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    -- Mẫu B có tính tới người phối hợp (Backend Schema 3.3) — đúng thứ CRM-08 yêu cầu.
    AND public.rls_owner_can_write(company_id, assignee_id, collaborator_ids)
  )
  WITH CHECK (public.rls_company_access(company_id));

COMMENT ON POLICY complaints_insert ON public.complaints IS
  'Tiếp nhận khiếu nại: mọi người có quyền tạo hồ sơ CRM trong pháp nhân (CRM-08 "ghi nhận và phân luồng").';
COMMENT ON POLICY complaints_update ON public.complaints IS
  'Xử lý khiếu nại: chỉ người chủ trì, người phối hợp và quản lý trực tiếp (Mẫu B).';
