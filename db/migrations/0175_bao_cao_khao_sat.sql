-- ============================================================================
-- Đợt 1 — 1D: Khảo sát → ghi âm → báo cáo → Ban Giám đốc duyệt (+ khối nền K1, K2).
--
-- Chủ dự án chốt (CLAUDE.md 9.4):
--   · Báo cáo khảo sát do BAN GIÁM ĐỐC duyệt (không thêm vai trò Trưởng phòng Kinh doanh).
--   · Chưa duyệt thì CHẶN Báo giá (`stage_readiness` → `move_opportunity_stage`).
--   · Trả về phải kèm ý kiến; người khảo sát sửa rồi gửi lại.
--   · AI chạy GIẢ LẬP trước; gọi thật chỉ khi duyệt số lượt + chi phí.
--   · Máy ghi giờ bắt đầu / kết thúc khảo sát (vấn đề 8): người dùng bấm nút, không gõ giờ.
--
-- Bảng / cột mới:
--   site_surveys            + started_at, finished_at, report_status, report_feedback,
--                             report_submitted_at, report_decided_at, report_approval_id,
--                             ai_draft, ai_draft_at
--   site_survey_recordings  — đoạn ghi âm + bản chép chữ; tệp ở kho `survey-audio`
--   ai_calls                — nhật ký mọi lần gọi AI (số lượng, chi phí, giả lập hay thật)
-- Hàm: start_site_survey, finish_site_survey, submit_survey_report; decide_approval,
-- my_pending_approvals, stage_readiness chép NGUYÊN bản mới nhất (0088, 0156, 0166) rồi thêm nhánh.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_report_status') THEN
    CREATE TYPE public.survey_report_status AS ENUM ('nhap', 'cho_duyet', 'da_duyet', 'tra_ve');
  END IF;
END
$$;

ALTER TABLE public.site_surveys
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_status public.survey_report_status NOT NULL DEFAULT 'nhap',
  ADD COLUMN IF NOT EXISTS report_feedback text,
  ADD COLUMN IF NOT EXISTS report_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_draft jsonb,
  ADD COLUMN IF NOT EXISTS ai_draft_at timestamptz;

COMMENT ON COLUMN public.site_surveys.report_status IS
  'Báo cáo khảo sát: nhap → cho_duyet → da_duyet | tra_ve (Ban Giám đốc duyệt, 0175). Chỉ hàm hệ thống đổi.';
COMMENT ON COLUMN public.site_surveys.ai_draft IS
  'Bản nháp do máy viết từ ghi âm (6 ô báo cáo) — người khảo sát xem, sửa rồi mới lưu vào các cột thật.';

-- ----------------------------------------------------------------------------
-- 1. Quyền đọc / ghi một biên bản khảo sát — một chỗ cho bảng, bảng ghi âm và kho tệp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_survey_readable(p_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_surveys s
    JOIN public.opportunities o ON o.id = s.opportunity_id
    WHERE s.id = p_survey_id AND s.deleted_at IS NULL
      AND public.rls_company_access(o.company_id)
      -- Ghi âm là giọng khách hàng: chỉ ai xem được CRM (Kinh doanh, lãnh đạo, KSNB) mới nghe —
      -- Thi công cùng pháp nhân thì không (đo bằng phép thử survey-report.test.ts).
      AND public.auth_can_view_module('CRM')
  );
$$;

-- Ghi: người phụ trách cơ hội / lãnh đạo, cơ hội chưa bàn giao, báo cáo chưa gửi hoặc bị trả về.
CREATE OR REPLACE FUNCTION public.rls_survey_writable(p_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_surveys s
    JOIN public.opportunities o ON o.id = s.opportunity_id
    WHERE s.id = p_survey_id AND s.deleted_at IS NULL
      AND o.handed_over_at IS NULL
      AND s.report_status IN ('nhap', 'tra_ve')
      AND public.rls_owner_can_write(o.company_id, o.owner_id)
  );
$$;

REVOKE ALL ON FUNCTION public.rls_survey_readable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_survey_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_survey_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_survey_writable(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Khoá biên bản theo trạng thái báo cáo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_surveys_report_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Hàm hệ thống đang ghi, hoặc tiến trình không có phiên đăng nhập (nạp dữ liệu, kiểm thử chạy
  -- thẳng trên CSDL) — cùng quy tắc với cấp mã (0132).
  IF COALESCE(current_setting('nvg.survey_report', true), '') = 'on'
     OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cột do hệ thống ghi: người dùng gửi lên thì bỏ qua.
  NEW.started_at := OLD.started_at;
  NEW.finished_at := OLD.finished_at;
  NEW.report_status := OLD.report_status;
  NEW.report_feedback := OLD.report_feedback;
  NEW.report_submitted_at := OLD.report_submitted_at;
  NEW.report_decided_at := OLD.report_decided_at;
  NEW.report_approval_id := OLD.report_approval_id;

  IF OLD.report_status IN ('cho_duyet', 'da_duyet') AND (
       NEW.needs IS DISTINCT FROM OLD.needs
       OR NEW.decision_maker IS DISTINCT FROM OLD.decision_maker
       OR NEW.budget_note IS DISTINCT FROM OLD.budget_note
       OR NEW.schedule_note IS DISTINCT FROM OLD.schedule_note
       OR NEW.commercial_terms IS DISTINCT FROM OLD.commercial_terms
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.surveyed_at IS DISTINCT FROM OLD.surveyed_at
       OR NEW.ai_draft IS DISTINCT FROM OLD.ai_draft
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     ) THEN
    RAISE EXCEPTION 'Báo cáo khảo sát đang chờ duyệt hoặc đã duyệt — không sửa được. Ban Giám đốc trả về thì mới sửa tiếp.';
  END IF;

  -- Máy đã ghi giờ kết thúc thì giờ khảo sát không sửa tay được nữa.
  IF OLD.finished_at IS NOT NULL THEN
    NEW.surveyed_at := OLD.surveyed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_surveys_report_guard ON public.site_surveys;
CREATE TRIGGER site_surveys_report_guard
  BEFORE UPDATE ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.site_surveys_report_guard();

-- Biên bản mới luôn bắt đầu ở Nháp, kể cả khi lệnh gửi lên khác.
CREATE OR REPLACE FUNCTION public.site_surveys_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  NEW.report_status := 'nhap';
  NEW.report_feedback := NULL;
  NEW.report_submitted_at := NULL;
  NEW.report_decided_at := NULL;
  NEW.report_approval_id := NULL;
  NEW.started_at := NULL;
  NEW.finished_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_surveys_report_insert ON public.site_surveys;
CREATE TRIGGER site_surveys_report_insert
  BEFORE INSERT ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.site_surveys_report_insert();

-- ----------------------------------------------------------------------------
-- 3. Ghi âm khảo sát
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_survey_recordings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         uuid NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  storage_path      text NOT NULL,
  mime_type         varchar(64) NOT NULL,
  duration_seconds  integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  size_bytes        bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  transcript        text,
  transcript_status varchar(16) NOT NULL DEFAULT 'chua'
                    CHECK (transcript_status IN ('chua', 'xong', 'loi')),
  transcript_note   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT site_survey_recordings_path CHECK (storage_path LIKE survey_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS site_survey_recordings_survey_idx
  ON public.site_survey_recordings (survey_id, created_at);

COMMENT ON TABLE public.site_survey_recordings IS
  'Đoạn ghi âm buổi khảo sát + bản chép chữ (Đợt 1 — 1D, K1). Tệp ở kho riêng survey-audio, thư mục đầu = id biên bản.';

CREATE OR REPLACE FUNCTION public.site_survey_recordings_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o.company_id INTO NEW.company_id
    FROM public.site_surveys s JOIN public.opportunities o ON o.id = s.opportunity_id
    WHERE s.id = NEW.survey_id;
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    NEW.transcript := NULL;
    NEW.transcript_status := 'chua';
    RETURN NEW;
  END IF;
  -- Sửa: chỉ phần chép chữ (Worker ghi sau khi chuyển giọng nói, hoặc người dùng sửa tay).
  NEW.survey_id := OLD.survey_id;
  NEW.company_id := OLD.company_id;
  NEW.storage_path := OLD.storage_path;
  NEW.mime_type := OLD.mime_type;
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_survey_recordings_before_write ON public.site_survey_recordings;
CREATE TRIGGER site_survey_recordings_before_write
  BEFORE INSERT OR UPDATE ON public.site_survey_recordings
  FOR EACH ROW EXECUTE FUNCTION public.site_survey_recordings_before_write();

ALTER TABLE public.site_survey_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_survey_recordings FROM anon;

DROP POLICY IF EXISTS site_survey_recordings_select ON public.site_survey_recordings;
CREATE POLICY site_survey_recordings_select ON public.site_survey_recordings
  FOR SELECT TO authenticated
  USING (public.rls_survey_readable(survey_id));

DROP POLICY IF EXISTS site_survey_recordings_insert ON public.site_survey_recordings;
CREATE POLICY site_survey_recordings_insert ON public.site_survey_recordings
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_survey_writable(survey_id));

DROP POLICY IF EXISTS site_survey_recordings_update ON public.site_survey_recordings;
CREATE POLICY site_survey_recordings_update ON public.site_survey_recordings
  FOR UPDATE TO authenticated
  USING (public.rls_survey_writable(survey_id))
  WITH CHECK (public.rls_survey_writable(survey_id));

DROP POLICY IF EXISTS site_survey_recordings_delete ON public.site_survey_recordings;
CREATE POLICY site_survey_recordings_delete ON public.site_survey_recordings
  FOR DELETE TO authenticated
  USING (public.rls_survey_writable(survey_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_survey_recordings TO authenticated;

-- Kho tệp ghi âm: riêng tư, chỉ âm thanh, 50 MB một đoạn (khoảng 1 giờ ghi giọng nói).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('survey-audio', 'survey-audio', false, 52428800,
        ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS survey_audio_select ON storage.objects;
CREATE POLICY survey_audio_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'survey-audio'
         AND public.rls_survey_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS survey_audio_insert ON storage.objects;
CREATE POLICY survey_audio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'survey-audio'
              AND public.rls_survey_writable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS survey_audio_delete ON storage.objects;
CREATE POLICY survey_audio_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'survey-audio'
         AND public.rls_survey_writable(public.try_uuid((storage.foldername(name))[1])));

-- ----------------------------------------------------------------------------
-- 4. Nhật ký gọi AI (K1 / K5) — chỉ Worker ghi (khoá service), lãnh đạo / Quản trị xem
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_calls (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  feature       varchar(32) NOT NULL,
  provider      varchar(32) NOT NULL,
  model         varchar(96),
  is_fake       boolean NOT NULL DEFAULT false,
  input_units   integer,
  output_units  integer,
  cost_usd      numeric(12, 6),
  ok            boolean NOT NULL,
  error         text,
  entity_type   varchar(64),
  entity_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON public.ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_feature_idx ON public.ai_calls (feature, created_at DESC);

COMMENT ON TABLE public.ai_calls IS
  'Mọi lần gọi AI của các bộ phận (không gồm AI Design — có bảng riêng): giả lập hay thật, số lượng, chi phí. Chỉ Worker ghi.';

ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_calls FROM anon, authenticated;
GRANT SELECT ON public.ai_calls TO authenticated;

DROP POLICY IF EXISTS ai_calls_select ON public.ai_calls;
CREATE POLICY ai_calls_select ON public.ai_calls
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'ADMIN'));

-- Công tắc AI — để TRỐNG = tắt (CLAUDE.md 5.2). Quản trị bật khi chủ dự án duyệt chi phí.
INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT v.k, 'global', NULL, v.l, v.d
FROM (VALUES
  ('ai.transcribe_enabled', 'Bật chuyển giọng nói thành chữ',
   'Cloudflare Workers AI Whisper. 1 = bật; để trống = tắt (người dùng tự gõ).'),
  ('ai.survey_summary_enabled', 'Bật máy viết báo cáo khảo sát',
   'Gemini Flash gói trả phí, từ bản chép chữ ghi âm. 1 = bật; để trống = tắt.')
) AS v(k, l, d)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p WHERE p.param_key = v.k AND p.scope_type = 'global'
);

-- ----------------------------------------------------------------------------
-- 5. Bắt đầu / kết thúc khảo sát — máy ghi giờ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_site_survey(p_survey_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NOT public.rls_survey_writable(p_survey_id) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách cơ hội bắt đầu được buổi khảo sát này.';
  END IF;
  SELECT * INTO s FROM public.site_surveys WHERE id = p_survey_id FOR UPDATE;
  IF s.finished_at IS NOT NULL THEN
    RAISE EXCEPTION 'Buổi khảo sát này đã kết thúc.';
  END IF;
  PERFORM set_config('nvg.survey_report', 'on', true);
  UPDATE public.site_surveys
     SET started_at = COALESCE(started_at, now()),
         surveyed_by = COALESCE(surveyed_by, public.auth_user_id()),
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_survey_id
   RETURNING started_at INTO s;
  PERFORM set_config('nvg.survey_report', 'off', true);
  RETURN s.started_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_site_survey(p_survey_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NOT public.rls_survey_writable(p_survey_id) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách cơ hội kết thúc được buổi khảo sát này.';
  END IF;
  SELECT * INTO s FROM public.site_surveys WHERE id = p_survey_id FOR UPDATE;
  IF s.started_at IS NULL THEN
    RAISE EXCEPTION 'Bấm «Bắt đầu khảo sát» khi tới nơi trước — máy ghi giờ bắt đầu và kết thúc.';
  END IF;
  IF s.finished_at IS NOT NULL THEN
    RETURN s.finished_at;
  END IF;
  PERFORM set_config('nvg.survey_report', 'on', true);
  UPDATE public.site_surveys
     SET finished_at = now(),
         surveyed_at = now(),
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_survey_id
   RETURNING finished_at INTO s;
  PERFORM set_config('nvg.survey_report', 'off', true);
  RETURN s.finished_at;
END;
$$;

REVOKE ALL ON FUNCTION public.start_site_survey(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_site_survey(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_site_survey(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_site_survey(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Gửi báo cáo cho Ban Giám đốc
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_survey_report(p_survey_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  s record;
  o record;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF NOT public.rls_survey_writable(p_survey_id) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách cơ hội gửi được báo cáo này, và chỉ khi báo cáo đang ở Nháp hoặc bị trả về.';
  END IF;
  SELECT * INTO s FROM public.site_surveys WHERE id = p_survey_id FOR UPDATE;
  SELECT id, company_id, code, name INTO o FROM public.opportunities WHERE id = s.opportunity_id;

  IF s.surveyed_at IS NULL THEN
    RAISE EXCEPTION 'Chưa ghi nhận buổi khảo sát — bấm «Kết thúc khảo sát» (hoặc ghi thời điểm đã khảo sát) trước khi gửi.';
  END IF;
  IF NULLIF(btrim(COALESCE(s.needs, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Báo cáo còn trống phần Nhu cầu của khách — điền trước khi gửi Ban Giám đốc.';
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by
  )
  VALUES (
    o.company_id, 'survey_report', 'site_surveys', s.id, o.code,
    format('Báo cáo khảo sát — %s', o.name),
    NULL, s.needs, 'pending_approval', v_user
  )
  RETURNING id INTO v_approval;

  PERFORM set_config('nvg.survey_report', 'on', true);
  UPDATE public.site_surveys
     SET report_status = 'cho_duyet', report_approval_id = v_approval,
         report_submitted_at = now(), report_feedback = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = p_survey_id;
  PERFORM set_config('nvg.survey_report', 'off', true);

  RETURN v_approval;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_survey_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_survey_report(uuid) TO authenticated;
COMMENT ON FUNCTION public.submit_survey_report(uuid) IS
  'Gửi báo cáo khảo sát cho Ban Giám đốc qua Hộp thư Phê duyệt dùng chung (Đợt 1 — 1D).';

-- Hạn mức (Ban Giám đốc + Tổng Giám đốc, không gắn tiền) nằm ở `DEFAULT_APPROVAL_LIMITS` và do
-- `db:seed` ghi — KHÔNG chèn ở đây: mọi migration chưa áp chạy chung MỘT giao dịch, nên giá trị
-- enum vừa thêm ở 0174 chưa dùng được (lỗi «unsafe use of new value»). Phát hành: chạy seed sau
-- migrate, như vai trò KSNB (CLAUDE.md 9.2).

-- ----------------------------------------------------------------------------
-- 7. Ba hàm chép nguyên bản mới nhất, thêm nhánh báo cáo khảo sát
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
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise, không âm thầm coi là hoàn tất (0088).';

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise, không âm thầm coi là hoàn tất (0088). Thêm nhánh báo cáo khảo sát (0175).';

CREATE OR REPLACE FUNCTION public.my_pending_approvals()
RETURNS TABLE (
  id                uuid,
  subject           approval_subject,
  entity_type       varchar(64),
  entity_id         uuid,
  entity_code       varchar(40),
  title             text,
  amount            bigint,
  reason            text,
  requested_at      timestamptz,
  requested_by_name text,
  company_code      varchar(8),
  company_name      varchar(64),
  parent_id         uuid,
  parent_module     varchar(8),
  due_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending AS (
    SELECT
      a.id, a.subject, a.entity_type, a.entity_id, a.entity_code, a.title, a.amount, a.reason,
      a.requested_at, u.full_name AS requested_by_name, c.code AS company_code,
      c.short_name AS company_name,
      CASE
        WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
        WHEN a.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
        WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
        WHEN a.entity_type = 'site_surveys'        THEN sv.opportunity_id
      END AS parent_id,
      CASE
        WHEN a.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
        WHEN a.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
      END AS parent_module,
      a.requested_at
        + make_interval(hours => public.sla_target_hours(a.subject::text, a.company_id))
        AS due_at
    FROM public.approvals a
    LEFT JOIN public.users     u ON u.id = a.requested_by
    LEFT JOIN public.companies c ON c.id = a.company_id
    LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
    LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
    LEFT JOIN public.contract_amendments am
           ON a.entity_type = 'contract_amendments' AND am.id = a.entity_id
    LEFT JOIN public.site_surveys sv
           ON a.entity_type = 'site_surveys' AND sv.id = a.entity_id
    WHERE a.status = 'pending_approval'
      AND a.deleted_at IS NULL
      AND public.rls_can_approve(a.subject, a.company_id, a.amount)
      -- 0156: hồ sơ do chính mình gửi không nằm trong hộp thư của mình — không ai tự duyệt.
      AND a.requested_by IS DISTINCT FROM public.auth_user_id()
  )
  SELECT id, subject, entity_type, entity_id, entity_code, title, amount, reason,
         requested_at, requested_by_name, company_code, company_name,
         parent_id, parent_module::varchar(8), due_at
  FROM pending
  ORDER BY (due_at IS NOT NULL AND due_at < now()) DESC, due_at NULLS LAST, requested_at;
$$;

REVOKE ALL ON FUNCTION public.my_pending_approvals() FROM public;
GRANT EXECUTE ON FUNCTION public.my_pending_approvals() TO authenticated;

CREATE OR REPLACE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
RETURNS TABLE (for_stage text, requirement text, met boolean, label text, waivable boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o            record;
  c            record;
  v_site       record;
  v_missing    text[];
  v_classified boolean;
  v_class_lbl  text;
  v_surveyed   boolean;
  v_any_surveyed boolean;
BEGIN
  IF p_entity_type = 'opportunity' THEN
    SELECT id, company_id, stage, classification, project_type, survey_waived_reason, deleted_at
      INTO o
      FROM public.opportunities WHERE id = p_id;
    -- Không đọc được cơ hội thì không trả gì — không lộ cả việc cơ hội có tồn tại.
    IF NOT FOUND OR o.deleted_at IS NOT NULL OR NOT public.rls_company_access(o.company_id) THEN
      RETURN;
    END IF;

    v_classified := o.classification IN ('M2', 'M3', 'M4')
                    AND NULLIF(btrim(o.project_type), '') IS NOT NULL;
    v_class_lbl := CASE
      WHEN o.classification = 'M1' THEN
        'Đang phân loại M1 — Lưu trữ: chỉ đi tiếp khi khách có nhu cầu thực (M2–M4)'
      ELSE 'Đã phân loại M2–M4 và khai loại công trình'
    END;
    -- 0175 (Đợt 1 — 1D): «đã khảo sát» = có biên bản đã khảo sát VÀ báo cáo đã được Ban Giám đốc
    -- duyệt. Chưa duyệt (nháp, chờ duyệt, bị trả về) thì chưa sang Báo giá — chủ dự án chốt.
    v_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                           WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                             AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                             AND s.report_status = 'da_duyet');
    -- Đã có buổi khảo sát thật thì KHÔNG còn lối «bỏ qua khảo sát»: lối đó dành cho cơ hội không
    -- khảo sát, dùng ở đây là vượt qua Ban Giám đốc (thấy khi chạy thử 17/10/2026).
    v_any_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                               WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                                 AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now());

    RETURN QUERY SELECT 'khao_sat'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY SELECT 'bao_gia'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'survey_done'::text,
           v_surveyed OR (o.survey_waived_reason IS NOT NULL AND NOT v_any_surveyed),
           CASE WHEN NOT v_any_surveyed AND o.survey_waived_reason IS NOT NULL
                THEN 'Bỏ qua khảo sát: ' || o.survey_waived_reason
                WHEN v_any_surveyed AND NOT v_surveyed
                THEN 'Báo cáo khảo sát đã được Ban Giám đốc duyệt (đã khảo sát — gửi báo cáo, chờ duyệt)'
                ELSE 'Báo cáo khảo sát đã được Ban Giám đốc duyệt' END,
           NOT v_any_surveyed;

    RETURN QUERY
    SELECT 'dam_phan'::text, 'offer_sent'::text,
           (EXISTS (SELECT 1 FROM public.quotes q
                     WHERE q.opportunity_id = p_id AND q.is_current_version AND q.deleted_at IS NULL
                       AND q.status = 'completed' AND q.sent_to_customer_at IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.bidding_projects b
                        WHERE b.opportunity_id = p_id AND b.deleted_at IS NULL
                          AND b.stage IN ('nop_thau', 'trung_thau'))
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.opportunity_id = p_id AND d.deleted_at IS NULL
                          AND d.stage IN ('cho_khach_duyet', 'ho_so_ky_thuat', 'du_toan',
                                          'ban_giao', 'dung_thiet_ke'))),
           'Báo giá đã duyệt và đã gửi khách, hoặc gói thầu đã nộp, hoặc phương án thiết kế đã gửi khách duyệt'::text,
           false;

    RETURN QUERY
    SELECT 'ky_hop_dong'::text, 'contract_signed'::text, false,
           'Tự chuyển khi hợp đồng liên kết được ghi nhận đã ký'::text, false;
  END IF;
  IF p_entity_type = 'contract' THEN
    SELECT id, value, stage, deleted_at INTO c FROM public.contracts WHERE id = p_id;
    IF NOT FOUND OR c.deleted_at IS NOT NULL OR NOT public.rls_contract_readable(p_id) THEN
      RETURN;
    END IF;

    -- Cùng ba nhóm điều khoản mà `submit_contract_approval` (0027) chặn — đọc trước để màn hình
    -- nói «còn thiếu gì» thay vì để người dùng bấm rồi mới nhận lỗi.
    SELECT array_agg(CASE r.t WHEN 'pham_vi' THEN 'phạm vi công việc'
                              WHEN 'gia_tri' THEN 'giá trị'
                              ELSE 'tiến độ thanh toán' END ORDER BY r.n)
      INTO v_missing
      FROM unnest(ARRAY['pham_vi', 'gia_tri', 'tien_do_thanh_toan']::contract_term_type[])
           WITH ORDINALITY AS r(t, n)
     WHERE NOT EXISTS (SELECT 1 FROM public.contract_terms ct
                        WHERE ct.contract_id = p_id AND ct.deleted_at IS NULL AND ct.term_type = r.t);

    RETURN QUERY SELECT 'cho_duyet'::text, 'value_set'::text,
           COALESCE(c.value, 0) > 0,
           'Có giá trị hợp đồng (lấy từ báo giá / dự toán đã duyệt)'::text, false;

    RETURN QUERY SELECT 'cho_duyet'::text, 'terms_complete'::text,
           v_missing IS NULL,
           CASE WHEN v_missing IS NULL
                THEN 'Đã ghi đủ điều khoản bắt buộc: phạm vi, giá trị, tiến độ thanh toán'
                ELSE 'Ghi điều khoản còn thiếu: ' || array_to_string(v_missing, ', ') END,
           false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'sites_done'::text,
           NOT EXISTS (SELECT 1 FROM public.construction_sites s
                        WHERE s.contract_id = p_id AND s.deleted_at IS NULL
                          AND s.stage NOT IN ('bao_hanh', 'hoan_thanh')),
           'Mọi công trình của hợp đồng đã sang Bảo hành hoặc Hoàn thành'::text, false;
  END IF;
  IF p_entity_type = 'site' THEN
    SELECT id, responsible_user_id, planned_start_date, planned_end_date, deleted_at
      INTO v_site FROM public.construction_sites WHERE id = p_id;
    IF NOT FOUND OR v_site.deleted_at IS NOT NULL OR NOT public.rls_site_readable(p_id) THEN
      RETURN;
    END IF;

    -- Chỉ huy trưởng phải là người làm thi công (có quyền sửa Module TC) — không phải bất kỳ ai:
    -- trước 0164 công trình mở từ hợp đồng tự lấy người Kinh doanh phụ trách hợp đồng.
    RETURN QUERY SELECT 'dang_thi_cong'::text, 'commander_assigned'::text,
           v_site.responsible_user_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.user_companies uc
                         JOIN public.permissions pm ON pm.role_id = uc.role_id
                        WHERE uc.user_id = v_site.responsible_user_id AND uc.deleted_at IS NULL
                          AND pm.module_code = 'TC' AND pm.can_edit),
           'Đã phân công chỉ huy trưởng (người thuộc bộ phận Thi công)'::text, false;

    RETURN QUERY SELECT 'dang_thi_cong'::text, 'planned_dates'::text,
           v_site.planned_start_date IS NOT NULL AND v_site.planned_end_date IS NOT NULL,
           'Đã ghi ngày khởi công và ngày hoàn thành dự kiến'::text, false;

    -- Đúng điều kiện `move_site_stage` (0035) chặn khi bàn giao.
    RETURN QUERY SELECT 'bao_hanh'::text, 'customer_acceptance'::text,
           EXISTS (SELECT 1 FROM public.acceptance_records a
                    WHERE a.construction_site_id = p_id AND a.deleted_at IS NULL
                      AND a.acceptance_type = 'khach_hang' AND a.status = 'da_nghiem_thu'),
           'Có biên bản nghiệm thu với chủ đầu tư đã ký'::text, false;

    -- 0166: kết thúc công trình = hết bảo hành, không còn việc bảo hành nào treo. Áp cho cả
    -- đường tắt Nghiệm thu → Kết thúc: công trình không khai bảo hành thì không kết thúc được.
    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_declared'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL),
           'Đã khai hạng mục bảo hành'::text, false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_expired'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM public.warranties w
                            WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL
                              AND (w.warranty_until IS NULL OR w.warranty_until > current_date)),
           COALESCE('Mọi hạng mục đã hết hạn bảo hành (hạng mục cuối hết hạn '
                    || (SELECT to_char(max(w.warranty_until), 'DD/MM/YYYY') FROM public.warranties w
                         WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL) || ')',
                    'Mọi hạng mục đã hết hạn bảo hành'),
           false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'claims_closed'::text,
           NOT EXISTS (SELECT 1 FROM public.warranty_claims wc
                         JOIN public.warranties w ON w.id = wc.warranty_id
                        WHERE w.construction_site_id = p_id AND wc.deleted_at IS NULL
                          AND wc.status IN ('tiep_nhan', 'dang_xu_ly')),
           'Không còn yêu cầu bảo hành nào đang mở'::text, false;
  END IF;
END;
$$;

