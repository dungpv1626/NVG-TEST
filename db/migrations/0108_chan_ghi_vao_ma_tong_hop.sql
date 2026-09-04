/**
 * Chặn ghi dòng giao dịch vào mã tổng hợp "NVG" — hàng rào ở tầng CSDL.
 *
 * ## Lỗi
 *
 * "NVG" là mã TỔNG HỢP toàn tập đoàn, không phải pháp nhân giao dịch (Backend Schema 2.2):
 * `companies.is_transactional = false`. Nhưng không có gì cưỡng chế điều đó — mọi bảng nghiệp
 * vụ chỉ có khóa ngoại `company_id → companies(id)`, mà NVG cũng là một dòng hợp lệ của
 * `companies`. Người đang ở chế độ gộp (Tổng Giám đốc, Giám đốc Tài chính, Quản trị hệ thống)
 * bấm "Tạo" ở bất kỳ màn hình nào là ghi được một hồ sơ mang `company_id` của NVG.
 *
 * Hậu quả không hiện ra ngay lúc ghi mà hiện ra ở chỗ khác: dòng đó KHÔNG thuộc P&L của công
 * ty nào, nên nó biến mất khỏi mọi màn hình đã lọc theo pháp nhân và khỏi mọi báo cáo tách
 * theo công ty — trong khi báo cáo gộp vẫn cộng nó vào. Tức là hai con số lệch nhau mà không
 * có gì báo, đúng kiểu hỏng khó truy nhất.
 *
 * ## Vì sao chặn ở CSDL chứ không ở màn hình
 *
 * Có 67 bảng mang `company_id`, và mỗi bảng có nhiều đường ghi: gọi thẳng PostgREST từ trình
 * duyệt, hàm `SECURITY DEFINER`, Worker dùng `service_role`, script nạp dữ liệu. Vá ở từng
 * màn hình là vá một trong bốn đường, và mỗi màn hình mới lại phải nhớ vá lại. Cùng lý lẽ với
 * việc đặt phân quyền vào RLS thay vì kiểm ở tầng giao diện (Tech Stack 3.3).
 *
 * Ràng buộc CHECK không diễn đạt được điều kiện này vì nó cần đọc bảng khác, nên dùng trigger.
 *
 * ## Ngoại lệ duy nhất: `user_companies`
 *
 * Ba tài khoản cấp tập đoàn ĐANG được gán vào NVG, và đó là cách đúng để nói "người này làm
 * việc ở phạm vi toàn tập đoàn". `user_companies` là bảng PHÂN QUYỀN, không phải bảng giao
 * dịch — nó không vào P&L của ai.
 *
 * `company_id` rỗng vẫn hợp lệ ở mọi bảng: các bảng cấu hình (`approval_limits`,
 * `aging_buckets`) dùng `NULL` để nói "áp cho toàn hệ thống". Rỗng khác hẳn với "gán vào NVG";
 * trigger này còn chặn luôn việc nhầm lẫn hai thứ đó.
 *
 * Đã kiểm trước khi áp: 68 bảng có `company_id`, và chỉ `user_companies` đang có dòng mang mã
 * NVG (3 dòng). Không dòng nghiệp vụ nào phải sửa.
 */

-- ----------------------------------------------------------------------------
-- 1. Vị từ
-- ----------------------------------------------------------------------------

/**
 * SECURITY DEFINER để phép kiểm không phụ thuộc việc người gọi có nhìn thấy `companies` hay
 * không — hàng rào phải cho cùng một câu trả lời với mọi vai trò.
 *
 * KHÔNG đặt ERRCODE. Mặc định `P0001` đi qua được lớp dịch lỗi ở giao diện
 * (`web/src/hooks/use-error-message.ts`) và giữ nguyên câu tiếng Việt bên dưới; đặt `23514`
 * sẽ bị lớp đó thay bằng câu chung chung "Dữ liệu nhập chưa hợp lệ".
 */
CREATE OR REPLACE FUNCTION public.assert_transactional_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_name text;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT short_name INTO v_short_name
  FROM public.companies
  WHERE id = NEW.company_id AND NOT is_transactional;

  IF v_short_name IS NOT NULL THEN
    RAISE EXCEPTION
      'Không lưu được hồ sơ vì "%" là mã tổng hợp toàn tập đoàn, không phải pháp nhân giao dịch. Chọn NVC, NVO hoặc NVS ở bộ chọn góc trên bên trái rồi lưu lại.',
      v_short_name;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assert_transactional_company() IS
  'Chặn ghi dòng nghiệp vụ vào pháp nhân không giao dịch (mã tổng hợp NVG). Backend Schema 2.2.';

-- ----------------------------------------------------------------------------
-- 2. Gắn vào mọi bảng đang có `company_id`
-- ----------------------------------------------------------------------------

/**
 * `UPDATE OF company_id` chứ không phải `UPDATE` trơn: trigger chỉ cần chạy khi chính cột đó
 * nằm trong danh sách SET. Sửa một dòng cũ không đụng tới pháp nhân thì không tốn thêm lượt
 * đọc `companies` nào.
 */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'company_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> 'user_companies'
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_transactional_company ON public.%I', r.relname);
    EXECUTE format(
      'CREATE TRIGGER trg_transactional_company
         BEFORE INSERT OR UPDATE OF company_id ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company()', r.relname);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Bảng mới tự có hàng rào
-- ----------------------------------------------------------------------------

/**
 * Gắn tay ở mục 2 chỉ đúng với 67 bảng hôm nay. Bảng thứ 68 sẽ do một migration sau tạo ra,
 * và người viết migration đó không có lý do gì để nhớ tới tệp này — nên chỗ nhớ phải nằm
 * trong chính CSDL.
 *
 * Cùng cơ chế Supabase đang dùng cho `ensure_rls`/`rls_auto_enable`: bảng mới trong schema
 * `public` tự được bật RLS mà không ai phải nhớ. Đây là hàng rào thứ hai theo đúng khuôn đó.
 *
 * Nuốt lỗi và ghi log thay vì để nổ: một hàng rào phụ trợ không được phép làm hỏng lệnh DDL
 * mà nó đi kèm — giống hệt cách `rls_auto_enable` xử lý.
 */
CREATE OR REPLACE FUNCTION public.attach_transactional_company_guard()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE object_type IN ('table', 'partitioned table')
      AND schema_name = 'public'
  LOOP
    BEGIN
      IF EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = cmd.objid AND attname = 'company_id'
              AND attnum > 0 AND NOT attisdropped)
         AND cmd.objid <> 'public.user_companies'::regclass
         AND NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = cmd.objid AND tgname = 'trg_transactional_company')
      THEN
        EXECUTE format(
          'CREATE TRIGGER trg_transactional_company
             BEFORE INSERT OR UPDATE OF company_id ON %s
             FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company()',
          cmd.object_identity);
        RAISE LOG 'attach_transactional_company_guard: đã gắn cho %', cmd.object_identity;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'attach_transactional_company_guard: không gắn được cho % (%)',
          cmd.object_identity, SQLERRM;
    END;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_attach_transactional_company_guard;
CREATE EVENT TRIGGER trg_attach_transactional_company_guard
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
  EXECUTE FUNCTION public.attach_transactional_company_guard();
