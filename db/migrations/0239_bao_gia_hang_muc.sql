-- ============================================================================
-- 0239 — Báo giá có bảng hạng mục, văn bản gửi khách, mẫu lời nhắn và gửi email (anh Dũng 29/10/2026)
--
-- 1. `quote_items`: hạng mục · đơn vị · khối lượng (numeric) · đơn giá (bigint đồng) → thành tiền (cột sinh,
--    làm tròn tới đồng). Quyền đọc / ghi đi qua báo giá mẹ: đọc = báo giá đọc được (chính sách `quotes_select`
--    áp trong câu con), ghi = `rls_quote_writable` của cơ hội — cùng hàm chính sách `quotes_update` dùng.
--    Không chép điều kiện.
--    Hạng mục BẤT BIẾN khi báo giá đã rời Nháp hoặc đã gửi khách (trigger `quote_items_guard`) — cùng cách
--    «khoá sau duyệt» của các bảng khác: kết quả phê duyệt chỉ có nghĩa với đúng bộ hạng mục đã duyệt.
-- 2. `quotes`: thêm `vat_rate` (như `contracts.vat_rate`, 0171) + `vat_included` (đơn giá ĐÃ GỒM thuế hay
--    CHƯA GỒM — chưa gồm thì cộng thuế vào tổng), `subtotal_value`, `vat_amount`, `line_items_based`.
--    Báo giá lập bằng hạng mục (`line_items_based`) thì `total_value` do CSDL tính (trigger
--    `quotes_sync_totals`): tổng hạng mục − giảm giá, ± thuế. Trình duyệt gõ số khác cũng bị đè.
--    Báo giá cũ không có hạng mục giữ nguyên tổng đã lưu.
--    Phê duyệt giá đặc biệt (CRM-05) KHÔNG đổi: `quotes_open_approval` vẫn chọn luồng theo `discount_amount`.
-- 3. `create_quote_version`: lập phiên bản + hạng mục trong MỘT giao dịch (SECURITY INVOKER — RLS quyết).
-- 4. `request_quote_approval`: thêm hai kiểm tra cho báo giá có hạng mục (phải có ít nhất một hạng mục, giảm giá
--    không quá tổng hạng mục). Phần còn lại chép nguyên văn 0031.
-- 5. `contract_templates.document_kind` thêm 'bao_gia' — mẫu Word báo giá theo pháp nhân, Kinh doanh (CRM) đọc
--    được mẫu và tệp mẫu.
-- 6. `message_templates`: mẫu lời nhắn Zalo / email theo pháp nhân. Ai trong pháp nhân cũng đọc (để gửi); chỉ
--    Ban Giám đốc / Quản trị sửa (`auth_can_manage_message_templates`). Chưa có dòng = dùng mẫu mặc định trong
--    `shared/src/quote-message.ts`.
-- 7. `outbound_shares`: kênh email do hệ thống gửi (`via = 'he_thong'`), cột `simulated` (giả lập — chưa có khoá
--    Resend hoặc `EMAIL_FAKE=1`), `external_id` (mã thư của Resend). Dòng email CHỈ Worker ghi (service_role sau
--    khi đã kiểm quyền gửi bằng phiên người gọi) — trình duyệt không tự khai được «đã gửi email». Không lưu thân thư.
-- 8. `quote_texts` + `quote_text_changes`: câu chữ sửa ngay trên văn bản báo giá (không phải số), có lịch sử;
--    `quote_documents` + kho `quote-documents`: bản đã sửa trong Word, bất biến, bắt buộc lý do.
--
-- Chạy lại được.
-- ============================================================================

-- 2. Cột mới của báo giá ---------------------------------------------------------------------------

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2),
  ADD COLUMN IF NOT EXISTS vat_included boolean,
  ADD COLUMN IF NOT EXISTS subtotal_value bigint,
  ADD COLUMN IF NOT EXISTS vat_amount bigint,
  ADD COLUMN IF NOT EXISTS line_items_based boolean NOT NULL DEFAULT false;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_vat_rate_range;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_vat_rate_range
  CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_vat_included_set;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_vat_included_set
  CHECK (vat_rate IS NULL OR vat_included IS NOT NULL);

COMMENT ON COLUMN public.quotes.vat_rate IS
  'Thuế suất GTGT (%) của báo giá (0239). Rỗng = không ghi thuế — văn bản không tách / cộng thuế.';
COMMENT ON COLUMN public.quotes.vat_included IS
  'true = đơn giá ĐÃ GỒM thuế (tổng = sau giảm giá, tách thuế ra để in); false = CHƯA GỒM (tổng = sau giảm giá + thuế).';
COMMENT ON COLUMN public.quotes.subtotal_value IS 'Tổng thành tiền các hạng mục (đồng) — CSDL tính (0239).';
COMMENT ON COLUMN public.quotes.vat_amount IS 'Tiền thuế GTGT (đồng) — CSDL tính (0239). Rỗng khi không ghi thuế suất.';
COMMENT ON COLUMN public.quotes.line_items_based IS
  'Báo giá lập bằng bảng hạng mục (0239): total_value do CSDL tính từ hạng mục. false = báo giá cũ, giữ tổng đã lưu.';

-- Tổng tiền: hàm thuần, cùng phép tính với `computeQuoteTotals` (shared/src/quote-items.ts).
-- Làm tròn nửa lên tới đồng. Tách thuế (đã gồm) cùng công thức `splitVat` (hd-template.ts).
CREATE OR REPLACE FUNCTION public.quote_totals(
  p_subtotal bigint,
  p_discount bigint,
  p_vat_rate numeric,
  p_vat_included boolean,
  OUT net_value bigint,
  OUT vat_value bigint,
  OUT total_value bigint
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_basis numeric;
  v_before numeric;
BEGIN
  net_value := COALESCE(p_subtotal, 0) - COALESCE(p_discount, 0);
  IF p_vat_rate IS NULL THEN
    vat_value := NULL;
    total_value := net_value;
  ELSE
    v_basis := round(p_vat_rate * 100);
    IF COALESCE(p_vat_included, false) THEN
      v_before := floor((net_value::numeric * 20000 + (10000 + v_basis)) / (2 * (10000 + v_basis)));
      vat_value := net_value - v_before::bigint;
      total_value := net_value;
    ELSE
      vat_value := floor((net_value::numeric * v_basis * 2 + 10000) / 20000)::bigint;
      total_value := net_value + vat_value;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.quote_totals(bigint, bigint, numeric, boolean) IS
  'Tổng báo giá từ tổng hạng mục, giảm giá, thuế suất, đã gồm / chưa gồm thuế (0239). Gương: computeQuoteTotals.';

-- 1. Hạng mục --------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quote_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  position    integer NOT NULL DEFAULT 0,
  description text NOT NULL CHECK (btrim(description) <> '' AND char_length(description) <= 2000),
  unit        text CHECK (unit IS NULL OR char_length(unit) <= 40),
  quantity    numeric(18, 4) NOT NULL CHECK (quantity >= 0),
  unit_price  bigint NOT NULL CHECK (unit_price >= 0),
  amount      bigint GENERATED ALWAYS AS (round(quantity * unit_price)::bigint) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON public.quote_items (quote_id, position);

COMMENT ON TABLE public.quote_items IS
  'Hạng mục của một phiên bản báo giá (0239). Thành tiền = khối lượng × đơn giá, làm tròn tới đồng. Khoá khi báo giá rời Nháp.';

-- Khoá sau khi rời Nháp + đặt pháp nhân / người ghi. Xoá theo dây chuyền khi xoá hẳn báo giá (dọn dữ liệu thử)
-- vẫn đi qua: lệnh xoá ấy đến từ trigger khoá ngoại (độ sâu > 1), không phải từ người dùng.
CREATE OR REPLACE FUNCTION public.quote_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.quote_id ELSE NEW.quote_id END;
  q record;
BEGIN
  SELECT id, company_id, status, sent_to_customer_at, deleted_at
    INTO q FROM public.quotes WHERE id = v_quote_id;

  IF TG_OP = 'DELETE' AND (q.id IS NULL OR pg_trigger_depth() > 1) THEN
    RETURN OLD;
  END IF;
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá của hạng mục.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    RAISE EXCEPTION 'Không chuyển được hạng mục sang báo giá khác.';
  END IF;
  IF q.status <> 'draft' OR q.sent_to_customer_at IS NOT NULL OR q.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá đã gửi phê duyệt nên hạng mục không sửa được. Lập phiên bản mới nếu cần đổi giá.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.company_id := q.company_id;
  NEW.description := btrim(NEW.description);
  NEW.unit := NULLIF(btrim(NEW.unit), '');
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_items_guard ON public.quote_items;
CREATE TRIGGER quote_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.quote_items_guard();

-- Đổi hạng mục → báo giá tính lại tổng (trigger `quotes_sync_totals` làm phép tính).
CREATE OR REPLACE FUNCTION public.quote_items_touch_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quotes
     SET line_items_based = true
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.quote_id ELSE NEW.quote_id END
     AND deleted_at IS NULL
     AND status = 'draft';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quote_items_touch_quote ON public.quote_items;
CREATE TRIGGER quote_items_touch_quote
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.quote_items_touch_quote();

CREATE OR REPLACE FUNCTION public.quotes_sync_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal bigint;
  t record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.line_items_based THEN
    NEW.line_items_based := true;
  END IF;
  IF NOT NEW.line_items_based THEN
    NEW.subtotal_value := NULL;
    NEW.vat_amount := NULL;
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_subtotal FROM public.quote_items WHERE quote_id = NEW.id;
  t := public.quote_totals(v_subtotal, NEW.discount_amount, NEW.vat_rate, NEW.vat_included);
  NEW.subtotal_value := v_subtotal;
  NEW.vat_amount := t.vat_value;
  NEW.total_value := t.total_value;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_sync_totals ON public.quotes;
CREATE TRIGGER quotes_sync_totals
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_sync_totals();

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_items TO authenticated;

DROP POLICY IF EXISTS quote_items_select ON public.quote_items;
CREATE POLICY quote_items_select ON public.quote_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id));

DROP POLICY IF EXISTS quote_items_insert ON public.quote_items;
CREATE POLICY quote_items_insert ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q
                       WHERE q.id = quote_items.quote_id
                         AND public.rls_quote_writable(q.opportunity_id)));

DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_update ON public.quote_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q
                  WHERE q.id = quote_items.quote_id
                    AND public.rls_quote_writable(q.opportunity_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q
                       WHERE q.id = quote_items.quote_id
                         AND public.rls_quote_writable(q.opportunity_id)));

DROP POLICY IF EXISTS quote_items_delete ON public.quote_items;
CREATE POLICY quote_items_delete ON public.quote_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q
                  WHERE q.id = quote_items.quote_id
                    AND public.rls_quote_writable(q.opportunity_id)));

-- 3. Lập phiên bản kèm hạng mục --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_quote_version(
  p_opportunity_id uuid,
  p_company_id uuid,
  p_items jsonb,
  p_discount_amount bigint DEFAULT NULL,
  p_discount_reason text DEFAULT NULL,
  p_vat_rate numeric DEFAULT NULL,
  p_vat_included boolean DEFAULT NULL,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_item jsonb;
  v_pos integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Vui lòng thêm ít nhất một hạng mục cho báo giá.';
  END IF;

  INSERT INTO public.quotes (opportunity_id, company_id, discount_amount, discount_reason,
                             vat_rate, vat_included, valid_until, notes, line_items_based)
  VALUES (p_opportunity_id, p_company_id, NULLIF(p_discount_amount, 0),
          CASE WHEN COALESCE(p_discount_amount, 0) > 0 THEN NULLIF(btrim(p_discount_reason), '') END,
          p_vat_rate, CASE WHEN p_vat_rate IS NULL THEN NULL ELSE COALESCE(p_vat_included, false) END,
          p_valid_until, NULLIF(btrim(p_notes), ''), true)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.quote_items (quote_id, company_id, position, description, unit, quantity, unit_price)
    VALUES (v_id, p_company_id, v_pos, v_item ->> 'description', v_item ->> 'unit',
            (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::bigint);
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text) IS
  'Lập phiên bản báo giá kèm hạng mục trong một giao dịch (0239). INVOKER — RLS của quotes / quote_items quyết.';

REVOKE ALL ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text)
  TO authenticated;

-- 4. Gửi phê duyệt — chép 0031, thêm hai kiểm tra cho báo giá có hạng mục -------------------------

CREATE OR REPLACE FUNCTION public.request_quote_approval(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội và quản lý trực tiếp mới gửi được báo giá này đi phê duyệt.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã gửi khách hàng. Tạo phiên bản mới nếu cần thay đổi giá.';
  END IF;

  IF q.status = 'pending_approval' THEN
    RAISE EXCEPTION 'Báo giá này đang chờ phê duyệt.';
  END IF;

  IF q.status = 'completed' THEN
    RAISE EXCEPTION 'Báo giá này đã được phê duyệt.';
  END IF;

  -- 0239: báo giá lập bằng hạng mục — phải có hạng mục, giảm giá không quá tổng hạng mục.
  IF q.line_items_based THEN
    IF NOT EXISTS (SELECT 1 FROM public.quote_items i WHERE i.quote_id = q.id) THEN
      RAISE EXCEPTION 'Vui lòng thêm ít nhất một hạng mục trước khi gửi phê duyệt.';
    END IF;
    IF COALESCE(q.discount_amount, 0) > COALESCE(q.subtotal_value, 0) THEN
      RAISE EXCEPTION 'Mức giảm giá không được lớn hơn tổng các hạng mục.';
    END IF;
  END IF;

  IF q.total_value IS NULL OR q.total_value <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị báo giá trước khi gửi phê duyệt.';
  END IF;

  -- CRM-05: giảm giá phải có căn cứ, vì đây chính là thứ Tổng Giám đốc cần để quyết định.
  IF COALESCE(q.discount_amount, 0) > 0
     AND (q.discount_reason IS NULL OR btrim(q.discount_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do giảm giá trước khi gửi phê duyệt.';
  END IF;

  IF COALESCE(q.discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Mức giảm giá không được là số âm.';
  END IF;

  IF COALESCE(q.discount_amount, 0) > q.total_value THEN
    RAISE EXCEPTION 'Mức giảm giá không được lớn hơn giá trị báo giá.';
  END IF;

  UPDATE public.quotes
     SET status = 'pending_approval', updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

-- 5. Mẫu Word báo giá ------------------------------------------------------------------------------

ALTER TABLE public.contract_templates DROP CONSTRAINT IF EXISTS contract_templates_document_kind_check;
ALTER TABLE public.contract_templates
  ADD CONSTRAINT contract_templates_document_kind_check
  CHECK (document_kind IN ('hop_dong', 'phu_luc', 'thanh_ly', 'ho_so_du_thau', 'thuong_thao', 'bao_gia'));

COMMENT ON COLUMN public.contract_templates.document_kind IS
  'hop_dong: mẫu hợp đồng chính · phu_luc: phụ lục hợp đồng · thanh_ly: biên bản thanh lý (0229) · '
  'ho_so_du_thau: bộ biểu mẫu hồ sơ dự thầu · thuong_thao: biên bản thương thảo hợp đồng sau trúng thầu (0236) · '
  'bao_gia: văn bản báo giá gửi khách (0239).';

DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
CREATE POLICY contract_templates_select ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('HD')
      OR (public.is_bid_form_kind(document_kind) AND public.auth_can_view_module('DA'))
      OR (document_kind = 'bao_gia' AND public.auth_can_view_module('CRM'))
    )
  );

DROP POLICY IF EXISTS quote_templates_files_select ON storage.objects;
CREATE POLICY quote_templates_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-templates'
    AND public.auth_can_view_module('CRM')
    AND EXISTS (
      SELECT 1 FROM public.contract_templates t
       WHERE t.storage_path = storage.objects.name
         AND t.document_kind = 'bao_gia'
         AND public.rls_company_access(t.company_id)
    )
  );

-- 6. Mẫu lời nhắn ----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_can_manage_message_templates(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company_id IS NOT NULL
     AND public.rls_company_access(p_company_id)
     AND NOT public.auth_is_read_only()
     AND public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN');
$$;

COMMENT ON FUNCTION public.auth_can_manage_message_templates(uuid) IS
  'Sửa mẫu lời nhắn Zalo / email của một pháp nhân: Ban Giám đốc hoặc Quản trị (0239).';

REVOKE ALL ON FUNCTION public.auth_can_manage_message_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_message_templates(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  subject_kind text NOT NULL DEFAULT 'bao_gia' CHECK (subject_kind IN ('bao_gia')),
  channel      text NOT NULL CHECK (channel IN ('zalo', 'email')),
  email_subject text CHECK (email_subject IS NULL OR char_length(email_subject) <= 300),
  body         text NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 8000),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT message_templates_one UNIQUE (company_id, subject_kind, channel),
  CONSTRAINT message_templates_email_subject CHECK (channel <> 'email' OR btrim(COALESCE(email_subject, '')) <> '')
);

COMMENT ON TABLE public.message_templates IS
  'Mẫu lời nhắn gửi khách theo pháp nhân × hồ sơ × kênh (0239). Chưa có dòng = mẫu mặc định của hệ thống.';

CREATE OR REPLACE FUNCTION public.message_templates_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id
                           OR NEW.channel IS DISTINCT FROM OLD.channel
                           OR NEW.subject_kind IS DISTINCT FROM OLD.subject_kind) THEN
    RAISE EXCEPTION 'Không đổi được pháp nhân hay kênh của một mẫu lời nhắn.';
  END IF;
  IF NEW.channel = 'zalo' THEN
    NEW.email_subject := NULL;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := public.auth_user_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_templates_stamp ON public.message_templates;
CREATE TRIGGER message_templates_stamp
  BEFORE INSERT OR UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.message_templates_stamp();

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.message_templates TO authenticated;

DROP POLICY IF EXISTS message_templates_select ON public.message_templates;
CREATE POLICY message_templates_select ON public.message_templates
  FOR SELECT TO authenticated
  USING (public.rls_company_access(company_id));

DROP POLICY IF EXISTS message_templates_insert ON public.message_templates;
CREATE POLICY message_templates_insert ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_manage_message_templates(company_id));

DROP POLICY IF EXISTS message_templates_update ON public.message_templates;
CREATE POLICY message_templates_update ON public.message_templates
  FOR UPDATE TO authenticated
  USING (public.auth_can_manage_message_templates(company_id))
  WITH CHECK (public.auth_can_manage_message_templates(company_id));

-- 7. Gửi email do hệ thống gửi -----------------------------------------------------------------------

ALTER TABLE public.outbound_shares
  ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_id text CHECK (external_id IS NULL OR char_length(external_id) <= 128);

ALTER TABLE public.outbound_shares DROP CONSTRAINT IF EXISTS outbound_shares_via_check;
ALTER TABLE public.outbound_shares
  ADD CONSTRAINT outbound_shares_via_check CHECK (via IN ('bang_chia_se', 'zalo_web', 'he_thong'));

COMMENT ON COLUMN public.outbound_shares.simulated IS
  'Email giả lập (0239): chưa có khoá Resend hoặc EMAIL_FAKE=1 — không có thư nào đi thật.';
COMMENT ON COLUMN public.outbound_shares.external_id IS 'Mã thư của nhà cung cấp email (Resend) — 0239.';

-- Trình duyệt chỉ ghi được lần mở Zalo; dòng email do Worker ghi bằng service_role sau khi đã gửi.
DROP POLICY IF EXISTS outbound_shares_insert ON public.outbound_shares;
CREATE POLICY outbound_shares_insert ON public.outbound_shares
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.auth_user_id()
              AND channel = 'zalo'
              AND NOT simulated
              AND via IS DISTINCT FROM 'he_thong'
              AND public.rls_outbound_share_writable(entity_type, entity_id));

-- 8. Câu chữ sửa trên văn bản báo giá (anh Dũng 29/10/2026, bổ sung) ------------------------------
--
-- Người chịu trách nhiệm cơ hội sửa CÂU CHỮ ngay trên bản xem trước: lời giới thiệu, phạm vi và điều kiện, điều
-- kiện thanh toán, thời gian thực hiện, lời kết, người ký và chức vụ. KHÔNG sửa số: hạng mục, đơn giá, giảm giá,
-- thuế, tổng là số đã duyệt (hạng mục khoá ở mục 1). Câu chữ sửa được cả sau khi duyệt — không phải giá — nên mỗi
-- lần đổi ghi một dòng `quote_text_changes` (ai, ô nào, trước / sau, lúc nào). Chỉ chữ thuần: CSDL nhận chuỗi,
-- không nhận khoá lạ; bộ điền Word và bản PDF in như chữ, không có đường chèn mã.
--
-- `quote_documents`: bản Word «đã sửa trong Word» tải lên cho báo giá ĐÃ DUYỆT — bất biến, đánh số bản, bắt buộc lý
-- do; tệp ở kho riêng `quote-documents/<báo giá>/…`. Có bản này thì gửi khách dùng đúng tệp ấy.

CREATE OR REPLACE FUNCTION public.quote_text_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['gioi_thieu', 'dieu_kien', 'dieu_khoan_thanh_toan', 'thoi_gian_thuc_hien',
               'ghi_chu_cuoi', 'nguoi_ky', 'chuc_vu_ky'];
$$;

COMMENT ON FUNCTION public.quote_text_keys() IS
  'Các ô câu chữ sửa được trên văn bản báo giá (0239) — gương: QUOTE_TEXT_KEYS ở shared/src/quote-items.ts.';

CREATE TABLE IF NOT EXISTS public.quote_texts (
  quote_id   uuid PRIMARY KEY REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  texts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.quote_texts IS
  'Câu chữ đã sửa trên văn bản báo giá (0239): khoá trong quote_text_keys(), giá trị là chữ thuần. Thiếu khoá = câu mặc định.';

CREATE TABLE IF NOT EXISTS public.quote_text_changes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id   uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  field      text NOT NULL,
  old_value  text,
  new_value  text,
  changed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_text_changes_quote_idx
  ON public.quote_text_changes (quote_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.quote_texts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_val jsonb;
  v_text text;
  v_clean jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.texts) <> 'object' THEN
    RAISE EXCEPTION 'Câu chữ báo giá phải là danh sách ô chữ.';
  END IF;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(NEW.texts) LOOP
    IF NOT v_key = ANY (public.quote_text_keys()) THEN
      RAISE EXCEPTION 'Ô «%» không sửa được trên văn bản báo giá. Số tiền và hạng mục theo báo giá đã duyệt.', v_key;
    END IF;
    IF jsonb_typeof(v_val) <> 'string' THEN
      RAISE EXCEPTION 'Ô «%» chỉ nhận chữ.', v_key;
    END IF;
    -- Bỏ ký tự điều khiển (giữ xuống dòng, tab); ô rỗng = quay về câu mặc định.
    v_text := btrim(regexp_replace(v_val #>> '{}', '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
    IF char_length(v_text) > 4000 THEN
      RAISE EXCEPTION 'Ô «%» dài quá 4.000 ký tự.', v_key;
    END IF;
    IF v_text <> '' THEN
      v_clean := v_clean || jsonb_build_object(v_key, v_text);
    END IF;
  END LOOP;
  NEW.texts := v_clean;
  IF TG_OP = 'UPDATE' AND NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    RAISE EXCEPTION 'Không chuyển được câu chữ sang báo giá khác.';
  END IF;
  SELECT q.company_id INTO NEW.company_id FROM public.quotes q WHERE q.id = NEW.quote_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_texts_guard ON public.quote_texts;
CREATE TRIGGER quote_texts_guard
  BEFORE INSERT OR UPDATE ON public.quote_texts
  FOR EACH ROW EXECUTE FUNCTION public.quote_texts_guard();

CREATE OR REPLACE FUNCTION public.quote_texts_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN OLD.texts ELSE '{}'::jsonb END;
BEGIN
  FOREACH v_key IN ARRAY public.quote_text_keys() LOOP
    IF (v_old ->> v_key) IS DISTINCT FROM (NEW.texts ->> v_key) THEN
      INSERT INTO public.quote_text_changes (quote_id, company_id, field, old_value, new_value, changed_by)
      VALUES (NEW.quote_id, NEW.company_id, v_key, v_old ->> v_key, NEW.texts ->> v_key, NEW.updated_by);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quote_texts_history ON public.quote_texts;
CREATE TRIGGER quote_texts_history
  AFTER INSERT OR UPDATE ON public.quote_texts
  FOR EACH ROW EXECUTE FUNCTION public.quote_texts_history();

-- Báo giá đọc được — chính sách `quotes_select` của người gọi quyết (INVOKER), không chép điều kiện.
CREATE OR REPLACE FUNCTION public.rls_quote_readable(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = p_quote_id);
$$;
GRANT EXECUTE ON FUNCTION public.rls_quote_readable(uuid) TO authenticated;

ALTER TABLE public.quote_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_texts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quote_texts TO authenticated;

DROP POLICY IF EXISTS quote_texts_select ON public.quote_texts;
CREATE POLICY quote_texts_select ON public.quote_texts
  FOR SELECT TO authenticated
  USING (public.rls_quote_readable(quote_id));

-- Sửa câu chữ: người được sửa báo giá (Mẫu B của cơ hội), chỉ phiên bản đang hiệu lực.
DROP POLICY IF EXISTS quote_texts_insert ON public.quote_texts;
CREATE POLICY quote_texts_insert ON public.quote_texts
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.auth_is_read_only() AND EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_texts.quote_id AND q.is_current_version
       AND public.rls_quote_writable(q.opportunity_id)));

DROP POLICY IF EXISTS quote_texts_update ON public.quote_texts;
CREATE POLICY quote_texts_update ON public.quote_texts
  FOR UPDATE TO authenticated
  USING (NOT public.auth_is_read_only() AND EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_texts.quote_id AND q.is_current_version
       AND public.rls_quote_writable(q.opportunity_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_texts.quote_id AND q.is_current_version
       AND public.rls_quote_writable(q.opportunity_id)));

ALTER TABLE public.quote_text_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_text_changes FROM anon, authenticated;
GRANT SELECT ON public.quote_text_changes TO authenticated;

DROP POLICY IF EXISTS quote_text_changes_select ON public.quote_text_changes;
CREATE POLICY quote_text_changes_select ON public.quote_text_changes
  FOR SELECT TO authenticated
  USING (public.rls_quote_readable(quote_id));

-- Bản Word sửa tay --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quote_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id     uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  version      integer NOT NULL,
  storage_path text NOT NULL,
  file_name    text NOT NULL CHECK (char_length(file_name) <= 255),
  reason       text NOT NULL CHECK (btrim(reason) <> '' AND char_length(reason) <= 1000),
  created_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_documents_version UNIQUE (quote_id, version),
  CONSTRAINT quote_documents_path CHECK (left(storage_path, 37) = quote_id::text || '/')
);

COMMENT ON TABLE public.quote_documents IS
  'Bản Word báo giá đã sửa trong Word, tải lên sau khi duyệt (0239). Bất biến; bản mới nhất là bản gửi khách.';

CREATE OR REPLACE FUNCTION public.quote_documents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT q.company_id INTO NEW.company_id FROM public.quotes q WHERE q.id = NEW.quote_id;
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('quote_documents:' || NEW.quote_id::text));
  SELECT COALESCE(max(d.version), 0) + 1 INTO NEW.version
    FROM public.quote_documents d WHERE d.quote_id = NEW.quote_id;
  NEW.reason := btrim(NEW.reason);
  IF public.auth_user_id() IS NOT NULL THEN
    NEW.created_by := public.auth_user_id();
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_documents_before_insert ON public.quote_documents;
CREATE TRIGGER quote_documents_before_insert
  BEFORE INSERT ON public.quote_documents
  FOR EACH ROW EXECUTE FUNCTION public.quote_documents_before_insert();

ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_documents FROM anon, authenticated;
GRANT SELECT, INSERT ON public.quote_documents TO authenticated;

DROP POLICY IF EXISTS quote_documents_select ON public.quote_documents;
CREATE POLICY quote_documents_select ON public.quote_documents
  FOR SELECT TO authenticated
  USING (public.rls_quote_readable(quote_id));

-- Tải lên: đúng người gửi được báo giá cho khách (đã duyệt, đang hiệu lực) — cùng hàm của lịch sử gửi.
DROP POLICY IF EXISTS quote_documents_insert ON public.quote_documents;
CREATE POLICY quote_documents_insert ON public.quote_documents
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.auth_user_id()
              AND public.rls_outbound_share_writable('quotes', quote_id)
              AND EXISTS (SELECT 1 FROM public.quotes q
                           WHERE q.id = quote_documents.quote_id AND q.is_current_version));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quote-documents', 'quote-documents', false, 20971520,
        ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS quote_documents_files_select ON storage.objects;
CREATE POLICY quote_documents_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quote-documents'
         AND public.rls_quote_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS quote_documents_files_insert ON storage.objects;
CREATE POLICY quote_documents_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-documents'
              AND public.rls_outbound_share_writable('quotes',
                    public.try_uuid((storage.foldername(name))[1])));
