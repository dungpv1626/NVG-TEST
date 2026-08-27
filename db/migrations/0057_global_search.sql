-- ============================================================================
-- Tìm kiếm toàn hệ thống (AFD 5.3, BUILD_PLAN 1.5) — `GET /api/search` phía Frontend gọi
-- thẳng qua PostgREST RPC, không qua Workers: đây là một truy vấn ĐỌC đơn thuần trên các
-- bảng đã có RLS, không có quy tắc nghiệp vụ nào cần tầng Workers (CLAUDE.md Mục 3.1).
--
-- SECURITY INVOKER (mặc định khi không khai `SECURITY DEFINER`) — CỐ Ý, để một lượt tìm
-- kiếm chỉ trả về đúng những dòng RLS đã cho phép người gọi xem. Không cần kiểm quyền
-- module riêng ở đây: vai trò không có quyền xem CRM thì RLS của `customers`/`opportunities`
-- đã trả về rỗng, nhóm đó tự nhiên biến mất khỏi kết quả — đúng "ẩn, không hiện rồi báo lỗi"
-- (Webapp Flow 6.5), không phải hai nơi kiểm quyền khác nhau dễ lệch nhau.
--
-- ⚠️ Quyết định phạm vi — KHÔNG phải `tsvector` full-text như bản phác thảo gốc ở
-- BUILD_PLAN.md 1.5: ở quy mô demo (~30-700 hồ sơ/pháp nhân/năm), ILIKE là đủ nhanh, còn
-- tsvector cần thêm cột sinh sẵn + trigger cho SÁU bảng và unaccent để tìm không dấu ra có
-- dấu — chi phí không tương xứng lợi ích ở bước này. Nếu tìm kiếm chậm thật khi có dữ liệu
-- thật, nâng cấp lên tsvector sau (cùng tinh thần với `report_snapshots`: không tối ưu sớm).
--
-- ⚠️ Phạm vi bảng — ĐĂNG KÝ DẦN theo đúng ghi chú gốc, bắt đầu bằng sáu thực thể trung tâm
-- của "Hồ sơ 360°" (CLAUDE.md Mục 3.6): customers, opportunities, bidding_projects,
-- design_projects, contracts, construction_sites. Các bảng khác (nhà cung cấp, vật tư, nhân
-- sự…) thêm ở phase sau khi có nhu cầu thật.
--
-- Xếp hạng: khớp ĐẦU MÃ được ưu tiên trước khớp trong TÊN (đúng yêu cầu gốc "khớp chính xác
-- theo mã ưu tiên đầu"). Tối đa 5 dòng mỗi nhóm module — cột `code_match` chỉ dùng để sắp
-- xếp bên trong từng CTE, KHÔNG lọt ra ngoài SELECT cuối.
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
$$;

REVOKE ALL ON FUNCTION public.global_search(text) FROM public;
GRANT EXECUTE ON FUNCTION public.global_search(text) TO authenticated;
