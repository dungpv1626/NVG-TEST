-- ============================================================================
-- 0255 — Gói B: bốn quyết định nghiệp vụ của anh Dũng sau lượt chạy thử trọn luồng NVC / NVS
-- (30/10/2026, ghi chú `backup/e2e-nvs/ghi-chu.txt`). Chạy lại được.
--
--   1. Đề nghị chi trả tổ đội / thầu phụ mà KHÔNG gắn tổ đội (gõ tay tên tổ — lượt thử để lại
--      NVC-DNTT-2026-0506): CẢNH BÁO, không chặn. `payment_request_crew_warning` trả cờ + lời cho
--      trang đề nghị và hộp Phê duyệt. Cổng `payment_requests_subcontract_gate` (0246) giữ nguyên.
--   2. Nộp thầu bắt buộc có danh mục hồ sơ: trigger `bidding_projects_bid_documents_gate` chặn sang
--      «Nộp thầu» / đánh dấu đã nộp khi gói chưa có đầu mục nào trong `bid_documents`. Gói đã nộp
--      trước migration không bị đụng (chỉ xét lúc CHUYỂN sang nộp). Không sửa `stage_readiness`
--      (gói A giữ hàm đó).
--   3. Vai trò «Kinh doanh NVS» (`KD_NVS`, enum ở 0254): mọi chỗ SQL gọi riêng mã 'KD' nay gọi cả
--      'KD_NVS' — `handover_department_roles` (0249) và thông báo hợp đồng đã ký (`sign_contract`
--      báo vai 'KD' của pháp nhân — bổ sung bằng trigger nhỏ thay vì chép hàm). Quyền phân hệ do
--      seed (`ROLE_SEED`). Mã so dạng `text` (giá trị enum mới chưa commit khi chạy chung giao dịch).
--   4. Đơn thuê giàn giáo NỘI BỘ quá hạn trả → báo thêm chỉ huy trưởng công trình nhận hàng
--      (`construction_sites.responsible_user_id` + người được phân công vai CHT tại công trình),
--      không lộ giá, dẫn tới tab «Giàn giáo» của công trình. `scan_rental_expiry_reminders` chép
--      NGUYÊN VĂN bản 0209, thêm khối 0255.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cảnh báo đề nghị chi trông như trả tổ đội mà không gắn tổ đội
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_request_crew_warning(p_request_id uuid)
RETURNS TABLE (
  warn          boolean,
  matched_crew  text,
  crews         jsonb,
  message       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr        record;
  v_ctype   text;
  v_text    text;
  v_crews   jsonb;
  v_match   text;
  v_looks   boolean;
BEGIN
  SELECT * INTO pr FROM public.payment_requests WHERE id = p_request_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  -- Cùng điều kiện đọc của chính sách `payment_requests_select` (0043): ai không xem được đề nghị
  -- thì không nhận được gì (kể cả tên tổ đội của công trình).
  -- COALESCE: so với cột rỗng ra NULL, mà «NOT NULL» không vào nhánh chặn.
  IF NOT COALESCE(public.rls_company_access(pr.company_id) AND (
            (public.auth_can_view_module('KT') AND public.rls_sees_finance())
            OR pr.requested_by = public.auth_user_id()
            OR pr.advance_user_id = public.auth_user_id()
            OR public.rls_payment_awaiting_me(pr.stage, pr.company_id, pr.origin_module)), false) THEN
    RETURN;
  END IF;

  IF pr.contract_id IS NOT NULL THEN
    SELECT c.type::text INTO v_ctype FROM public.contracts c WHERE c.id = pr.contract_id;
  END IF;

  -- Đã đi đường có kiểm (tổ đội / đợt / biên bản / hợp đồng khoán), hoặc không phải khoản trả:
  -- không cảnh báo. Trả theo đơn hàng là nhà cung cấp.
  IF pr.request_type <> 'thanh_toan'
     OR pr.subcontractor_id IS NOT NULL
     OR pr.subcontract_period_id IS NOT NULL
     OR pr.acceptance_record_id IS NOT NULL
     OR pr.purchase_order_id IS NOT NULL
     OR v_ctype = 'khoan_thau_phu' THEN
    RETURN QUERY SELECT false, NULL::text, '[]'::jsonb, NULL::text;
    RETURN;
  END IF;

  v_text := concat_ws(' ', pr.payee_name, pr.title);

  -- Tổ đội đã đăng ký ở các công trình mà đề nghị phân bổ chi phí vào.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.id, 'name', x.name, 'site_id', x.site_id, 'site_code', x.site_code)
           ORDER BY x.site_code, x.name), '[]'::jsonb)
    INTO v_crews
    FROM (SELECT DISTINCT sc.id, sc.name, s.id AS site_id, s.code AS site_code
            FROM public.payment_request_allocations a
            JOIN public.subcontractors sc ON sc.construction_site_id = a.construction_site_id
                                         AND sc.deleted_at IS NULL
            JOIN public.construction_sites s ON s.id = sc.construction_site_id
           WHERE a.payment_request_id = pr.id) x;

  -- Tên bên nhận / nội dung trùng tên một tổ đội đã đăng ký của pháp nhân.
  SELECT sc.name INTO v_match
    FROM public.subcontractors sc
   WHERE sc.company_id = pr.company_id AND sc.deleted_at IS NULL
     AND length(btrim(sc.name)) >= 3
     AND position(lower(btrim(sc.name)) IN lower(v_text)) > 0
   ORDER BY length(sc.name) DESC
   LIMIT 1;

  -- Chữ thường gặp khi trả tổ đội: «tổ», «đội», «thầu phụ», «nhân công», «khoán» (đứng riêng một từ).
  v_looks := v_text ~* '(^|[^[:alpha:]])(tổ|đội|thầu phụ|nhân công|khoán)([^[:alpha:]]|$)';

  IF v_match IS NULL AND NOT v_looks THEN
    RETURN QUERY SELECT false, NULL::text, v_crews, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    v_match,
    v_crews,
    'Không gắn tổ đội — chưa kiểm khối lượng đã nghiệm thu. '
      || CASE
           WHEN v_match IS NOT NULL THEN format('Bên nhận trùng tên tổ đội đã đăng ký «%s». ', v_match)
           ELSE 'Bên nhận / nội dung trông như trả tổ đội hoặc thầu phụ. '
         END
      || CASE
           WHEN jsonb_array_length(v_crews) > 0 THEN
             'Công trình của đề nghị có tổ đội đã đăng ký — lập đề nghị từ đợt xác nhận khối lượng của tổ để máy kiểm khối lượng và số tiền còn lại.'
           ELSE
             'Nếu đây là tổ đội, đăng ký tổ đội ở công trình và lập đề nghị từ đợt xác nhận khối lượng để máy kiểm.'
         END;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_request_crew_warning(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_request_crew_warning(uuid) TO authenticated;
COMMENT ON FUNCTION public.payment_request_crew_warning(uuid) IS
  '0255: đề nghị chi trông như trả tổ đội / thầu phụ mà không gắn tổ đội → cờ cảnh báo cho người lập và người duyệt. Chỉ cảnh báo, không chặn (anh Dũng 30/10/2026).';

-- ----------------------------------------------------------------------------
-- 2. Nộp thầu bắt buộc có danh mục hồ sơ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bidding_projects_bid_documents_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Việc không có người đăng nhập (seed, kịch bản demo, migration) không bị chặn — như 0247.
  IF public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Chỉ xét lúc CHUYỂN sang nộp: gói đã nộp từ trước không bị đụng.
  IF (NEW.stage::text = 'nop_thau' AND OLD.stage::text IS DISTINCT FROM 'nop_thau' AND OLD.submitted_at IS NULL)
     OR (NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM public.bid_documents d
                    WHERE d.bidding_project_id = NEW.id AND d.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Chưa nộp thầu được vì gói thầu chưa có danh mục hồ sơ. Thêm các đầu mục hồ sơ dự thầu ở tab Hồ sơ thầu trước khi nộp.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bidding_projects_bid_documents_gate ON public.bidding_projects;
CREATE TRIGGER bidding_projects_bid_documents_gate
  BEFORE UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_bid_documents_gate();

COMMENT ON FUNCTION public.bidding_projects_bid_documents_gate() IS
  '0255: không sang «Nộp thầu» / đánh dấu đã nộp khi gói chưa có đầu mục nào trong danh mục hồ sơ thầu (anh Dũng 30/10/2026).';

-- ----------------------------------------------------------------------------
-- 3. Vai trò «Kinh doanh NVS» làm được việc của Kinh doanh
-- ----------------------------------------------------------------------------
-- 3a. Bàn giao sang Thi công (0249): mục của phòng Kinh doanh báo cả Kinh doanh NVS.
CREATE OR REPLACE FUNCTION public.handover_department_roles(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_department
           WHEN 'du_an' THEN ARRAY['DA_DT']
           WHEN 'thiet_ke' THEN ARRAY['TKE']
           -- 0255: thêm KD_NVS.
           WHEN 'kinh_doanh' THEN ARRAY['KD', 'KD_NVS']
           ELSE ARRAY[]::text[] END;
$$;

-- 3b. Hợp đồng đã ký: `sign_contract` (0243) báo vai 'KD' của pháp nhân. Báo thêm vai KD_NVS bằng
-- trigger — không chép lại hàm dài. Người chịu trách nhiệm và người ghi ký đã được báo, bỏ qua.
CREATE OR REPLACE FUNCTION public.contracts_signed_notify_kd_nvs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage::text = 'da_ky' AND OLD.stage::text IS DISTINCT FROM 'da_ky' AND NEW.deleted_at IS NULL THEN
    PERFORM public.create_notification(
      x.uid, NEW.company_id, 'contract_signed',
      format('Hợp đồng %s đã được ký, giá trị %s đồng.', NEW.code, to_char(NEW.value, 'FM999,999,999,999')),
      'contracts', NEW.id,
      format('/hd/hop-dong/%s', NEW.id)
    )
    FROM (SELECT DISTINCT u.id AS uid
            FROM public.users u
            JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
            JOIN public.roles r ON r.id = uc.role_id
           WHERE u.is_active AND u.deleted_at IS NULL
             AND uc.company_id = NEW.company_id
             AND r.code::text = 'KD_NVS'
             AND u.id IS DISTINCT FROM NEW.responsible_user_id
             AND u.id IS DISTINCT FROM public.auth_user_id()
             -- Đã được báo theo vai khác (TC / KT / KD) của cùng pháp nhân.
             AND NOT EXISTS (SELECT 1 FROM public.user_companies uc2
                               JOIN public.roles r2 ON r2.id = uc2.role_id
                              WHERE uc2.user_id = u.id AND uc2.deleted_at IS NULL
                                AND uc2.company_id = NEW.company_id
                                AND r2.code::text IN ('TC', 'KT', 'KD'))) x;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_signed_notify_kd_nvs ON public.contracts;
CREATE TRIGGER contracts_signed_notify_kd_nvs
  AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_signed_notify_kd_nvs();

-- ----------------------------------------------------------------------------
-- 4. Nhắc hết hạn thuê: đơn NỘI BỘ quá hạn báo thêm chỉ huy trưởng công trình nhận hàng
--    Chép NGUYÊN VĂN 0209, thêm khối «0255».
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scan_rental_expiry_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_lead  numeric := public.system_parameter_number('sx.rental_remind_days');
  r       record;
  v_stage smallint;
  v_sent  integer := 0;
BEGIN
  FOR r IN
    SELECT ra.*, c.name AS customer_name
    FROM public.rental_agreements ra
    LEFT JOIN public.customers c ON c.id = ra.customer_id
    WHERE ra.deleted_at IS NULL AND ra.status = 'dang_thue' AND ra.expected_end_date IS NOT NULL
  LOOP
    v_stage := CASE
      WHEN r.expected_end_date < v_today THEN 0
      WHEN v_lead IS NOT NULL AND r.expected_end_date - v_today <= v_lead THEN 1
      ELSE NULL END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN r.expiry_reminded_stage IS NOT NULL AND r.expiry_reminded_stage <= v_stage;

    PERFORM public.create_notification(
      u.id, r.company_id, 'rental_expiry',
      CASE WHEN v_stage = 0 THEN
        format('Đơn thuê %s (%s) đã quá ngày trả dự kiến %s — liên hệ khách thu hồi hoặc gia hạn.',
               r.code, COALESCE(r.customer_name, 'khách'), to_char(r.expected_end_date, 'DD/MM/YYYY'))
      ELSE
        format('Đơn thuê %s (%s) tới ngày trả dự kiến %s, còn %s ngày.', r.code,
               COALESCE(r.customer_name, 'khách'), to_char(r.expected_end_date, 'DD/MM/YYYY'),
               r.expected_end_date - v_today)
      END,
      'rental_agreements', r.id, '/sx/tai-san-cho-thue/' || r.id::text
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (u.id = r.created_by OR EXISTS (
        SELECT 1 FROM public.user_companies uc
        JOIN public.permissions pm ON pm.role_id = uc.role_id
        WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = r.company_id
          AND pm.module_code = 'SX' AND pm.can_edit));

    -- 0255: đơn thuê NỘI BỘ đã quá ngày trả → báo cả chỉ huy trưởng công trình nhận hàng (người chịu
    -- trách nhiệm công trình + người được phân công vai chỉ huy trưởng tại công trình). Lời báo
    -- không có giá, dẫn tới tab «Giàn giáo» của công trình; thông báo thuộc pháp nhân của công trình.
    IF v_stage = 0 AND r.is_internal AND r.construction_site_id IS NOT NULL THEN
      PERFORM public.create_notification(
        x.uid, x.site_company_id, 'rental_expiry',
        format('Giàn giáo thuê nội bộ theo đơn %s ở công trình %s đã quá ngày trả dự kiến %s — trả lại Xưởng hoặc đề nghị gia hạn.',
               r.code, x.site_code, to_char(r.expected_end_date, 'DD/MM/YYYY')),
        'construction_sites', r.construction_site_id,
        '/tc/cong-trinh/' || r.construction_site_id::text || '?tab=gian-giao'
      )
      FROM (
        SELECT DISTINCT u.id AS uid, s.company_id AS site_company_id, s.code AS site_code
          FROM public.construction_sites s
          JOIN public.users u ON u.is_active AND u.deleted_at IS NULL
         WHERE s.id = r.construction_site_id
           AND u.id IS DISTINCT FROM r.created_by
           AND (u.id = s.responsible_user_id
                OR EXISTS (
                  SELECT 1 FROM public.user_site_assignments a
                   WHERE a.construction_site_id = s.id AND a.user_id = u.id AND a.deleted_at IS NULL
                     AND a.assigned_from <= v_today
                     AND (a.assigned_to IS NULL OR a.assigned_to >= v_today)
                     AND EXISTS (SELECT 1 FROM public.user_companies uc
                                   JOIN public.roles ro ON ro.id = uc.role_id
                                  WHERE uc.user_id = u.id AND uc.deleted_at IS NULL
                                    AND uc.company_id = s.company_id AND ro.code::text = 'CHT')))
      ) x;
    END IF;

    UPDATE public.rental_agreements SET expiry_reminded_stage = v_stage WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_rental_expiry_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_rental_expiry_reminders() TO service_role;

NOTIFY pgrst, 'reload schema';
