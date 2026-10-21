-- ============================================================================
-- Bộ mẫu hợp đồng của ba pháp nhân (anh Dũng gửi 21/10/2026 — bản dự thảo, dùng như chính thức).
--
-- 1. Ba loại hợp đồng mà bộ mẫu có, hệ thống chưa có:
--      · mua_vat_tu    — NVG MUA vật tư / hàng hoá (NVC-HĐ-06, NVO-HĐ-06, hợp đồng nguyên tắc
--                        với nhà cung cấp). Tiền chảy RA.
--      · thue_thiet_bi — NVG THUÊ máy móc thiết bị (NVC-HĐ-07). Tiền chảy RA.
--      · cho_thue      — NVS CHO THUÊ giàn giáo (NVS-HĐ-02, hợp đồng nội bộ NVS-HĐ-05). Tiền vào.
--    `mua_ban` giữ nghĩa cũ: NVG BÁN (NVS bán giàn giáo, gia công theo đơn).
--    Bên A / bên B của văn bản tự đổi theo loại ở `shared/src/hd.ts` (`isPayableContract`).
--
-- 2. `contract_templates.payment_milestones`: các đợt thanh toán mẫu đề xuất (mốc + tỷ lệ mặc
--    định) — bảng trong Word thành bảng lặp, các đợt gốc giữ ở đây để gợi ý «Tiến độ thanh toán».
--
-- 3. Ba loại mới không mở công trình (như khoán tổ đội): mua / thuê đi kèm công trình đã có,
--    cho thuê giàn giáo theo dõi ở phân hệ Sản xuất – Cho thuê. Chặn bằng trigger nhỏ thay vì
--    chép lại `open_site_from_contract` (bản 0164, dài).
--
-- Giá trị enum mới chưa commit khi các migration chạy chung một giao dịch → so dạng text.
-- ============================================================================

ALTER TYPE public.contract_type ADD VALUE IF NOT EXISTS 'mua_vat_tu';
ALTER TYPE public.contract_type ADD VALUE IF NOT EXISTS 'thue_thiet_bi';
ALTER TYPE public.contract_type ADD VALUE IF NOT EXISTS 'cho_thue';

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS payment_milestones jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contract_templates.payment_milestones IS
  'Các đợt thanh toán mẫu đề xuất: [{noi_dung, ty_le (số % hoặc null), ty_le_mau (chữ gốc)}].';

CREATE OR REPLACE FUNCTION public.construction_sites_contract_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT type::text INTO v_type FROM public.contracts WHERE id = NEW.contract_id;
  IF v_type IN ('mua_vat_tu', 'thue_thiet_bi') THEN
    RAISE EXCEPTION 'Hợp đồng mua vật tư / thuê thiết bị không mở ra công trình mới — nó phục vụ công trình đang thi công.';
  END IF;
  IF v_type = 'cho_thue' THEN
    RAISE EXCEPTION 'Hợp đồng cho thuê giàn giáo không mở công trình — theo dõi giao, thu hồi ở phân hệ Sản xuất – Cho thuê.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_contract_type_guard ON public.construction_sites;
CREATE TRIGGER construction_sites_contract_type_guard
  BEFORE INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_contract_type_guard();
