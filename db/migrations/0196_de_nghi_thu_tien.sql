-- ============================================================================
-- Đợt 3 — 3B: đề nghị thu tiền tự điền từ biên bản nghiệm thu đã ký (doc/KE_HOACH_LAM_HO.md).
--
-- Trước đây Kế toán nhận thông báo «biên bản đã ký» rồi tự mở Word, gõ lại số hợp đồng, số biên
-- bản, số tiền, đọc số thành chữ để lập hồ sơ đề nghị thanh toán gửi chủ đầu tư. `payment_requests`
-- là đề nghị CHI (NVG trả tiền ra, qua bốn bước kiểm) — không dùng cho chiều thu.
--
-- Nay `collection_requests` — đề nghị thu tiền (hồ sơ đề nghị thanh toán gửi chủ đầu tư):
--   · Một bấm từ biên bản đã ký (hoặc từ đợt thu đã đến hạn, 3A) → bản NHÁP: số tiền theo đợt thu
--     gắn biên bản, không có thì theo giá trị biên bản; căn cứ (số hợp đồng, biên bản, mốc / đợt)
--     máy soạn. Bấm lại thì mở bản đang có, không lập trùng.
--   · Kế toán kiểm, sửa (số tiền, hạn, căn cứ), in, đính kèm bản quét, ghi «đã gửi khách».
--   · «Ghi công nợ» là bước Kế toán xác nhận: lúc đó mới sinh khoản phải thu (`receivables_payables`)
--     và biên bản được đánh dấu đã ghi nhận. Máy không tự ghi công nợ.
-- Quyền: Mẫu A theo pháp nhân trên phân hệ Kế toán; sửa = Kế toán (quyền sửa KT), không KSNB.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code                 varchar(40) NOT NULL,
  contract_id          uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  construction_site_id uuid REFERENCES public.construction_sites(id) ON DELETE SET NULL,
  acceptance_record_id uuid REFERENCES public.acceptance_records(id) ON DELETE SET NULL,
  contract_term_id     uuid REFERENCES public.contract_terms(id) ON DELETE SET NULL,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  party_name           text,
  title                text NOT NULL,
  amount               bigint NOT NULL CHECK (amount > 0),
  basis                text NOT NULL,
  content              text,
  due_date             date,
  status               text NOT NULL DEFAULT 'nhap'
    CHECK (status IN ('nhap', 'da_gui', 'da_ghi_cong_no', 'huy')),
  sent_at              timestamptz,
  sent_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  receivable_id        uuid REFERENCES public.receivables_payables(id) ON DELETE SET NULL,
  recorded_at          timestamptz,
  recorded_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scan_path            text,
  cancel_reason        text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_requests_code ON public.collection_requests (code);
CREATE UNIQUE INDEX IF NOT EXISTS collection_requests_one_per_acceptance
  ON public.collection_requests (acceptance_record_id)
  WHERE acceptance_record_id IS NOT NULL AND status <> 'huy';
CREATE UNIQUE INDEX IF NOT EXISTS collection_requests_one_per_term
  ON public.collection_requests (contract_term_id)
  WHERE contract_term_id IS NOT NULL AND status <> 'huy';
CREATE INDEX IF NOT EXISTS collection_requests_list_idx
  ON public.collection_requests (company_id, status, created_at DESC);

COMMENT ON TABLE public.collection_requests IS
  'Đề nghị thu tiền gửi chủ đầu tư (3B, 0196). Máy soạn nháp từ biên bản đã ký; Kế toán sửa, gửi, ghi công nợ.';

ALTER TABLE public.collection_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_requests FROM anon;
REVOKE INSERT, DELETE ON public.collection_requests FROM authenticated;

DROP POLICY IF EXISTS collection_requests_select ON public.collection_requests;
CREATE POLICY collection_requests_select ON public.collection_requests
  FOR SELECT TO authenticated
  USING (public.auth_can_view_module('KT') AND public.rls_company_access(company_id));

DROP POLICY IF EXISTS collection_requests_update ON public.collection_requests;
CREATE POLICY collection_requests_update ON public.collection_requests
  FOR UPDATE TO authenticated
  USING (NOT public.auth_is_read_only() AND public.auth_can_edit_module('KT')
         AND public.rls_company_access(company_id))
  WITH CHECK (public.rls_company_access(company_id));

SELECT public.attach_audit_touch('public.collection_requests');

-- Trình duyệt chỉ sửa nội dung bản NHÁP (và đính kèm bản quét khi chưa hủy). Mọi đổi trạng thái,
-- số chứng từ, khoản phải thu đi qua hàm (cờ giao dịch `nvg.collection_request`).
CREATE OR REPLACE FUNCTION public.collection_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('nvg.collection_request', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.acceptance_record_id IS DISTINCT FROM OLD.acceptance_record_id
     OR NEW.contract_term_id IS DISTINCT FROM OLD.contract_term_id
     OR NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
     OR NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.sent_by IS DISTINCT FROM OLD.sent_by
     OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
    RAISE EXCEPTION 'Trạng thái đề nghị thu chỉ đổi bằng các nút Gửi / Ghi công nợ / Hủy.';
  END IF;
  IF OLD.status <> 'nhap' AND (
       NEW.amount IS DISTINCT FROM OLD.amount OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.basis IS DISTINCT FROM OLD.basis OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.party_name IS DISTINCT FROM OLD.party_name) THEN
    RAISE EXCEPTION 'Đề nghị thu đã gửi khách — không sửa nội dung. Cần đổi thì hủy và lập bản mới.';
  END IF;
  IF OLD.status = 'huy' AND NEW.scan_path IS DISTINCT FROM OLD.scan_path THEN
    RAISE EXCEPTION 'Đề nghị thu đã hủy.';
  END IF;
  IF NEW.scan_path IS DISTINCT FROM OLD.scan_path AND NEW.scan_path IS NOT NULL
     AND (left(NEW.scan_path, length(NEW.id::text) + 1) <> NEW.id::text || '/'
          OR NOT EXISTS (SELECT 1 FROM storage.objects o
                          WHERE o.bucket_id = 'collection-docs' AND o.name = NEW.scan_path)) THEN
    RAISE EXCEPTION 'Tệp đính kèm không thuộc đề nghị thu này — tải lại.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_requests_guard ON public.collection_requests;
CREATE TRIGGER collection_requests_guard
  BEFORE UPDATE ON public.collection_requests
  FOR EACH ROW EXECUTE FUNCTION public.collection_requests_guard();

-- Kho bản quét: `<đề nghị>/<tệp>`; đọc theo quyền xem đề nghị, tải lên khi sửa được, không xoá.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('collection-docs', 'collection-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.rls_collection_request_access(p_id uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collection_requests r
     WHERE r.id = p_id AND public.rls_company_access(r.company_id)
       AND public.auth_can_view_module('KT')
       AND (NOT p_write OR (r.status <> 'huy' AND NOT public.auth_is_read_only()
                            AND public.auth_can_edit_module('KT')))
  );
$$;

REVOKE ALL ON FUNCTION public.rls_collection_request_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_collection_request_access(uuid, boolean) TO authenticated;

DROP POLICY IF EXISTS collection_docs_select ON storage.objects;
CREATE POLICY collection_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'collection-docs'
         AND public.rls_collection_request_access(public.try_uuid((storage.foldername(name))[1]), false));

DROP POLICY IF EXISTS collection_docs_insert ON storage.objects;
CREATE POLICY collection_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'collection-docs'
              AND public.rls_collection_request_access(public.try_uuid((storage.foldername(name))[1]), true));

-- ----------------------------------------------------------------------------
-- Lập nháp — một bấm. Đã có bản chưa hủy cho biên bản / đợt thì trả lại bản đó.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_collection_request(
  p_acceptance_id uuid DEFAULT NULL,
  p_term_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  a          record;
  t          record;
  c          record;
  s          record;
  m          record;
  v_existing uuid;
  v_amount   bigint;
  v_basis    text;
  v_title    text;
  v_id       uuid;
  v_site     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO a FROM public.acceptance_records WHERE false;
  SELECT * INTO t FROM public.contract_terms WHERE false;
  SELECT * INTO c FROM public.contracts WHERE false;
  SELECT NULL::text AS label, NULL::timestamptz AS passed_at, NULL::uuid AS site_id, NULL::text AS site_code INTO m;
  IF p_acceptance_id IS NULL AND p_term_id IS NULL THEN
    RAISE EXCEPTION 'Chọn biên bản nghiệm thu hoặc đợt thu để lập đề nghị.';
  END IF;

  IF p_acceptance_id IS NOT NULL THEN
    SELECT * INTO a FROM public.acceptance_records WHERE id = p_acceptance_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy biên bản nghiệm thu.';
    END IF;
    IF a.acceptance_type <> 'khach_hang' OR a.status <> 'da_nghiem_thu' OR a.signed_at IS NULL THEN
      RAISE EXCEPTION 'Chỉ lập đề nghị thu từ biên bản nghiệm thu với chủ đầu tư đã ký hai bên.';
    END IF;
    SELECT * INTO s FROM public.construction_sites WHERE id = a.construction_site_id;
    IF s.contract_id IS NULL THEN
      RAISE EXCEPTION 'Công trình của biên bản chưa gắn hợp đồng — không có căn cứ lập đề nghị thu.';
    END IF;
    SELECT * INTO t FROM public.contract_terms ct
     WHERE ct.acceptance_record_id = a.id AND ct.deleted_at IS NULL
     ORDER BY ct.completed_at NULLS FIRST LIMIT 1;
    IF NOT FOUND AND p_term_id IS NOT NULL THEN
      SELECT * INTO t FROM public.contract_terms WHERE id = p_term_id AND deleted_at IS NULL;
    END IF;
    SELECT * INTO c FROM public.contracts WHERE id = s.contract_id;
    v_site := s.id;
  ELSE
    SELECT * INTO t FROM public.contract_terms WHERE id = p_term_id AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy đợt thu.';
    END IF;
    SELECT * INTO c FROM public.contracts WHERE id = t.contract_id;
    IF t.acceptance_record_id IS NOT NULL THEN
      RETURN public.create_collection_request(t.acceptance_record_id, t.id);
    END IF;
    IF t.site_milestone_id IS NOT NULL THEN
      SELECT sm.label, sm.passed_at, cs.id AS site_id, cs.code AS site_code INTO m
        FROM public.site_milestones sm JOIN public.construction_sites cs ON cs.id = sm.construction_site_id
       WHERE sm.id = t.site_milestone_id;
      v_site := m.site_id;
    END IF;
  END IF;

  IF c.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;
  IF public.auth_is_read_only() OR NOT public.auth_can_edit_module('KT')
     OR NOT public.rls_company_access(c.company_id) THEN
    RAISE EXCEPTION 'Chỉ Kế toán của pháp nhân lập được đề nghị thu tiền.';
  END IF;
  IF c.stage NOT IN ('da_ky', 'hoan_thanh') THEN
    RAISE EXCEPTION 'Hợp đồng chưa ký — chưa lập đề nghị thu được.';
  END IF;

  SELECT r.id INTO v_existing FROM public.collection_requests r
   WHERE r.status <> 'huy'
     AND ((p_acceptance_id IS NOT NULL AND r.acceptance_record_id = p_acceptance_id)
          OR (t.id IS NOT NULL AND r.contract_term_id = t.id))
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF t.id IS NOT NULL AND t.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Đợt thu này đã hoàn thành.';
  END IF;

  v_amount := COALESCE(public.contract_term_amount(t.amount, t.percent_value, c.value), a.value);
  IF COALESCE(v_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Chưa có số tiền: đợt thu chưa ghi số tiền / tỷ lệ và biên bản chưa ghi giá trị.';
  END IF;

  v_basis := format('Căn cứ Hợp đồng số %s%s.', COALESCE(c.contract_number, c.code),
                    CASE WHEN c.signed_date IS NOT NULL
                         THEN ' ký ngày ' || to_char(c.signed_date, 'DD/MM/YYYY') ELSE '' END);
  IF a.id IS NOT NULL THEN
    v_basis := v_basis || format(E'\nCăn cứ Biên bản nghiệm thu %s ngày %s — %s, giá trị nghiệm thu %s đồng, hai bên đã ký ngày %s.',
      a.code, to_char(a.accepted_date, 'DD/MM/YYYY'), a.stage_name,
      replace(to_char(a.value, 'FM999,999,999,999'), ',', '.'),
      to_char(a.signed_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'));
  END IF;
  IF m.label IS NOT NULL THEN
    v_basis := v_basis || format(E'\nMốc thi công «%s» (công trình %s) đã đạt ngày %s.',
      m.label, m.site_code, to_char(m.passed_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'));
  END IF;
  IF t.id IS NOT NULL THEN
    v_basis := v_basis || format(E'\nĐợt thanh toán theo hợp đồng: %s%s.', btrim(t.description),
      CASE WHEN t.percent_value IS NOT NULL AND t.amount IS NULL THEN ' (' || t.percent_value || '% giá trị hợp đồng)' ELSE '' END);
  END IF;
  v_title := 'Đề nghị thanh toán — ' || COALESCE(btrim(t.description), a.stage_name);

  PERFORM set_config('nvg.collection_request', 'on', true);
  INSERT INTO public.collection_requests (
    company_id, code, contract_id, construction_site_id, acceptance_record_id, contract_term_id,
    customer_id, party_name, title, amount, basis, due_date, created_by, updated_by
  ) VALUES (
    c.company_id,
    public.issue_record_code((SELECT code FROM public.companies WHERE id = c.company_id), 'DNTH'),
    c.id, v_site, a.id, t.id, c.customer_id,
    (SELECT cu.name FROM public.customers cu WHERE cu.id = c.customer_id),
    v_title, v_amount, v_basis, t.due_date, v_user, v_user
  )
  RETURNING id INTO v_id;
  PERFORM set_config('nvg.collection_request', '', true);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_collection_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_collection_request(uuid, uuid) TO authenticated;

-- Kiểm chung cho ba nút trạng thái.
CREATE OR REPLACE FUNCTION public.collection_request_for_action(p_id uuid)
RETURNS public.collection_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.collection_requests;
BEGIN
  SELECT * INTO r FROM public.collection_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR public.auth_user_id() IS NULL OR public.auth_is_read_only()
     OR NOT public.auth_can_edit_module('KT') OR NOT public.rls_company_access(r.company_id) THEN
    RAISE EXCEPTION 'Chỉ Kế toán của pháp nhân thao tác được đề nghị thu này.';
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.collection_request_for_action(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_collection_request(p_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r     public.collection_requests := public.collection_request_for_action(p_id);
  v_now timestamptz := now();
BEGIN
  IF r.status <> 'nhap' THEN
    RAISE EXCEPTION 'Chỉ ghi «đã gửi» cho đề nghị đang nháp.';
  END IF;
  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET status = 'da_gui', sent_at = v_now, sent_by = public.auth_user_id()
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);
  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.send_collection_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_collection_request(uuid) TO authenticated;

-- Kế toán xác nhận → sinh khoản phải thu; biên bản được đánh dấu đã ghi nhận.
CREATE OR REPLACE FUNCTION public.record_collection_receivable(
  p_id uuid, p_due_date date DEFAULT NULL, p_invoice_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      public.collection_requests := public.collection_request_for_action(p_id);
  v_user uuid := public.auth_user_id();
  v_rp   uuid;
BEGIN
  IF r.status NOT IN ('nhap', 'da_gui') THEN
    RAISE EXCEPTION 'Đề nghị này đã ghi công nợ hoặc đã hủy.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Chỉ Kế toán / Tài chính ghi được công nợ.';
  END IF;
  INSERT INTO public.receivables_payables (
    company_id, direction, party_type, customer_id, party_name, contract_id, construction_site_id,
    invoice_number, description, amount, due_date, created_by, updated_by
  ) VALUES (
    r.company_id, 'phai_thu', 'khach_hang', r.customer_id, r.party_name, r.contract_id,
    r.construction_site_id, NULLIF(btrim(COALESCE(p_invoice_number, '')), ''),
    r.title || ' (' || r.code || ')', r.amount, COALESCE(p_due_date, r.due_date), v_user, v_user
  )
  RETURNING id INTO v_rp;

  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET status = 'da_ghi_cong_no', receivable_id = v_rp, recorded_at = now(), recorded_by = v_user,
         due_date = COALESCE(p_due_date, due_date),
         sent_at = COALESCE(sent_at, now()), sent_by = COALESCE(sent_by, v_user)
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);

  UPDATE public.acceptance_records
     SET billing_recorded_at = now(), billing_recorded_by = v_user,
         billing_note = 'Đề nghị thu ' || r.code
   WHERE id = r.acceptance_record_id AND billing_recorded_at IS NULL;
  RETURN v_rp;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collection_receivable(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_collection_receivable(uuid, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_collection_request(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.collection_requests := public.collection_request_for_action(p_id);
BEGIN
  IF r.status NOT IN ('nhap', 'da_gui') THEN
    RAISE EXCEPTION 'Đề nghị đã ghi công nợ thì không hủy ở đây — điều chỉnh công nợ ở màn hình Công nợ.';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi lý do hủy.';
  END IF;
  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests SET status = 'huy', cancel_reason = btrim(p_reason) WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_collection_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_collection_request(uuid, text) TO authenticated;
