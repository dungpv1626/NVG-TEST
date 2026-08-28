-- ============================================================================
-- Tìm kiếm toàn hệ thống (AFD 5.3) — mở rộng đợt hai, đúng như ghi chú "ĐĂNG KÝ DẦN" ở
-- `0057_global_search.sql`: sáu thực thể trung tâm của "Hồ sơ 360°" đã có, đợt này thêm năm
-- thực thể hay tìm nhất của bốn module còn thiếu (BUILD_PLAN 4A — "tìm kiếm phủ đủ 12 module").
--
--   MH — Đề nghị mua, Nhà cung cấp
--   KT — Đề nghị thanh toán
--   NS — Nhân sự
--   SX — Hợp đồng cho thuê giàn giáo
--
-- KHÔNG thêm Kho ở đợt này: các màn hình Kho (`kho/vat-tu`, `kho/phieu`…) chưa có route
-- `:id` để dẫn thẳng tới — thêm vào đây sẽ tạo kết quả tìm kiếm không có chỗ để bấm tới.
-- NEN và BC không có "hồ sơ" để tìm (NEN là cấu hình hệ thống, BC là báo cáo tổng hợp).
--
-- Cùng khuôn CSDL với 0057 hệt: SECURITY INVOKER (mặc định), ILIKE (không tsvector), khớp
-- đầu mã ưu tiên, tối đa 5 dòng/nhóm. CREATE OR REPLACE đủ dùng — RETURNS TABLE không đổi
-- cột nào, chỉ thêm nhánh UNION ALL.
--
-- ⚠️ Cột chọn CỐ Ý tránh mọi cột nhạy cảm — đã đối chiếu RLS nguồn của từng bảng trước khi
-- thêm (CLAUDE.md Mục 4B tinh thần):
--   - `employees`: chỉ lấy `code`/`full_name`/`position` — KHÔNG đụng `base_salary`,
--     `id_number`, `health_notes`… (nhóm "CỘT NHẠY CẢM" của `ns.ts`). RLS hàng của
--     `employees_select` đã tự giới hạn ai thấy được dòng nào (HCNS, chính mình, quản lý
--     trực tiếp, chỉ huy công trường, KT/CFO) — SECURITY INVOKER thừa hưởng nguyên vẹn.
--   - `payment_requests`: chỉ lấy `code`/`title`, KHÔNG lấy `amount` — dù không phải Mẫu D,
--     số tiền đề nghị chi không cần lộ qua một ô tìm kiếm dùng chung.
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
