-- 0164 — Chặng Công trình: bước «Chuẩn bị» có việc để làm, chỉ huy trưởng được báo.
--
-- Rà chuỗi bước bằng đúng vai (doc/MOC_CAI_TIEN_UX.md): bước Chuẩn bị ghi «Trưởng phòng Thi công
-- phân công và khởi công», nhưng công trình mở từ hợp đồng không có chỗ chọn chỉ huy trưởng hay
-- ghi ngày khởi công, và «Bắt đầu thi công» đi thẳng không cần gì — cùng loại lỗi với ô Phân loại
-- của cơ hội (0160).
--
--  1. `stage_readiness('site', id)`: khởi công cần chỉ huy trưởng + ngày khởi công / hoàn thành
--     dự kiến; bàn giao cần biên bản nghiệm thu chủ đầu tư (đúng điều kiện của move_site_stage).
--  2. Trigger chặn khởi công khi thiếu — trên bảng, để mọi đường đổi bước đều đi qua. Bỏ qua khi
--     không có người dùng đăng nhập (seed, tác vụ hệ thống), cùng cách 0157.
--  3. Báo chỉ huy trưởng khi được phân công vào công trình.
--  4. `open_site_from_contract` (chép nguyên từ 0035, đổi hai chỗ): Ban Giám đốc mở được công
--     trình — khớp trigger 0157 và nút trên màn hình hợp đồng; không tự lấy người phụ trách hợp
--     đồng làm chỉ huy công trình.
--  5. `site_commander_candidates`: người chọn được làm chỉ huy trưởng (cùng điều kiện mục 1).

-- --- 1. Điều kiện bước — thêm nhánh công trình ---------------------------------------------
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
    v_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                           WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                             AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now());

    RETURN QUERY SELECT 'khao_sat'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY SELECT 'bao_gia'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'survey_done'::text,
           v_surveyed OR o.survey_waived_reason IS NOT NULL,
           CASE WHEN NOT v_surveyed AND o.survey_waived_reason IS NOT NULL
                THEN 'Bỏ qua khảo sát: ' || o.survey_waived_reason
                ELSE 'Đã khảo sát hiện trạng (biên bản có thời điểm đã khảo sát)' END,
           true;

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
  END IF;
END;
$$;

-- --- 2. Khởi công phải có chỉ huy trưởng và ngày dự kiến --------------------------------------
CREATE OR REPLACE FUNCTION public.construction_sites_ready_to_start()
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
  IF OLD.stage = 'chuan_bi' AND NEW.stage = 'dang_thi_cong' THEN
    SELECT string_agg(r.label, '; ') INTO v_missing
      FROM public.stage_readiness('site', NEW.id) r
     WHERE r.for_stage = 'dang_thi_cong' AND NOT r.met;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Chưa khởi công được. Cần: %.', v_missing;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_ready_to_start ON public.construction_sites;
CREATE TRIGGER construction_sites_ready_to_start
  BEFORE UPDATE OF stage ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_ready_to_start();

-- --- 3. Báo chỉ huy trưởng được phân công ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.construction_sites_notify_commander()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsible_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.responsible_user_id IS DISTINCT FROM OLD.responsible_user_id)
     AND NEW.responsible_user_id IS DISTINCT FROM public.auth_user_id() THEN
    PERFORM public.create_notification(
      NEW.responsible_user_id, NEW.company_id, 'site_assigned',
      format('Được phân công chỉ huy công trình %s — %s.', NEW.code, NEW.name),
      'construction_sites', NEW.id,
      format('/tc/cong-trinh/%s', NEW.id)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_notify_commander ON public.construction_sites;
CREATE TRIGGER construction_sites_notify_commander
  AFTER INSERT OR UPDATE OF responsible_user_id ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_notify_commander();

-- --- 4. Ban Giám đốc mở được công trình từ hợp đồng ------------------------------------------
CREATE OR REPLACE FUNCTION public.open_site_from_contract(
  p_contract_id uuid,
  p_name text DEFAULT NULL,
  p_site_address text DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL,
  p_planned_end_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_bid    uuid;
  v_design uuid;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     -- 0164: Ban Giám đốc (approve HD) hoặc Thi công mở công trình — khớp trigger
     -- construction_sites_open_permission (0157). Trước đây đòi quyền SỬA TC/HD: TGĐ chỉ có
     -- quyền duyệt HD nên bị từ chối dù nút «Mở công trình» hiện cho TGĐ.
     OR NOT (public.auth_can_edit_module('TC') OR public.auth_can_approve_module('HD')
             OR public.auth_can_approve_module('TC')) THEN
    RAISE EXCEPTION 'Không mở được công trình từ hợp đồng này.';
  END IF;

  -- Mở công trình trước khi ký nghĩa là bắt đầu tiêu ngân sách của một hợp đồng có thể
  -- không bao giờ được ký.
  IF c.stage <> 'da_ky' THEN
    RAISE EXCEPTION 'Chỉ mở công trình sau khi hợp đồng đã được ký.';
  END IF;

  -- Hợp đồng khoán/thầu phụ là hợp đồng NVG đi THUÊ, nằm bên trong một công trình đã có —
  -- nó không sinh ra công trình mới (xem `subcontractors.contract_id`).
  IF c.type = 'khoan_thau_phu' THEN
    RAISE EXCEPTION 'Hợp đồng khoán tổ đội không mở ra công trình mới. Gắn hợp đồng này vào tổ đội của công trình đang thi công.';
  END IF;

  -- Một hợp đồng mở MỘT công trình.
  --
  -- ⚠️ SUY LUẬN có chủ đích. Lược đồ cho phép nhiều công trình trên một hợp đồng (hợp đồng
  -- chia nhiều hạng mục, nhiều địa điểm là chuyện có thật), nhưng chưa có khảo sát Chỉ huy –
  -- Giám sát công trường để biết NVG có làm vậy không. Trong khi chờ, rủi ro thật và hay gặp
  -- hơn nhiều là bấm nút hai lần rồi có hai công trình song song cùng chia nhau một bộ ngân
  -- sách — và không ai phát hiện cho tới lúc đối chiếu lãi/lỗ. Khi khảo sát xác nhận cần
  -- nhiều công trình, thêm một tham số cho phép tường minh, đừng bỏ hẳn kiểm tra này.
  IF EXISTS (
    SELECT 1 FROM public.construction_sites s
     WHERE s.contract_id = p_contract_id AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hợp đồng này đã có công trình. Mở công trình đó để tiếp tục thi công.';
  END IF;

  IF c.source_type = 'bidding_projects' THEN
    v_bid := c.source_id;
  ELSIF c.source_type = 'design_projects' THEN
    v_design := c.source_id;
  END IF;

  RETURN public.open_construction_site(
    c.company_id,
    COALESCE(NULLIF(btrim(p_name), ''), c.title),
    c.id, v_bid, v_design,
    p_site_address,
    -- 0164: KHÔNG lấy người phụ trách hợp đồng (thường là Kinh doanh) làm chỉ huy công trình —
    -- để trống cho Thi công phân công ở bước Chuẩn bị.
    p_responsible_user_id,
    COALESCE(p_planned_start_date, c.start_date),
    COALESCE(p_planned_end_date, c.end_date)
  );
END;
$$;


-- --- 5. Danh sách người chọn được làm chỉ huy trưởng -------------------------------------------
-- Ô chọn chỉ liệt kê người làm thi công (quyền sửa Module TC) của pháp nhân công trình — cùng
-- điều kiện với `commander_assigned` ở trên, để không chọn được người mà điều kiện sẽ bác.
CREATE OR REPLACE FUNCTION public.site_commander_candidates(p_company_id uuid)
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT u.id, u.full_name::text
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.permissions pm ON pm.role_id = uc.role_id
   WHERE public.rls_company_access(p_company_id)
     AND u.is_active AND u.deleted_at IS NULL
     AND pm.module_code = 'TC' AND pm.can_edit
     AND (uc.company_id = p_company_id OR r.sees_all_companies)
   ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.site_commander_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_commander_candidates(uuid) TO authenticated;
