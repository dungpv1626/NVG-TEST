-- ============================================================================
-- Đưa vào migration hai thứ từng được tạo TAY trên dashboard của project cloud.
--
-- Phát hiện 30/09/2026 khi tách môi trường (C-1): dựng một CSDL mới từ đủ 133 migration rồi
-- đối chiếu với project cloud `awaiwegmuykhctnysvou` — bảng, chính sách, trigger khớp hết,
-- nhưng CSDL mới THIẾU:
--
--   1. Event trigger `ensure_rls` + hàm `rls_auto_enable()` — tuỳ chọn «tự bật RLS cho bảng mới»
--      bật lúc tạo project trên dashboard. CLAUDE.md 3.4 coi nó là lưới an toàn: bảng quên
--      viết policy thì bị chặn hết thay vì mở toang. CSDL dựng từ migration không có lưới đó.
--   2. Hai bucket `design-artifacts` (artifact JSON của Module Thiết kế) và `design-sources`
--      (tệp CAD gốc của số hoá). Không migration nào tạo; thiếu chúng thì «AI Design» và số hoá
--      hồ sơ hỏng ngay lượt ghi đầu tiên.
--
-- Cả hai viết idempotent: trên project cloud (đã có sẵn) migration này không đổi gì.
-- Định nghĩa hàm chép nguyên văn từ project cloud.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tự bật RLS cho mọi bảng mới trong schema `public`
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Bucket của Module Thiết kế — riêng tư, chỉ Worker ghi bằng khoá đặc quyền
--
-- Không có chính sách nào trên hai bucket này, cố ý: trình duyệt không đọc thẳng. Mọi lượt
-- đọc đi qua Worker, và Worker hỏi quyền bằng đúng hàm RLS của Module (SDD 8.6).
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('design-artifacts', 'design-artifacts', false),
  ('design-sources', 'design-sources', false)
ON CONFLICT (id) DO NOTHING;
