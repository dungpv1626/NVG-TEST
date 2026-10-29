-- ============================================================================
-- 0241 — Thi công theo phiếu khảo sát công trường: T1 + T2 (doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md).
--
-- T1. ĐỀ XUẤT PHÁT SINH LẬP TỪ CÔNG TRƯỜNG (`site_change_proposals`)
--   Trước 0241 phát sinh chỉ có ở tab Phát sinh của hợp đồng (`contract_amendments`, HD-04), mà Thi công
--   KHÔNG xem phân hệ Hợp đồng (chủ dự án giữ nguyên quyền). Nay:
--   · chỉ huy trưởng lập đề xuất trên điện thoại: nguyên nhân, mô tả, vị trí / hạng mục, ảnh + số đo hiện
--     trạng, khối lượng ước tính (numeric + đơn vị), ảnh hưởng tiến độ (ngày). Bảng KHÔNG có cột tiền nào;
--   · gửi xong báo người chịu trách nhiệm hợp đồng (Kinh doanh / Dự án) — chưa có hợp đồng thì báo người
--     phê duyệt Hợp đồng của pháp nhân; họ «Lập phát sinh» → một dòng `contract_amendments` (luồng có sẵn:
--     báo giá → phê duyệt → khách xác nhận → phụ lục 0229), giữ liên kết hai chiều;
--   · Thi công thấy trạng thái + ai đang giữ qua `site_change_proposal_states` (SECURITY DEFINER, chỉ cột
--     KHÔNG có tiền, kiểm `rls_site_readable` — cùng mẫu `contracts_awaiting_site` 0230);
--   · «Khẩn cấp — đã làm trước» (anh Dũng chốt): người cho phép phải có quyền CAO HƠN chỉ huy trưởng —
--     Trưởng phòng Thi công (vai trò không giới hạn công trường, có quyền phê duyệt TC) hoặc Ban Giám đốc.
--     Người cho phép TỰ ghi nhận (`authorize_site_change_emergency`); trigger chặn mọi đường khác, nên chỉ
--     huy trưởng không tự cho phép mình, cũng không ghi tên sếp thay sếp;
--   · thời hạn xử lý của văn phòng: `sla_definitions` loại `site_change_proposal` (bảng CỐ Ý rỗng — 0113;
--     chưa khai thì không có đồng hồ). Đề xuất hiện ở «Theo dõi đề nghị» (`site_request_tracker`) và «Thúc»
--     được khi văn phòng đang giữ.
--
-- T2. TỒN TẠI CÓ NGƯỜI XỬ LÝ VÀ HẠN (`site_issues`)
--   Trước 0241 tồn tại chỉ là ô chữ `acceptance_records.outstanding_issues`. Nay mỗi tồn tại một dòng: công
--   trình, biên bản nghiệm thu / mốc (tuỳ chọn), hạng mục, mô tả, ảnh trước, người xử lý (tổ đội của công trình
--   HOẶC người Thi công), hạn (tham số `tc.issue_fix_days` để TRỐNG = không hạn mặc định). Đóng phải có ảnh
--   sau sửa; máy ghi người + giờ đóng; dòng đã đóng bất biến. Quá hạn hiện ở «Cần chú ý» của
--   `tc_site_board()`. Anh Dũng chốt: tồn tại CHỈ CẢNH BÁO, không chặn bàn giao — nên KHÔNG thêm vào
--   `stage_readiness` (mọi dòng met = false ở đó đều bị trigger dùng để chặn đổi bước); giao diện cảnh báo.
--
-- Chạy lại được: CREATE … IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Ai có quyền CAO HƠN chỉ huy trưởng trên một pháp nhân
--
-- Dấu hiệu là dữ liệu, không phải tên vai trò: vai trò KHÔNG giới hạn công trường (`roles.site_scoped`,
-- CLAUDE.md 3.4) và có quyền phê duyệt phân hệ TC — hiện là TC (Trưởng phòng Thi công), TGĐ, CFO, BGĐ.
-- Quản trị hệ thống có đủ quyền kỹ thuật nhưng không phải cấp quản lý thi công — loại ra.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_site_superior(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.roles r ON r.id = uc.role_id
      JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'TC' AND pm.can_approve
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE uc.user_id = p_user_id AND uc.deleted_at IS NULL
       AND (uc.company_id = p_company_id OR r.sees_all_companies)
       AND NOT r.site_scoped
       AND r.code::text <> 'ADMIN'
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_site_superior(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_site_superior(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.user_is_site_superior(uuid, uuid) IS
  'Người có quyền cao hơn chỉ huy trưởng trên pháp nhân (vai trò không giới hạn công trường + phê duyệt TC, trừ Quản trị) — 0241.';

-- Ô chọn «người cho phép làm trước» trên điện thoại.
CREATE OR REPLACE FUNCTION public.site_change_authorizer_candidates(p_company_id uuid)
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.id, u.full_name::text
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
   WHERE public.rls_company_access(p_company_id)
     AND u.id <> public.auth_user_id()
     AND public.user_is_site_superior(u.id, p_company_id)
   ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.site_change_authorizer_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_change_authorizer_candidates(uuid) TO authenticated;


-- ============================================================================
-- T1. Đề xuất phát sinh từ công trường
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_change_proposals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  construction_site_id    uuid NOT NULL REFERENCES public.construction_sites (id) ON DELETE CASCADE,
  -- Chép từ công trình lúc lập (trigger) — không lấy từ trình duyệt.
  contract_id             uuid REFERENCES public.contracts (id) ON DELETE SET NULL,
  code                    varchar(40),
  cause                   text NOT NULL CHECK (cause IN ('chu_dau_tu', 'thiet_ke', 'hien_truong', 'khac')),
  description             text NOT NULL CHECK (btrim(description) <> ''),
  location                text,
  measurements            text,
  estimated_quantity      numeric CHECK (estimated_quantity IS NULL OR estimated_quantity >= 0),
  quantity_unit           varchar(32),
  schedule_impact_days    integer CHECK (schedule_impact_days IS NULL OR schedule_impact_days BETWEEN -3650 AND 3650),
  photo_paths             text[] NOT NULL DEFAULT '{}',

  is_emergency            boolean NOT NULL DEFAULT false,
  emergency_requested_to  uuid REFERENCES public.users (id) ON DELETE SET NULL,
  emergency_authorized_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  emergency_authorized_at timestamptz,
  emergency_note          text,

  -- Trạng thái RIÊNG của đề xuất. Trạng thái hiển thị (đang lập báo giá, chờ khách…) suy từ phát sinh
  -- đã lập — xem `site_change_proposal_states`.
  status                  text NOT NULL DEFAULT 'da_gui' CHECK (status IN ('da_gui', 'da_chuyen', 'tu_choi')),
  amendment_id            uuid UNIQUE REFERENCES public.contract_amendments (id) ON DELETE SET NULL,
  converted_at            timestamptz,
  converted_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  rejected_at             timestamptz,
  rejected_by             uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reject_reason           text,

  client_created_at       timestamptz,
  client_generated_id     uuid UNIQUE,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES public.users (id) ON DELETE SET NULL,
  deleted_at              timestamptz,

  CONSTRAINT site_change_proposals_emergency_flag
    CHECK (is_emergency OR (emergency_authorized_by IS NULL AND emergency_requested_to IS NULL)),
  CONSTRAINT site_change_proposals_converted
    CHECK ((status = 'da_chuyen') = (converted_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS site_change_proposals_code_unique
  ON public.site_change_proposals (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS site_change_proposals_site_idx
  ON public.site_change_proposals (construction_site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS site_change_proposals_contract_idx
  ON public.site_change_proposals (contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON TABLE public.site_change_proposals IS
  'Đề xuất phát sinh lập từ công trường (T1, 0241). Không có cột tiền — giá nằm ở contract_amendments, Thi công không đọc.';

ALTER TABLE public.contract_amendments
  ADD COLUMN IF NOT EXISTS site_change_proposal_id uuid
    REFERENCES public.site_change_proposals (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contract_amendments_site_change_proposal_unique
  ON public.contract_amendments (site_change_proposal_id) WHERE site_change_proposal_id IS NOT NULL;

COMMENT ON COLUMN public.contract_amendments.site_change_proposal_id IS
  'Đề xuất phát sinh của công trường đã chuyển thành phát sinh này (0241) — chiều ngược của site_change_proposals.amendment_id.';

SELECT public.attach_audit_touch('public.site_change_proposals');

-- --- Trước khi ghi ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_change_proposals_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       record;
  v_user  uuid := public.auth_user_id();
  v_path  text;
  v_internal boolean := coalesce(current_setting('nvg.site_change_internal', true), '') = 'on';
  -- Cột người cho phép tự ghi được sau khi đề xuất đã chuyển / bị từ chối.
  v_auth_cols text[] := ARRAY['emergency_authorized_by', 'emergency_authorized_at', 'emergency_note',
                              'updated_at', 'updated_by'];
  v_decision_cols text[] := ARRAY['status', 'amendment_id', 'converted_at', 'converted_by',
                                  'rejected_at', 'rejected_by', 'reject_reason'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;
    IF NOT FOUND OR s.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Không tìm thấy công trình của đề xuất phát sinh.';
    END IF;
    NEW.company_id  := s.company_id;
    NEW.contract_id := s.contract_id;
    IF NEW.code IS NULL THEN
      NEW.code := public.issue_record_code(
        (SELECT c.code FROM public.companies c WHERE c.id = s.company_id), 'DXPS');
    END IF;
    IF v_user IS NOT NULL THEN
      NEW.status := 'da_gui';
      NEW.amendment_id := NULL;
      NEW.converted_at := NULL; NEW.converted_by := NULL;
      NEW.rejected_at := NULL;  NEW.rejected_by := NULL; NEW.reject_reason := NULL;
      NEW.created_by := v_user;
      NEW.synced_at := now();
    END IF;
  ELSE
    IF NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Công trình, hợp đồng, mã và người lập của đề xuất phát sinh không đổi được.';
    END IF;
    SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;

    -- Quyết định (chuyển thành phát sinh / từ chối) chỉ qua hàm nghiệp vụ.
    IF v_user IS NOT NULL AND NOT v_internal
       AND (to_jsonb(NEW) - ARRAY(SELECT jsonb_object_keys(to_jsonb(NEW)) EXCEPT SELECT unnest(v_decision_cols)))
           IS DISTINCT FROM
           (to_jsonb(OLD) - ARRAY(SELECT jsonb_object_keys(to_jsonb(OLD)) EXCEPT SELECT unnest(v_decision_cols))) THEN
      RAISE EXCEPTION 'Trạng thái đề xuất phát sinh chỉ đổi qua «Lập phát sinh» hoặc «Từ chối» của văn phòng.';
    END IF;

    -- Đã chuyển / bị từ chối: nội dung khoá; chỉ còn ghi nhận người cho phép làm trước.
    IF v_user IS NOT NULL AND NOT v_internal AND OLD.status <> 'da_gui'
       AND (to_jsonb(NEW) - v_auth_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_auth_cols) THEN
      RAISE EXCEPTION 'Đề xuất đã được văn phòng xử lý — không sửa được nội dung. Cần thay đổi thì lập đề xuất mới.';
    END IF;
  END IF;

  -- Ảnh phải nằm dưới thư mục của đúng công trình (như nhật ký, bảo hành — 0135, 0193).
  FOREACH v_path IN ARRAY coalesce(NEW.photo_paths, '{}') LOOP
    IF v_path IS NULL OR left(v_path, length(NEW.construction_site_id::text) + 1) <> NEW.construction_site_id::text || '/' THEN
      RAISE EXCEPTION 'Ảnh đính kèm không thuộc công trình của đề xuất phát sinh này.';
    END IF;
  END LOOP;

  -- Khẩn cấp: người được xin phép phải là cấp cao hơn chỉ huy trưởng.
  IF NEW.emergency_requested_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.emergency_requested_to IS DISTINCT FROM OLD.emergency_requested_to)
     AND NOT public.user_is_site_superior(NEW.emergency_requested_to, NEW.company_id) THEN
    RAISE EXCEPTION 'Người cho phép làm trước phải là Trưởng phòng Thi công hoặc Ban Giám đốc.';
  END IF;

  -- Người cho phép: chính người đó tự ghi nhận, và phải có quyền cao hơn chỉ huy trưởng. Chỉ huy trưởng
  -- không tự cho phép mình, cũng không ghi tên người khác thay họ (anh Dũng chốt, câu 2).
  IF (TG_OP = 'INSERT' AND NEW.emergency_authorized_by IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.emergency_authorized_by IS DISTINCT FROM OLD.emergency_authorized_by) THEN
    IF NEW.emergency_authorized_by IS NULL THEN
      RAISE EXCEPTION 'Đã ghi nhận người cho phép làm trước — không gỡ được.';
    END IF;
    IF NOT NEW.is_emergency THEN
      RAISE EXCEPTION 'Chỉ đề xuất khẩn cấp mới cần người cho phép làm trước.';
    END IF;
    IF v_user IS NOT NULL AND NEW.emergency_authorized_by IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'Người cho phép làm trước phải tự ghi nhận trên hệ thống — không ghi thay được.';
    END IF;
    IF NOT public.user_is_site_superior(NEW.emergency_authorized_by, NEW.company_id) THEN
      RAISE EXCEPTION 'Chỉ Trưởng phòng Thi công hoặc Ban Giám đốc cho phép làm trước được — chỉ huy trưởng không tự cho phép.';
    END IF;
    NEW.emergency_authorized_at := now();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.emergency_authorized_at := OLD.emergency_authorized_at;
  ELSE
    NEW.emergency_authorized_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_emergency AND NOT NEW.is_emergency AND OLD.emergency_authorized_by IS NOT NULL THEN
    RAISE EXCEPTION 'Đề xuất đã được cho phép làm trước — không bỏ cờ khẩn cấp được.';
  END IF;

  IF v_user IS NOT NULL THEN
    NEW.updated_by := v_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_change_proposals_guard ON public.site_change_proposals;
CREATE TRIGGER site_change_proposals_guard
  BEFORE INSERT OR UPDATE ON public.site_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.site_change_proposals_guard();

-- --- Người văn phòng đang giữ đề xuất -----------------------------------------------------------
-- Có hợp đồng: người chịu trách nhiệm hợp đồng. Chưa có (hoặc hợp đồng chưa ai chịu trách nhiệm): người
-- phê duyệt Hợp đồng của pháp nhân — Ban Giám đốc.
CREATE OR REPLACE FUNCTION public._site_change_office_holders(p_company_id uuid, p_contract_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ARRAY[c.responsible_user_id] FROM public.contracts c
      JOIN public.users u ON u.id = c.responsible_user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE c.id = p_contract_id AND c.deleted_at IS NULL),
    (SELECT array_agg(DISTINCT u.id ORDER BY u.id)
       FROM public.users u
       JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
       JOIN public.roles r ON r.id = uc.role_id
       JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'HD' AND pm.can_approve
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = p_company_id OR r.sees_all_companies)
        AND r.code::text NOT IN ('ADMIN', 'KSNB')),
    '{}'::uuid[]
  );
$$;

REVOKE ALL ON FUNCTION public._site_change_office_holders(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- --- Sau khi gửi: báo văn phòng, báo người được xin phép ------------------------------------------
CREATE OR REPLACE FUNCTION public.site_change_proposals_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s     record;
  u     uuid;
  v_url text;
  v_me  uuid := public.auth_user_id();
BEGIN
  SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;

  IF TG_OP = 'INSERT' THEN
    v_url := CASE WHEN NEW.contract_id IS NOT NULL
                  THEN format('/hd/hop-dong/%s?tab=phat-sinh', NEW.contract_id)
                  ELSE format('/tc/cong-trinh/%s?tab=phat-sinh', NEW.construction_site_id) END;
    FOREACH u IN ARRAY public._site_change_office_holders(NEW.company_id, NEW.contract_id) LOOP
      CONTINUE WHEN u IS NOT DISTINCT FROM v_me;
      PERFORM public.create_notification(
        u, NEW.company_id, 'site_change_proposed',
        format('Công trường %s đề xuất phát sinh %s%s: %s', s.code, NEW.code,
               CASE WHEN NEW.is_emergency THEN ' (khẩn cấp — đã làm trước)' ELSE '' END,
               left(NEW.description, 120)),
        'site_change_proposals', NEW.id, v_url);
    END LOOP;
  END IF;

  IF NEW.emergency_requested_to IS NOT NULL AND NEW.emergency_authorized_by IS NULL
     AND NEW.emergency_requested_to IS DISTINCT FROM v_me
     AND (TG_OP = 'INSERT' OR NEW.emergency_requested_to IS DISTINCT FROM OLD.emergency_requested_to) THEN
    PERFORM public.create_notification(
      NEW.emergency_requested_to, NEW.company_id, 'site_change_emergency_request',
      format('Công trường %s xin xác nhận đã cho phép làm trước phát sinh %s: %s', s.code, NEW.code,
             left(NEW.description, 120)),
      'site_change_proposals', NEW.id,
      format('/tc/cong-trinh/%s?tab=phat-sinh', NEW.construction_site_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_change_proposals_notify ON public.site_change_proposals;
CREATE TRIGGER site_change_proposals_notify
  AFTER INSERT OR UPDATE OF emergency_requested_to ON public.site_change_proposals
  FOR EACH ROW EXECUTE FUNCTION public.site_change_proposals_notify();

-- --- Ai đọc, ai ghi ------------------------------------------------------------------------------
ALTER TABLE public.site_change_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_change_proposals FROM anon;
REVOKE DELETE ON public.site_change_proposals FROM authenticated;

DROP POLICY IF EXISTS site_change_proposals_select ON public.site_change_proposals;
CREATE POLICY site_change_proposals_select ON public.site_change_proposals
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.rls_site_readable(construction_site_id)
         OR (contract_id IS NOT NULL AND public.rls_contract_readable(contract_id)))
  );

DROP POLICY IF EXISTS site_change_proposals_insert ON public.site_change_proposals;
CREATE POLICY site_change_proposals_insert ON public.site_change_proposals
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id) AND NOT public.auth_is_read_only());

-- Sửa nội dung / xoá mềm: người thao tác được công trình, khi văn phòng chưa xử lý (trigger khoá phần còn lại).
DROP POLICY IF EXISTS site_change_proposals_update ON public.site_change_proposals;
CREATE POLICY site_change_proposals_update ON public.site_change_proposals
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND status = 'da_gui' AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

-- Văn phòng xem ảnh hiện trạng của đề xuất (Kinh doanh không xem phân hệ Thi công): đúng tệp nằm trong
-- một đề xuất mà người đó đọc được qua hợp đồng.
DROP POLICY IF EXISTS construction_photos_select_change_proposal ON storage.objects;
CREATE POLICY construction_photos_select_change_proposal ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'construction-photos'
    AND EXISTS (
      SELECT 1 FROM public.site_change_proposals p
       WHERE p.deleted_at IS NULL
         AND p.construction_site_id = public.try_uuid((storage.foldername(name))[1])
         AND name = ANY (p.photo_paths)
         AND p.contract_id IS NOT NULL
         AND public.rls_contract_readable(p.contract_id)
    )
  );

-- --- Người có quyền cao hơn ghi nhận đã cho phép làm trước -------------------------------------
CREATE OR REPLACE FUNCTION public.authorize_site_change_emergency(p_proposal_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  p    record;
  a    record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO p FROM public.site_change_proposals WHERE id = p_proposal_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT (public.rls_site_readable(p.construction_site_id)
                       OR (p.contract_id IS NOT NULL AND public.rls_contract_readable(p.contract_id))) THEN
    RAISE EXCEPTION 'Không tìm thấy đề xuất phát sinh, hoặc tài khoản không được xem đề xuất này.';
  END IF;
  IF NOT p.is_emergency THEN
    RAISE EXCEPTION 'Đề xuất này không phải trường hợp khẩn cấp.';
  END IF;
  IF p.emergency_authorized_by IS NOT NULL THEN
    RAISE EXCEPTION 'Đã ghi nhận người cho phép làm trước.';
  END IF;
  IF public.auth_is_read_only() OR NOT public.user_is_site_superior(v_me, p.company_id) THEN
    RAISE EXCEPTION 'Chỉ Trưởng phòng Thi công hoặc Ban Giám đốc cho phép làm trước được — chỉ huy trưởng không tự cho phép.';
  END IF;

  UPDATE public.site_change_proposals
     SET emergency_authorized_by = v_me,
         emergency_note = COALESCE(NULLIF(btrim(p_note), ''), emergency_note)
   WHERE id = p_proposal_id;

  -- Đã chuyển thành phát sinh mà phát sinh còn ở «Đề xuất»: mang người cho phép sang (HD-04 cho phát sinh
  -- khẩn cấp «Ghi nhận đã thực hiện» rồi hoàn thiện hồ sơ sau).
  IF p.amendment_id IS NOT NULL THEN
    SELECT * INTO a FROM public.contract_amendments WHERE id = p.amendment_id AND deleted_at IS NULL;
    IF FOUND AND a.stage = 'de_xuat' AND NOT a.is_emergency THEN
      UPDATE public.contract_amendments
         SET is_emergency = true, emergency_authorized_by = v_me,
             emergency_reason = COALESCE(NULLIF(btrim(p_note), ''), 'Làm trước tại công trường, hồ sơ hoàn thiện sau'),
             updated_at = now(), updated_by = v_me
       WHERE id = a.id;
    END IF;
  END IF;

  IF p.created_by IS NOT NULL AND p.created_by <> v_me THEN
    PERFORM public.create_notification(
      p.created_by, p.company_id, 'site_change_emergency_authorized',
      format('Đã cho phép làm trước phát sinh %s — hồ sơ hoàn thiện sau.', p.code),
      'site_change_proposals', p.id, format('/tc/cong-trinh/%s?tab=phat-sinh', p.construction_site_id));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_site_change_emergency(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_site_change_emergency(uuid, text) TO authenticated;

-- --- Văn phòng chuyển đề xuất thành phát sinh hợp đồng ------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_site_change_proposal(p_proposal_id uuid, p_title text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := public.auth_user_id();
  p       record;
  s       record;
  v_id    uuid;
  v_cause text;
  v_content text;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO p FROM public.site_change_proposals WHERE id = p_proposal_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề xuất phát sinh.';
  END IF;
  IF p.contract_id IS NULL THEN
    RAISE EXCEPTION 'Công trình chưa gắn hợp đồng — chưa lập phát sinh hợp đồng được. Gắn hợp đồng cho công trình trước.';
  END IF;
  -- Cùng điều kiện chính sách ghi `contract_amendments` (0027, 0157): người chịu trách nhiệm hợp đồng.
  IF NOT public.rls_contract_writable(p.contract_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng (Kinh doanh / Dự án) lập phát sinh được.';
  END IF;
  IF p.status <> 'da_gui' THEN
    RAISE EXCEPTION 'Đề xuất này đã được xử lý.';
  END IF;

  SELECT * INTO s FROM public.construction_sites WHERE id = p.construction_site_id;
  v_cause := CASE p.cause
    WHEN 'chu_dau_tu' THEN 'Chủ đầu tư yêu cầu'
    WHEN 'thiet_ke' THEN 'Thiết kế thay đổi'
    WHEN 'hien_truong' THEN 'Hiện trường khác hồ sơ'
    ELSE 'Khác' END;
  v_content := concat_ws(E'\n',
    p.description,
    CASE WHEN NULLIF(btrim(p.location), '') IS NOT NULL THEN 'Vị trí / hạng mục: ' || btrim(p.location) END,
    CASE WHEN NULLIF(btrim(p.measurements), '') IS NOT NULL THEN 'Số đo hiện trạng: ' || btrim(p.measurements) END,
    CASE WHEN p.estimated_quantity IS NOT NULL
         THEN 'Khối lượng ước tính: ' || trim_scale(p.estimated_quantity)::text || COALESCE(' ' || p.quantity_unit, '') END,
    format('Đề xuất từ công trường %s (%s).', s.code, p.code));

  PERFORM set_config('nvg.site_change_internal', 'on', true);

  INSERT INTO public.contract_amendments (
    company_id, contract_id, title, content, reason, value_change, schedule_impact_days,
    is_emergency, emergency_authorized_by, emergency_reason,
    requested_by, requested_at, site_change_proposal_id, created_by, updated_by
  ) VALUES (
    p.company_id, p.contract_id,
    COALESCE(NULLIF(btrim(p_title), ''), 'Phát sinh từ công trường — ' || left(p.description, 80)),
    v_content, v_cause, 0,
    CASE WHEN p.schedule_impact_days IS NOT NULL THEN p.schedule_impact_days::text END,
    p.emergency_authorized_by IS NOT NULL, p.emergency_authorized_by,
    CASE WHEN p.emergency_authorized_by IS NOT NULL
         THEN COALESCE(NULLIF(btrim(p.emergency_note), ''), 'Làm trước tại công trường, hồ sơ hoàn thiện sau') END,
    COALESCE(p.created_by, v_me), p.created_at, p.id, v_me, v_me
  )
  RETURNING id INTO v_id;

  UPDATE public.site_change_proposals
     SET status = 'da_chuyen', amendment_id = v_id, converted_at = now(), converted_by = v_me
   WHERE id = p.id;

  PERFORM set_config('nvg.site_change_internal', 'off', true);

  IF p.created_by IS NOT NULL AND p.created_by <> v_me THEN
    PERFORM public.create_notification(
      p.created_by, p.company_id, 'site_change_converted',
      format('Đề xuất phát sinh %s đã được văn phòng tiếp nhận — đang lập báo giá phát sinh.', p.code),
      'site_change_proposals', p.id, format('/tc/cong-trinh/%s?tab=phat-sinh', p.construction_site_id));
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_site_change_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_site_change_proposal(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_site_change_proposal(p_proposal_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public.auth_user_id();
  p    record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO p FROM public.site_change_proposals WHERE id = p_proposal_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề xuất phát sinh.';
  END IF;
  IF NOT ((p.contract_id IS NOT NULL AND public.rls_contract_writable(p.contract_id))
          OR (NOT public.auth_is_read_only() AND public.rls_company_access(p.company_id)
              AND public.auth_can_approve_module('HD'))) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc Ban Giám đốc từ chối đề xuất được.';
  END IF;
  IF p.status <> 'da_gui' THEN
    RAISE EXCEPTION 'Đề xuất này đã được xử lý.';
  END IF;
  IF NULLIF(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Ghi lý do không lập phát sinh (ví dụ: nằm trong phạm vi hợp đồng đã ký).';
  END IF;

  PERFORM set_config('nvg.site_change_internal', 'on', true);
  UPDATE public.site_change_proposals
     SET status = 'tu_choi', rejected_at = now(), rejected_by = v_me, reject_reason = btrim(p_reason)
   WHERE id = p.id;
  PERFORM set_config('nvg.site_change_internal', 'off', true);

  IF p.created_by IS NOT NULL AND p.created_by <> v_me THEN
    PERFORM public.create_notification(
      p.created_by, p.company_id, 'site_change_rejected',
      format('Đề xuất phát sinh %s không lập phát sinh: %s', p.code, btrim(p_reason)),
      'site_change_proposals', p.id, format('/tc/cong-trinh/%s?tab=phat-sinh', p.construction_site_id));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_site_change_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_site_change_proposal(uuid, text) TO authenticated;

-- --- Phát sinh đổi bước → báo người lập đề xuất -------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_amendments_notify_site_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p     record;
  v_msg text;
BEGIN
  IF NEW.site_change_proposal_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage
     AND NEW.customer_confirmed_at IS NOT DISTINCT FROM OLD.customer_confirmed_at THEN
    RETURN NEW;
  END IF;
  SELECT * INTO p FROM public.site_change_proposals WHERE id = NEW.site_change_proposal_id;
  IF NOT FOUND OR p.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  v_msg := CASE
    WHEN NEW.stage = 'cho_duyet' THEN 'đã gửi Ban Giám đốc phê duyệt'
    WHEN NEW.stage = 'da_duyet' AND NEW.customer_confirmed_at IS NULL THEN 'đã được duyệt — chờ khách xác nhận'
    WHEN NEW.stage = 'da_duyet' THEN 'khách đã xác nhận'
    WHEN NEW.stage = 'da_thuc_hien' THEN 'đã hoàn tất — phụ lục đã ký, ghi nhận thực hiện'
    WHEN NEW.stage = 'tu_choi' THEN 'không thực hiện'
  END;
  IF v_msg IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.create_notification(
    p.created_by, p.company_id, 'site_change_progress',
    format('Đề xuất phát sinh %s %s.', p.code, v_msg),
    'site_change_proposals', p.id, format('/tc/cong-trinh/%s?tab=phat-sinh', p.construction_site_id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_amendments_notify_site_change ON public.contract_amendments;
CREATE TRIGGER contract_amendments_notify_site_change
  AFTER UPDATE ON public.contract_amendments
  FOR EACH ROW EXECUTE FUNCTION public.contract_amendments_notify_site_change();

-- --- Thi công xem trạng thái + ai giữ — KHÔNG có cột tiền -----------------------------------------
-- display_status: da_gui (văn phòng chưa tiếp nhận) · dang_bao_gia (phát sinh ở «Đề xuất» — đang lập báo
-- giá phát sinh) · cho_duyet · cho_khach (đã duyệt, chờ khách xác nhận) · da_duyet (khách đã xác nhận,
-- chờ ghi nhận thực hiện) · hoan_tat (đã thực hiện) · tu_choi.
CREATE OR REPLACE FUNCTION public.site_change_proposal_states(p_site_id uuid DEFAULT NULL)
RETURNS TABLE (
  proposal_id      uuid,
  site_id          uuid,
  company_id       uuid,
  display_status   text,
  is_closed        boolean,
  holder_kind      text,
  holder_label     text,
  holder_ids       uuid[],
  holder_names     text[],
  waiting_since    timestamptz,
  due_at           timestamptz,
  amendment_code   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.*,
           a.stage AS a_stage, a.code AS a_code, a.customer_confirmed_at AS a_confirmed,
           a.approved_at AS a_approved_at, a.is_emergency AS a_emergency, a.id AS a_id,
           c.responsible_user_id AS c_owner
      FROM public.site_change_proposals p
      LEFT JOIN public.contract_amendments a ON a.id = p.amendment_id AND a.deleted_at IS NULL
      LEFT JOIN public.contracts c ON c.id = p.contract_id
     WHERE p.deleted_at IS NULL
       AND (p_site_id IS NULL OR p.construction_site_id = p_site_id)
       -- Người gọi phải đọc được công trình (Mẫu E: chỉ huy trưởng chỉ thấy công trình được giao).
       AND public.rls_site_readable(p.construction_site_id)
  ),
  st AS (
    SELECT b.*,
      CASE
        WHEN b.status = 'tu_choi' THEN 'tu_choi'
        WHEN b.status = 'da_gui' THEN 'da_gui'
        WHEN b.a_id IS NULL THEN 'tu_choi'
        WHEN b.a_stage = 'tu_choi' THEN 'tu_choi'
        WHEN b.a_stage = 'da_thuc_hien' THEN 'hoan_tat'
        WHEN b.a_stage = 'de_xuat' THEN 'dang_bao_gia'
        WHEN b.a_stage = 'cho_duyet' THEN 'cho_duyet'
        WHEN b.a_stage = 'da_duyet' AND b.a_confirmed IS NULL THEN 'cho_khach'
        ELSE 'da_duyet'
      END AS ds,
      (SELECT ap.id FROM public.approvals ap
        WHERE ap.entity_type = 'contract_amendments' AND ap.entity_id = b.a_id
          AND ap.status = 'pending_approval' AND ap.deleted_at IS NULL
        ORDER BY ap.requested_at DESC LIMIT 1) AS appr_id
    FROM base b
  ),
  holder AS (
    SELECT st.*,
      CASE
        WHEN st.ds IN ('da_gui', 'dang_bao_gia', 'da_duyet') THEN public._site_change_office_holders(st.company_id, st.contract_id)
        WHEN st.ds = 'cho_khach' THEN public._site_change_office_holders(st.company_id, st.contract_id)
        ELSE '{}'::uuid[]
      END AS h_ids
    FROM st
  )
  SELECT
    h.id,
    h.construction_site_id,
    h.company_id,
    h.ds,
    h.ds IN ('hoan_tat', 'tu_choi'),
    CASE
      WHEN h.ds IN ('da_gui', 'dang_bao_gia', 'da_duyet') THEN 'office'
      WHEN h.ds = 'cho_duyet' THEN 'reviewer'
      WHEN h.ds = 'cho_khach' THEN 'external'
    END,
    CASE
      WHEN h.ds IN ('da_gui', 'dang_bao_gia', 'da_duyet') THEN
        CASE WHEN h.c_owner IS NOT NULL THEN 'Người chịu trách nhiệm hợp đồng' ELSE 'Ban Giám đốc' END
      WHEN h.ds = 'cho_duyet' THEN 'Người có hạn mức phê duyệt phát sinh'
      WHEN h.ds = 'cho_khach' THEN 'Khách hàng — văn phòng theo dõi xác nhận'
    END,
    h.h_ids,
    CASE
      WHEN h.ds = 'cho_duyet' AND h.appr_id IS NOT NULL THEN
        COALESCE((SELECT w.user_names FROM public.approval_waiting_on(h.appr_id) w LIMIT 1), '{}')
      ELSE COALESCE((SELECT array_agg(u.full_name::text ORDER BY u.full_name) FROM public.users u WHERE u.id = ANY (h.h_ids)), '{}')
    END,
    CASE
      WHEN h.ds = 'da_gui' THEN h.created_at
      WHEN h.ds = 'dang_bao_gia' THEN h.converted_at
      WHEN h.ds = 'cho_duyet' THEN (SELECT ap.requested_at FROM public.approvals ap WHERE ap.id = h.appr_id)
      WHEN h.ds IN ('cho_khach', 'da_duyet') THEN COALESCE(h.a_approved_at, h.converted_at)
    END,
    -- Thời hạn của văn phòng tính từ lúc công trường gửi, tới khi phát sinh được trình duyệt. Chưa khai
    -- (`sla_definitions` loại 'site_change_proposal' — CỐ Ý rỗng, 0113) thì RỖNG, không dựng số.
    CASE
      WHEN h.ds IN ('da_gui', 'dang_bao_gia') THEN
        h.created_at + make_interval(hours => public.sla_target_hours('site_change_proposal', h.company_id))
    END,
    h.a_code::text
  FROM holder h
  ORDER BY h.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.site_change_proposal_states(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_change_proposal_states(uuid) TO authenticated;

COMMENT ON FUNCTION public.site_change_proposal_states(uuid) IS
  'Trạng thái + người đang giữ của đề xuất phát sinh công trường (0241). Chỉ cột không có tiền; người gọi phải đọc được công trình.';

-- --- Theo dõi đề nghị (TC-10): thêm nguồn thứ ba ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_change_tracker(
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
    SELECT p.id AS proposal_id, p.code, p.description, p.construction_site_id, p.company_id,
           p.created_by, p.is_emergency, p.created_at,
           s.code AS s_code, s.name AS s_name,
           x.display_status, x.is_closed, x.holder_kind, x.holder_label, x.holder_ids,
           x.holder_names, x.waiting_since, x.due_at
      FROM public.site_change_proposal_states(p_site_id) x
      JOIN public.site_change_proposals p ON p.id = x.proposal_id
      JOIN public.construction_sites s ON s.id = p.construction_site_id
     WHERE (NOT p_mine_only OR p.created_by = public.auth_user_id())
  ),
  nudges AS (
    SELECT rr.entity_id, max(rr.nudged_at) AS last_at, count(*)::int AS n
      FROM public.request_reminders rr
     WHERE rr.entity_type = 'site_change_proposals' AND rr.entity_id IN (SELECT proposal_id FROM base)
     GROUP BY rr.entity_id
  )
  SELECT
    'site_change_proposals'::text,
    b.proposal_id,
    b.code::text,
    'Đề xuất phát sinh: ' || left(b.description, 100),
    b.construction_site_id,
    b.s_code::text,
    b.s_name,
    b.company_id,
    b.created_by,
    (SELECT full_name FROM public.users WHERE id = b.created_by),
    NULL::date,
    CASE WHEN b.is_emergency THEN 'gap' ELSE 'thuong' END,
    b.display_status,
    b.is_closed,
    b.holder_kind,
    b.holder_label,
    b.holder_ids,
    b.holder_names,
    b.waiting_since,
    b.due_at,
    NULL::date,
    n.last_at,
    COALESCE(n.n, 0),
    CASE WHEN n.last_at IS NOT NULL AND (SELECT hours FROM interval_param) IS NOT NULL
         THEN n.last_at + make_interval(hours => (SELECT hours FROM interval_param)::int)
    END,
    b.created_at
  FROM base b
  LEFT JOIN nudges n ON n.entity_id = b.proposal_id;
$$;

REVOKE ALL ON FUNCTION public.site_change_tracker(uuid, boolean) FROM PUBLIC, anon, authenticated;

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
    UNION ALL
    SELECT * FROM public.site_change_tracker(p_site_id, p_mine_only)
  ) t
  ORDER BY t.is_closed, t.needed_date NULLS LAST, t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.site_request_tracker(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_tracker(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.site_request_tracker(uuid, boolean) IS
  'TC-10: đề nghị mua, yêu cầu làm rõ (0154) và đề xuất phát sinh (0241) gắn công trình — bước, người giữ, chờ bao lâu, hạn, lịch sử thúc.';

-- «Thúc» — chép nguyên bản 0154, thêm loại 'site_change_proposals' (văn phòng đang giữ = 'office').
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
  IF p_entity_type IS DISTINCT FROM 'purchase_requests' AND p_entity_type IS DISTINCT FROM 'rfis'
     AND p_entity_type IS DISTINCT FROM 'site_change_proposals' THEN
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

  IF t.holder_kind IS NULL OR t.holder_kind NOT IN ('approver', 'purchasing', 'answerer', 'office') THEN
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
    WHEN p_entity_type = 'site_change_proposals' THEN
      COALESCE((SELECT format('/hd/hop-dong/%s?tab=phat-sinh', p.contract_id)
                  FROM public.site_change_proposals p
                 WHERE p.id = p_entity_id AND p.contract_id IS NOT NULL),
               format('/tc/cong-trinh/%s?tab=phat-sinh', t.site_id))
    WHEN t.holder_kind = 'approver' THEN '/viec-can-lam'
    ELSE '/mh/de-nghi-mua/' || p_entity_id::text
  END;
  v_msg := format('Công trường %s thúc %s %s «%s»%s.',
                  t.site_code,
                  CASE WHEN p_entity_type = 'rfis' THEN 'yêu cầu làm rõ'
                       WHEN p_entity_type = 'site_change_proposals' THEN 'đề xuất phát sinh'
                       ELSE 'đề nghị' END,
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

-- Lịch sử «Thúc» của đề xuất phát sinh: đọc theo đúng điều kiện đọc đề xuất.
DROP POLICY IF EXISTS request_reminders_select_site_change ON public.request_reminders;
CREATE POLICY request_reminders_select_site_change ON public.request_reminders
  FOR SELECT TO authenticated
  USING (
    entity_type = 'site_change_proposals'
    AND EXISTS (
      SELECT 1 FROM public.site_change_proposals p
       WHERE p.id = request_reminders.entity_id
         AND p.deleted_at IS NULL
         AND (public.rls_site_readable(p.construction_site_id)
              OR (p.contract_id IS NOT NULL AND public.rls_contract_readable(p.contract_id)))
    )
  );


-- ============================================================================
-- T2. Tồn tại có người xử lý và hạn
-- ============================================================================
INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'tc.issue_fix_days', 'global', NULL, 'Hạn khắc phục tồn tại (ngày)',
       'Số ngày từ lúc ghi tồn tại tới hạn khắc phục, khi người ghi không tự đặt hạn. Để trống = tồn tại không có hạn mặc định.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'tc.issue_fix_days' AND p.scope_type = 'global'
);

CREATE TABLE IF NOT EXISTS public.site_issues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites (id) ON DELETE CASCADE,
  acceptance_record_id  uuid REFERENCES public.acceptance_records (id) ON DELETE SET NULL,
  site_milestone_id     uuid REFERENCES public.site_milestones (id) ON DELETE SET NULL,
  code                  varchar(40),
  work_item             text,
  description           text NOT NULL CHECK (btrim(description) <> ''),
  before_photo_paths    text[] NOT NULL DEFAULT '{}',
  subcontractor_id      uuid REFERENCES public.subcontractors (id) ON DELETE SET NULL,
  assigned_user_id      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  due_date              date,
  status                text NOT NULL DEFAULT 'dang_mo' CHECK (status IN ('dang_mo', 'da_dong')),
  after_photo_paths     text[] NOT NULL DEFAULT '{}',
  close_note            text,
  closed_at             timestamptz,
  closed_by             uuid REFERENCES public.users (id) ON DELETE SET NULL,
  client_created_at     timestamptz,
  client_generated_id   uuid UNIQUE,
  synced_at             timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users (id) ON DELETE SET NULL,
  deleted_at            timestamptz,
  CONSTRAINT site_issues_one_assignee CHECK (subcontractor_id IS NULL OR assigned_user_id IS NULL),
  CONSTRAINT site_issues_closed CHECK ((status = 'da_dong') = (closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS site_issues_code_unique ON public.site_issues (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS site_issues_site_idx ON public.site_issues (construction_site_id, status, due_date);
CREATE INDEX IF NOT EXISTS site_issues_acceptance_idx ON public.site_issues (acceptance_record_id)
  WHERE acceptance_record_id IS NOT NULL;

COMMENT ON TABLE public.site_issues IS
  'Tồn tại cần khắc phục (T2, 0241): người xử lý (tổ đội hoặc người Thi công), hạn, ảnh trước / sau. Đã đóng thì bất biến. Chỉ cảnh báo, không chặn bàn giao.';

SELECT public.attach_audit_touch('public.site_issues');

CREATE OR REPLACE FUNCTION public.site_issues_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       record;
  v_user  uuid := public.auth_user_id();
  v_days  numeric;
  v_path  text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'da_dong' AND v_user IS NOT NULL THEN
    RAISE EXCEPTION 'Tồn tại đã đóng — không sửa được. Còn lỗi thì ghi một tồn tại mới.';
  END IF;

  SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy công trình của tồn tại.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.company_id := s.company_id;
    IF NEW.code IS NULL THEN
      NEW.code := public.issue_record_code(
        (SELECT c.code FROM public.companies c WHERE c.id = s.company_id), 'TT');
    END IF;
    IF NEW.due_date IS NULL THEN
      v_days := public.system_parameter_number('tc.issue_fix_days');
      IF v_days IS NOT NULL AND v_days > 0 THEN
        NEW.due_date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_days::int;
      END IF;
    END IF;
    IF v_user IS NOT NULL THEN
      NEW.status := 'dang_mo';
      NEW.closed_at := NULL;
      NEW.closed_by := NULL;
      NEW.after_photo_paths := '{}';
      NEW.created_by := v_user;
      NEW.synced_at := now();
    END IF;
  ELSE
    IF NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Công trình, mã và người ghi của tồn tại không đổi được.';
    END IF;
  END IF;

  IF NEW.acceptance_record_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.acceptance_record_id IS DISTINCT FROM OLD.acceptance_record_id)
     AND NOT EXISTS (SELECT 1 FROM public.acceptance_records a
                      WHERE a.id = NEW.acceptance_record_id AND a.construction_site_id = NEW.construction_site_id) THEN
    RAISE EXCEPTION 'Biên bản nghiệm thu không thuộc công trình của tồn tại này.';
  END IF;
  IF NEW.site_milestone_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.site_milestone_id IS DISTINCT FROM OLD.site_milestone_id)
     AND NOT EXISTS (SELECT 1 FROM public.site_milestones m
                      WHERE m.id = NEW.site_milestone_id AND m.construction_site_id = NEW.construction_site_id) THEN
    RAISE EXCEPTION 'Mốc thi công không thuộc công trình của tồn tại này.';
  END IF;
  IF NEW.subcontractor_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.subcontractor_id IS DISTINCT FROM OLD.subcontractor_id)
     AND NOT EXISTS (SELECT 1 FROM public.subcontractors sc
                      WHERE sc.id = NEW.subcontractor_id AND sc.construction_site_id = NEW.construction_site_id) THEN
    RAISE EXCEPTION 'Tổ đội được giao phải là tổ đội của công trình này.';
  END IF;
  IF v_user IS NOT NULL AND NEW.assigned_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.site_commander_candidates(NEW.company_id) c
                      WHERE c.id = NEW.assigned_user_id) THEN
    RAISE EXCEPTION 'Người xử lý tồn tại phải là người của Thi công.';
  END IF;

  FOREACH v_path IN ARRAY coalesce(NEW.before_photo_paths, '{}') || coalesce(NEW.after_photo_paths, '{}') LOOP
    IF v_path IS NULL OR left(v_path, length(s.id::text) + 1) <> s.id::text || '/' THEN
      RAISE EXCEPTION 'Ảnh đính kèm không thuộc công trình của tồn tại này.';
    END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- OLD.status = 'dang_mo' ở đây (đã đóng thì bị chặn ở đầu hàm).
    IF NEW.status = 'da_dong' THEN
      IF cardinality(NEW.after_photo_paths) = 0 THEN
        RAISE EXCEPTION 'Chụp ít nhất một ảnh sau khi khắc phục để đóng tồn tại.';
      END IF;
      IF NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Tồn tại đã xoá không đóng được.';
      END IF;
      NEW.closed_at := now();
      NEW.closed_by := v_user;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_user IS NOT NULL THEN
    NEW.closed_at := OLD.closed_at;
    NEW.closed_by := OLD.closed_by;
  END IF;

  IF v_user IS NOT NULL THEN
    NEW.updated_by := v_user;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_issues_guard ON public.site_issues;
CREATE TRIGGER site_issues_guard
  BEFORE INSERT OR UPDATE ON public.site_issues
  FOR EACH ROW EXECUTE FUNCTION public.site_issues_guard();

-- Báo người nội bộ được giao (không báo chính người tự giao cho mình). Tổ đội không có tài khoản.
CREATE OR REPLACE FUNCTION public.site_issues_notify_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NEW.assigned_user_id IS NULL
     OR NEW.assigned_user_id IS NOT DISTINCT FROM public.auth_user_id()
     OR (TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = NEW.construction_site_id;
  PERFORM public.create_notification(
    NEW.assigned_user_id, NEW.company_id, 'site_issue_assigned',
    format('Tồn tại %s — công trình %s: %s%s', NEW.code, s.code, left(NEW.description, 120),
           CASE WHEN NEW.due_date IS NOT NULL THEN ' · hạn ' || to_char(NEW.due_date, 'DD/MM/YYYY') ELSE '' END),
    'site_issues', NEW.id, format('/tc/cong-trinh/%s?tab=ton-tai', s.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_issues_notify_assignee ON public.site_issues;
CREATE TRIGGER site_issues_notify_assignee
  AFTER INSERT OR UPDATE OF assigned_user_id ON public.site_issues
  FOR EACH ROW EXECUTE FUNCTION public.site_issues_notify_assignee();

ALTER TABLE public.site_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_issues FROM anon;
REVOKE DELETE ON public.site_issues FROM authenticated;

DROP POLICY IF EXISTS site_issues_select ON public.site_issues;
CREATE POLICY site_issues_select ON public.site_issues
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

DROP POLICY IF EXISTS site_issues_insert ON public.site_issues;
CREATE POLICY site_issues_insert ON public.site_issues
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_site_writable(construction_site_id) AND NOT public.auth_is_read_only());

DROP POLICY IF EXISTS site_issues_update ON public.site_issues;
CREATE POLICY site_issues_update ON public.site_issues
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

-- Tồn tại ghi bằng chữ trên biên bản cũ: mỗi biên bản (chưa hủy) một dòng, không người xử lý, không hạn.
-- Chạy lại không nhân bản (đã có dòng gắn biên bản thì bỏ qua).
INSERT INTO public.site_issues (company_id, construction_site_id, acceptance_record_id, work_item, description,
                                created_at, created_by, updated_at)
SELECT a.company_id, a.construction_site_id, a.id, a.stage_name, btrim(a.outstanding_issues),
       a.created_at, a.created_by, now()
  FROM public.acceptance_records a
 WHERE a.deleted_at IS NULL
   AND a.status::text <> 'huy'
   AND NULLIF(btrim(coalesce(a.outstanding_issues, '')), '') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.site_issues i WHERE i.acceptance_record_id = a.id);

-- --- Bảng theo dõi của Trưởng phòng (0191, bản 0193) — chép nguyên, thêm tồn tại mở / quá hạn -----------
DROP FUNCTION IF EXISTS public.tc_site_board();
CREATE FUNCTION public.tc_site_board()
RETURNS TABLE (
  site_id                  uuid,
  company_id               uuid,
  code                     text,
  name                     text,
  stage                    public.site_stage,
  responsible_user_id      uuid,
  responsible_name         text,
  planned_end_date         date,
  site_overdue             boolean,
  milestones_total         integer,
  milestones_passed        integer,
  current_milestone_label  text,
  current_milestone_status public.site_milestone_status,
  current_milestone_due    date,
  current_milestone_overdue boolean,
  milestones_waiting_check integer,
  last_log_date            date,
  logged_today             boolean,
  open_requests            integer,
  overdue_requests         integer,
  open_warranty_claims     integer,
  overdue_warranty_claims  integer,
  open_issues              integer,
  overdue_issues           integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
  ),
  wc AS (
    SELECT w.construction_site_id,
           count(*)::int AS open_n,
           count(*) FILTER (WHERE c.due_date < (SELECT d FROM today))::int AS overdue_n
      FROM public.warranty_claims c
      JOIN public.warranties w ON w.id = c.warranty_id
     WHERE c.deleted_at IS NULL AND c.status IN ('tiep_nhan', 'dang_xu_ly')
     GROUP BY w.construction_site_id
  ),
  sites AS (
    SELECT s.*
      FROM public.construction_sites s
     WHERE s.deleted_at IS NULL
       AND (s.stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu', 'tam_dung')
            OR (s.stage = 'bao_hanh' AND EXISTS (SELECT 1 FROM wc WHERE wc.construction_site_id = s.id)))
  ),
  ms AS (
    SELECT m.construction_site_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE m.status = 'dat')::int AS passed,
           count(*) FILTER (WHERE m.status = 'cho_ky_thuat')::int AS waiting
      FROM public.site_milestones m
     WHERE m.construction_site_id IN (SELECT id FROM sites)
     GROUP BY m.construction_site_id
  ),
  cur AS (
    SELECT DISTINCT ON (m.construction_site_id)
           m.construction_site_id, m.label, m.status, m.planned_end_date
      FROM public.site_milestones m
     WHERE m.construction_site_id IN (SELECT id FROM sites)
       AND m.status <> 'dat'
     ORDER BY m.construction_site_id, m.position
  ),
  logs AS (
    SELECT l.construction_site_id, max(l.log_date) AS last_date
      FROM public.site_logs l
     WHERE l.deleted_at IS NULL
       AND l.construction_site_id IN (SELECT id FROM sites)
     GROUP BY l.construction_site_id
  ),
  req AS (
    SELECT r.site_id,
           count(*)::int AS open_n,
           count(*) FILTER (WHERE r.needed_date < (SELECT d FROM today))::int AS overdue_n
      FROM public.site_request_tracker(NULL, false) r
     WHERE NOT r.is_closed
     GROUP BY r.site_id
  ),
  -- 0241 (T2): tồn tại chưa đóng; quá hạn chỉ tính khi đã có hạn (không bịa hạn — tham số để trống).
  iss AS (
    SELECT i.construction_site_id,
           count(*)::int AS open_n,
           count(*) FILTER (WHERE i.due_date < (SELECT d FROM today))::int AS overdue_n
      FROM public.site_issues i
     WHERE i.deleted_at IS NULL AND i.status = 'dang_mo'
       AND i.construction_site_id IN (SELECT id FROM sites)
     GROUP BY i.construction_site_id
  )
  SELECT
    s.id,
    s.company_id,
    s.code::text,
    s.name::text,
    s.stage,
    s.responsible_user_id,
    u.full_name::text,
    s.planned_end_date,
    s.stage NOT IN ('tam_dung', 'bao_hanh') AND s.planned_end_date < (SELECT d FROM today),
    coalesce(ms.total, 0),
    coalesce(ms.passed, 0),
    cur.label,
    cur.status,
    cur.planned_end_date,
    coalesce(cur.planned_end_date < (SELECT d FROM today), false),
    coalesce(ms.waiting, 0),
    logs.last_date,
    coalesce(logs.last_date >= (SELECT d FROM today), false),
    coalesce(req.open_n, 0),
    coalesce(req.overdue_n, 0),
    coalesce(wc.open_n, 0),
    coalesce(wc.overdue_n, 0),
    coalesce(iss.open_n, 0),
    coalesce(iss.overdue_n, 0)
  FROM sites s
  LEFT JOIN public.users u ON u.id = s.responsible_user_id
  LEFT JOIN ms ON ms.construction_site_id = s.id
  LEFT JOIN cur ON cur.construction_site_id = s.id
  LEFT JOIN logs ON logs.construction_site_id = s.id
  LEFT JOIN req ON req.site_id = s.id
  LEFT JOIN wc ON wc.construction_site_id = s.id
  LEFT JOIN iss ON iss.construction_site_id = s.id
  ORDER BY s.code;
$$;

REVOKE ALL ON FUNCTION public.tc_site_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tc_site_board() TO authenticated;

COMMENT ON FUNCTION public.tc_site_board() IS
  'Đợt 2 — 2E/2F + T2 (0241): mỗi công trình đang chạy (và công trình bảo hành còn phiếu mở) một dòng — mốc, nhật ký, mốc chờ kiểm, đề nghị, phiếu bảo hành, tồn tại mở / quá hạn. SECURITY INVOKER: RLS quyết phạm vi.';
