/**
 * Gộp các dòng cấu hình bị nhân bản, và bịt lỗ hổng NULL đã cho phép chúng sinh ra.
 *
 * ## Lỗi
 *
 * `aging_buckets` có 4 mốc dùng chung nhưng CSDL đang giữ 20 dòng; `approval_limits` có 22
 * quy tắc dùng chung nhưng đang giữ 252 dòng — nhóm nhiều nhất lặp 12 lần. Mọi bản sao giống
 * hệt bản gốc, không dòng nào mang giá trị khác.
 *
 * Biểu hiện đã thấy trên màn hình Công nợ: bảng tuổi nợ vẽ 21 thẻ thay vì 5, "Quá hạn 1 – 30
 * ngày" hiện năm lần cạnh nhau, kèm cảnh báo khoá trùng của React.
 *
 * ## Vì sao lọt
 *
 * Bộ nạp dữ liệu khởi tạo đã cẩn thận dùng `ON CONFLICT DO NOTHING` cho cả hai bảng, và cả hai
 * bảng đều có ràng buộc duy nhất phủ đúng các cột cần thiết — nhìn qua thì kín. Nhưng dòng
 * dùng chung có `company_id` RỖNG, mà mặc định Postgres coi hai giá trị NULL là KHÁC nhau
 * trong ràng buộc duy nhất. Nên `(NULL, 'qua_1_30')` không bao giờ đụng `(NULL, 'qua_1_30')`:
 * `ON CONFLICT` không có gì để bắt, lệnh chèn thành công, và mỗi lần chạy lại bộ nạp là thêm
 * một bộ bản sao.
 *
 * Đây là kiểu hỏng im lặng khó thấy nhất: cơ chế chống trùng CÓ mặt, chạy không báo lỗi, và
 * đúng với mọi dòng có `company_id` — chỉ trượt đúng ở nhóm dùng chung, tức nhóm mà bộ nạp
 * ghi nhiều nhất. Đã quét toàn bộ 23 ràng buộc duy nhất còn chứa cột cho phép rỗng: chỉ hai
 * bảng này đang thật sự có dòng trùng.
 *
 * ## Vì sao hai bảng này chưa làm sai con số nào
 *
 * Mọi hàm đọc `approval_limits` đều tổng hợp — `max()`, `bool_or()`, `count(*) > 0`, `EXISTS`,
 * `SELECT DISTINCT` — nên mười hai bản sao giống nhau cho cùng kết quả với một dòng. Hạn mức
 * phê duyệt vì vậy vẫn đúng. Nhưng đó là may, không phải thiết kế: một phép `sum()` hay một
 * màn hình liệt kê hạn mức trong Quản trị hệ thống sẽ sai ngay. `aging_buckets` thì đã sai
 * thật vì màn hình vẽ mỗi dòng thành một thẻ.
 */

-- ----------------------------------------------------------------------------
-- 1. Gộp dòng trùng — giữ dòng cũ nhất mỗi nhóm
-- ----------------------------------------------------------------------------

/**
 * `PARTITION BY` gom các NULL vào cùng một nhóm, khác hẳn ràng buộc duy nhất ở trên — đó
 * chính là lý do lỗi này tồn tại được, và ở đây là thứ ta cần.
 *
 * Trỏ lại khoá ngoại TRƯỚC khi xoá: `receivables_payables.last_reminded_bucket_id` tham chiếu
 * `aging_buckets(id)`. Hiện chưa dòng nào trỏ tới (đã kiểm), nhưng migration phải đúng cả khi
 * chạy trên cơ sở dữ liệu đã có dữ liệu thật, không chỉ đúng hôm nay.
 */
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY company_id, code ORDER BY created_at, id) AS keep_id
  FROM public.aging_buckets
)
UPDATE public.receivables_payables rp
SET last_reminded_bucket_id = ranked.keep_id
FROM ranked
WHERE rp.last_reminded_bucket_id = ranked.id
  AND ranked.id <> ranked.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY company_id, code ORDER BY created_at, id) AS keep_id
  FROM public.aging_buckets
)
DELETE FROM public.aging_buckets a
USING ranked
WHERE a.id = ranked.id AND ranked.id <> ranked.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY role_id, subject, step, company_id ORDER BY created_at, id) AS keep_id
  FROM public.approval_limits
)
DELETE FROM public.approval_limits al
USING ranked
WHERE al.id = ranked.id AND ranked.id <> ranked.keep_id;

-- ----------------------------------------------------------------------------
-- 2. Bịt lỗ hổng: NULL phải được coi là TRÙNG nhau
-- ----------------------------------------------------------------------------

/**
 * `NULLS NOT DISTINCT` (PostgreSQL 15 trở lên; máy chủ đang chạy 17.6) làm ràng buộc duy nhất
 * coi hai NULL là bằng nhau. Sau đây `ON CONFLICT DO NOTHING` của bộ nạp mới thật sự có hiệu
 * lực với dòng dùng chung.
 *
 * Sửa ở ràng buộc chứ không sửa ở bộ nạp: bộ nạp không phải đường ghi duy nhất — còn màn hình
 * Quản trị hệ thống, script vá dữ liệu và các migration sau. Cùng lý lẽ với việc đặt hàng rào
 * pháp nhân giao dịch vào CSDL thay vì vào từng màn hình (migration 0108).
 *
 * `aging_buckets` đổi từ chỉ mục duy nhất sang RÀNG BUỘC duy nhất để hai bảng cùng một khuôn,
 * và để `ON CONFLICT ON CONSTRAINT` gọi được theo tên.
 */
DROP INDEX IF EXISTS public.aging_buckets_code;

ALTER TABLE public.aging_buckets
  ADD CONSTRAINT aging_buckets_code
  UNIQUE NULLS NOT DISTINCT (company_id, code);

ALTER TABLE public.approval_limits
  DROP CONSTRAINT IF EXISTS approval_limits_unique;

ALTER TABLE public.approval_limits
  ADD CONSTRAINT approval_limits_unique
  UNIQUE NULLS NOT DISTINCT (role_id, subject, step, company_id);

COMMENT ON CONSTRAINT aging_buckets_code ON public.aging_buckets IS
  'Mốc tuổi nợ là duy nhất theo (pháp nhân, mã). NULLS NOT DISTINCT để dòng dùng chung (company_id rỗng) cũng được chống trùng — xem 0109.';

COMMENT ON CONSTRAINT approval_limits_unique ON public.approval_limits IS
  'Hạn mức là duy nhất theo (vai trò, loại, bước, pháp nhân). NULLS NOT DISTINCT để dòng dùng chung (company_id rỗng) cũng được chống trùng — xem 0109.';
