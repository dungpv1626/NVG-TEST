-- ============================================================================
-- 0259 — Gửi «Bộ ý tưởng» AI Design cho khách bằng đường dẫn xem có hạn (B5, doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md)
--
-- Anh Dũng duyệt lời khuyên 30/10/2026 (CLAUDE.md 9.3 «Bước tiếp theo» 00(C) điểm 3–5):
--  - Kinh doanh hoặc kiến trúc sư «Đề nghị gửi khách» → kiến trúc sư «Duyệt gửi khách» → link mới mở được.
--    Người duyệt = người GHI được bộ môn kiến trúc của hồ sơ (`rls_design_writable(...,'kien_truc')`, vai trò Thiết kế).
--    Kiến trúc sư tự đề nghị thì tự duyệt được: duyệt là bước «kiến trúc sư đã xem bộ ý tưởng», mà người đề nghị
--    đã là kiến trúc sư. Kinh doanh (chỉ có quyền ĐỌC thiết kế) thì không bao giờ tự duyệt được.
--  - Chỉ hồ sơ ĐÃ KHẢO SÁT: hồ sơ gắn cơ hội thì cơ hội phải có báo cáo khảo sát ĐÃ DUYỆT (cùng điều kiện
--    «sang Báo giá» của `stage_readiness`) HOẶC hồ sơ đã có buổi khảo sát thiết kế. Hồ sơ không gắn cơ hội (khách
--    đến thẳng phòng Thiết kế) thì không có cơ hội để xét — cho phép; kiến trúc sư vẫn phải duyệt.
--  - Hạn link `tk.concept_link_days` (14 ngày, anh Dũng duyệt) tính TỪ LÚC DUYỆT, số ngày chụp vào dòng (không hồi
--    tố). Thu hồi được, đếm lượt xem.
--  - Khách thấy ĐÚNG bộ kiến trúc sư đã duyệt: lúc duyệt chụp mã đầu bài / mặt đứng / bộ phối cảnh đang hiệu lực;
--    ảnh phòng và ảnh mặt đứng lấy bản tạo TRƯỚC lúc duyệt. Vẽ thêm sau đó không tự lọt ra link.
--  - Trang công khai chỉ qua Worker `GET /public/concept/:token` → `design_concept_public` (chỉ service_role).
--    Không tên khách, không giá, không bảng kích thước, không DXF.
--
-- Ghi chỉ qua hàm (request / approve / revoke) — trình duyệt không INSERT / UPDATE thẳng bảng.
-- Chạy lại được.
-- ============================================================================

INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'tk.concept_link_days', 'global', '14'::jsonb, 'ngày', 'Hạn link xem bộ ý tưởng (ngày)',
       'Link gửi khách xem bộ ý tưởng AI Design mở được bao nhiêu ngày kể từ lúc kiến trúc sư duyệt '
       '(anh Dũng 30/10/2026: 14 ngày). Để trống = không duyệt được link mới.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
   WHERE p.param_key = 'tk.concept_link_days' AND p.scope_type = 'global'
);

CREATE TABLE IF NOT EXISTS public.design_concept_shares (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                 text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  design_project_id     uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  note                  text CHECK (note IS NULL OR char_length(note) <= 500),
  requested_by          uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  approved_by           uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at           timestamptz,
  link_days_applied     integer,
  expires_at            timestamptz,
  brief_artifact_id     varchar(71),
  facade_artifact_id    varchar(71),
  image_set_artifact_id varchar(71),
  revoked_by            uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_concept_shares_approved_shape CHECK (
    (approved_at IS NULL AND approved_by IS NULL AND expires_at IS NULL AND brief_artifact_id IS NULL)
    OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND expires_at > approved_at
        AND brief_artifact_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS design_concept_shares_project_idx
  ON public.design_concept_shares (design_project_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.design_concept_share_views (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id  uuid NOT NULL REFERENCES public.design_concept_shares(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_concept_share_views_share_idx
  ON public.design_concept_share_views (share_id, viewed_at DESC);

COMMENT ON TABLE public.design_concept_shares IS
  'Link khách xem bộ ý tưởng AI Design (0259): đề nghị → kiến trúc sư duyệt (chụp bộ đang hiệu lực) → mở 14 ngày, thu hồi được. Ghi qua request_/approve_/revoke_concept_share; trang công khai qua design_concept_public.';

-- ----------------------------------------------------------------------------
-- 1. Điều kiện «đã khảo sát»
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.design_concept_surveyed(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.opportunity_id IS NULL
        OR EXISTS (SELECT 1 FROM public.site_surveys s
                    WHERE s.opportunity_id = p.opportunity_id AND s.deleted_at IS NULL
                      AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                      AND s.report_status = 'da_duyet')
        OR EXISTS (SELECT 1 FROM public.design_surveys ds
                    WHERE ds.design_project_id = p.id AND ds.deleted_at IS NULL
                      AND (ds.surveyed_at IS NOT NULL OR ds.finished_at IS NOT NULL))
      FROM public.design_projects p
     WHERE p.id = p_project_id AND p.deleted_at IS NULL), false);
$$;

REVOKE ALL ON FUNCTION public.design_concept_surveyed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.design_concept_surveyed(uuid) TO authenticated;
COMMENT ON FUNCTION public.design_concept_surveyed(uuid) IS
  'Bộ ý tưởng gửi khách được không (0259): hồ sơ gắn cơ hội thì cơ hội có báo cáo khảo sát đã duyệt hoặc hồ sơ có buổi khảo sát thiết kế; không gắn cơ hội thì được.';

-- Quyền của người gọi trên một hồ sơ thiết kế, bộ môn kiến trúc.
CREATE OR REPLACE FUNCTION public._concept_project_access(p_project_id uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN p_write
                THEN public.rls_design_writable(c.tenant_id, p.id, 'kien_truc')
                ELSE public.rls_design_readable(c.tenant_id, p.id, 'kien_truc') END
      FROM public.design_projects p
      JOIN public.companies c ON c.id = p.company_id
     WHERE p.id = p_project_id AND p.deleted_at IS NULL), false);
$$;

REVOKE ALL ON FUNCTION public._concept_project_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._concept_project_access(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Khoá dòng: định danh không đổi, duyệt / thu hồi một chiều, duyệt phải đã khảo sát
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.design_concept_shares_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approved_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Link mới phải chờ kiến trúc sư duyệt.';
    END IF;
    IF NOT public.design_concept_surveyed(NEW.design_project_id) THEN
      RAISE EXCEPTION 'Chưa gửi bộ ý tưởng được: cơ hội của hồ sơ chưa có báo cáo khảo sát đã duyệt.';
    END IF;
    RETURN NEW;
  END IF;
  NEW.token := OLD.token;
  NEW.company_id := OLD.company_id;
  NEW.design_project_id := OLD.design_project_id;
  NEW.requested_by := OLD.requested_by;
  NEW.requested_at := OLD.requested_at;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  IF OLD.approved_at IS NOT NULL THEN
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.expires_at := OLD.expires_at;
    NEW.link_days_applied := OLD.link_days_applied;
    NEW.brief_artifact_id := OLD.brief_artifact_id;
    NEW.facade_artifact_id := OLD.facade_artifact_id;
    NEW.image_set_artifact_id := OLD.image_set_artifact_id;
  ELSIF NEW.approved_at IS NOT NULL THEN
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Đề nghị đã thu hồi, không duyệt được.';
    END IF;
    IF NOT public.design_concept_surveyed(NEW.design_project_id) THEN
      RAISE EXCEPTION 'Chưa gửi bộ ý tưởng được: cơ hội của hồ sơ chưa có báo cáo khảo sát đã duyệt.';
    END IF;
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    NEW.revoked_at := OLD.revoked_at;
    NEW.revoked_by := OLD.revoked_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_concept_shares_guard ON public.design_concept_shares;
CREATE TRIGGER design_concept_shares_guard
  BEFORE INSERT OR UPDATE ON public.design_concept_shares
  FOR EACH ROW EXECUTE FUNCTION public.design_concept_shares_guard();

ALTER TABLE public.design_concept_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_concept_share_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.design_concept_shares FROM anon, authenticated;
REVOKE ALL ON public.design_concept_share_views FROM anon, authenticated;
GRANT SELECT ON public.design_concept_shares TO authenticated;

DROP POLICY IF EXISTS design_concept_shares_select ON public.design_concept_shares;
CREATE POLICY design_concept_shares_select ON public.design_concept_shares
  FOR SELECT TO authenticated
  USING (public._concept_project_access(design_project_id, false));

-- ----------------------------------------------------------------------------
-- 3. Đề nghị / duyệt / thu hồi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_concept_share(p_project_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  p record;
  v_id uuid;
  v_name text;
  r record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  IF public.auth_is_read_only() OR NOT public._concept_project_access(p_project_id, false) THEN
    RAISE EXCEPTION 'Không có quyền đề nghị gửi bộ ý tưởng của hồ sơ này.' USING ERRCODE = '42501';
  END IF;
  SELECT dp.id, dp.code, dp.company_id INTO p FROM public.design_projects dp WHERE dp.id = p_project_id;
  IF NOT public.design_concept_surveyed(p_project_id) THEN
    RAISE EXCEPTION 'Chưa gửi bộ ý tưởng được: cơ hội của hồ sơ chưa có báo cáo khảo sát đã duyệt. Khảo sát và duyệt báo cáo trước.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.design_head h
                  WHERE h.project_id = p_project_id AND h.discipline = 'kien_truc' AND h.kind = 'design_brief') THEN
    RAISE EXCEPTION 'Chưa gửi bộ ý tưởng được: đầu bài chưa xác nhận.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.design_concept_shares s
              WHERE s.design_project_id = p_project_id AND s.approved_at IS NULL AND s.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Đã có một đề nghị đang chờ kiến trúc sư duyệt.';
  END IF;

  INSERT INTO public.design_concept_shares (company_id, design_project_id, note, requested_by)
  VALUES (p.company_id, p_project_id, NULLIF(btrim(p_note), ''), v_me)
  RETURNING id INTO v_id;

  SELECT full_name INTO v_name FROM public.users WHERE id = v_me;
  -- Báo kiến trúc sư của pháp nhân (vai trò có quyền ghi bộ môn kiến trúc), trừ chính người đề nghị.
  FOR r IN
    SELECT DISTINCT uc.user_id
      FROM public.user_companies uc
      JOIN public.role_capabilities rc ON rc.role_id = uc.role_id AND rc.capability = 'design.write.kien_truc'
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE uc.company_id = p.company_id AND uc.deleted_at IS NULL AND uc.user_id <> v_me
  LOOP
    PERFORM public.create_notification(
      r.user_id, p.company_id, 'concept_share_requested',
      COALESCE(v_name, 'Một đồng nghiệp') || ' đề nghị gửi khách bộ ý tưởng của hồ sơ ' || p.code
        || ' — xem lại rồi bấm «Duyệt gửi khách».',
      'design_concept_shares', v_id, '/tk/ai-design/' || p_project_id || '?buoc=ket-qua');
  END LOOP;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_concept_share(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_concept_share(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_concept_share(p_share_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  s record;
  v_days integer;
  v_brief varchar(71);
  v_facade varchar(71);
  v_set varchar(71);
  v_expires timestamptz;
  v_code text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO s FROM public.design_concept_shares WHERE id = p_share_id FOR UPDATE;
  IF s.id IS NULL OR NOT public._concept_project_access(s.design_project_id, false) THEN
    RAISE EXCEPTION 'Không tìm thấy đề nghị gửi khách.';
  END IF;
  -- Chỉ kiến trúc sư (ghi được bộ môn kiến trúc của hồ sơ) duyệt; Kinh doanh không tự duyệt được.
  IF public.auth_is_read_only() OR NOT public._concept_project_access(s.design_project_id, true) THEN
    RAISE EXCEPTION 'Chỉ kiến trúc sư phụ trách hồ sơ duyệt được bộ ý tưởng gửi khách.' USING ERRCODE = '42501';
  END IF;
  IF s.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Đề nghị đã thu hồi.'; END IF;
  IF s.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Đề nghị đã được duyệt.'; END IF;

  v_days := public.system_parameter_number('tk.concept_link_days', 'global', NULL)::integer;
  IF v_days IS NULL OR v_days <= 0 THEN
    RAISE EXCEPTION 'Chưa đặt hạn link xem bộ ý tưởng (tham số tk.concept_link_days) — Quản trị đặt rồi duyệt lại.';
  END IF;

  SELECT h.artifact_id INTO v_brief FROM public.design_head h
   WHERE h.project_id = s.design_project_id AND h.discipline = 'kien_truc' AND h.kind = 'design_brief';
  SELECT h.artifact_id INTO v_facade FROM public.design_head h
   WHERE h.project_id = s.design_project_id AND h.discipline = 'kien_truc' AND h.kind = 'ai_facade_concept';
  SELECT h.artifact_id INTO v_set FROM public.design_head h
   WHERE h.project_id = s.design_project_id AND h.discipline = 'kien_truc' AND h.kind = 'ai_image_set';
  IF v_brief IS NULL THEN RAISE EXCEPTION 'Chưa duyệt được: đầu bài chưa xác nhận.'; END IF;
  IF v_facade IS NULL AND v_set IS NULL AND NOT EXISTS (
       SELECT 1 FROM public.design_artifact_edge e WHERE e.from_id = v_brief AND e.step = 'ai_room_image_draw') THEN
    RAISE EXCEPTION 'Chưa duyệt được: bộ ý tưởng chưa có mặt đứng, phối cảnh hay ảnh phòng nào.';
  END IF;

  v_expires := now() + make_interval(days => v_days);
  UPDATE public.design_concept_shares
     SET approved_at = now(), approved_by = v_me, link_days_applied = v_days, expires_at = v_expires,
         brief_artifact_id = v_brief, facade_artifact_id = v_facade, image_set_artifact_id = v_set
   WHERE id = s.id;

  IF s.requested_by <> v_me THEN
    SELECT code INTO v_code FROM public.design_projects WHERE id = s.design_project_id;
    PERFORM public.create_notification(
      s.requested_by, s.company_id, 'concept_share_approved',
      'Kiến trúc sư đã duyệt gửi khách bộ ý tưởng của hồ sơ ' || v_code
        || ' — chép link hoặc gửi qua Zalo.',
      'design_concept_shares', s.id, '/tk/ai-design/' || s.design_project_id || '?buoc=ket-qua');
  END IF;
  RETURN v_expires;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_concept_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_concept_share(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_concept_share(p_share_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  s record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO s FROM public.design_concept_shares WHERE id = p_share_id FOR UPDATE;
  IF s.id IS NULL OR NOT public._concept_project_access(s.design_project_id, false) THEN
    RAISE EXCEPTION 'Không tìm thấy link gửi khách.';
  END IF;
  IF public.auth_is_read_only()
     OR NOT (s.requested_by = v_me OR public._concept_project_access(s.design_project_id, true)
             OR public.auth_manages_all_companies()) THEN
    RAISE EXCEPTION 'Chỉ người đề nghị, kiến trúc sư hoặc Ban Giám đốc thu hồi được link.' USING ERRCODE = '42501';
  END IF;
  IF s.revoked_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.design_concept_shares SET revoked_at = now(), revoked_by = v_me WHERE id = s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_concept_share(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_concept_share(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Danh sách cho khối «Gửi khách xem» (trạng thái, lượt xem, nút nào hiện)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.design_concept_shares_for(p_project_id uuid)
RETURNS TABLE (
  id               uuid,
  token            text,
  status           text,
  note             text,
  requested_by     uuid,
  requested_name   text,
  requested_at     timestamptz,
  approved_name    text,
  approved_at      timestamptz,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  view_count       integer,
  last_viewed_at   timestamptz,
  can_approve      boolean,
  can_revoke       boolean,
  can_send         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_me uuid := public.auth_user_id();
  v_write boolean;
  v_ro boolean := public.auth_is_read_only();
  v_boss boolean := public.auth_manages_all_companies();
BEGIN
  IF NOT public._concept_project_access(p_project_id, false) THEN RETURN; END IF;
  v_write := public._concept_project_access(p_project_id, true);
  RETURN QUERY
  SELECT s.id,
         -- Mã link chỉ ra ngoài khi đã duyệt: trước đó link không mở được, đưa mã ra chỉ gây nhầm.
         CASE WHEN s.approved_at IS NOT NULL THEN s.token END,
         CASE WHEN s.revoked_at IS NOT NULL THEN 'da_thu_hoi'
              WHEN s.approved_at IS NULL THEN 'cho_duyet'
              WHEN s.expires_at <= now() THEN 'het_han'
              ELSE 'da_duyet' END,
         s.note, s.requested_by, ru.full_name::text, s.requested_at, au.full_name::text, s.approved_at,
         s.expires_at, s.revoked_at,
         (SELECT count(*)::integer FROM public.design_concept_share_views v WHERE v.share_id = s.id),
         (SELECT max(v.viewed_at) FROM public.design_concept_share_views v WHERE v.share_id = s.id),
         (NOT v_ro AND v_write AND s.approved_at IS NULL AND s.revoked_at IS NULL),
         (NOT v_ro AND s.revoked_at IS NULL AND (s.approved_at IS NULL OR s.expires_at > now())
           AND (s.requested_by = v_me OR v_write OR v_boss)),
         (NOT v_ro AND s.revoked_at IS NULL AND s.approved_at IS NOT NULL AND s.expires_at > now()
           AND (s.requested_by = v_me OR v_write OR v_boss))
    FROM public.design_concept_shares s
    LEFT JOIN public.users ru ON ru.id = s.requested_by
    LEFT JOIN public.users au ON au.id = s.approved_by
   WHERE s.design_project_id = p_project_id
   ORDER BY s.requested_at DESC
   LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.design_concept_shares_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.design_concept_shares_for(uuid) TO authenticated;

-- Có được bấm «Đề nghị gửi khách» không, và nếu không thì vì sao (một câu cho màn hình).
CREATE OR REPLACE FUNCTION public.design_concept_share_readiness(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text;
BEGIN
  IF NOT public._concept_project_access(p_project_id, false) THEN
    RETURN jsonb_build_object('can_request', false, 'reason', NULL);
  END IF;
  IF public.auth_is_read_only() THEN
    v_reason := 'Vai trò chỉ xem không gửi khách được.';
  ELSIF NOT public.design_concept_surveyed(p_project_id) THEN
    v_reason := 'Cơ hội của hồ sơ chưa có báo cáo khảo sát đã duyệt — khảo sát và duyệt báo cáo trước khi gửi khách.';
  ELSIF NOT EXISTS (SELECT 1 FROM public.design_head h
                     WHERE h.project_id = p_project_id AND h.discipline = 'kien_truc' AND h.kind = 'design_brief') THEN
    v_reason := 'Đầu bài chưa xác nhận.';
  ELSIF EXISTS (SELECT 1 FROM public.design_concept_shares s
                 WHERE s.design_project_id = p_project_id AND s.approved_at IS NULL AND s.revoked_at IS NULL) THEN
    v_reason := 'Đã có một đề nghị đang chờ kiến trúc sư duyệt.';
  END IF;
  RETURN jsonb_build_object('can_request', v_reason IS NULL, 'reason', v_reason,
                            'is_architect', public._concept_project_access(p_project_id, true));
END;
$$;

REVOKE ALL ON FUNCTION public.design_concept_share_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.design_concept_share_readiness(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Trang công khai — chỉ Worker (khoá service) gọi
-- ----------------------------------------------------------------------------
-- `p_count_view = false` cho lượt tải ẢNH của cùng trang (một lần mở trang = một lượt xem).
-- Mã hồ sơ thiết kế chỉ để Worker đọc artifact — Worker không trả nó ra ngoài.
CREATE OR REPLACE FUNCTION public.design_concept_public(p_token text, p_count_view boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  SELECT sh.*, u.full_name AS sender_name, u.phone AS sender_phone, c.short_name AS company_name
    INTO s
    FROM public.design_concept_shares sh
    JOIN public.design_projects p ON p.id = sh.design_project_id AND p.deleted_at IS NULL
    LEFT JOIN public.users u ON u.id = sh.requested_by
    LEFT JOIN public.companies c ON c.id = sh.company_id
   WHERE sh.token = p_token;
  -- Chưa duyệt = link chưa tồn tại với khách.
  IF s.id IS NULL OR s.approved_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF s.revoked_at IS NOT NULL OR s.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired', 'sender_name', s.sender_name,
                              'sender_phone', s.sender_phone, 'company_name', s.company_name);
  END IF;
  IF p_count_view THEN
    INSERT INTO public.design_concept_share_views (share_id) VALUES (s.id);
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'project_id', s.design_project_id,
    'approved_at', s.approved_at,
    'expires_at', s.expires_at,
    'brief_artifact_id', s.brief_artifact_id,
    'facade_artifact_id', s.facade_artifact_id,
    'image_set_artifact_id', s.image_set_artifact_id,
    'note', s.note,
    'sender_name', s.sender_name,
    'sender_phone', s.sender_phone,
    'company_name', s.company_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.design_concept_public(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.design_concept_public(text, boolean) TO service_role;
COMMENT ON FUNCTION public.design_concept_public(text, boolean) IS
  'Trang khách xem bộ ý tưởng (Worker gọi bằng khoá service, 0259): link đã duyệt, còn hạn, chưa thu hồi thì trả bộ đã chụp lúc duyệt và ghi một lượt xem.';

-- ----------------------------------------------------------------------------
-- 6. «Gửi qua Zalo» (0238) cho link bộ ý tưởng — chép bản 0252, thêm nhánh design_concept_shares
-- ----------------------------------------------------------------------------
ALTER TABLE public.outbound_shares DROP CONSTRAINT IF EXISTS outbound_shares_entity_type_check;
ALTER TABLE public.outbound_shares ADD CONSTRAINT outbound_shares_entity_type_check CHECK (entity_type IN
  ('quotes', 'contracts', 'contract_signed_scan', 'showcase_shares', 'rental_quotes', 'design_concept_shares'));

CREATE OR REPLACE FUNCTION public.rls_outbound_share_readable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
       WHERE q.id = p_id AND q.deleted_at IS NULL AND public.rls_company_access(q.company_id))
    WHEN 'contracts' THEN public.rls_contract_readable(p_id)
    WHEN 'contract_signed_scan' THEN public.rls_contract_readable(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id
         AND (s.created_by = public.auth_user_id()
              OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KSNB')))
    WHEN 'rental_quotes' THEN EXISTS (
      SELECT 1 FROM public.rental_quotes rq
       WHERE rq.id = p_id AND rq.deleted_at IS NULL AND public.rls_rental_readable(rq.company_id))
    WHEN 'design_concept_shares' THEN EXISTS (
      SELECT 1 FROM public.design_concept_shares s
       WHERE s.id = p_id AND public._concept_project_access(s.design_project_id, false))
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.rls_outbound_share_writable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
        JOIN public.opportunities o ON o.id = q.opportunity_id
       WHERE q.id = p_id AND q.deleted_at IS NULL AND o.deleted_at IS NULL
         AND q.status = 'completed'
         AND public.rls_company_access(q.company_id)
         AND public.rls_owner_can_write(o.company_id, o.owner_id))
    WHEN 'contracts' THEN EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = p_id AND c.deleted_at IS NULL
         AND c.stage::text IN ('da_duyet', 'da_ky', 'hoan_thanh')
         AND c.approved_document_id IS NOT NULL
         AND public.rls_company_access(c.company_id)
         AND (public.auth_can_approve_module('HD')
              OR (public.auth_can_edit_module('HD')
                  AND public.rls_owner_can_write(c.company_id, c.responsible_user_id))))
    WHEN 'contract_signed_scan' THEN public.rls_contract_scan_sharer(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id AND s.revoked_at IS NULL AND s.expires_at > now()
         AND (s.created_by = public.auth_user_id() OR public.auth_manages_all_companies()))
    -- Báo giá thuê (0252): đã duyệt; người sửa được phân hệ SX của pháp nhân (nhóm lập và gửi báo giá thuê).
    WHEN 'rental_quotes' THEN EXISTS (
      SELECT 1 FROM public.rental_quotes rq
       WHERE rq.id = p_id AND rq.deleted_at IS NULL AND rq.status = 'da_duyet'
         AND public.rls_company_access(rq.company_id) AND public.auth_can_edit_module('SX'))
    -- Bộ ý tưởng (0259): link đã duyệt, còn hạn; người đề nghị, kiến trúc sư hoặc lãnh đạo.
    WHEN 'design_concept_shares' THEN EXISTS (
      SELECT 1 FROM public.design_concept_shares s
       WHERE s.id = p_id AND s.approved_at IS NOT NULL AND s.revoked_at IS NULL AND s.expires_at > now()
         AND public._concept_project_access(s.design_project_id, false)
         AND (s.requested_by = public.auth_user_id()
              OR public._concept_project_access(s.design_project_id, true)
              OR public.auth_manages_all_companies()))
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.outbound_shares_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF public.auth_user_id() IS NOT NULL THEN
    NEW.created_by := public.auth_user_id();
    NEW.created_at := now();
  END IF;

  IF NEW.entity_type = 'quotes' THEN
    SELECT q.company_id INTO v_company FROM public.quotes q WHERE q.id = NEW.entity_id;
    NEW.share_link_id := NULL;
  ELSIF NEW.entity_type IN ('contracts', 'contract_signed_scan') THEN
    SELECT c.company_id INTO v_company FROM public.contracts c WHERE c.id = NEW.entity_id;
    IF NEW.entity_type = 'contracts' THEN
      NEW.share_link_id := NULL;
    ELSIF NEW.share_link_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contract_scan_shares sh
       WHERE sh.id = NEW.share_link_id AND sh.contract_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'Link không thuộc hợp đồng này.';
    END IF;
  ELSIF NEW.entity_type = 'rental_quotes' THEN
    SELECT rq.company_id INTO v_company FROM public.rental_quotes rq WHERE rq.id = NEW.entity_id;
    NEW.share_link_id := NULL;
  ELSIF NEW.entity_type = 'showcase_shares' THEN
    SELECT COALESCE(s.company_id,
                    (SELECT i.company_id FROM public.showcase_items i WHERE i.id = s.item_ids[1]))
      INTO v_company
      FROM public.showcase_shares s WHERE s.id = NEW.entity_id;
    NEW.share_link_id := NEW.entity_id;
  ELSIF NEW.entity_type = 'design_concept_shares' THEN
    SELECT s.company_id INTO v_company FROM public.design_concept_shares s WHERE s.id = NEW.entity_id;
    NEW.share_link_id := NEW.entity_id;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ được gửi.';
  END IF;
  NEW.company_id := v_company;
  NEW.recipient := NULLIF(btrim(NEW.recipient), '');
  RETURN NEW;
END;
$$;
