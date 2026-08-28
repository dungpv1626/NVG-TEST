-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `my_pending_approvals`
-- (sửa gần nhất ở 0044) giải `parent_id` cho loại 'estimates' CHỈ bằng `e.bidding_project_id`
-- — không có phương án dự phòng cho `e.design_project_id`. Mọi dự toán thuộc nhánh Thiết kế
-- (NVO, `design_project_id` khác NULL, `bidding_project_id` là NULL) rơi vào Hộp thư Phê duyệt
-- với `parent_id = NULL`.
--
-- `web/src/pages/phe-duyet/approval-inbox-page.tsx` lại đặt CỨNG route cho loại 'estimates' là
-- `/da/goi-thau/:parent_id` — người duyệt bấm "Xem hồ sơ đầy đủ" cho một dự toán NVO hoặc rơi
-- về danh sách gói thầu (parent_id NULL) hoặc, sau khi chỉ vá riêng CSDL mà không vá Frontend,
-- sẽ mở NHẦM route DA bằng một id thật ra là design_project — hai lỗi khác nhau nhưng cùng gốc.
--
-- Vá đủ cả hai đầu:
--   1. CSDL: thêm cột `parent_module` để Frontend biết hồ sơ cha là gói thầu (DA) hay dự án
--      thiết kế (TK) — không thể chỉ suy từ chính `parent_id` (cùng kiểu uuid, không tự phân
--      biệt được nguồn). RETURNS TABLE đổi cột nên phải DROP FUNCTION trước khi tạo lại — xem
--      bài học 0071 (không sinh thiếu bug mới): DROP FUNCTION xoá quyền EXECUTE cũ, phải GRANT
--      lại tường minh vì 0062 đã đổi mặc định thành đóng.
--   2. Frontend (`approval-inbox-page.tsx`, `use-approvals.ts`): dùng `parent_module` để chọn
--      đúng route `/da/goi-thau/:id` hay `/tk/du-an/:id`.
-- ============================================================================

DROP FUNCTION IF EXISTS public.my_pending_approvals();

CREATE FUNCTION public.my_pending_approvals()
RETURNS TABLE (
  id                uuid,
  subject           approval_subject,
  entity_type       varchar(64),
  entity_id         uuid,
  entity_code       varchar(40),
  title             text,
  amount            bigint,
  reason            text,
  requested_at      timestamptz,
  requested_by_name text,
  company_code      varchar(8),
  company_name      varchar(64),
  parent_id         uuid,
  parent_module     varchar(8)
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.id, a.subject, a.entity_type, a.entity_id, a.entity_code, a.title, a.amount, a.reason,
    a.requested_at, u.full_name, c.code, c.short_name,
    CASE
      WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
      WHEN a.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
      WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
    END,
    CASE
      WHEN a.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
      WHEN a.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
    END
  FROM public.approvals a
  LEFT JOIN public.users     u ON u.id = a.requested_by
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
  LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
  LEFT JOIN public.contract_amendments am
         ON a.entity_type = 'contract_amendments' AND am.id = a.entity_id
  WHERE a.status = 'pending_approval'
    AND a.deleted_at IS NULL
    AND public.rls_can_approve(a.subject, a.company_id, a.amount)
  ORDER BY a.requested_at;
$$;

COMMENT ON FUNCTION public.my_pending_approvals() IS
  'Hồ sơ người dùng hiện tại thực sự duyệt được, kèm hồ sơ CHA cho các loại không có trang riêng (báo giá, dự toán, phát sinh hợp đồng). Dự toán trả thêm parent_module (DA/TK) để Frontend mở đúng route dù nguồn là gói thầu hay dự án thiết kế (0094).';

-- DROP FUNCTION xoá luôn quyền EXECUTE cũ đã cấp cho `authenticated`, và kể từ
-- 0062_lock_down_anon_functions.sql, hàm MỚI tạo không còn tự động mở cho PUBLIC — phải cấp
-- lại tường minh (bài học từ 0071).
REVOKE ALL ON FUNCTION public.my_pending_approvals() FROM public;
GRANT EXECUTE ON FUNCTION public.my_pending_approvals() TO authenticated;
