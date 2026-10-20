-- ============================================================================
-- Nhãn phân loại khách bằng lời (anh Dũng 20/10/2026: «M1–M4 khó nhìn vì phải nhớ ký hiệu»).
--
-- Chỉ đổi CÂU CHỮ trả ra màn hình; điều kiện không đổi. Hai hàm chép nguyên bản mới nhất:
--   · stage_readiness — bản 0182 (dòng điều kiện «classified»).
--   · my_crm_followups — bản 0173 (việc «liên hệ lại» của đầu mối lưu trữ).
-- ============================================================================

-- stage_readiness — chép nguyên bản 0182, chỉ đổi nhãn phân loại.
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

-- my_crm_followups — chép nguyên bản 0173, chỉ đổi nhãn việc liên hệ lại.
CREATE OR REPLACE FUNCTION public.crm_followups_for(p_user uuid, p_until date)
RETURNS TABLE (
  kind text,
  entity_id uuid,
  code text,
  title text,
  action text,
  due_date date,
  company_code text,
  path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lead_items AS (
    SELECT
      CASE l.status WHEN 'moi' THEN 'lead_first_contact'
                    WHEN 'luu_tru' THEN 'lead_recontact'
                    ELSE 'lead_followup' END AS kind,
      l.id AS entity_id, l.code::text AS code, l.full_name AS title,
      CASE l.status WHEN 'moi' THEN 'Liên hệ lần đầu'
                    WHEN 'luu_tru' THEN 'Liên hệ lại — khách chưa có nhu cầu (M1)'
                    ELSE COALESCE(l.next_action, 'Liên hệ tiếp') END AS action,
      CASE l.status WHEN 'moi' THEN (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                    WHEN 'luu_tru' THEN l.recontact_at
                    ELSE l.next_action_at END AS due_date,
      c.code::text AS company_code,
      '/crm/dau-moi/' || l.id AS path
    FROM public.leads l
    JOIN public.companies c ON c.id = l.company_id
    WHERE l.owner_id = p_user
      AND l.deleted_at IS NULL
      AND l.converted_at IS NULL
      AND l.status IN ('moi', 'da_lien_he', 'luu_tru')
  ),
  opp_latest AS (
    SELECT DISTINCT ON (cl.opportunity_id) cl.*
    FROM public.contact_logs cl
    WHERE cl.opportunity_id IS NOT NULL
    ORDER BY cl.opportunity_id, cl.contacted_at DESC, cl.created_at DESC
  ),
  opp_items AS (
    SELECT 'opportunity_followup', o.id, o.code::text, o.name, ol.next_action, ol.next_action_at,
           c.code::text, '/crm/co-hoi/' || o.id || '?tab=cham-soc'
    FROM opp_latest ol
    JOIN public.opportunities o ON o.id = ol.opportunity_id
    JOIN public.companies c ON c.id = o.company_id
    WHERE o.owner_id = p_user
      AND o.deleted_at IS NULL
      AND o.stage NOT IN ('ky_hop_dong', 'mat_co_hoi')
      AND NOT ol.closes_followup
      AND ol.next_action_at IS NOT NULL
  ),
  customer_latest AS (
    SELECT DISTINCT ON (cl.customer_id, cl.company_id) cl.*
    FROM public.contact_logs cl
    WHERE cl.customer_id IS NOT NULL AND cl.opportunity_id IS NULL AND cl.lead_id IS NULL
    ORDER BY cl.customer_id, cl.company_id, cl.contacted_at DESC, cl.created_at DESC
  ),
  customer_items AS (
    SELECT 'customer_followup', k.id, k.code::text, k.name, cl.next_action, cl.next_action_at,
           c.code::text, '/crm/khach-hang/' || k.id || '?tab=cham-soc'
    FROM customer_latest cl
    JOIN public.customers k ON k.id = cl.customer_id AND k.deleted_at IS NULL
    JOIN public.companies c ON c.id = cl.company_id
    WHERE cl.created_by = p_user
      AND NOT cl.closes_followup
      AND cl.next_action_at IS NOT NULL
  )
  SELECT * FROM (
    SELECT * FROM lead_items
    UNION ALL SELECT * FROM opp_items
    UNION ALL SELECT * FROM customer_items
  ) t
  WHERE t.due_date IS NOT NULL AND t.due_date <= p_until
  ORDER BY t.due_date, t.title
$$;
