-- ============================================================================
-- Đợt 5 — 5C (phần không bị chặn): Đấu thầu NVC (doc/KE_HOACH_LAM_HO.md mục 3.2).
--
-- 5C-1 Kho hồ sơ năng lực:
--   · Dùng chung bảng `company_documents` (0206) — thêm loại `phap_ly`, `bao_cao_tai_chinh`,
--     `chung_chi`, `thiet_bi` thuộc phân hệ DA. Một giấy đăng ký kinh doanh chỉ có một bản.
--   · Báo cáo tài chính = Mẫu D: dòng (tên, năm) Đấu thầu thấy được để gắn vào gói, nhưng TỆP chỉ
--     người xem được tài chính mở (`rls_sees_financial_statements`: TGĐ, CFO, BGĐ, Quản trị, KSNB,
--     Kế toán) — mở qua `open_financial_statement` để ghi `sensitive_access_logs`.
--   · Kinh nghiệm: `bid_experience_candidates` ĐỌC hợp đồng đã ký (NVG nhận tiền) + mẫu công trình đã
--     xác nhận — liên kết, không chép. Nhân sự chủ chốt: `bid_key_personnel` ĐỌC từ Nhân sự (họ tên,
--     chức danh, chứng chỉ hành nghề + hạn) — không lộ lương, CCCD, số điện thoại.
--   · Gắn giấy tờ vào gói một bấm: `bid_capability_links`; `bid_capability_status` báo đỏ giấy hết
--     hạn TRƯỚC ngày nộp.
-- 5C-5 Vòng làm rõ + gia hạn: `bid_clarifications` (số vòng tự đánh, câu hỏi, trả lời, hạn) thay ô chữ
--   `clarification_notes` (ô cũ giữ để đọc); `bid_deadline_extensions` ghi mọi lần đổi hạn nộp
--   (trigger), `extend_bid_deadline` bắt buộc lý do. Nhắc hạn: `scan_bid_deadline_reminders` — quá hạn
--   luôn báo; trước hạn theo `da.deadline_remind_days` (để TRỐNG).
-- 5C-9 Bảo lãnh + kết quả: `bid_guarantees` (số tiền, ngân hàng, hạn, đã thu hồi chưa);
--   `record_bid_outcome_details` ghi đơn vị trúng, giá trúng, lý do sau khi đã có kết quả.
--
-- KHÔNG đụng `record_bid_result`, `submit_bid`, `bidding_projects_notify_opportunity` (0217 mạch chính).
-- Chạy lại được.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Kho hồ sơ năng lực trên company_documents
-- ----------------------------------------------------------------------------
ALTER TABLE public.company_documents DROP CONSTRAINT IF EXISTS company_documents_category;
ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_category
  CHECK (category IN ('giay_phep', 'bao_hiem', 'dang_kiem', 'hanh_chinh_khac',
                      'phap_ly', 'bao_cao_tai_chinh', 'chung_chi', 'thiet_bi'));

CREATE OR REPLACE FUNCTION public.company_document_module(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_category IN ('phap_ly', 'bao_cao_tai_chinh', 'chung_chi', 'thiet_bi')
              THEN 'DA' ELSE 'NS' END;
$$;

-- Dòng đã có giữ đúng phân hệ theo hàm mới.
UPDATE public.company_documents SET module = public.company_document_module(category)
 WHERE module IS DISTINCT FROM public.company_document_module(category);

/** Ai mở được TỆP báo cáo tài chính (Mẫu D). */
CREATE OR REPLACE FUNCTION public.rls_sees_financial_statements()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_sees_sensitive('profit') OR public.auth_has_role('KT');
$$;

REVOKE ALL ON FUNCTION public.rls_sees_financial_statements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_sees_financial_statements() TO authenticated;

-- Kho tệp: báo cáo tài chính chỉ người xem được tài chính đọc (ghi thì Đấu thầu nộp vào được).
DROP POLICY IF EXISTS company_docs_select ON storage.objects;
CREATE POLICY company_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND public.rls_company_document_readable(public.try_uuid((storage.foldername(name))[2]))
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.company_documents d
        WHERE d.id = public.try_uuid((storage.foldername(name))[2])
          AND d.category = 'bao_cao_tai_chinh'
      )
      OR public.rls_sees_financial_statements()
    )
  );

/** Mở tệp báo cáo tài chính: kiểm quyền + ghi nhật ký truy cập dữ liệu nhạy cảm (NEN-07). */
CREATE OR REPLACE FUNCTION public.open_financial_statement(p_document_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.company_documents WHERE id = p_document_id AND deleted_at IS NULL;
  IF NOT FOUND OR d.category <> 'bao_cao_tai_chinh'
     OR NOT public.rls_company_document_readable(p_document_id) THEN
    RAISE EXCEPTION 'Không tìm thấy báo cáo tài chính này.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.rls_sees_financial_statements() THEN
    RAISE EXCEPTION 'Không mở được báo cáo tài chính: chỉ Ban Giám đốc, Tài chính, Kế toán, Kiểm soát nội bộ xem được. Nhờ Kế toán xuất bản cho hồ sơ thầu.'
      USING ERRCODE = '42501';
  END IF;
  PERFORM public.log_sensitive_access('profit', 'company_documents', d.id, 'view', d.company_id);
  RETURN d.file_path;
END;
$$;

REVOKE ALL ON FUNCTION public.open_financial_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_financial_statement(uuid) TO authenticated;

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT v.k, 'global', NULL, v.l, v.d
FROM (VALUES
  ('da.document_remind_days', 'Nhắc trước khi hồ sơ năng lực hết hạn (ngày)',
   'Giấy tờ pháp lý, chứng chỉ, kiểm định thiết bị: báo người phụ trách trước N ngày. Để trống = chỉ báo khi đã hết hạn.'),
  ('da.deadline_remind_days', 'Nhắc trước hạn nộp thầu / hạn làm rõ (ngày)',
   'Báo người phụ trách gói thầu và Ban Giám đốc trước N ngày. Để trống = chỉ báo khi đã quá hạn.')
) AS v(k, l, d)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p WHERE p.param_key = v.k AND p.scope_type = 'global'
);

-- Quét giấy tờ: tham số nhắc trước theo phân hệ của giấy tờ (thay thân hàm 0206).
CREATE OR REPLACE FUNCTION public.scan_company_document_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       record;
  v_days  integer;
  v_lead  numeric;
  v_stage smallint;
  v_sent  integer := 0;
  v_url   text;
BEGIN
  FOR d IN
    SELECT * FROM public.company_documents
    WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
  LOOP
    v_lead := public.system_parameter_number(
      CASE d.module WHEN 'DA' THEN 'da.document_remind_days' ELSE 'hc.document_remind_days' END);
    v_days := d.expiry_date - (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    v_stage := CASE
      WHEN v_days < 0 THEN 0
      WHEN v_lead IS NOT NULL AND v_days <= v_lead THEN 1
      ELSE NULL
    END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN d.last_reminded_stage IS NOT NULL AND d.last_reminded_stage <= v_stage;

    v_url := CASE d.module WHEN 'DA' THEN '/da/ho-so-nang-luc' ELSE '/ns/giay-to-phap-nhan' END;

    PERFORM public.create_notification(
      u.id, d.company_id, 'company_document_expiry',
      CASE WHEN v_stage = 0 THEN
        format('%s đã hết hạn ngày %s — gia hạn và cập nhật ngày mới.', d.title,
               to_char(d.expiry_date, 'DD/MM/YYYY'))
      ELSE
        format('%s hết hạn ngày %s, còn %s ngày.', d.title,
               to_char(d.expiry_date, 'DD/MM/YYYY'), v_days)
      END,
      'company_documents', d.id, v_url
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (
        u.id = d.responsible_user_id
        OR (d.responsible_user_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_companies uc
          JOIN public.permissions pm ON pm.role_id = uc.role_id
          WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = d.company_id
            AND pm.module_code = d.module AND pm.can_edit
        ))
      );

    UPDATE public.company_documents SET last_reminded_stage = v_stage WHERE id = d.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_company_document_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_company_document_reminders() TO service_role;

/** Kinh nghiệm: hợp đồng NVG nhận tiền đã ký / hoàn thành + mẫu công trình đã xác nhận. */
CREATE OR REPLACE FUNCTION public.bid_experience_candidates(p_company_id uuid)
RETURNS TABLE (
  source        text,
  source_id     uuid,
  title         text,
  customer_name text,
  contract_type text,
  value         bigint,
  year          integer,
  location      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'hop_dong', c.id, c.title::text, COALESCE(cu.name, c.partner_name)::text, c.type::text,
         c.value, EXTRACT(year FROM COALESCE(c.signed_date, c.signed_at::date))::integer,
         c.project_location::text
  FROM public.contracts c
  LEFT JOIN public.customers cu ON cu.id = c.customer_id
  WHERE public.auth_can_view_module('DA') AND public.rls_company_access(p_company_id)
    AND c.company_id = p_company_id AND c.deleted_at IS NULL
    AND c.stage IN ('da_ky', 'hoan_thanh')
    AND c.type IN ('thiet_ke', 'thi_cong', 'mua_ban', 'cho_thue')
  UNION ALL
  SELECT 'mau_cong_trinh', s.id, s.title::text, NULL, s.kind::text, NULL, s.completed_year,
         s.location_area::text
  FROM public.showcase_items s
  WHERE public.auth_can_view_module('DA') AND public.rls_company_access(p_company_id)
    AND s.company_id = p_company_id AND s.deleted_at IS NULL AND s.status = 'da_xac_nhan'
  ORDER BY 7 DESC NULLS LAST, 3;
$$;

REVOKE ALL ON FUNCTION public.bid_experience_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_experience_candidates(uuid) TO authenticated;

/** Nhân sự chủ chốt + chứng chỉ hành nghề: đọc từ Nhân sự, chỉ cột không nhạy cảm. */
CREATE OR REPLACE FUNCTION public.bid_key_personnel(p_company_id uuid)
RETURNS TABLE (
  employee_id      uuid,
  full_name        text,
  job_title        text,
  hire_date        date,
  certificate      text,
  certificate_no   text,
  certificate_expiry date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.full_name::text, e.position::text, e.hire_date,
         hd.title::text, hd.document_number::text, hd.expiry_date
  FROM public.employees e
  LEFT JOIN public.hr_documents hd
    ON hd.employee_id = e.id AND hd.deleted_at IS NULL AND hd.type = 'chung_chi_hanh_nghe'
  WHERE public.auth_can_view_module('DA') AND public.rls_company_access(p_company_id)
    AND e.company_id = p_company_id AND e.deleted_at IS NULL AND e.status <> 'da_nghi'
    AND hd.id IS NOT NULL
  ORDER BY e.full_name, hd.expiry_date;
$$;

REVOKE ALL ON FUNCTION public.bid_key_personnel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_key_personnel(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Gắn hồ sơ năng lực vào gói thầu
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bid_capability_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bidding_project_id  uuid NOT NULL REFERENCES public.bidding_projects(id) ON DELETE CASCADE,
  company_document_id uuid NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT bid_capability_links_unique UNIQUE (bidding_project_id, company_document_id)
);

CREATE OR REPLACE FUNCTION public.bid_capability_links_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bid_company uuid;
  v_doc_company uuid;
BEGIN
  SELECT company_id INTO v_bid_company FROM public.bidding_projects WHERE id = NEW.bidding_project_id;
  SELECT company_id INTO v_doc_company FROM public.company_documents
   WHERE id = NEW.company_document_id AND deleted_at IS NULL AND module = 'DA';
  IF v_doc_company IS NULL OR v_doc_company <> v_bid_company THEN
    RAISE EXCEPTION 'Chỉ gắn được hồ sơ năng lực của cùng pháp nhân với gói thầu.';
  END IF;
  NEW.company_id := v_bid_company;
  NEW.created_at := now();
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_capability_links_before_insert ON public.bid_capability_links;
CREATE TRIGGER bid_capability_links_before_insert
  BEFORE INSERT ON public.bid_capability_links
  FOR EACH ROW EXECUTE FUNCTION public.bid_capability_links_before_insert();

ALTER TABLE public.bid_capability_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_capability_links FROM anon;
GRANT SELECT, INSERT, DELETE ON public.bid_capability_links TO authenticated;

DROP POLICY IF EXISTS bid_capability_links_select ON public.bid_capability_links;
CREATE POLICY bid_capability_links_select ON public.bid_capability_links
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id));

DROP POLICY IF EXISTS bid_capability_links_insert ON public.bid_capability_links;
CREATE POLICY bid_capability_links_insert ON public.bid_capability_links
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_bidding_project_writable(bidding_project_id));

DROP POLICY IF EXISTS bid_capability_links_delete ON public.bid_capability_links;
CREATE POLICY bid_capability_links_delete ON public.bid_capability_links
  FOR DELETE TO authenticated
  USING (public.rls_bidding_project_writable(bidding_project_id));

/** Giấy tờ đã gắn + cờ đỏ «hết hạn trước ngày nộp». SECURITY INVOKER — RLS quyết. */
CREATE OR REPLACE FUNCTION public.bid_capability_status(p_bidding_project_id uuid)
RETURNS TABLE (
  link_id            uuid,
  document_id        uuid,
  category           text,
  title              text,
  expiry_date        date,
  fiscal_year        integer,
  has_file           boolean,
  submission_deadline date,
  expires_before_submission boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.id, d.id, d.category::text, d.title::text, d.expiry_date, d.fiscal_year,
         d.file_path IS NOT NULL, b.submission_deadline,
         (d.expiry_date IS NOT NULL AND d.expiry_date <
            COALESCE(b.submission_deadline, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))
  FROM public.bid_capability_links l
  JOIN public.company_documents d ON d.id = l.company_document_id AND d.deleted_at IS NULL
  JOIN public.bidding_projects b ON b.id = l.bidding_project_id
  WHERE l.bidding_project_id = p_bidding_project_id
  ORDER BY d.category, d.title;
$$;

REVOKE ALL ON FUNCTION public.bid_capability_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_capability_status(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Vòng làm rõ + lịch sử gia hạn
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bid_clarifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bidding_project_id  uuid NOT NULL REFERENCES public.bidding_projects(id) ON DELETE CASCADE,
  round_no            integer NOT NULL,
  direction           varchar(16) NOT NULL DEFAULT 'nvg_hoi'
                      CHECK (direction IN ('nvg_hoi', 'cdt_hoi')),
  question            text NOT NULL CHECK (btrim(question) <> ''),
  asked_date          date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  due_date            date,
  answer              text,
  answered_date       date,
  last_reminded_stage smallint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT bid_clarifications_round UNIQUE (bidding_project_id, round_no)
);

COMMENT ON TABLE public.bid_clarifications IS
  'Vòng làm rõ hồ sơ mời thầu / dự thầu (5C-5): mỗi câu hỏi một vòng, số vòng máy đánh. nvg_hoi = NVG hỏi chủ đầu tư; cdt_hoi = chủ đầu tư yêu cầu NVG làm rõ.';

CREATE OR REPLACE FUNCTION public.bid_clarifications_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT company_id INTO NEW.company_id FROM public.bidding_projects WHERE id = NEW.bidding_project_id;
    PERFORM 1 FROM public.bidding_projects WHERE id = NEW.bidding_project_id FOR UPDATE;
    SELECT COALESCE(max(round_no), 0) + 1 INTO NEW.round_no
      FROM public.bid_clarifications WHERE bidding_project_id = NEW.bidding_project_id;
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.bidding_project_id := OLD.bidding_project_id;
    NEW.round_no := OLD.round_no;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    -- Câu hỏi đã trả lời thì không sửa câu hỏi nữa.
    IF OLD.answer IS NOT NULL AND NEW.question IS DISTINCT FROM OLD.question THEN
      RAISE EXCEPTION 'Vòng làm rõ đã có trả lời — không sửa câu hỏi được. Mở vòng mới.';
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      NEW.last_reminded_stage := NULL;
    END IF;
  END IF;
  IF NEW.answer IS NOT NULL AND btrim(NEW.answer) <> '' AND NEW.answered_date IS NULL THEN
    NEW.answered_date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_clarifications_before_write ON public.bid_clarifications;
CREATE TRIGGER bid_clarifications_before_write
  BEFORE INSERT OR UPDATE ON public.bid_clarifications
  FOR EACH ROW EXECUTE FUNCTION public.bid_clarifications_before_write();

ALTER TABLE public.bid_clarifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_clarifications FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.bid_clarifications TO authenticated;

-- Làm rõ có thể diễn ra cả sau khi nộp (chủ đầu tư yêu cầu làm rõ hồ sơ dự thầu) — nên không
-- dùng `rls_bidding_project_writable` (đóng băng khi đã nộp) mà dùng quyền sửa phân hệ DA.
DROP POLICY IF EXISTS bid_clarifications_select ON public.bid_clarifications;
CREATE POLICY bid_clarifications_select ON public.bid_clarifications
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id));

DROP POLICY IF EXISTS bid_clarifications_insert ON public.bid_clarifications;
CREATE POLICY bid_clarifications_insert ON public.bid_clarifications
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_bidding_project_readable(bidding_project_id)
              AND public.auth_can_edit_module('DA') AND NOT public.auth_is_read_only());

DROP POLICY IF EXISTS bid_clarifications_update ON public.bid_clarifications;
CREATE POLICY bid_clarifications_update ON public.bid_clarifications
  FOR UPDATE TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id)
         AND public.auth_can_edit_module('DA') AND NOT public.auth_is_read_only())
  WITH CHECK (public.rls_bidding_project_readable(bidding_project_id));

CREATE TABLE IF NOT EXISTS public.bid_deadline_extensions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bidding_project_id uuid NOT NULL REFERENCES public.bidding_projects(id) ON DELETE CASCADE,
  old_deadline       date,
  new_deadline       date,
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.bid_deadline_extensions IS
  'Lịch sử đổi hạn nộp thầu (5C-5) — trigger ghi mọi lần đổi; lý do qua extend_bid_deadline.';

CREATE OR REPLACE FUNCTION public.bidding_projects_log_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.submission_deadline IS DISTINCT FROM OLD.submission_deadline THEN
    INSERT INTO public.bid_deadline_extensions
      (company_id, bidding_project_id, old_deadline, new_deadline, reason, created_by)
    VALUES (NEW.company_id, NEW.id, OLD.submission_deadline, NEW.submission_deadline,
            NULLIF(current_setting('nvg.bid_deadline_reason', true), ''), public.auth_user_id());
    NEW.deadline_reminded_stage := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.bidding_projects
  ADD COLUMN IF NOT EXISTS deadline_reminded_stage smallint,
  ADD COLUMN IF NOT EXISTS winner_name varchar(255),
  ADD COLUMN IF NOT EXISTS winning_price bigint CHECK (winning_price IS NULL OR winning_price >= 0),
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_recorded_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS bidding_projects_log_deadline ON public.bidding_projects;
CREATE TRIGGER bidding_projects_log_deadline
  BEFORE UPDATE OF submission_deadline ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_log_deadline();

ALTER TABLE public.bid_deadline_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_deadline_extensions FROM anon, authenticated;
GRANT SELECT ON public.bid_deadline_extensions TO authenticated;

DROP POLICY IF EXISTS bid_deadline_extensions_select ON public.bid_deadline_extensions;
CREATE POLICY bid_deadline_extensions_select ON public.bid_deadline_extensions
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id));

CREATE OR REPLACE FUNCTION public.extend_bid_deadline(
  p_bidding_project_id uuid,
  p_new_deadline date,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rls_bidding_project_writable(p_bidding_project_id) THEN
    RAISE EXCEPTION 'Không đổi được hạn nộp: tài khoản không sửa được gói thầu này, hoặc gói đã nộp. Phòng Dự án – Đấu thầu thực hiện được.'
      USING ERRCODE = '42501';
  END IF;
  IF p_new_deadline IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn hạn nộp mới.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi lý do gia hạn (vd số văn bản gia hạn của chủ đầu tư).';
  END IF;
  PERFORM set_config('nvg.bid_deadline_reason', btrim(p_reason), true);
  UPDATE public.bidding_projects
     SET submission_deadline = p_new_deadline, updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_bidding_project_id;
  PERFORM set_config('nvg.bid_deadline_reason', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.extend_bid_deadline(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_bid_deadline(uuid, date, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Bảo lãnh dự thầu + kết quả
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bid_guarantees (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  bidding_project_id uuid NOT NULL REFERENCES public.bidding_projects(id) ON DELETE CASCADE,
  amount             bigint NOT NULL CHECK (amount > 0),
  bank_name          varchar(255) NOT NULL CHECK (btrim(bank_name) <> ''),
  guarantee_number   varchar(64),
  issued_date        date,
  expiry_date        date NOT NULL,
  released_at        date,
  release_note       text,
  notes              text,
  last_reminded_stage smallint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at         timestamptz
);

COMMENT ON TABLE public.bid_guarantees IS
  'Bảo lãnh dự thầu (5C-9): số tiền, ngân hàng, hạn, ngày thu hồi. Hết hạn mà chưa thu hồi thì nhắc.';

CREATE OR REPLACE FUNCTION public.bid_guarantees_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT company_id INTO NEW.company_id FROM public.bidding_projects WHERE id = NEW.bidding_project_id;
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.bidding_project_id := OLD.bidding_project_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF OLD.released_at IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
         OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
         OR NEW.released_at IS DISTINCT FROM OLD.released_at) THEN
      RAISE EXCEPTION 'Bảo lãnh đã thu hồi — không sửa được.';
    END IF;
    IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN
      NEW.last_reminded_stage := NULL;
    END IF;
  END IF;
  IF NEW.issued_date IS NOT NULL AND NEW.expiry_date < NEW.issued_date THEN
    RAISE EXCEPTION 'Ngày hết hạn bảo lãnh phải sau ngày phát hành.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_guarantees_before_write ON public.bid_guarantees;
CREATE TRIGGER bid_guarantees_before_write
  BEFORE INSERT OR UPDATE ON public.bid_guarantees
  FOR EACH ROW EXECUTE FUNCTION public.bid_guarantees_before_write();

ALTER TABLE public.bid_guarantees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_guarantees FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.bid_guarantees TO authenticated;

DROP POLICY IF EXISTS bid_guarantees_select ON public.bid_guarantees;
CREATE POLICY bid_guarantees_select ON public.bid_guarantees
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_readable(bidding_project_id));

DROP POLICY IF EXISTS bid_guarantees_insert ON public.bid_guarantees;
CREATE POLICY bid_guarantees_insert ON public.bid_guarantees
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_bidding_project_readable(bidding_project_id)
              AND public.auth_can_edit_module('DA') AND NOT public.auth_is_read_only());

DROP POLICY IF EXISTS bid_guarantees_update ON public.bid_guarantees;
CREATE POLICY bid_guarantees_update ON public.bid_guarantees
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_readable(bidding_project_id)
         AND public.auth_can_edit_module('DA') AND NOT public.auth_is_read_only())
  WITH CHECK (public.rls_bidding_project_readable(bidding_project_id));

/** Chi tiết kết quả (đơn vị trúng, giá trúng, lý do) — sau khi đã ghi trúng / trượt. */
CREATE OR REPLACE FUNCTION public.record_bid_outcome_details(
  p_bidding_project_id uuid,
  p_winner_name text,
  p_winning_price bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('DA') OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Không ghi được kết quả: tài khoản không sửa được gói thầu này. Phòng Dự án – Đấu thầu thực hiện được.'
      USING ERRCODE = '42501';
  END IF;
  IF p.stage NOT IN ('trung_thau', 'truot_thau') THEN
    RAISE EXCEPTION 'Gói thầu chưa có kết quả — ghi nhận trúng / trượt thầu trước.';
  END IF;
  IF p_winning_price IS NOT NULL AND p_winning_price < 0 THEN
    RAISE EXCEPTION 'Giá trúng thầu không hợp lệ.';
  END IF;
  UPDATE public.bidding_projects
     SET winner_name = NULLIF(btrim(COALESCE(p_winner_name, '')), ''),
         winning_price = p_winning_price,
         outcome_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         outcome_recorded_at = now(),
         outcome_recorded_by = public.auth_user_id(),
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_bidding_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_bid_outcome_details(uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_bid_outcome_details(uuid, text, bigint, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Nhắc hạn nộp, hạn làm rõ, bảo lãnh
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_bid_deadline_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_lead  numeric := public.system_parameter_number('da.deadline_remind_days');
  r       record;
  v_stage smallint;
  v_sent  integer := 0;
BEGIN
  -- Hạn nộp thầu: gói chưa nộp, chưa có kết quả.
  FOR r IN
    SELECT * FROM public.bidding_projects
    WHERE deleted_at IS NULL AND submitted_at IS NULL AND submission_deadline IS NOT NULL
      AND stage NOT IN ('trung_thau', 'truot_thau')
  LOOP
    v_stage := CASE
      WHEN r.submission_deadline < v_today THEN 0
      WHEN v_lead IS NOT NULL AND r.submission_deadline - v_today <= v_lead THEN 1
      ELSE NULL END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN r.deadline_reminded_stage IS NOT NULL AND r.deadline_reminded_stage <= v_stage;
    PERFORM public.create_notification(
      u.id, r.company_id, 'bid_deadline',
      CASE WHEN v_stage = 0 THEN
        format('Gói thầu %s đã quá hạn nộp %s mà chưa ghi nhận nộp.', r.code, to_char(r.submission_deadline, 'DD/MM/YYYY'))
      ELSE
        format('Gói thầu %s hạn nộp %s, còn %s ngày.', r.code, to_char(r.submission_deadline, 'DD/MM/YYYY'),
               r.submission_deadline - v_today)
      END,
      'bidding_projects', r.id, '/da/goi-thau/' || r.id::text
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (u.id = r.responsible_user_id OR EXISTS (
        SELECT 1 FROM public.user_companies uc JOIN public.roles ro ON ro.id = uc.role_id
        WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = r.company_id
          AND ro.code = 'BGD'));
    UPDATE public.bidding_projects SET deadline_reminded_stage = v_stage WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  -- Vòng làm rõ chưa có trả lời.
  FOR r IN
    SELECT c.*, b.code AS bid_code, b.responsible_user_id
    FROM public.bid_clarifications c
    JOIN public.bidding_projects b ON b.id = c.bidding_project_id AND b.deleted_at IS NULL
    WHERE c.due_date IS NOT NULL AND (c.answer IS NULL OR btrim(c.answer) = '')
  LOOP
    v_stage := CASE
      WHEN r.due_date < v_today THEN 0
      WHEN v_lead IS NOT NULL AND r.due_date - v_today <= v_lead THEN 1
      ELSE NULL END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN r.last_reminded_stage IS NOT NULL AND r.last_reminded_stage <= v_stage;
    PERFORM public.create_notification(
      u.id, r.company_id, 'bid_clarification_due',
      format('Gói thầu %s — vòng làm rõ %s hạn %s chưa có trả lời%s.', r.bid_code, r.round_no,
             to_char(r.due_date, 'DD/MM/YYYY'), CASE WHEN v_stage = 0 THEN ' (đã quá hạn)' ELSE '' END),
      'bidding_projects', r.bidding_project_id, '/da/goi-thau/' || r.bidding_project_id::text || '?tab=lam-ro'
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (u.id = r.responsible_user_id OR EXISTS (
        SELECT 1 FROM public.user_companies uc JOIN public.roles ro ON ro.id = uc.role_id
        WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = r.company_id
          AND ro.code = 'BGD'));
    UPDATE public.bid_clarifications SET last_reminded_stage = v_stage WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  -- Bảo lãnh hết hạn mà chưa thu hồi.
  FOR r IN
    SELECT g.*, b.code AS bid_code, b.responsible_user_id
    FROM public.bid_guarantees g
    JOIN public.bidding_projects b ON b.id = g.bidding_project_id AND b.deleted_at IS NULL
    WHERE g.deleted_at IS NULL AND g.released_at IS NULL AND g.expiry_date < v_today
      AND g.last_reminded_stage IS NULL
  LOOP
    PERFORM public.create_notification(
      u.id, r.company_id, 'bid_guarantee_expired',
      format('Bảo lãnh dự thầu gói %s (%s) đã hết hạn %s mà chưa ghi thu hồi.', r.bid_code,
             r.bank_name, to_char(r.expiry_date, 'DD/MM/YYYY')),
      'bidding_projects', r.bidding_project_id, '/da/goi-thau/' || r.bidding_project_id::text || '?tab=bao-lanh'
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id = r.responsible_user_id;
    UPDATE public.bid_guarantees SET last_reminded_stage = 0 WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_bid_deadline_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_bid_deadline_reminders() TO service_role;
