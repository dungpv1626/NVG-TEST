-- ============================================================================
-- Hộp thư Phê duyệt chỉ chứa việc NGƯỜI DÙNG THỰC SỰ XỬ LÝ ĐƯỢC
--
-- VẤN ĐỀ quan sát trên giao diện: nhân viên kinh doanh vừa gửi báo giá đi duyệt thì huy hiệu
-- "Việc cần làm" trên thanh trên cùng hiện số 1 — nhưng chính họ KHÔNG duyệt được hồ sơ đó.
--
-- Nguyên nhân: policy `approvals_select` cố ý cho người đề nghị xem hồ sơ mình gửi (để theo
-- dõi đang nằm ở ai), nên truy vấn "hồ sơ đang chờ duyệt" trả về cả hai nhóm.
--
-- Đây là hai câu hỏi khác nhau, không phải một:
--   "Hồ sơ nào tôi ĐƯỢC XEM?"      → policy `approvals_select`, dùng cho lịch sử trên hồ sơ.
--   "Hồ sơ nào tôi PHẢI XỬ LÝ?"    → hàm dưới đây, dùng cho Hộp thư và huy hiệu.
--
-- Webapp Flow 2.4 định nghĩa Việc cần làm là "danh sách các THAO TÁC người dùng cần thực
-- hiện" — hiện việc không bấm được vào đó vừa gây nhiễu, vừa phạm Webapp Flow 6.5
-- ("ẩn thay vì hiện rồi báo lỗi").
--
-- SECURITY INVOKER: RLS của `approvals`, `users`, `companies`, `quotes` vẫn áp dụng bình
-- thường bên trong hàm — điều kiện hạn mức ở đây là lớp LỌC, không phải lớp bảo vệ duy nhất.
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
  -- Hồ sơ CHA để mở màn hình đầy đủ: báo giá không có trang riêng, nó là một tab của Chi
  -- tiết Cơ hội. Giải ở đây để Hộp thư chỉ cần MỘT lượt gọi.
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
    CASE WHEN a.entity_type = 'quotes' THEN q.opportunity_id END
  FROM public.approvals a
  LEFT JOIN public.users     u ON u.id = a.requested_by
  LEFT JOIN public.companies c ON c.id = a.company_id
  LEFT JOIN public.quotes    q ON a.entity_type = 'quotes' AND q.id = a.entity_id
  WHERE a.status = 'pending_approval'
    AND a.deleted_at IS NULL
    AND public.rls_can_approve(a.subject, a.company_id, a.amount)
  -- Chờ lâu nhất lên đầu (Webapp Flow 4.6: xếp theo mức độ khẩn/thời gian chờ).
  ORDER BY a.requested_at;
$$;

COMMENT ON FUNCTION public.my_pending_approvals() IS
  'Hồ sơ người dùng hiện tại thực sự phê duyệt được — nguồn dữ liệu của Hộp thư Phê duyệt (Webapp Flow 4.6).';
