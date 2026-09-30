-- ============================================================================
-- Bộ mã thống nhất — áp `doc/BO_MA.md` (Haan chốt 30/09/2026, TBD-2).
--
-- Hai họ mã, tách theo đúng ranh giới «bảng giao dịch / bảng dùng chung» (CLAUDE.md 3.5):
--
--   Hồ sơ giao dịch  {PHÁP NHÂN}-{LOẠI}-{NĂM}-{4 số}   NVC-CT-2026-0001   (đã có từ 0007)
--   Danh mục chung   {LOẠI}-{5 số}                       KH-00001, NCC-00042 (MỚI)
--
-- Vì sao khách hàng và nhà cung cấp bỏ pháp nhân khỏi mã: hai bảng này KHÔNG có `company_id`.
-- Mã `NVC-KH-2026-0002` nói một điều mà dữ liệu không có, và cùng một khách hàng của ba công ty
-- sẽ trông như ba khách hàng.
--
-- Migration này làm bốn việc:
--   1. Tách phần cấp số của `next_record_code` ra một hàm nội bộ gọi được từ trigger.
--   2. Dãy số phẳng cho danh mục chung (`catalog_sequences`).
--   3. Trigger cấp mã lúc INSERT cho khách hàng, nhà cung cấp, tài sản. Trước đây nhà cung cấp và
--      tài sản gõ tay; tài sản để trống mã thì KẸT vĩnh viễn ở «Chưa có mã», vì `code` bị khoá
--      sau khi tạo (0019) — rỗng → có giá trị cũng tính là «đổi mã».
--   4. Đổi mã dữ liệu đang có sang dạng mới.
--
-- Quy tắc ghi đè: NGƯỜI DÙNG không bao giờ tự đặt mã. Lượt ghi có phiên đăng nhập (`auth.uid()`
-- có giá trị) luôn nhận mã do CSDL cấp, mã gửi kèm bị bỏ qua. Tiến trình hệ thống không có phiên
-- (nạp dữ liệu, bộ kiểm thử `db/`) được đặt sẵn mã — đó là đường duy nhất để nhận lại một bộ mã
-- có sẵn nếu sau này cần.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Cấp số hồ sơ giao dịch — lõi nội bộ
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_record_code(
  p_company_code text,
  p_record_type text,
  p_year integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int);
  v_next integer;
BEGIN
  INSERT INTO public.record_sequences (company_code, record_type, year, last_value)
  VALUES (upper(p_company_code), upper(p_record_type), v_year, 1)
  ON CONFLICT (company_code, record_type, year)
  DO UPDATE SET last_value = public.record_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s-%s', upper(p_company_code), upper(p_record_type), v_year,
                lpad(v_next::text, 4, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.issue_record_code(text, text, integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.issue_record_code(text, text, integer) IS
  'Lõi cấp mã hồ sơ giao dịch, không kiểm phiên — chỉ trigger và hàm hệ thống gọi. Trình duyệt dùng next_record_code.';

-- Giữ nguyên chữ ký và hành vi: vẫn đòi đăng nhập, chỉ chuyển phần cấp số sang lõi chung.
CREATE OR REPLACE FUNCTION public.next_record_code(
  p_company_code text,
  p_record_type text,
  p_year integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  RETURN public.issue_record_code(p_company_code, p_record_type, p_year);
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Dãy số phẳng cho danh mục dùng chung
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalog_sequences (
  record_type varchar(8) PRIMARY KEY,
  last_value  integer    NOT NULL DEFAULT 0
);

ALTER TABLE public.catalog_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_sequences FROM anon, authenticated;
-- Không policy nào ⇒ trình duyệt không đọc/ghi được; chỉ hàm bên dưới đụng tới.

COMMENT ON TABLE public.catalog_sequences IS
  'Số kế tiếp của mã danh mục dùng chung (KH, NCC). Dãy phẳng, không theo pháp nhân, không đặt lại theo năm.';

CREATE OR REPLACE FUNCTION public.issue_catalog_code(p_record_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO public.catalog_sequences (record_type, last_value)
  VALUES (upper(p_record_type), 1)
  ON CONFLICT (record_type)
  DO UPDATE SET last_value = public.catalog_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s', upper(p_record_type), lpad(v_next::text, 5, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.issue_catalog_code(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.issue_catalog_code(text) IS
  'Cấp mã danh mục dùng chung dạng {LOẠI}-{5 số}. Chỉ trigger gọi.';


-- ----------------------------------------------------------------------------
-- 3. Trigger cấp mã lúc tạo
--
-- Chạy trong cùng giao dịch với lệnh INSERT: lệnh bị RLS từ chối thì bộ đếm cũng lùi lại, nên
-- dãy số không thủng vì những lượt ghi không thành.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_catalog_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL OR NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.issue_catalog_code(TG_ARGV[0]);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_catalog_code() IS
  'Cấp mã danh mục lúc INSERT. Loại mã truyền qua tham số trigger. Người dùng không tự đặt được mã.';

DROP TRIGGER IF EXISTS customers_assign_code ON public.customers;
CREATE TRIGGER customers_assign_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.assign_catalog_code('KH');

DROP TRIGGER IF EXISTS suppliers_assign_code ON public.suppliers;
CREATE TRIGGER suppliers_assign_code
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.assign_catalog_code('NCC');

CREATE OR REPLACE FUNCTION public.assign_asset_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_code text;
BEGIN
  IF auth.uid() IS NOT NULL OR NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    SELECT code INTO v_company_code FROM public.companies WHERE id = NEW.company_id;
    IF v_company_code IS NULL THEN
      RAISE EXCEPTION 'Không cấp được mã tài sản: chưa chọn pháp nhân.';
    END IF;
    NEW.code := public.issue_record_code(v_company_code, 'TS');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_asset_code() IS
  'Cấp mã tài sản {PHÁP NHÂN}-TS-{NĂM}-{4 số} lúc INSERT. Người dùng không tự đặt được mã.';

DROP TRIGGER IF EXISTS assets_assign_code ON public.assets;
CREATE TRIGGER assets_assign_code
  BEFORE INSERT ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assign_asset_code();


-- ----------------------------------------------------------------------------
-- 4. Đổi mã dữ liệu đang có
--
-- Chỉ đổi dòng mang dạng cũ hoặc không đúng dạng; cấp theo thứ tự tạo để số nhỏ là hồ sơ cũ.
-- Tạm tắt trigger khoá mã đúng trong khoảng đổi. Bảng nhật ký thao tác vẫn ghi lại lần đổi.
-- ----------------------------------------------------------------------------

ALTER TABLE public.customers DISABLE TRIGGER customers_freeze_identity;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.customers
     WHERE code !~ '^KH-[0-9]{5,}$'
     ORDER BY created_at, id
  LOOP
    UPDATE public.customers SET code = public.issue_catalog_code('KH') WHERE id = r.id;
  END LOOP;
END;
$$;
ALTER TABLE public.customers ENABLE TRIGGER customers_freeze_identity;

ALTER TABLE public.suppliers DISABLE TRIGGER suppliers_freeze_identity;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.suppliers
     WHERE code !~ '^NCC-[0-9]{5,}$'
     ORDER BY created_at, id
  LOOP
    UPDATE public.suppliers SET code = public.issue_catalog_code('NCC') WHERE id = r.id;
  END LOOP;
END;
$$;
ALTER TABLE public.suppliers ENABLE TRIGGER suppliers_freeze_identity;

ALTER TABLE public.assets DISABLE TRIGGER assets_freeze_identity;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT a.id, c.code AS company_code,
           EXTRACT(YEAR FROM (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS yr
      FROM public.assets a
      JOIN public.companies c ON c.id = a.company_id
     WHERE a.code IS NULL OR a.code !~ '^[A-Z]{3}-TS-[0-9]{4}-[0-9]{4,}$'
     ORDER BY a.created_at, a.id
  LOOP
    UPDATE public.assets
       SET code = public.issue_record_code(r.company_code, 'TS', r.yr)
     WHERE id = r.id;
  END LOOP;
END;
$$;
ALTER TABLE public.assets ENABLE TRIGGER assets_freeze_identity;
