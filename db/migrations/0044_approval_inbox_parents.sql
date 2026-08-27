-- ============================================================================
-- Hộp thư Phê duyệt: mở đúng hồ sơ đầy đủ cho mọi loại đã có
--
-- `my_pending_approvals` giải sẵn `parent_id` để Hộp thư mở được "hồ sơ đầy đủ" chỉ bằng một
-- lượt gọi. Từ migration 0022 tới nay, hàm này mới biết hai loại: báo giá và dự toán — hai
-- thứ KHÔNG có trang riêng mà là một tab của hồ sơ cha.
--
-- Trong lúc đó Hộp thư đã nhận thêm hợp đồng (HD-05), phát sinh (HD-04), đề nghị mua (MH-02),
-- điều chỉnh kiểm kê (KHO-07) và nay là đề nghị chi (KT-01). Phát sinh hợp đồng cũng thuộc
-- nhóm "không có trang riêng" — nó là tab Phát sinh của Chi tiết Hợp đồng — nên thiếu
-- `parent_id`, nút "Xem hồ sơ đầy đủ" của nó rơi về danh sách hợp đồng và người duyệt phải tự
-- đi tìm. Bổ sung ở đây.
--
-- Các loại còn lại CÓ trang riêng (`/hd/hop-dong/:id`, `/mh/de-nghi-mua/:id`,
-- `/kt/de-nghi-thanh-toan/:id`) nên `parent_id` để rỗng là đúng: màn hình dùng thẳng
-- `entity_id`.
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
      WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
      WHEN a.entity_type = 'estimates'           THEN e.bidding_project_id
      WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
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
  'Hồ sơ người dùng hiện tại thực sự duyệt được, kèm hồ sơ CHA cho các loại không có trang riêng (báo giá, dự toán, phát sinh hợp đồng).';
