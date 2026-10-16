-- 0166 — Kết thúc công trình chỉ khi đã hết bảo hành.
--
-- Chạy thử chặng cuối bằng đúng vai: vừa bàn giao xong, nút chính là «Kết thúc công trình» và
-- bấm được ngay — chưa khai hạng mục bảo hành nào, thời hạn bảo hành mới bắt đầu. Kết thúc sớm
-- thì công trình biến khỏi danh sách đang theo dõi trong khi khách còn quyền gọi bảo hành, và
-- hợp đồng quyết toán được (0157 chỉ đòi công trình ở Bảo hành / Hoàn thành).
--
--  1. `stage_readiness('site')` thêm điều kiện của «Kết thúc»: đã khai hạng mục bảo hành, mọi hạng
--     mục đã hết hạn, không còn yêu cầu bảo hành đang mở.
--  2. Trigger `construction_sites_ready_to_start` (0164) kiểm cả bước Kết thúc — đổi tên ý nghĩa
--     thành «đủ điều kiện bước», giữ tên trigger để không phải đổi thứ tự trigger.
--  3. `warranties_fill_dates` (0035) tính lại ngày hết hạn khi sửa ngày bắt đầu / thời hạn. Trước
--     đây chỉ tính khi ô còn trống: sửa ngày bắt đầu thì hạng mục giữ ngày hết hạn cũ — điều kiện
--     «đã hết hạn» ở mục 1 sẽ đọc một ngày sai (thấy khi viết phép thử).

-- --- 1. Điều kiện bước -----------------------------------------------------------------------
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

-- --- 2. Chặn ở CSDL ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.construction_sites_ready_to_start()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_missing text;
BEGIN
  -- Không người dùng (seed, tác vụ hệ thống): bỏ qua, như 0157. Lệnh UPDATE thẳng từ trình
  -- duyệt: để `construction_sites_stage_guard` (0028) từ chối với câu của nó.
  IF public.auth_user_id() IS NULL OR current_user = 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF (OLD.stage = 'chuan_bi' AND NEW.stage = 'dang_thi_cong')
     OR (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'hoan_thanh') THEN
    SELECT string_agg(r.label, '; ') INTO v_missing
      FROM public.stage_readiness('site', NEW.id) r
     WHERE r.for_stage = NEW.stage::text AND NOT r.met;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'Chưa chuyển được sang «%». Cần: %.',
        CASE WHEN NEW.stage = 'hoan_thanh' THEN 'Kết thúc' ELSE 'Đang thi công' END, v_missing;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.construction_sites_ready_to_start() IS
  'Chặn khởi công (0164) và kết thúc công trình (0166) khi chưa đủ điều kiện của stage_readiness.';

-- --- 3. Sửa ngày bắt đầu / thời hạn thì tính lại ngày hết hạn ----------------------------------
CREATE OR REPLACE FUNCTION public.warranties_fill_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_handover timestamptz;
BEGIN
  IF NEW.start_date IS NULL THEN
    SELECT s.handed_over_at INTO v_handover
      FROM public.construction_sites s WHERE s.id = NEW.construction_site_id;
    NEW.start_date := COALESCE(v_handover::date, current_date);
  END IF;

  -- 0166: khi sửa, ngày bắt đầu / thời hạn đổi mà ngày hết hạn không được sửa tay cùng lúc thì
  -- tính lại — giữ ngày cũ là nói sai hạng mục còn hay hết bảo hành.
  IF TG_OP = 'UPDATE' AND NEW.duration_months IS NOT NULL
     AND NEW.warranty_until IS NOT DISTINCT FROM OLD.warranty_until
     AND (NEW.start_date IS DISTINCT FROM OLD.start_date
          OR NEW.duration_months IS DISTINCT FROM OLD.duration_months) THEN
    NEW.warranty_until := NULL;
  END IF;

  IF NEW.warranty_until IS NULL AND NEW.duration_months IS NOT NULL THEN
    NEW.warranty_until := (NEW.start_date + make_interval(months => NEW.duration_months))::date;
  END IF;

  -- Trạng thái phải khớp với ngày: một hạng mục ghi "còn hạn" mà ngày hết hạn đã qua là
  -- đúng thứ sẽ bị chủ đầu tư chỉ ra trong biên bản. Gia hạn thì quay lại «còn hạn».
  IF NEW.warranty_until IS NOT NULL AND NEW.warranty_until < current_date
     AND NEW.status = 'con_han' THEN
    NEW.status := 'het_han';
  ELSIF NEW.warranty_until IS NOT NULL AND NEW.warranty_until >= current_date
     AND NEW.status = 'het_han' THEN
    NEW.status := 'con_han';
  END IF;

  RETURN NEW;
END;
$$;
