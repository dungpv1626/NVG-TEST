-- ============================================================================
-- Luồng phòng Thiết kế ↔ công trường (rà luồng 08/10/2026, Haan: «làm hết theo thứ tự»).
--
-- Bốn chỗ hở PRD nêu mà mã chưa có:
--   1. TK-05: phát hành bản vẽ chỉ báo TKE / DA_DT / KD / TC — chỉ huy trưởng, kỹ thuật hiện trường
--      (vai trò CHT, thêm sau 0025) không nhận. PRD: «thông báo phải đến được người dùng hiện trường».
--   2. TK-08: đã bàn giao thì hồ sơ đóng băng, nên KHÔNG có đường phát hành bản vẽ điều chỉnh cho
--      thay đổi tại công trường. Mở một đường hẹp: bản điều chỉnh gắn với một yêu cầu thay đổi đã
--      «Chấp thuận» của chính hồ sơ (TK-06) — không mở lại cả hồ sơ.
--   3. TK-05 ↔ TC-03: công trường không thấy bản vẽ thiết kế đã phát hành. Hàm đọc
--      `site_design_drawings` cho người xem được công trình (Mẫu E), kể cả khi không xem được TK.
--   4. TK-08 / TC-15: yêu cầu làm rõ (RFI) là luồng chính thức có người nhận, thời hạn, cảnh báo
--      quá hạn — bảng `rfis`, nối vào màn hình Theo dõi đề nghị và nút «Thúc» của TC-10.
--
-- Quyết định đội triển khai tự đặt (ghi ở QUYET_DINH / TIEN_DO để Haan duyệt lại):
--   · Người nhận phía công trường = người được phân công công trình gắn hồ sơ (Mẫu E), không phải
--     mọi CHT của pháp nhân.
--   · RFI: hạn trả lời do người gửi chọn (bắt buộc) — SLA cho RFI chưa có, không tự dựng con số.
--   · RFI tuyến «Thiết kế» → người chịu trách nhiệm hồ sơ thiết kế (không có thì vai trò TKE của
--     pháp nhân); «Dự án» → vai trò DA_DT; «Chủ đầu tư» → người ngoài hệ thống, công trường chuyển
--     câu hỏi và ghi lại câu trả lời.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Người ở công trường gắn với một hồ sơ thiết kế (Mẫu E)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.design_site_people(p_design_project_id uuid)
RETURNS TABLE (user_id uuid, construction_site_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT x.user_id, x.site_id
  FROM (
    SELECT a.user_id, s.id AS site_id
      FROM public.construction_sites s
      JOIN public.user_site_assignments a ON a.construction_site_id = s.id
     WHERE s.design_project_id = p_design_project_id
       AND s.deleted_at IS NULL
       AND a.deleted_at IS NULL
       AND a.assigned_from <= current_date
       AND (a.assigned_to IS NULL OR a.assigned_to >= current_date)
    UNION
    SELECT s.responsible_user_id, s.id
      FROM public.construction_sites s
     WHERE s.design_project_id = p_design_project_id
       AND s.deleted_at IS NULL
       AND s.responsible_user_id IS NOT NULL
  ) x
  JOIN public.users u ON u.id = x.user_id AND u.is_active AND u.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.design_site_people(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.design_site_people(uuid) IS
  'Người được phân công (hoặc chịu trách nhiệm) ở công trình gắn hồ sơ thiết kế — người nhận phía hiện trường. Chỉ hàm hệ thống gọi.';


-- ----------------------------------------------------------------------------
-- 1. Bản vẽ điều chỉnh sau bàn giao — chỉ qua yêu cầu thay đổi đã chấp thuận
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_design_revision_writable(
  p_project_id uuid,
  p_change_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_change_request_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.design_projects p
      JOIN public.change_requests cr
        ON cr.id = p_change_request_id
       AND cr.design_project_id = p.id
       AND cr.deleted_at IS NULL
       AND cr.status = 'chap_thuan'
     WHERE p.id = p_project_id
       AND p.deleted_at IS NULL
       AND p.handed_over_at IS NOT NULL
       AND public.rls_company_access(p.company_id)
       AND public.auth_can_edit_module('TK')
  );
$$;

COMMENT ON FUNCTION public.rls_design_revision_writable(uuid, uuid) IS
  'TK-08: hồ sơ ĐÃ bàn giao vẫn ra được bản vẽ điều chỉnh, nhưng chỉ gắn với một yêu cầu thay đổi đã chấp thuận của chính hồ sơ (TK-06).';

DROP POLICY design_versions_insert ON public.design_versions;
CREATE POLICY design_versions_insert ON public.design_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (
      public.rls_design_project_writable(design_project_id)
      OR (
        discipline IN ('kien_truc', 'ket_cau', 'dien_nuoc')
        AND public.rls_design_revision_writable(design_project_id, change_request_id)
      )
    )
  );

DROP POLICY design_versions_update ON public.design_versions;
CREATE POLICY design_versions_update ON public.design_versions
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND published_at IS NULL
    AND (
      public.rls_design_project_writable(design_project_id)
      OR public.rls_design_revision_writable(design_project_id, change_request_id)
    )
  )
  WITH CHECK (public.rls_company_access(company_id));


CREATE OR REPLACE FUNCTION public.publish_design_version(p_version_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v          record;
  p          record;
  v_revision boolean;
  v_office   integer;
  v_site     integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v FROM public.design_versions
   WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bản này.';
  END IF;

  -- Bản điều chỉnh sau bàn giao: hồ sơ đã khoá, chỉ mở cho đúng yêu cầu thay đổi đã chấp thuận.
  v_revision := NOT public.rls_design_project_writable(v.design_project_id)
                AND v.discipline IN ('kien_truc', 'ket_cau', 'dien_nuoc')
                AND public.rls_design_revision_writable(v.design_project_id, v.change_request_id);

  IF NOT public.rls_design_project_writable(v.design_project_id) AND NOT v_revision THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này. Hồ sơ đã bàn giao thì chỉ phát hành được bản điều chỉnh gắn với một yêu cầu thay đổi đã chấp thuận.';
  END IF;

  IF v.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phiên bản này đã phát hành.';
  END IF;

  IF v.document_version_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đính kèm tệp bản vẽ. Tải tệp lên trước khi phát hành.';
  END IF;

  SELECT * INTO p FROM public.design_projects WHERE id = v.design_project_id;

  -- Hạ bản cũ TRƯỚC khi nâng bản mới: unique index chỉ cho một bản đã phát hành đang hiệu
  -- lực trên mỗi bộ môn, làm ngược thứ tự sẽ vi phạm ràng buộc ngay giữa giao dịch.
  UPDATE public.design_versions
     SET is_current_version = false, updated_at = now(), updated_by = v_user
   WHERE design_project_id = v.design_project_id
     AND discipline = v.discipline
     AND is_current_version
     AND published_at IS NOT NULL
     AND deleted_at IS NULL;

  UPDATE public.design_versions
     SET is_current_version = true,
         published_at = now(),
         published_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_version_id;

  -- Bản điều chỉnh đã ra = yêu cầu thay đổi đã thực hiện (TK-06 khép vòng).
  IF v_revision THEN
    UPDATE public.change_requests
       SET status = 'da_thuc_hien', updated_at = now(), updated_by = v_user
     WHERE id = v.change_request_id;
  END IF;

  -- Văn phòng: đúng những bộ phận PRD TK-05 liệt kê, trong pháp nhân của dự án.
  SELECT count(*) INTO v_office
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_version_published',
      format('Hồ sơ %s của dự án thiết kế %s đã phát hành phiên bản %s%s.',
             public.design_discipline_label(v.discipline), p.code, v.version,
             CASE WHEN v_revision THEN ' (bản điều chỉnh sau bàn giao)' ELSE '' END),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TKE', 'DA_DT', 'KD', 'TC') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  -- Hiện trường (0154): người được phân công công trình gắn hồ sơ — liên kết về trang công trình,
  -- vì chỉ huy trưởng không xem được Module TK. Người đã nhận ở nhóm văn phòng thì không nhận lại.
  SELECT count(*) INTO v_site
  FROM (
    SELECT public.create_notification(
      sp.user_id, p.company_id, 'design_version_published',
      format('Bản vẽ %s phiên bản %s đã phát hành — bản trước hết hiệu lực. Kiểm tra trước khi giao việc.',
             public.design_discipline_label(v.discipline), v.version),
      'construction_sites', sp.construction_site_id,
      format('/tc/cong-trinh/%s?tab=ho-so', sp.construction_site_id)
    ) AS notification_id
    FROM public.design_site_people(v.design_project_id) sp
    WHERE sp.user_id IS DISTINCT FROM p.responsible_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.user_companies uc
        JOIN public.roles r ON r.id = uc.role_id
        WHERE uc.user_id = sp.user_id AND uc.deleted_at IS NULL
          AND uc.company_id = p.company_id
          AND r.code IN ('TKE', 'DA_DT', 'KD', 'TC')
      )
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_office + v_site;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Bản vẽ thiết kế đã phát hành, nhìn từ công trường (TK-05 ↔ TC-03)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.site_design_drawings(p_site_id uuid)
RETURNS TABLE (
  version_id       uuid,
  discipline       text,
  discipline_label text,
  version          integer,
  title            text,
  file_name        text,
  published_at     timestamptz,
  is_current       boolean,
  change_reason    text,
  design_project_id uuid,
  design_code      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id,
         v.discipline::text,
         public.design_discipline_label(v.discipline),
         v.version,
         v.title,
         dv.file_name,
         v.published_at,
         v.is_current_version,
         v.change_reason,
         p.id,
         p.code::text
    FROM public.construction_sites s
    JOIN public.design_projects p ON p.id = s.design_project_id AND p.deleted_at IS NULL
    JOIN public.design_versions v ON v.design_project_id = p.id
    LEFT JOIN public.document_versions dv ON dv.id = v.document_version_id
   WHERE s.id = p_site_id
     AND public.rls_site_readable(p_site_id)
     AND v.deleted_at IS NULL
     AND v.published_at IS NOT NULL
     -- Phương án là chuyện với khách, không phải bản thi công.
     AND v.discipline IN ('kien_truc', 'ket_cau', 'dien_nuoc')
   ORDER BY v.discipline, v.is_current_version DESC, v.version DESC;
$$;

REVOKE ALL ON FUNCTION public.site_design_drawings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_design_drawings(uuid) TO authenticated;

COMMENT ON FUNCTION public.site_design_drawings(uuid) IS
  'TK-05 ↔ TC-03: bản vẽ thi công đã phát hành của hồ sơ thiết kế gắn công trình — bản đang hiệu lực và bản đã hết hiệu lực. Mẫu E qua rls_site_readable.';


-- ----------------------------------------------------------------------------
-- 3. Yêu cầu làm rõ (RFI) — TK-08 / TC-15
-- ----------------------------------------------------------------------------

CREATE TABLE public.rfis (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE RESTRICT,
  -- Hồ sơ thiết kế của công trình lúc gửi (chụp lại — tuyến Thiết kế đọc theo cột này).
  design_project_id     uuid REFERENCES public.design_projects(id) ON DELETE SET NULL,
  -- Bản vẽ đang hỏi (tuỳ chọn).
  design_version_id     uuid REFERENCES public.design_versions(id) ON DELETE SET NULL,
  code                  varchar(32) NOT NULL UNIQUE,
  title                 text NOT NULL CHECK (btrim(title) <> ''),
  question              text NOT NULL CHECK (btrim(question) <> ''),
  location              text,
  measurements          text,
  photo_urls            text[],
  route                 varchar(16) NOT NULL CHECK (route IN ('thiet_ke', 'du_an', 'chu_dau_tu')),
  due_date              date NOT NULL,
  status                varchar(16) NOT NULL DEFAULT 'cho_tra_loi'
                        CHECK (status IN ('cho_tra_loi', 'da_tra_loi')),
  answer                text,
  answered_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  answered_at           timestamptz,
  -- Tuyến «Chủ đầu tư»: ai bên chủ đầu tư trả lời (người ngoài hệ thống).
  answerer_name         varchar(255),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at            timestamptz,
  CONSTRAINT rfis_answer_when_answered CHECK (
    (status = 'da_tra_loi') = (answer IS NOT NULL AND answered_at IS NOT NULL)
  )
);

CREATE INDEX rfis_site_idx ON public.rfis (construction_site_id, status);
CREATE INDEX rfis_design_idx ON public.rfis (design_project_id) WHERE design_project_id IS NOT NULL;

COMMENT ON TABLE public.rfis IS
  'Yêu cầu làm rõ bản vẽ / kỹ thuật từ công trường (TK-08, TC-15): người nhận theo tuyến, hạn trả lời, câu trả lời lưu gắn bản vẽ.';

-- Mã: {PN}-RFI-{NĂM}-{4 số}, CSDL cấp lúc ghi (doc/BO_MA.md).
CREATE OR REPLACE FUNCTION public.rfis_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s  record;
  p  text;
BEGIN
  SELECT cs.*, c.code AS company_code INTO s
    FROM public.construction_sites cs
    JOIN public.companies c ON c.id = cs.company_id
   WHERE cs.id = NEW.construction_site_id;
  NEW.company_id := s.company_id;
  NEW.design_project_id := s.design_project_id;
  IF public.auth_user_id() IS NOT NULL OR NEW.code IS NULL THEN
    NEW.code := public.issue_record_code(s.company_code, 'RFI');
  END IF;
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  NEW.updated_by := NEW.created_by;
  NEW.status := 'cho_tra_loi';
  NEW.answer := NULL;
  NEW.answered_by := NULL;
  NEW.answered_at := NULL;
  NEW.answerer_name := NULL;

  IF NEW.route = 'thiet_ke' AND NEW.design_project_id IS NULL THEN
    RAISE EXCEPTION 'Công trình này không gắn hồ sơ thiết kế nào trên hệ thống. Chọn gửi Dự án hoặc Chủ đầu tư.';
  END IF;

  IF NEW.design_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.design_versions v
     WHERE v.id = NEW.design_version_id AND v.design_project_id = NEW.design_project_id
  ) THEN
    RAISE EXCEPTION 'Bản vẽ được chọn không thuộc hồ sơ thiết kế của công trình này.';
  END IF;

  IF NEW.photo_urls IS NOT NULL THEN
    FOREACH p IN ARRAY NEW.photo_urls LOOP
      IF p IS NULL OR left(p, length(NEW.construction_site_id::text) + 1) <> NEW.construction_site_id::text || '/' THEN
        RAISE EXCEPTION 'Ảnh đính kèm không thuộc công trình này. Tải lại ảnh từ đúng công trình.';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rfis_before_insert
  BEFORE INSERT ON public.rfis
  FOR EACH ROW EXECUTE FUNCTION public.rfis_before_insert();


-- Ai được ĐỌC một RFI: người xem được công trình (Mẫu A + E), hoặc bên được hỏi (Mẫu A theo tuyến).
CREATE OR REPLACE FUNCTION public.rls_rfi_readable(
  p_company_id uuid,
  p_site_id uuid,
  p_route text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_site_readable(p_site_id)
      OR (public.rls_company_access(p_company_id) AND (
            (p_route = 'thiet_ke' AND public.auth_can_view_module('TK'))
         OR (p_route = 'du_an' AND public.auth_can_view_module('DA'))
      ));
$$;

-- Ai được TRẢ LỜI: bên được hỏi; tuyến Chủ đầu tư thì công trường ghi lại lời chủ đầu tư.
CREATE OR REPLACE FUNCTION public.rls_rfi_answerable(
  p_company_id uuid,
  p_site_id uuid,
  p_route text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_route
    WHEN 'thiet_ke' THEN public.rls_company_access(p_company_id) AND public.auth_can_edit_module('TK')
    WHEN 'du_an' THEN public.rls_company_access(p_company_id) AND public.auth_can_edit_module('DA')
    WHEN 'chu_dau_tu' THEN public.rls_site_writable(p_site_id)
    ELSE false
  END;
$$;

ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfis FROM anon;
REVOKE UPDATE, DELETE ON public.rfis FROM authenticated;

CREATE POLICY rfis_select ON public.rfis
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_rfi_readable(company_id, construction_site_id, route)
  );

-- Gửi: người ghi được công trình (Mẫu E). Câu trả lời KHÔNG ghi thẳng — chỉ qua answer_rfi.
CREATE POLICY rfis_insert ON public.rfis
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id));


-- Người đang giữ một RFI (bên phải trả lời) — dùng cho thông báo, theo dõi và «Thúc».
CREATE OR REPLACE FUNCTION public.rfi_holders(p_rfi_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (SELECT * FROM public.rfis WHERE id = p_rfi_id),
  responsible AS (
    SELECT p.responsible_user_id AS id
      FROM r JOIN public.design_projects p ON p.id = r.design_project_id
      JOIN public.users u ON u.id = p.responsible_user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE r.route = 'thiet_ke'
  ),
  by_role AS (
    SELECT DISTINCT u.id
      FROM r
      JOIN public.user_companies uc ON uc.company_id = r.company_id AND uc.deleted_at IS NULL
      JOIN public.roles ro ON ro.id = uc.role_id
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE (r.route = 'thiet_ke' AND ro.code = 'TKE' AND NOT EXISTS (SELECT 1 FROM responsible))
        OR (r.route = 'du_an' AND ro.code = 'DA_DT')
  )
  SELECT COALESCE(array_agg(id), '{}') FROM (
    SELECT id FROM responsible UNION SELECT id FROM by_role
  ) h;
$$;

REVOKE ALL ON FUNCTION public.rfi_holders(uuid) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.rfi_url(p_rfi_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT '/lam-ro/' || p_rfi_id::text; $$;


-- Gửi xong: báo bên phải trả lời.
CREATE OR REPLACE FUNCTION public.rfis_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u uuid;
  s record;
BEGIN
  SELECT code, name INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;
  FOREACH u IN ARRAY public.rfi_holders(NEW.id) LOOP
    PERFORM public.create_notification(
      u, NEW.company_id, 'rfi_created',
      format('Công trường %s hỏi «%s» (%s) — cần trả lời trước %s.',
             s.code, NEW.title, NEW.code, to_char(NEW.due_date, 'DD/MM/YYYY')),
      'rfis', NEW.id, public.rfi_url(NEW.id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rfis_after_insert
  AFTER INSERT ON public.rfis
  FOR EACH ROW EXECUTE FUNCTION public.rfis_after_insert();


CREATE OR REPLACE FUNCTION public.answer_rfi(
  p_rfi_id uuid,
  p_answer text,
  p_answerer_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  r    record;
  u    uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO r FROM public.rfis WHERE id = p_rfi_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_rfi_readable(r.company_id, r.construction_site_id, r.route) THEN
    RAISE EXCEPTION 'Không tìm thấy yêu cầu làm rõ này.';
  END IF;
  IF NOT public.rls_rfi_answerable(r.company_id, r.construction_site_id, r.route) THEN
    RAISE EXCEPTION 'Tài khoản này không trả lời được yêu cầu gửi tới %.',
      CASE r.route WHEN 'thiet_ke' THEN 'Phòng Thiết kế' WHEN 'du_an' THEN 'Phòng Dự án – Đấu thầu'
                   ELSE 'chủ đầu tư (do người được phân công công trình ghi lại)' END;
  END IF;
  IF r.status = 'da_tra_loi' THEN
    RAISE EXCEPTION 'Yêu cầu này đã được trả lời.';
  END IF;
  IF p_answer IS NULL OR btrim(p_answer) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi nội dung trả lời.';
  END IF;
  IF r.route = 'chu_dau_tu' AND (p_answerer_name IS NULL OR btrim(p_answerer_name) = '') THEN
    RAISE EXCEPTION 'Vui lòng ghi tên người trả lời phía chủ đầu tư.';
  END IF;

  UPDATE public.rfis
     SET status = 'da_tra_loi',
         answer = btrim(p_answer),
         answered_by = v_me,
         answered_at = now(),
         answerer_name = NULLIF(btrim(COALESCE(p_answerer_name, '')), ''),
         updated_at = now(), updated_by = v_me
   WHERE id = p_rfi_id;

  -- Báo người gửi và người ở công trường.
  FOR u IN
    SELECT r.created_by WHERE r.created_by IS NOT NULL
    UNION
    SELECT a.user_id FROM public.user_site_assignments a
     WHERE a.construction_site_id = r.construction_site_id AND a.deleted_at IS NULL
       AND a.assigned_from <= current_date
       AND (a.assigned_to IS NULL OR a.assigned_to >= current_date)
    UNION
    SELECT s.responsible_user_id FROM public.construction_sites s
     WHERE s.id = r.construction_site_id AND s.responsible_user_id IS NOT NULL
  LOOP
    PERFORM public.create_notification(
      u, r.company_id, 'rfi_answered',
      format('Đã có trả lời cho yêu cầu làm rõ %s «%s».', r.code, r.title),
      'rfis', r.id, public.rfi_url(r.id)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.answer_rfi(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_rfi(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.answer_rfi(uuid, text, text) IS
  'TK-08 / TC-15: bên được hỏi trả lời yêu cầu làm rõ — cửa duy nhất ghi câu trả lời; báo người gửi và người ở công trường.';


-- Ảnh của RFI nằm trong bucket ảnh công trường. Bên được hỏi (Thiết kế, Dự án) thường KHÔNG xem
-- được Module TC, nên mở thêm đúng những ảnh mà một RFI họ đọc được đang đính kèm.
CREATE POLICY construction_photos_rfi_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'construction-photos'
    AND EXISTS (
      SELECT 1 FROM public.rfis r
       WHERE r.deleted_at IS NULL
         AND storage.objects.name = ANY (r.photo_urls)
         AND public.rls_rfi_readable(r.company_id, r.construction_site_id, r.route)
    )
  );


-- ----------------------------------------------------------------------------
-- 4. Theo dõi đề nghị (TC-10): thêm RFI
-- ----------------------------------------------------------------------------
--
-- Thân hàm cũ (đề nghị mua, bản 0138) giữ NGUYÊN dưới tên mới; `site_request_tracker` thành phép
-- gộp hai nguồn. RFI lấy điều kiện đọc của chính bảng `rfis`, không qua quyền MH.

ALTER FUNCTION public.site_request_tracker(uuid, boolean) RENAME TO site_purchase_request_tracker;
REVOKE ALL ON FUNCTION public.site_purchase_request_tracker(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.site_rfi_tracker(
  p_site_id uuid DEFAULT NULL,
  p_mine_only boolean DEFAULT false
)
RETURNS TABLE (
  entity_type text, entity_id uuid, code text, title text, site_id uuid, site_code text,
  site_name text, company_id uuid, requested_by uuid, requested_by_name text, needed_date date,
  urgency text, stage text, is_closed boolean, holder_kind text, holder_label text,
  holder_ids uuid[], holder_names text[], waiting_since timestamptz, due_at timestamptz,
  promised_date date, last_nudged_at timestamptz, nudge_count integer, next_nudge_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH interval_param AS (
    SELECT NULLIF(public.system_parameter_number('request_nudge_min_interval_hours'), 0) AS hours
  ),
  base AS (
    SELECT r.*, s.code AS s_code, s.name AS s_name, public.rfi_holders(r.id) AS h_ids
      FROM public.rfis r
      JOIN public.construction_sites s ON s.id = r.construction_site_id
     WHERE r.deleted_at IS NULL
       AND (p_site_id IS NULL OR r.construction_site_id = p_site_id)
       AND (NOT p_mine_only OR r.created_by = public.auth_user_id())
       AND public.rls_rfi_readable(r.company_id, r.construction_site_id, r.route)
  ),
  nudges AS (
    SELECT rr.entity_id, max(rr.nudged_at) AS last_at, count(*)::int AS n
      FROM public.request_reminders rr
     WHERE rr.entity_type = 'rfis' AND rr.entity_id IN (SELECT id FROM base)
     GROUP BY rr.entity_id
  )
  SELECT
    'rfis'::text,
    b.id,
    b.code::text,
    b.title,
    b.construction_site_id,
    b.s_code::text,
    b.s_name,
    b.company_id,
    b.created_by,
    (SELECT full_name FROM public.users WHERE id = b.created_by),
    b.due_date,
    'binh_thuong'::text,
    b.status::text,
    b.status = 'da_tra_loi',
    CASE WHEN b.status = 'da_tra_loi' THEN NULL
         WHEN b.route = 'chu_dau_tu' THEN 'external' ELSE 'answerer' END,
    CASE b.route
      WHEN 'thiet_ke' THEN 'Phòng Thiết kế'
      WHEN 'du_an' THEN 'Phòng Dự án – Đấu thầu'
      ELSE 'Chủ đầu tư — công trường chuyển câu hỏi và ghi câu trả lời'
    END,
    b.h_ids,
    COALESCE((SELECT array_agg(u.full_name ORDER BY u.full_name) FROM public.users u WHERE u.id = ANY (b.h_ids)), '{}'),
    b.created_at,
    -- Hết ngày hạn theo giờ Việt Nam.
    ((b.due_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'),
    NULL::date,
    n.last_at,
    COALESCE(n.n, 0),
    CASE WHEN n.last_at IS NOT NULL AND (SELECT hours FROM interval_param) IS NOT NULL
         THEN n.last_at + make_interval(hours => (SELECT hours FROM interval_param)::int)
    END,
    b.created_at
  FROM base b
  LEFT JOIN nudges n ON n.entity_id = b.id;
$$;

REVOKE ALL ON FUNCTION public.site_rfi_tracker(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.site_request_tracker(
  p_site_id uuid DEFAULT NULL,
  p_mine_only boolean DEFAULT false
)
RETURNS TABLE (
  entity_type text, entity_id uuid, code text, title text, site_id uuid, site_code text,
  site_name text, company_id uuid, requested_by uuid, requested_by_name text, needed_date date,
  urgency text, stage text, is_closed boolean, holder_kind text, holder_label text,
  holder_ids uuid[], holder_names text[], waiting_since timestamptz, due_at timestamptz,
  promised_date date, last_nudged_at timestamptz, nudge_count integer, next_nudge_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT * FROM public.site_purchase_request_tracker(p_site_id, p_mine_only)
    UNION ALL
    SELECT * FROM public.site_rfi_tracker(p_site_id, p_mine_only)
  ) t
  ORDER BY t.is_closed, t.needed_date NULLS LAST, t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.site_request_tracker(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_tracker(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.site_request_tracker(uuid, boolean) IS
  'TC-10: đề nghị mua (site_purchase_request_tracker) và yêu cầu làm rõ (site_rfi_tracker) gắn công trình — bước, người giữ, chờ bao lâu, hạn, lịch sử thúc.';


-- «Thúc» cho RFI: cùng bảng lịch sử, cùng giãn cách. Nhánh đề nghị mua giữ nguyên.
CREATE OR REPLACE FUNCTION public.nudge_request(
  p_entity_type text,
  p_entity_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := public.auth_user_id();
  t      record;
  v_id   uuid;
  v_url  text;
  v_msg  text;
  v_hours integer;
  u      uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF p_entity_type IS DISTINCT FROM 'purchase_requests' AND p_entity_type IS DISTINCT FROM 'rfis' THEN
    RAISE EXCEPTION 'Chưa thúc được loại đề nghị này.';
  END IF;

  -- Cùng một điều kiện hiển thị với màn hình theo dõi: không thấy thì không thúc được.
  SELECT * INTO t FROM public.site_request_tracker() tr
   WHERE tr.entity_type = p_entity_type AND tr.entity_id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề nghị, hoặc tài khoản không được xem đề nghị này.';
  END IF;

  IF NOT (t.requested_by = v_me OR public.rls_site_writable(t.site_id)) THEN
    RAISE EXCEPTION 'Chỉ người gửi đề nghị hoặc người được phân công công trình này mới thúc được.';
  END IF;

  IF t.holder_kind IS NULL OR t.holder_kind NOT IN ('approver', 'purchasing', 'answerer') THEN
    RAISE EXCEPTION 'Đề nghị này không có ai ở văn phòng đang giữ — không có ai để thúc.';
  END IF;

  IF t.next_nudge_at IS NOT NULL AND t.next_nudge_at > now() THEN
    RAISE EXCEPTION 'Đã thúc lúc %; thúc lại được sau %.',
      to_char(t.last_nudged_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      to_char(t.next_nudge_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');
  END IF;

  IF cardinality(t.holder_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa có ai được giao xử lý bước này. Báo Quản trị hệ thống để phân công người phụ trách.';
  END IF;

  v_hours := CASE WHEN t.waiting_since IS NOT NULL
                  THEN floor(extract(epoch FROM (now() - t.waiting_since)) / 3600)::int END;

  INSERT INTO public.request_reminders (
    company_id, construction_site_id, entity_type, entity_id,
    stage_at_nudge, holder_kind, notified_user_ids, waited_hours, note,
    nudged_by, created_by, updated_by
  ) VALUES (
    t.company_id, t.site_id, p_entity_type, p_entity_id,
    t.stage, t.holder_kind, t.holder_ids, v_hours, NULLIF(btrim(p_note), ''),
    v_me, v_me, v_me
  )
  RETURNING id INTO v_id;

  v_url := CASE
    WHEN p_entity_type = 'rfis' THEN public.rfi_url(p_entity_id)
    WHEN t.holder_kind = 'approver' THEN '/viec-can-lam'
    ELSE '/mh/de-nghi-mua/' || p_entity_id::text
  END;
  v_msg := format('Công trường %s thúc %s %s «%s»%s.',
                  t.site_code,
                  CASE WHEN p_entity_type = 'rfis' THEN 'yêu cầu làm rõ' ELSE 'đề nghị' END,
                  t.code, t.title,
                  CASE WHEN v_hours IS NOT NULL THEN format(' — đã chờ %s giờ', v_hours) ELSE '' END);

  FOREACH u IN ARRAY t.holder_ids LOOP
    PERFORM public.create_notification(
      u, t.company_id, 'request_nudge', v_msg, p_entity_type, p_entity_id, v_url
    );
  END LOOP;

  RETURN v_id;
END;
$$;

-- Lịch sử «Thúc» của RFI đọc theo đúng điều kiện đọc RFI (bảng cũ chỉ mở cho vai trò xem MH).
CREATE POLICY request_reminders_select_rfi ON public.request_reminders
  FOR SELECT TO authenticated
  USING (
    entity_type = 'rfis'
    AND EXISTS (
      SELECT 1 FROM public.rfis r
       WHERE r.id = request_reminders.entity_id
         AND r.deleted_at IS NULL
         AND public.rls_rfi_readable(r.company_id, r.construction_site_id, r.route)
    )
  );
