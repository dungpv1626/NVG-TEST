-- ============================================================================
-- Đợt 1 — 1H: Thư viện công trình mẫu + link xem trực tuyến gửi khách
-- (doc/KE_HOACH_LAM_HO.md mục 3.1 — quy tắc chủ dự án chốt 17/10/2026).
--
--   · Phòng Thiết kế (TKE) đưa mẫu vào kho — nhà ở NVO, nhà xưởng NVC, sản phẩm NVS. Không cần
--     duyệt trước khi dùng.
--   · MỌI NGƯỜI trong công ty xem được (ngoại lệ có chủ đích với Mẫu A — CLAUDE.md 9.4).
--   · Chỉ Phòng Thiết kế và Giám đốc (TGĐ, Ban Giám đốc) sửa. Xoá: Thiết kế đề nghị → Giám đốc
--     đồng ý qua Hộp thư Phê duyệt (loại `showcase_delete`, 0178); Giám đốc tự xoá được. Xoá mềm.
--   · KHÔNG có cột giá; mẫu không chứa tên chủ nhà / địa chỉ chi tiết — chỉ «khu vực» (quận/tỉnh).
--   · Link gửi khách: Kinh doanh đặt THỜI HẠN (bắt buộc), thu hồi sớm được; trang công khai đi qua
--     Worker (khoá service) và CHỈ đọc qua `showcase_public` — trả đúng mẫu trong link, chưa xoá,
--     link chưa hết hạn / chưa thu hồi; mỗi lần mở ghi một lượt xem.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Mẫu và ảnh
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.showcase_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  sample_code           varchar(32),
  title                 text NOT NULL CHECK (btrim(title) <> ''),
  kind                  varchar(32) NOT NULL CHECK (kind IN (
                          'nha_pho', 'biet_thu', 'nha_nong_thon', 'nha_xuong', 'cai_tao',
                          'san_pham_nvs', 'khac')),
  style                 text,
  floors                integer CHECK (floors IS NULL OR floors BETWEEN 1 AND 60),
  bedrooms              integer CHECK (bedrooms IS NULL OR bedrooms BETWEEN 0 AND 50),
  land_area             numeric(10, 1) CHECK (land_area IS NULL OR land_area > 0),
  frontage              numeric(6, 2) CHECK (frontage IS NULL OR frontage > 0),
  depth                 numeric(6, 2) CHECK (depth IS NULL OR depth > 0),
  building_area         numeric(10, 1) CHECK (building_area IS NULL OR building_area > 0),
  span                  numeric(6, 2) CHECK (span IS NULL OR span > 0),
  location_area         text,
  completed_year        integer CHECK (completed_year IS NULL OR completed_year BETWEEN 1990 AND 2100),
  description           text,
  design_project_id     uuid REFERENCES public.design_projects(id) ON DELETE SET NULL,
  construction_site_id  uuid REFERENCES public.construction_sites(id) ON DELETE SET NULL,
  cover_media_id        uuid,
  deletion_requested_at timestamptz,
  deletion_requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deletion_reason       text,
  deletion_approval_id  uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at            timestamptz
);

CREATE INDEX IF NOT EXISTS showcase_items_kind_idx ON public.showcase_items (kind) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS showcase_items_code_unique
  ON public.showcase_items (company_id, sample_code)
  WHERE deleted_at IS NULL AND sample_code IS NOT NULL;

COMMENT ON TABLE public.showcase_items IS
  'Thư viện công trình mẫu để chào khách (Đợt 1 — 1H). Cả công ty xem; Thiết kế + Giám đốc sửa; xoá cần Giám đốc đồng ý. Không có giá, không có danh tính chủ nhà.';

SELECT public.attach_audit_touch('public.showcase_items');

CREATE TABLE IF NOT EXISTS public.showcase_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES public.showcase_items(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  kind         varchar(16) NOT NULL DEFAULT 'anh_thuc_te'
               CHECK (kind IN ('anh_thuc_te', 'phoi_canh', 'mat_bang', 'khac')),
  caption      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT showcase_media_path CHECK (storage_path LIKE item_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS showcase_media_item_idx ON public.showcase_media (item_id, sort_order);

ALTER TABLE public.showcase_items
  DROP CONSTRAINT IF EXISTS showcase_items_cover_fk;
ALTER TABLE public.showcase_items
  ADD CONSTRAINT showcase_items_cover_fk
  FOREIGN KEY (cover_media_id) REFERENCES public.showcase_media(id) ON DELETE SET NULL;

-- Ai sửa thư viện: Phòng Thiết kế, Tổng Giám đốc, Ban Giám đốc (chủ dự án chốt).
CREATE OR REPLACE FUNCTION public.auth_edits_showcase()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('TKE', 'TGD', 'BGD');
$$;

CREATE OR REPLACE FUNCTION public.auth_is_director()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('TGD', 'BGD');
$$;

REVOKE ALL ON FUNCTION public.auth_edits_showcase() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_is_director() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_edits_showcase() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_director() TO authenticated;

-- Xoá và đề nghị xoá chỉ qua hàm; pháp nhân không đổi; ảnh bìa phải là ảnh của chính mẫu.
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
    RETURN NEW;
  END IF;
  NEW.company_id := OLD.company_id;
  NEW.deleted_at := OLD.deleted_at;
  NEW.deletion_requested_at := OLD.deletion_requested_at;
  NEW.deletion_requested_by := OLD.deletion_requested_by;
  NEW.deletion_reason := OLD.deletion_reason;
  NEW.deletion_approval_id := OLD.deletion_approval_id;
  IF NEW.cover_media_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.showcase_media m WHERE m.id = NEW.cover_media_id AND m.item_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Ảnh bìa phải là một ảnh của chính mẫu này.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS showcase_items_guard ON public.showcase_items;
CREATE TRIGGER showcase_items_guard
  BEFORE INSERT OR UPDATE ON public.showcase_items
  FOR EACH ROW EXECUTE FUNCTION public.showcase_items_guard();

CREATE OR REPLACE FUNCTION public.showcase_media_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_at := now();
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS showcase_media_before_insert ON public.showcase_media;
CREATE TRIGGER showcase_media_before_insert
  BEFORE INSERT ON public.showcase_media
  FOR EACH ROW EXECUTE FUNCTION public.showcase_media_before_insert();

ALTER TABLE public.showcase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.showcase_items FROM anon;
REVOKE ALL ON public.showcase_media FROM anon;

DROP POLICY IF EXISTS showcase_items_select ON public.showcase_items;
CREATE POLICY showcase_items_select ON public.showcase_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS showcase_items_insert ON public.showcase_items;
CREATE POLICY showcase_items_insert ON public.showcase_items
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_edits_showcase());

DROP POLICY IF EXISTS showcase_items_update ON public.showcase_items;
CREATE POLICY showcase_items_update ON public.showcase_items
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.auth_edits_showcase())
  WITH CHECK (public.auth_edits_showcase());

DROP POLICY IF EXISTS showcase_media_select ON public.showcase_media;
CREATE POLICY showcase_media_select ON public.showcase_media
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.showcase_items i WHERE i.id = item_id AND i.deleted_at IS NULL));

DROP POLICY IF EXISTS showcase_media_write ON public.showcase_media;
CREATE POLICY showcase_media_write ON public.showcase_media
  FOR ALL TO authenticated
  USING (public.auth_edits_showcase())
  WITH CHECK (public.auth_edits_showcase());

GRANT SELECT, INSERT, UPDATE ON public.showcase_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.showcase_media TO authenticated;

-- Kho ảnh: riêng tư; trong công ty ai cũng xem; Thiết kế / Giám đốc tải lên, gỡ.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('showcase', 'showcase', false, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS showcase_files_select ON storage.objects;
CREATE POLICY showcase_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'showcase');

DROP POLICY IF EXISTS showcase_files_insert ON storage.objects;
CREATE POLICY showcase_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'showcase' AND public.auth_edits_showcase()
              AND EXISTS (SELECT 1 FROM public.showcase_items i
                          WHERE i.id = public.try_uuid((storage.foldername(name))[1])
                            AND i.deleted_at IS NULL));

DROP POLICY IF EXISTS showcase_files_delete ON storage.objects;
CREATE POLICY showcase_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'showcase' AND public.auth_edits_showcase());

-- ----------------------------------------------------------------------------
-- 2. Đề nghị xoá / xoá
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_showcase_deletion(p_item_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  i record;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  IF NOT public.auth_edits_showcase() THEN
    RAISE EXCEPTION 'Chỉ Phòng Thiết kế và Giám đốc xoá được mẫu.';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nêu lý do xoá mẫu.';
  END IF;
  SELECT * INTO i FROM public.showcase_items WHERE id = p_item_id AND deleted_at IS NULL FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy mẫu.'; END IF;

  PERFORM set_config('nvg.showcase', 'on', true);
  -- Giám đốc tự quyết: xoá ngay.
  IF public.auth_is_director() THEN
    UPDATE public.showcase_items
       SET deleted_at = now(), deletion_reason = btrim(p_reason),
           deletion_requested_at = COALESCE(deletion_requested_at, now()),
           deletion_requested_by = COALESCE(deletion_requested_by, v_user),
           updated_at = now(), updated_by = v_user
     WHERE id = p_item_id;
    PERFORM set_config('nvg.showcase', 'off', true);
    RETURN 'deleted';
  END IF;

  IF i.deletion_approval_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.approvals a WHERE a.id = i.deletion_approval_id AND a.status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'Mẫu này đang chờ Giám đốc đồng ý xoá.';
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by
  )
  VALUES (
    i.company_id, 'showcase_delete', 'showcase_items', i.id, i.sample_code,
    format('Xoá mẫu công trình — %s', i.title), NULL, btrim(p_reason), 'pending_approval', v_user
  )
  RETURNING id INTO v_approval;

  UPDATE public.showcase_items
     SET deletion_requested_at = now(), deletion_requested_by = v_user,
         deletion_reason = btrim(p_reason), deletion_approval_id = v_approval,
         updated_at = now(), updated_by = v_user
   WHERE id = p_item_id;
  PERFORM set_config('nvg.showcase', 'off', true);
  RETURN 'requested';
END;
$$;

REVOKE ALL ON FUNCTION public.request_showcase_deletion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_showcase_deletion(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.request_showcase_deletion(uuid, text) IS
  'Xoá mẫu công trình: Giám đốc xoá ngay; Thiết kế tạo đề nghị chờ Giám đốc đồng ý (0179). Trả deleted | requested.';

-- ----------------------------------------------------------------------------
-- 3. Link gửi khách
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.showcase_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  company_id     uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  item_ids       uuid[] NOT NULL CHECK (cardinality(item_ids) BETWEEN 1 AND 30),
  title          text,
  note           text,
  lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT showcase_shares_future CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS showcase_shares_creator_idx ON public.showcase_shares (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.showcase_share_views (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id  uuid NOT NULL REFERENCES public.showcase_shares(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS showcase_share_views_share_idx ON public.showcase_share_views (share_id, viewed_at DESC);

COMMENT ON TABLE public.showcase_shares IS
  'Link xem trực tuyến một bộ mẫu gửi khách (0179). Người gửi đặt thời hạn (bắt buộc), thu hồi sớm được. Trang công khai đọc qua showcase_public.';

CREATE OR REPLACE FUNCTION public.showcase_shares_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.auth_user_id();
    NEW.created_at := now();
    NEW.revoked_at := NULL;
    NEW.token := encode(extensions.gen_random_bytes(18), 'hex');
    IF NEW.expires_at > now() + interval '366 days' THEN
      RAISE EXCEPTION 'Thời hạn link tối đa một năm.';
    END IF;
    RETURN NEW;
  END IF;
  -- Sửa: chỉ thu hồi hoặc rút ngắn / gia hạn trong một năm; không đổi bộ mẫu hay mã link.
  NEW.token := OLD.token;
  NEW.item_ids := OLD.item_ids;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;
  IF NEW.expires_at > OLD.created_at + interval '366 days' THEN
    RAISE EXCEPTION 'Thời hạn link tối đa một năm.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS showcase_shares_guard ON public.showcase_shares;
CREATE TRIGGER showcase_shares_guard
  BEFORE INSERT OR UPDATE ON public.showcase_shares
  FOR EACH ROW EXECUTE FUNCTION public.showcase_shares_guard();

ALTER TABLE public.showcase_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_share_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.showcase_shares FROM anon;
REVOKE ALL ON public.showcase_share_views FROM anon, authenticated;

-- Gửi link: Kinh doanh (xem CRM) và lãnh đạo; Kiểm soát nội bộ chỉ xem.
DROP POLICY IF EXISTS showcase_shares_select ON public.showcase_shares;
CREATE POLICY showcase_shares_select ON public.showcase_shares
  FOR SELECT TO authenticated
  USING (created_by = public.auth_user_id()
         OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KSNB'));

DROP POLICY IF EXISTS showcase_shares_insert ON public.showcase_shares;
CREATE POLICY showcase_shares_insert ON public.showcase_shares
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.auth_is_read_only()
              AND (public.auth_can_view_module('CRM') OR public.auth_manages_all_companies()));

DROP POLICY IF EXISTS showcase_shares_update ON public.showcase_shares;
CREATE POLICY showcase_shares_update ON public.showcase_shares
  FOR UPDATE TO authenticated
  USING (created_by = public.auth_user_id() OR public.auth_manages_all_companies())
  WITH CHECK (created_by = public.auth_user_id() OR public.auth_manages_all_companies());

GRANT SELECT, INSERT, UPDATE ON public.showcase_shares TO authenticated;
GRANT SELECT ON public.showcase_share_views TO authenticated;

DROP POLICY IF EXISTS showcase_share_views_select ON public.showcase_share_views;
CREATE POLICY showcase_share_views_select ON public.showcase_share_views
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.showcase_shares s WHERE s.id = share_id));

-- ----------------------------------------------------------------------------
-- 4. Dữ liệu cho trang công khai — chỉ Worker (khoá service) gọi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.showcase_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v_items jsonb;
BEGIN
  SELECT sh.*, u.full_name AS sender_name, u.phone AS sender_phone, c.short_name AS company_name
    INTO s
    FROM public.showcase_shares sh
    LEFT JOIN public.users u ON u.id = sh.created_by
    LEFT JOIN public.companies c ON c.id = sh.company_id
   WHERE sh.token = p_token;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF s.revoked_at IS NOT NULL OR s.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  INSERT INTO public.showcase_share_views (share_id) VALUES (s.id);

  -- Chỉ các cột trưng bày — không giá, không danh tính chủ nhà, không liên kết hồ sơ nội bộ.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'sample_code', i.sample_code, 'title', i.title, 'kind', i.kind,
           'style', i.style, 'floors', i.floors, 'bedrooms', i.bedrooms,
           'land_area', i.land_area, 'frontage', i.frontage, 'depth', i.depth,
           'building_area', i.building_area, 'span', i.span,
           'location_area', i.location_area, 'completed_year', i.completed_year,
           'description', i.description, 'cover_media_id', i.cover_media_id,
           'media', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'id', m.id, 'path', m.storage_path, 'kind', m.kind, 'caption', m.caption)
                     ORDER BY m.sort_order, m.created_at)
                   FROM public.showcase_media m WHERE m.item_id = i.id), '[]'::jsonb)
         ) ORDER BY array_position(s.item_ids, i.id)), '[]'::jsonb)
    INTO v_items
    FROM public.showcase_items i
   WHERE i.id = ANY (s.item_ids) AND i.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'status', 'ok',
    'title', s.title,
    'note', s.note,
    'expires_at', s.expires_at,
    'sender_name', s.sender_name,
    'sender_phone', s.sender_phone,
    'company_name', s.company_name,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.showcase_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.showcase_public(text) TO service_role;
COMMENT ON FUNCTION public.showcase_public(text) IS
  'Trang xem mẫu công khai (Worker gọi bằng khoá service): link hợp lệ thì trả mẫu + đường dẫn ảnh và ghi một lượt xem (0179).';

-- ----------------------------------------------------------------------------
-- 5. decide_approval — chép nguyên bản 0175, thêm nhánh xoá mẫu công trình
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
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179).';
