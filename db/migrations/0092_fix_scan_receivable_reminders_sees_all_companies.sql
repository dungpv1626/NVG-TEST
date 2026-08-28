-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `scan_receivable_reminders`
-- (0066) lọc người nhận CHỈ bằng `uc.company_id = d.company_id` — thiếu điều kiện
-- `OR r.sees_all_companies` mà các hàm nhắc việc anh em (0067 budget_overrun_alert, 0068 CFO
-- notifications, `decide_payment_request`/`confirm_stocktake` ở 0049) đều đã có.
--
-- Kế toán Back Office gán vào pháp nhân tổng hợp "NVG" (`sees_all_companies = true`, không
-- gán riêng vào NVC/NVS/NVO — CLAUDE.md 3.5), nên với MỌI công nợ thật (luôn thuộc một pháp
-- nhân giao dịch), điều kiện cũ không bao giờ đúng — vai trò này không bao giờ nhận được nhắc
-- công nợ phải thu quá hạn, đúng lớp lỗi mà 0067 đã vá cho budget_overrun_alert.
--
-- Vá: thêm `OR r.sees_all_companies`, và gói UUID người nhận qua SELECT DISTINCT trước khi
-- gọi create_notification — cùng lý do 0067: một người có nhiều dòng user_companies đều thoả
-- sees_all_companies sẽ nhận thông báo trùng lặp nếu không gộp trước.
-- ============================================================================

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
      recipient.id, d.company_id, 'receivable_overdue',
      format('Công nợ phải thu %s (%s đồng) đã chuyển sang khung "%s".',
             COALESCE(d.code, d.party_name, 'chưa có mã'),
             to_char(d.amount - d.settled_amount, 'FM999,999,999,999'),
             d.bucket_label),
      'receivables_payables', d.id, format('/kt/cong-no?khoan=%s', d.id)
    )
    FROM (
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = d.company_id OR r.sees_all_companies)
        AND r.code = 'KT'
    ) recipient;

    UPDATE public.receivables_payables SET last_reminded_bucket_id = d.bucket_id WHERE id = d.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

COMMENT ON FUNCTION public.scan_receivable_reminders() IS
  'Quét công nợ phải thu vừa chuyển sang khung tuổi nợ nặng hơn và nhắc Kế toán — NEN-04. Chạy dưới quyền chủ sở hữu nên quét được mọi pháp nhân; người dùng thường không gọi. Người nhận gồm cả vai trò xem toàn NVG, không chỉ khớp đúng company_id (0092).';
