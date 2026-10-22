-- ============================================================================
-- Đợt 2 — 2G: công trình bàn giao xong → hồ sơ MẪU NHÁP trong thư viện công trình mẫu (1H, 0179)
-- (doc/KE_HOACH_LAM_HO.md: «gom ảnh mốc hoàn thiện / bàn giao + phối cảnh khách đã duyệt thành hồ sơ
-- mẫu nháp, thông số tự điền; Thiết kế xác nhận mới vào kho»).
--
--   · Công trình chuyển sang «Bảo hành» (đã bàn giao chủ đầu tư) → máy lập MỘT mẫu nháp cho công
--     trình đó: loại nhà / số tầng / kích thước lô đất lấy từ đầu bài thiết kế đã xác nhận, năm hoàn
--     thành, liên kết công trình + hồ sơ thiết kế; mô tả liệt kê bản thiết kế khách đã duyệt. Tên mẫu
--     KHÔNG lấy tên công trình (thường mang tên chủ nhà — 0179 cấm danh tính trong thư viện).
--   · Mẫu nháp CHỈ Phòng Thiết kế + Giám đốc thấy, không gửi khách được. Thiết kế chọn ảnh từ
--     công trình (ảnh nghiệm thu các mốc, ảnh nhật ký — `showcase_draft_photo_candidates`, được đọc
--     ảnh công trình đó trong kho `construction-photos` khi đang có mẫu nháp), sửa thông tin, rồi
--     «Xác nhận đưa vào kho» (`confirm_showcase_draft`: cần ít nhất một ảnh và ảnh bìa).
--   · Phòng Thiết kế được báo khi có mẫu nháp mới.
--   · Mẫu tạo tay như trước vẫn vào kho ngay (đã xác nhận).
-- ============================================================================

ALTER TABLE public.showcase_items
  ADD COLUMN IF NOT EXISTS status       varchar(16) NOT NULL DEFAULT 'da_xac_nhan',
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.showcase_items DROP CONSTRAINT IF EXISTS showcase_items_status_check;
ALTER TABLE public.showcase_items
  ADD CONSTRAINT showcase_items_status_check CHECK (status IN ('nhap', 'da_xac_nhan'));

-- Một công trình một mẫu nháp (chưa xoá) — chuyển bước đi rồi quay lại không sinh mẫu thứ hai.
CREATE UNIQUE INDEX IF NOT EXISTS showcase_items_one_per_site
  ON public.showcase_items (construction_site_id)
  WHERE deleted_at IS NULL AND construction_site_id IS NOT NULL;

COMMENT ON COLUMN public.showcase_items.status IS
  'nhap = mẫu máy lập khi công trình bàn giao (2G, 0194), chỉ Thiết kế / Giám đốc thấy; da_xac_nhan = trong kho, cả công ty xem, gửi khách được.';

-- ----------------------------------------------------------------------------
-- showcase_items_guard — chép NGUYÊN VĂN 0179, thêm: trạng thái chỉ đổi qua hàm xác nhận; mẫu
-- tạo tay luôn «đã xác nhận».
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.showcase_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('nvg.showcase', true), '') = 'on' OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.deleted_at := NULL;
    NEW.deletion_requested_at := NULL;
    NEW.deletion_requested_by := NULL;
    NEW.deletion_reason := NULL;
    NEW.deletion_approval_id := NULL;
    NEW.cover_media_id := NULL;
    -- 0194: mẫu tạo tay vào kho ngay như trước.
    NEW.status := 'da_xac_nhan';
    NEW.confirmed_at := now();
    NEW.confirmed_by := public.auth_user_id();
    RETURN NEW;
  END IF;
  NEW.company_id := OLD.company_id;
  NEW.deleted_at := OLD.deleted_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.deletion_requested_by := OLD.deletion_requested_by;
  NEW.deletion_reason := OLD.deletion_reason;
  NEW.deletion_approval_id := OLD.deletion_approval_id;
  -- 0194: xác nhận chỉ qua `confirm_showcase_draft`.
  NEW.status := OLD.status;
  NEW.confirmed_at := OLD.confirmed_at;
  NEW.confirmed_by := OLD.confirmed_by;
  NEW.construction_site_id := OLD.construction_site_id;
  IF NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.showcase_media m WHERE m.id = NEW.cover_media_id AND m.item_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Ảnh bìa phải là một ảnh của chính mẫu này.';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Ai thấy mẫu nháp: chỉ người sửa được thư viện.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_showcase_item_visible(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.showcase_items i
     WHERE i.id = p_item_id AND i.deleted_at IS NULL
       AND (i.status = 'da_xac_nhan' OR public.auth_edits_showcase())
  );
$$;

REVOKE ALL ON FUNCTION public.rls_showcase_item_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_showcase_item_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS showcase_items_select ON public.showcase_items;
CREATE POLICY showcase_items_select ON public.showcase_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (status = 'da_xac_nhan' OR public.auth_edits_showcase()));

DROP POLICY IF EXISTS showcase_media_select ON public.showcase_media;
CREATE POLICY showcase_media_select ON public.showcase_media
  FOR SELECT TO authenticated
  USING (public.rls_showcase_item_visible(item_id));

DROP POLICY IF EXISTS showcase_files_select ON storage.objects;
CREATE POLICY showcase_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'showcase'
         AND public.rls_showcase_item_visible(public.try_uuid((storage.foldername(name))[1])));

-- Không gửi khách mẫu nháp.
CREATE OR REPLACE FUNCTION public.showcase_shares_only_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.showcase_items i
              WHERE i.id = ANY (NEW.item_ids) AND i.status <> 'da_xac_nhan') THEN
    RAISE EXCEPTION 'Mẫu nháp chưa được Thiết kế xác nhận — chưa gửi khách được.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS showcase_shares_only_confirmed ON public.showcase_shares;
CREATE TRIGGER showcase_shares_only_confirmed
  BEFORE INSERT ON public.showcase_shares
  FOR EACH ROW EXECUTE FUNCTION public.showcase_shares_only_confirmed();

-- ----------------------------------------------------------------------------
-- Ảnh công trình cho mẫu nháp: Thiết kế / Giám đốc đọc được ảnh của công trình đang có mẫu nháp
-- (chính sách 0135 chép lại, thêm một nhánh). Đã xác nhận / xoá mẫu thì nhánh này đóng.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_showcase_draft_site(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_edits_showcase() AND EXISTS (
    SELECT 1 FROM public.showcase_items i
     WHERE i.construction_site_id = p_site_id AND i.status = 'nhap' AND i.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.rls_showcase_draft_site(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_showcase_draft_site(uuid) TO authenticated;

DROP POLICY IF EXISTS construction_photos_select ON storage.objects;
CREATE POLICY construction_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'construction-photos'
    AND (public.rls_site_readable(public.try_uuid((storage.foldername(name))[1]))
         OR public.rls_showcase_draft_site(public.try_uuid((storage.foldername(name))[1])))
  );

CREATE OR REPLACE FUNCTION public.showcase_draft_photo_candidates(p_item_id uuid)
RETURNS TABLE (path text, source text, taken_on date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i record;
BEGIN
  SELECT * INTO i FROM public.showcase_items WHERE id = p_item_id AND deleted_at IS NULL;
  IF NOT FOUND OR i.status <> 'nhap' OR i.construction_site_id IS NULL
     OR NOT public.auth_edits_showcase() THEN
    RAISE EXCEPTION 'Chỉ Phòng Thiết kế / Giám đốc chọn ảnh cho mẫu nháp lập từ công trình.';
  END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT p, format('Nghiệm thu %s — %s', a.stage_name, r.item_label), a.accepted_date
      FROM public.acceptance_records a
      JOIN public.acceptance_checklist_results r ON r.acceptance_record_id = a.id
      CROSS JOIN LATERAL unnest(r.photo_paths) AS p
     WHERE a.construction_site_id = i.construction_site_id
       AND a.deleted_at IS NULL AND a.status = 'da_nghiem_thu'
    UNION ALL
    SELECT p, 'Ảnh nhật ký'::text, l.log_date
      FROM public.site_logs l
      CROSS JOIN LATERAL unnest(l.photo_urls) AS p
     WHERE l.construction_site_id = i.construction_site_id AND l.deleted_at IS NULL
  ) t(path, source, taken_on)
  ORDER BY t.taken_on DESC NULLS LAST
  LIMIT 300;
END;
$$;

REVOKE ALL ON FUNCTION public.showcase_draft_photo_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.showcase_draft_photo_candidates(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Xác nhận đưa vào kho
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_showcase_draft(p_item_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i     record;
  v_now timestamptz := now();
BEGIN
  IF NOT public.auth_edits_showcase() OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Chỉ Phòng Thiết kế / Giám đốc xác nhận được mẫu.';
  END IF;
  SELECT * INTO i FROM public.showcase_items WHERE id = p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy mẫu.'; END IF;
  IF i.status <> 'nhap' THEN RAISE EXCEPTION 'Mẫu này đã ở trong kho.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.showcase_media m WHERE m.item_id = i.id) THEN
    RAISE EXCEPTION 'Thêm ít nhất một ảnh trước khi đưa mẫu vào kho.';
  END IF;
  IF i.cover_media_id IS NULL THEN
    RAISE EXCEPTION 'Chọn ảnh bìa trước khi đưa mẫu vào kho.';
  END IF;
  PERFORM set_config('nvg.showcase', 'on', true);
  UPDATE public.showcase_items
     SET status = 'da_xac_nhan', confirmed_at = v_now, confirmed_by = public.auth_user_id(),
         updated_at = v_now, updated_by = public.auth_user_id()
   WHERE id = i.id;
  PERFORM set_config('nvg.showcase', 'off', true);
  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_showcase_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_showcase_draft(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Công trình bàn giao → mẫu nháp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.construction_sites_showcase_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company text;
  b         jsonb;
  v_kind    text;
  v_desc    text;
  v_id      uuid;
  v_designs text;
BEGIN
  IF NEW.stage <> 'bao_hanh' OR OLD.stage = 'bao_hanh' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.showcase_items i
              WHERE i.construction_site_id = NEW.id AND i.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT c.code INTO v_company FROM public.companies c WHERE c.id = NEW.company_id;
  IF NEW.design_project_id IS NOT NULL THEN
    SELECT db.structured INTO b
      FROM public.design_briefs db
     WHERE db.design_project_id = NEW.design_project_id AND db.is_current_version
       AND db.deleted_at IS NULL AND db.confirmed_at IS NOT NULL
     ORDER BY db.version DESC
     LIMIT 1;
    SELECT string_agg(format('%s (khách duyệt %s)', concat_ws(' — ', v.code, v.title),
                             to_char(v.customer_approved_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')),
                      '; ' ORDER BY v.customer_approved_at)
      INTO v_designs
      FROM public.design_versions v
     WHERE v.design_project_id = NEW.design_project_id
       AND v.customer_approved_at IS NOT NULL AND v.deleted_at IS NULL;
  END IF;

  v_kind := CASE
    WHEN v_company = 'NVC' THEN 'nha_xuong'
    WHEN b->>'building_type' = 'nha_pho' THEN 'nha_pho'
    WHEN b->>'building_type' = 'biet_thu' THEN 'biet_thu'
    ELSE 'khac'
  END;

  v_desc := concat_ws(E'\n',
    format('Mẫu nháp máy lập khi công trình %s bàn giao ngày %s. Thiết kế chọn ảnh từ công trình, sửa tên, mô tả, khu vực rồi xác nhận đưa vào kho.',
           NEW.code, to_char(COALESCE(NEW.handed_over_at, now()) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY')),
    CASE WHEN v_designs IS NOT NULL
         THEN 'Bản thiết kế khách đã duyệt (thêm phối cảnh từ hồ sơ thiết kế): ' || v_designs END
  );

  PERFORM set_config('nvg.showcase', 'on', true);
  INSERT INTO public.showcase_items (
    company_id, title, kind, floors, land_area, frontage, depth, completed_year,
    description, design_project_id, construction_site_id, status
  ) VALUES (
    NEW.company_id,
    format('Mẫu nháp từ công trình %s', NEW.code),
    v_kind,
    CASE WHEN jsonb_typeof(b->'floors') = 'number' AND (b->>'floors')::numeric BETWEEN 1 AND 60
         THEN (b->>'floors')::numeric::int END,
    CASE WHEN jsonb_typeof(b->'site'->'area_m2') = 'number' AND (b->'site'->>'area_m2')::numeric > 0
         THEN (b->'site'->>'area_m2')::numeric END,
    CASE WHEN jsonb_typeof(b->'site'->'width_m') = 'number' AND (b->'site'->>'width_m')::numeric > 0
         THEN (b->'site'->>'width_m')::numeric END,
    CASE WHEN jsonb_typeof(b->'site'->'depth_m') = 'number' AND (b->'site'->>'depth_m')::numeric > 0
         THEN (b->'site'->>'depth_m')::numeric END,
    extract(year FROM COALESCE(NEW.handed_over_at, now()) AT TIME ZONE 'Asia/Ho_Chi_Minh')::int,
    v_desc,
    NEW.design_project_id,
    NEW.id,
    'nhap'
  )
  RETURNING id INTO v_id;
  PERFORM set_config('nvg.showcase', 'off', true);

  PERFORM public.create_notification(
    recipient.id, NEW.company_id, 'showcase_draft',
    format('Công trình %s đã bàn giao — có mẫu nháp chờ Thiết kế chọn ảnh và xác nhận đưa vào thư viện.', NEW.code),
    'showcase_items', v_id, format('/mau-cong-trinh/%s', v_id)
  )
  FROM (
    SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
     WHERE u.is_active AND u.deleted_at IS NULL
       AND (uc.company_id = NEW.company_id OR r.sees_all_companies)
       AND r.code = 'TKE'
  ) recipient;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_showcase_draft ON public.construction_sites;
CREATE TRIGGER construction_sites_showcase_draft
  AFTER UPDATE OF stage ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_showcase_draft();
