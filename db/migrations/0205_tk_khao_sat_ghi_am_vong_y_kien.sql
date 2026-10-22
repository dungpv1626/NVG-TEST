-- ============================================================================
-- Đợt 5 — 5A: Thiết kế — khảo sát ghi âm + vòng ý kiến khách (doc/KE_HOACH_LAM_HO.md).
--
-- Khảo sát hiện trạng của Thiết kế (TK-02) đi cùng luồng với khảo sát Kinh doanh của Đợt 1 (1D):
--   · «Bắt đầu khảo sát» / «Kết thúc khảo sát» — MÁY ghi giờ (`start_design_survey`,
--     `finish_design_survey`); hai cột giờ chỉ đổi qua hai hàm đó (trigger
--     `design_surveys_clock_guard`). Biên bản lập tay vẫn còn làm lối dự phòng («quên bấm»), khi
--     đó hai cột giờ để trống — không có giờ máy thì không giả làm có.
--   · Ghi âm lời chủ nhà tại hiện trường → kho riêng `design-audio` (thư mục đầu = dự án thiết kế,
--     quyền theo `rls_design_project_readable / _writable`, không chính sách xoá — lời nói gốc là
--     bằng chứng) → bảng `design_survey_recordings` + bản chép chữ (Worker `/ai/design-transcribe`).
--
-- Ý kiến khách theo TỪNG VÒNG trên phiên bản thiết kế:
--   · `design_reviews.round_no` — số vòng tự đánh (trigger), theo (dự án, bộ môn), chỉ cho ý kiến
--     của khách hàng; góp ý nội bộ không phải một vòng với khách.
--   · `design_reviews.voice_path`, `voice_transcript` — ý kiến được NÓI thay gõ.
--   · Ghi qua `record_design_feedback` (bọc `record_design_review` có sẵn, không chép lại nó).
--   · Phiên bản bản vẽ vẫn tự đánh số như cũ (`design_versions_assign_version`).
--
-- Không đụng module «AI Design» (CLAUDE.md 8: độc lập với quy trình hồ sơ thiết kế).
-- Chạy lại được.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Giờ bắt đầu / kết thúc khảo sát do máy ghi
-- ----------------------------------------------------------------------------
ALTER TABLE public.design_surveys
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

COMMENT ON COLUMN public.design_surveys.started_at IS
  'Máy ghi lúc bấm «Bắt đầu khảo sát» (5A). Trống = biên bản lập tay, không có giờ máy.';
COMMENT ON COLUMN public.design_surveys.finished_at IS
  'Máy ghi lúc bấm «Kết thúc khảo sát» (5A). Chỉ đổi qua finish_design_survey.';

-- Cùng điều kiện với policy `design_surveys_update` (Mẫu B) — một chỗ cho hàm + bảng ghi âm.
CREATE OR REPLACE FUNCTION public.rls_design_survey_writable(p_survey_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.design_surveys s
    JOIN public.design_projects p ON p.id = s.design_project_id
    WHERE s.id = p_survey_id
      AND s.deleted_at IS NULL
      AND public.rls_design_project_writable(s.design_project_id)
      AND (
        public.rls_owner_can_write(
          s.company_id, s.surveyed_by, array_remove(ARRAY[p.responsible_user_id], NULL::uuid)
        )
        OR (s.surveyed_by IS NULL AND public.auth_can_create_in('TK', s.company_id))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.rls_design_survey_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_design_survey_writable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.design_surveys_clock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('nvg.design_survey_clock', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.started_at IS NOT NULL OR NEW.finished_at IS NOT NULL THEN
      RAISE EXCEPTION 'Giờ bắt đầu / kết thúc khảo sát do máy ghi khi bấm «Bắt đầu khảo sát» / «Kết thúc khảo sát», không nhập tay.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.finished_at IS DISTINCT FROM OLD.finished_at THEN
    RAISE EXCEPTION 'Giờ bắt đầu / kết thúc khảo sát do máy ghi, không sửa tay.'
      USING ERRCODE = '42501';
  END IF;
  -- Buổi khảo sát có giờ máy thì mốc đi đo cũng là giờ máy.
  IF OLD.started_at IS NOT NULL AND NEW.surveyed_at IS DISTINCT FROM OLD.surveyed_at THEN
    RAISE EXCEPTION 'Thời điểm khảo sát do máy ghi, không sửa tay.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_surveys_clock_guard ON public.design_surveys;
CREATE TRIGGER design_surveys_clock_guard
  BEFORE INSERT OR UPDATE ON public.design_surveys
  FOR EACH ROW EXECUTE FUNCTION public.design_surveys_clock_guard();

/**
 * Bắt đầu một buổi khảo sát: lập biên bản mới, máy ghi giờ bắt đầu + người đi đo. Bấm hai lần
 * (mạng chậm) không ra hai biên bản — buổi đang mở của chính người bấm được trả lại.
 */
CREATE OR REPLACE FUNCTION public.start_design_survey(p_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.auth_user_id();
  v_company uuid;
  v_id      uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.rls_design_project_writable(p_project_id) THEN
    RAISE EXCEPTION 'Không bắt đầu được khảo sát: tài khoản không được sửa hồ sơ thiết kế này, hoặc hồ sơ đã bàn giao. Phòng Thiết kế thực hiện được.'
      USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company FROM public.design_projects WHERE id = p_project_id FOR UPDATE;

  SELECT id INTO v_id FROM public.design_surveys
   WHERE design_project_id = p_project_id AND surveyed_by = v_user
     AND started_at IS NOT NULL AND finished_at IS NULL AND deleted_at IS NULL
   ORDER BY started_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  PERFORM set_config('nvg.design_survey_clock', 'on', true);
  INSERT INTO public.design_surveys (
    company_id, design_project_id, surveyed_by, surveyed_at, started_at, created_by, updated_by
  )
  VALUES (v_company, p_project_id, v_user, now(), now(), v_user, v_user)
  RETURNING id INTO v_id;
  PERFORM set_config('nvg.design_survey_clock', 'off', true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_design_survey(p_survey_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_at timestamptz;
BEGIN
  IF NOT public.rls_design_survey_writable(p_survey_id) THEN
    RAISE EXCEPTION 'Không kết thúc được khảo sát: chỉ người đi đo hoặc người chịu trách nhiệm dự án thực hiện được.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.design_surveys WHERE id = p_survey_id FOR UPDATE;
  IF s.started_at IS NULL THEN
    RAISE EXCEPTION 'Biên bản này lập tay, không có giờ bắt đầu do máy ghi.';
  END IF;
  IF s.finished_at IS NOT NULL THEN
    RETURN s.finished_at;
  END IF;
  PERFORM set_config('nvg.design_survey_clock', 'on', true);
  UPDATE public.design_surveys
     SET finished_at = now(), updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_survey_id
   RETURNING finished_at INTO v_at;
  PERFORM set_config('nvg.design_survey_clock', 'off', true);
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.start_design_survey(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_design_survey(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_design_survey(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_design_survey(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Kho ghi âm của Thiết kế
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('design-audio', 'design-audio', false, 52428800,
        ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS design_audio_select ON storage.objects;
CREATE POLICY design_audio_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'design-audio'
         AND public.rls_design_project_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS design_audio_insert ON storage.objects;
CREATE POLICY design_audio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'design-audio'
              AND public.rls_design_project_writable(public.try_uuid((storage.foldername(name))[1])));

-- ----------------------------------------------------------------------------
-- 3. Đoạn ghi âm buổi khảo sát
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.design_survey_recordings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_survey_id  uuid NOT NULL REFERENCES public.design_surveys(id) ON DELETE CASCADE,
  design_project_id uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  storage_path      text NOT NULL,
  duration_seconds  integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  transcript        text,
  transcript_status varchar(16) NOT NULL DEFAULT 'chua'
                    CHECK (transcript_status IN ('chua', 'xong', 'loi')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_survey_recordings_survey_idx
  ON public.design_survey_recordings (design_survey_id, created_at);

COMMENT ON TABLE public.design_survey_recordings IS
  'Đoạn ghi âm buổi khảo sát thiết kế + bản chép chữ (5A). Tệp ở kho design-audio, đường dẫn `<dự án>/khao-sat/<biên bản>/…`. Không xoá.';

CREATE OR REPLACE FUNCTION public.design_survey_recordings_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT s.design_project_id, s.company_id INTO NEW.design_project_id, NEW.company_id
    FROM public.design_surveys s WHERE s.id = NEW.design_survey_id;
    IF NEW.storage_path NOT LIKE NEW.design_project_id::text || '/khao-sat/'
                                 || NEW.design_survey_id::text || '/%' THEN
      RAISE EXCEPTION 'Đoạn ghi âm không thuộc biên bản khảo sát này. Ghi âm lại từ đúng biên bản.';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    NEW.transcript := NULL;
    NEW.transcript_status := 'chua';
    RETURN NEW;
  END IF;
  -- Sửa: chỉ phần chép chữ.
  NEW.design_survey_id := OLD.design_survey_id;
  NEW.design_project_id := OLD.design_project_id;
  NEW.company_id := OLD.company_id;
  NEW.storage_path := OLD.storage_path;
  NEW.duration_seconds := OLD.duration_seconds;
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_survey_recordings_before_write ON public.design_survey_recordings;
CREATE TRIGGER design_survey_recordings_before_write
  BEFORE INSERT OR UPDATE ON public.design_survey_recordings
  FOR EACH ROW EXECUTE FUNCTION public.design_survey_recordings_before_write();

ALTER TABLE public.design_survey_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_survey_recordings FROM anon;

DROP POLICY IF EXISTS design_survey_recordings_select ON public.design_survey_recordings;
CREATE POLICY design_survey_recordings_select ON public.design_survey_recordings
  FOR SELECT TO authenticated
  USING (public.rls_design_project_readable(design_project_id));

DROP POLICY IF EXISTS design_survey_recordings_insert ON public.design_survey_recordings;
CREATE POLICY design_survey_recordings_insert ON public.design_survey_recordings
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_design_survey_writable(design_survey_id));

DROP POLICY IF EXISTS design_survey_recordings_update ON public.design_survey_recordings;
CREATE POLICY design_survey_recordings_update ON public.design_survey_recordings
  FOR UPDATE TO authenticated
  USING (public.rls_design_survey_writable(design_survey_id))
  WITH CHECK (public.rls_design_survey_writable(design_survey_id));

GRANT SELECT, INSERT, UPDATE ON public.design_survey_recordings TO authenticated;
REVOKE DELETE ON public.design_survey_recordings FROM authenticated;

-- ----------------------------------------------------------------------------
-- 4. Vòng ý kiến khách
-- ----------------------------------------------------------------------------
ALTER TABLE public.design_reviews
  ADD COLUMN IF NOT EXISTS round_no integer,
  ADD COLUMN IF NOT EXISTS voice_path text,
  ADD COLUMN IF NOT EXISTS voice_transcript text;

COMMENT ON COLUMN public.design_reviews.round_no IS
  'Vòng ý kiến khách thứ mấy của dự án trên bộ môn này — máy đánh số (5A). Góp ý nội bộ: trống.';
COMMENT ON COLUMN public.design_reviews.voice_path IS
  'Ý kiến được nói thay gõ: tệp ở kho design-audio, `<dự án>/y-kien/…`.';

DROP TRIGGER IF EXISTS design_reviews_round_frozen ON public.design_reviews;

-- Đánh số các ý kiến khách đã có (chỉ dòng chưa có số).
WITH numbered AS (
  SELECT r.id,
         row_number() OVER (PARTITION BY v.design_project_id, v.discipline
                            ORDER BY r.reviewed_at, r.created_at, r.id) AS n
  FROM public.design_reviews r
  JOIN public.design_versions v ON v.id = r.design_version_id
  WHERE r.reviewer_type = 'khach_hang'
)
UPDATE public.design_reviews r
   SET round_no = numbered.n
  FROM numbered
 WHERE r.id = numbered.id AND r.round_no IS NULL;

CREATE OR REPLACE FUNCTION public.design_reviews_assign_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project    uuid;
  v_discipline public.design_discipline;
BEGIN
  SELECT design_project_id, discipline INTO v_project, v_discipline
  FROM public.design_versions WHERE id = NEW.design_version_id;

  IF NEW.reviewer_type = 'khach_hang' THEN
    -- Khoá dự án: hai người ghi cùng lúc không ra hai «vòng 3».
    PERFORM 1 FROM public.design_projects WHERE id = v_project FOR UPDATE;
    SELECT COALESCE(max(r.round_no), 0) + 1 INTO NEW.round_no
    FROM public.design_reviews r
    JOIN public.design_versions v ON v.id = r.design_version_id
    WHERE v.design_project_id = v_project AND v.discipline = v_discipline
      AND r.reviewer_type = 'khach_hang';
  ELSE
    NEW.round_no := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_reviews_assign_round ON public.design_reviews;
CREATE TRIGGER design_reviews_assign_round
  BEFORE INSERT ON public.design_reviews
  FOR EACH ROW EXECUTE FUNCTION public.design_reviews_assign_round();

-- Số vòng đã đánh và ý kiến đã ghi không đổi về sau.
CREATE OR REPLACE FUNCTION public.design_reviews_round_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.round_no IS DISTINCT FROM OLD.round_no THEN
    RAISE EXCEPTION 'Số vòng ý kiến do máy đánh, không sửa.' USING ERRCODE = '42501';
  END IF;
  IF OLD.voice_path IS NOT NULL AND NEW.voice_path IS DISTINCT FROM OLD.voice_path THEN
    RAISE EXCEPTION 'Đoạn ghi âm của ý kiến đã ghi không đổi được.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_reviews_round_frozen ON public.design_reviews;
CREATE TRIGGER design_reviews_round_frozen
  BEFORE UPDATE ON public.design_reviews
  FOR EACH ROW EXECUTE FUNCTION public.design_reviews_round_frozen();

/**
 * Ghi một vòng ý kiến khách trên một phiên bản đã phát hành — gõ hoặc nói. Bọc
 * `record_design_review` (giữ nguyên mọi quy tắc của nó: bản đã phát hành, tên người góp ý,
 * khách duyệt phương án → sang hồ sơ kỹ thuật) rồi gắn đoạn ghi âm.
 */
CREATE OR REPLACE FUNCTION public.record_design_feedback(
  p_version_id uuid,
  p_decision design_review_decision,
  p_comments text,
  p_reviewer_name text,
  p_voice_path text DEFAULT NULL,
  p_voice_transcript text DEFAULT NULL
)
RETURNS TABLE (review_id uuid, round_no integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_project uuid;
  v_id      uuid;
  v_round   integer;
BEGIN
  SELECT design_project_id INTO v_project FROM public.design_versions WHERE id = p_version_id;
  IF p_voice_path IS NOT NULL
     AND p_voice_path NOT LIKE v_project::text || '/y-kien/%' THEN
    RAISE EXCEPTION 'Đoạn ghi âm không thuộc dự án thiết kế này. Ghi âm lại từ đúng hồ sơ.';
  END IF;

  v_id := public.record_design_review(
    p_version_id, 'khach_hang'::design_reviewer_type,
    p_decision, p_comments, p_reviewer_name
  );

  IF p_voice_path IS NOT NULL THEN
    UPDATE public.design_reviews
       SET voice_path = p_voice_path,
           voice_transcript = NULLIF(btrim(p_voice_transcript), '')
     WHERE id = v_id;
  END IF;

  SELECT r.round_no INTO v_round FROM public.design_reviews r WHERE r.id = v_id;
  review_id := v_id;
  round_no := v_round;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_design_feedback(uuid, design_review_decision, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_design_feedback(uuid, design_review_decision, text, text, text, text)
  TO authenticated;
