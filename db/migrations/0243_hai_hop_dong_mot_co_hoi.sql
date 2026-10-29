-- ============================================================================
-- 0243 — Một cơ hội: một hợp đồng thiết kế + một hợp đồng thi công, HOẶC một hợp đồng trọn gói.
--
-- Vì sao: 0159 (`contracts_one_per_opportunity`) cho MỖI cơ hội đúng một hợp đồng để không đếm
-- doanh thu hai lần. Quy trình NVO anh Bùi Văn Thi kể (hồ sơ khảo sát, Ban Giám đốc NVO, bước 4 và
-- 7) là HAI hợp đồng: ký hợp đồng THIẾT KẾ (khách trả tiền thiết kế theo đợt), thiết kế được duyệt
-- mới dự toán và ký hợp đồng THI CÔNG riêng. Anh Dũng duyệt quy tắc mới 29/10/2026.
--
-- 1. `contracts.scope_kind` (thiet_ke · thi_cong · tron_goi), trigger suy từ `type`:
--      thiet_ke → thiet_ke; thi_cong → thi_cong, hoặc tron_goi khi người soạn chọn «thiết kế – thi
--      công trọn gói» hay soạn văn bản từ mẫu trọn gói (`contract_templates.scope_kind`, NVO-HĐ-02,
--      NVC-HĐ-02); loại khác → rỗng. KHÔNG thêm giá trị enum: mẫu trọn gói vốn đã là `thi_cong`, và
--      mọi chỗ đang xét `type = 'thi_cong'` (tự mở công trình, lãi / lỗ, mẫu…) vẫn đúng với trọn gói.
-- 2. Quy tắc (trigger `contracts_one_per_kind`, thay `contracts_one_per_opportunity`): trong cùng
--    một cơ hội gốc (qua cơ hội, gói thầu hoặc hồ sơ thiết kế) — không có cơ hội thì cùng một hồ sơ
--    nguồn — hai hợp đồng còn hiệu lực chỉ cùng tồn tại khi đúng là một thiết kế + một thi công.
--    Hai cùng loại, trọn gói đi cùng bất kỳ hợp đồng nào, hay loại khác (mua bán, cho thuê…) đi cùng
--    hợp đồng nào đều bị chặn — như 0159. Hủy / xoá mềm không tính.
-- 3. Ký hợp đồng THIẾT KẾ: cơ hội KHÔNG sang «Ký hợp đồng» (vẫn mở để báo giá thi công / đàm phán),
--    người phụ trách được báo; không tự mở công trình (0187 chỉ mở cho `thi_cong`). Ký hợp đồng thi
--    công / trọn gói: như cũ. Ngoại lệ: cơ hội có hồ sơ thiết kế đang làm thì công trình mở lúc bàn
--    giao thiết kế (gắn hợp đồng thi công), không mở lúc ký — tránh hai công trình.
-- 4. Bàn giao thiết kế → thi công gắn hợp đồng thi công / trọn gói ĐÃ KÝ của hồ sơ thiết kế hoặc
--    của cơ hội gốc; hợp đồng thiết kế đã ký KHÔNG đủ.
-- 5. «Chỉ thiết kế»: `mark_opportunity_design_only` đặt cờ (kèm lý do, ghi lịch sử cơ hội). Cờ bật
--    thì hợp đồng thiết kế ký là cơ hội sang «Ký hợp đồng» (thắng); đã ký sẵn thì sang ngay. Không
--    thêm giai đoạn mới. Cờ bật thì không soạn hợp đồng thi công / trọn gói được nữa.
--
-- Hàm chép bản mới nhất, chỉ đổi phần cần: create_contract_from_source (0087), sign_contract (0187),
-- contracts_sync_opportunity (0158), construction_sites_link_design_contract (0158), record_chain
-- (0159), stage_readiness (0234), contracts_awaiting_site (0230). Chạy lại được.
-- ============================================================================

-- --- 1. Cột -------------------------------------------------------------------------------------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS scope_kind text;
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_scope_kind_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_scope_kind_check
  CHECK (scope_kind IS NULL OR scope_kind IN ('thiet_ke', 'thi_cong', 'tron_goi'));
COMMENT ON COLUMN public.contracts.scope_kind IS
  'Phạm vi so với cơ hội (0243): thiet_ke · thi_cong · tron_goi (thiết kế – thi công trọn gói, thay cả '
  'hai). Trigger suy từ type; rỗng với loại khác.';

ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS scope_kind text;
ALTER TABLE public.contract_templates DROP CONSTRAINT IF EXISTS contract_templates_scope_kind_check;
ALTER TABLE public.contract_templates ADD CONSTRAINT contract_templates_scope_kind_check
  CHECK (scope_kind IS NULL OR scope_kind IN ('thiet_ke', 'thi_cong', 'tron_goi'));
COMMENT ON COLUMN public.contract_templates.scope_kind IS
  'Mẫu cho hợp đồng thiết kế / thi công / trọn gói (0243). Soạn văn bản từ mẫu đặt contracts.scope_kind.';

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS design_only_at timestamptz,
  ADD COLUMN IF NOT EXISTS design_only_reason text,
  ADD COLUMN IF NOT EXISTS design_only_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.opportunities.design_only_at IS
  'Khách chỉ mua thiết kế (0243) — đặt qua mark_opportunity_design_only; hợp đồng thiết kế ký là thắng.';

-- Cột cờ chỉ đổi qua hàm (kiểm điều kiện + ghi lịch sử), không UPDATE thẳng từ trình duyệt.
DROP TRIGGER IF EXISTS opportunities_design_only_guard ON public.opportunities;
CREATE TRIGGER opportunities_design_only_guard
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'design_only_at', 'design_only_reason', 'design_only_by'
  );

-- --- 2. Điền cho dữ liệu đã có (TRƯỚC khi tạo trigger quy tắc bên dưới) ------------------------

UPDATE public.contract_templates
   SET scope_kind = CASE
     WHEN title LIKE 'NVO-HĐ-02%' OR title LIKE 'NVC-HĐ-02%' THEN 'tron_goi'
     WHEN contract_type::text = 'thiet_ke' THEN 'thiet_ke'
     WHEN contract_type::text = 'thi_cong' THEN 'thi_cong'
   END
 WHERE scope_kind IS NULL AND document_kind = 'hop_dong'
   AND contract_type::text IN ('thiet_ke', 'thi_cong');

UPDATE public.contracts c
   SET scope_kind = CASE
     WHEN c.type::text = 'thiet_ke' THEN 'thiet_ke'
     WHEN (SELECT t.scope_kind FROM public.contract_documents d
             JOIN public.contract_templates t ON t.id = d.template_id
            WHERE d.contract_id = c.id ORDER BY d.version DESC LIMIT 1) = 'tron_goi' THEN 'tron_goi'
     ELSE 'thi_cong'
   END
 WHERE c.scope_kind IS NULL AND c.type::text IN ('thiet_ke', 'thi_cong');

-- --- 3. Quy tắc một hợp đồng mỗi loại ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_scope_kind_for(p_type public.contract_type, p_requested text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type::text
    WHEN 'thiet_ke' THEN 'thiet_ke'
    WHEN 'thi_cong' THEN CASE WHEN p_requested = 'tron_goi' THEN 'tron_goi' ELSE 'thi_cong' END
  END;
$$;

COMMENT ON FUNCTION public.contract_scope_kind_for(public.contract_type, text) IS
  'Phạm vi hợp đồng suy từ loại (0243): trọn gói chỉ với loại thi công; loại khác rỗng.';

-- Cơ hội gốc của một NGUỒN (trigger BEFORE INSERT chưa có dòng để gọi contract_origin_opportunity).
CREATE OR REPLACE FUNCTION public.contract_source_opportunity(
  p_source_type public.contract_source_type,
  p_source_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_source_type::text
    WHEN 'opportunities'    THEN p_source_id
    WHEN 'bidding_projects' THEN (SELECT opportunity_id FROM public.bidding_projects WHERE id = p_source_id)
    WHEN 'design_projects'  THEN (SELECT opportunity_id FROM public.design_projects WHERE id = p_source_id)
  END;
$$;

REVOKE ALL ON FUNCTION public.contract_source_opportunity(public.contract_source_type, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_source_opportunity(public.contract_source_type, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contract_scope_kind_label(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'thiet_ke' THEN 'hợp đồng thiết kế'
    WHEN 'thi_cong' THEN 'hợp đồng thi công'
    WHEN 'tron_goi' THEN 'hợp đồng thiết kế – thi công trọn gói'
    ELSE 'hợp đồng'
  END;
$$;

DROP TRIGGER IF EXISTS contracts_one_per_opportunity ON public.contracts;
DROP FUNCTION IF EXISTS public.contracts_one_per_opportunity();

CREATE OR REPLACE FUNCTION public.contracts_one_per_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_opp         uuid;
  v_design_only timestamptz;
  v_conf        record;
  v_who         text;
BEGIN
  NEW.scope_kind := public.contract_scope_kind_for(NEW.type, NEW.scope_kind);

  IF TG_OP = 'UPDATE' THEN
    IF NEW.scope_kind IS NOT DISTINCT FROM OLD.scope_kind
       AND NEW.source_type IS NOT DISTINCT FROM OLD.source_type
       AND NEW.source_id IS NOT DISTINCT FROM OLD.source_id THEN
      RETURN NEW;
    END IF;
    -- Hạn mức đã duyệt, cổng bàn giao đã mở theo đúng loại này — đổi sau khi gửi duyệt là đổi
    -- câu trả lời cho «hợp đồng này cho thi công hay chỉ thiết kế».
    IF OLD.stage <> 'nhap' AND NEW.scope_kind IS DISTINCT FROM OLD.scope_kind THEN
      RAISE EXCEPTION 'Hợp đồng đã gửi phê duyệt nên không đổi được loại (thiết kế / thi công / trọn gói).';
    END IF;
  END IF;

  IF NEW.deleted_at IS NOT NULL OR NEW.stage = 'huy' OR NEW.source_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_opp := public.contract_source_opportunity(NEW.source_type, NEW.source_id);
  -- Hai người soạn cùng lúc cho cùng một cơ hội không cùng lọt qua phép kiểm dưới.
  PERFORM pg_advisory_xact_lock(hashtext('contracts_one_per_kind:' || COALESCE(v_opp, NEW.source_id)::text));
  v_who := CASE WHEN v_opp IS NOT NULL THEN 'Cơ hội này' ELSE 'Hồ sơ này' END;

  IF v_opp IS NOT NULL AND NEW.scope_kind IN ('thi_cong', 'tron_goi') THEN
    SELECT design_only_at INTO v_design_only FROM public.opportunities WHERE id = v_opp;
    IF v_design_only IS NOT NULL THEN
      RAISE EXCEPTION 'Cơ hội này đã đánh dấu «Chỉ thiết kế» nên không soạn hợp đồng thi công được.';
    END IF;
  END IF;

  SELECT c.code, c.scope_kind INTO v_conf
    FROM public.contracts c
   WHERE c.id <> NEW.id AND c.deleted_at IS NULL AND c.stage <> 'huy'
     AND CASE WHEN v_opp IS NOT NULL THEN public.contract_origin_opportunity(c.id) = v_opp
              ELSE c.source_type = NEW.source_type AND c.source_id = NEW.source_id END
     -- Cặp duy nhất được cùng tồn tại: một thiết kế + một thi công.
     AND NOT ((c.scope_kind = 'thiet_ke' AND NEW.scope_kind = 'thi_cong')
              OR (c.scope_kind = 'thi_cong' AND NEW.scope_kind = 'thiet_ke'))
   ORDER BY c.created_at
   LIMIT 1;

  IF FOUND THEN
    IF NEW.scope_kind = 'tron_goi' OR v_conf.scope_kind = 'tron_goi' THEN
      RAISE EXCEPTION '% đã có % %. Hợp đồng trọn gói thay cho cả hợp đồng thiết kế lẫn hợp đồng thi công nên không đi cùng hợp đồng khác — mở hợp đồng hiện có.',
        v_who, public.contract_scope_kind_label(v_conf.scope_kind), v_conf.code;
    ELSIF NEW.scope_kind IS NOT NULL AND v_conf.scope_kind = NEW.scope_kind THEN
      RAISE EXCEPTION '% đã có % %. Mỗi cơ hội một hợp đồng thiết kế và một hợp đồng thi công — mở hợp đồng hiện có thay vì soạn bản mới.',
        v_who, public.contract_scope_kind_label(v_conf.scope_kind), v_conf.code;
    ELSE
      RAISE EXCEPTION '% đã có % %. Mở hợp đồng hiện có thay vì soạn bản mới.',
        v_who, public.contract_scope_kind_label(v_conf.scope_kind), v_conf.code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.contracts_one_per_kind() IS
  'Một cơ hội (hoặc một hồ sơ nguồn không có cơ hội): tối đa một hợp đồng thiết kế + một hợp đồng thi '
  'công, hoặc một hợp đồng trọn gói; loại khác một hợp đồng (0243, thay 0159).';

DROP TRIGGER IF EXISTS contracts_one_per_kind ON public.contracts;
CREATE TRIGGER contracts_one_per_kind
  BEFORE INSERT OR UPDATE OF type, scope_kind, source_type, source_id ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_one_per_kind();

-- Soạn văn bản từ mẫu trọn gói / thi công → hợp đồng thi công nhận đúng phạm vi của văn bản.
CREATE OR REPLACE FUNCTION public.contract_documents_set_scope_kind()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT scope_kind INTO v_kind FROM public.contract_templates WHERE id = NEW.template_id;
  IF v_kind IN ('thi_cong', 'tron_goi') THEN
    UPDATE public.contracts
       SET scope_kind = v_kind
     WHERE id = NEW.contract_id AND type::text = 'thi_cong' AND stage = 'nhap'
       AND scope_kind IS DISTINCT FROM v_kind;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_documents_set_scope_kind ON public.contract_documents;
CREATE TRIGGER contract_documents_set_scope_kind
  AFTER INSERT ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.contract_documents_set_scope_kind();

-- --- 4. Soạn hợp đồng từ hồ sơ nguồn (bản 0087 + phạm vi) --------------------------------------
-- Chặn trùng theo nguồn của 0087 chuyển hẳn sang trigger `contracts_one_per_kind`: chặn theo ĐÚNG
-- nguồn thì hồ sơ thiết kế không sinh được hợp đồng thi công sau hợp đồng thiết kế.
DROP FUNCTION IF EXISTS public.create_contract_from_source(contract_source_type, uuid, contract_type, text);
CREATE OR REPLACE FUNCTION public.create_contract_from_source(
  p_source_type contract_source_type,
  p_source_id uuid,
  p_type contract_type,
  p_title text DEFAULT NULL,
  p_scope_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.auth_user_id();
  v_company     uuid;
  v_customer    uuid;
  v_name        text;
  v_value       bigint;
  v_estimate    uuid;
  v_estimate_price bigint;
  v_company_code text;
  v_code        text;
  v_contract    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_scope_kind IS NOT NULL AND p_scope_kind NOT IN ('thiet_ke', 'thi_cong', 'tron_goi') THEN
    RAISE EXCEPTION 'Loại hợp đồng không hợp lệ.';
  END IF;
  IF p_scope_kind = 'tron_goi' AND p_type::text <> 'thi_cong' THEN
    RAISE EXCEPTION 'Hợp đồng trọn gói soạn theo loại hợp đồng thi công.';
  END IF;

  -- Lấy dữ liệu nguồn. Giá trị ưu tiên bản dự toán ĐÃ DUYỆT đang hiệu lực; không có thì
  -- mới dùng con số ước tính, và khi đó `estimate_id` để rỗng chứ không trỏ bừa.
  IF p_source_type = 'opportunities' THEN
    SELECT o.company_id, o.customer_id, o.name INTO v_company, v_customer, v_name
      FROM public.opportunities o WHERE o.id = p_source_id AND o.deleted_at IS NULL;

    -- Với cơ hội, giá trị đến từ báo giá đang hiệu lực đã được duyệt (CRM-04).
    SELECT q.total_value INTO v_value
      FROM public.quotes q
     WHERE q.opportunity_id = p_source_id
       AND q.is_current_version AND q.deleted_at IS NULL AND q.status = 'completed';

  ELSIF p_source_type = 'bidding_projects' THEN
    SELECT b.company_id, b.customer_id, b.name, b.estimated_value
      INTO v_company, v_customer, v_name, v_value
      FROM public.bidding_projects b WHERE b.id = p_source_id AND b.deleted_at IS NULL;

    -- Không dùng "INTO v_estimate, v_value" trực tiếp: khi không có dòng nào khớp, SELECT
    -- INTO không STRICT đặt lại TẤT CẢ biến đích về NULL — kể cả v_value vừa gán ở trên (0087).
    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.bidding_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;

  ELSE
    SELECT d.company_id, d.customer_id, d.name INTO v_company, v_customer, v_name
      FROM public.design_projects d WHERE d.id = p_source_id AND d.deleted_at IS NULL;

    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.design_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn, hoặc hồ sơ đã bị xóa.';
  END IF;

  IF NOT public.auth_can_create_in('HD', v_company) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được soạn hợp đồng trong pháp nhân này.';
  END IF;

  -- 0243: một hợp đồng mỗi loại (thiết kế / thi công / trọn gói) do trigger
  -- `contracts_one_per_kind` chặn — áp cho mọi đường ghi, không riêng hàm này.

  SELECT code INTO v_company_code FROM public.companies WHERE id = v_company;
  v_code := public.next_record_code(v_company_code, 'HD');

  INSERT INTO public.contracts (
    company_id, code, title, type, scope_kind, source_type, source_id, estimate_id,
    customer_id, responsible_user_id, value
  )
  VALUES (
    v_company, v_code, COALESCE(NULLIF(btrim(p_title), ''), v_name), p_type, p_scope_kind,
    p_source_type, p_source_id, v_estimate, v_customer, v_user, v_value
  )
  RETURNING id INTO v_contract;

  RETURN v_contract;
END;
$$;

COMMENT ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text, text) IS
  'Soạn hợp đồng từ cơ hội / gói thầu / dự án thiết kế, lấy sẵn khách hàng và giá đã duyệt — không nhập lại (HD-01). '
  'p_scope_kind = tron_goi cho hợp đồng thiết kế – thi công trọn gói (0243).';

REVOKE ALL ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text, text) TO authenticated;

-- --- 5. Ký hợp đồng (bản 0187; hợp đồng thiết kế / cơ hội còn thiết kế không tự mở công trình) ---
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id uuid,
  p_contract_number text,
  p_signed_date date,
  p_signed_scan_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c      record;
  v_site uuid;
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

  -- Bản chụp phải nằm đúng thư mục của hợp đồng trong kho văn bản hợp đồng.
  IF p_signed_scan_path IS NOT NULL AND (
       split_part(p_signed_scan_path, '/', 1) <> c.id::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
                       WHERE o.bucket_id = 'contract-documents' AND o.name = p_signed_scan_path)
     ) THEN
    RAISE EXCEPTION 'Không thấy bản hợp đồng đã ký vừa tải lên — tải lại tệp rồi ghi nhận.';
  END IF;

  UPDATE public.contracts
     SET stage = 'da_ky',
         contract_number = btrim(p_contract_number),
         signed_date = COALESCE(p_signed_date, current_date),
         signed_at = now(),
         signed_scan_path = NULLIF(btrim(p_signed_scan_path), ''),
         signed_recorded_by = v_user,
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
    AND (r.code IN ('TC', 'KT', 'KD') OR u.id = c.responsible_user_id)
    AND u.id <> v_user;

  -- 0187: người khác Ban Giám đốc ghi nhận → báo Ban Giám đốc để biết (không phải việc phải làm).
  IF NOT public.auth_can_approve_module('HD') THEN
    PERFORM public.create_notification(
      u.id, c.company_id, 'contract_signed_recorded',
      format('Hợp đồng %s: %s đã ghi nhận đã ký (số %s), kèm bản đã ký.',
             c.code, (SELECT full_name FROM public.users WHERE id = v_user), btrim(p_contract_number)),
      'contracts', c.id,
      format('/hd/hop-dong/%s', c.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'HD' AND pm.can_approve
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id <> v_user
      AND (uc.company_id = c.company_id OR r.sees_all_companies)
    GROUP BY u.id;
  END IF;

  -- 0187: hợp đồng thi công ký xong → tự mở công trình ở bước Chuẩn bị (một hợp đồng một công
  -- trình, như `open_site_from_contract`). Chỉ huy trưởng để trống cho Thi công phân công.
  -- Chỉ hợp đồng thi công từ cơ hội CRM: hợp đồng từ gói thầu có bước lập ngân sách thi công
  -- riêng (DA-09) TRƯỚC khi mở công trình, hợp đồng từ hồ sơ thiết kế mở công trình ở bước bàn
  -- giao thiết kế — tự mở ở đây là lập ngân sách hai lần (golden-path đã bắt được).
  -- 0243: hợp đồng thiết kế không bao giờ tự mở công trình (loại `thiet_ke`). Cơ hội còn hồ sơ
  -- thiết kế đang làm thì công trình mở lúc BÀN GIAO thiết kế (gắn hợp đồng này) — mở ở đây nữa là
  -- hai công trình cho một nhà.
  IF c.type::text = 'thi_cong' AND COALESCE(c.source_type::text, 'opportunities') = 'opportunities'
     AND NOT EXISTS (
       SELECT 1 FROM public.design_projects d
        WHERE d.opportunity_id = c.source_id AND d.deleted_at IS NULL
          AND d.handed_over_at IS NULL AND d.stage::text <> 'dung_thiet_ke'
     )
     AND NOT EXISTS (
    SELECT 1 FROM public.construction_sites s WHERE s.contract_id = c.id AND s.deleted_at IS NULL
  ) THEN
    PERFORM set_config('nvg.auto_open_site', c.id::text, true);
    v_site := public.open_construction_site(
      c.company_id, c.title, c.id, NULL, NULL,
      c.project_location, NULL, c.start_date, c.end_date
    );
    PERFORM set_config('nvg.auto_open_site', '', true);

    PERFORM public.create_notification(
      u.id, c.company_id, 'site_opened_from_contract',
      format('Hợp đồng %s đã ký — công trình %s đã mở, chờ phân công chỉ huy trưởng và ngày khởi công.',
             c.code, (SELECT code FROM public.construction_sites WHERE id = v_site)),
      'construction_sites', v_site,
      format('/tc/cong-trinh/%s', v_site)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'TC' AND pm.can_approve
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id <> v_user
      AND uc.company_id = c.company_id AND NOT r.site_scoped
    GROUP BY u.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_contract(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_contract(uuid, text, date, text) TO authenticated;

-- --- 6. Hợp đồng đổi bước → cơ hội (bản 0158 + nhánh hợp đồng thiết kế) -------------------------
CREATE OR REPLACE FUNCTION public.contracts_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp   uuid := public.contract_origin_opportunity(NEW.id);
  v_owner uuid;
  v_ocode text;
  v_design_only timestamptz;
BEGIN
  IF v_opp IS NULL OR NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'da_ky' THEN
    SELECT owner_id, code, design_only_at INTO v_owner, v_ocode, v_design_only
      FROM public.opportunities WHERE id = v_opp;
    -- 0243: hợp đồng THIẾT KẾ ký xong chưa phải là thắng cơ hội — còn báo giá và hợp đồng thi
    -- công (quy trình NVO, anh Bùi Văn Thi). Chỉ khi khách chỉ mua thiết kế mới sang «Ký hợp đồng».
    IF NEW.scope_kind = 'thiet_ke' AND v_design_only IS NULL THEN
      IF v_owner IS NOT NULL THEN
        PERFORM public.create_notification(
          v_owner, NEW.company_id, 'design_contract_signed',
          format('Hợp đồng thiết kế %s của cơ hội %s đã ký. Cơ hội vẫn mở: báo giá và soạn hợp đồng thi công khi thiết kế được duyệt, hoặc đánh dấu «Chỉ thiết kế» nếu khách chỉ thuê thiết kế.',
                 NEW.code, v_ocode),
          'opportunities', v_opp, format('/crm/co-hoi/%s', v_opp)
        );
      END IF;
    ELSE
      PERFORM public._sync_opportunity_stage(
        v_opp, 'ky_hop_dong',
        CASE WHEN NEW.scope_kind = 'thiet_ke'
             THEN format('Chỉ thiết kế — hợp đồng thiết kế %s đã ký', NEW.code)
             ELSE format('Hợp đồng %s đã ký', NEW.code) END
      );
    END IF;
  ELSIF NEW.stage = 'huy' THEN
    SELECT owner_id, code INTO v_owner, v_ocode FROM public.opportunities WHERE id = v_opp;
    IF v_owner IS NOT NULL THEN
      PERFORM public.create_notification(
        v_owner, NEW.company_id, 'contract_cancelled',
        format('Hợp đồng %s của cơ hội %s đã hủy. Xem lại giai đoạn cơ hội.', NEW.code, v_ocode),
        'opportunities', v_opp, format('/crm/co-hoi/%s', v_opp)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- --- 7. Bàn giao thiết kế: hợp đồng nào mở cổng -----------------------------------------------
-- Hợp đồng thi công / trọn gói (chưa hủy) của hồ sơ thiết kế HOẶC của cơ hội gốc. Dùng chung cho
-- trigger gắn hợp đồng vào công trình và màn hình hồ sơ thiết kế.
CREATE OR REPLACE FUNCTION public._design_build_contracts(p_design_project_id uuid)
RETURNS SETOF public.contracts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
    FROM public.contracts c
    JOIN public.design_projects d ON d.id = p_design_project_id
   WHERE c.deleted_at IS NULL AND c.stage <> 'huy'
     AND c.scope_kind IN ('thi_cong', 'tron_goi')
     AND ((c.source_type = 'design_projects' AND c.source_id = d.id)
          OR (d.opportunity_id IS NOT NULL AND public.contract_origin_opportunity(c.id) = d.opportunity_id));
$$;

REVOKE ALL ON FUNCTION public._design_build_contracts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.construction_sites_link_design_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
  v_code     text;
  v_require  boolean;
  r          record;
BEGIN
  IF NEW.design_project_id IS NULL OR NEW.contract_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 0243: chỉ hợp đồng THI CÔNG / TRỌN GÓI đã ký mở được thi công — hợp đồng thiết kế không đủ.
  SELECT c.id INTO v_contract
    FROM public._design_build_contracts(NEW.design_project_id) c
   WHERE c.stage = 'da_ky'
     AND NOT EXISTS (SELECT 1 FROM public.construction_sites s
                      WHERE s.contract_id = c.id AND s.deleted_at IS NULL)
   ORDER BY c.signed_date DESC NULLS LAST
   LIMIT 1;

  IF v_contract IS NOT NULL THEN
    NEW.contract_id := v_contract;
    RETURN NEW;
  END IF;

  -- `coalesce` ở nơi gọi: tham số chưa cấu hình nghĩa là KHÔNG bắt buộc (CLAUDE.md 5.2).
  v_require := COALESCE(
    (public.system_parameter('tk.handover_requires_signed_contract', 'company', NEW.company_id))::text::boolean,
    false
  );

  SELECT code INTO v_code FROM public.design_projects WHERE id = NEW.design_project_id;

  IF v_require THEN
    RAISE EXCEPTION 'Hồ sơ thiết kế % chưa có hợp đồng thi công (hoặc thiết kế – thi công trọn gói) đã ký nên chưa bàn giao sang thi công được. Hợp đồng thiết kế không đủ để thi công.', v_code;
  END IF;

  -- Vẫn mở — nhưng người kiểm soát tiền phải biết công trình đang chạy không có hợp đồng.
  FOR r IN
    SELECT DISTINCT uc.user_id
      FROM public.user_companies uc
      JOIN public.roles ro ON ro.id = uc.role_id
     WHERE uc.deleted_at IS NULL AND ro.code IN ('TGD', 'BGD', 'CFO', 'KT')
       AND (uc.company_id = NEW.company_id OR ro.sees_all_companies)
  LOOP
    PERFORM public.create_notification(
      r.user_id, NEW.company_id, 'site_without_contract',
      format('Công trình từ hồ sơ thiết kế %s được mở khi chưa có hợp đồng thi công đã ký.', v_code),
      'design_projects', NEW.design_project_id, format('/tk/du-an/%s', NEW.design_project_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.construction_sites_link_design_contract() IS
  'Bàn giao thiết kế: gắn hợp đồng thi công / trọn gói đã ký (của hồ sơ thiết kế hoặc cơ hội gốc) vào '
  'công trình; chưa có thì chặn hoặc cảnh báo theo tk.handover_requires_signed_contract (0158, 0243).';

-- Màn hình hồ sơ thiết kế: hợp đồng nào là cổng bàn giao, đang ở bước nào. Trả cả hợp đồng người
-- xem không mở được (không có id) — Thiết kế cần biết đã có hợp đồng thi công chưa.
CREATE OR REPLACE FUNCTION public.design_handover_contracts(p_design_project_id uuid)
RETURNS TABLE (contract_id uuid, code text, scope_kind text, stage text, signed boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rls_design_project_readable(p_design_project_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT CASE WHEN public.rls_contract_readable(c.id) THEN c.id END,
         COALESCE(c.contract_number, c.code)::text, c.scope_kind, c.stage::text, c.stage = 'da_ky'
    FROM public._design_build_contracts(p_design_project_id) c
   ORDER BY c.created_at;
END;
$$;

COMMENT ON FUNCTION public.design_handover_contracts(uuid) IS
  'Hợp đồng thi công / trọn gói mở cổng bàn giao của hồ sơ thiết kế (0243). id rỗng khi người xem '
  'không xem được hợp đồng đó.';

REVOKE ALL ON FUNCTION public.design_handover_contracts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.design_handover_contracts(uuid) TO authenticated;

-- --- 8. Các hợp đồng của một cơ hội (mọi đường) — để biết còn soạn được loại nào -------------
-- Như `opportunity_has_contract` (0159): trả cả hợp đồng người gọi không xem được (không có id),
-- vì Kinh doanh không xem DA vẫn phải biết cơ hội đã có hợp đồng thi công từ gói thầu.
CREATE OR REPLACE FUNCTION public.contract_group_contracts(p_entity_type text, p_id uuid)
RETURNS TABLE (contract_id uuid, code text, title text, scope_kind text, stage text, source_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_opp     uuid;
  v_source  text;
BEGIN
  IF p_entity_type = 'opportunity' THEN
    SELECT company_id INTO v_company FROM public.opportunities WHERE id = p_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'design' THEN
    SELECT company_id INTO v_company FROM public.design_projects WHERE id = p_id AND deleted_at IS NULL;
    v_source := 'design_projects';
  ELSIF p_entity_type = 'bidding' THEN
    SELECT company_id INTO v_company FROM public.bidding_projects WHERE id = p_id AND deleted_at IS NULL;
    v_source := 'bidding_projects';
  END IF;
  IF v_company IS NULL OR NOT public.rls_company_access(v_company) THEN
    RETURN;
  END IF;

  v_opp := public.chain_origin_opportunity(p_entity_type, p_id);

  RETURN QUERY
  SELECT CASE WHEN public.rls_contract_readable(c.id) THEN c.id END,
         COALESCE(c.contract_number, c.code)::text,
         CASE WHEN public.rls_contract_readable(c.id) THEN c.title END,
         c.scope_kind, c.stage::text, c.source_type::text
    FROM public.contracts c
   WHERE c.deleted_at IS NULL AND c.stage <> 'huy'
     AND CASE WHEN v_opp IS NOT NULL THEN public.contract_origin_opportunity(c.id) = v_opp
              ELSE c.source_type::text = v_source AND c.source_id = p_id END
   ORDER BY c.created_at;
END;
$$;

COMMENT ON FUNCTION public.contract_group_contracts(text, uuid) IS
  'Hợp đồng chưa hủy của cơ hội gốc (qua cơ hội, gói thầu, hồ sơ thiết kế) — kèm loại thiết kế / thi '
  'công / trọn gói để giao diện biết còn soạn được loại nào (0243). id rỗng khi ngoài quyền xem.';

REVOKE ALL ON FUNCTION public.contract_group_contracts(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_group_contracts(text, uuid) TO authenticated;

-- --- 9. «Chỉ thiết kế» ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_opportunity_design_only(
  p_opportunity_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  o        record;
  v_design record;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_note   text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT id, company_id, owner_id, stage, design_only_at, deleted_at INTO o
    FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL OR NOT public.rls_company_access(o.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;
  IF NOT public.rls_owner_can_write(o.company_id, o.owner_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội này mới đánh dấu «Chỉ thiết kế» được.';
  END IF;
  IF o.design_only_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF o.stage IN ('ky_hop_dong', 'mat_co_hoi') THEN
    RAISE EXCEPTION 'Cơ hội đã ở giai đoạn kết thúc.';
  END IF;

  SELECT c.id, c.code, c.stage INTO v_design
    FROM public.contracts c
   WHERE c.deleted_at IS NULL AND c.stage <> 'huy' AND c.scope_kind = 'thiet_ke'
     AND public.contract_origin_opportunity(c.id) = p_opportunity_id
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cơ hội chưa có hợp đồng thiết kế — soạn hợp đồng thiết kế trước rồi mới đánh dấu «Chỉ thiết kế».';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contracts c
              WHERE c.deleted_at IS NULL AND c.stage <> 'huy' AND c.scope_kind IN ('thi_cong', 'tron_goi')
                AND public.contract_origin_opportunity(c.id) = p_opportunity_id) THEN
    RAISE EXCEPTION 'Cơ hội đã có hợp đồng thi công nên không đánh dấu «Chỉ thiết kế» được.';
  END IF;

  UPDATE public.opportunities
     SET design_only_at = now(), design_only_reason = v_reason, design_only_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_opportunity_id;

  v_note := 'Chỉ thiết kế' || COALESCE(': ' || v_reason, '');
  IF v_design.stage IN ('da_ky', 'hoan_thanh') THEN
    -- Hợp đồng thiết kế đã ký sẵn → thắng ngay; lịch sử ghi qua trigger chuyển bước.
    PERFORM public._sync_opportunity_stage(
      p_opportunity_id, 'ky_hop_dong',
      format('%s — hợp đồng thiết kế %s đã ký', v_note, v_design.code)
    );
  ELSE
    INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, note, changed_by)
    VALUES (p_opportunity_id, o.stage, o.stage,
            format('%s — cơ hội tự sang Ký hợp đồng khi hợp đồng thiết kế %s được ký', v_note, v_design.code),
            v_user);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_opportunity_design_only(uuid, text) IS
  'Khách chỉ mua thiết kế (0243): đặt cờ, ghi lịch sử; hợp đồng thiết kế ký (hoặc đã ký) thì cơ hội '
  'sang Ký hợp đồng. Cần đã có hợp đồng thiết kế, chưa có hợp đồng thi công.';

REVOKE ALL ON FUNCTION public.mark_opportunity_design_only(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_opportunity_design_only(uuid, text) TO authenticated;

-- --- 10. Chuỗi hồ sơ kèm loại hợp đồng (bản 0159 + cột scope_kind) -----------------------------
DROP FUNCTION IF EXISTS public.record_chain(text, uuid);
CREATE FUNCTION public.record_chain(p_entity_type text, p_id uuid)
RETURNS TABLE (kind text, id uuid, code text, title text, stage text, scope_kind text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp       uuid := public.chain_origin_opportunity(p_entity_type, p_id);
  v_bids      uuid[];
  v_designs   uuid[];
  v_contracts uuid[];
BEGIN
  IF v_opp IS NOT NULL THEN
    SELECT array_agg(b.id) INTO v_bids
      FROM public.bidding_projects b WHERE b.opportunity_id = v_opp AND b.deleted_at IS NULL;
    SELECT array_agg(d.id) INTO v_designs
      FROM public.design_projects d WHERE d.opportunity_id = v_opp AND d.deleted_at IS NULL;
  ELSIF p_entity_type = 'bidding' THEN
    v_bids := ARRAY[p_id];
  ELSIF p_entity_type = 'design' THEN
    v_designs := ARRAY[p_id];
  END IF;

  SELECT array_agg(c.id) INTO v_contracts
    FROM public.contracts c
   WHERE c.deleted_at IS NULL
     AND (
       (c.source_type = 'opportunities' AND c.source_id = v_opp)
       OR (c.source_type = 'bidding_projects' AND c.source_id = ANY (COALESCE(v_bids, '{}')))
       OR (c.source_type = 'design_projects' AND c.source_id = ANY (COALESCE(v_designs, '{}')))
       OR (p_entity_type = 'contract' AND c.id = p_id)
       OR (p_entity_type = 'site' AND c.id = (SELECT s.contract_id FROM public.construction_sites s WHERE s.id = p_id))
     );

  RETURN QUERY
  SELECT 'opportunity'::text, o.id, o.code::text, o.name::text, o.stage::text, NULL::text
    FROM public.opportunities o
   WHERE o.id = v_opp AND o.deleted_at IS NULL
     AND public.rls_company_access(o.company_id) AND public.auth_can_view_module('CRM');

  RETURN QUERY
  SELECT 'bidding'::text, b.id, b.code::text, b.name::text, b.stage::text, NULL::text
    FROM public.bidding_projects b
   WHERE b.id = ANY (COALESCE(v_bids, '{}')) AND public.rls_bidding_project_readable(b.id)
   ORDER BY b.created_at;

  RETURN QUERY
  SELECT 'design'::text, d.id, d.code::text, d.name::text, d.stage::text, NULL::text
    FROM public.design_projects d
   WHERE d.id = ANY (COALESCE(v_designs, '{}')) AND public.rls_design_project_readable(d.id)
   ORDER BY d.created_at;

  RETURN QUERY
  SELECT 'contract'::text, c.id, COALESCE(c.contract_number, c.code)::text, c.title::text, c.stage::text,
         c.scope_kind
    FROM public.contracts c
   WHERE c.id = ANY (COALESCE(v_contracts, '{}')) AND public.rls_contract_readable(c.id)
   ORDER BY c.created_at;

  RETURN QUERY
  SELECT 'site'::text, s.id, s.code::text, s.name::text, s.stage::text, NULL::text
    FROM public.construction_sites s
   WHERE s.deleted_at IS NULL
     AND (s.contract_id = ANY (COALESCE(v_contracts, '{}'))
          OR s.bidding_project_id = ANY (COALESCE(v_bids, '{}'))
          OR s.design_project_id = ANY (COALESCE(v_designs, '{}'))
          OR (p_entity_type = 'site' AND s.id = p_id))
     AND public.rls_site_readable(s.id)
   ORDER BY s.created_at;
END;
$$;

COMMENT ON FUNCTION public.record_chain(text, uuid) IS
  'Chuỗi Cơ hội → Gói thầu/Thiết kế → Hợp đồng → Công trình của một hồ sơ, CHỈ gồm hồ sơ người '
  'gọi được xem (0159). Hợp đồng kèm scope_kind thiết kế / thi công / trọn gói (0243).';

REVOKE ALL ON FUNCTION public.record_chain(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_chain(text, uuid) TO authenticated;

-- --- 11. Điều kiện bước cơ hội (bản 0234, chỉ đổi câu «Ký hợp đồng») -----------------------------
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
        'Khách đang ở mức «Chưa có nhu cầu — lưu để chăm sóc sau» (M1): chỉ đi tiếp khi khách có nhu cầu thật'
      ELSE 'Đã phân loại: khách có nhu cầu thật (M2–M4) và khai loại công trình'
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
                -- 0183: nói đúng tình trạng báo cáo — «gửi báo cáo, chờ duyệt» đọc như ĐÃ gửi rồi,
                -- trong khi báo cáo còn nháp (anh Dũng chạy thử 20/10/2026).
                WHEN v_any_surveyed AND NOT v_surveyed
                THEN CASE (SELECT s.report_status::text FROM public.site_surveys s
                            WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                              AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                            ORDER BY s.surveyed_at DESC LIMIT 1)
                       WHEN 'cho_duyet'
                       THEN 'Báo cáo khảo sát đang chờ Ban Giám đốc duyệt — duyệt xong tự sang Báo giá'
                       WHEN 'tra_ve'
                       THEN 'Báo cáo khảo sát bị Ban Giám đốc trả về — sửa theo ý kiến rồi gửi lại'
                       ELSE 'Đã khảo sát nhưng chưa gửi báo cáo — bấm «Gửi Ban Giám đốc duyệt» ở tab Khảo sát'
                     END
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
           -- 0243: hợp đồng thiết kế ký xong chưa đủ (còn hợp đồng thi công), trừ khi «Chỉ thiết kế».
           CASE WHEN (SELECT design_only_at FROM public.opportunities WHERE id = p_id) IS NOT NULL
                THEN 'Chỉ thiết kế: tự chuyển khi hợp đồng thiết kế được ghi nhận đã ký'
                ELSE 'Tự chuyển khi hợp đồng thi công (hoặc thiết kế – thi công trọn gói) được ghi nhận đã ký — hợp đồng thiết kế ký xong cơ hội vẫn mở'
           END::text, false;
  END IF;
  IF p_entity_type = 'contract' THEN
    SELECT id, value, stage, deleted_at INTO c FROM public.contracts WHERE id = p_id;
    IF NOT FOUND OR c.deleted_at IS NOT NULL OR NOT public.rls_contract_readable(p_id) THEN
      RETURN;
    END IF;

    -- Cùng ba nhóm điều khoản mà `submit_contract_approval` (0027) chặn — đọc trước để màn hình
    -- nói «còn thiếu gì» thay vì để người dùng bấm rồi mới nhận lỗi.
    SELECT array_agg(CASE r.t WHEN 'pham_vi' THEN 'phạm vi công việc'
                              ELSE 'tiến độ thanh toán' END ORDER BY r.n)
      INTO v_missing
      FROM unnest(ARRAY['pham_vi', 'tien_do_thanh_toan']::contract_term_type[])
           WITH ORDINALITY AS r(t, n)
     WHERE NOT EXISTS (SELECT 1 FROM public.contract_terms ct
                        WHERE ct.contract_id = p_id AND ct.deleted_at IS NULL AND ct.term_type = r.t);

    RETURN QUERY SELECT 'cho_duyet'::text, 'value_set'::text,
           COALESCE(c.value, 0) > 0,
           'Có giá trị hợp đồng (lấy từ báo giá / dự toán đã duyệt)'::text, false;

    RETURN QUERY SELECT 'cho_duyet'::text, 'terms_complete'::text,
           v_missing IS NULL,
           CASE WHEN v_missing IS NULL
                THEN 'Đã ghi đủ điều khoản bắt buộc: phạm vi công việc, tiến độ thanh toán'
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

-- --- 12. Hợp đồng đã ký chờ mở công trình (bản 0230): bỏ hợp đồng thiết kế -------------------
-- Hợp đồng thiết kế không bao giờ mở công trình: thi công mở theo hợp đồng thi công / trọn gói.
CREATE OR REPLACE FUNCTION public.contracts_awaiting_site()
RETURNS TABLE (
  contract_id      uuid,
  company_id       uuid,
  code             text,
  contract_number  text,
  title            text,
  customer_name    text,
  signed_date      date,
  source_type      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.company_id, c.code::text, c.contract_number::text, c.title,
         COALESCE(cu.name, c.partner_name)::text, c.signed_date, c.source_type::text
    FROM public.contracts c
    LEFT JOIN public.customers cu ON cu.id = c.customer_id
   WHERE c.deleted_at IS NULL
     AND c.stage = 'da_ky'
     AND c.type::text IN ('thi_cong', 'mua_ban')
     AND public.rls_company_access(c.company_id)
     AND NOT public.auth_is_read_only()
     AND (public.auth_can_approve_module('TC') OR public.auth_can_approve_module('HD'))
     AND NOT EXISTS (
       SELECT 1 FROM public.construction_sites s
        WHERE s.contract_id = c.id AND s.deleted_at IS NULL
     )
   ORDER BY c.signed_date DESC NULLS LAST, c.code;
$$;

NOTIFY pgrst, 'reload schema';
