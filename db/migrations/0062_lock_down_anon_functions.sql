-- ============================================================================
-- Rà soát phân quyền toàn hệ thống (BUILD_PLAN 4B) — đợt 1: khoá EXECUTE cho `anon`.
--
-- `0001_rls_foundation.sql` đã nói rõ ý đồ: "Vai trò anon (chưa đăng nhập) KHÔNG được đọc bất
-- kỳ bảng nghiệp vụ nào" và REVOKE ALL trên 57 bảng xuyên suốt các migration. Nhưng ý đồ đó
-- CHƯA áp dụng cho HÀM: Postgres mặc định cấp EXECUTE cho PUBLIC (kéo theo cả `anon` lẫn
-- `authenticated`) khi tạo hàm mới, và migration của dự án chỉ REVOKE tay cho 9/168 hàm. Kiểm
-- bằng `get_advisors` (loại security) ngày 28/08/2026: 145 hàm — gồm cả các hàm SECURITY
-- DEFINER thực hiện ghi dữ liệu như `advance_payment_step`, `adjust_timesheet` — vẫn cho phép
-- `anon` gọi qua `/rest/v1/rpc/...`.
--
-- Không phải lỗ hổng có thể khai thác thật ngay: đã đọc lại thân hàm `advance_payment_step`
-- (đại diện), mọi hàm SECURITY DEFINER ghi dữ liệu đều mở đầu bằng
-- `v_user := public.auth_user_id(); IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'`
-- — `anon` gọi được nhưng luôn bị chặn ngay dòng đầu vì không có `auth.uid()`. Đây vẫn là
-- khoảng hở PHÒNG THỦ NHIỀU LỚP cần đóng: nếu một hàm tương lai quên dòng kiểm tra đó, lỗ hổng
-- sẽ lộ ra ở đúng lớp mà bảng đã được bịt kín từ Phase 0.
--
-- ⚠️ `REVOKE EXECUTE ... FROM anon` (số ít, nhắm đúng một vai trò) KHÔNG đủ — đã thử trước khi
-- viết bản này và kiểm lại bằng `has_function_privilege('anon', oid, 'EXECUTE')`: vẫn `true`.
-- Lý do: quyền EXECUTE hiện tại của các hàm này KHÔNG nằm ở một dòng cấp riêng cho `anon`, mà
-- đến từ quyền mặc định Postgres cấp cho vai trò giả `PUBLIC` lúc `CREATE FUNCTION` (mọi vai
-- trò, kể cả `anon`, là thành viên ngầm định của `PUBLIC`) — `REVOKE ... FROM anon` chỉ xoá một
-- dòng cấp riêng không tồn tại, không chạm tới dòng `PUBLIC`. Chín hàm đã từng thử
-- `REVOKE ... FROM authenticated, anon` ở migration cũ (`0035`/`0037`/`0041`/`0043`/`0049`) VÌ
-- LÝ DO Y HỆT: kiểm lại `close_stocktake`/`scan_hr_document_reminders` vẫn còn `=X/postgres`
-- (ACL của `PUBLIC`) trong `pg_proc.proacl` — nghĩa là `anon` (và trường hợp
-- `scan_hr_document_reminders`, cả `authenticated`) vẫn gọi được dù migration cũ tưởng đã khoá.
-- Đây là phát hiện phụ của đợt rà soát này, KHÔNG sửa trong migration này (xem BUILD_PLAN 4B,
-- mục "còn treo") — sửa lẫn với việc khoá `anon` sẽ đổi luôn hành vi cho `authenticated` ở vài
-- hàm mà chưa xác nhận được người gọi thật sự (cron qua `service_role` hay có nơi gọi qua
-- `authenticated` thật) — tách riêng để khoanh đúng rủi ro của một lần đổi.
--
-- Cách khoá ĐÚNG: REVOKE khỏi `PUBLIC` (xoá đúng dòng đang cấp quyền), rồi CẤP LẠI tường minh
-- cho `authenticated` — nhưng CHỈ cho đúng tập hàm mà `authenticated` ĐANG gọi được (chụp lại
-- TRƯỚC khi revoke). Cách này không đổi bất kỳ hành vi nào cho người đã đăng nhập — kể cả với
-- các hàm mà REVOKE cũ (vô hiệu) từng định khoá cả `authenticated`: tập hợp chụp lại vẫn đúng
-- nguyên trạng hiện có (`authenticated` vẫn gọi được các hàm đó, y như trước migration này),
-- không mở rộng thêm cũng không thu hẹp thêm quyền của `authenticated`.
-- ============================================================================

DO $$
DECLARE
  fn  regprocedure;
  fns regprocedure[];
BEGIN
  SELECT array_agg(p.oid::regprocedure) INTO fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

  IF fns IS NOT NULL THEN
    FOREACH fn IN ARRAY fns LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
  END IF;
END $$;

-- Hàm TẠO THÊM sau migration này (chủ sở hữu `postgres`, đúng chủ sở hữu của toàn bộ hàm hiện
-- có — kiểm bằng `pg_proc.proowner`) không còn tự động mở cho `PUBLIC`/`anon` nữa. Từ đây, mọi
-- migration tạo hàm RPC mới người dùng gọi được PHẢI tự thêm dòng
-- `GRANT EXECUTE ON FUNCTION ... TO authenticated;` — đúng khuôn `global_search` đã làm sẵn.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- Đợt 2 cùng migration: hai hàm bị `function_search_path_mutable` (cùng lượt kiểm) — thiếu
-- `SET search_path` tường minh, lệch quy ước đã có từ `0002`/`0003` trở đi ("mọi hàm đặt
-- `SET search_path = public`"). `global_search` là SECURITY INVOKER nên rủi ro thấp hơn hàm
-- SECURITY DEFINER, nhưng vẫn nên tường minh — CREATE OR REPLACE giữ nguyên toàn bộ 11 CTE của
-- `0061`, chỉ thêm dòng `SET search_path`.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.global_search(p_query text)
RETURNS TABLE (
  module_code text,
  entity_type text,
  entity_id   uuid,
  code        text,
  title       text,
  subtitle    text,
  path        text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH q AS (
    SELECT trim(p_query) AS term
  ),
  customer_hits AS (
    SELECT
      'CRM'::text AS module_code, 'customer'::text AS entity_type, c.id AS entity_id,
      c.code AS code, c.name AS title, c.phone AS subtitle,
      ('/crm/khach-hang/' || c.id) AS path,
      (c.code ILIKE q.term || '%') AS code_match
    FROM customers c, q
    WHERE c.deleted_at IS NULL
      AND q.term <> ''
      AND (c.code ILIKE '%' || q.term || '%' OR c.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, c.name
    LIMIT 5
  ),
  opportunity_hits AS (
    SELECT
      'CRM'::text AS module_code, 'opportunity'::text AS entity_type, o.id AS entity_id,
      o.code AS code, o.name AS title, cust.name AS subtitle,
      ('/crm/co-hoi/' || o.id) AS path,
      (o.code ILIKE q.term || '%') AS code_match
    FROM opportunities o
    JOIN customers cust ON cust.id = o.customer_id, q
    WHERE o.deleted_at IS NULL
      AND q.term <> ''
      AND (o.code ILIKE '%' || q.term || '%' OR o.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, o.name
    LIMIT 5
  ),
  bidding_hits AS (
    SELECT
      'DA'::text AS module_code, 'bidding_project'::text AS entity_type, b.id AS entity_id,
      b.code AS code, b.name AS title, COALESCE(cust.name, b.site_address) AS subtitle,
      ('/da/goi-thau/' || b.id) AS path,
      (b.code ILIKE q.term || '%') AS code_match
    FROM bidding_projects b
    LEFT JOIN customers cust ON cust.id = b.customer_id, q
    WHERE b.deleted_at IS NULL
      AND q.term <> ''
      AND (b.code ILIKE '%' || q.term || '%' OR b.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, b.name
    LIMIT 5
  ),
  design_hits AS (
    SELECT
      'TK'::text AS module_code, 'design_project'::text AS entity_type, d.id AS entity_id,
      d.code AS code, d.name AS title, d.site_address AS subtitle,
      ('/tk/du-an/' || d.id) AS path,
      (d.code ILIKE q.term || '%') AS code_match
    FROM design_projects d, q
    WHERE d.deleted_at IS NULL
      AND q.term <> ''
      AND (d.code ILIKE '%' || q.term || '%' OR d.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, d.name
    LIMIT 5
  ),
  contract_hits AS (
    SELECT
      'HD'::text AS module_code, 'contract'::text AS entity_type, k.id AS entity_id,
      k.code AS code, k.title AS title, COALESCE(cust.name, k.partner_name) AS subtitle,
      ('/hd/hop-dong/' || k.id) AS path,
      (k.code ILIKE q.term || '%') AS code_match
    FROM contracts k
    LEFT JOIN customers cust ON cust.id = k.customer_id, q
    WHERE k.deleted_at IS NULL
      AND q.term <> ''
      AND (k.code ILIKE '%' || q.term || '%' OR k.title ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, k.title
    LIMIT 5
  ),
  site_hits AS (
    SELECT
      'TC'::text AS module_code, 'construction_site'::text AS entity_type, s.id AS entity_id,
      s.code AS code, s.name AS title, s.site_address AS subtitle,
      ('/tc/cong-trinh/' || s.id) AS path,
      (s.code ILIKE q.term || '%') AS code_match
    FROM construction_sites s, q
    WHERE s.deleted_at IS NULL
      AND q.term <> ''
      AND (s.code ILIKE '%' || q.term || '%' OR s.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, s.name
    LIMIT 5
  ),
  purchase_request_hits AS (
    SELECT
      'MH'::text AS module_code, 'purchase_request'::text AS entity_type, pr.id AS entity_id,
      pr.code AS code, pr.title AS title, COALESCE(site.name, bp.name) AS subtitle,
      ('/mh/de-nghi-mua/' || pr.id) AS path,
      (pr.code ILIKE q.term || '%') AS code_match
    FROM purchase_requests pr
    LEFT JOIN construction_sites site ON site.id = pr.construction_site_id
    LEFT JOIN bidding_projects bp ON bp.id = pr.bidding_project_id, q
    WHERE pr.deleted_at IS NULL
      AND q.term <> ''
      AND (pr.code ILIKE '%' || q.term || '%' OR pr.title ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, pr.title
    LIMIT 5
  ),
  supplier_hits AS (
    SELECT
      'MH'::text AS module_code, 'supplier'::text AS entity_type, sp.id AS entity_id,
      sp.code AS code, sp.name AS title, sp.category AS subtitle,
      ('/mh/nha-cung-cap/' || sp.id) AS path,
      (sp.code ILIKE q.term || '%') AS code_match
    FROM suppliers sp, q
    WHERE sp.deleted_at IS NULL
      AND q.term <> ''
      AND (sp.code ILIKE '%' || q.term || '%' OR sp.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, sp.name
    LIMIT 5
  ),
  payment_request_hits AS (
    SELECT
      'KT'::text AS module_code, 'payment_request'::text AS entity_type, pmt.id AS entity_id,
      pmt.code AS code, pmt.title AS title, COALESCE(sup.name, pmt.payee_name) AS subtitle,
      ('/kt/de-nghi-thanh-toan/' || pmt.id) AS path,
      (pmt.code ILIKE q.term || '%') AS code_match
    FROM payment_requests pmt
    LEFT JOIN suppliers sup ON sup.id = pmt.supplier_id, q
    WHERE pmt.deleted_at IS NULL
      AND q.term <> ''
      AND (pmt.code ILIKE '%' || q.term || '%' OR pmt.title ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, pmt.title
    LIMIT 5
  ),
  employee_hits AS (
    SELECT
      'NS'::text AS module_code, 'employee'::text AS entity_type, e.id AS entity_id,
      e.code AS code, e.full_name AS title, e.position AS subtitle,
      ('/ns/nhan-su/' || e.id) AS path,
      (e.code ILIKE q.term || '%') AS code_match
    FROM employees e, q
    WHERE e.deleted_at IS NULL
      AND q.term <> ''
      AND (e.code ILIKE '%' || q.term || '%' OR e.full_name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, e.full_name
    LIMIT 5
  ),
  rental_agreement_hits AS (
    SELECT
      'SX'::text AS module_code, 'rental_agreement'::text AS entity_type, ra.id AS entity_id,
      ra.code AS code, cust.name AS title, COALESCE(site.name, ra.site_address) AS subtitle,
      ('/sx/tai-san-cho-thue/' || ra.id) AS path,
      (ra.code ILIKE q.term || '%') AS code_match
    FROM rental_agreements ra
    JOIN customers cust ON cust.id = ra.customer_id
    LEFT JOIN construction_sites site ON site.id = ra.construction_site_id, q
    WHERE ra.deleted_at IS NULL
      AND q.term <> ''
      AND (ra.code ILIKE '%' || q.term || '%' OR cust.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, cust.name
    LIMIT 5
  )
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM customer_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM opportunity_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM bidding_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM design_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM contract_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM site_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM purchase_request_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM supplier_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM payment_request_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM employee_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM rental_agreement_hits
$$;

REVOKE ALL ON FUNCTION public.global_search(text) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_audit_touch(target_table regclass)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
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
