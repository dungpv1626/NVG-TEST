-- ============================================================================
-- «Hợp đồng này đã có công trình chưa?» — cho người xem được hợp đồng nhưng KHÔNG xem được
-- phân hệ Thi công.
--
-- Lỗi thấy khi chụp ảnh hướng dẫn 30/09/2026: vai trò Dự án – Đấu thầu (có quyền sửa HD, không
-- xem TC) mở hợp đồng Hưng Thịnh đã có công trình NVC-CT-2026-0001 mà vẫn thấy nút chính «Mở
-- công trình» — màn hình đếm công trình qua RLS của `construction_sites`, vai trò đó đọc ra rỗng.
-- `open_site_from_contract` vẫn chặn mở trùng, nhưng nút chính mời bấm rồi báo lỗi là sai.
--
-- Trả đúng một boolean, không lộ gì của công trình. Chỉ trả lời khi người gọi đọc được hợp
-- đồng (cùng điều kiện phạm vi pháp nhân + quyền xem HD); ngoài phạm vi thì NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.contract_has_site(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.contracts
   WHERE id = p_contract_id AND deleted_at IS NULL;
  IF v_company IS NULL OR NOT public.rls_company_access(v_company)
     OR NOT public.auth_can_view_module('HD') THEN
    RETURN NULL;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.construction_sites s
     WHERE s.contract_id = p_contract_id AND s.deleted_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contract_has_site(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_has_site(uuid) TO authenticated;

COMMENT ON FUNCTION public.contract_has_site(uuid) IS
  'Hợp đồng đã có công trình chưa — cho vai trò xem HD mà không xem TC (ẩn nút Mở công trình). NULL khi ngoài phạm vi.';
