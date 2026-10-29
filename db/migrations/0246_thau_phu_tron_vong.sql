-- ============================================================================
-- G2 (A4 + T5, doc/KE_HOACH_KHOP_KHAO_SAT_ANH_THI.md): nhà thầu phụ / tổ đội trọn vòng.
--
-- Phiếu khảo sát (doc/khao-sat/HoSo_KhaoSat_NVG_full.md): «không thanh toán theo lời nói / tin nhắn»;
-- chọn thầu phụ cần so sánh, nguồn ngân sách và duyệt theo hạn mức; tổ đội được trả theo khối lượng
-- ĐÃ NGHIỆM THU × đơn giá hợp đồng; phần chưa nghiệm thu / kém chất lượng không trả.
--
--   1. Chọn thầu phụ (`subcontract_selections` + `subcontract_offers`): một gói việc của công trình,
--      2–3 báo giá (một báo giá được, nhưng phải ghi lý do), người chọn — máy không gợi ý. Gửi duyệt
--      → hộp Phê duyệt loại `subcontractor_selection` (hạn mức ở `approval_limits`, mặc định ở seed:
--      Thi công → Ban Giám đốc → Tổng Giám đốc). Duyệt xong thì tạo / cập nhật dòng `subcontractors`;
--      khoán gọn tự có một dòng giá trị trọn gói.
--   2. Hợp đồng khoán: `create_subcontract_contract` — hợp đồng loại `khoan_thau_phu`, không có hồ sơ
--      nguồn (`source_type` rỗng, `scope_kind` rỗng — `contracts_one_per_kind` của 0243 không đụng),
--      bên nhận = tổ đội. `create_contract_from_source` chỉ nhận cơ hội / gói thầu / thiết kế nên không
--      sửa. Người soạn là người có quyền tạo hợp đồng (Thi công không xem phân hệ Hợp đồng):
--      `subcontractors_awaiting_contract` liệt kê tổ đội đã duyệt chưa có hợp đồng.
--   3. Bảng đơn giá (`subcontract_lines`): hạng mục, đơn vị, khối lượng hợp đồng, đơn giá. Khoán gọn =
--      một dòng khối lượng 1 (kỳ này ghi tỷ lệ hoàn thành, 0,3 = 30 %). Tỷ lệ giữ lại bảo hành
--      `subcontractors.retention_rate` — tùy chọn, rỗng = không giữ.
--   4. Đợt xác nhận khối lượng (`subcontract_periods` + `subcontract_period_lines`): chỉ huy trưởng lập;
--      mỗi dòng kỳ này phải có căn cứ — biên bản nghiệm thu đã ký hai bên hoặc mốc thi công đã đạt; không
--      có thì máy LOẠI dòng đó kèm lý do. Tổ trưởng ký (hai chữ ký trên điện thoại hoặc bản giấy quét,
--      khuôn 0145 / 0192) → Trưởng phòng Thi công xác nhận kèm đánh giá chất lượng / an toàn của ĐỢT.
--      Lúc ký máy chụp đơn giá và tỷ lệ giữ lại (`retention_rate_applied`) — đổi tỷ lệ sau không hồi
--      tố. Đã xác nhận thì bất biến.
--   5. Cổng thanh toán (`payment_requests_subcontract_gate`): đề nghị thanh toán cho tổ đội / thầu phụ
--      (gắn tổ đội, hoặc gắn hợp đồng `khoan_thau_phu`) PHẢI gắn đợt đã xác nhận hoặc biên bản nghiệm
--      thu tổ đội đã ký; số tiền không vượt phần còn lại của đợt / biên bản. Thanh toán nhà cung cấp
--      giữ nguyên luật cũ. `create_payment_request_from_period` lập sẵn đề nghị + dòng phân bổ.
--   6. Sổ theo dõi mỗi tổ (`subcontractor_ledger`) và chuỗi hồ sơ (`record_chain`, bản 0243 + đề nghị
--      thanh toán → đợt → tổ đội → hợp đồng khoán → công trình).
--   7. `decide_approval`: chép NGUYÊN VĂN bản 0245, thêm nhánh `subcontract_selections`.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'subcontractor_selection';

-- ----------------------------------------------------------------------------
-- 1. Cột mới của tổ đội
-- ----------------------------------------------------------------------------
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS pricing_method varchar(16) NOT NULL DEFAULT 'don_gia',
  ADD COLUMN IF NOT EXISTS retention_rate numeric(5, 2),
  ADD COLUMN IF NOT EXISTS cost_code      varchar(64),
  ADD COLUMN IF NOT EXISTS selection_id   uuid;

ALTER TABLE public.subcontractors DROP CONSTRAINT IF EXISTS subcontractors_pricing_method_check;
ALTER TABLE public.subcontractors ADD CONSTRAINT subcontractors_pricing_method_check
  CHECK (pricing_method IN ('don_gia', 'khoan_gon'));
ALTER TABLE public.subcontractors DROP CONSTRAINT IF EXISTS subcontractors_retention_rate_check;
ALTER TABLE public.subcontractors ADD CONSTRAINT subcontractors_retention_rate_check
  CHECK (retention_rate IS NULL OR (retention_rate >= 0 AND retention_rate < 100));

COMMENT ON COLUMN public.subcontractors.pricing_method IS
  'Cách khoán (G2, 0246): don_gia = bảng đơn giá theo hạng mục; khoan_gon = một dòng trọn gói. Chọn theo từng tổ đội (anh Dũng).';
COMMENT ON COLUMN public.subcontractors.retention_rate IS
  'Tỷ lệ giữ lại bảo hành (%) — tùy chọn, rỗng = không giữ (anh Dũng). Đợt xác nhận chụp tỷ lệ lúc ký (retention_rate_applied), đổi sau không hồi tố.';
COMMENT ON COLUMN public.subcontractors.cost_code IS
  'Dòng ngân sách công trình chi trả cho tổ đội (nguồn ngân sách khi chọn thầu phụ) — dòng phân bổ của đề nghị thanh toán lấy từ đây.';

-- ----------------------------------------------------------------------------
-- 2. Chọn thầu phụ: gói việc + các báo giá
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_selections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  code                 varchar(40),
  work_package         text NOT NULL,
  scope_of_work        text,
  cost_code            varchar(64),
  -- Đặt sẵn khi chọn lại cho một tổ đội đã có; duyệt xong thì là tổ đội được tạo / cập nhật.
  subcontractor_id     uuid REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  status               varchar(16) NOT NULL DEFAULT 'nhap'
                       CHECK (status IN ('nhap', 'cho_duyet', 'da_duyet', 'tu_choi')),
  selected_offer_id    uuid,
  selection_reason     text,
  single_offer_reason  text,
  budget_remaining_at_submit bigint,
  approval_id          uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  submitted_at         timestamptz,
  submitted_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  decision_note        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS subcontract_selections_site_idx
  ON public.subcontract_selections (construction_site_id, status);

CREATE TABLE IF NOT EXISTS public.subcontract_offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  selection_id    uuid NOT NULL REFERENCES public.subcontract_selections(id) ON DELETE CASCADE,
  crew_name       varchar(255) NOT NULL,
  contact_name    varchar(128),
  contact_phone   varchar(32),
  pricing_method  varchar(16) NOT NULL DEFAULT 'don_gia' CHECK (pricing_method IN ('don_gia', 'khoan_gon')),
  offered_value   bigint NOT NULL CHECK (offered_value > 0),
  retention_rate  numeric(5, 2) CHECK (retention_rate IS NULL OR (retention_rate >= 0 AND retention_rate < 100)),
  duration_days   integer CHECK (duration_days IS NULL OR duration_days > 0),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS subcontract_offers_selection_idx ON public.subcontract_offers (selection_id);

ALTER TABLE public.subcontract_selections DROP CONSTRAINT IF EXISTS subcontract_selections_offer_fk;
ALTER TABLE public.subcontract_selections ADD CONSTRAINT subcontract_selections_offer_fk
  FOREIGN KEY (selected_offer_id) REFERENCES public.subcontract_offers(id) ON DELETE SET NULL;
ALTER TABLE public.subcontractors DROP CONSTRAINT IF EXISTS subcontractors_selection_fk;
ALTER TABLE public.subcontractors ADD CONSTRAINT subcontractors_selection_fk
  FOREIGN KEY (selection_id) REFERENCES public.subcontract_selections(id) ON DELETE SET NULL;

COMMENT ON TABLE public.subcontract_selections IS
  'Chọn thầu phụ / tổ đội cho một gói việc của công trình (G2, 0246): so 2–3 báo giá, người chọn, gửi duyệt theo hạn mức (subcontractor_selection). Một báo giá phải ghi lý do.';
COMMENT ON TABLE public.subcontract_offers IS
  'Báo giá của một tổ đội / thầu phụ cho gói việc — tên, cách khoán, giá trị, tỷ lệ giữ lại bảo hành đề xuất.';

-- ----------------------------------------------------------------------------
-- 3. Bảng đơn giá của tổ đội
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  subcontractor_id     uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  position             integer NOT NULL DEFAULT 0,
  item                 text NOT NULL,
  unit                 varchar(32) NOT NULL,
  contract_quantity    numeric(18, 3) NOT NULL CHECK (contract_quantity > 0),
  unit_price           bigint NOT NULL CHECK (unit_price >= 0),
  amount               bigint GENERATED ALWAYS AS (round(contract_quantity * unit_price)::bigint) STORED,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS subcontract_lines_sub_idx ON public.subcontract_lines (subcontractor_id, position);
COMMENT ON TABLE public.subcontract_lines IS
  'Bảng đơn giá khoán của tổ đội (G2, 0246): hạng mục × khối lượng hợp đồng × đơn giá (đồng). Khoán gọn: một dòng, khối lượng 1.';

-- ----------------------------------------------------------------------------
-- 4. Đợt xác nhận khối lượng
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_periods (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id   uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  subcontractor_id       uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  period_no              integer NOT NULL,
  code                   varchar(40),
  period_start           date,
  period_end             date NOT NULL DEFAULT current_date,
  status                 varchar(16) NOT NULL DEFAULT 'nhap'
                         CHECK (status IN ('nhap', 'cho_xac_nhan', 'da_xac_nhan')),
  notes                  text,
  prepared_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  crew_signer_name       varchar(128),
  crew_signer_title      varchar(128),
  crew_signature_path    text,
  nvg_signature_path     text,
  paper_scan_path        text,
  signed_at              timestamptz,
  signed_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at           timestamptz,
  confirmed_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  return_note            text,
  quality_rating         smallint CHECK (quality_rating BETWEEN 1 AND 5),
  safety_rating          smallint CHECK (safety_rating BETWEEN 1 AND 5),
  evaluation_notes       text,
  gross_amount           bigint,
  retention_rate_applied numeric(5, 2),
  retention_amount       bigint,
  net_amount             bigint,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at             timestamptz,
  CONSTRAINT subcontract_periods_no_unique UNIQUE (subcontractor_id, period_no),
  CONSTRAINT subcontract_periods_dates CHECK (period_start IS NULL OR period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS subcontract_periods_site_idx ON public.subcontract_periods (construction_site_id, status);

CREATE TABLE IF NOT EXISTS public.subcontract_period_lines (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id            uuid NOT NULL REFERENCES public.subcontract_periods(id) ON DELETE CASCADE,
  line_id              uuid NOT NULL REFERENCES public.subcontract_lines(id) ON DELETE CASCADE,
  quantity             numeric(18, 3) NOT NULL CHECK (quantity >= 0),
  unit_price_applied   bigint,
  amount               bigint,
  acceptance_record_id uuid REFERENCES public.acceptance_records(id) ON DELETE CASCADE,
  site_milestone_id    uuid REFERENCES public.site_milestones(id) ON DELETE CASCADE,
  excluded             boolean NOT NULL DEFAULT false,
  exclusion_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT subcontract_period_lines_unique UNIQUE (period_id, line_id),
  CONSTRAINT subcontract_period_lines_reason CHECK (NOT excluded OR NULLIF(btrim(exclusion_reason), '') IS NOT NULL)
);
-- Xoá công trình kéo theo cả bảng đơn giá lẫn biên bản: dòng đợt đi theo (chạy lại tệp thì đặt lại khoá).
ALTER TABLE public.subcontract_period_lines
  DROP CONSTRAINT IF EXISTS subcontract_period_lines_line_id_fkey,
  DROP CONSTRAINT IF EXISTS subcontract_period_lines_acceptance_record_id_fkey,
  DROP CONSTRAINT IF EXISTS subcontract_period_lines_site_milestone_id_fkey;
ALTER TABLE public.subcontract_period_lines
  ADD CONSTRAINT subcontract_period_lines_line_id_fkey
    FOREIGN KEY (line_id) REFERENCES public.subcontract_lines(id) ON DELETE CASCADE,
  ADD CONSTRAINT subcontract_period_lines_acceptance_record_id_fkey
    FOREIGN KEY (acceptance_record_id) REFERENCES public.acceptance_records(id) ON DELETE CASCADE,
  ADD CONSTRAINT subcontract_period_lines_site_milestone_id_fkey
    FOREIGN KEY (site_milestone_id) REFERENCES public.site_milestones(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS subcontract_period_lines_line_idx ON public.subcontract_period_lines (line_id);
CREATE INDEX IF NOT EXISTS subcontract_period_lines_acceptance_idx ON public.subcontract_period_lines (acceptance_record_id);

COMMENT ON TABLE public.subcontract_periods IS
  'Đợt xác nhận khối lượng tổ đội (T5, 0246): chỉ huy trưởng lập → tổ trưởng ký → Trưởng phòng Thi công xác nhận. Số tiền chụp lúc ký (đơn giá, tỷ lệ giữ lại). Đã xác nhận thì bất biến.';
COMMENT ON COLUMN public.subcontract_periods.retention_rate_applied IS
  'Tỷ lệ giữ lại bảo hành ĐÃ ÁP cho đợt (chụp từ subcontractors.retention_rate lúc tổ trưởng ký) — đổi tỷ lệ sau không hồi tố.';
COMMENT ON TABLE public.subcontract_period_lines IS
  'Khối lượng kỳ này của từng hạng mục. Chỉ tính khi có căn cứ: biên bản nghiệm thu đã ký hai bên hoặc mốc thi công đã đạt — không có thì máy loại dòng kèm lý do (amount = 0).';

-- ----------------------------------------------------------------------------
-- 5. Cột căn cứ trên đề nghị thanh toán
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS subcontractor_id      uuid REFERENCES public.subcontractors(id),
  ADD COLUMN IF NOT EXISTS subcontract_period_id uuid REFERENCES public.subcontract_periods(id),
  ADD COLUMN IF NOT EXISTS acceptance_record_id  uuid REFERENCES public.acceptance_records(id);
CREATE INDEX IF NOT EXISTS payment_requests_subcontract_period_idx ON public.payment_requests (subcontract_period_id);
CREATE INDEX IF NOT EXISTS payment_requests_subcontractor_idx ON public.payment_requests (subcontractor_id);
COMMENT ON COLUMN public.payment_requests.subcontract_period_id IS
  'Đợt xác nhận khối lượng làm căn cứ (G2, 0246). Đề nghị cho tổ đội / thầu phụ bắt buộc có đợt này hoặc biên bản nghiệm thu tổ đội đã ký.';

-- ----------------------------------------------------------------------------
-- 6. Hàm quyền
-- ----------------------------------------------------------------------------
-- Kế toán – Tài chính của pháp nhân đọc được căn cứ thanh toán (đợt, bảng đơn giá) dù không xem
-- phân hệ Thi công — cùng ý `rls_acceptance_readable` (0192).
CREATE OR REPLACE FUNCTION public.rls_sees_subcontract_finance(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_company_access(p_company_id)
     AND public.auth_can_view_module('KT') AND public.rls_sees_finance();
$$;
REVOKE ALL ON FUNCTION public.rls_sees_subcontract_finance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_sees_subcontract_finance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rls_subcontract_selection_editable(p_selection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontract_selections s
     WHERE s.id = p_selection_id AND s.deleted_at IS NULL AND s.status IN ('nhap', 'tu_choi')
       AND NOT public.auth_is_read_only()
       AND public.rls_site_writable(s.construction_site_id)
  );
$$;
REVOKE ALL ON FUNCTION public.rls_subcontract_selection_editable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_subcontract_selection_editable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rls_subcontract_period_editable(p_period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontract_periods p
     WHERE p.id = p_period_id AND p.deleted_at IS NULL AND p.status = 'nhap'
       AND NOT public.auth_is_read_only()
       AND public.rls_site_writable(p.construction_site_id)
  );
$$;
REVOKE ALL ON FUNCTION public.rls_subcontract_period_editable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_subcontract_period_editable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rls_subcontract_period_readable(p_period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontract_periods p
     WHERE p.id = p_period_id AND p.deleted_at IS NULL
       AND (public.rls_site_readable(p.construction_site_id)
            OR public.rls_sees_subcontract_finance(p.company_id))
  );
$$;
REVOKE ALL ON FUNCTION public.rls_subcontract_period_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_subcontract_period_readable(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Trigger chung: dấu vết, pháp nhân
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subcontract_selections', 'subcontract_offers', 'subcontract_lines',
                           'subcontract_periods', 'subcontract_period_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_touch ON public.%I', t);
    PERFORM public.attach_audit_touch('public.' || t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['subcontract_selections', 'subcontract_offers', 'subcontract_lines',
                           'subcontract_periods'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_transactional_company ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company()', t);
  END LOOP;
END;
$$;

-- --- Chọn thầu phụ -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subcontract_selections_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT s.company_id INTO NEW.company_id FROM public.construction_sites s WHERE s.id = NEW.construction_site_id;
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy công trình của gói việc.';
    END IF;
    IF NEW.subcontractor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subcontractors sc
       WHERE sc.id = NEW.subcontractor_id AND sc.construction_site_id = NEW.construction_site_id
         AND sc.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Tổ đội được chọn lại không thuộc công trình này.';
    END IF;
    SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = NEW.company_id;
    NEW.code := public.next_record_code(v_company_code, 'CTP');
    NEW.status := 'nhap';
    NEW.selected_offer_id := NULL;
    NEW.approval_id := NULL;
    NEW.submitted_at := NULL;
    NEW.submitted_by := NULL;
    NEW.decided_at := NULL;
    NEW.decision_note := NULL;
    NEW.budget_remaining_at_submit := NULL;
  END IF;
  IF COALESCE(btrim(NEW.work_package), '') = '' THEN
    RAISE EXCEPTION 'Ghi tên gói việc cần chọn thầu phụ.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_selections_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subcontract_selections_before_write ON public.subcontract_selections;
CREATE TRIGGER subcontract_selections_before_write
  BEFORE INSERT OR UPDATE ON public.subcontract_selections
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_selections_before_write();

DROP TRIGGER IF EXISTS subcontract_selections_stage_guard ON public.subcontract_selections;
CREATE TRIGGER subcontract_selections_stage_guard
  BEFORE UPDATE ON public.subcontract_selections
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'code', 'company_id', 'construction_site_id', 'subcontractor_id', 'selected_offer_id',
    'approval_id', 'submitted_at', 'submitted_by', 'decided_at', 'decision_note',
    'budget_remaining_at_submit', 'selection_reason', 'single_offer_reason'
  );

CREATE OR REPLACE FUNCTION public.subcontract_offers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT s.status, s.company_id INTO v_status, NEW.company_id
    FROM public.subcontract_selections s WHERE s.id = NEW.selection_id AND s.deleted_at IS NULL;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy gói việc của báo giá.';
  END IF;
  IF v_status NOT IN ('nhap', 'tu_choi') THEN
    RAISE EXCEPTION 'Gói việc đã gửi duyệt — không sửa được báo giá.';
  END IF;
  IF COALESCE(btrim(NEW.crew_name), '') = '' THEN
    RAISE EXCEPTION 'Ghi tên tổ đội / nhà thầu phụ báo giá.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_offers_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subcontract_offers_before_write ON public.subcontract_offers;
CREATE TRIGGER subcontract_offers_before_write
  BEFORE INSERT OR UPDATE ON public.subcontract_offers
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_offers_before_write();

-- --- Bảng đơn giá ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subcontract_lines_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc          record;
  v_confirmed numeric;
BEGIN
  SELECT * INTO sc FROM public.subcontractors WHERE id = NEW.subcontractor_id AND deleted_at IS NULL;
  IF sc.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tổ đội của dòng đơn giá.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.subcontractor_id IS DISTINCT FROM OLD.subcontractor_id THEN
    RAISE EXCEPTION 'Không chuyển dòng đơn giá sang tổ đội khác.';
  END IF;
  NEW.company_id := sc.company_id;
  NEW.construction_site_id := sc.construction_site_id;

  IF COALESCE(btrim(NEW.item), '') = '' OR COALESCE(btrim(NEW.unit), '') = '' THEN
    RAISE EXCEPTION 'Ghi hạng mục và đơn vị tính.';
  END IF;

  -- Khoán gọn: đúng một dòng, khối lượng 1 (kỳ này ghi tỷ lệ hoàn thành).
  IF sc.pricing_method = 'khoan_gon' AND NEW.deleted_at IS NULL THEN
    IF NEW.contract_quantity <> 1 THEN
      RAISE EXCEPTION 'Khoán gọn có một dòng trọn gói, khối lượng 1 — đổi giá trị ở ô đơn giá.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.subcontract_lines l
                WHERE l.subcontractor_id = NEW.subcontractor_id AND l.deleted_at IS NULL AND l.id <> NEW.id) THEN
      RAISE EXCEPTION 'Khoán gọn chỉ có một dòng trọn gói. Muốn chia hạng mục thì đổi cách khoán sang bảng đơn giá.';
    END IF;
  END IF;

  -- Không hạ khối lượng hợp đồng xuống dưới phần đã xác nhận, không xoá dòng đã có khối lượng.
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(sum(pl.quantity), 0) INTO v_confirmed
      FROM public.subcontract_period_lines pl
      JOIN public.subcontract_periods p ON p.id = pl.period_id AND p.deleted_at IS NULL
     WHERE pl.line_id = NEW.id AND NOT pl.excluded AND p.status <> 'nhap';
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.subcontract_period_lines pl WHERE pl.line_id = NEW.id) THEN
      RAISE EXCEPTION 'Hạng mục đã có khối lượng trong một đợt — không xoá được.';
    END IF;
    IF NEW.contract_quantity < v_confirmed THEN
      RAISE EXCEPTION 'Khối lượng hợp đồng (%) nhỏ hơn khối lượng đã xác nhận (%).',
        NEW.contract_quantity, v_confirmed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_lines_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subcontract_lines_before_write ON public.subcontract_lines;
CREATE TRIGGER subcontract_lines_before_write
  BEFORE INSERT OR UPDATE ON public.subcontract_lines
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_lines_before_write();

-- --- Đợt xác nhận khối lượng -------------------------------------------------
CREATE OR REPLACE FUNCTION public.subcontract_periods_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc             record;
  v_company_code text;
BEGIN
  SELECT * INTO sc FROM public.subcontractors WHERE id = NEW.subcontractor_id AND deleted_at IS NULL;
  IF sc.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tổ đội.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subcontract_lines l
                  WHERE l.subcontractor_id = sc.id AND l.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Tổ đội chưa có bảng đơn giá — ghi hạng mục, khối lượng, đơn giá khoán trước khi lập đợt.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subcontract_periods p
              WHERE p.subcontractor_id = sc.id AND p.deleted_at IS NULL AND p.status <> 'da_xac_nhan') THEN
    RAISE EXCEPTION 'Tổ đội còn một đợt chưa xác nhận — hoàn tất đợt đó trước khi lập đợt mới.';
  END IF;
  NEW.company_id := sc.company_id;
  NEW.construction_site_id := sc.construction_site_id;
  SELECT COALESCE(max(p.period_no), 0) + 1 INTO NEW.period_no
    FROM public.subcontract_periods p WHERE p.subcontractor_id = sc.id;
  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = sc.company_id;
  NEW.code := public.next_record_code(v_company_code, 'XKL');
  NEW.prepared_by := COALESCE(public.auth_user_id(), NEW.prepared_by);
  NEW.status := 'nhap';
  NEW.crew_signer_name := NULL;
  NEW.crew_signer_title := NULL;
  NEW.crew_signature_path := NULL;
  NEW.nvg_signature_path := NULL;
  NEW.paper_scan_path := NULL;
  NEW.signed_at := NULL;
  NEW.signed_by := NULL;
  NEW.confirmed_at := NULL;
  NEW.confirmed_by := NULL;
  NEW.return_note := NULL;
  NEW.quality_rating := NULL;
  NEW.safety_rating := NULL;
  NEW.evaluation_notes := NULL;
  NEW.gross_amount := NULL;
  NEW.retention_rate_applied := NULL;
  NEW.retention_amount := NULL;
  NEW.net_amount := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_periods_before_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subcontract_periods_before_insert ON public.subcontract_periods;
CREATE TRIGGER subcontract_periods_before_insert
  BEFORE INSERT ON public.subcontract_periods
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_periods_before_insert();

-- Đã ký và xác nhận thì bất biến — kể cả hàm nghiệp vụ, kể cả kết nối trực tiếp.
CREATE OR REPLACE FUNCTION public.subcontract_periods_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'da_xac_nhan' THEN
    RAISE EXCEPTION 'Đợt xác nhận khối lượng % đã ký và đã xác nhận — không sửa được. Sai sót thì ghi vào đợt sau.',
      OLD.code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subcontract_periods_frozen ON public.subcontract_periods;
CREATE TRIGGER subcontract_periods_frozen
  BEFORE UPDATE ON public.subcontract_periods
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_periods_frozen();

DROP TRIGGER IF EXISTS subcontract_periods_stage_guard ON public.subcontract_periods;
CREATE TRIGGER subcontract_periods_stage_guard
  BEFORE UPDATE ON public.subcontract_periods
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'period_no', 'code', 'company_id', 'construction_site_id', 'subcontractor_id', 'prepared_by',
    'crew_signer_name', 'crew_signer_title', 'crew_signature_path', 'nvg_signature_path', 'paper_scan_path',
    'signed_at', 'signed_by', 'confirmed_at', 'confirmed_by', 'return_note',
    'quality_rating', 'safety_rating', 'evaluation_notes',
    'gross_amount', 'retention_rate_applied', 'retention_amount', 'net_amount'
  );

-- Căn cứ của một dòng: trả NULL khi dòng được tính, lý do khi không.
CREATE OR REPLACE FUNCTION public.subcontract_line_evidence_problem(
  p_site_id uuid,
  p_subcontractor_id uuid,
  p_acceptance_id uuid,
  p_milestone_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  m record;
BEGIN
  IF p_acceptance_id IS NULL AND p_milestone_id IS NULL THEN
    RETURN 'Chưa nghiệm thu — chưa có biên bản nghiệm thu hoặc mốc thi công đã đạt';
  END IF;
  IF p_acceptance_id IS NOT NULL THEN
    SELECT * INTO a FROM public.acceptance_records WHERE id = p_acceptance_id;
    IF a.id IS NULL OR a.deleted_at IS NOT NULL OR a.construction_site_id <> p_site_id THEN
      RETURN 'Biên bản nghiệm thu không thuộc công trình này';
    END IF;
    IF a.status <> 'da_nghiem_thu' THEN
      RETURN format('Biên bản %s chưa nghiệm thu / đã hủy', a.code);
    END IF;
    IF a.signed_at IS NULL THEN
      RETURN format('Biên bản %s chưa ký hai bên', a.code);
    END IF;
    IF a.subcontractor_id IS NOT NULL AND a.subcontractor_id <> p_subcontractor_id THEN
      RETURN format('Biên bản %s là của tổ đội khác', a.code);
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO m FROM public.site_milestones WHERE id = p_milestone_id;
  IF m.id IS NULL OR m.construction_site_id <> p_site_id THEN
    RETURN 'Mốc thi công không thuộc công trình này';
  END IF;
  IF m.status <> 'dat' OR m.passed_at IS NULL THEN
    RETURN format('Mốc «%s» chưa đạt', m.label);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_line_evidence_problem(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontract_line_evidence_problem(uuid, uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.subcontract_period_lines_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p          record;
  l          record;
  v_problem  text;
  v_other    numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Xoá theo dây khoá ngoại (xoá công trình) chạy dưới chủ bảng — không chặn. Trình duyệt chỉ xoá
    -- được dòng của đợt còn Nháp (RLS), trigger nhắc lại cho rõ câu báo.
    SELECT * INTO p FROM public.subcontract_periods WHERE id = OLD.period_id;
    IF current_user = 'authenticated' AND p.id IS NOT NULL AND p.status <> 'nhap' THEN
      RAISE EXCEPTION 'Đợt % đã ký — không sửa được khối lượng.', p.code;
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO p FROM public.subcontract_periods WHERE id = NEW.period_id AND deleted_at IS NULL;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy đợt xác nhận khối lượng.';
  END IF;
  IF p.status <> 'nhap' THEN
    RAISE EXCEPTION 'Đợt % đã ký — không sửa được khối lượng.', p.code;
  END IF;
  SELECT * INTO l FROM public.subcontract_lines WHERE id = NEW.line_id AND deleted_at IS NULL;
  IF l.id IS NULL OR l.subcontractor_id <> p.subcontractor_id THEN
    RAISE EXCEPTION 'Hạng mục không thuộc bảng đơn giá của tổ đội này.';
  END IF;

  NEW.unit_price_applied := l.unit_price;

  -- Chỉ tính phần đã nghiệm thu: không có căn cứ hợp lệ thì máy loại dòng, ghi lý do.
  IF NOT NEW.excluded THEN
    v_problem := public.subcontract_line_evidence_problem(
      p.construction_site_id, p.subcontractor_id, NEW.acceptance_record_id, NEW.site_milestone_id);
    IF v_problem IS NOT NULL THEN
      NEW.excluded := true;
      NEW.exclusion_reason := v_problem;
    END IF;
  END IF;

  IF NOT NEW.excluded THEN
    IF NEW.quantity <= 0 THEN
      RAISE EXCEPTION 'Khối lượng kỳ này của «%» phải lớn hơn 0.', l.item;
    END IF;
    SELECT COALESCE(sum(pl.quantity), 0) INTO v_other
      FROM public.subcontract_period_lines pl
      JOIN public.subcontract_periods op ON op.id = pl.period_id AND op.deleted_at IS NULL
     WHERE pl.line_id = NEW.line_id AND NOT pl.excluded AND pl.period_id <> NEW.period_id;
    IF v_other + NEW.quantity > l.contract_quantity THEN
      RAISE EXCEPTION 'Luỹ kế «%» (% %) vượt khối lượng hợp đồng (% %). Tăng khối lượng hợp đồng (phát sinh) trước.',
        l.item, v_other + NEW.quantity, l.unit, l.contract_quantity, l.unit;
    END IF;
    NEW.amount := round(NEW.quantity * NEW.unit_price_applied)::bigint;
  ELSE
    NEW.amount := 0;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_period_lines_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subcontract_period_lines_before_write ON public.subcontract_period_lines;
CREATE TRIGGER subcontract_period_lines_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.subcontract_period_lines
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_period_lines_before_write();

-- ----------------------------------------------------------------------------
-- 8. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.subcontract_selections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_offers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_period_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subcontract_selections, public.subcontract_offers, public.subcontract_lines,
              public.subcontract_periods, public.subcontract_period_lines FROM anon;
REVOKE DELETE ON public.subcontract_selections, public.subcontract_lines, public.subcontract_periods
  FROM authenticated;

DROP POLICY IF EXISTS subcontract_selections_select ON public.subcontract_selections;
CREATE POLICY subcontract_selections_select ON public.subcontract_selections
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));
DROP POLICY IF EXISTS subcontract_selections_insert ON public.subcontract_selections;
CREATE POLICY subcontract_selections_insert ON public.subcontract_selections
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.auth_is_read_only() AND public.rls_site_writable(construction_site_id));
DROP POLICY IF EXISTS subcontract_selections_update ON public.subcontract_selections;
CREATE POLICY subcontract_selections_update ON public.subcontract_selections
  FOR UPDATE TO authenticated
  USING (public.rls_subcontract_selection_editable(id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

DROP POLICY IF EXISTS subcontract_offers_select ON public.subcontract_offers;
CREATE POLICY subcontract_offers_select ON public.subcontract_offers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.subcontract_selections s WHERE s.id = selection_id));
DROP POLICY IF EXISTS subcontract_offers_insert ON public.subcontract_offers;
CREATE POLICY subcontract_offers_insert ON public.subcontract_offers
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_subcontract_selection_editable(selection_id));
DROP POLICY IF EXISTS subcontract_offers_update ON public.subcontract_offers;
CREATE POLICY subcontract_offers_update ON public.subcontract_offers
  FOR UPDATE TO authenticated
  USING (public.rls_subcontract_selection_editable(selection_id))
  WITH CHECK (public.rls_subcontract_selection_editable(selection_id));
DROP POLICY IF EXISTS subcontract_offers_delete ON public.subcontract_offers;
CREATE POLICY subcontract_offers_delete ON public.subcontract_offers
  FOR DELETE TO authenticated
  USING (public.rls_subcontract_selection_editable(selection_id));

DROP POLICY IF EXISTS subcontract_lines_select ON public.subcontract_lines;
CREATE POLICY subcontract_lines_select ON public.subcontract_lines
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.rls_site_readable(construction_site_id)
                                 OR public.rls_sees_subcontract_finance(company_id)));
DROP POLICY IF EXISTS subcontract_lines_insert ON public.subcontract_lines;
CREATE POLICY subcontract_lines_insert ON public.subcontract_lines
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.auth_is_read_only() AND public.rls_site_writable(construction_site_id));
DROP POLICY IF EXISTS subcontract_lines_update ON public.subcontract_lines;
CREATE POLICY subcontract_lines_update ON public.subcontract_lines
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND NOT public.auth_is_read_only() AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

DROP POLICY IF EXISTS subcontract_periods_select ON public.subcontract_periods;
CREATE POLICY subcontract_periods_select ON public.subcontract_periods
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (public.rls_site_readable(construction_site_id)
                                 OR public.rls_sees_subcontract_finance(company_id)));
DROP POLICY IF EXISTS subcontract_periods_insert ON public.subcontract_periods;
CREATE POLICY subcontract_periods_insert ON public.subcontract_periods
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.auth_is_read_only() AND status = 'nhap'
              AND public.rls_site_writable(construction_site_id));
DROP POLICY IF EXISTS subcontract_periods_update ON public.subcontract_periods;
CREATE POLICY subcontract_periods_update ON public.subcontract_periods
  FOR UPDATE TO authenticated
  USING (public.rls_subcontract_period_editable(id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

DROP POLICY IF EXISTS subcontract_period_lines_select ON public.subcontract_period_lines;
CREATE POLICY subcontract_period_lines_select ON public.subcontract_period_lines
  FOR SELECT TO authenticated
  USING (public.rls_subcontract_period_readable(period_id));
DROP POLICY IF EXISTS subcontract_period_lines_insert ON public.subcontract_period_lines;
CREATE POLICY subcontract_period_lines_insert ON public.subcontract_period_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_subcontract_period_editable(period_id));
DROP POLICY IF EXISTS subcontract_period_lines_update ON public.subcontract_period_lines;
CREATE POLICY subcontract_period_lines_update ON public.subcontract_period_lines
  FOR UPDATE TO authenticated
  USING (public.rls_subcontract_period_editable(period_id))
  WITH CHECK (public.rls_subcontract_period_editable(period_id));
DROP POLICY IF EXISTS subcontract_period_lines_delete ON public.subcontract_period_lines;
CREATE POLICY subcontract_period_lines_delete ON public.subcontract_period_lines
  FOR DELETE TO authenticated
  USING (public.rls_subcontract_period_editable(period_id));

-- ----------------------------------------------------------------------------
-- 9. Kho chữ ký / bản giấy của đợt: `<công trình>/<đợt>/<loại>-<uuid>.<đuôi>`
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('subcontract-docs', 'subcontract-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS subcontract_docs_select ON storage.objects;
CREATE POLICY subcontract_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'subcontract-docs'
         AND public.rls_subcontract_period_readable(public.try_uuid((storage.foldername(name))[2])));

DROP POLICY IF EXISTS subcontract_docs_insert ON storage.objects;
CREATE POLICY subcontract_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'subcontract-docs'
              AND public.rls_subcontract_period_editable(public.try_uuid((storage.foldername(name))[2]))
              AND EXISTS (SELECT 1 FROM public.subcontract_periods p
                           WHERE p.id = public.try_uuid((storage.foldername(name))[2])
                             AND p.construction_site_id = public.try_uuid((storage.foldername(name))[1])));

-- ----------------------------------------------------------------------------
-- 10. Ngân sách còn lại của một dòng (để so khi chọn thầu phụ)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._site_budget_line_remaining(p_site_id uuid, p_cost_code text)
RETURNS TABLE (found boolean, name text, cost_group public.cost_group, budgeted bigint, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) > 0,
         min(pb.name),
         min(pb.cost_group::text)::public.cost_group,
         COALESCE(sum(pb.budgeted_amount), 0)::bigint,
         COALESCE(sum(pb.budgeted_amount - pb.committed_amount - pb.actual_amount), 0)::bigint
    FROM public.project_budgets pb
   WHERE pb.construction_site_id = p_site_id AND pb.cost_code = p_cost_code AND pb.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public._site_budget_line_remaining(uuid, text) FROM PUBLIC, anon, authenticated;

-- Dòng ngân sách của công trình để chọn nguồn khi chọn thầu phụ — chỉ trả cho người xem được
-- công trình. Không có giá bán, chỉ ngân sách chi phí.
CREATE OR REPLACE FUNCTION public.site_cost_lines(p_site_id uuid)
RETURNS TABLE (cost_code text, name text, cost_group text, budgeted bigint, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pb.cost_code::text, min(pb.name), min(pb.cost_group::text),
         sum(pb.budgeted_amount)::bigint,
         sum(pb.budgeted_amount - pb.committed_amount - pb.actual_amount)::bigint
    FROM public.project_budgets pb
   WHERE pb.construction_site_id = p_site_id AND pb.deleted_at IS NULL
     AND public.rls_site_readable(p_site_id)
   GROUP BY pb.cost_code
   ORDER BY pb.cost_code;
$$;
REVOKE ALL ON FUNCTION public.site_cost_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_cost_lines(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. Gửi duyệt chọn thầu phụ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_subcontract_selection(
  p_selection_id uuid,
  p_offer_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  s          record;
  o          record;
  v_count    integer;
  v_min      bigint;
  v_reason   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  b          record;
  v_text     text;
  v_approval uuid;
  v_subject  public.approval_subject := 'subcontractor_selection';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO s FROM public.subcontract_selections
   WHERE id = p_selection_id AND deleted_at IS NULL FOR UPDATE;
  IF s.id IS NULL OR NOT public.rls_subcontract_selection_editable(s.id) THEN
    IF s.id IS NOT NULL AND s.status = 'cho_duyet' THEN
      RAISE EXCEPTION 'Gói việc % đang chờ duyệt.', s.code;
    END IF;
    RAISE EXCEPTION 'Chỉ Ban công trường / Phòng Thi công của công trình gửi duyệt được chọn thầu phụ.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.subcontract_offers WHERE id = p_offer_id AND selection_id = s.id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Chọn một báo giá của gói việc này.';
  END IF;

  SELECT count(*), min(offered_value) INTO v_count, v_min
    FROM public.subcontract_offers WHERE selection_id = s.id;
  -- Một báo giá vẫn đi duyệt, nhưng người gửi phải nói vì sao không so được (phiếu khảo sát).
  IF v_count = 1 AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Chỉ có một báo giá — ghi lý do không so được với tổ đội khác.';
  END IF;
  -- Máy không chọn hộ (PRD 2.3); chọn báo giá không thấp nhất thì người chọn ghi lý do.
  IF v_count > 1 AND o.offered_value > v_min AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Báo giá được chọn không phải giá thấp nhất — ghi lý do chọn.';
  END IF;

  IF NULLIF(btrim(COALESCE(s.cost_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Chọn dòng ngân sách chi trả cho gói việc (nguồn ngân sách).';
  END IF;
  SELECT * INTO b FROM public._site_budget_line_remaining(s.construction_site_id, s.cost_code);
  IF NOT b.found THEN
    RAISE EXCEPTION 'Mã chi phí % không có trong ngân sách của công trình.', s.cost_code;
  END IF;

  v_text := format('%s báo giá. Ngân sách «%s» còn %s đồng.', v_count, b.name,
                   to_char(b.remaining, 'FM999G999G999G999'));
  IF o.offered_value > b.remaining THEN
    v_text := v_text || format(' Báo giá chọn vượt ngân sách còn lại %s đồng.',
                               to_char(o.offered_value - b.remaining, 'FM999G999G999G999'));
  END IF;
  IF v_count = 1 THEN
    v_text := v_text || ' Chỉ một báo giá: ' || v_reason;
  ELSIF v_reason IS NOT NULL THEN
    v_text := v_text || ' Lý do chọn: ' || v_reason;
  END IF;

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  VALUES (s.company_id, v_subject, 'subcontract_selections', s.id, s.code,
          format('Chọn thầu phụ %s — %s — %s', s.code, s.work_package, o.crew_name),
          o.offered_value, v_text, 'pending_approval', v_user)
  RETURNING id INTO v_approval;

  UPDATE public.subcontract_selections
     SET status = 'cho_duyet', selected_offer_id = o.id,
         selection_reason = CASE WHEN v_count > 1 THEN v_reason END,
         single_offer_reason = CASE WHEN v_count = 1 THEN v_reason END,
         budget_remaining_at_submit = b.remaining,
         approval_id = v_approval, submitted_at = now(), submitted_by = v_user,
         decided_at = NULL, decision_note = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = s.id;
  RETURN v_approval;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_subcontract_selection(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_subcontract_selection(uuid, uuid, text) TO authenticated;
COMMENT ON FUNCTION public.submit_subcontract_selection(uuid, uuid, text) IS
  'Gửi duyệt chọn thầu phụ (G2, 0246): một báo giá / không chọn giá thấp nhất thì bắt buộc lý do; bắt buộc dòng ngân sách; vào hộp Phê duyệt loại subcontractor_selection theo hạn mức.';

-- Duyệt xong: tạo / cập nhật tổ đội của công trình. Khoán gọn tự có một dòng trọn gói.
CREATE OR REPLACE FUNCTION public._apply_subcontract_selection(p_selection_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  s      record;
  o      record;
  v_sub  uuid;
BEGIN
  SELECT * INTO s FROM public.subcontract_selections WHERE id = p_selection_id FOR UPDATE;
  SELECT * INTO o FROM public.subcontract_offers WHERE id = s.selected_offer_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Gói việc không còn báo giá được chọn.';
  END IF;

  IF s.subcontractor_id IS NULL THEN
    INSERT INTO public.subcontractors (
      company_id, construction_site_id, name, contact_name, contact_phone, scope_of_work,
      form, contract_value, pricing_method, retention_rate, cost_code, selection_id,
      created_by, updated_by)
    VALUES (s.company_id, s.construction_site_id, o.crew_name, o.contact_name, o.contact_phone,
            COALESCE(NULLIF(btrim(COALESCE(s.scope_of_work, '')), ''), s.work_package),
            'hop_dong', o.offered_value, o.pricing_method, o.retention_rate, s.cost_code, s.id,
            v_user, v_user)
    RETURNING id INTO v_sub;
  ELSE
    v_sub := s.subcontractor_id;
    UPDATE public.subcontractors
       SET name = o.crew_name, contact_name = COALESCE(o.contact_name, contact_name),
           contact_phone = COALESCE(o.contact_phone, contact_phone),
           contract_value = o.offered_value, pricing_method = o.pricing_method,
           retention_rate = o.retention_rate, cost_code = s.cost_code, selection_id = s.id,
           updated_at = now(), updated_by = v_user
     WHERE id = v_sub;
  END IF;

  IF o.pricing_method = 'khoan_gon' AND NOT EXISTS (
    SELECT 1 FROM public.subcontract_lines l WHERE l.subcontractor_id = v_sub AND l.deleted_at IS NULL) THEN
    INSERT INTO public.subcontract_lines (company_id, construction_site_id, subcontractor_id, position,
                                          item, unit, contract_quantity, unit_price, created_by, updated_by)
    VALUES (s.company_id, s.construction_site_id, v_sub, 1, s.work_package, 'gói', 1, o.offered_value,
            v_user, v_user);
  END IF;

  UPDATE public.subcontract_selections
     SET status = 'da_duyet', subcontractor_id = v_sub, decided_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = s.id;
  RETURN v_sub;
END;
$$;
REVOKE ALL ON FUNCTION public._apply_subcontract_selection(uuid) FROM PUBLIC, anon, authenticated;

-- Bảng so giá của một gói việc — cho người xem được công trình và người duyệt hồ sơ.
CREATE OR REPLACE FUNCTION public.subcontract_selection_board(p_selection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s   record;
  b   record;
  v   jsonb;
BEGIN
  SELECT sel.*, cs.code AS site_code, cs.name AS site_name
    INTO s
    FROM public.subcontract_selections sel
    JOIN public.construction_sites cs ON cs.id = sel.construction_site_id
   WHERE sel.id = p_selection_id AND sel.deleted_at IS NULL;
  IF s.id IS NULL OR NOT (
       public.rls_site_readable(s.construction_site_id)
       OR (s.approval_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.approvals a
              WHERE a.id = s.approval_id AND public.rls_can_approve(a.subject, a.company_id, a.amount)))) THEN
    RAISE EXCEPTION 'Không có quyền xem gói việc này.';
  END IF;
  SELECT * INTO b FROM public._site_budget_line_remaining(s.construction_site_id, COALESCE(s.cost_code, ''));
  SELECT jsonb_build_object(
    'id', s.id, 'code', s.code, 'status', s.status, 'work_package', s.work_package,
    'scope_of_work', s.scope_of_work, 'cost_code', s.cost_code,
    'site', jsonb_build_object('id', s.construction_site_id, 'code', s.site_code, 'name', s.site_name),
    'budget', CASE WHEN b.found THEN jsonb_build_object('name', b.name, 'budgeted', b.budgeted,
                                                         'remaining', b.remaining) END,
    'budget_remaining_at_submit', s.budget_remaining_at_submit,
    'selected_offer_id', s.selected_offer_id, 'selection_reason', s.selection_reason,
    'single_offer_reason', s.single_offer_reason, 'subcontractor_id', s.subcontractor_id,
    'submitted_at', s.submitted_at, 'decided_at', s.decided_at, 'decision_note', s.decision_note,
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'crew_name', o.crew_name, 'contact_name', o.contact_name,
               'contact_phone', o.contact_phone, 'pricing_method', o.pricing_method,
               'offered_value', o.offered_value, 'retention_rate', o.retention_rate,
               'duration_days', o.duration_days, 'notes', o.notes,
               -- Đánh giá các đợt trước của CÙNG tên tổ đội trong pháp nhân — căn cứ chọn ngoài giá.
               'past_quality', (SELECT round(avg(p.quality_rating), 1)
                                  FROM public.subcontract_periods p
                                  JOIN public.subcontractors sc ON sc.id = p.subcontractor_id
                                 WHERE sc.company_id = s.company_id AND p.status = 'da_xac_nhan'
                                   AND lower(btrim(sc.name)) = lower(btrim(o.crew_name))),
               'past_periods', (SELECT count(*)
                                  FROM public.subcontract_periods p
                                  JOIN public.subcontractors sc ON sc.id = p.subcontractor_id
                                 WHERE sc.company_id = s.company_id AND p.status = 'da_xac_nhan'
                                   AND lower(btrim(sc.name)) = lower(btrim(o.crew_name))))
             ORDER BY o.offered_value, o.created_at)
        FROM public.subcontract_offers o WHERE o.selection_id = s.id), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_selection_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontract_selection_board(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12. Hợp đồng khoán từ tổ đội đã duyệt
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subcontract_value(p_subcontractor_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT sum(l.amount)::bigint FROM public.subcontract_lines l
      WHERE l.subcontractor_id = p_subcontractor_id AND l.deleted_at IS NULL),
    (SELECT sc.contract_value FROM public.subcontractors sc WHERE sc.id = p_subcontractor_id));
$$;
REVOKE ALL ON FUNCTION public.subcontract_value(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_subcontract_contract(p_subcontractor_id uuid, p_title text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  sc         record;
  v_code     text;
  v_contract uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT x.*, cs.code AS site_code, c.code AS company_code
    INTO sc
    FROM public.subcontractors x
    JOIN public.construction_sites cs ON cs.id = x.construction_site_id
    JOIN public.companies c ON c.id = x.company_id
   WHERE x.id = p_subcontractor_id AND x.deleted_at IS NULL FOR UPDATE OF x;
  IF sc.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy tổ đội.';
  END IF;
  IF NOT public.auth_can_create_in('HD', sc.company_id) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được soạn hợp đồng trong pháp nhân này.' USING ERRCODE = '42501';
  END IF;
  IF sc.contract_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = sc.contract_id AND c.deleted_at IS NULL
       AND c.stage::text <> 'huy') THEN
    RAISE EXCEPTION 'Tổ đội đã có hợp đồng khoán.';
  END IF;
  IF sc.selection_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.subcontract_selections s WHERE s.id = sc.selection_id AND s.status = 'da_duyet') THEN
    RAISE EXCEPTION 'Tổ đội chưa được duyệt chọn — gửi duyệt chọn thầu phụ trước khi soạn hợp đồng khoán.';
  END IF;

  v_code := public.next_record_code(sc.company_code, 'HD');
  -- Không có hồ sơ nguồn: `source_type` / `scope_kind` rỗng nên luật «một hợp đồng mỗi loại» của
  -- cơ hội (0243) không áp. Bên nhận = tổ đội (partner_name), không phải khách hàng.
  INSERT INTO public.contracts (company_id, code, title, type, partner_name, responsible_user_id, value)
  VALUES (sc.company_id, v_code,
          COALESCE(NULLIF(btrim(COALESCE(p_title, '')), ''),
                   format('Khoán %s — %s (%s)', sc.scope_of_work, sc.name, sc.site_code)),
          'khoan_thau_phu', sc.name, v_user, public.subcontract_value(sc.id))
  RETURNING id INTO v_contract;

  UPDATE public.subcontractors SET contract_id = v_contract, updated_at = now(), updated_by = v_user
   WHERE id = sc.id;
  RETURN v_contract;
END;
$$;
REVOKE ALL ON FUNCTION public.create_subcontract_contract(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_subcontract_contract(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.create_subcontract_contract(uuid, text) IS
  'Soạn hợp đồng khoán (khoan_thau_phu) cho tổ đội đã duyệt chọn (G2, 0246) — đi tiếp luồng hợp đồng thường (soạn từ mẫu, duyệt, ký). Người có quyền tạo hợp đồng.';

-- Tổ đội đã duyệt chọn mà chưa có hợp đồng khoán — cho người soạn hợp đồng (không xem Thi công).
CREATE OR REPLACE FUNCTION public.subcontractors_awaiting_contract()
RETURNS TABLE (subcontractor_id uuid, company_id uuid, site_code text, site_name text, name text,
               scope_of_work text, pricing_method text, contract_value bigint, approved_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.id, sc.company_id, cs.code::text, cs.name::text, sc.name::text, sc.scope_of_work,
         sc.pricing_method::text, public.subcontract_value(sc.id), s.decided_at
    FROM public.subcontractors sc
    JOIN public.construction_sites cs ON cs.id = sc.construction_site_id AND cs.deleted_at IS NULL
    JOIN public.subcontract_selections s ON s.id = sc.selection_id AND s.status = 'da_duyet'
   WHERE sc.deleted_at IS NULL
     AND public.auth_can_create_in('HD', sc.company_id)
     AND (sc.contract_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.contracts c WHERE c.id = sc.contract_id AND c.deleted_at IS NULL
               AND c.stage::text <> 'huy'))
   ORDER BY s.decided_at;
$$;
REVOKE ALL ON FUNCTION public.subcontractors_awaiting_contract() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontractors_awaiting_contract() TO authenticated;

-- ----------------------------------------------------------------------------
-- 13. Ký và xác nhận đợt khối lượng
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sign_subcontract_period(
  p_period_id           uuid,
  p_crew_name           text,
  p_crew_title          text DEFAULT NULL,
  p_crew_signature_path text DEFAULT NULL,
  p_nvg_signature_path  text DEFAULT NULL,
  p_paper_scan_path     text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  p        record;
  sc       record;
  pl       record;
  v_prefix text;
  v_path   text;
  v_gross  bigint;
  v_rate   numeric;
  v_ret    bigint;
  v_counted integer;
  v_problem text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO p FROM public.subcontract_periods WHERE id = p_period_id AND deleted_at IS NULL FOR UPDATE;
  IF p.id IS NULL OR NOT public.rls_subcontract_period_editable(p.id) THEN
    IF p.id IS NOT NULL AND p.status <> 'nhap' THEN
      RAISE EXCEPTION 'Đợt % đã ký.', p.code;
    END IF;
    RAISE EXCEPTION 'Chỉ Ban công trường của công trình này lập và ký được đợt xác nhận khối lượng.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_crew_name), '') = '' THEN
    RAISE EXCEPTION 'Ghi họ tên tổ trưởng / đại diện tổ đội ký xác nhận.';
  END IF;
  IF p_paper_scan_path IS NULL AND (p_crew_signature_path IS NULL OR p_nvg_signature_path IS NULL) THEN
    RAISE EXCEPTION 'Cần đủ hai chữ ký, hoặc bản giấy đã ký quét lên.';
  END IF;
  v_prefix := p.construction_site_id::text || '/' || p.id::text || '/';
  FOREACH v_path IN ARRAY ARRAY[p_crew_signature_path, p_nvg_signature_path, p_paper_scan_path] LOOP
    CONTINUE WHEN v_path IS NULL;
    IF left(v_path, length(v_prefix)) <> v_prefix
       OR NOT EXISTS (SELECT 1 FROM storage.objects ob
                       WHERE ob.bucket_id = 'subcontract-docs' AND ob.name = v_path) THEN
      RAISE EXCEPTION 'Tệp chữ ký / bản giấy không thuộc đợt này — ký lại.';
    END IF;
  END LOOP;

  -- Biên bản có thể đã bị hủy từ lúc nhập dòng: kiểm lại căn cứ ngay lúc ký.
  FOR pl IN SELECT * FROM public.subcontract_period_lines WHERE period_id = p.id AND NOT excluded LOOP
    v_problem := public.subcontract_line_evidence_problem(
      p.construction_site_id, p.subcontractor_id, pl.acceptance_record_id, pl.site_milestone_id);
    IF v_problem IS NOT NULL THEN
      UPDATE public.subcontract_period_lines SET excluded = true, exclusion_reason = v_problem
       WHERE id = pl.id;
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE NOT excluded), COALESCE(sum(amount), 0)::bigint
    INTO v_counted, v_gross
    FROM public.subcontract_period_lines WHERE period_id = p.id;
  IF v_counted = 0 THEN
    RAISE EXCEPTION 'Đợt chưa có hạng mục nào được tính (đã nghiệm thu) — không có gì để ký.';
  END IF;

  SELECT * INTO sc FROM public.subcontractors WHERE id = p.subcontractor_id;
  v_rate := sc.retention_rate;
  v_ret := CASE WHEN v_rate IS NULL THEN 0 ELSE round(v_gross * v_rate / 100)::bigint END;

  UPDATE public.subcontract_periods
     SET status = 'cho_xac_nhan',
         crew_signer_name = btrim(p_crew_name),
         crew_signer_title = NULLIF(btrim(COALESCE(p_crew_title, '')), ''),
         crew_signature_path = p_crew_signature_path, nvg_signature_path = p_nvg_signature_path,
         paper_scan_path = p_paper_scan_path, signed_at = now(), signed_by = v_user,
         return_note = NULL,
         gross_amount = v_gross, retention_rate_applied = v_rate, retention_amount = v_ret,
         net_amount = v_gross - v_ret,
         updated_at = now(), updated_by = v_user
   WHERE id = p.id;

  PERFORM public.create_notification(
    rv.user_id, p.company_id, 'subcontract_period_signed',
    format('Đợt xác nhận khối lượng %s — tổ đội %s đã ký, %s đồng. Kiểm và xác nhận.',
           p.code, sc.name, to_char(v_gross - v_ret, 'FM999,999,999,999')),
    'subcontract_periods', p.id, '/tc/dot-khoi-luong/' || p.id)
  FROM public.milestone_technical_reviewers(p.company_id) rv
  WHERE rv.user_id <> v_user;

  RETURN v_gross - v_ret;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_subcontract_period(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_subcontract_period(uuid, text, text, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.sign_subcontract_period(uuid, text, text, text, text, text) IS
  'Tổ trưởng ký đợt xác nhận khối lượng (hai chữ ký hoặc bản giấy quét). Kiểm lại căn cứ, chụp số tiền và tỷ lệ giữ lại bảo hành lúc ký (không hồi tố), báo Trưởng phòng Thi công.';

CREATE OR REPLACE FUNCTION public.confirm_subcontract_period(
  p_period_id uuid,
  p_approve   boolean,
  p_quality   smallint DEFAULT NULL,
  p_safety    smallint DEFAULT NULL,
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
  sc     record;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO p FROM public.subcontract_periods WHERE id = p_period_id AND deleted_at IS NULL FOR UPDATE;
  IF p.id IS NULL OR NOT public.rls_site_readable(p.construction_site_id) THEN
    RAISE EXCEPTION 'Không tìm thấy đợt xác nhận khối lượng.';
  END IF;
  IF public.auth_is_read_only() OR NOT EXISTS (
    SELECT 1 FROM public.milestone_technical_reviewers(p.company_id) rv WHERE rv.user_id = v_user) THEN
    RAISE EXCEPTION 'Chỉ Trưởng phòng Thi công hoặc Ban Giám đốc xác nhận khối lượng tổ đội.'
      USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'cho_xac_nhan' THEN
    RAISE EXCEPTION 'Đợt % không ở bước chờ xác nhận.', p.code;
  END IF;
  IF p.prepared_by = v_user THEN
    RAISE EXCEPTION 'Người lập đợt không tự xác nhận — cần một người kiểm độc lập.';
  END IF;
  SELECT * INTO sc FROM public.subcontractors WHERE id = p.subcontractor_id;

  IF NOT p_approve THEN
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Ghi rõ chỗ chưa đúng để Ban công trường sửa rồi cho tổ đội ký lại.';
    END IF;
    -- Trả lại: về Nháp, bỏ chữ ký (số đã ký không còn đúng), tổ đội ký lại sau khi sửa.
    UPDATE public.subcontract_periods
       SET status = 'nhap', return_note = v_note,
           crew_signer_name = NULL, crew_signer_title = NULL, crew_signature_path = NULL,
           nvg_signature_path = NULL, paper_scan_path = NULL, signed_at = NULL, signed_by = NULL,
           gross_amount = NULL, retention_rate_applied = NULL, retention_amount = NULL, net_amount = NULL,
           updated_at = now(), updated_by = v_user
     WHERE id = p.id;
    PERFORM public.create_notification(
      p.prepared_by, p.company_id, 'subcontract_period_returned',
      format('Đợt xác nhận khối lượng %s (tổ đội %s) bị trả lại: %s', p.code, sc.name, v_note),
      'subcontract_periods', p.id, '/tc/dot-khoi-luong/' || p.id);
    RETURN;
  END IF;

  IF p_quality IS NULL OR p_quality NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Chấm chất lượng của đợt (1–5) trước khi xác nhận.';
  END IF;
  IF p_safety IS NOT NULL AND p_safety NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Điểm an toàn theo thang 1–5.';
  END IF;

  UPDATE public.subcontract_periods
     SET status = 'da_xac_nhan', confirmed_at = now(), confirmed_by = v_user,
         quality_rating = p_quality, safety_rating = p_safety, evaluation_notes = v_note,
         updated_at = now(), updated_by = v_user
   WHERE id = p.id;

  -- Đánh giá gần nhất hiện trên thẻ tổ đội; lịch sử đầy đủ nằm ở từng đợt.
  UPDATE public.subcontractors
     SET quality_rating = p_quality, quality_notes = COALESCE(v_note, quality_notes),
         updated_at = now(), updated_by = v_user
   WHERE id = sc.id;

  IF p.prepared_by IS NOT NULL AND p.prepared_by <> v_user THEN
    PERFORM public.create_notification(
      p.prepared_by, p.company_id, 'subcontract_period_confirmed',
      format('Đợt xác nhận khối lượng %s (tổ đội %s) đã được xác nhận — lập đề nghị thanh toán được.', p.code, sc.name),
      'subcontract_periods', p.id, '/tc/dot-khoi-luong/' || p.id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_subcontract_period(uuid, boolean, smallint, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_subcontract_period(uuid, boolean, smallint, smallint, text) TO authenticated;
COMMENT ON FUNCTION public.confirm_subcontract_period(uuid, boolean, smallint, smallint, text) IS
  'Trưởng phòng Thi công / Ban Giám đốc (không phải người lập) xác nhận đợt khối lượng kèm đánh giá chất lượng, an toàn của đợt; hoặc trả lại kèm ý kiến (bỏ chữ ký).';

-- ----------------------------------------------------------------------------
-- 14. Đọc: tiến độ bảng đơn giá, nội dung đợt, sổ theo dõi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subcontract_line_progress(p_subcontractor_id uuid)
RETURNS TABLE (line_id uuid, line_position integer, item text, unit text, contract_quantity numeric,
               unit_price bigint, amount bigint, confirmed_quantity numeric, confirmed_amount bigint,
               pending_quantity numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.id, l.position, l.item, l.unit::text, l.contract_quantity, l.unit_price, l.amount,
         COALESCE(sum(pl.quantity) FILTER (WHERE p.status = 'da_xac_nhan'), 0),
         COALESCE(sum(pl.amount) FILTER (WHERE p.status = 'da_xac_nhan'), 0)::bigint,
         COALESCE(sum(pl.quantity) FILTER (WHERE p.status <> 'da_xac_nhan'), 0)
    FROM public.subcontract_lines l
    LEFT JOIN public.subcontract_period_lines pl ON pl.line_id = l.id AND NOT pl.excluded
    LEFT JOIN public.subcontract_periods p ON p.id = pl.period_id AND p.deleted_at IS NULL
   WHERE l.subcontractor_id = p_subcontractor_id AND l.deleted_at IS NULL
   GROUP BY l.id
   ORDER BY l.position, l.created_at;
$$;
REVOKE ALL ON FUNCTION public.subcontract_line_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontract_line_progress(uuid) TO authenticated;

-- Số đã đề nghị / đã chi trên một đợt (đề nghị không bị từ chối / hủy).
CREATE OR REPLACE FUNCTION public._subcontract_period_requested(p_period_id uuid, p_except uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(pr.amount), 0)::bigint
    FROM public.payment_requests pr
   WHERE pr.subcontract_period_id = p_period_id AND pr.deleted_at IS NULL
     AND pr.stage NOT IN ('tu_choi', 'huy')
     AND (p_except IS NULL OR pr.id <> p_except);
$$;
REVOKE ALL ON FUNCTION public._subcontract_period_requested(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.subcontract_period_document(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.rls_subcontract_period_readable(p_period_id) THEN
    RAISE EXCEPTION 'Không có quyền xem đợt xác nhận khối lượng này.';
  END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'code', p.code, 'period_no', p.period_no, 'status', p.status,
    'period_start', p.period_start, 'period_end', p.period_end, 'notes', p.notes,
    'prepared_by', p.prepared_by, 'prepared_by_name', up.full_name,
    'crew_signer_name', p.crew_signer_name, 'crew_signer_title', p.crew_signer_title,
    'crew_signature_path', p.crew_signature_path, 'nvg_signature_path', p.nvg_signature_path,
    'paper_scan_path', p.paper_scan_path, 'signed_at', p.signed_at, 'signed_by_name', us.full_name,
    'confirmed_at', p.confirmed_at, 'confirmed_by_name', uc.full_name, 'return_note', p.return_note,
    'quality_rating', p.quality_rating, 'safety_rating', p.safety_rating,
    'evaluation_notes', p.evaluation_notes,
    'gross_amount', p.gross_amount, 'retention_rate_applied', p.retention_rate_applied,
    'retention_amount', p.retention_amount, 'net_amount', p.net_amount,
    'requested_amount', public._subcontract_period_requested(p.id),
    'company', jsonb_build_object('id', co.id, 'code', co.code, 'name', co.legal_name),
    'site', jsonb_build_object('id', cs.id, 'code', cs.code, 'name', cs.name),
    'subcontractor', jsonb_build_object('id', sc.id, 'name', sc.name, 'pricing_method', sc.pricing_method,
                                        'retention_rate', sc.retention_rate, 'contract_id', sc.contract_id,
                                        'cost_code', sc.cost_code),
    'can_edit', public.rls_subcontract_period_editable(p.id),
    'can_confirm', p.status = 'cho_xac_nhan' AND NOT public.auth_is_read_only()
                   AND p.prepared_by IS DISTINCT FROM public.auth_user_id()
                   AND EXISTS (SELECT 1 FROM public.milestone_technical_reviewers(p.company_id) rv
                                WHERE rv.user_id = public.auth_user_id()),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pl.id, 'line_id', l.id, 'item', l.item, 'unit', l.unit,
               'contract_quantity', l.contract_quantity, 'quantity', pl.quantity,
               'unit_price_applied', pl.unit_price_applied, 'amount', pl.amount,
               'excluded', pl.excluded, 'exclusion_reason', pl.exclusion_reason,
               'acceptance_record_id', pl.acceptance_record_id, 'acceptance_code', a.code,
               'acceptance_stage', a.stage_name,
               'site_milestone_id', pl.site_milestone_id, 'milestone_label', m.label,
               'previous_quantity', (
                 SELECT COALESCE(sum(x.quantity), 0) FROM public.subcontract_period_lines x
                   JOIN public.subcontract_periods xp ON xp.id = x.period_id AND xp.deleted_at IS NULL
                  WHERE x.line_id = l.id AND NOT x.excluded AND xp.period_no < p.period_no))
             ORDER BY l.position, l.created_at)
        FROM public.subcontract_period_lines pl
        JOIN public.subcontract_lines l ON l.id = pl.line_id
        LEFT JOIN public.acceptance_records a ON a.id = pl.acceptance_record_id
        LEFT JOIN public.site_milestones m ON m.id = pl.site_milestone_id
       WHERE pl.period_id = p.id), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'code', pr.code, 'stage', pr.stage,
                                          'amount', pr.amount, 'paid_amount', pr.paid_amount)
                       ORDER BY pr.created_at)
        FROM public.payment_requests pr
       WHERE pr.subcontract_period_id = p.id AND pr.deleted_at IS NULL), '[]'::jsonb)
  ) INTO v
  FROM public.subcontract_periods p
  JOIN public.subcontractors sc ON sc.id = p.subcontractor_id
  JOIN public.construction_sites cs ON cs.id = p.construction_site_id
  JOIN public.companies co ON co.id = p.company_id
  LEFT JOIN public.users up ON up.id = p.prepared_by
  LEFT JOIN public.users us ON us.id = p.signed_by
  LEFT JOIN public.users uc ON uc.id = p.confirmed_by
  WHERE p.id = p_period_id;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.subcontract_period_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontract_period_document(uuid) TO authenticated;

-- Sổ theo dõi mỗi tổ đội của một công trình. SECURITY DEFINER vì Ban công trường không đọc được
-- đề nghị thanh toán người khác lập — chỉ trả số tổng, không trả hồ sơ.
CREATE OR REPLACE FUNCTION public.subcontractor_ledger(p_site_id uuid)
RETURNS TABLE (subcontractor_id uuid, name text, pricing_method text, retention_rate numeric,
               contract_value bigint, contract_id uuid, confirmed_gross bigint, retention_held bigint,
               confirmed_net bigint, requested bigint, paid bigint, remaining_contract bigint,
               remaining_payable bigint, periods integer, open_period_id uuid, last_quality smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sc.id, sc.name::text, sc.pricing_method::text, sc.retention_rate,
         public.subcontract_value(sc.id), sc.contract_id,
         COALESCE(pp.gross, 0), COALESCE(pp.retention, 0), COALESCE(pp.net, 0),
         COALESCE(pr.requested, 0), COALESCE(pr.paid, 0),
         COALESCE(public.subcontract_value(sc.id), 0) - COALESCE(pp.gross, 0),
         COALESCE(pp.net, 0) - COALESCE(pr.paid, 0),
         COALESCE(pp.n, 0)::integer,
         (SELECT p.id FROM public.subcontract_periods p
           WHERE p.subcontractor_id = sc.id AND p.deleted_at IS NULL AND p.status <> 'da_xac_nhan'
           LIMIT 1),
         (SELECT p.quality_rating FROM public.subcontract_periods p
           WHERE p.subcontractor_id = sc.id AND p.status = 'da_xac_nhan' AND p.deleted_at IS NULL
           ORDER BY p.period_no DESC LIMIT 1)
    FROM public.subcontractors sc
    LEFT JOIN LATERAL (
      SELECT sum(p.gross_amount)::bigint AS gross, sum(p.retention_amount)::bigint AS retention,
             sum(p.net_amount)::bigint AS net, count(*) AS n
        FROM public.subcontract_periods p
       WHERE p.subcontractor_id = sc.id AND p.status = 'da_xac_nhan' AND p.deleted_at IS NULL
    ) pp ON true
    LEFT JOIN LATERAL (
      SELECT sum(r.amount) FILTER (WHERE r.stage NOT IN ('tu_choi', 'huy'))::bigint AS requested,
             sum(r.paid_amount) FILTER (WHERE r.stage IN ('da_chi', 'da_hach_toan'))::bigint AS paid
        FROM public.payment_requests r
       WHERE r.subcontractor_id = sc.id AND r.deleted_at IS NULL
    ) pr ON true
   WHERE sc.construction_site_id = p_site_id AND sc.deleted_at IS NULL
     AND public.rls_site_readable(p_site_id)
   ORDER BY sc.created_at;
$$;
REVOKE ALL ON FUNCTION public.subcontractor_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subcontractor_ledger(uuid) TO authenticated;
COMMENT ON FUNCTION public.subcontractor_ledger(uuid) IS
  'Sổ theo dõi tổ đội (T5, 0246): giá trị khoán, đã xác nhận (trước / sau giữ lại bảo hành), đã đề nghị, đã chi, còn lại. Không có giá trị hợp đồng với khách.';

-- ----------------------------------------------------------------------------
-- 15. Cổng thanh toán tổ đội / thầu phụ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_requests_subcontract_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per        record;
  acc        record;
  sc         record;
  v_ctype    text;
  v_cap      bigint;
  v_used     bigint;
  v_in_period text;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.stage IN ('tu_choi', 'huy') OR NEW.request_type <> 'thanh_toan' THEN
    RETURN NEW;
  END IF;
  -- Sửa hồ sơ đã qua bước nháp mà không đụng tới số tiền / căn cứ (Kế toán ghi đã chi, hạch toán…):
  -- không kiểm lại — số đã kiểm lúc lập và lúc gửi.
  IF TG_OP = 'UPDATE'
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id
     AND NEW.subcontractor_id IS NOT DISTINCT FROM OLD.subcontractor_id
     AND NEW.subcontract_period_id IS NOT DISTINCT FROM OLD.subcontract_period_id
     AND NEW.acceptance_record_id IS NOT DISTINCT FROM OLD.acceptance_record_id
     AND NOT (OLD.stage IN ('nhap', 'tu_choi') AND NEW.stage NOT IN ('nhap', 'tu_choi')) THEN
    RETURN NEW;
  END IF;

  IF NEW.subcontract_period_id IS NOT NULL THEN
    SELECT * INTO per FROM public.subcontract_periods WHERE id = NEW.subcontract_period_id FOR UPDATE;
    IF NEW.subcontractor_id IS NULL THEN NEW.subcontractor_id := per.subcontractor_id; END IF;
    IF NEW.subcontractor_id <> per.subcontractor_id THEN
      RAISE EXCEPTION 'Đợt xác nhận khối lượng không thuộc tổ đội của đề nghị này.';
    END IF;
  END IF;
  IF NEW.acceptance_record_id IS NOT NULL THEN
    SELECT * INTO acc FROM public.acceptance_records WHERE id = NEW.acceptance_record_id FOR UPDATE;
    IF NEW.subcontractor_id IS NULL THEN NEW.subcontractor_id := acc.subcontractor_id; END IF;
  END IF;
  IF NEW.contract_id IS NOT NULL THEN
    SELECT c.type::text INTO v_ctype FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF NEW.subcontractor_id IS NULL AND v_ctype = 'khoan_thau_phu' THEN
      SELECT x.id INTO NEW.subcontractor_id FROM public.subcontractors x
       WHERE x.contract_id = NEW.contract_id AND x.deleted_at IS NULL
       ORDER BY x.created_at LIMIT 1;
    END IF;
  END IF;

  -- Không phải khoản trả cho tổ đội / thầu phụ: luật cũ (nhà cung cấp theo đơn hàng / giao nhận).
  IF NEW.subcontractor_id IS NULL AND v_ctype IS DISTINCT FROM 'khoan_thau_phu' THEN
    RETURN NEW;
  END IF;

  IF NEW.subcontract_period_id IS NULL AND NEW.acceptance_record_id IS NULL THEN
    RAISE EXCEPTION 'Đề nghị thanh toán cho tổ đội / thầu phụ phải gắn đợt xác nhận khối lượng đã xác nhận, hoặc biên bản nghiệm thu tổ đội đã ký hai bên — không thanh toán theo lời nói hay tin nhắn. Lập đề nghị từ đợt khối lượng của tổ đội.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.subcontractor_id IS NOT NULL THEN
    SELECT * INTO sc FROM public.subcontractors WHERE id = NEW.subcontractor_id;
    IF sc.company_id <> NEW.company_id THEN
      RAISE EXCEPTION 'Tổ đội thuộc pháp nhân khác với đề nghị thanh toán.';
    END IF;
    IF NEW.contract_id IS NULL THEN
      NEW.contract_id := sc.contract_id;
    ELSIF sc.contract_id IS NOT NULL AND sc.contract_id <> NEW.contract_id THEN
      RAISE EXCEPTION 'Hợp đồng của đề nghị không phải hợp đồng khoán của tổ đội này.';
    END IF;
  END IF;

  IF NEW.subcontract_period_id IS NOT NULL THEN
    IF per.id IS NULL OR per.deleted_at IS NOT NULL OR per.status <> 'da_xac_nhan' THEN
      RAISE EXCEPTION 'Đợt xác nhận khối lượng chưa được Trưởng phòng Thi công xác nhận — chưa thanh toán được.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_cap := per.net_amount;
    v_used := public._subcontract_period_requested(per.id, NEW.id);
    IF NEW.amount > v_cap - v_used THEN
      RAISE EXCEPTION 'Số đề nghị (% đồng) vượt số còn được đề nghị của đợt % (% đồng sau giữ lại bảo hành, đã đề nghị % đồng, còn % đồng).',
        to_char(NEW.amount, 'FM999,999,999,999'), per.code, to_char(v_cap, 'FM999,999,999,999'),
        to_char(v_used, 'FM999,999,999,999'), to_char(v_cap - v_used, 'FM999,999,999,999')
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.subcontractor_id IS NULL THEN
      RAISE EXCEPTION 'Biên bản nghiệm thu chưa gắn tổ đội — không xác định được bên nhận tiền.';
    END IF;
    IF acc.id IS NULL OR acc.deleted_at IS NOT NULL OR acc.status <> 'da_nghiem_thu'
       OR acc.signed_at IS NULL OR acc.acceptance_type <> 'thau_phu' THEN
      RAISE EXCEPTION 'Biên bản căn cứ phải là biên bản nghiệm thu tổ đội đã ký hai bên.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.subcontractor_id IS NOT NULL AND acc.subcontractor_id IS DISTINCT FROM NEW.subcontractor_id THEN
      RAISE EXCEPTION 'Biên bản nghiệm thu là của tổ đội khác.';
    END IF;
    IF acc.value IS NULL OR acc.value <= 0 THEN
      RAISE EXCEPTION 'Biên bản % chưa ghi giá trị khối lượng — không có số để thanh toán.', acc.code;
    END IF;
    -- Biên bản đã nằm trong một đợt khối lượng thì trả theo đợt, không trả hai lần.
    SELECT p.code INTO v_in_period
      FROM public.subcontract_period_lines pl
      JOIN public.subcontract_periods p ON p.id = pl.period_id AND p.deleted_at IS NULL
     WHERE pl.acceptance_record_id = acc.id AND NOT pl.excluded
     LIMIT 1;
    IF v_in_period IS NOT NULL THEN
      RAISE EXCEPTION 'Biên bản % đã nằm trong đợt xác nhận khối lượng % — lập đề nghị theo đợt đó.',
        acc.code, v_in_period;
    END IF;
    v_cap := acc.value - CASE WHEN sc.retention_rate IS NULL THEN 0
                              ELSE round(acc.value * sc.retention_rate / 100)::bigint END;
    SELECT COALESCE(sum(pr.amount), 0)::bigint INTO v_used
      FROM public.payment_requests pr
     WHERE pr.acceptance_record_id = acc.id AND pr.deleted_at IS NULL
       AND pr.stage NOT IN ('tu_choi', 'huy') AND pr.id <> NEW.id;
    IF NEW.amount > v_cap - v_used THEN
      RAISE EXCEPTION 'Số đề nghị (% đồng) vượt số còn được đề nghị của biên bản % (còn % đồng).',
        to_char(NEW.amount, 'FM999,999,999,999'), acc.code, to_char(v_cap - v_used, 'FM999,999,999,999')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_requests_subcontract_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payment_requests_subcontract_gate ON public.payment_requests;
CREATE TRIGGER payment_requests_subcontract_gate
  BEFORE INSERT OR UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_subcontract_gate();
COMMENT ON FUNCTION public.payment_requests_subcontract_gate() IS
  'G2 (0246): đề nghị thanh toán cho tổ đội / thầu phụ (gắn tổ đội hoặc hợp đồng khoan_thau_phu) phải gắn đợt khối lượng đã xác nhận hoặc biên bản nghiệm thu tổ đội đã ký; số tiền không vượt phần còn lại. Nhà cung cấp giữ luật cũ.';

-- Lập sẵn đề nghị thanh toán từ đợt đã xác nhận — số còn lại, bên nhận, hợp đồng, dòng phân bổ.
CREATE OR REPLACE FUNCTION public.create_payment_request_from_period(p_period_id uuid, p_due_date date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  p        record;
  sc       record;
  b        record;
  v_left   bigint;
  v_req    uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT x.*, cs.code AS site_code INTO p
    FROM public.subcontract_periods x
    JOIN public.construction_sites cs ON cs.id = x.construction_site_id
   WHERE x.id = p_period_id AND x.deleted_at IS NULL;
  IF p.id IS NULL OR NOT public.rls_subcontract_period_readable(p.id) THEN
    RAISE EXCEPTION 'Không tìm thấy đợt xác nhận khối lượng.';
  END IF;
  IF NOT public.auth_can_create_in('KT', p.company_id) OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được lập đề nghị thanh toán.' USING ERRCODE = '42501';
  END IF;
  IF p.status <> 'da_xac_nhan' THEN
    RAISE EXCEPTION 'Đợt % chưa được xác nhận — chưa lập đề nghị thanh toán được.', p.code;
  END IF;
  v_left := p.net_amount - public._subcontract_period_requested(p.id);
  IF v_left <= 0 THEN
    RAISE EXCEPTION 'Đợt % đã đề nghị thanh toán đủ số tiền.', p.code;
  END IF;
  SELECT * INTO sc FROM public.subcontractors WHERE id = p.subcontractor_id;
  IF sc.cost_code IS NULL THEN
    RAISE EXCEPTION 'Tổ đội chưa gắn dòng ngân sách — ghi dòng ngân sách ở trang tổ đội trước.';
  END IF;
  SELECT * INTO b FROM public._site_budget_line_remaining(p.construction_site_id, sc.cost_code);
  IF NOT b.found THEN
    RAISE EXCEPTION 'Mã chi phí % của tổ đội không có trong ngân sách công trình.', sc.cost_code;
  END IF;

  INSERT INTO public.payment_requests (
    company_id, request_type, title, stage, amount, department, origin_module, payee_name,
    contract_id, subcontractor_id, subcontract_period_id, due_date, notes)
  VALUES (p.company_id, 'thanh_toan',
          format('Thanh toán khối lượng đợt %s — %s (%s)', p.period_no, sc.name, p.site_code),
          'nhap', v_left, 'Thi công', 'TC', sc.name, sc.contract_id, sc.id, p.id, p_due_date,
          format('Căn cứ: đợt xác nhận khối lượng %s, tổ trưởng %s ký, đã xác nhận.', p.code, p.crew_signer_name))
  RETURNING id INTO v_req;

  INSERT INTO public.payment_request_allocations (payment_request_id, construction_site_id, cost_code,
                                                  cost_group, amount, basis)
  VALUES (v_req, p.construction_site_id, sc.cost_code, COALESCE(b.cost_group, 'thau_phu'), v_left,
          format('Đợt xác nhận khối lượng %s', p.code));
  RETURN v_req;
END;
$$;
REVOKE ALL ON FUNCTION public.create_payment_request_from_period(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_request_from_period(uuid, date) TO authenticated;
COMMENT ON FUNCTION public.create_payment_request_from_period(uuid, date) IS
  'Lập đề nghị thanh toán (Nháp) từ đợt khối lượng đã xác nhận: số còn lại của đợt, bên nhận = tổ đội, hợp đồng khoán, dòng phân bổ theo dòng ngân sách của tổ đội (G2, 0246).';

-- ----------------------------------------------------------------------------
-- 16. decide_approval — chép NGUYÊN VĂN bản 0245, thêm nhánh chọn thầu phụ (subcontract_selections)
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
  ELSIF a.entity_type = 'subcontract_selections' THEN
    /*
     * G2 (0246): chọn thầu phụ / tổ đội. Duyệt → tạo / cập nhật tổ đội của công trình (khoán gọn tự
     * có dòng trọn gói), báo người gửi và người soạn hợp đồng của pháp nhân (soạn hợp đồng khoán).
     * Từ chối → «Bị từ chối» kèm ý kiến; Ban công trường sửa báo giá rồi gửi lại.
     */
    IF p_decision = 'approved' THEN
      PERFORM public._apply_subcontract_selection(a.entity_id);
      PERFORM public.create_notification(
        u.id, a.company_id, 'subcontract_selection_approved',
        format('Chọn thầu phụ %s đã được duyệt — soạn hợp đồng khoán.', COALESCE(a.entity_code, '')),
        'subcontract_selections', a.entity_id, '/hd/hop-dong?thau-phu=1'
      )
      FROM public.users u
      WHERE u.is_active AND u.deleted_at IS NULL
        AND u.id IS DISTINCT FROM a.requested_by
        AND EXISTS (SELECT 1 FROM public.user_companies uc
                      JOIN public.permissions pm ON pm.role_id = uc.role_id
                     WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = a.company_id
                       AND pm.module_code = 'HD' AND pm.can_create);
    ELSE
      UPDATE public.subcontract_selections
         SET status = 'tu_choi', decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'subcontract_selection_approved' ELSE 'subcontract_selection_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Chọn thầu phụ %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Chọn thầu phụ %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'subcontract_selections', a.entity_id, '/tc/chon-thau-phu/' || a.entity_id
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
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179), báo giá thuê + thuê nội bộ giàn giáo (0245), chọn thầu phụ (0246).';


-- ----------------------------------------------------------------------------
-- 17. record_chain — bản 0243 (giữ nguyên chuỗi Cơ hội → … → Công trình), thêm đầu vào
--     'payment_request', 'subcontract_period', 'subcontractor' và ba mắt xích sau công trình:
--     tổ đội → đợt khối lượng → đề nghị thanh toán; hợp đồng khoán của tổ đội nằm trong mắt «Hợp
--     đồng». Bấm ngược từ một khoản chi tới căn cứ của nó (A4 «Xong khi»). Vẫn chỉ trả hồ sơ người
--     gọi được xem.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_chain(p_entity_type text, p_id uuid)
RETURNS TABLE (kind text, id uuid, code text, title text, stage text, scope_kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type      text := p_entity_type;
  v_id        uuid := p_id;
  v_pr        uuid;
  v_pr_contract uuid;
  v_period    uuid;
  v_sub       uuid;
  v_site      uuid;
  v_extra_contracts uuid[] := '{}';
  v_opp       uuid;
  v_bids      uuid[];
  v_designs   uuid[];
  v_contracts uuid[];
BEGIN
  -- 0246: hồ sơ phía chi trả cho tổ đội → quy về công trình của nó.
  IF p_entity_type = 'payment_request' THEN
    v_pr := p_id;
    SELECT pr.subcontract_period_id, pr.subcontractor_id,
           COALESCE((SELECT a.construction_site_id FROM public.acceptance_records a WHERE a.id = pr.acceptance_record_id),
                    (SELECT al.construction_site_id FROM public.payment_request_allocations al
                      WHERE al.payment_request_id = pr.id AND al.construction_site_id IS NOT NULL
                      ORDER BY al.created_at LIMIT 1)),
           pr.contract_id
      INTO v_period, v_sub, v_site, v_pr_contract
      FROM public.payment_requests pr WHERE pr.id = p_id AND pr.deleted_at IS NULL;
    v_extra_contracts := ARRAY[v_pr_contract];
  ELSIF p_entity_type = 'subcontract_period' THEN
    v_period := p_id;
    SELECT p.subcontractor_id INTO v_sub FROM public.subcontract_periods p WHERE p.id = p_id;
  ELSIF p_entity_type = 'subcontractor' THEN
    v_sub := p_id;
  ELSIF p_entity_type = 'contract' THEN
    -- Hợp đồng khoán: chuỗi đi qua tổ đội tới công trình.
    SELECT x.id INTO v_sub FROM public.subcontractors x
     WHERE x.contract_id = p_id AND x.deleted_at IS NULL ORDER BY x.created_at LIMIT 1;
    IF v_sub IS NOT NULL THEN
      v_extra_contracts := ARRAY[p_id];
    END IF;
  END IF;
  IF v_period IS NOT NULL AND v_sub IS NULL THEN
    SELECT p.subcontractor_id INTO v_sub FROM public.subcontract_periods p WHERE p.id = v_period;
  END IF;
  IF v_sub IS NOT NULL THEN
    SELECT x.construction_site_id, COALESCE(v_extra_contracts, '{}') || x.contract_id
      INTO v_site, v_extra_contracts
      FROM public.subcontractors x WHERE x.id = v_sub;
  END IF;
  v_extra_contracts := array_remove(COALESCE(v_extra_contracts, '{}'), NULL);
  IF v_site IS NOT NULL THEN
    v_type := 'site';
    v_id := v_site;
  END IF;

  v_opp := public.chain_origin_opportunity(v_type, v_id);

  IF v_opp IS NOT NULL THEN
    SELECT array_agg(b.id) INTO v_bids
      FROM public.bidding_projects b WHERE b.opportunity_id = v_opp AND b.deleted_at IS NULL;
    SELECT array_agg(d.id) INTO v_designs
      FROM public.design_projects d WHERE d.opportunity_id = v_opp AND d.deleted_at IS NULL;
  ELSIF v_type = 'bidding' THEN
    v_bids := ARRAY[v_id];
  ELSIF v_type = 'design' THEN
    v_designs := ARRAY[v_id];
  END IF;

  SELECT array_agg(c.id) INTO v_contracts
    FROM public.contracts c
   WHERE c.deleted_at IS NULL
     AND (
       (c.source_type = 'opportunities' AND c.source_id = v_opp)
       OR (c.source_type = 'bidding_projects' AND c.source_id = ANY (COALESCE(v_bids, '{}')))
       OR (c.source_type = 'design_projects' AND c.source_id = ANY (COALESCE(v_designs, '{}')))
       OR (v_type = 'contract' AND c.id = v_id)
       OR (v_type = 'site' AND c.id = (SELECT s.contract_id FROM public.construction_sites s WHERE s.id = v_id))
     );

  RETURN QUERY
  SELECT 'opportunity'::text, o.id, o.code::text, o.name::text, o.stage::text, NULL::text
    FROM public.opportunities o
   WHERE o.id = v_opp AND o.deleted_at IS NULL
     AND public.rls_company_access(o.company_id) AND public.auth_can_view_module('CRM');

  RETURN QUERY
  SELECT 'bidding'::text, b.id, b.code::text, b.name::text, b.stage::text, NULL::text
    FROM public.bidding_projects b
   WHERE b.id = ANY (COALESCE(v_bids, '{}')) AND public.rls_bidding_project_readable(b.id)
   ORDER BY b.created_at;

  RETURN QUERY
  SELECT 'design'::text, d.id, d.code::text, d.name::text, d.stage::text, NULL::text
    FROM public.design_projects d
   WHERE d.id = ANY (COALESCE(v_designs, '{}')) AND public.rls_design_project_readable(d.id)
   ORDER BY d.created_at;

  -- Hợp đồng với khách trước, hợp đồng khoán của tổ đội sau.
  RETURN QUERY
  SELECT 'contract'::text, c.id, COALESCE(c.contract_number, c.code)::text, c.title::text, c.stage::text,
         c.scope_kind
    FROM public.contracts c
   WHERE c.id = ANY (COALESCE(v_contracts, '{}')) AND NOT c.id = ANY (v_extra_contracts)
     AND public.rls_contract_readable(c.id)
   ORDER BY c.created_at;

  RETURN QUERY
  SELECT 'site'::text, s.id, s.code::text, s.name::text, s.stage::text, NULL::text
    FROM public.construction_sites s
   WHERE s.deleted_at IS NULL
     AND (s.contract_id = ANY (COALESCE(v_contracts, '{}'))
          OR s.bidding_project_id = ANY (COALESCE(v_bids, '{}'))
          OR s.design_project_id = ANY (COALESCE(v_designs, '{}'))
          OR (v_type = 'site' AND s.id = v_id))
     AND public.rls_site_readable(s.id)
   ORDER BY s.created_at;

  RETURN QUERY
  SELECT 'contract'::text, c.id, COALESCE(c.contract_number, c.code)::text, c.title::text, c.stage::text,
         c.scope_kind
    FROM public.contracts c
   WHERE c.id = ANY (v_extra_contracts) AND c.deleted_at IS NULL AND public.rls_contract_readable(c.id)
   ORDER BY c.created_at;

  RETURN QUERY
  SELECT 'subcontractor'::text, x.id, NULL::text, x.name::text, x.status::text, x.pricing_method::text
    FROM public.subcontractors x
   WHERE x.id = v_sub AND x.deleted_at IS NULL
     AND (public.rls_site_readable(x.construction_site_id) OR public.rls_sees_subcontract_finance(x.company_id));

  RETURN QUERY
  SELECT 'subcontract_period'::text, p.id, p.code::text, ('Đợt ' || p.period_no)::text, p.status::text, NULL::text
    FROM public.subcontract_periods p
   WHERE p.id = v_period AND public.rls_subcontract_period_readable(p.id);

  RETURN QUERY
  SELECT 'payment_request'::text, pr.id, pr.code::text, pr.title::text, pr.stage::text, NULL::text
    FROM public.payment_requests pr
   WHERE pr.id = v_pr AND public.rls_payment_request_readable(pr.id);
END;
$$;
COMMENT ON FUNCTION public.record_chain(text, uuid) IS
  'Chuỗi Cơ hội → Gói thầu/Thiết kế → Hợp đồng → Công trình của một hồ sơ, CHỈ gồm hồ sơ người '
  'gọi được xem (0159). Hợp đồng kèm scope_kind thiết kế / thi công / trọn gói (0243). 0246: thêm '
  'tổ đội → hợp đồng khoán → đợt khối lượng → đề nghị thanh toán (đầu vào payment_request / '
  'subcontract_period / subcontractor; tổ đội trả cách khoán ở cột scope_kind).';

REVOKE ALL ON FUNCTION public.record_chain(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_chain(text, uuid) TO authenticated;
