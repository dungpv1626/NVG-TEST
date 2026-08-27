-- ============================================================================
-- Khung tuổi nợ trở thành DỮ LIỆU CẤU HÌNH — KT-04
--
-- Trước migration này, ba mốc 30/60/90 ngày nằm cứng trong hàm `receivable_aging` và trong
-- `agingBucket` ở `@nvg/shared/kt`. Đó là GIẢ ĐỊNH của đội triển khai, không phải quy chế của
-- NVG (PRD KT-04 yêu cầu theo dõi "số ngày quá hạn" nhưng không ấn định con số nào).
--
-- Cùng một lỗi mà PRD NEN-02 đã cấm với hạn mức phê duyệt: "hạn mức phải CẤU HÌNH ĐƯỢC, KHÔNG
-- hard-code". Khi NVG ban hành mốc thật, sửa mốc phải là một thao tác trong Quản trị hệ thống,
-- không phải một lần sửa mã và triển khai lại.
--
-- Sau migration này, `receivable_aging` đọc bảng `aging_buckets`. Không có dòng nào áp dụng thì
-- hàm trả về ĐÚNG một khung "Chưa đến hạn" — im lặng dựng lại mốc mặc định trong SQL sẽ khiến
-- việc xoá hết cấu hình trông như thể cấu hình vẫn còn hiệu lực.
-- ============================================================================

SELECT public.attach_audit_touch('public.aging_buckets');

CREATE TRIGGER aging_buckets_freeze_identity
  BEFORE UPDATE ON public.aging_buckets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'code');


-- ----------------------------------------------------------------------------
-- 1. Ai đọc, ai sửa
--
-- ĐỌC rộng: bảng này không chứa số tiền nào, chỉ là cách chia nhóm. Màn hình Công nợ của bất
-- kỳ ai xem được công nợ đều cần nó để dựng cột — giấu bảng cấu hình đi thì bảng tuổi nợ trống
-- trong khi dữ liệu công nợ vẫn hiện, một kiểu hỏng rất khó đoán.
--
-- SỬA hẹp: đây là quy chế tài chính, ngang hàng với hạn mức phê duyệt. Chỉ Quản trị hệ thống và
-- Tài chính cấp trên. Đổi mốc là đổi cách đọc toàn bộ báo cáo công nợ của cả tập đoàn.
-- ----------------------------------------------------------------------------

ALTER TABLE public.aging_buckets ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.aging_buckets FROM anon;
REVOKE DELETE ON public.aging_buckets FROM authenticated;

CREATE POLICY aging_buckets_select ON public.aging_buckets
  FOR SELECT TO authenticated
  USING (
    public.auth_can_view_module('KT')
    AND (company_id IS NULL OR public.rls_company_access(company_id))
  );

CREATE POLICY aging_buckets_insert ON public.aging_buckets
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

CREATE POLICY aging_buckets_update ON public.aging_buckets
  FOR UPDATE TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'))
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));


-- ----------------------------------------------------------------------------
-- 2. Bảng tuổi nợ đọc mốc từ cấu hình
--
-- Mốc riêng của pháp nhân (nếu có) THAY THẾ mốc chung, không trộn lẫn: trộn hai bộ mốc sẽ tạo
-- ra các khung chồng lấn, và một khoản nợ rơi vào hai cột cùng lúc.
--
-- Khoản trễ hơn mọi khung đã cấu hình rơi vào khung CUỐI CÙNG, không phải "chưa đến hạn" — một
-- khoản trễ 200 ngày mà cấu hình chỉ chia tới 90 ngày vẫn là nợ xấu nhất. Đây là chỗ một cấu
-- hình thiếu sót có thể làm báo cáo nói ngược. Cùng quy tắc với `agingBucketCode` ở `shared`.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.receivable_aging(receivable_direction, uuid);

CREATE OR REPLACE FUNCTION public.receivable_aging(
  p_direction receivable_direction,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  code       text,
  label      text,
  sort_order integer,
  total      bigint,
  entries    integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT ab.code, ab.label, ab."position" AS sort_order, ab.from_days, ab.to_days
      FROM public.aging_buckets ab
     WHERE ab.is_active
       AND ab.company_id IS NOT DISTINCT FROM (
             -- Có mốc riêng của pháp nhân thì dùng bộ đó; không thì dùng bộ chung.
             SELECT CASE
                      WHEN p_company_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.aging_buckets x
                         WHERE x.company_id = p_company_id AND x.is_active
                      ) THEN p_company_id
                      ELSE NULL
                    END
           )
  ),
  ranked AS (
    SELECT c.*, row_number() OVER (ORDER BY c.sort_order, c.from_days) AS rn,
           count(*) OVER () AS n
      FROM cfg c
  ),
  open_debts AS (
    SELECT rp.id,
           rp.amount - rp.settled_amount AS remaining,
           CASE
             WHEN rp.due_date IS NULL OR rp.due_date >= current_date THEN 0
             ELSE current_date - rp.due_date
           END AS overdue_days
      FROM public.receivables_payables rp
     WHERE rp.deleted_at IS NULL
       AND rp.direction = p_direction
       AND rp.amount > rp.settled_amount
       AND (p_company_id IS NULL OR rp.company_id = p_company_id)
  ),
  placed AS (
    SELECT d.remaining,
           COALESCE(
             (SELECT r.code FROM ranked r
               WHERE d.overdue_days >= r.from_days
                 AND (r.to_days IS NULL OR d.overdue_days <= r.to_days)
               ORDER BY r.rn LIMIT 1),
             -- Trễ hơn mọi khung đã cấu hình → khung cuối cùng.
             (SELECT r.code FROM ranked r ORDER BY r.rn DESC LIMIT 1),
             'chua_den_han'
           ) AS code
      FROM open_debts d
     WHERE d.overdue_days > 0
  ),
  all_buckets AS (
    SELECT 'chua_den_han'::text AS code, 'Chưa đến hạn'::text AS label, 0 AS sort_order
    UNION ALL
    SELECT r.code::text, r.label::text, r.sort_order FROM ranked r
  )
  SELECT b.code, b.label, b.sort_order,
         COALESCE(SUM(x.remaining), 0)::bigint,
         count(x.remaining)::integer
    FROM all_buckets b
    LEFT JOIN (
      SELECT p.code, p.remaining FROM placed p
      UNION ALL
      SELECT 'chua_den_han', d.remaining FROM open_debts d WHERE d.overdue_days = 0
    ) x ON x.code = b.code
   GROUP BY b.code, b.label, b.sort_order
   ORDER BY b.sort_order, b.code;
$$;

COMMENT ON FUNCTION public.receivable_aging(receivable_direction, uuid) IS
  'Bảng tuổi nợ theo mốc CẤU HÌNH trong aging_buckets (KT-04). Mốc riêng của pháp nhân thay thế mốc chung, không trộn.';
