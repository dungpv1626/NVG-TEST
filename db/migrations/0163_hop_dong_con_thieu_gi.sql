-- 0163 — Chặng Đàm phán → Hợp đồng → Ký: biết còn thiếu gì trước khi gửi duyệt, người soạn được
-- báo kết quả duyệt.
--
-- Rà chuỗi bước bằng đúng vai (doc/MOC_CAI_TIEN_UX.md): nút «Gửi phê duyệt» hợp đồng không cho
-- biết trước còn thiếu gì — bấm rồi mới nhận «Còn 3 nhóm điều khoản…»; duyệt xong người soạn
-- không được báo (sign_contract có báo, decide_approval thì không).
--
--  1. `stage_readiness('contract', id)`: điều kiện gửi phê duyệt (giá trị, ba nhóm điều khoản
--     bắt buộc — đúng điều kiện của submit_contract_approval) và quyết toán (công trình đã bàn
--     giao — đúng trigger contracts_stage_permissions 0157). Đọc theo rls_contract_readable.
--  2. Trigger báo người chịu trách nhiệm hợp đồng khi phê duyệt nội bộ xong / bị từ chối.

-- --- 1. Điều kiện bước — thêm nhánh hợp đồng -----------------------------------------------
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
END;
$$;

-- --- 2. Báo kết quả phê duyệt hợp đồng ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_decision_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stage = 'cho_duyet' AND NEW.stage IN ('da_duyet', 'nhap')
     AND NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.responsible_user_id, NEW.company_id,
      CASE WHEN NEW.stage = 'da_duyet' THEN 'contract_approved' ELSE 'contract_rejected' END,
      CASE WHEN NEW.stage = 'da_duyet'
           THEN format('Hợp đồng %s đã được phê duyệt — Ban Giám đốc ký với khách rồi ghi nhận đã ký.', NEW.code)
           ELSE format('Hợp đồng %s bị từ chối — xem lý do, sửa rồi gửi phê duyệt lại.', NEW.code)
      END,
      'contracts', NEW.id,
      format('/hd/hop-dong/%s', NEW.id)
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contracts_decision_notify ON public.contracts;
CREATE TRIGGER contracts_decision_notify
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_decision_notify();
