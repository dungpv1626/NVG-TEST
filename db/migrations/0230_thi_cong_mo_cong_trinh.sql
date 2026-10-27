-- 0230 — Trưởng phòng Thi công và Chỉ huy trưởng mở công trình từ hợp đồng (câu 5, anh Dũng 27/10/2026: «cả 2»).
--
-- `open_site_from_contract` (0164) đã cho người có quyền phê duyệt Thi công mở công trình (TC và CHT đều có — CLAUDE.md
-- 6.5.7). Nhưng nút «Mở công trình» chỉ nằm trên trang hợp đồng, mà Thi công KHÔNG xem phân hệ Hợp đồng (chủ dự án giữ
-- nguyên quyền) — nên trên thực tế chỉ Ban Giám đốc mở được.
--
-- Hàm này liệt kê hợp đồng đã ký, loại mở ra công trình, chưa có công trình — chỉ những gì cần để nhận ra hợp đồng
-- (mã, số, tên, khách, ngày ký, nguồn). KHÔNG trả giá trị, điều khoản (panel công trình 0165 cũng không lộ). Cửa vào:
-- người mở được công trình (phê duyệt Thi công hoặc Hợp đồng), trong phạm vi pháp nhân của họ.

CREATE OR REPLACE FUNCTION public.contracts_awaiting_site()
RETURNS TABLE (
  contract_id      uuid,
  company_id       uuid,
  code             text,
  contract_number  text,
  title            text,
  customer_name    text,
  signed_date      date,
  source_type      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.company_id, c.code::text, c.contract_number::text, c.title,
         COALESCE(cu.name, c.partner_name)::text, c.signed_date, c.source_type::text
    FROM public.contracts c
    LEFT JOIN public.customers cu ON cu.id = c.customer_id
   WHERE c.deleted_at IS NULL
     AND c.stage = 'da_ky'
     AND c.type::text IN ('thiet_ke', 'thi_cong', 'mua_ban')
     AND public.rls_company_access(c.company_id)
     AND NOT public.auth_is_read_only()
     AND (public.auth_can_approve_module('TC') OR public.auth_can_approve_module('HD'))
     AND NOT EXISTS (
       SELECT 1 FROM public.construction_sites s
        WHERE s.contract_id = c.id AND s.deleted_at IS NULL
     )
   ORDER BY c.signed_date DESC NULLS LAST, c.code;
$$;

REVOKE ALL ON FUNCTION public.contracts_awaiting_site() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contracts_awaiting_site() TO authenticated;

COMMENT ON FUNCTION public.contracts_awaiting_site() IS
  'Hợp đồng đã ký chờ mở công trình — cho Thi công (không xem phân hệ Hợp đồng), không trả giá trị / điều khoản (0230).';
