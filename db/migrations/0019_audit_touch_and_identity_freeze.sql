-- ============================================================================
-- Hai lỗ hổng hạ tầng bị phơi ra khi dựng màn hình SỬA hồ sơ khách hàng (CRM-01)
--
-- Cả hai đều thuộc loại "sai âm thầm": không lỗi, không cảnh báo, chỉ là dữ liệu
-- sai dần theo thời gian mà không ai nhận ra cho tới lúc cần truy vết.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- LỖ HỔNG 1 — cột kiểm toán không bao giờ được ghi khi lệnh đến từ trình duyệt
--
-- `created_at`/`updated_at` có DEFAULT now() nên nhìn qua tưởng vẫn đúng, nhưng DEFAULT
-- chỉ áp dụng lúc INSERT: mọi lệnh UPDATE từ PostgREST giữ nguyên `updated_at` cũ.
-- Còn `created_by`/`updated_by` thì trình duyệt phải tự điền — và không chỗ nào điền cả.
--
-- Hệ quả cụ thể đang có trên hệ thống:
--  - Màn hình Chi tiết hiển thị "Cập nhật gần nhất" bằng thời điểm TẠO hồ sơ. Sửa khiếu nại
--    mười lần thì dòng đó vẫn không nhúc nhích — người đọc tin vào một con số sai.
--  - `created_by`/`updated_by` rỗng ở mọi hồ sơ do người dùng tạo, nên câu hỏi "ai sửa hồ sơ
--    này gần nhất" không trả lời được. Backend Schema 1.4 bắt buộc bốn cột này chính vì
--    truy vết ngược là thứ KHÔNG BAO GIỜ được cắt.
--
-- Sửa bằng trigger chứ KHÔNG bằng cách bắt mỗi màn hình tự gửi kèm: để trình duyệt tự khai
-- "tôi là ai" thì giá trị đó vừa quên được, vừa giả được. Đặt ở CSDL thì dù đi qua PostgREST,
-- qua Workers hay qua hàm SECURITY DEFINER, bốn cột luôn đúng ở cùng một chỗ.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_audit_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    -- Có phiên đăng nhập thì GHI ĐÈ giá trị do lệnh gửi lên: nếu chỉ điền vào chỗ trống,
    -- trình duyệt vẫn khai được tên người khác vào cột "người tạo" và không cách nào phát
    -- hiện. Không có phiên đăng nhập (seed, script quản trị chạy bằng kết nối trực tiếp)
    -- thì giữ nguyên giá trị được khai — đó là đường duy nhất còn lại để khai người tạo.
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at);
    NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by, NEW.created_by);
    RETURN NEW;
  END IF;

  -- Thời điểm tạo và người tạo là bất biến: viết lại chúng là xóa dấu vết nguồn gốc hồ sơ.
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_audit_columns() IS
  'Tự ghi 4 cột kiểm toán ở tầng CSDL, không phụ thuộc lệnh đến từ đâu (Backend Schema 1.4).';


-- Gắn trigger cho một bảng. Bảng mới ở các phase sau gọi hàm này trong migration của nó,
-- thay vì chép lại đoạn CREATE TRIGGER rồi sót một bảng.
CREATE OR REPLACE FUNCTION public.attach_audit_touch(target_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_touch ON %s', target_table);
  EXECUTE format(
    'CREATE TRIGGER audit_touch BEFORE INSERT OR UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION public.touch_audit_columns()',
    target_table
  );
END;
$$;

COMMENT ON FUNCTION public.attach_audit_touch(regclass) IS
  'Gắn trigger cột kiểm toán cho một bảng — gọi trong migration của MỌI bảng nghiệp vụ mới.';


-- Gắn cho toàn bộ bảng hiện có đủ 4 cột. Bảng nhật ký (`audit_logs`,
-- `sensitive_access_logs`) chỉ có 2 cột nên tự động nằm ngoài — đúng ý đồ: nhật ký chỉ ghi
-- thêm, không có khái niệm "sửa lần cuối".
DO $$
DECLARE
  t regclass;
BEGIN
  FOR t IN
    SELECT c.oid::regclass
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (
        SELECT count(*)
        FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND NOT a.attisdropped
          AND a.attname IN ('created_at', 'created_by', 'updated_at', 'updated_by')
      ) = 4
    ORDER BY 1
  LOOP
    PERFORM public.attach_audit_touch(t);
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- LỖ HỔNG 2 — "cột bất biến sau khi tạo" mới chỉ chặn được ở đúng một bảng
--
-- Migration 0018 đã chặn việc đổi pháp nhân/khách hàng/mã của KHIẾU NẠI bằng một trigger
-- viết riêng cho bảng đó. Nhưng lý do khiến nó cần thiết — `WITH CHECK` của policy không
-- tham chiếu được giá trị CŨ của dòng — đúng y như vậy với `opportunities`, `quotes` và
-- `customers`. Cơ hội kinh doanh chuyển được sang pháp nhân khác là toàn bộ giá trị hợp đồng
-- nhảy sang P&L của công ty kia mà không để lại vết gì (PRD NEN-01).
--
-- Màn hình sửa hồ sơ khách hàng làm lỗ hổng này thành đường đi thật: biểu mẫu nào gửi được
-- `name` thì gửi được `code`, và mã hồ sơ do CSDL cấp mà sửa được từ trình duyệt thì mọi
-- liên kết truy ngược tới nó thành vô nghĩa.
--
-- Viết MỘT trigger dùng chung, nhận tên cột bất biến làm tham số, thay cho một trigger
-- mỗi bảng. Dùng `to_jsonb(NEW)` để so sánh cột theo tên nên hàm không cần biết trước
-- bảng nào có cột gì.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.freeze_record_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  frozen  text;
BEGIN
  FOREACH frozen IN ARRAY TG_ARGV LOOP
    IF new_row ->> frozen IS DISTINCT FROM old_row ->> frozen THEN
      -- Thông báo nói rõ việc gì không thực hiện được VÀ cần làm gì thay thế
      -- (Content Guidelines 5.5) — người dùng cuối đọc được thẳng câu này.
      RAISE EXCEPTION '%', CASE frozen
        WHEN 'code'           THEN 'Không đổi được mã hồ sơ. Mã do hệ thống cấp khi tạo và là căn cứ truy ngược của mọi hồ sơ liên quan.'
        WHEN 'company_id'     THEN 'Không đổi được pháp nhân của hồ sơ đã tạo. Tạo hồ sơ mới ở đúng pháp nhân nếu chọn nhầm.'
        WHEN 'customer_id'    THEN 'Không đổi được khách hàng của hồ sơ đã tạo. Tạo hồ sơ mới nếu chọn nhầm khách hàng.'
        WHEN 'opportunity_id' THEN 'Không đổi được cơ hội kinh doanh của hồ sơ đã tạo. Tạo hồ sơ mới ở đúng cơ hội nếu chọn nhầm.'
        ELSE format('Không đổi được trường "%s" của hồ sơ đã tạo.', frozen)
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.freeze_record_identity() IS
  'Chặn sửa các cột định danh hồ sơ sau khi tạo. Tên cột truyền qua tham số trigger.';


-- Bảng dùng chung, không có `company_id` (Backend Schema 2.2) — chỉ mã hồ sơ là bất biến.
DROP TRIGGER IF EXISTS customers_freeze_identity ON public.customers;
CREATE TRIGGER customers_freeze_identity
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code');

-- Cơ hội: KHÔNG khóa `customer_id`. Ở giai đoạn Tiếp nhận, chọn nhầm khách hàng trong ô tìm
-- kiếm là nhầm lẫn thường gặp và sửa được — khác với khiếu nại, vốn là hồ sơ ghi nhận một
-- sự việc đã xảy ra với đúng một khách hàng.
DROP TRIGGER IF EXISTS opportunities_freeze_identity ON public.opportunities;
CREATE TRIGGER opportunities_freeze_identity
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

-- Báo giá: khóa cả cơ hội nguồn. Báo giá là hồ sơ có phiên bản và có chữ ký phê duyệt gắn
-- vào một cơ hội cụ thể (CRM-04) — chuyển nó sang cơ hội khác là mang theo cả chữ ký đó.
DROP TRIGGER IF EXISTS quotes_freeze_identity ON public.quotes;
CREATE TRIGGER quotes_freeze_identity
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id', 'opportunity_id');

DROP TRIGGER IF EXISTS site_surveys_freeze_identity ON public.site_surveys;
CREATE TRIGGER site_surveys_freeze_identity
  BEFORE UPDATE ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'opportunity_id');

-- Khiếu nại chuyển sang dùng hàm chung, gỡ bản viết riêng ở 0018: giữ hai bản làm cùng
-- một việc thì bản nào sửa cũng có nguy cơ bị bỏ quên.
DROP TRIGGER IF EXISTS complaints_freeze_identity ON public.complaints;
DROP FUNCTION IF EXISTS public.complaints_freeze_identity();
CREATE TRIGGER complaints_freeze_identity
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id', 'customer_id');
