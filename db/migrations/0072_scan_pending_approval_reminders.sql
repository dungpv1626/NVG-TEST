-- ============================================================================
-- NEN-04 — cảnh báo loại thứ 4/4 còn thiếu: "công việc quá hạn xử lý".
--
-- BUILD_PLAN 4D ghi loại này là "chờ quyết định bảng tasks" — nhưng đó chỉ đúng cho việc
-- KHÔNG gắn phê duyệt (ví dụ nhắc giấy tờ sắp hết hạn không ai "xử lý xong thì biến mất").
-- Với việc CÓ gắn phê duyệt, hệ thống đã có định nghĩa "việc cần làm" rồi — chính là Hộp thư
-- Phê duyệt (BUILD_PLAN 1.4: "'Việc cần làm' ở Top Bar hiện trỏ vào usePendingApprovals()"),
-- và bảng `approvals` đã có sẵn `requested_at` để biết một việc đã NẰM Ở NGƯỜI DUYỆT bao lâu
-- (khác `due_date` — đó là hạn xử lý của chính hồ sơ nguồn, không phải hạn duyệt). Ngưỡng
-- "để lâu" đã có sẵn, dùng lại đúng một chỗ với BC-05 (`PENDING_APPROVAL_AGING_DAYS`,
-- `shared/src/bc.ts`) — không tự đặt số mới. Việc CHƯA gắn phê duyệt vẫn để treo, đúng ghi
-- chú cũ, chờ quyết định bảng `tasks`.
--
-- Người nhận: KHÔNG tái dùng `rls_can_approve` được — hàm đó đọc `auth_user_id()` của phiên
-- đang đăng nhập, còn tác vụ nền không có phiên nào. Viết `approval_reminder_recipients` mới,
-- CÙNG logic cốt lõi (vai trò có `approval_limits` đang bật cho đúng `subject`/pháp nhân) và
-- CÙNG mẫu `OR r.sees_all_companies` + `DISTINCT` đã dùng ở 0067/0068 (CFO chỉ gán vào NVG).
-- ⚠️ Có CHỦ ĐÍCH không so khớp `max_amount` — `rls_can_approve` so khớp vì nó quyết định một
-- người có được BẤM DUYỆT hay không (sai thì hỏng cả luồng); ở đây chỉ là một lời NHẮC, sai
-- theo hướng thừa (nhắc thêm một vai trò có hạn mức thấp hơn giá trị hồ sơ) chỉ tốn một thông
-- báo vô hại, còn sai theo hướng thiếu (bỏ sót người phải xử lý) mới là lỗi NEN-04 muốn tránh.
-- Đổi lại được sau nếu thấy nhắc thừa gây nhàm (CGD 3.4) — hiện ưu tiên không bỏ sót.
--
-- Không lặp lại (CGD 3.4): `last_reminded_at` — nhắc ĐÚNG MỘT LẦN mỗi hồ sơ (không phải nhiều
-- mốc như NS-10), vì chỉ có một ngưỡng duy nhất, không phải bốn mốc 90/60/30/7.
-- ============================================================================

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamp with time zone;

COMMENT ON COLUMN public.approvals.last_reminded_at IS
  'Lần cuối scan_pending_approval_reminders() đã nhắc — chỉ nhắc một lần mỗi hồ sơ (NEN-04, 0072).';

CREATE OR REPLACE FUNCTION public.approval_reminder_recipients(
  p_subject approval_subject,
  p_company_id uuid
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  JOIN public.approval_limits al ON al.role_id = r.id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND al.subject = p_subject
    AND al.is_active
    AND (al.company_id IS NULL OR al.company_id = p_company_id)
    AND (uc.company_id = p_company_id OR r.sees_all_companies)
$$;

REVOKE ALL ON FUNCTION public.approval_reminder_recipients(approval_subject, uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.approval_reminder_recipients(approval_subject, uuid) IS
  'Nội bộ, chỉ scan_pending_approval_reminders() gọi — vai trò còn hạn mức phê duyệt đang bật cho đúng loại/pháp nhân (0072).';

CREATE OR REPLACE FUNCTION public.scan_pending_approval_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a      record;
  v_days integer;
  v_sent integer := 0;
BEGIN
  FOR a IN
    SELECT *
      FROM public.approvals
     WHERE deleted_at IS NULL
       AND status = 'pending_approval'
       AND last_reminded_at IS NULL
       AND requested_at <= now() - interval '3 days' -- PENDING_APPROVAL_AGING_DAYS, shared/src/bc.ts
  LOOP
    v_days := extract(day FROM now() - a.requested_at);

    PERFORM public.create_notification(
      recipient.user_id, a.company_id, 'approval_pending',
      format('%s đang chờ phê duyệt %s ngày, chưa được xử lý.', a.title, v_days),
      'approvals', a.id, '/viec-can-lam'
    )
    FROM public.approval_reminder_recipients(a.subject, a.company_id) recipient;

    UPDATE public.approvals SET last_reminded_at = now() WHERE id = a.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.scan_pending_approval_reminders() IS
  'NEN-04 — nhắc việc chờ phê duyệt để lâu quá PENDING_APPROVAL_AGING_DAYS (BC-05, 3 ngày), một lần mỗi hồ sơ (0072).';

-- Chỉ tác vụ nền gọi; không mở cho trình duyệt để không ai bắn lại loạt thông báo cho cả công ty.
-- ⚠️ Cố ý ghi CẢ `PUBLIC` — hàm mới không tự động thừa hưởng revoke PUBLIC của 0062 (đợt đó
-- chỉ quét các hàm đã tồn tại lúc đó), và đối chiếu trực tiếp `pg_proc.proacl` sau khi tạo cho
-- thấy hàm mới vẫn có sẵn một dòng cấp PUBLIC riêng ngoài mặc định `authenticated`/`service_role`
-- — không rõ đến từ đâu (không phải `pg_default_acl`, không phải event trigger nào đang bật),
-- nên revoke tường minh ở đây thay vì tin default, đúng cách 0066 đã làm cho `scan_receivable_reminders`.
REVOKE EXECUTE ON FUNCTION public.scan_pending_approval_reminders() FROM PUBLIC, authenticated, anon;
