-- ============================================================================
-- G5 — NVS cho thuê: đơn thuê nối hợp đồng, báo giá thuê lưu + duyệt + hạn mức công nợ, thuê nội
-- bộ NVC / NVO (QĐ-6), kiểm tồn có lịch thu hồi, điều chuyển giữa công trình
-- (doc/KE_HOACH_KHOP_KHAO_SAT_ANH_THI.md C1–C3; phiếu khảo sát Ban Giám đốc, mảng giàn giáo bước
-- 2, 3, 8, 11 và phần «Ba mảng liên quan»).
--
--  1. Khách hàng là pháp nhân NVG: `customers.nvg_company_id` (chỉ hàm ghi) + `nvg_entity_customer`
--     tạo / tìm hồ sơ khách cho NVC / NVO khi thuê nội bộ — không bắt Xưởng tự gõ.
--  2. Đơn thuê: `contract_id` (hợp đồng cho thuê đã ký), `rental_quote_id`, `internal_request_id`,
--     `is_internal` + `renter_company_id` do TRIGGER đặt: công trình nhận thuộc pháp nhân NVG khác
--     hoặc khách là pháp nhân NVG → nội bộ, không sửa thành «ngoài» được. Dòng đơn nội bộ lấy giá từ
--     `internal_rental_price` (phạm vi sản phẩm) lúc xuất, lưu vào `daily_rate` (= đơn giá đã áp,
--     `price_source = 'noi_bo'`), không đổi về sau; chưa cấu hình thì KHÔNG xuất được, không tự đặt.
--  3. Báo giá thuê lưu được (`rental_quotes`, dòng có mua / thuê): gửi đi thì máy so với
--     `sx.rental_daily_rate` (giá đặc biệt) và hạn mức công nợ `sx.customer_credit_limit` (chung hoặc
--     theo từng khách — phạm vi mới `customer`; TRỐNG = không kiểm). Có giá đặc biệt hoặc vượt hạn
--     mức thì vào hộp Phê duyệt (loại `rental_quote`, Ban Giám đốc NVS; Xưởng không có quyền duyệt).
--  4. Đề nghị thuê giàn giáo nội bộ từ công trình (`internal_rental_requests`): chỉ huy trưởng gửi
--     cho công trình mình được giao (mẫu E) → Xưởng NVS chuẩn bị, gửi duyệt (loại `internal_rental`)
--     → Ban Giám đốc NVS duyệt → Xưởng xuất giàn giáo thành một đơn thuê nội bộ.
--  5. Chi phí nội bộ vào ngân sách công trình nhận: mỗi biên bản thu hồi (hoặc biên bản điều chuyển)
--     của đơn nội bộ khi KÝ ghi một dòng `internal_rental_charges` và cộng vào `actual_amount` của dòng
--     ngân sách mã `THUE_GIAN_GIAO_NB` trên công trình (thiếu thì máy lập dòng, số dự trù 0) — cùng
--     cách nhận hàng mua cộng `actual_amount` (0068). Trigger trên `rental_returns`, không chép lại
--     `sign_rental_return`.
--  6. Báo cáo hợp nhất: `finance_daily` trả thêm phần nội bộ (doanh thu thuê, hợp đồng ký, tiền thu)
--     để trang «Toàn NVG» trừ ra; số từng công ty giữ nguyên.
--  7. Kiểm tồn ba nhóm (`rental_availability`): tồn chắc chắn / dự kiến thu hồi trước ngày cần (theo
--     `expected_end_date`) / đang sửa — không cộng dồn.
--  8. Điều chuyển giữa hai công trình (`rental_transfers`): biên bản ký hai bên (cùng cách 0145 /
--     0209); ký xong thì máy chốt tiền thuê ở đơn nguồn tới ngày điều chuyển (một biên bản mã BBDC,
--     sinh công nợ như biên bản thu hồi), mở đơn mới cho công trình nhận từ ngày đó, chuyển đúng lô —
--     không qua kho, sổ giàn giáo cân.
--  9. `decide_approval`: chép NGUYÊN VĂN bản 0179, thêm hai nhánh.
--
-- Chạy lại được.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'rental_quote';
ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'internal_rental';
ALTER TYPE public.parameter_scope ADD VALUE IF NOT EXISTS 'customer';

-- ----------------------------------------------------------------------------
-- 1. Khách hàng là pháp nhân trong NVG
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS nvg_company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_nvg_company_unique
  ON public.customers (nvg_company_id) WHERE nvg_company_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.customers.nvg_company_id IS
  'Khách hàng này là một pháp nhân trong NVG (NVC / NVO / NVS) — mọi giao dịch với nó là nội bộ (QĐ-6), loại khỏi số hợp nhất. Chỉ hàm nghiệp vụ đặt (nvg_entity_customer).';

CREATE OR REPLACE FUNCTION public.customers_nvg_company_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND ((TG_OP = 'INSERT' AND NEW.nvg_company_id IS NOT NULL)
          OR (TG_OP = 'UPDATE' AND NEW.nvg_company_id IS DISTINCT FROM OLD.nvg_company_id)) THEN
    RAISE EXCEPTION 'Hồ sơ khách là pháp nhân trong NVG do hệ thống tạo khi thuê nội bộ, không đánh dấu tay.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_nvg_company_guard ON public.customers;
CREATE TRIGGER customers_nvg_company_guard
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_nvg_company_guard();

CREATE OR REPLACE FUNCTION public.nvg_entity_customer(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  c    record;
BEGIN
  SELECT id INTO v_id FROM public.customers
   WHERE nvg_company_id = p_company_id AND deleted_at IS NULL;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT * INTO c FROM public.companies WHERE id = p_company_id AND deleted_at IS NULL;
  IF c.id IS NULL OR NOT c.is_transactional THEN
    RAISE EXCEPTION 'Không tìm thấy pháp nhân giao dịch trong NVG.';
  END IF;
  INSERT INTO public.customers (name, tax_code, address, phone, email, representative_name,
                                representative_title, nvg_company_id, notes)
  VALUES (COALESCE(c.legal_name, c.short_name), c.tax_code, c.address, c.phone, c.email,
          c.legal_representative, c.representative_title, c.id,
          'Pháp nhân trong Nhà Việt Group — khách thuê nội bộ (QĐ-6). Hệ thống tạo tự động.')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.nvg_entity_customer(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Đơn thuê: hợp đồng, nội bộ
-- ----------------------------------------------------------------------------
ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rental_quote_id uuid,
  ADD COLUMN IF NOT EXISTS internal_request_id uuid,
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renter_company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transferred_from_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rental_agreements_contract_idx
  ON public.rental_agreements (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rental_agreements_internal_idx
  ON public.rental_agreements (renter_company_id) WHERE is_internal;

COMMENT ON COLUMN public.rental_agreements.is_internal IS
  'Thuê nội bộ giữa hai pháp nhân NVG (QĐ-6): trigger đặt khi công trình nhận thuộc pháp nhân NVG khác hoặc khách là pháp nhân NVG; không sửa thành «ngoài» được. Doanh thu / chi phí của đơn này bị loại khỏi số hợp nhất toàn NVG.';
COMMENT ON COLUMN public.rental_agreements.contract_id IS
  'Hợp đồng cho thuê đã ký mà đơn thuê này thực hiện — chỉ gắn qua create_rental_agreement_from_contract.';

ALTER TABLE public.rental_agreement_items
  ADD COLUMN IF NOT EXISTS price_source varchar(16) NOT NULL DEFAULT 'thoa_thuan';
ALTER TABLE public.rental_agreement_items DROP CONSTRAINT IF EXISTS rental_agreement_items_price_source;
ALTER TABLE public.rental_agreement_items ADD CONSTRAINT rental_agreement_items_price_source
  CHECK (price_source IN ('thoa_thuan', 'bao_gia', 'noi_bo'));

COMMENT ON COLUMN public.rental_agreement_items.daily_rate IS
  'Đơn giá thuê / ngày ĐÃ ÁP cho dòng này (unit_price_applied). Đơn nội bộ: lấy từ internal_rental_price lúc xuất, đổi tham số sau đó không hồi tố.';

CREATE OR REPLACE FUNCTION public.rental_agreements_internal_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_company uuid;
  v_cust_company uuid;
  v_internal     boolean;
  k              record;
BEGIN
  IF NEW.construction_site_id IS NOT NULL THEN
    SELECT company_id INTO v_site_company FROM public.construction_sites
     WHERE id = NEW.construction_site_id;
    -- Công trình của chính bên cho thuê không phải giao dịch giữa hai pháp nhân.
    IF v_site_company = NEW.company_id THEN
      v_site_company := NULL;
    END IF;
  END IF;
  SELECT nvg_company_id INTO v_cust_company FROM public.customers WHERE id = NEW.customer_id;
  IF v_cust_company = NEW.company_id THEN
    RAISE EXCEPTION 'Pháp nhân không tự cho chính mình thuê.';
  END IF;

  IF v_site_company IS NOT NULL AND v_cust_company IS DISTINCT FROM v_site_company THEN
    RAISE EXCEPTION 'Công trình nhận thuộc một pháp nhân khác trong NVG — đây là thuê nội bộ, bên thuê phải là chính pháp nhân đó. Lập bằng «Đề nghị thuê giàn giáo nội bộ» từ công trình.';
  END IF;

  v_internal := COALESCE(v_cust_company, v_site_company) IS NOT NULL;
  IF TG_OP = 'UPDATE' AND v_internal AND NEW.is_internal IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Đơn thuê của pháp nhân trong NVG luôn là giao dịch nội bộ (QĐ-6), không đổi thành thuê ngoài được.';
  END IF;
  NEW.is_internal := v_internal;
  NEW.renter_company_id := CASE WHEN v_internal THEN COALESCE(v_cust_company, v_site_company) END;

  -- Các mối nối chỉ đặt qua hàm nghiệp vụ (hàm SECURITY DEFINER chạy dưới quyền chủ sở hữu).
  IF current_user = 'authenticated' AND (
       (TG_OP = 'INSERT' AND (NEW.contract_id IS NOT NULL OR NEW.rental_quote_id IS NOT NULL
                              OR NEW.internal_request_id IS NOT NULL OR NEW.transferred_from_id IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.contract_id IS DISTINCT FROM OLD.contract_id
                                 OR NEW.rental_quote_id IS DISTINCT FROM OLD.rental_quote_id
                                 OR NEW.internal_request_id IS DISTINCT FROM OLD.internal_request_id
                                 OR NEW.transferred_from_id IS DISTINCT FROM OLD.transferred_from_id))) THEN
    RAISE EXCEPTION 'Không gắn tay đơn thuê với hợp đồng, báo giá hay đề nghị. Dùng «Lập đơn thuê từ hợp đồng» hoặc «Xuất giàn giáo» của đề nghị.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.contract_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.contract_id IS DISTINCT FROM OLD.contract_id) THEN
    SELECT * INTO k FROM public.contracts WHERE id = NEW.contract_id AND deleted_at IS NULL;
    IF k.id IS NULL OR k.type <> 'cho_thue' OR k.stage NOT IN ('da_ky', 'hoan_thanh') THEN
      RAISE EXCEPTION 'Chỉ lập đơn thuê từ hợp đồng cho thuê đã ký.';
    END IF;
    IF k.company_id <> NEW.company_id OR k.customer_id IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'Đơn thuê phải cùng pháp nhân và cùng khách với hợp đồng cho thuê.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_agreements_internal_guard ON public.rental_agreements;
CREATE TRIGGER rental_agreements_internal_guard
  BEFORE INSERT OR UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.rental_agreements_internal_guard();

-- Giá nội bộ: tự áp lúc thêm dòng, không đổi về sau.
CREATE OR REPLACE FUNCTION public.internal_rental_price_of(p_material_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric := public.system_parameter_number('internal_rental_price', 'product', p_material_id);
BEGIN
  -- Rỗng = Ban Giám đốc chưa quyết giá nội bộ cho mã này. KHÔNG dựng mặc định (0111 mục 4).
  IF v IS NULL OR v <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN round(v)::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_rental_price_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_rental_price_of(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rental_agreement_items_internal_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal boolean;
  v_price    bigint;
  v_code     text;
BEGIN
  SELECT is_internal INTO v_internal FROM public.rental_agreements WHERE id = NEW.rental_agreement_id;
  IF NOT COALESCE(v_internal, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_price := public.internal_rental_price_of(NEW.material_id);
    IF v_price IS NULL THEN
      SELECT code INTO v_code FROM public.materials WHERE id = NEW.material_id;
      RAISE EXCEPTION 'Chưa cấu hình giá nội bộ cho mã % — Ban Giám đốc đặt «Giá thuê giàn giáo nội bộ» ở Tham số hệ thống rồi xuất lại.', COALESCE(v_code, '');
    END IF;
    NEW.daily_rate := v_price;
    NEW.price_source := 'noi_bo';
  ELSIF NEW.daily_rate IS DISTINCT FROM OLD.daily_rate OR NEW.price_source IS DISTINCT FROM OLD.price_source THEN
    RAISE EXCEPTION 'Đơn giá nội bộ đã áp lúc xuất giàn giáo, không sửa được (đổi tham số không hồi tố).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_agreement_items_internal_price ON public.rental_agreement_items;
CREATE TRIGGER rental_agreement_items_internal_price
  BEFORE INSERT OR UPDATE ON public.rental_agreement_items
  FOR EACH ROW EXECUTE FUNCTION public.rental_agreement_items_internal_price();

-- ----------------------------------------------------------------------------
-- 3. Báo giá thuê lưu được, có duyệt
-- ----------------------------------------------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'sx.customer_credit_limit', 'global', NULL, 'đồng',
       'Hạn mức công nợ khách thuê / mua giàn giáo',
       'Đặt chung (phạm vi toàn hệ thống) hoặc riêng từng khách (phạm vi khách hàng). Báo giá đưa công nợ còn phải thu của khách tại pháp nhân cho thuê cộng giá trị báo giá vượt mức này thì phải Ban Giám đốc duyệt. Để trống = không kiểm hạn mức.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters
                   WHERE param_key = 'sx.customer_credit_limit' AND scope_type = 'global');

CREATE TABLE IF NOT EXISTS public.rental_quotes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code                  varchar(40) NOT NULL UNIQUE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  opportunity_id        uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  needed_date           date,
  expected_end_date     date,
  delivery_note         text,
  deposit_amount        bigint NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  notes                 text,
  status                varchar(16) NOT NULL DEFAULT 'nhap'
                        CHECK (status IN ('nhap', 'cho_duyet', 'da_duyet', 'tu_choi')),
  special_price         boolean,
  credit_limit_applied  bigint,
  outstanding_at_submit bigint,
  credit_exceeded       boolean,
  estimated_total       bigint,
  approval_id           uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  submitted_at          timestamptz,
  submitted_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at            timestamptz,
  decision_note         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at            timestamptz,
  CONSTRAINT rental_quotes_dates CHECK (expected_end_date IS NULL OR needed_date IS NULL OR expected_end_date >= needed_date)
);

CREATE INDEX IF NOT EXISTS rental_quotes_company_idx ON public.rental_quotes (company_id, status);
CREATE INDEX IF NOT EXISTS rental_quotes_customer_idx ON public.rental_quotes (customer_id);

CREATE TABLE IF NOT EXISTS public.rental_quote_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_quote_id uuid NOT NULL REFERENCES public.rental_quotes(id) ON DELETE CASCADE,
  material_id     uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  kind            varchar(8) NOT NULL DEFAULT 'thue' CHECK (kind IN ('thue', 'mua')),
  quantity        numeric(18, 3) NOT NULL CHECK (quantity > 0),
  unit_price      bigint NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  list_price      bigint,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS rental_quote_items_quote_idx ON public.rental_quote_items (rental_quote_id);

COMMENT ON TABLE public.rental_quotes IS
  'Báo giá thuê / bán giàn giáo lưu theo khách (C1, 0245). Gửi đi: giá thấp hơn sx.rental_daily_rate hoặc công nợ vượt sx.customer_credit_limit thì vào hộp Phê duyệt (rental_quote); không thì coi như đã duyệt.';
COMMENT ON COLUMN public.rental_quote_items.unit_price IS
  'Dòng thuê: đơn giá / ngày / đơn vị. Dòng mua: đơn giá / đơn vị. Đồng.';
COMMENT ON COLUMN public.rental_quote_items.list_price IS
  'Đơn giá thuê theo bảng (sx.rental_daily_rate) chụp lúc gửi duyệt — căn cứ «giá đặc biệt», không đổi theo tham số sau đó.';

ALTER TABLE public.rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_rental_quote_fk;
ALTER TABLE public.rental_agreements ADD CONSTRAINT rental_agreements_rental_quote_fk
  FOREIGN KEY (rental_quote_id) REFERENCES public.rental_quotes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.rental_quotes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'authenticated' THEN
      NEW.status := 'nhap';
      NEW.special_price := NULL; NEW.credit_limit_applied := NULL; NEW.outstanding_at_submit := NULL;
      NEW.credit_exceeded := NULL; NEW.estimated_total := NULL; NEW.approval_id := NULL;
      NEW.submitted_at := NULL; NEW.submitted_by := NULL; NEW.decided_at := NULL; NEW.decision_note := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('nhap', 'tu_choi') THEN
    RAISE EXCEPTION 'Báo giá % đã gửi duyệt hoặc đã duyệt, không sửa được. Lập báo giá mới nếu cần đổi.', OLD.code;
  END IF;
  IF (NEW.status, NEW.special_price, NEW.credit_limit_applied, NEW.outstanding_at_submit, NEW.credit_exceeded,
      NEW.estimated_total, NEW.approval_id, NEW.submitted_at, NEW.submitted_by, NEW.decided_at,
      NEW.decision_note, NEW.code, NEW.company_id, NEW.customer_id)
     IS DISTINCT FROM
     (OLD.status, OLD.special_price, OLD.credit_limit_applied, OLD.outstanding_at_submit, OLD.credit_exceeded,
      OLD.estimated_total, OLD.approval_id, OLD.submitted_at, OLD.submitted_by, OLD.decided_at,
      OLD.decision_note, OLD.code, OLD.company_id, OLD.customer_id) THEN
    RAISE EXCEPTION 'Không đổi trực tiếp được trạng thái, khách hay kết quả kiểm của báo giá. Dùng «Gửi báo giá» để hệ thống kiểm giá và hạn mức.';
  END IF;
  RETURN NEW;
END;
$$;

-- Mã báo giá: hàm cấp mã chỉ chạy dưới quyền chủ sở hữu — trigger riêng, SECURITY DEFINER (trigger
-- canh ở dưới phải chạy bằng quyền người gọi để nhận ra ai đang sửa).
CREATE OR REPLACE FUNCTION public.rental_quotes_assign_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
BEGIN
  SELECT code INTO v_company_code FROM public.companies WHERE id = NEW.company_id;
  NEW.code := public.issue_record_code(v_company_code, 'BGT', NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_quotes_assign_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_quotes_assign_code ON public.rental_quotes;
CREATE TRIGGER rental_quotes_assign_code
  BEFORE INSERT ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.rental_quotes_assign_code();

DROP TRIGGER IF EXISTS rental_quotes_guard ON public.rental_quotes;
CREATE TRIGGER rental_quotes_guard
  BEFORE INSERT OR UPDATE ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.rental_quotes_guard();

DROP TRIGGER IF EXISTS audit_touch ON public.rental_quotes;
SELECT public.attach_audit_touch('public.rental_quotes');
DROP TRIGGER IF EXISTS audit_touch ON public.rental_quote_items;
SELECT public.attach_audit_touch('public.rental_quote_items');
DROP TRIGGER IF EXISTS trg_transactional_company ON public.rental_quotes;
CREATE TRIGGER trg_transactional_company
  BEFORE INSERT OR UPDATE OF company_id ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company();

CREATE OR REPLACE FUNCTION public.rls_rental_quote_editable(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_quotes q
     WHERE q.id = p_quote_id AND q.deleted_at IS NULL AND q.status IN ('nhap', 'tu_choi')
       AND public.rls_company_access(q.company_id) AND public.auth_can_edit_module('SX')
  );
$$;
REVOKE ALL ON FUNCTION public.rls_rental_quote_editable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_rental_quote_editable(uuid) TO authenticated;

ALTER TABLE public.rental_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_quotes FROM anon;
REVOKE ALL ON public.rental_quote_items FROM anon;
REVOKE DELETE ON public.rental_quotes FROM authenticated;

DROP POLICY IF EXISTS rental_quotes_select ON public.rental_quotes;
CREATE POLICY rental_quotes_select ON public.rental_quotes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_rental_readable(company_id));

DROP POLICY IF EXISTS rental_quotes_insert ON public.rental_quotes;
CREATE POLICY rental_quotes_insert ON public.rental_quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_company_access(company_id) AND public.auth_can_edit_module('SX'));

DROP POLICY IF EXISTS rental_quotes_update ON public.rental_quotes;
CREATE POLICY rental_quotes_update ON public.rental_quotes
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id) AND public.auth_can_edit_module('SX'))
  WITH CHECK (public.rls_company_access(company_id));

DROP POLICY IF EXISTS rental_quote_items_select ON public.rental_quote_items;
CREATE POLICY rental_quote_items_select ON public.rental_quote_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_quotes q WHERE q.id = rental_quote_id));

DROP POLICY IF EXISTS rental_quote_items_insert ON public.rental_quote_items;
CREATE POLICY rental_quote_items_insert ON public.rental_quote_items
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_rental_quote_editable(rental_quote_id));

DROP POLICY IF EXISTS rental_quote_items_update ON public.rental_quote_items;
CREATE POLICY rental_quote_items_update ON public.rental_quote_items
  FOR UPDATE TO authenticated
  USING (public.rls_rental_quote_editable(rental_quote_id))
  WITH CHECK (public.rls_rental_quote_editable(rental_quote_id));

DROP POLICY IF EXISTS rental_quote_items_delete ON public.rental_quote_items;
CREATE POLICY rental_quote_items_delete ON public.rental_quote_items
  FOR DELETE TO authenticated
  USING (public.rls_rental_quote_editable(rental_quote_id));

-- Dòng báo giá: list_price chỉ hàm gửi duyệt ghi.
CREATE OR REPLACE FUNCTION public.rental_quote_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.list_price := NULL;
    ELSIF NEW.list_price IS DISTINCT FROM OLD.list_price OR NEW.rental_quote_id IS DISTINCT FROM OLD.rental_quote_id THEN
      RAISE EXCEPTION 'Không sửa tay đơn giá theo bảng của dòng báo giá.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_quote_items_guard ON public.rental_quote_items;
CREATE TRIGGER rental_quote_items_guard
  BEFORE INSERT OR UPDATE ON public.rental_quote_items
  FOR EACH ROW EXECUTE FUNCTION public.rental_quote_items_guard();

/** Công nợ phải thu còn mở của một khách tại một pháp nhân (đồng). */
CREATE OR REPLACE FUNCTION public.customer_open_receivable(p_company_id uuid, p_customer_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(rp.amount - rp.settled_amount), 0)::bigint
    FROM public.receivables_payables rp
   WHERE rp.company_id = p_company_id AND rp.customer_id = p_customer_id
     AND rp.direction = 'phai_thu' AND rp.deleted_at IS NULL AND rp.amount > rp.settled_amount;
$$;
REVOKE ALL ON FUNCTION public.customer_open_receivable(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_rental_quote(p_quote_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := public.auth_user_id();
  q            record;
  it           record;
  v_list       numeric;
  v_days       integer;
  v_total      bigint := 0;
  v_special    boolean := false;
  v_limit      numeric;
  v_open       bigint;
  v_exceeded   boolean := false;
  v_reason     text := '';
  v_customer   text;
  v_approval   uuid;
  v_has_rent   boolean;
  v_subject    public.approval_subject := 'rental_quote';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO q FROM public.rental_quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF q.id IS NULL OR NOT public.rls_company_access(q.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Gửi báo giá thuê do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF q.status NOT IN ('nhap', 'tu_choi') THEN
    RAISE EXCEPTION 'Báo giá % đã gửi.', q.code;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id) THEN
    RAISE EXCEPTION 'Báo giá chưa có dòng hàng nào.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id AND kind = 'thue')
    INTO v_has_rent;
  IF v_has_rent AND (q.needed_date IS NULL OR q.expected_end_date IS NULL) THEN
    RAISE EXCEPTION 'Nhập ngày cần hàng và ngày dự kiến trả để tính tiền thuê.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id AND unit_price <= 0) THEN
    RAISE EXCEPTION 'Mỗi dòng phải có đơn giá lớn hơn 0.';
  END IF;
  v_days := CASE WHEN v_has_rent THEN (q.expected_end_date - q.needed_date) + 1 END;

  FOR it IN
    SELECT i.*, m.code AS material_code FROM public.rental_quote_items i
      JOIN public.materials m ON m.id = i.material_id
     WHERE i.rental_quote_id = q.id ORDER BY i.created_at
  LOOP
    IF it.kind = 'thue' THEN
      v_list := public.system_parameter_number('sx.rental_daily_rate', 'product', it.material_id);
      UPDATE public.rental_quote_items SET list_price = CASE WHEN v_list > 0 THEN round(v_list)::bigint END
       WHERE id = it.id;
      IF v_list > 0 AND it.unit_price < v_list THEN
        v_special := true;
        v_reason := v_reason || format('Giá đặc biệt: %s %s đồng/ngày (bảng giá %s đồng/ngày). ',
          it.material_code, to_char(it.unit_price, 'FM999G999G999G999'), to_char(round(v_list), 'FM999G999G999G999'));
      END IF;
      v_total := v_total + round(it.unit_price * it.quantity * v_days)::bigint;
    ELSE
      v_total := v_total + round(it.unit_price * it.quantity)::bigint;
    END IF;
  END LOOP;

  -- Hạn mức công nợ: riêng khách thay thế mức chung (0111). Rỗng = không kiểm.
  v_limit := public.system_parameter_number('sx.customer_credit_limit', 'customer', q.customer_id);
  v_open := public.customer_open_receivable(q.company_id, q.customer_id);
  IF v_limit IS NOT NULL AND v_open + v_total > v_limit THEN
    v_exceeded := true;
    v_reason := v_reason || format('Công nợ còn phải thu %s đồng + báo giá %s đồng vượt hạn mức %s đồng.',
      to_char(v_open, 'FM999G999G999G999'), to_char(v_total, 'FM999G999G999G999'),
      to_char(round(v_limit), 'FM999G999G999G999'));
  END IF;

  IF v_special OR v_exceeded THEN
    SELECT name INTO v_customer FROM public.customers WHERE id = q.customer_id;
    INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                  title, amount, reason, status, requested_by)
    VALUES (q.company_id, v_subject, 'rental_quotes', q.id, q.code,
            format('Báo giá thuê giàn giáo %s — %s', q.code, COALESCE(v_customer, '')),
            v_total, btrim(v_reason), 'pending_approval', v_user)
    RETURNING id INTO v_approval;
  END IF;

  UPDATE public.rental_quotes
     SET status = CASE WHEN v_approval IS NULL THEN 'da_duyet' ELSE 'cho_duyet' END,
         special_price = v_special, credit_limit_applied = round(v_limit)::bigint,
         outstanding_at_submit = v_open, credit_exceeded = v_exceeded, estimated_total = v_total,
         approval_id = v_approval, submitted_at = now(), submitted_by = v_user,
         decided_at = CASE WHEN v_approval IS NULL THEN now() END, decision_note = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = q.id;

  RETURN CASE WHEN v_approval IS NULL THEN 'da_duyet' ELSE 'cho_duyet' END;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rental_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rental_quote(uuid) TO authenticated;
COMMENT ON FUNCTION public.submit_rental_quote(uuid) IS
  'Gửi báo giá thuê: chụp đơn giá theo bảng, tính giá trị, kiểm giá đặc biệt và hạn mức công nợ. Có một trong hai thì vào hộp Phê duyệt (rental_quote) — trả cho_duyet; không thì da_duyet (0245).';

-- ----------------------------------------------------------------------------
-- 4. Đơn thuê lập từ hợp đồng cho thuê đã ký (và báo giá đã duyệt)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_contracts_ready(p_company_id uuid)
RETURNS TABLE (
  contract_id     uuid,
  code            text,
  contract_number text,
  title           text,
  customer_id     uuid,
  customer_name   text,
  start_date      date,
  end_date        date,
  agreements      integer,
  quote_id        uuid,
  quote_code      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (public.rls_company_access(p_company_id) AND public.auth_can_view_module('SX')) THEN
    RETURN;
  END IF;
  -- Xưởng (SX) không xem phân hệ Hợp đồng: hàm chỉ trả phần cần để lập đơn thuê — không giá trị,
  -- không điều khoản.
  RETURN QUERY
  SELECT k.id, k.code::text, k.contract_number::text, k.title, k.customer_id, c.name,
         k.start_date, k.end_date,
         (SELECT count(*)::int FROM public.rental_agreements ra
           WHERE ra.contract_id = k.id AND ra.deleted_at IS NULL),
         q.id, q.code::text
    FROM public.contracts k
    LEFT JOIN public.customers c ON c.id = k.customer_id
    LEFT JOIN LATERAL (
      SELECT rq.id, rq.code FROM public.rental_quotes rq
       WHERE rq.company_id = k.company_id AND rq.customer_id = k.customer_id
         AND rq.status = 'da_duyet' AND rq.deleted_at IS NULL
       ORDER BY rq.decided_at DESC NULLS LAST, rq.created_at DESC LIMIT 1
    ) q ON true
   WHERE k.company_id = p_company_id AND k.deleted_at IS NULL
     AND k.type = 'cho_thue' AND k.stage = 'da_ky' AND k.customer_id IS NOT NULL
   ORDER BY k.signed_date DESC NULLS LAST, k.code;
END;
$$;

REVOKE ALL ON FUNCTION public.rental_contracts_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_contracts_ready(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_rental_agreement_from_contract(
  p_contract_id       uuid,
  p_rental_quote_id   uuid,
  p_start_date        date,
  p_expected_end_date date,
  p_site_address      text,
  p_deposit_amount    bigint,
  p_notes             text,
  p_items             jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k    record;
  q    record;
  v_id uuid;
BEGIN
  SELECT * INTO k FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF k.id IS NULL OR NOT public.rls_company_access(k.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Không lập được đơn thuê từ hợp đồng này.' USING ERRCODE = '42501';
  END IF;
  IF k.type <> 'cho_thue' OR k.stage <> 'da_ky' OR k.customer_id IS NULL THEN
    RAISE EXCEPTION 'Chỉ lập đơn thuê từ hợp đồng cho thuê đã ký và có khách hàng.';
  END IF;
  IF p_rental_quote_id IS NOT NULL THEN
    SELECT * INTO q FROM public.rental_quotes WHERE id = p_rental_quote_id AND deleted_at IS NULL;
    IF q.id IS NULL OR q.status <> 'da_duyet' OR q.customer_id <> k.customer_id OR q.company_id <> k.company_id THEN
      RAISE EXCEPTION 'Báo giá chọn kèm phải đã duyệt và cùng khách với hợp đồng.';
    END IF;
  END IF;

  v_id := public.create_rental_agreement(
    k.company_id, k.customer_id, NULL, p_site_address,
    COALESCE(p_start_date, k.start_date), COALESCE(p_expected_end_date, k.end_date),
    p_deposit_amount, p_notes, p_items);

  UPDATE public.rental_agreements
     SET contract_id = k.id, rental_quote_id = p_rental_quote_id, updated_at = now()
   WHERE id = v_id;
  UPDATE public.rental_agreement_items SET price_source = 'bao_gia'
   WHERE rental_agreement_id = v_id AND p_rental_quote_id IS NOT NULL AND price_source = 'thoa_thuan';
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_rental_agreement_from_contract(uuid, uuid, date, date, text, bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rental_agreement_from_contract(uuid, uuid, date, date, text, bigint, text, jsonb) TO authenticated;
COMMENT ON FUNCTION public.create_rental_agreement_from_contract(uuid, uuid, date, date, text, bigint, text, jsonb) IS
  'Lập đơn thuê (xuất giàn giáo) từ hợp đồng cho thuê đã ký: khách và ngày lấy từ hợp đồng, dòng hàng + giá từ báo giá đã duyệt do giao diện điền sẵn. Đường lập trực tiếp (khách vãng lai) giữ nguyên (0245).';

-- ----------------------------------------------------------------------------
-- 5. Đề nghị thuê giàn giáo nội bộ từ công trình
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_rental_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code                  varchar(40) NOT NULL UNIQUE,
  requesting_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  site_label            text NOT NULL,
  needed_date           date NOT NULL,
  expected_return_date  date,
  notes                 text,
  status                varchar(16) NOT NULL DEFAULT 'cho_nvs'
                        CHECK (status IN ('cho_nvs', 'cho_duyet', 'da_duyet', 'tu_choi', 'da_xuat', 'huy')),
  approval_id           uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  estimated_total       bigint,
  rental_agreement_id   uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  rental_agreement_code text,
  requested_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  prepared_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  prepared_at           timestamptz,
  decided_at            timestamptz,
  decision_note         text,
  issued_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT internal_rental_requests_dates CHECK (expected_return_date IS NULL OR expected_return_date >= needed_date),
  CONSTRAINT internal_rental_requests_two_entities CHECK (company_id <> requesting_company_id)
);

CREATE INDEX IF NOT EXISTS internal_rental_requests_site_idx ON public.internal_rental_requests (construction_site_id);
CREATE INDEX IF NOT EXISTS internal_rental_requests_company_idx ON public.internal_rental_requests (company_id, status);

CREATE TABLE IF NOT EXISTS public.internal_rental_request_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.internal_rental_requests(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity    numeric(18, 3) NOT NULL CHECK (quantity > 0),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_rental_request_items_req_idx ON public.internal_rental_request_items (request_id);

COMMENT ON TABLE public.internal_rental_requests IS
  'Đề nghị thuê giàn giáo nội bộ (QĐ-6, phiếu Ban Giám đốc bước 11): công trình NVC / NVO gửi, NVS chuẩn bị, Ban Giám đốc NVS duyệt, Xưởng xuất thành đơn thuê nội bộ. Chỉ hàm ghi.';

ALTER TABLE public.rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_internal_request_fk;
ALTER TABLE public.rental_agreements ADD CONSTRAINT rental_agreements_internal_request_fk
  FOREIGN KEY (internal_request_id) REFERENCES public.internal_rental_requests(id) ON DELETE SET NULL;

ALTER TABLE public.internal_rental_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_rental_request_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_rental_requests FROM anon;
REVOKE ALL ON public.internal_rental_request_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.internal_rental_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.internal_rental_request_items FROM authenticated;

-- Hai phía đọc: bên cho thuê (người xem hợp đồng thuê) và công trình nhận (mẫu E — chỉ huy trưởng
-- chỉ thấy công trình được giao).
DROP POLICY IF EXISTS internal_rental_requests_select ON public.internal_rental_requests;
CREATE POLICY internal_rental_requests_select ON public.internal_rental_requests
  FOR SELECT TO authenticated
  USING (public.rls_rental_readable(company_id) OR public.rls_site_readable(construction_site_id));

DROP POLICY IF EXISTS internal_rental_request_items_select ON public.internal_rental_request_items;
CREATE POLICY internal_rental_request_items_select ON public.internal_rental_request_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internal_rental_requests r WHERE r.id = request_id));

CREATE OR REPLACE FUNCTION public.notify_sx_editors(
  p_company_id uuid, p_type text, p_message text, p_entity_type text, p_entity_id uuid, p_url text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_notification(u.id, p_company_id, p_type, p_message, p_entity_type, p_entity_id, p_url)
    FROM public.users u
   WHERE u.is_active AND u.deleted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.user_companies uc
         JOIN public.permissions pm ON pm.role_id = uc.role_id
        WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = p_company_id
          AND pm.module_code = 'SX' AND pm.can_edit);
$$;
REVOKE ALL ON FUNCTION public.notify_sx_editors(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_internal_rental(
  p_site_id              uuid,
  p_needed_date          date,
  p_expected_return_date date,
  p_notes                text,
  p_items                jsonb,
  p_supplier_company_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  s          record;
  v_supplier uuid := p_supplier_company_id;
  v_code     text;
  v_id       uuid;
  v_item     jsonb;
  v_material uuid;
  v_qty      numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id AND deleted_at IS NULL;
  -- Mẫu E: chỉ người phụ trách công trình (đúng pháp nhân, quyền sửa Thi công, trong phạm vi được giao).
  IF s.id IS NULL OR NOT public.rls_site_writable(p_site_id) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách công trình được giao mới gửi đề nghị thuê giàn giáo cho công trình này.'
      USING ERRCODE = '42501';
  END IF;
  IF v_supplier IS NULL THEN
    -- Bên cho thuê giàn giáo của NVG là Nhà Việt Steel (PRD SX). Mã pháp nhân là định danh, không phải tham số.
    SELECT id INTO v_supplier FROM public.companies WHERE code = 'NVS' AND deleted_at IS NULL;
  END IF;
  IF v_supplier IS NULL OR v_supplier = s.company_id THEN
    RAISE EXCEPTION 'Chọn pháp nhân cho thuê khác với pháp nhân của công trình.';
  END IF;
  IF p_needed_date IS NULL THEN
    RAISE EXCEPTION 'Nhập ngày cần giàn giáo tại công trình.';
  END IF;
  IF p_expected_return_date IS NOT NULL AND p_expected_return_date < p_needed_date THEN
    RAISE EXCEPTION 'Ngày dự kiến trả không được trước ngày cần.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Đề nghị phải có ít nhất một loại giàn giáo.';
  END IF;

  SELECT code INTO v_code FROM public.companies WHERE id = v_supplier;
  INSERT INTO public.internal_rental_requests (
    company_id, code, requesting_company_id, construction_site_id, site_label, needed_date,
    expected_return_date, notes, status, requested_by, created_by, updated_by
  ) VALUES (
    v_supplier, public.issue_record_code(v_code, 'DNTN', NULL), s.company_id, s.id,
    s.code || ' — ' || s.name, p_needed_date, p_expected_return_date, NULLIF(btrim(p_notes), ''),
    'cho_nvs', v_user, v_user, v_user
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_material := NULLIF(v_item->>'material_id', '')::uuid;
    v_qty := NULLIF(v_item->>'quantity', '')::numeric;
    IF v_material IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Mỗi dòng phải có loại giàn giáo và số lượng lớn hơn 0.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.materials WHERE id = v_material AND is_scaffolding AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Chỉ đề nghị thuê được mã giàn giáo.';
    END IF;
    INSERT INTO public.internal_rental_request_items (request_id, material_id, quantity, note)
    VALUES (v_id, v_material, v_qty, NULLIF(btrim(v_item->>'note'), ''));
  END LOOP;

  PERFORM public.notify_sx_editors(
    v_supplier, 'internal_rental_request',
    format('Công trình %s đề nghị thuê giàn giáo nội bộ, cần ngày %s.', s.code || ' — ' || s.name,
           to_char(p_needed_date, 'DD/MM/YYYY')),
    'internal_rental_requests', v_id, '/sx/thue-noi-bo');
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_internal_rental(uuid, date, date, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_internal_rental(uuid, date, date, text, jsonb, uuid) TO authenticated;

/** Giá trị ước tính của đề nghị theo giá nội bộ HIỆN HÀNH (chưa áp — áp khi xuất). NULL = thiếu giá / thiếu ngày trả. */
CREATE OR REPLACE FUNCTION public.internal_rental_request_estimate(p_request_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  it     record;
  v_p    bigint;
  v_sum  bigint := 0;
  v_days integer;
BEGIN
  SELECT * INTO r FROM public.internal_rental_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.expected_return_date IS NULL THEN RETURN NULL; END IF;
  v_days := (r.expected_return_date - r.needed_date) + 1;
  FOR it IN SELECT * FROM public.internal_rental_request_items WHERE request_id = r.id LOOP
    v_p := public.internal_rental_price_of(it.material_id);
    IF v_p IS NULL THEN RETURN NULL; END IF;
    v_sum := v_sum + round(v_p * it.quantity * v_days)::bigint;
  END LOOP;
  RETURN v_sum;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_rental_request_estimate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_rental_request_estimate(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_internal_rental_request(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  r          record;
  it         record;
  v_reason   text := '';
  v_total    bigint;
  v_approval uuid;
  v_subject  public.approval_subject := 'internal_rental';
BEGIN
  SELECT * INTO r FROM public.internal_rental_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.rls_company_access(r.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Chuẩn bị đề nghị thuê nội bộ do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'cho_nvs' THEN
    RAISE EXCEPTION 'Đề nghị % không còn chờ Xưởng chuẩn bị.', r.code;
  END IF;
  FOR it IN
    SELECT i.*, m.code AS material_code FROM public.internal_rental_request_items i
      JOIN public.materials m ON m.id = i.material_id WHERE i.request_id = r.id
  LOOP
    IF public.internal_rental_price_of(it.material_id) IS NULL THEN
      RAISE EXCEPTION 'Chưa cấu hình giá nội bộ cho mã % — Ban Giám đốc đặt «Giá thuê giàn giáo nội bộ» ở Tham số hệ thống trước khi gửi duyệt.', it.material_code;
    END IF;
    v_reason := v_reason || format('%s × %s; ', it.material_code, trim(to_char(it.quantity, 'FM999G999G990D###')));
  END LOOP;
  v_total := public.internal_rental_request_estimate(r.id);

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  VALUES (r.company_id, v_subject, 'internal_rental_requests', r.id, r.code,
          format('Cho thuê giàn giáo nội bộ %s — công trình %s', r.code, r.site_label),
          v_total,
          btrim(format('%s Cần ngày %s%s. Giá nội bộ theo tham số, áp khi xuất. %s', rtrim(v_reason, '; '),
                       to_char(r.needed_date, 'DD/MM/YYYY'),
                       CASE WHEN r.expected_return_date IS NOT NULL THEN ', trả ' || to_char(r.expected_return_date, 'DD/MM/YYYY') ELSE '' END,
                       COALESCE(NULLIF(btrim(p_note), ''), ''))),
          'pending_approval', v_user)
  RETURNING id INTO v_approval;

  UPDATE public.internal_rental_requests
     SET status = 'cho_duyet', approval_id = v_approval, estimated_total = v_total,
         prepared_by = v_user, prepared_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = r.id;
  RETURN v_approval;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_internal_rental_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_internal_rental_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_internal_rental_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  r      record;
  v_sx   boolean;
  v_site boolean;
BEGIN
  SELECT * INTO r FROM public.internal_rental_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đề nghị.'; END IF;
  v_sx := public.rls_company_access(r.company_id) AND public.auth_can_edit_module('SX');
  v_site := public.rls_site_writable(r.construction_site_id) AND r.requested_by = v_user;
  IF NOT (v_sx OR v_site) OR r.status <> 'cho_nvs' THEN
    RAISE EXCEPTION 'Chỉ đóng được đề nghị đang chờ Xưởng chuẩn bị: Xưởng từ chối, hoặc người gửi huỷ.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nêu lý do.';
  END IF;
  UPDATE public.internal_rental_requests
     SET status = CASE WHEN v_sx THEN 'tu_choi' ELSE 'huy' END, decision_note = btrim(p_reason),
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = r.id;
  IF v_sx THEN
    PERFORM public.create_notification(r.requested_by, r.requesting_company_id, 'internal_rental_rejected',
      format('Đề nghị thuê giàn giáo %s không được nhận: %s', r.code, btrim(p_reason)),
      'construction_sites', r.construction_site_id,
      '/tc/cong-trinh/' || r.construction_site_id || '?tab=gian-giao');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.close_internal_rental_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_internal_rental_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_internal_rental(
  p_request_id     uuid,
  p_start_date     date,
  p_deposit_amount bigint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  r          record;
  v_customer uuid;
  v_items    jsonb;
  v_id       uuid;
  v_code     text;
BEGIN
  SELECT * INTO r FROM public.internal_rental_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.rls_company_access(r.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Xuất giàn giáo do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'da_duyet' THEN
    RAISE EXCEPTION 'Đề nghị % chưa được Ban Giám đốc duyệt, chưa xuất được.', r.code;
  END IF;

  v_customer := public.nvg_entity_customer(r.requesting_company_id);
  SELECT jsonb_agg(jsonb_build_object('material_id', material_id, 'quantity', quantity, 'daily_rate', 0))
    INTO v_items FROM public.internal_rental_request_items WHERE request_id = r.id;

  -- Giá: trigger của dòng đơn thuê nội bộ lấy internal_rental_price HIỆN HÀNH và lưu lại.
  v_id := public.create_rental_agreement(
    r.company_id, v_customer, r.construction_site_id, r.site_label,
    COALESCE(p_start_date, r.needed_date), r.expected_return_date, COALESCE(p_deposit_amount, 0),
    'Thuê nội bộ theo đề nghị ' || r.code || COALESCE(' — ' || r.notes, ''), v_items);

  UPDATE public.rental_agreements SET internal_request_id = r.id, updated_at = now() WHERE id = v_id
   RETURNING code INTO v_code;
  UPDATE public.internal_rental_requests
     SET status = 'da_xuat', rental_agreement_id = v_id, rental_agreement_code = v_code, issued_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = r.id;

  PERFORM public.create_notification(r.requested_by, r.requesting_company_id, 'internal_rental_issued',
    format('Nhà Việt Steel đã xuất giàn giáo theo đề nghị %s (đơn thuê %s).', r.code, v_code),
    'construction_sites', r.construction_site_id,
    '/tc/cong-trinh/' || r.construction_site_id || '?tab=gian-giao');
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_internal_rental(uuid, date, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_internal_rental(uuid, date, bigint) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Chi phí thuê nội bộ vào ngân sách công trình nhận
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_rental_charges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  supplier_company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  rental_return_id      uuid NOT NULL UNIQUE REFERENCES public.rental_returns(id) ON DELETE CASCADE,
  rental_agreement_id   uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  project_budget_id     uuid NOT NULL REFERENCES public.project_budgets(id) ON DELETE CASCADE,
  charge_date           date NOT NULL,
  rental_amount         bigint NOT NULL,
  compensation_amount   bigint NOT NULL,
  amount                bigint NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_rental_charges_site_idx ON public.internal_rental_charges (construction_site_id);
CREATE INDEX IF NOT EXISTS internal_rental_charges_date_idx ON public.internal_rental_charges (charge_date);

COMMENT ON TABLE public.internal_rental_charges IS
  'Chi phí thuê giàn giáo nội bộ đã ghi vào ngân sách công trình nhận — một dòng cho mỗi biên bản thu hồi / điều chuyển đã ký của đơn nội bộ (QĐ-6). company_id = pháp nhân của công trình (bên chịu chi phí). Chỉ trigger ghi, bất biến.';

ALTER TABLE public.internal_rental_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_rental_charges FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.internal_rental_charges FROM authenticated;

-- Bên cho thuê đọc như hợp đồng thuê; bên công trình đọc đúng khi đọc được dòng ngân sách (giá vốn,
-- Mẫu D — Thi công chỉ ở công trình trong phạm vi, 0235).
DROP POLICY IF EXISTS internal_rental_charges_select ON public.internal_rental_charges;
CREATE POLICY internal_rental_charges_select ON public.internal_rental_charges
  FOR SELECT TO authenticated
  USING (
    public.rls_rental_readable(supplier_company_id)
    OR EXISTS (SELECT 1 FROM public.project_budgets pb WHERE pb.id = project_budget_id)
  );

CREATE OR REPLACE FUNCTION public.rental_returns_post_internal_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ra       record;
  v_site_c uuid;
  v_amount bigint;
  v_budget uuid;
BEGIN
  IF NEW.signed_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.signed_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO ra FROM public.rental_agreements WHERE id = NEW.rental_agreement_id;
  IF NOT COALESCE(ra.is_internal, false) OR ra.construction_site_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_amount := COALESCE(NEW.revenue, 0) + COALESCE(NEW.compensation, 0);
  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;
  SELECT company_id INTO v_site_c FROM public.construction_sites WHERE id = ra.construction_site_id;

  -- Mã chi phí cố định của khoản này (một định danh, không phải số biến động — NEN-12 không áp).
  SELECT id INTO v_budget FROM public.project_budgets
   WHERE construction_site_id = ra.construction_site_id AND cost_code = 'THUE_GIAN_GIAO_NB'
     AND deleted_at IS NULL
   ORDER BY (bidding_project_id IS NULL AND design_project_id IS NULL) DESC, created_at
   LIMIT 1;
  IF v_budget IS NULL THEN
    INSERT INTO public.project_budgets (company_id, construction_site_id, cost_group, cost_code, name,
                                        budgeted_amount, actual_amount, committed_amount, notes)
    VALUES (v_site_c, ra.construction_site_id, 'may_moc', 'THUE_GIAN_GIAO_NB',
            'Thuê giàn giáo nội bộ', 0, 0, 0,
            'Máy lập khi ghi chi phí thuê giàn giáo nội bộ đầu tiên (QĐ-6). Số dự trù do Trưởng phòng Thi công đặt.')
    RETURNING id INTO v_budget;
  END IF;

  UPDATE public.project_budgets
     SET actual_amount = actual_amount + v_amount, updated_at = now()
   WHERE id = v_budget;

  INSERT INTO public.internal_rental_charges (
    company_id, supplier_company_id, rental_return_id, rental_agreement_id, construction_site_id,
    project_budget_id, charge_date, rental_amount, compensation_amount, amount
  ) VALUES (
    v_site_c, ra.company_id, NEW.id, ra.id, ra.construction_site_id, v_budget, NEW.return_date,
    COALESCE(NEW.revenue, 0), COALESCE(NEW.compensation, 0), v_amount
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS rental_returns_post_internal_cost ON public.rental_returns;
CREATE TRIGGER rental_returns_post_internal_cost
  AFTER INSERT OR UPDATE OF signed_at ON public.rental_returns
  FOR EACH ROW EXECUTE FUNCTION public.rental_returns_post_internal_cost();

-- ----------------------------------------------------------------------------
-- 7. Kiểm tồn ba nhóm cho báo giá
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_availability(p_company_id uuid, p_needed_date date)
RETURNS TABLE (
  material_id    uuid,
  code           text,
  name           text,
  specification  text,
  unit           text,
  available      numeric,
  returning_qty  numeric,
  returning_list jsonb,
  under_repair   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.code::text, m.name::text, m.specification::text, m.unit::text,
         COALESCE((SELECT sum(s.quantity) FROM public.scaffolding_assets s
                    WHERE s.company_id = p_company_id AND s.material_id = m.id AND s.deleted_at IS NULL
                      AND s.location_type = 'kho' AND s.condition IN ('con_dung_duoc', 'moi')), 0),
         COALESCE(ret.qty, 0),
         COALESCE(ret.list, '[]'::jsonb),
         COALESCE((SELECT sum(s.quantity) FROM public.scaffolding_assets s
                    WHERE s.company_id = p_company_id AND s.material_id = m.id AND s.deleted_at IS NULL
                      AND s.location_type = 'kho' AND s.condition = 'hong_cho_sua'), 0)
    FROM public.materials m
    LEFT JOIN LATERAL (
      SELECT sum(x.left_qty) AS qty,
             jsonb_agg(jsonb_build_object('code', x.code, 'date', x.expected_end_date, 'quantity', x.left_qty)
                       ORDER BY x.expected_end_date) AS list
        FROM (
          SELECT ra.code, ra.expected_end_date,
                 ri.quantity_out - ri.quantity_returned_ok - ri.quantity_damaged - ri.quantity_lost AS left_qty
            FROM public.rental_agreement_items ri
            JOIN public.rental_agreements ra ON ra.id = ri.rental_agreement_id
           WHERE ra.company_id = p_company_id AND ra.deleted_at IS NULL AND ra.status = 'dang_thue'
             AND ri.material_id = m.id AND p_needed_date IS NOT NULL
             AND ra.expected_end_date IS NOT NULL AND ra.expected_end_date < p_needed_date
        ) x WHERE x.left_qty > 0
    ) ret ON true
   WHERE public.rls_rental_readable(p_company_id)
     AND m.is_scaffolding AND m.is_active AND m.deleted_at IS NULL
   ORDER BY m.code;
$$;

REVOKE ALL ON FUNCTION public.rental_availability(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_availability(uuid, date) TO authenticated;
COMMENT ON FUNCTION public.rental_availability(uuid, date) IS
  'Kiểm tồn cho báo giá thuê theo BA nhóm riêng (C3, 0245): tồn chắc chắn ở kho (mới + còn dùng được); dự kiến thu hồi TRƯỚC ngày cần theo ngày trả dự kiến của đơn đang thuê (kèm danh sách đơn); đang chờ sửa ở kho. Nhóm 2, 3 không cộng vào nhóm 1.';

-- ----------------------------------------------------------------------------
-- 8. Điều chuyển giàn giáo giữa hai công trình, không qua kho
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_transfers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code                    varchar(40) NOT NULL UNIQUE,
  from_agreement_id       uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  to_agreement_id         uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  from_return_id          uuid REFERENCES public.rental_returns(id) ON DELETE SET NULL,
  transfer_date           date NOT NULL,
  to_construction_site_id uuid REFERENCES public.construction_sites(id) ON DELETE SET NULL,
  to_site_label           text NOT NULL,
  notes                   text,
  status                  varchar(16) NOT NULL DEFAULT 'nhap' CHECK (status IN ('nhap', 'da_ky', 'huy')),
  customer_representative varchar(255),
  customer_signature_path text,
  nvg_signature_path      text,
  paper_scan_path         text,
  signed_at               timestamptz,
  signed_by               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS rental_transfers_from_idx ON public.rental_transfers (from_agreement_id);

CREATE TABLE IF NOT EXISTS public.rental_transfer_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.rental_transfers(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity    numeric(18, 3) NOT NULL CHECK (quantity > 0)
);

ALTER TABLE public.rental_returns
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.rental_transfers(id) ON DELETE SET NULL;

COMMENT ON TABLE public.rental_transfers IS
  'Biên bản điều chuyển giàn giáo từ công trình của đơn thuê này sang công trình khác của cùng bên thuê (hoặc giữa hai công trình nội bộ), không qua kho (C3, 0245). Ký hai bên xong máy chốt tiền thuê ở đơn nguồn tới ngày điều chuyển (biên bản BBDC) và mở đơn mới cho công trình nhận.';

ALTER TABLE public.rental_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_transfer_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_transfers FROM anon;
REVOKE ALL ON public.rental_transfer_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rental_transfers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rental_transfer_items FROM authenticated;

DROP POLICY IF EXISTS rental_transfers_select ON public.rental_transfers;
CREATE POLICY rental_transfers_select ON public.rental_transfers
  FOR SELECT TO authenticated USING (public.rls_rental_readable(company_id));
DROP POLICY IF EXISTS rental_transfer_items_select ON public.rental_transfer_items;
CREATE POLICY rental_transfer_items_select ON public.rental_transfer_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_transfers t WHERE t.id = transfer_id));

CREATE OR REPLACE FUNCTION public.rls_rental_transfer_signable(p_transfer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_transfers t
     WHERE t.id = p_transfer_id AND t.status = 'nhap'
       AND public.rls_company_access(t.company_id) AND public.auth_can_edit_module('SX')
  );
$$;
CREATE OR REPLACE FUNCTION public.rls_rental_transfer_readable(p_transfer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_transfers t
     WHERE t.id = p_transfer_id AND public.rls_rental_readable(t.company_id)
  );
$$;
REVOKE ALL ON FUNCTION public.rls_rental_transfer_signable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_rental_transfer_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_rental_transfer_signable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_rental_transfer_readable(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rental-transfer-docs', 'rental-transfer-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS rental_transfer_docs_select ON storage.objects;
CREATE POLICY rental_transfer_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rental-transfer-docs'
         AND public.rls_rental_transfer_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS rental_transfer_docs_insert ON storage.objects;
CREATE POLICY rental_transfer_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-transfer-docs'
              AND public.rls_rental_transfer_signable(public.try_uuid((storage.foldername(name))[1])));

CREATE OR REPLACE FUNCTION public.create_rental_transfer(
  p_from_agreement_id uuid,
  p_transfer_date     date,
  p_to_site_id        uuid,
  p_to_site_label     text,
  p_items             jsonb,
  p_notes             text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  ra         record;
  s          record;
  v_label    text := NULLIF(btrim(p_to_site_label), '');
  v_code     text;
  v_id       uuid;
  v_item     jsonb;
  v_material uuid;
  v_qty      numeric;
  v_left     numeric;
BEGIN
  SELECT * INTO ra FROM public.rental_agreements WHERE id = p_from_agreement_id AND deleted_at IS NULL;
  IF ra.id IS NULL OR NOT public.rls_company_access(ra.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Điều chuyển giàn giáo do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF ra.status <> 'dang_thue' THEN
    RAISE EXCEPTION 'Đơn thuê không còn đang thuê, không điều chuyển được.';
  END IF;
  IF p_transfer_date IS NULL OR p_transfer_date < ra.start_date THEN
    RAISE EXCEPTION 'Ngày điều chuyển phải từ ngày bắt đầu thuê trở đi.';
  END IF;

  IF p_to_site_id IS NOT NULL THEN
    SELECT * INTO s FROM public.construction_sites WHERE id = p_to_site_id AND deleted_at IS NULL;
    IF s.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy công trình nhận.'; END IF;
    IF p_to_site_id IS NOT DISTINCT FROM ra.construction_site_id THEN
      RAISE EXCEPTION 'Công trình nhận trùng công trình đang giữ giàn giáo.';
    END IF;
    IF s.company_id <> ra.company_id AND NOT ra.is_internal THEN
      RAISE EXCEPTION 'Công trình nhận thuộc pháp nhân khác trong NVG — chỉ điều chuyển giữa công trình nội bộ khi đơn nguồn cũng là thuê nội bộ.';
    END IF;
    v_label := COALESCE(v_label, s.code || ' — ' || s.name);
  ELSIF ra.is_internal THEN
    RAISE EXCEPTION 'Đơn nội bộ chỉ điều chuyển sang một công trình NVG khác — chọn công trình nhận.';
  END IF;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Ghi công trình / địa chỉ nhận giàn giáo.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Biên bản điều chuyển phải có ít nhất một loại giàn giáo.';
  END IF;

  SELECT code INTO v_code FROM public.companies WHERE id = ra.company_id;
  INSERT INTO public.rental_transfers (company_id, code, from_agreement_id, transfer_date,
                                       to_construction_site_id, to_site_label, notes, created_by, updated_by)
  VALUES (ra.company_id, public.issue_record_code(v_code, 'DCGG', EXTRACT(YEAR FROM p_transfer_date)::int),
          ra.id, p_transfer_date, p_to_site_id, v_label, NULLIF(btrim(p_notes), ''), v_user, v_user)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_material := NULLIF(v_item->>'material_id', '')::uuid;
    v_qty := NULLIF(v_item->>'quantity', '')::numeric;
    IF v_material IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Mỗi dòng phải có loại giàn giáo và số lượng lớn hơn 0.';
    END IF;
    SELECT ri.quantity_out - ri.quantity_returned_ok - ri.quantity_damaged - ri.quantity_lost INTO v_left
      FROM public.rental_agreement_items ri
     WHERE ri.rental_agreement_id = ra.id AND ri.material_id = v_material;
    IF v_left IS NULL OR v_qty > v_left THEN
      RAISE EXCEPTION 'Số điều chuyển vượt số đang ở công trình của đơn này.';
    END IF;
    INSERT INTO public.rental_transfer_items (transfer_id, material_id, quantity) VALUES (v_id, v_material, v_qty);
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_rental_transfer(uuid, date, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rental_transfer(uuid, date, uuid, text, jsonb, text) TO authenticated;

/** Công trình nhận được chọn khi điều chuyển đơn NỘI BỘ: công trình đang chạy của các pháp nhân NVG
 *  khác bên cho thuê. Xưởng (NVS) không xem phân hệ Thi công nên chỉ nhận mã + tên. */
CREATE OR REPLACE FUNCTION public.rental_transfer_target_sites(p_from_agreement_id uuid)
RETURNS TABLE (site_id uuid, company_code text, code text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  ra record;
BEGIN
  SELECT * INTO ra FROM public.rental_agreements WHERE id = p_from_agreement_id AND deleted_at IS NULL;
  IF ra.id IS NULL OR NOT ra.is_internal OR NOT public.rls_company_access(ra.company_id)
     OR NOT public.auth_can_edit_module('SX') THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.id, c.code::text, s.code::text, s.name
    FROM public.construction_sites s
    JOIN public.companies c ON c.id = s.company_id
   WHERE s.deleted_at IS NULL AND s.company_id <> ra.company_id AND c.is_transactional
     AND s.stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu')
     AND s.id IS DISTINCT FROM ra.construction_site_id
   ORDER BY c.code, s.code;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_transfer_target_sites(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_transfer_target_sites(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_rental_transfer(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rls_rental_transfer_signable(p_transfer_id) THEN
    RAISE EXCEPTION 'Chỉ huỷ được biên bản điều chuyển chưa ký.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rental_transfers SET status = 'huy', updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_transfer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_rental_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_rental_transfer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sign_rental_transfer(
  p_transfer_id             uuid,
  p_customer_representative text,
  p_customer_signature_path text DEFAULT NULL,
  p_nvg_signature_path      text DEFAULT NULL,
  p_paper_scan_path         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  t           record;
  ra          record;
  ri          record;
  it          record;
  v_lot       record;
  v_cust      text := NULLIF(btrim(p_customer_signature_path), '');
  v_nvg       text := NULLIF(btrim(p_nvg_signature_path), '');
  v_scan      text := NULLIF(btrim(p_paper_scan_path), '');
  v_rep       text := NULLIF(btrim(p_customer_representative), '');
  v_path      text;
  v_company   text;
  v_customer  uuid;
  v_cust_name text;
  v_to_site_c uuid;
  v_to        uuid;
  v_return    uuid;
  v_days      integer;
  v_rev       bigint;
  v_total     bigint := 0;
  v_left      numeric;
  v_take      numeric;
  v_all       boolean;
  v_recv      uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO t FROM public.rental_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF t.id IS NULL OR NOT public.rls_company_access(t.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Ký biên bản điều chuyển do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF t.status <> 'nhap' THEN
    RAISE EXCEPTION 'Biên bản % đã ký hoặc đã huỷ.', t.code;
  END IF;
  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'Ghi họ tên người đại diện bên thuê ký biên bản.';
  END IF;
  IF NOT ((v_cust IS NOT NULL AND v_nvg IS NOT NULL) OR v_scan IS NOT NULL) THEN
    RAISE EXCEPTION 'Cần đủ chữ ký của hai bên, hoặc ảnh biên bản giấy đã ký.';
  END IF;
  FOREACH v_path IN ARRAY ARRAY[v_cust, v_nvg, v_scan] LOOP
    CONTINUE WHEN v_path IS NULL;
    IF left(v_path, length(t.id::text) + 1) <> t.id::text || '/'
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'rental-transfer-docs' AND name = v_path) THEN
      RAISE EXCEPTION 'Chữ ký hoặc ảnh biên bản chưa tải lên được. Kiểm tra mạng rồi ký lại.';
    END IF;
  END LOOP;

  SELECT * INTO ra FROM public.rental_agreements WHERE id = t.from_agreement_id AND deleted_at IS NULL FOR UPDATE;
  IF ra.id IS NULL OR ra.status <> 'dang_thue' THEN
    RAISE EXCEPTION 'Đơn thuê nguồn không còn đang thuê.';
  END IF;

  PERFORM set_config('nvg.ledger_date', t.transfer_date::text, true);
  SELECT code INTO v_company FROM public.companies WHERE id = ra.company_id;

  -- Bên thuê của đơn mới: cùng khách; công trình nhận của pháp nhân NVG khác thì là pháp nhân đó.
  v_customer := ra.customer_id;
  IF t.to_construction_site_id IS NOT NULL THEN
    SELECT company_id INTO v_to_site_c FROM public.construction_sites WHERE id = t.to_construction_site_id;
    IF v_to_site_c <> ra.company_id THEN
      v_customer := public.nvg_entity_customer(v_to_site_c);
    END IF;
  END IF;
  SELECT name INTO v_cust_name FROM public.customers WHERE id = v_customer;

  -- 1. Đơn mới cho công trình nhận, tính tiền từ ngày điều chuyển.
  INSERT INTO public.rental_agreements (
    company_id, code, customer_id, construction_site_id, site_address, start_date, expected_end_date,
    status, deposit_amount, notes, transferred_from_id, created_by, updated_by
  ) VALUES (
    ra.company_id, public.next_record_code(v_company, 'HDT', NULL), v_customer,
    CASE WHEN v_to_site_c IS NOT NULL THEN t.to_construction_site_id END, t.to_site_label,
    t.transfer_date, ra.expected_end_date, 'dang_thue', 0,
    format('Điều chuyển từ đơn %s theo biên bản %s.', ra.code, t.code), ra.id, v_user, v_user
  ) RETURNING id INTO v_to;

  -- 2. Biên bản chốt tiền ở đơn nguồn (chưa ký — ký ở cuối để công nợ gắn vào).
  INSERT INTO public.rental_returns (company_id, rental_agreement_id, code, return_date, revenue,
                                     compensation, transfer_id, created_by, updated_by)
  VALUES (ra.company_id, ra.id, public.issue_record_code(v_company, 'BBDC', EXTRACT(YEAR FROM t.transfer_date)::int),
          t.transfer_date, 0, 0, t.id, v_user, v_user)
  RETURNING id INTO v_return;

  v_days := GREATEST((t.transfer_date - ra.start_date) + 1, 1);
  FOR it IN SELECT * FROM public.rental_transfer_items WHERE transfer_id = t.id LOOP
    SELECT * INTO ri FROM public.rental_agreement_items
     WHERE rental_agreement_id = ra.id AND material_id = it.material_id FOR UPDATE;
    IF ri.id IS NULL OR it.quantity > ri.quantity_out - ri.quantity_returned_ok - ri.quantity_damaged - ri.quantity_lost THEN
      RAISE EXCEPTION 'Số điều chuyển vượt số đang ở công trình của đơn nguồn.';
    END IF;
    v_rev := round(ri.daily_rate * it.quantity * v_days)::bigint;
    v_total := v_total + v_rev;

    -- Đơn nguồn: phần điều chuyển coi như trả đạt tại ngày điều chuyển (không về kho).
    UPDATE public.rental_agreement_items
       SET quantity_returned_ok = quantity_returned_ok + it.quantity, updated_at = now(), updated_by = v_user
     WHERE id = ri.id;
    INSERT INTO public.rental_return_items (rental_return_id, material_id, quantity_ok, quantity_damaged,
                                            quantity_lost, rental_days, daily_rate, revenue, compensation_amount, note)
    VALUES (v_return, it.material_id, it.quantity, 0, 0, v_days, ri.daily_rate, v_rev, 0,
            'Điều chuyển sang ' || t.to_site_label);

    -- Đơn mới: cùng đơn giá nếu cùng bên thuê; nội bộ thì trigger áp giá nội bộ hiện hành.
    INSERT INTO public.rental_agreement_items (rental_agreement_id, material_id, quantity_out, daily_rate,
                                               price_source, created_by, updated_by)
    VALUES (v_to, it.material_id, it.quantity, ri.daily_rate, ri.price_source, v_user, v_user);

    -- Lô: rút khỏi đơn nguồn, ghi sang đơn mới — cùng tình trạng, không qua kho.
    v_left := it.quantity;
    FOR v_lot IN
      SELECT * FROM public.scaffolding_assets
       WHERE current_rental_agreement_id = ra.id AND material_id = it.material_id
         AND location_type = 'khach_thue' AND deleted_at IS NULL AND quantity > 0
       ORDER BY created_at FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, v_lot.quantity);
      UPDATE public.scaffolding_assets SET quantity = quantity - v_take, updated_at = now(), updated_by = v_user
       WHERE id = v_lot.id;
      INSERT INTO public.scaffolding_assets (
        company_id, asset_code, material_id, quantity, condition, location_type, construction_site_id,
        renter_name, current_rental_agreement_id, purchase_date, created_by, updated_by
      ) VALUES (
        ra.company_id, left(v_lot.asset_code, 44) || '-DC-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
        it.material_id, v_take, v_lot.condition, 'khach_thue',
        CASE WHEN v_to_site_c IS NOT NULL THEN t.to_construction_site_id END, v_cust_name, v_to,
        v_lot.purchase_date, v_user, v_user
      );
      v_left := v_left - v_take;
    END LOOP;
    IF v_left > 0 THEN
      RAISE EXCEPTION 'Lô giàn giáo đang ghi ở bên thuê không đủ để điều chuyển — kiểm tra lại số liệu.';
    END IF;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.rental_agreement_items
     WHERE rental_agreement_id = ra.id
       AND quantity_out > quantity_returned_ok + quantity_damaged + quantity_lost
  ) INTO v_all;

  UPDATE public.rental_returns SET revenue = v_total WHERE id = v_return;
  UPDATE public.rental_agreements
     SET status = (CASE WHEN v_all THEN 'da_thu_hoi' ELSE 'dang_thue' END)::rental_agreement_status,
         actual_return_date = CASE WHEN v_all THEN t.transfer_date ELSE actual_return_date END,
         total_revenue = COALESCE(total_revenue, 0) + v_total,
         updated_at = now(), updated_by = v_user
   WHERE id = ra.id;

  -- 3. Công nợ của phần đã chốt (như biên bản thu hồi đã ký, 0145), rồi ký biên bản chốt.
  IF v_total > 0 THEN
    INSERT INTO public.receivables_payables (
      company_id, direction, party_type, customer_id, party_name, description, amount,
      rental_agreement_id, rental_return_id, created_by, updated_by
    ) VALUES (
      ra.company_id, 'phai_thu', 'khach_hang', ra.customer_id,
      (SELECT name FROM public.customers WHERE id = ra.customer_id),
      'Tiền thuê giàn giáo tới ngày điều chuyển — hợp đồng ' || ra.code || ', biên bản ' || t.code,
      v_total, ra.id, v_return, v_user, v_user
    ) RETURNING id INTO v_recv;
  END IF;
  UPDATE public.rental_returns
     SET customer_representative = v_rep, customer_signature_path = v_cust, nvg_signature_path = v_nvg,
         paper_scan_path = v_scan, signed_at = now(), signed_by = v_user, receivable_id = v_recv,
         updated_at = now(), updated_by = v_user
   WHERE id = v_return;

  UPDATE public.rental_transfers
     SET status = 'da_ky', to_agreement_id = v_to, from_return_id = v_return,
         customer_representative = v_rep, customer_signature_path = v_cust, nvg_signature_path = v_nvg,
         paper_scan_path = v_scan, signed_at = now(), signed_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = t.id;
  RETURN v_to;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_rental_transfer(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_rental_transfer(uuid, text, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.sign_rental_transfer(uuid, text, text, text, text) IS
  'Ký biên bản điều chuyển: chốt tiền thuê đơn nguồn tới ngày điều chuyển (biên bản BBDC đã ký, công nợ như biên bản thu hồi; đơn nội bộ thì chi phí vào ngân sách công trình), mở đơn mới cho công trình nhận, chuyển đúng lô không qua kho — sổ giàn giáo không đổi tổng (0245).';

-- ----------------------------------------------------------------------------
-- 9. Báo cáo hợp nhất: tách phần nội bộ ra cột riêng
--
-- `finance_daily` (0143) cộng doanh thu thuê, hợp đồng ký, tiền thu theo từng pháp nhân. Giao dịch
-- nội bộ vẫn là doanh thu / tiền thu THẬT của từng công ty — nên các cột cũ giữ nguyên; ba cột mới
-- cho biết bao nhiêu trong đó là nội bộ để trang «Toàn NVG» trừ ra (QĐ-6).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.finance_daily(date, date, uuid);
CREATE FUNCTION public.finance_daily(
  p_from date,
  p_to date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day date,
  company_id uuid,
  revenue_accepted bigint,
  rental_revenue bigint,
  contracts_signed bigint,
  collected bigint,
  paid_out bigint,
  internal_revenue bigint,
  internal_contracts_signed bigint,
  internal_collected bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem báo cáo.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Không xem được số liệu tài chính. Chỉ Ban Giám đốc, Giám đốc Tài chính và Kế toán xem được — liên hệ quản trị hệ thống nếu công việc cần.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Khoảng thời gian báo cáo không hợp lệ.';
  END IF;

  RETURN QUERY
  WITH facts AS (
    SELECT ar.accepted_date AS d, ar.company_id AS cid,
           ar.value AS revenue_accepted, 0::bigint AS rental_revenue, 0::bigint AS contracts_signed,
           0::bigint AS collected, 0::bigint AS paid_out,
           0::bigint AS i_rev, 0::bigint AS i_sig, 0::bigint AS i_col
      FROM public.acceptance_records ar
     WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
       AND ar.deleted_at IS NULL AND ar.accepted_date IS NOT NULL
    UNION ALL
    SELECT rr.return_date, rr.company_id, 0, rr.revenue, 0, 0, 0,
           CASE WHEN ra.is_internal THEN rr.revenue ELSE 0 END, 0, 0
      FROM public.rental_returns rr
      JOIN public.rental_agreements ra ON ra.id = rr.rental_agreement_id
     WHERE ra.deleted_at IS NULL AND rr.revenue <> 0
    UNION ALL
    SELECT c.signed_date, c.company_id, 0, 0, c.value, 0, 0,
           0, CASE WHEN cu.nvg_company_id IS NOT NULL THEN c.value ELSE 0 END, 0
      FROM public.contracts c
      LEFT JOIN public.customers cu ON cu.id = c.customer_id
     WHERE c.deleted_at IS NULL AND c.signed_date IS NOT NULL AND c.stage IN ('da_ky', 'hoan_thanh')
    UNION ALL
    SELECT rs.settled_date, rp.company_id, 0, 0, 0, rs.amount, 0,
           0, 0, CASE WHEN cu.nvg_company_id IS NOT NULL THEN rs.amount ELSE 0 END
      FROM public.receivable_settlements rs
      JOIN public.receivables_payables rp ON rp.id = rs.receivable_id
      LEFT JOIN public.customers cu ON cu.id = rp.customer_id
     WHERE rp.direction = 'phai_thu' AND rp.deleted_at IS NULL
    UNION ALL
    SELECT pr.paid_date, pr.company_id, 0, 0, 0, 0, COALESCE(pr.paid_amount, pr.amount), 0, 0, 0
      FROM public.payment_requests pr
     WHERE pr.deleted_at IS NULL AND pr.paid_date IS NOT NULL AND pr.stage IN ('da_chi', 'da_hach_toan')
  )
  SELECT f.d, f.cid,
         SUM(f.revenue_accepted)::bigint, SUM(f.rental_revenue)::bigint,
         SUM(f.contracts_signed)::bigint, SUM(f.collected)::bigint, SUM(f.paid_out)::bigint,
         SUM(f.i_rev)::bigint, SUM(f.i_sig)::bigint, SUM(f.i_col)::bigint
    FROM facts f
   WHERE f.d BETWEEN p_from AND p_to
     AND (p_company_id IS NULL OR f.cid = p_company_id)
     AND public.rls_company_access(f.cid)
   GROUP BY f.d, f.cid
   ORDER BY f.d, f.cid;
END;
$$;
COMMENT ON FUNCTION public.finance_daily(date, date, uuid) IS
  'Tổng tài chính theo ngày nghiệp vụ (doanh thu nghiệm thu, tiền thuê theo từng đợt trả, hợp đồng ký, đã thu, đã chi) cho biểu đồ BC. Ba cột internal_* = phần trong đó là giao dịch với pháp nhân NVG khác — trang «Toàn NVG» trừ ra (QĐ-6, 0245). Chỉ vai trò rls_sees_finance.';
REVOKE ALL ON FUNCTION public.finance_daily(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_daily(date, date, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. decide_approval — chép NGUYÊN VĂN bản 0179, thêm nhánh báo giá thuê và thuê nội bộ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
  st     record;
  adj    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'payment_requests' THEN
    /*
     * KT-01 bước 5 — phê duyệt theo hạn mức. Ba bước kiểm trước đó đã xong và đã ghi vào
     * `payment_request_steps`; ở đây chỉ còn quyết định cuối cùng về tiền.
     *
     * Từ chối thì hồ sơ về "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy hồ sơ của
     * mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa. Sửa xong gửi lại là
     * đi LẠI TỪ ĐẦU cả ba bước kiểm — người kiểm trước đó đã ký trên một con số khác.
     */
    UPDATE public.payment_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::payment_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Khoản đã duyệt là việc cần làm của Kế toán – Tài chính: họ lập phiếu chi và thực
      -- hiện chi (KT-01 bước 6, 7). Người đề nghị thường không mở màn hình KT hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'payment_request_approved',
        format('Đề nghị chi %s đã được phê duyệt, giá trị %s đồng. Lập phiếu chi để thực hiện.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'payment_requests', a.entity_id,
        format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code = 'KT';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'payment_request_approved' ELSE 'payment_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị chi %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị chi %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'payment_requests', a.entity_id,
      format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'leave_requests' THEN
    /*
     * NS-05 — đơn nghỉ phép. Từ chối thì đơn ĐÓNG kèm lý do, không quay về Nháp: người lao
     * động cần đọc được vì sao bị từ chối trước khi xin lại ngày khác.
     */
    UPDATE public.leave_requests
       SET status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::leave_request_status,
           decided_at = now(),
           reject_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN 'Đơn nghỉ phép đã được duyệt.'
           ELSE format('Đơn nghỉ phép bị từ chối. %s', COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'leave_requests', a.entity_id, '/ns/nghi-phep'
    );

  ELSIF a.entity_type = 'recruitment_positions' THEN
    /*
     * NS-02 — yêu cầu tuyển dụng. Được duyệt thì chuyển sang "Đang tuyển" và HCNS bắt đầu
     * đăng tuyển; từ chối thì dừng hẳn, người đề nghị lập yêu cầu mới nếu vẫn cần người.
     */
    UPDATE public.recruitment_positions
       SET status = (CASE WHEN p_decision = 'approved' THEN 'dang_tuyen' ELSE 'dung_tuyen' END)::recruitment_position_status,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      PERFORM public.create_notification(
        u.id, a.company_id, 'recruitment_approved',
        format('Yêu cầu tuyển dụng %s đã được duyệt. Bắt đầu đăng tuyển.', COALESCE(a.entity_code, '')),
        'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'NS';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'recruitment_approved' ELSE 'recruitment_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Yêu cầu tuyển dụng %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Yêu cầu tuyển dụng %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
    );
  ELSIF a.entity_type = 'site_surveys' THEN
    /*
     * Đợt 1 — 1D (0175): báo cáo khảo sát. Duyệt → «Đã duyệt», cơ hội còn ở Khảo sát thì tự sang
     * Báo giá. Trả về → «Bị trả về» kèm ý kiến (bắt buộc — kiểm ở đầu hàm), người khảo sát sửa
     * rồi gửi lại. Báo cho người gửi cả hai trường hợp.
     */
    PERFORM set_config('nvg.survey_report', 'on', true);
    UPDATE public.site_surveys
       SET report_status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tra_ve' END)::survey_report_status,
           report_feedback = CASE WHEN p_decision = 'approved' THEN NULL ELSE NULLIF(btrim(p_note), '') END,
           report_decided_at = now(),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING opportunity_id INTO e;
    PERFORM set_config('nvg.survey_report', 'off', true);

    IF p_decision = 'approved' THEN
      PERFORM public._sync_opportunity_stage(e.opportunity_id, 'bao_gia',
        'Báo cáo khảo sát đã được duyệt');
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'survey_report_approved' ELSE 'survey_report_returned' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo cáo khảo sát %s đã được duyệt — lập báo giá.', COALESCE(a.entity_code, ''))
           ELSE format('Báo cáo khảo sát %s bị trả về: %s', COALESCE(a.entity_code, ''),
                       COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'opportunities', e.opportunity_id,
      '/crm/co-hoi/' || e.opportunity_id || '?tab=khao-sat'
    );
  ELSIF a.entity_type = 'showcase_items' THEN
    /*
     * Đợt 1 — 1H (0179): Thiết kế đề nghị xoá mẫu công trình, Giám đốc đồng ý thì xoá mềm; không
     * đồng ý thì mẫu giữ nguyên, bỏ dấu «đang đề nghị xoá». Báo người đề nghị.
     */
    PERFORM set_config('nvg.showcase', 'on', true);
    IF p_decision = 'approved' THEN
      UPDATE public.showcase_items
         SET deleted_at = now(), updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    ELSE
      UPDATE public.showcase_items
         SET deletion_requested_at = NULL, deletion_requested_by = NULL,
             deletion_reason = NULL, deletion_approval_id = NULL,
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;
    PERFORM set_config('nvg.showcase', 'off', true);

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'showcase_deleted' ELSE 'showcase_kept' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Giám đốc đã đồng ý xoá mẫu «%s».', a.title)
           ELSE format('Giám đốc giữ lại mẫu «%s»: %s', a.title, COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'showcase_items', a.entity_id, '/mau-cong-trinh'
    );
  ELSIF a.entity_type = 'rental_quotes' THEN
    /*
     * G5 (0245): báo giá thuê giàn giáo có giá đặc biệt hoặc công nợ vượt hạn mức. Duyệt → «Đã duyệt»
     * (lập đơn thuê được); từ chối → «Bị từ chối» kèm ý kiến, Xưởng sửa rồi gửi lại.
     */
    UPDATE public.rental_quotes
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'rental_quote_approved' ELSE 'rental_quote_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo giá thuê %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Báo giá thuê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'rental_quotes', a.entity_id, '/sx/bao-gia-thue?bao-gia=' || a.entity_id
    );
  ELSIF a.entity_type = 'internal_rental_requests' THEN
    /*
     * G5 (0245): cho thuê giàn giáo nội bộ (QĐ-6). Duyệt → Xưởng xuất giàn giáo; từ chối → đề nghị
     * đóng kèm lý do. Báo người gửi (chỉ huy trưởng) và Xưởng.
     */
    UPDATE public.internal_rental_requests
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING requested_by, requesting_company_id, construction_site_id INTO e;

    PERFORM public.create_notification(
      e.requested_by, e.requesting_company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê giàn giáo %s đã được duyệt — chờ Nhà Việt Steel xuất hàng.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê giàn giáo %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'construction_sites', e.construction_site_id,
      '/tc/cong-trinh/' || e.construction_site_id || '?tab=gian-giao'
    );
    PERFORM public.notify_sx_editors(
      a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê nội bộ %s đã được duyệt — xuất giàn giáo.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê nội bộ %s bị từ chối.', COALESCE(a.entity_code, ''))
      END,
      'internal_rental_requests', a.entity_id, '/sx/thue-noi-bo'
    );
  ELSE
    -- Không có nhánh nào khớp: loại hồ sơ lạ (gõ sai, hoặc module mới chưa nối). Raise ở
    -- đây cuộn ngược toàn bộ giao dịch — kể cả UPDATE approvals/INSERT approval_decisions
    -- phía trên — để không xảy ra tình trạng "phê duyệt xong" mà hồ sơ gốc không hề đổi
    -- (0086, sửa lại đúng ở 0088 sau khi 0086 tự ý viết lại các nhánh khác và làm sai).
    RAISE EXCEPTION 'Loại hồ sơ phê duyệt không xác định: %.', a.entity_type;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179), báo giá thuê + thuê nội bộ giàn giáo (0245).';

