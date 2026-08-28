-- ============================================================================
-- Tìm kiếm toàn hệ thống (AFD 5.3) — mở rộng đợt ba: nối Module KHO, module cuối cùng còn
-- thiếu (BUILD_PLAN 1.5 ghi rõ "KHÔNG thêm Kho ở đợt này: các màn hình Kho chưa có route
-- `:id`"). Nay lấp bằng CÁCH KHÁC, không dựng trang chi tiết mới cho từng loại:
--
--   - `materials` — danh mục thuần (KHO-02, không vòng đời), màn hình chỉ có một bảng + biểu
--     mẫu sửa. Trỏ về `/kho/vat-tu?ma=<mã>`, trang đọc `?ma=` để tự lọc đúng dòng.
--   - `stocktakes` — không có trang riêng, chỉ là một dòng MỞ RỘNG ngay trong danh sách kiểm
--     kê. Trỏ về `/kho/kiem-ke?mo=<id>`, trang đọc `?mo=` để tự mở đúng dòng.
--   - `scaffolding_assets` — cùng khuôn `stocktakes`. Trỏ về `/kho/gian-giao?mo=<id>`.
--
-- Không dựng trang chi tiết thứ 8 (CLAUDE.md 4.6 "không tự nghĩ mẫu thứ 8") — ba màn hình
-- này vốn đã là "danh sách tự mở rộng dòng", deep-link vào đúng trạng thái đó là đủ, và nhất
-- quán với cách `StockMovementPage` đã đọc `?loai=`/`?vat-tu=` từ trước (movement-page.tsx).
--
-- Không có cột nhạy cảm nào ở ba bảng này (giá vốn nằm ở `inventory_items.average_cost` /
-- `stock_movement_items.unit_cost`, đã khoá riêng từ 0064 — không đụng tới ở đây), nên không
-- cần `rls_sees_sensitive`/`log_sensitive_access`, giống cách 0057/0061 đã làm với các bảng
-- không nhạy cảm khác. SECURITY INVOKER (mặc định) thừa hưởng đúng RLS nguồn của từng bảng.
-- ============================================================================

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
  ),
  material_hits AS (
    SELECT
      'KHO'::text AS module_code, 'material'::text AS entity_type, m.id AS entity_id,
      m.code AS code, m.name AS title, m.specification AS subtitle,
      ('/kho/vat-tu?ma=' || m.code) AS path,
      (m.code ILIKE q.term || '%') AS code_match
    FROM materials m, q
    WHERE m.deleted_at IS NULL
      AND q.term <> ''
      AND (m.code ILIKE '%' || q.term || '%' OR m.name ILIKE '%' || q.term || '%')
    ORDER BY code_match DESC, m.name
    LIMIT 5
  ),
  stocktake_hits AS (
    SELECT
      'KHO'::text AS module_code, 'stocktake'::text AS entity_type, st.id AS entity_id,
      st.code AS code, ('Kiểm kê ' || w.name) AS title,
      to_char(st.started_at, 'DD/MM/YYYY') AS subtitle,
      ('/kho/kiem-ke?mo=' || st.id) AS path,
      (st.code ILIKE q.term || '%') AS code_match
    FROM stocktakes st
    JOIN warehouses w ON w.id = st.warehouse_id, q
    WHERE st.deleted_at IS NULL
      AND q.term <> ''
      AND st.code ILIKE '%' || q.term || '%'
    ORDER BY code_match DESC, st.started_at DESC
    LIMIT 5
  ),
  scaffolding_hits AS (
    SELECT
      'KHO'::text AS module_code, 'scaffolding_asset'::text AS entity_type, a.id AS entity_id,
      a.asset_code AS code, m.name AS title,
      COALESCE(site.name, w.name, a.renter_name) AS subtitle,
      ('/kho/gian-giao?mo=' || a.id) AS path,
      (a.asset_code ILIKE q.term || '%') AS code_match
    FROM scaffolding_assets a
    JOIN materials m ON m.id = a.material_id
    LEFT JOIN warehouses w ON w.id = a.warehouse_id
    LEFT JOIN construction_sites site ON site.id = a.construction_site_id, q
    WHERE a.deleted_at IS NULL
      AND q.term <> ''
      AND a.asset_code ILIKE '%' || q.term || '%'
    ORDER BY code_match DESC, a.asset_code
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
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM material_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM stocktake_hits
  UNION ALL
  SELECT module_code, entity_type, entity_id, code, title, subtitle, path FROM scaffolding_hits
$$;

REVOKE ALL ON FUNCTION public.global_search(text) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(text) TO authenticated;

COMMENT ON FUNCTION public.global_search(text) IS
  'Tìm kiếm toàn hệ thống (AFD 5.3). Đợt ba (0070): nối Module KHO — module cuối cùng trong 10 module có "hồ sơ" để tìm (NEN/BC không có). materials/stocktakes/scaffolding_assets trỏ về màn hình danh sách kèm query param (?ma=/?mo=) vì ba màn hình đó chưa có trang chi tiết riêng.';
