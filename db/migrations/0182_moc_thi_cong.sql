-- ============================================================================
-- Đợt 2 — 2A: mốc thi công, nghiệm thu trước khi che khuất.
--
-- Hệ thống đang gộp cả quá trình xây nhà vào một bước «Đang thi công»: không có gì chặn đổ bê
-- tông khi thép chưa nghiệm thu. Quy chuẩn Nhà Việt One (bộ «HoSoTapHop Gui Sep») đặt nguyên tắc
-- «Chuẩn bị → Kiểm tra → Thi công → Nghiệm thu → Chuyển bước», «không che khuất công việc chưa
-- nghiệm thu», ba lớp kiểm soát (người thi công tự kiểm; giám sát kiểm độc lập; phụ trách kỹ
-- thuật kiểm hạng mục quan trọng: móng, kết cấu, chống thấm, MEP âm, hoàn thiện) và ảnh hoá
-- công trình.
--
-- Thiết kế:
--   · `milestone_templates` — BỘ MỐC của một pháp nhân (dữ liệu, không hard-code): danh sách bước,
--     mỗi bước trỏ một danh mục kiểm tra (`acceptance_checklists`, 0136) và cờ «cần phụ trách kỹ
--     thuật kiểm». NVO có bộ 7 mốc (seed, rút từ Quy chuẩn — chờ NVG xác nhận); NVC chờ câu 15.
--   · `site_milestones` — mốc của MỘT công trình, chụp lại từ bộ mốc lúc áp: sửa bộ mốc sau này
--     không đổi công trình đang chạy (cùng lẽ `unit_price_applied`).
--   · `site_milestone_events` — lịch sử từng mốc (bắt đầu, không đạt, chờ kỹ thuật, trả lại,
--     đạt) — thay đổi trạng thái quan trọng ghi bảng riêng (CLAUDE.md 4.2).
--   · Nghiệm thu mốc = biên bản nghiệm thu NỘI BỘ kèm danh mục (`record_acceptance_with_checklist`,
--     dùng lại mọi kiểm tra, cấp mã, ảnh, Mẫu E). Chỉ mốc đang làm mới nghiệm thu được: mốc
--     trước chưa đạt thì mốc sau không mở.
--   · Lớp 3 «phụ trách kỹ thuật» = Trưởng phòng Thi công (quyền sửa TC, không bị giới hạn công
--     trình) hoặc Ban Giám đốc; KHÔNG phải người lập biên bản mốc (kiểm độc lập).
--   · Công trình có mốc thì chỉ sang «Nghiệm thu bàn giao» khi mọi mốc đã đạt — điều kiện nằm ở
--     `stage_readiness` (một nguồn cho CSDL và giao diện) và trigger chặn.
--   · Mốc chỉ ghi qua hàm; trình duyệt chỉ sửa được ngày dự kiến xong của mốc.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Bộ mốc của pháp nhân
-- ----------------------------------------------------------------------------

CREATE TYPE public.site_milestone_status AS ENUM ('cho_lam', 'dang_lam', 'cho_ky_thuat', 'dat');

CREATE TABLE public.milestone_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  -- Bộ mốc tự áp cho công trình mới mở của pháp nhân.
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  -- [{ "key": "mong", "label": "Thi công phần móng", "checklist_id": "<uuid>",
  --    "requires_technical_check": true }]
  steps       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at  timestamptz,
  CONSTRAINT milestone_templates_steps_array
    CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
  CONSTRAINT milestone_templates_name_unique UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX milestone_templates_one_default
  ON public.milestone_templates (company_id)
  WHERE is_default AND is_active AND deleted_at IS NULL;

COMMENT ON TABLE public.milestone_templates IS
  'Bộ mốc thi công của một pháp nhân (Đợt 2 — 2A). Nội dung là quyết định nghiệp vụ của NVG.';

ALTER TABLE public.milestone_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milestone_templates FROM anon;

CREATE POLICY milestone_templates_select ON public.milestone_templates
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.auth_can_view_module('TC')
         AND public.rls_company_access(company_id));

-- Cùng người soạn danh mục kiểm tra (0136): văn phòng Thi công và Ban Giám đốc.
CREATE POLICY milestone_templates_insert ON public.milestone_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.auth_is_read_only()
    AND (public.auth_manages_all_companies()
         OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
             AND public.rls_company_access(company_id)))
  );

CREATE POLICY milestone_templates_update ON public.milestone_templates
  FOR UPDATE TO authenticated
  USING (
    NOT public.auth_is_read_only()
    AND (public.auth_manages_all_companies()
         OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
             AND public.rls_company_access(company_id)))
  )
  WITH CHECK (
    NOT public.auth_is_read_only()
    AND (public.auth_manages_all_companies()
         OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
             AND public.rls_company_access(company_id)))
  );

SELECT public.attach_audit_touch('public.milestone_templates');


-- ----------------------------------------------------------------------------
-- 2. Mốc của từng công trình + lịch sử
-- ----------------------------------------------------------------------------

CREATE TABLE public.site_milestones (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id     uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  milestone_template_id    uuid REFERENCES public.milestone_templates(id) ON DELETE SET NULL,
  position                 integer NOT NULL,
  step_key                 text NOT NULL,
  -- Chụp lại lúc áp bộ mốc.
  label                    text NOT NULL,
  acceptance_checklist_id  uuid REFERENCES public.acceptance_checklists(id) ON DELETE SET NULL,
  requires_technical_check boolean NOT NULL DEFAULT false,
  status                   public.site_milestone_status NOT NULL DEFAULT 'cho_lam',
  -- Kế hoạch — người dùng sửa được (cột duy nhất trình duyệt ghi thẳng).
  planned_end_date         date,
  -- Biên bản nghiệm thu nội bộ ĐẠT gần nhất của mốc.
  acceptance_record_id     uuid REFERENCES public.acceptance_records(id) ON DELETE SET NULL,
  submitted_at             timestamptz,
  submitted_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  technical_checked_at     timestamptz,
  technical_checked_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  technical_note           text,
  passed_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT site_milestones_position_unique UNIQUE (construction_site_id, position),
  CONSTRAINT site_milestones_key_unique UNIQUE (construction_site_id, step_key)
);

CREATE INDEX site_milestones_status_idx ON public.site_milestones (company_id, status);

COMMENT ON TABLE public.site_milestones IS
  'Mốc thi công của một công trình (Đợt 2 — 2A). Chỉ ghi qua hàm; trình duyệt chỉ sửa ngày dự kiến.';

ALTER TABLE public.site_milestones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_milestones FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.site_milestones FROM authenticated;
GRANT UPDATE (planned_end_date) ON public.site_milestones TO authenticated;

CREATE POLICY site_milestones_select ON public.site_milestones
  FOR SELECT TO authenticated
  USING (public.rls_site_readable(construction_site_id));

CREATE POLICY site_milestones_update ON public.site_milestones
  FOR UPDATE TO authenticated
  USING (NOT public.auth_is_read_only() AND public.rls_site_writable(construction_site_id))
  WITH CHECK (NOT public.auth_is_read_only() AND public.rls_site_writable(construction_site_id));

SELECT public.attach_audit_touch('public.site_milestones');

CREATE TABLE public.site_milestone_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  site_milestone_id    uuid NOT NULL REFERENCES public.site_milestones(id) ON DELETE CASCADE,
  -- bat_dau · khong_dat · cho_ky_thuat · tra_lai · dat
  event                text NOT NULL
    CHECK (event IN ('bat_dau', 'khong_dat', 'cho_ky_thuat', 'tra_lai', 'dat')),
  acceptance_record_id uuid REFERENCES public.acceptance_records(id) ON DELETE SET NULL,
  note                 text,
  actor_id             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_milestone_events_milestone_idx
  ON public.site_milestone_events (site_milestone_id, created_at);

ALTER TABLE public.site_milestone_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_milestone_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.site_milestone_events FROM authenticated;

CREATE POLICY site_milestone_events_select ON public.site_milestone_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_milestones m
                  WHERE m.id = site_milestone_id
                    AND public.rls_site_readable(m.construction_site_id)));


-- ----------------------------------------------------------------------------
-- 3. Áp bộ mốc
-- ----------------------------------------------------------------------------

-- Nội bộ: chép bộ mốc vào công trình, mốc đầu là mốc đang làm. Không cấp cho trình duyệt.
CREATE OR REPLACE FUNCTION public._apply_milestone_template(p_site_id uuid, p_template_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site  record;
  v_tpl   record;
  v_step  jsonb;
  v_pos   integer := 0;
  v_first uuid;
BEGIN
  SELECT id, company_id INTO v_site FROM public.construction_sites WHERE id = p_site_id;
  SELECT * INTO v_tpl FROM public.milestone_templates
   WHERE id = p_template_id AND is_active AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bộ mốc đã chọn, hoặc bộ mốc đã ngừng dùng.';
  END IF;
  IF v_tpl.company_id <> v_site.company_id THEN
    RAISE EXCEPTION 'Bộ mốc này thuộc pháp nhân khác.';
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(v_tpl.steps) LOOP
    v_pos := v_pos + 1;
    IF NOT EXISTS (SELECT 1 FROM public.acceptance_checklists c
                    WHERE c.id = (v_step->>'checklist_id')::uuid
                      AND c.deleted_at IS NULL AND c.is_active) THEN
      RAISE EXCEPTION 'Mốc «%» của bộ mốc chưa có danh mục kiểm tra dùng được.', v_step->>'label';
    END IF;
    INSERT INTO public.site_milestones (
      company_id, construction_site_id, milestone_template_id, position, step_key, label,
      acceptance_checklist_id, requires_technical_check, status
    ) VALUES (
      v_site.company_id, p_site_id, p_template_id, v_pos, v_step->>'key', v_step->>'label',
      (v_step->>'checklist_id')::uuid,
      COALESCE((v_step->>'requires_technical_check')::boolean, false),
      CASE WHEN v_pos = 1 THEN 'dang_lam' ELSE 'cho_lam' END::public.site_milestone_status
    )
    RETURNING CASE WHEN v_pos = 1 THEN id END INTO v_first;
    IF v_first IS NOT NULL THEN
      INSERT INTO public.site_milestone_events (company_id, site_milestone_id, event, actor_id)
      VALUES (v_site.company_id, v_first, 'bat_dau', public.auth_user_id());
    END IF;
  END LOOP;
  RETURN v_pos;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_milestone_template(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Công trình mới của pháp nhân có bộ mốc mặc định thì tự có mốc — không phải nhớ bấm.
CREATE OR REPLACE FUNCTION public.construction_sites_default_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl uuid;
BEGIN
  SELECT id INTO v_tpl FROM public.milestone_templates
   WHERE company_id = NEW.company_id AND is_default AND is_active AND deleted_at IS NULL;
  IF v_tpl IS NOT NULL THEN
    PERFORM public._apply_milestone_template(NEW.id, v_tpl);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_default_milestones ON public.construction_sites;
CREATE TRIGGER construction_sites_default_milestones
  AFTER INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_default_milestones();

-- Văn phòng Thi công / Ban Giám đốc áp bộ mốc cho công trình đã mở trước khi có bộ mốc.
CREATE OR REPLACE FUNCTION public.apply_milestone_template(p_site_id uuid, p_template_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site record;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO v_site FROM public.construction_sites WHERE id = p_site_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_site_readable(p_site_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;
  IF public.auth_is_read_only()
     OR NOT (public.auth_manages_all_companies()
             OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
                 AND public.rls_company_access(v_site.company_id))) THEN
    RAISE EXCEPTION 'Chỉ Trưởng phòng Thi công hoặc Ban Giám đốc áp bộ mốc cho công trình.';
  END IF;
  IF v_site.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc, không áp bộ mốc nữa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_milestones WHERE construction_site_id = p_site_id) THEN
    RAISE EXCEPTION 'Công trình đã có mốc thi công.';
  END IF;
  RETURN public._apply_milestone_template(p_site_id, p_template_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_milestone_template(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_milestone_template(uuid, uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Nghiệm thu mốc, kiểm lớp kỹ thuật, sang mốc sau
-- ----------------------------------------------------------------------------

-- Người kiểm lớp 3 của pháp nhân: Trưởng phòng Thi công (sửa TC, không giới hạn công trình) và
-- Ban Giám đốc.
CREATE OR REPLACE FUNCTION public.milestone_technical_reviewers(p_company_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    LEFT JOIN public.permissions pm ON pm.role_id = r.id AND pm.module_code = 'TC'
   WHERE u.is_active AND u.deleted_at IS NULL
     AND (uc.company_id = p_company_id OR r.sees_all_companies)
     AND r.code::text <> 'KSNB'
     AND ((pm.can_edit AND NOT r.site_scoped AND uc.company_id = p_company_id)
          OR r.code::text IN ('TGD', 'BGD'));
$$;

REVOKE ALL ON FUNCTION public.milestone_technical_reviewers(uuid) FROM PUBLIC, anon, authenticated;

-- Cho giao diện: người đang đăng nhập có kiểm lớp kỹ thuật / áp bộ mốc cho pháp nhân này không —
-- ẩn nút khi không có quyền (CLAUDE.md 5.4), cùng điều kiện các hàm ghi.
CREATE OR REPLACE FUNCTION public.auth_can_review_milestones(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.milestone_technical_reviewers(p_company_id) rv
                  WHERE rv.user_id = public.auth_user_id());
$$;

REVOKE ALL ON FUNCTION public.auth_can_review_milestones(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_can_review_milestones(uuid) TO authenticated;

-- Nội bộ: mốc đạt → mốc kế tiếp thành mốc đang làm; mốc cuối đạt → báo chỉ huy trưởng.
CREATE OR REPLACE FUNCTION public._pass_site_milestone(p_milestone_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m       record;
  v_site  record;
  v_next  uuid;
BEGIN
  UPDATE public.site_milestones SET status = 'dat', passed_at = now()
   WHERE id = p_milestone_id
  RETURNING * INTO m;
  INSERT INTO public.site_milestone_events
    (company_id, site_milestone_id, event, acceptance_record_id, note, actor_id)
  VALUES (m.company_id, m.id, 'dat', m.acceptance_record_id, p_note, public.auth_user_id());

  UPDATE public.site_milestones SET status = 'dang_lam'
   WHERE construction_site_id = m.construction_site_id AND position = m.position + 1
     AND status = 'cho_lam'
  RETURNING id INTO v_next;

  SELECT id, code, name, responsible_user_id INTO v_site
    FROM public.construction_sites WHERE id = m.construction_site_id;

  IF v_next IS NOT NULL THEN
    INSERT INTO public.site_milestone_events (company_id, site_milestone_id, event, actor_id)
    VALUES (m.company_id, v_next, 'bat_dau', public.auth_user_id());
  ELSIF v_site.responsible_user_id IS NOT NULL
        AND v_site.responsible_user_id IS DISTINCT FROM public.auth_user_id() THEN
    PERFORM public.create_notification(
      v_site.responsible_user_id, m.company_id, 'milestone_all_passed',
      format('Công trình %s đã đạt đủ các mốc thi công — có thể chuyển sang nghiệm thu bàn giao.', v_site.code),
      'construction_sites', v_site.id, format('/tc/cong-trinh/%s?tab=moc', v_site.id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._pass_site_milestone(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_milestone_acceptance(
  p_milestone_id uuid,
  p_results jsonb,
  p_accepted_date date DEFAULT NULL,
  p_outstanding_issues text DEFAULT NULL,
  p_scope text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  m        record;
  v_site   record;
  v_prev   text;
  v_id     uuid;
  v_failed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO m FROM public.site_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_site_readable(m.construction_site_id) THEN
    RAISE EXCEPTION 'Không tìm thấy mốc thi công.';
  END IF;
  IF public.auth_is_read_only() OR NOT public.rls_site_writable(m.construction_site_id) THEN
    RAISE EXCEPTION 'Không nghiệm thu được mốc trên công trình này — chỉ huy trưởng được phân công hoặc Trưởng phòng Thi công lập biên bản.';
  END IF;

  SELECT id, stage INTO v_site FROM public.construction_sites WHERE id = m.construction_site_id;
  IF v_site.stage <> 'dang_thi_cong' THEN
    RAISE EXCEPTION 'Công trình chưa ở bước Đang thi công — chỉ nghiệm thu mốc khi đang thi công.';
  END IF;

  IF m.status = 'cho_lam' THEN
    SELECT label INTO v_prev FROM public.site_milestones
     WHERE construction_site_id = m.construction_site_id AND position < m.position
       AND status <> 'dat'
     ORDER BY position LIMIT 1;
    RAISE EXCEPTION 'Mốc trước chưa đạt: «%». Nghiệm thu xong mốc trước rồi mới sang mốc này.', v_prev;
  ELSIF m.status = 'cho_ky_thuat' THEN
    RAISE EXCEPTION 'Mốc đang chờ phụ trách kỹ thuật kiểm — chưa lập lại biên bản được.';
  ELSIF m.status = 'dat' THEN
    RAISE EXCEPTION 'Mốc đã đạt.';
  END IF;

  IF m.acceptance_checklist_id IS NULL THEN
    RAISE EXCEPTION 'Mốc chưa có danh mục kiểm tra — Trưởng phòng Thi công cần gắn danh mục cho bộ mốc.';
  END IF;

  -- Dùng lại toàn bộ kiểm tra của biên bản kèm danh mục: chấm đủ mục, ảnh bắt buộc đúng công
  -- trình, mục Không đạt phải ghi tồn tại, Mẫu E, cấp mã.
  v_id := public.record_acceptance_with_checklist(
    m.construction_site_id, 'noi_bo', m.label, m.acceptance_checklist_id, p_results,
    NULL, p_scope, p_accepted_date, NULL, NULL, p_outstanding_issues
  );

  v_failed := EXISTS (SELECT 1 FROM public.acceptance_checklist_results r
                       WHERE r.acceptance_record_id = v_id AND r.result = 'khong_dat');

  IF v_failed THEN
    INSERT INTO public.site_milestone_events
      (company_id, site_milestone_id, event, acceptance_record_id, note, actor_id)
    VALUES (m.company_id, m.id, 'khong_dat', v_id, NULLIF(btrim(COALESCE(p_outstanding_issues, '')), ''), v_user);
    RETURN 'khong_dat';
  END IF;

  UPDATE public.site_milestones
     SET acceptance_record_id = v_id, submitted_at = now(), submitted_by = v_user,
         technical_checked_at = NULL, technical_checked_by = NULL, technical_note = NULL
   WHERE id = m.id;

  IF m.requires_technical_check THEN
    UPDATE public.site_milestones SET status = 'cho_ky_thuat' WHERE id = m.id;
    INSERT INTO public.site_milestone_events
      (company_id, site_milestone_id, event, acceptance_record_id, actor_id)
    VALUES (m.company_id, m.id, 'cho_ky_thuat', v_id, v_user);
    PERFORM public.create_notification(
      rv.user_id, m.company_id, 'milestone_technical_check',
      format('Mốc «%s» của công trình %s đã nghiệm thu nội bộ — chờ phụ trách kỹ thuật kiểm trước khi sang mốc sau.',
             m.label, (SELECT code FROM public.construction_sites WHERE id = m.construction_site_id)),
      'construction_sites', m.construction_site_id,
      format('/tc/cong-trinh/%s?tab=moc', m.construction_site_id)
    )
    FROM public.milestone_technical_reviewers(m.company_id) rv
    WHERE rv.user_id <> v_user;
    RETURN 'cho_ky_thuat';
  END IF;

  PERFORM public._pass_site_milestone(m.id, NULL);
  RETURN 'dat';
END;
$$;

REVOKE ALL ON FUNCTION public.record_milestone_acceptance(uuid, jsonb, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_milestone_acceptance(uuid, jsonb, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_milestone_technical(
  p_milestone_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  m      record;
  v_site record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO m FROM public.site_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_site_readable(m.construction_site_id) THEN
    RAISE EXCEPTION 'Không tìm thấy mốc thi công.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.milestone_technical_reviewers(m.company_id) rv
                  WHERE rv.user_id = v_user) THEN
    RAISE EXCEPTION 'Chỉ Trưởng phòng Thi công hoặc Ban Giám đốc kiểm lớp kỹ thuật của mốc.';
  END IF;
  IF m.status <> 'cho_ky_thuat' THEN
    RAISE EXCEPTION 'Mốc không ở trạng thái chờ phụ trách kỹ thuật kiểm.';
  END IF;
  IF m.submitted_by = v_user THEN
    RAISE EXCEPTION 'Người lập biên bản mốc không tự kiểm lớp kỹ thuật — cần một người kiểm độc lập.';
  END IF;

  SELECT id, code, responsible_user_id INTO v_site
    FROM public.construction_sites WHERE id = m.construction_site_id;

  IF p_approve THEN
    UPDATE public.site_milestones
       SET technical_checked_at = now(), technical_checked_by = v_user,
           technical_note = NULLIF(btrim(COALESCE(p_note, '')), '')
     WHERE id = m.id;
    PERFORM public._pass_site_milestone(m.id, NULLIF(btrim(COALESCE(p_note, '')), ''));
    RETURN;
  END IF;

  IF COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Ghi rõ chỗ chưa đạt và cần khắc phục gì trước khi trả lại.';
  END IF;

  UPDATE public.site_milestones
     SET status = 'dang_lam', technical_checked_at = now(), technical_checked_by = v_user,
         technical_note = btrim(p_note)
   WHERE id = m.id;
  INSERT INTO public.site_milestone_events
    (company_id, site_milestone_id, event, acceptance_record_id, note, actor_id)
  VALUES (m.company_id, m.id, 'tra_lai', m.acceptance_record_id, btrim(p_note), v_user);

  PERFORM public.create_notification(
    x.uid, m.company_id, 'milestone_returned',
    format('Mốc «%s» của công trình %s bị trả lại: %s', m.label, v_site.code, btrim(p_note)),
    'construction_sites', v_site.id, format('/tc/cong-trinh/%s?tab=moc', v_site.id)
  )
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[m.submitted_by, v_site.responsible_user_id]) AS uid
         WHERE uid IS NOT NULL AND uid <> v_user) x;
END;
$$;

REVOKE ALL ON FUNCTION public.review_milestone_technical(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_milestone_technical(uuid, boolean, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Chưa đạt đủ mốc thì không sang Nghiệm thu bàn giao
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.construction_sites_milestones_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_missing text;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stage = 'nghiem_thu' AND OLD.stage IS DISTINCT FROM 'nghiem_thu' THEN
    SELECT string_agg(r.label, '; ') INTO v_missing
      FROM public.stage_readiness('site', NEW.id) r
     WHERE r.for_stage = 'nghiem_thu' AND NOT r.met;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Chưa chuyển sang nghiệm thu bàn giao được. Cần: %.', v_missing;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_milestones_gate ON public.construction_sites;
CREATE TRIGGER construction_sites_milestones_gate
  BEFORE UPDATE OF stage ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_milestones_gate();


-- ----------------------------------------------------------------------------
-- 6. stage_readiness — chép nguyên bản 0176, thêm «đạt đủ mốc» cho bước Nghiệm thu
-- ----------------------------------------------------------------------------

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

    -- 0176 (Đợt 1 — 1E): pháp nhân đã có mẫu Word cho loại hợp đồng này thì phải lập văn bản trước
    -- khi gửi phê duyệt — người duyệt xem đúng văn bản sẽ ký. Chưa có mẫu thì không đòi.
    IF public.contract_requires_document(p_id) THEN
      RETURN QUERY SELECT 'cho_duyet'::text, 'document_ready'::text,
             EXISTS (SELECT 1 FROM public.contract_documents d WHERE d.contract_id = p_id),
             'Đã lập văn bản hợp đồng từ mẫu (tab Văn bản)'::text, false;
    END IF;

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

    -- 0182 (Đợt 2 — 2A): công trình có mốc thi công thì chỉ sang Nghiệm thu bàn giao khi mọi mốc đã
    -- đạt (nghiệm thu nội bộ + phụ trách kỹ thuật nếu mốc cần). Công trình không có mốc: không đòi.
    IF EXISTS (SELECT 1 FROM public.site_milestones sm WHERE sm.construction_site_id = p_id) THEN
      RETURN QUERY SELECT 'nghiem_thu'::text, 'milestones_passed'::text,
             NOT EXISTS (SELECT 1 FROM public.site_milestones sm
                          WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'),
             COALESCE('Đạt đủ các mốc thi công (còn: '
                      || (SELECT sm.label FROM public.site_milestones sm
                           WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'
                           ORDER BY sm.position LIMIT 1) || ')',
                      'Đạt đủ các mốc thi công'),
             false;
    END IF;

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
