-- ============================================================================
-- Hợp đồng: người soạn soạn, người có thẩm quyền ký — tách đúng vai.
--
-- Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3) và quyết định của chủ dự án («KD chỉ soạn và
-- gửi»). Trước đây mọi bước của hợp đồng chỉ kiểm `auth_can_edit_module('HD')` + pháp nhân:
--   · Kinh doanh / Đấu thầu / Thiết kế (DRAFT_CONTRACT) gửi phê duyệt, ghi nhận ĐÃ KÝ, quyết
--     toán, huỷ và mở công trình cho MỌI hợp đồng của pháp nhân — kể cả hợp đồng người khác soạn;
--   · ngược lại Ban Giám đốc (VIEW_APPROVE, không có `edit`) KHÔNG ghi nhận ký được, dù họ mới
--     là người ký thật.
--
-- Quy tắc mới, đặt ở TRIGGER trên bảng (mọi đường đổi bước — kể cả `decide_approval` — đều đi
-- qua), không chép lại thân các hàm dài của 0027/0035 (bài học 0086):
--   · sửa nội dung, điều khoản, phụ lục và GỬI PHÊ DUYỆT: chỉ người chịu trách nhiệm hợp đồng
--     (hoặc TGĐ/CFO/BGĐ/Quản trị — `rls_owner_can_write`);
--   · GHI NHẬN ĐÃ KÝ, QUYẾT TOÁN: người có quyền PHÊ DUYỆT module HD;
--   · HUỶ: người chịu trách nhiệm khi còn nháp / chờ duyệt; từ khi đã duyệt trở đi cần quyền
--     phê duyệt HD;
--   · QUYẾT TOÁN chỉ khi mọi công trình của hợp đồng đã bàn giao (bảo hành hoặc hoàn thành);
--   · MỞ CÔNG TRÌNH từ hợp đồng: người có quyền phê duyệt HD hoặc phê duyệt TC (trưởng phòng
--     thi công, chỉ huy trưởng) — không còn là việc của người soạn hợp đồng;
--   · SOẠN hợp đồng từ cơ hội chỉ khi cơ hội đã tới Báo giá / Đàm phán; từ gói thầu chỉ khi đã
--     trúng thầu. Từ hồ sơ thiết kế không chặn: hợp đồng thiết kế NVO ký ngay từ đầu bài.
-- ============================================================================

-- --- Quyền phê duyệt theo module (gương của auth_can_edit_module, 0007) ----------------------
CREATE OR REPLACE FUNCTION public.auth_can_approve_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_companies uc
    JOIN public.permissions p ON p.role_id = uc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND p.module_code = p_module
      AND p.can_approve
  );
$$;

COMMENT ON FUNCTION public.auth_can_approve_module(text) IS
  'Người dùng có quyền phê duyệt (can_approve) trên một module hay không (0157).';

-- --- Ai sửa được nội dung hợp đồng ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_contract_writable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.deleted_at IS NULL
      AND public.rls_company_access(c.company_id)
      AND public.auth_can_edit_module('HD')
      -- 0157: chỉ người chịu trách nhiệm (hoặc TGĐ/CFO/BGĐ/Quản trị) — có quyền sửa module HD
      -- không có nghĩa là sửa được hợp đồng người khác đang soạn.
      AND public.rls_owner_can_write(c.company_id, c.responsible_user_id)
      AND c.stage NOT IN ('hoan_thanh', 'huy')
  );
$$;

COMMENT ON FUNCTION public.rls_contract_writable(uuid) IS
  'Hợp đồng còn thao tác được không: đúng pháp nhân, có quyền sửa HD, là người chịu trách nhiệm '
  '(hoặc TGĐ/CFO/BGĐ/Quản trị — 0157), chưa quyết toán và chưa hủy.';

-- --- Ai đổi được bước nào ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_stage_permissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  v_open integer;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  -- Tác vụ hệ thống (cron, migration, seed bằng service_role) không mang người dùng.
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'cho_duyet' THEN
    IF NOT public.rls_owner_can_write(NEW.company_id, NEW.responsible_user_id) THEN
      RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng mới gửi phê duyệt được.';
    END IF;

  ELSIF NEW.stage = 'da_ky' THEN
    IF NOT public.auth_can_approve_module('HD') THEN
      RAISE EXCEPTION 'Ghi nhận hợp đồng đã ký cần người có quyền phê duyệt hợp đồng (Ban Giám đốc).';
    END IF;

  ELSIF NEW.stage = 'hoan_thanh' THEN
    IF NOT public.auth_can_approve_module('HD') THEN
      RAISE EXCEPTION 'Quyết toán hợp đồng cần người có quyền phê duyệt hợp đồng (Ban Giám đốc).';
    END IF;

    SELECT count(*) INTO v_open
      FROM public.construction_sites s
     WHERE s.contract_id = NEW.id AND s.deleted_at IS NULL
       AND s.stage NOT IN ('bao_hanh', 'hoan_thanh');
    IF v_open > 0 THEN
      RAISE EXCEPTION 'Còn % công trình của hợp đồng chưa bàn giao. Quyết toán sau khi công trình đã sang bảo hành hoặc hoàn thành.', v_open;
    END IF;

  ELSIF NEW.stage = 'huy' THEN
    IF OLD.stage IN ('nhap', 'cho_duyet') THEN
      IF NOT (public.rls_owner_can_write(NEW.company_id, NEW.responsible_user_id)
              OR public.auth_can_approve_module('HD')) THEN
        RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc người có quyền phê duyệt hợp đồng mới hủy được.';
      END IF;
    ELSIF NOT public.auth_can_approve_module('HD') THEN
      RAISE EXCEPTION 'Hợp đồng đã được phê duyệt — hủy cần người có quyền phê duyệt hợp đồng (Ban Giám đốc).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contracts_stage_permissions() IS
  'Ai đổi được bước nào của hợp đồng (0157): gửi = người chịu trách nhiệm; ký, quyết toán, hủy '
  'sau duyệt = quyền phê duyệt HD; quyết toán khi mọi công trình đã bàn giao.';

DROP TRIGGER IF EXISTS contracts_stage_permissions ON public.contracts;
CREATE TRIGGER contracts_stage_permissions
  BEFORE UPDATE OF stage ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_stage_permissions();

-- --- Soạn hợp đồng từ hồ sơ nguồn chưa sẵn sàng --------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_source_ready()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage text;
BEGIN
  IF NEW.source_type = 'opportunities' THEN
    SELECT stage::text INTO v_stage FROM public.opportunities WHERE id = NEW.source_id;
    IF v_stage IS NOT NULL AND v_stage NOT IN ('bao_gia', 'dam_phan') THEN
      RAISE EXCEPTION 'Cơ hội chưa tới giai đoạn Báo giá / Đàm phán nên chưa soạn hợp đồng được.';
    END IF;
  ELSIF NEW.source_type = 'bidding_projects' THEN
    SELECT stage::text INTO v_stage FROM public.bidding_projects WHERE id = NEW.source_id;
    IF v_stage IS NOT NULL AND v_stage <> 'trung_thau' THEN
      RAISE EXCEPTION 'Gói thầu chưa trúng thầu nên chưa soạn hợp đồng được.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_source_ready ON public.contracts;
CREATE TRIGGER contracts_source_ready
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_source_ready();

-- --- Mở công trình từ hợp đồng ---------------------------------------------------------------
-- Mọi công trình đều sinh qua `open_construction_site` (0035) — một trigger trên bảng phủ cả
-- `open_site_from_contract` lẫn `handover_design_to_construction`. Chỉ xét công trình MANG hợp
-- đồng: bàn giao thiết kế tự mở công trình không gắn hợp đồng (xử lý riêng ở 0158).
CREATE OR REPLACE FUNCTION public.construction_sites_open_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.contract_id IS NOT NULL AND public.auth_user_id() IS NOT NULL
     AND NOT (public.auth_can_approve_module('HD') OR public.auth_can_approve_module('TC')) THEN
    RAISE EXCEPTION 'Mở công trình từ hợp đồng cần Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_open_permission ON public.construction_sites;
CREATE TRIGGER construction_sites_open_permission
  BEFORE INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_open_permission();

-- --- Ban Giám đốc (chỉ xem + phê duyệt) gọi được hàm ký / quyết toán / hủy -----------------
-- Thân hai hàm giữ NGUYÊN VĂN 0027; chỉ đổi dòng kiểm quyền từ «có quyền sửa HD» thành «có
-- quyền sửa HOẶC phê duyệt HD». Ai được làm bước nào do trigger `contracts_stage_permissions`
-- ở trên quyết định.
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id uuid,
  p_contract_number text,
  p_signed_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT (public.auth_can_edit_module('HD') OR public.auth_can_approve_module('HD')) THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  -- Ghi nhận đã ký trước khi có phê duyệt nội bộ nghĩa là hạn mức HD-05 bị bỏ qua hoàn toàn.
  IF c.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ ghi nhận đã ký sau khi hợp đồng được phê duyệt nội bộ.';
  END IF;

  IF p_contract_number IS NULL OR btrim(p_contract_number) = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập số hợp đồng theo văn bản đã ký.';
  END IF;

  UPDATE public.contracts
     SET stage = 'da_ky',
         contract_number = btrim(p_contract_number),
         signed_date = COALESCE(p_signed_date, current_date),
         signed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  -- Hợp đồng đã ký là tín hiệu khởi động của Thi công và Kế toán (PRD Mục 7, TC-01).
  PERFORM public.create_notification(
    u.id, c.company_id, 'contract_signed',
    format('Hợp đồng %s đã được ký, giá trị %s đồng.', c.code, to_char(c.value, 'FM999,999,999,999')),
    'contracts', c.id,
    format('/hd/hop-dong/%s', c.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = c.company_id
    AND (r.code IN ('TC', 'KT', 'KD') OR u.id = c.responsible_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_contract(
  p_contract_id uuid,
  p_stage contract_stage,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  c        record;
  v_open   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_stage NOT IN ('hoan_thanh', 'huy') THEN
    RAISE EXCEPTION 'Hàm này chỉ dùng để quyết toán hoặc hủy hợp đồng.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT (public.auth_can_edit_module('HD') OR public.auth_can_approve_module('HD')) THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  IF c.stage IN ('hoan_thanh', 'huy') THEN
    RAISE EXCEPTION 'Hợp đồng này đã kết thúc.';
  END IF;

  IF p_stage = 'huy' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân hủy hợp đồng.';
  END IF;

  IF p_stage = 'hoan_thanh' THEN
    IF c.stage <> 'da_ky' THEN
      RAISE EXCEPTION 'Chỉ quyết toán được hợp đồng đã ký.';
    END IF;

    -- Quyết toán khi còn phát sinh chưa ngã ngũ nghĩa là con số quyết toán chưa phải con số
    -- cuối — và sau khi đóng hồ sơ thì không sửa được nữa (HD-04).
    SELECT count(*) INTO v_open
      FROM public.contract_amendments am
     WHERE am.contract_id = p_contract_id AND am.deleted_at IS NULL
       AND am.stage IN ('de_xuat', 'cho_duyet', 'da_duyet');

    IF v_open > 0 THEN
      RAISE EXCEPTION 'Còn % phát sinh chưa xử lý xong. Hoàn tất hoặc đóng các phát sinh trước khi quyết toán.', v_open;
    END IF;
  END IF;

  UPDATE public.contracts
     SET stage = p_stage,
         settled_at = CASE WHEN p_stage = 'hoan_thanh' THEN now() ELSE NULL END,
         cancel_reason = CASE WHEN p_stage = 'huy' THEN btrim(p_reason) ELSE NULL END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;
END;
$$;
