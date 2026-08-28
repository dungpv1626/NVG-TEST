-- Mở rộng tác vụ nền NEN-04: cảnh báo công nợ phải thu quá hạn (Phase 4D).
--
-- Loại thứ hai trong bốn loại NEN-04 liệt kê ("giấy tờ sắp hết hạn" đã nối ở 0049 + Cron Trigger
-- ở workers/, xem BUILD_PLAN.md 4D). Ba loại còn lại (việc quá hạn xử lý, chi phí vượt ngân sách,
-- công nợ ĐẾN HẠN — trước ngày, chưa quá hạn) vẫn CHƯA làm — xem ghi chú "cố ý thu hẹp phạm vi"
-- bên dưới.
--
-- Mốc quá hạn dùng LẠI đúng cấu hình `aging_buckets` (KT-04, migration 0046) — không phát minh
-- ngưỡng ngày mới. `receivable_aging()` (0046) đã có logic khớp khung này ở dạng TỔNG HỢP cho
-- màn hình Công nợ; hàm dưới đây làm lại đúng phép khớp khung đó nhưng ở mức TỪNG DÒNG, để biết
-- dòng nào vừa CHUYỂN sang khung nặng hơn — đó là lúc cần nhắc, không phải mỗi lần quét.
--
-- ⚠️ CỐ Ý THU HẸP PHẠM VI so với câu PRD NEN-04 "công nợ đến hạn hoặc quá hạn":
--   1. Chỉ `phai_thu` (phải thu) — đây là nhánh Dashboard/BC đã có thẻ "Quá hạn" riêng
--      (BUILD_PLAN 3G). `phai_tra` (phải trả) cũng có thể cần nhắc (tránh trễ hạn thanh toán nhà
--      cung cấp) nhưng đó là mở rộng phạm vi chưa được xác nhận — để lại cho lượt sau.
--   2. Chỉ nhắc khi ĐÃ quá hạn (overdue_days > 0), KHÔNG nhắc "sắp đến hạn" (trước ngày đáo hạn).
--      Giấy tờ nhân sự (0049) có mốc rõ 90/60/30/7 ngày trước hạn do PRD NS-10 quy định thẳng;
--      công nợ thì PRD NEN-04 không nêu số ngày báo trước nào — thêm nhánh "sắp đến hạn" là tự
--      đặt ra một con số nghiệp vụ (7 ngày? 3 ngày?) mà NVG chưa xác nhận, đúng loại quyết định
--      CLAUDE.md Mục 6.4 yêu cầu hỏi Haan chứ không tự chọn.

ALTER TABLE public.receivables_payables
  ADD COLUMN last_reminded_bucket_id uuid REFERENCES public.aging_buckets(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.scan_receivable_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d      record;
  v_sent integer := 0;
BEGIN
  FOR d IN
    WITH cfg AS (
      SELECT ab.id, ab.label, ab."position", ab.from_days, ab.to_days, ab.company_id AS cfg_company_id
        FROM public.aging_buckets ab
       WHERE ab.is_active
    ),
    open_debts AS (
      SELECT rp.id, rp.company_id, rp.code, rp.party_name, rp.amount, rp.settled_amount,
             rp.last_reminded_bucket_id,
             CASE
               WHEN rp.due_date IS NULL OR rp.due_date >= current_date THEN 0
               ELSE current_date - rp.due_date
             END AS overdue_days
        FROM public.receivables_payables rp
       WHERE rp.deleted_at IS NULL
         AND rp.direction = 'phai_thu'
         AND rp.amount > rp.settled_amount
    ),
    matched AS (
      SELECT o.*,
             (
               SELECT c.id FROM cfg c
                WHERE c.cfg_company_id IS NOT DISTINCT FROM (
                        -- Có mốc riêng của pháp nhân thì dùng bộ đó; không thì dùng bộ chung —
                        -- đúng quy tắc `receivable_aging()` (0046), không trộn hai bộ mốc.
                        CASE WHEN EXISTS (
                          SELECT 1 FROM cfg x WHERE x.cfg_company_id = o.company_id
                        ) THEN o.company_id ELSE NULL END
                      )
                  AND o.overdue_days >= c.from_days
                  AND (c.to_days IS NULL OR o.overdue_days <= c.to_days)
                ORDER BY c."position", c.from_days LIMIT 1
             ) AS bucket_id
        FROM open_debts o
       WHERE o.overdue_days > 0
    )
    SELECT m.*, cur.label AS bucket_label, cur."position" AS bucket_position,
           old."position" AS old_position
      FROM matched m
      JOIN public.aging_buckets cur ON cur.id = m.bucket_id
      LEFT JOIN public.aging_buckets old ON old.id = m.last_reminded_bucket_id
     WHERE m.bucket_id IS NOT NULL
  LOOP
    -- Chỉ nhắc khi khung MỚI nặng hơn khung đã nhắc lần trước (position tăng dần theo mức
    -- nặng, đúng chú thích ở `aging_buckets`). Đứng yên hoặc "nhẹ đi" (đã thu bớt, dời hạn) thì
    -- không nhắc lại — cùng nguyên tắc CGD 3.4 với `scan_hr_document_reminders`.
    CONTINUE WHEN d.old_position IS NOT NULL AND d.old_position >= d.bucket_position;

    PERFORM public.create_notification(
      u.id, d.company_id, 'receivable_overdue',
      format('Công nợ phải thu %s (%s đồng) đã chuyển sang khung "%s".',
             COALESCE(d.code, d.party_name, 'chưa có mã'),
             to_char(d.amount - d.settled_amount, 'FM999,999,999,999'),
             d.bucket_label),
      'receivables_payables', d.id, format('/kt/cong-no?khoan=%s', d.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = d.company_id
      AND r.code = 'KT';

    UPDATE public.receivables_payables SET last_reminded_bucket_id = d.bucket_id WHERE id = d.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.scan_receivable_reminders() IS
  'Quét công nợ phải thu vừa chuyển sang khung tuổi nợ nặng hơn và nhắc Kế toán — NEN-04. Chạy dưới quyền chủ sở hữu nên quét được mọi pháp nhân; người dùng thường không gọi.';

-- Chỉ tác vụ nền gọi — cùng lý do và cùng cách khoá với scan_hr_document_reminders (0049, và
-- bài học 0065: REVOKE khỏi authenticated/anon chỉ có tác dụng khi hàm CHƯA từng mở cho PUBLIC;
-- hàm MỚI tạo sau 0062 đã mặc định đóng với PUBLIC nhờ ALTER DEFAULT PRIVILEGES, REVOKE dưới
-- đây là lớp phòng thủ tường minh, không dựa hoàn toàn vào mặc định ngầm).
REVOKE EXECUTE ON FUNCTION public.scan_receivable_reminders() FROM PUBLIC, authenticated, anon;
