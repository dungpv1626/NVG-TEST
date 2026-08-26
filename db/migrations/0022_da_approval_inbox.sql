-- ============================================================================
-- Hộp thư Phê duyệt nhận thêm hồ sơ giá dự thầu (DA-07)
--
-- Hộp thư là MỘT màn hình cho mọi module (Webapp Flow 4.6), nên module mới không dựng màn
-- hình duyệt riêng — chỉ dạy cho hàm này biết cách mở "hồ sơ đầy đủ" của loại hồ sơ mới.
--
-- Dự toán cũng giống báo giá ở chỗ KHÔNG có trang riêng: nó là một tab của Chi tiết Gói
-- thầu (Webapp Flow 3.2, bước 4). Vì vậy `parent_id` trả về id gói thầu.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.my_pending_approvals()
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
  parent_id         uuid
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
      WHEN a.entity_type = 'quotes'    THEN q.opportunity_id
      WHEN a.entity_type = 'estimates' THEN e.bidding_project_id
    END
  FROM public.approvals a
  LEFT JOIN public.users     u ON u.id = a.requested_by
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
  LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
  WHERE a.status = 'pending_approval'
    AND a.deleted_at IS NULL
    AND public.rls_can_approve(a.subject, a.company_id, a.amount)
  ORDER BY a.requested_at;
$$;
