-- ============================================================================
-- Đợt 3 — 3A: đợt thu của hợp đồng gắn vào mốc thi công / biên bản nghiệm thu (doc/KE_HOACH_LAM_HO.md).
--
-- Trước đây đợt thanh toán của hợp đồng (`contract_terms`, loại tạm ứng / tiến độ thanh toán /
-- quyết toán) chỉ có câu chữ «Hoàn thành móng…» và một ngày hạn đoán trước. Mốc đạt hay biên bản
-- ký thì không ai báo Kế toán rằng đã tới lúc đòi tiền đợt đó — Kinh doanh phải nhớ mà gọi.
--
-- Nay:
--   · Mỗi đợt gắn được vào MỘT căn cứ: mốc thi công của công trình thuộc hợp đồng (0182) hoặc biên
--     bản nghiệm thu với chủ đầu tư (0192). Kiểm ở CSDL: căn cứ phải thuộc công trình của chính
--     hợp đồng đó.
--   · Mốc đạt / biên bản ký hai bên → đợt «đến hạn thu» (`collection_due_at`, máy ghi), Kế toán,
--     Giám đốc Tài chính và người chịu trách nhiệm hợp đồng được báo. Gắn vào căn cứ đã đạt thì
--     đến hạn ngay.
--   · Nhắc theo ngày hạn: `kt.collection_remind_days_before` — để TRỐNG (NVG chưa quyết) = không
--     nhắc theo ngày; quét đêm `scan_collection_reminders`.
--   · Danh sách đợt thu cho Kế toán: `kt_collection_schedule` (Kế toán không xem được phân hệ Thi
--     công, nên tên mốc đi qua hàm này, chỉ trả hợp đồng đã ký mà người gọi được xem).
--
-- Không tự ghi công nợ, không tự đánh dấu «đã thu»: số tiền chỉ đổi qua chứng từ Kế toán.
-- ============================================================================

ALTER TABLE public.contract_terms
  ADD COLUMN IF NOT EXISTS site_milestone_id      uuid REFERENCES public.site_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acceptance_record_id   uuid REFERENCES public.acceptance_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collection_due_at      timestamptz,
  ADD COLUMN IF NOT EXISTS collection_reminded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_terms_one_collection_basis') THEN
    ALTER TABLE public.contract_terms
      ADD CONSTRAINT contract_terms_one_collection_basis
      CHECK (num_nonnulls(site_milestone_id, acceptance_record_id) <= 1);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS contract_terms_milestone_idx
  ON public.contract_terms (site_milestone_id) WHERE site_milestone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_terms_acceptance_idx
  ON public.contract_terms (acceptance_record_id) WHERE acceptance_record_id IS NOT NULL;

COMMENT ON COLUMN public.contract_terms.site_milestone_id IS
  'Đợt thu gắn vào mốc thi công (3A, 0195): mốc đạt → đợt đến hạn thu.';
COMMENT ON COLUMN public.contract_terms.acceptance_record_id IS
  'Đợt thu gắn vào biên bản nghiệm thu với chủ đầu tư (3A, 0195): ký hai bên → đợt đến hạn thu.';
COMMENT ON COLUMN public.contract_terms.collection_due_at IS
  'Máy ghi lúc căn cứ của đợt đạt (mốc đạt / biên bản ký). Không sửa tay.';

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'kt.collection_remind_days_before', 'global', NULL, 'Nhắc đợt thu trước hạn (ngày)',
       'Số ngày trước ngày hạn của đợt thanh toán thì nhắc Kế toán và người chịu trách nhiệm hợp đồng. Để trống = không nhắc theo ngày (vẫn báo khi mốc đạt / biên bản ký).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'kt.collection_remind_days_before' AND p.scope_type = 'global'
);

-- ----------------------------------------------------------------------------
-- Ai gắn được căn cứ: người sửa được hợp đồng, hoặc Kế toán của pháp nhân (người đòi tiền).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_contract_collection_editable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_contract_writable(p_contract_id)
      OR (NOT public.auth_is_read_only()
          AND public.auth_can_edit_module('KT')
          AND EXISTS (SELECT 1 FROM public.contracts c
                       WHERE c.id = p_contract_id AND c.deleted_at IS NULL
                         AND c.stage NOT IN ('huy')
                         AND public.rls_company_access(c.company_id)));
$$;

REVOKE ALL ON FUNCTION public.rls_contract_collection_editable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_contract_collection_editable(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Canh: căn cứ thuộc đúng hợp đồng; «đến hạn thu» chỉ máy ghi.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_terms_collection_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system  boolean := COALESCE(current_setting('nvg.collection_due', true), '') = 'on';
  v_changed boolean;
  m         record;
  a         record;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT v_system
     AND (NEW.collection_due_at IS DISTINCT FROM OLD.collection_due_at
          OR NEW.collection_reminded_at IS DISTINCT FROM OLD.collection_reminded_at) THEN
    RAISE EXCEPTION 'Thời điểm đến hạn thu do hệ thống ghi khi mốc đạt / biên bản ký — không sửa tay.';
  END IF;
  IF TG_OP = 'INSERT' AND NOT v_system THEN
    NEW.collection_due_at := NULL;
    NEW.collection_reminded_at := NULL;
  END IF;

  v_changed := CASE WHEN TG_OP = 'INSERT'
                    THEN NEW.site_milestone_id IS NOT NULL OR NEW.acceptance_record_id IS NOT NULL
                    ELSE NEW.site_milestone_id IS DISTINCT FROM OLD.site_milestone_id
                      OR NEW.acceptance_record_id IS DISTINCT FROM OLD.acceptance_record_id END;
  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF (NEW.site_milestone_id IS NOT NULL OR NEW.acceptance_record_id IS NOT NULL)
     AND NEW.term_type NOT IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan') THEN
    RAISE EXCEPTION 'Chỉ đợt tạm ứng, tiến độ thanh toán hoặc quyết toán mới gắn được mốc / biên bản.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Đợt này đã hoàn thành — không đổi căn cứ thu.';
  END IF;

  NEW.collection_due_at := NULL;
  NEW.collection_reminded_at := NULL;

  IF NEW.site_milestone_id IS NOT NULL THEN
    SELECT sm.status, sm.passed_at INTO m
      FROM public.site_milestones sm
      JOIN public.construction_sites s ON s.id = sm.construction_site_id
     WHERE sm.id = NEW.site_milestone_id AND s.contract_id = NEW.contract_id AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mốc được chọn không thuộc công trình của hợp đồng này.';
    END IF;
    IF m.status = 'dat' THEN
      NEW.collection_due_at := COALESCE(m.passed_at, now());
    END IF;
  ELSIF NEW.acceptance_record_id IS NOT NULL THEN
    SELECT ar.signed_at, ar.status INTO a
      FROM public.acceptance_records ar
      JOIN public.construction_sites s ON s.id = ar.construction_site_id
     WHERE ar.id = NEW.acceptance_record_id AND s.contract_id = NEW.contract_id
       AND ar.acceptance_type = 'khach_hang' AND ar.deleted_at IS NULL AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Biên bản được chọn không phải biên bản nghiệm thu với chủ đầu tư của công trình thuộc hợp đồng này.';
    END IF;
    IF a.status <> 'da_nghiem_thu' THEN
      RAISE EXCEPTION 'Biên bản này đã hủy — chọn biên bản khác.';
    END IF;
    NEW.collection_due_at := a.signed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_terms_collection_guard ON public.contract_terms;
CREATE TRIGGER contract_terms_collection_guard
  BEFORE INSERT OR UPDATE ON public.contract_terms
  FOR EACH ROW EXECUTE FUNCTION public.contract_terms_collection_guard();

-- ----------------------------------------------------------------------------
-- Báo khi đợt sang «đến hạn thu».
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_collection_recipients(
  p_term_id uuid, p_type text, p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  SELECT ct.id, ct.company_id, c.responsible_user_id INTO t
    FROM public.contract_terms ct JOIN public.contracts c ON c.id = ct.contract_id
   WHERE ct.id = p_term_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM public.create_notification(
    recipient.id, t.company_id, p_type, p_message, 'contract_terms', t.id, '/kt/dot-thu'
  )
  FROM (
    SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
     WHERE u.is_active AND u.deleted_at IS NULL
       AND (uc.company_id = t.company_id OR r.sees_all_companies)
       AND r.code IN ('KT', 'CFO')
    UNION
    SELECT u.id FROM public.users u
     WHERE u.id = t.responsible_user_id AND u.is_active AND u.deleted_at IS NULL
  ) recipient;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_collection_recipients(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Số tiền của một đợt: số ghi sẵn, không thì tỷ lệ × giá trị hợp đồng (tỷ lệ là số hợp lệ).
CREATE OR REPLACE FUNCTION public.contract_term_amount(p_amount bigint, p_percent text, p_contract_value bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_amount IS NOT NULL THEN p_amount
    WHEN p_contract_value IS NOT NULL
         AND replace(btrim(COALESCE(p_percent, '')), ',', '.') ~ '^[0-9]+(\.[0-9]+)?%?$'
    THEN round(p_contract_value * rtrim(replace(btrim(p_percent), ',', '.'), '%')::numeric / 100)::bigint
  END;
$$;

CREATE OR REPLACE FUNCTION public.contract_terms_collection_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_basis  text;
  v_amount bigint;
BEGIN
  IF NEW.collection_due_at IS NULL OR NEW.completed_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
     OR (TG_OP = 'UPDATE' AND OLD.collection_due_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public.contracts WHERE id = NEW.contract_id;
  IF NOT FOUND OR c.stage NOT IN ('da_ky', 'hoan_thanh') THEN
    RETURN NULL;
  END IF;
  IF NEW.site_milestone_id IS NOT NULL THEN
    SELECT format('mốc «%s» (công trình %s) đã đạt', sm.label, s.code) INTO v_basis
      FROM public.site_milestones sm JOIN public.construction_sites s ON s.id = sm.construction_site_id
     WHERE sm.id = NEW.site_milestone_id;
  ELSE
    SELECT format('biên bản %s (%s) đã ký hai bên', ar.code, ar.stage_name) INTO v_basis
      FROM public.acceptance_records ar WHERE ar.id = NEW.acceptance_record_id;
  END IF;
  v_amount := public.contract_term_amount(NEW.amount, NEW.percent_value, c.value);
  PERFORM public.notify_collection_recipients(
    NEW.id, 'collection_due',
    format('Đợt thu «%s» của hợp đồng %s đến hạn thu: %s%s.',
           btrim(NEW.description), c.code, COALESCE(v_basis, 'căn cứ đã đạt'),
           CASE WHEN v_amount IS NOT NULL
                THEN ' — ' || replace(to_char(v_amount, 'FM999,999,999,999'), ',', '.') || ' đồng' ELSE '' END)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contract_terms_collection_notify ON public.contract_terms;
CREATE TRIGGER contract_terms_collection_notify
  AFTER INSERT OR UPDATE OF collection_due_at ON public.contract_terms
  FOR EACH ROW EXECUTE FUNCTION public.contract_terms_collection_notify();

-- ----------------------------------------------------------------------------
-- Mốc đạt / biên bản ký → các đợt gắn vào đó đến hạn thu.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collection_due_from_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('nvg.collection_due', 'on', true);
  UPDATE public.contract_terms
     SET collection_due_at = COALESCE(NEW.passed_at, now())
   WHERE site_milestone_id = NEW.id AND collection_due_at IS NULL AND deleted_at IS NULL;
  PERFORM set_config('nvg.collection_due', '', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS site_milestones_collection_due ON public.site_milestones;
CREATE TRIGGER site_milestones_collection_due
  AFTER UPDATE OF status ON public.site_milestones
  FOR EACH ROW
  WHEN (NEW.status = 'dat' AND OLD.status IS DISTINCT FROM 'dat')
  EXECUTE FUNCTION public.collection_due_from_milestone();

CREATE OR REPLACE FUNCTION public.collection_due_from_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('nvg.collection_due', 'on', true);
  UPDATE public.contract_terms
     SET collection_due_at = NEW.signed_at
   WHERE acceptance_record_id = NEW.id AND collection_due_at IS NULL AND deleted_at IS NULL;
  PERFORM set_config('nvg.collection_due', '', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS acceptance_records_collection_due ON public.acceptance_records;
CREATE TRIGGER acceptance_records_collection_due
  AFTER UPDATE OF signed_at ON public.acceptance_records
  FOR EACH ROW
  WHEN (OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL AND NEW.acceptance_type = 'khach_hang')
  EXECUTE FUNCTION public.collection_due_from_acceptance();

REVOKE ALL ON FUNCTION public.collection_due_from_milestone() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collection_due_from_acceptance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contract_terms_collection_notify() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Gắn / gỡ căn cứ — đường cho Kế toán (không có quyền sửa hợp đồng). Người sửa được hợp đồng
-- gắn được cả bằng cập nhật thường; trigger canh như nhau.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_collection_term(
  p_term_id       uuid,
  p_milestone_id  uuid DEFAULT NULL,
  p_acceptance_id uuid DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t     record;
  v_due timestamptz;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO t FROM public.contract_terms WHERE id = p_term_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_collection_editable(t.contract_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc Kế toán của pháp nhân gắn được căn cứ thu.';
  END IF;
  IF p_milestone_id IS NOT NULL AND p_acceptance_id IS NOT NULL THEN
    RAISE EXCEPTION 'Mỗi đợt chỉ gắn một căn cứ: mốc HOẶC biên bản.';
  END IF;
  UPDATE public.contract_terms
     SET site_milestone_id = p_milestone_id, acceptance_record_id = p_acceptance_id,
         updated_by = public.auth_user_id()
   WHERE id = p_term_id
  RETURNING collection_due_at INTO v_due;
  RETURN v_due;
END;
$$;

REVOKE ALL ON FUNCTION public.link_collection_term(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_collection_term(uuid, uuid, uuid) TO authenticated;

-- Căn cứ chọn được cho một hợp đồng: mốc + biên bản khách hàng của công trình thuộc hợp đồng.
-- Kinh doanh / Kế toán không xem phân hệ Thi công — chỉ lộ tên, trạng thái, ngày.
CREATE OR REPLACE FUNCTION public.contract_collection_targets(p_contract_id uuid)
RETURNS TABLE (
  kind text, id uuid, label text, site_code text, reached boolean, reached_at timestamptz,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rls_contract_readable(p_contract_id) THEN
    RAISE EXCEPTION 'Không có quyền xem hợp đồng này.';
  END IF;
  RETURN QUERY
  SELECT 'moc'::text, sm.id, sm.label, s.code::text, sm.status = 'dat', sm.passed_at, sm.position
    FROM public.site_milestones sm
    JOIN public.construction_sites s ON s.id = sm.construction_site_id
   WHERE s.contract_id = p_contract_id AND s.deleted_at IS NULL
  UNION ALL
  SELECT 'bien_ban'::text, ar.id, format('%s — %s', ar.code, ar.stage_name), s.code::text,
         ar.signed_at IS NOT NULL, ar.signed_at, 1000
    FROM public.acceptance_records ar
    JOIN public.construction_sites s ON s.id = ar.construction_site_id
   WHERE s.contract_id = p_contract_id AND s.deleted_at IS NULL AND ar.deleted_at IS NULL
     AND ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
   ORDER BY 4, 7, 6 NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.contract_collection_targets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_collection_targets(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Danh sách đợt thu của Kế toán.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.kt_collection_schedule(uuid);
CREATE OR REPLACE FUNCTION public.kt_collection_schedule(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  term_id uuid, company_id uuid, contract_id uuid, contract_code text, contract_number text,
  contract_title text, customer_name text, responsible_name text, term_type text,
  description text, amount bigint, due_date date, completed_at timestamptz,
  basis_kind text, basis_label text, basis_reached_at timestamptz, site_code text,
  acceptance_record_id uuid, collection_due_at timestamptz, state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_soon numeric := public.system_parameter_number('kt.collection_remind_days_before');
BEGIN
  IF NOT public.auth_can_view_module('KT') THEN
    RAISE EXCEPTION 'Chỉ Kế toán – Tài chính và Ban Giám đốc xem được danh sách đợt thu.';
  END IF;
  RETURN QUERY
  SELECT ct.id, c.company_id, c.id, c.code::text, c.contract_number::text, c.title,
         COALESCE(cu.name, '')::text, (SELECT u.full_name FROM public.users u WHERE u.id = c.responsible_user_id)::text,
         ct.term_type::text, ct.description,
         public.contract_term_amount(ct.amount, ct.percent_value, c.value),
         ct.due_date, ct.completed_at,
         CASE WHEN ct.site_milestone_id IS NOT NULL THEN 'moc'
              WHEN ct.acceptance_record_id IS NOT NULL THEN 'bien_ban' END,
         COALESCE(sm.label, CASE WHEN ar.id IS NOT NULL THEN format('%s — %s', ar.code, ar.stage_name) END),
         COALESCE(sm.passed_at, ar.signed_at),
         COALESCE(s1.code, s2.code)::text,
         ct.acceptance_record_id,
         ct.collection_due_at,
         CASE
           WHEN ct.completed_at IS NOT NULL THEN 'da_xong'
           WHEN ct.collection_due_at IS NOT NULL OR ct.due_date <= current_date THEN 'den_han'
           WHEN v_soon IS NOT NULL AND ct.due_date - v_soon::int <= current_date THEN 'sap_den'
           ELSE 'chua_den'
         END
    FROM public.contract_terms ct
    JOIN public.contracts c ON c.id = ct.contract_id
    LEFT JOIN public.customers cu ON cu.id = c.customer_id
    LEFT JOIN public.site_milestones sm ON sm.id = ct.site_milestone_id
    LEFT JOIN public.construction_sites s1 ON s1.id = sm.construction_site_id
    LEFT JOIN public.acceptance_records ar ON ar.id = ct.acceptance_record_id
    LEFT JOIN public.construction_sites s2 ON s2.id = ar.construction_site_id
   WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
     AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
     AND c.stage IN ('da_ky', 'hoan_thanh')
     AND public.rls_company_access(c.company_id)
     AND (p_company_id IS NULL OR c.company_id = p_company_id)
   ORDER BY (ct.completed_at IS NOT NULL), ct.collection_due_at NULLS LAST,
            ct.due_date NULLS LAST, c.code, ct.position;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_collection_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_collection_schedule(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Nhắc theo ngày hạn (quét đêm). Tham số trống = không nhắc.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_collection_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days numeric := public.system_parameter_number('kt.collection_remind_days_before');
  t      record;
  v_sent integer := 0;
BEGIN
  IF v_days IS NULL THEN
    RETURN 0;
  END IF;
  FOR t IN
    SELECT ct.id, ct.description, ct.due_date, ct.amount, ct.percent_value, c.code, c.value
      FROM public.contract_terms ct
      JOIN public.contracts c ON c.id = ct.contract_id
     WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
       AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
       AND c.stage IN ('da_ky', 'hoan_thanh')
       AND ct.completed_at IS NULL AND ct.collection_reminded_at IS NULL
       AND ct.due_date IS NOT NULL AND ct.due_date - v_days::int <= current_date
  LOOP
    PERFORM public.notify_collection_recipients(
      t.id, 'collection_reminder',
      format('Đợt thu «%s» của hợp đồng %s hạn %s%s — chuẩn bị đề nghị thu.',
             btrim(t.description), t.code, to_char(t.due_date, 'DD/MM/YYYY'),
             COALESCE(' — ' || replace(to_char(public.contract_term_amount(t.amount, t.percent_value, t.value),
                                       'FM999,999,999,999'), ',', '.') || ' đồng', '')));
    PERFORM set_config('nvg.collection_due', 'on', true);
    UPDATE public.contract_terms SET collection_reminded_at = now() WHERE id = t.id;
    PERFORM set_config('nvg.collection_due', '', true);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_collection_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_collection_reminders() TO service_role;
