-- ============================================================================
-- Chuỗi hồ sơ: Cơ hội → Gói thầu / Hồ sơ thiết kế → Hợp đồng → Công trình.
--
-- Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3–4): từ một hồ sơ không thấy được hồ sơ trước và
-- sau nó ở module khác. Trang cơ hội chỉ biết khách hàng (panel liên quan), nên vẫn mời «Soạn hợp
-- đồng» trong khi hợp đồng đã sinh từ gói thầu của chính cơ hội đó — nguy cơ hai hợp đồng, đếm
-- doanh thu hai lần.
--
-- Hai hàm, cùng đi theo các cột liên kết SẴN CÓ (không thêm cột nào):
--   · `record_chain` — các hồ sơ trong chuỗi mà NGƯỜI GỌI ĐƯỢC XEM. Hồ sơ ngoài quyền bị BỎ HẲN
--     khỏi kết quả, không trả về dạng mờ (CLAUDE.md 5.4: ẩn cả trong panel liên kết chéo).
--   · `opportunity_has_contract` — cơ hội đã có hợp đồng (chưa hủy) qua BẤT KỲ đường nào chưa.
--     Trả cờ kể cả khi người gọi không xem được hợp đồng đó: Kinh doanh không xem DA vẫn phải
--     biết để không soạn bản thứ hai (cùng lý lẽ `contract_has_site`, 0144).
-- ============================================================================

-- --- Cơ hội gốc của một hồ sơ bất kỳ trong chuỗi -------------------------------------------
CREATE OR REPLACE FUNCTION public.chain_origin_opportunity(p_entity_type text, p_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'opportunity' THEN p_id
    WHEN 'bidding'     THEN (SELECT opportunity_id FROM public.bidding_projects WHERE id = p_id)
    WHEN 'design'      THEN (SELECT opportunity_id FROM public.design_projects WHERE id = p_id)
    WHEN 'contract'    THEN public.contract_origin_opportunity(p_id)
    WHEN 'site'        THEN (
      SELECT COALESCE(
        public.contract_origin_opportunity(s.contract_id),
        (SELECT b.opportunity_id FROM public.bidding_projects b WHERE b.id = s.bidding_project_id),
        (SELECT d.opportunity_id FROM public.design_projects d WHERE d.id = s.design_project_id)
      )
      FROM public.construction_sites s WHERE s.id = p_id
    )
  END;
$$;

-- --- Chuỗi hồ sơ người gọi được xem --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_chain(p_entity_type text, p_id uuid)
RETURNS TABLE (kind text, id uuid, code text, title text, stage text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp       uuid := public.chain_origin_opportunity(p_entity_type, p_id);
  v_bids      uuid[];
  v_designs   uuid[];
  v_contracts uuid[];
BEGIN
  IF v_opp IS NOT NULL THEN
    SELECT array_agg(b.id) INTO v_bids
      FROM public.bidding_projects b WHERE b.opportunity_id = v_opp AND b.deleted_at IS NULL;
    SELECT array_agg(d.id) INTO v_designs
      FROM public.design_projects d WHERE d.opportunity_id = v_opp AND d.deleted_at IS NULL;
  ELSIF p_entity_type = 'bidding' THEN
    v_bids := ARRAY[p_id];
  ELSIF p_entity_type = 'design' THEN
    v_designs := ARRAY[p_id];
  END IF;

  SELECT array_agg(c.id) INTO v_contracts
    FROM public.contracts c
   WHERE c.deleted_at IS NULL
     AND (
       (c.source_type = 'opportunities' AND c.source_id = v_opp)
       OR (c.source_type = 'bidding_projects' AND c.source_id = ANY (COALESCE(v_bids, '{}')))
       OR (c.source_type = 'design_projects' AND c.source_id = ANY (COALESCE(v_designs, '{}')))
       OR (p_entity_type = 'contract' AND c.id = p_id)
       OR (p_entity_type = 'site' AND c.id = (SELECT s.contract_id FROM public.construction_sites s WHERE s.id = p_id))
     );

  RETURN QUERY
  SELECT 'opportunity'::text, o.id, o.code::text, o.name::text, o.stage::text
    FROM public.opportunities o
   WHERE o.id = v_opp AND o.deleted_at IS NULL
     AND public.rls_company_access(o.company_id) AND public.auth_can_view_module('CRM');

  RETURN QUERY
  SELECT 'bidding'::text, b.id, b.code::text, b.name::text, b.stage::text
    FROM public.bidding_projects b
   WHERE b.id = ANY (COALESCE(v_bids, '{}')) AND public.rls_bidding_project_readable(b.id)
   ORDER BY b.created_at;

  RETURN QUERY
  SELECT 'design'::text, d.id, d.code::text, d.name::text, d.stage::text
    FROM public.design_projects d
   WHERE d.id = ANY (COALESCE(v_designs, '{}')) AND public.rls_design_project_readable(d.id)
   ORDER BY d.created_at;

  RETURN QUERY
  SELECT 'contract'::text, c.id, COALESCE(c.contract_number, c.code)::text, c.title::text, c.stage::text
    FROM public.contracts c
   WHERE c.id = ANY (COALESCE(v_contracts, '{}')) AND public.rls_contract_readable(c.id)
   ORDER BY c.created_at;

  RETURN QUERY
  SELECT 'site'::text, s.id, s.code::text, s.name::text, s.stage::text
    FROM public.construction_sites s
   WHERE s.deleted_at IS NULL
     AND (s.contract_id = ANY (COALESCE(v_contracts, '{}'))
          OR s.bidding_project_id = ANY (COALESCE(v_bids, '{}'))
          OR s.design_project_id = ANY (COALESCE(v_designs, '{}'))
          OR (p_entity_type = 'site' AND s.id = p_id))
     AND public.rls_site_readable(s.id)
   ORDER BY s.created_at;
END;
$$;

COMMENT ON FUNCTION public.record_chain(text, uuid) IS
  'Chuỗi Cơ hội → Gói thầu/Thiết kế → Hợp đồng → Công trình của một hồ sơ, CHỈ gồm hồ sơ người '
  'gọi được xem (0159). entity_type: opportunity | bidding | design | contract | site.';

REVOKE ALL ON FUNCTION public.record_chain(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_chain(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.chain_origin_opportunity(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chain_origin_opportunity(text, uuid) TO authenticated;

-- --- Cơ hội đã có hợp đồng chưa, qua bất kỳ đường nào -------------------------------------
CREATE OR REPLACE FUNCTION public.opportunity_has_contract(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.opportunities
   WHERE id = p_opportunity_id AND deleted_at IS NULL;
  IF v_company IS NULL OR NOT public.rls_company_access(v_company) THEN
    RETURN NULL;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.deleted_at IS NULL AND c.stage <> 'huy'
       AND public.contract_origin_opportunity(c.id) = p_opportunity_id
  );
END;
$$;

COMMENT ON FUNCTION public.opportunity_has_contract(uuid) IS
  'Cơ hội đã có hợp đồng chưa hủy — trực tiếp hoặc qua gói thầu / hồ sơ thiết kế (0159). Dùng để '
  'ẩn «Soạn hợp đồng» cho người không xem được hợp đồng đó. NULL khi ngoài phạm vi.';

REVOKE ALL ON FUNCTION public.opportunity_has_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.opportunity_has_contract(uuid) TO authenticated;

-- Soạn hợp đồng thứ hai cho cùng một cơ hội qua đường khác cũng phải bị chặn ở CSDL, không chỉ
-- ẩn nút: `create_contract_from_source` (0087) mới chặn trùng theo ĐÚNG nguồn.
CREATE OR REPLACE FUNCTION public.contracts_one_per_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_opp uuid;
BEGIN
  v_opp := CASE NEW.source_type
    WHEN 'opportunities'    THEN NEW.source_id
    WHEN 'bidding_projects' THEN (SELECT opportunity_id FROM public.bidding_projects WHERE id = NEW.source_id)
    WHEN 'design_projects'  THEN (SELECT opportunity_id FROM public.design_projects WHERE id = NEW.source_id)
  END;
  IF v_opp IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.deleted_at IS NULL AND c.stage <> 'huy'
       AND public.contract_origin_opportunity(c.id) = v_opp
  ) THEN
    RAISE EXCEPTION 'Cơ hội này đã có hợp đồng (qua gói thầu hoặc hồ sơ thiết kế). Mở hợp đồng hiện có thay vì soạn bản mới.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_one_per_opportunity ON public.contracts;
CREATE TRIGGER contracts_one_per_opportunity
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_one_per_opportunity();
