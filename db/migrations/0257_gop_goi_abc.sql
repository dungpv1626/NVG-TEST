-- 0257 — Gộp gói A / B / C (30/10/2026): `stage_readiness` chép NGUYÊN VĂN bản 0253, thêm hai chỗ của gói C (0256):
--   1. Bước Đàm phán của cơ hội chấp nhận báo giá thuê NVS đã duyệt + đã gửi khách (trước chỉ trigger tự đẩy; kéo tay bị chặn).
--   2. Hợp đồng cho thuê: điều kiện quyết toán là mọi đơn thuê đã tất toán, thay dòng «mọi công trình đã bàn giao».
-- Bản mới nhất của `stage_readiness` nay ở 0257. Chạy lại được.

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
  v_bid        record;
  -- 0253
  v_budget     text;
  v_dproblem   text;
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
                                          'ban_giao', 'dung_thiet_ke'))
            -- 0257: báo giá thuê NVS (0256) đã duyệt và đã gửi khách cũng tính.
            OR EXISTS (SELECT 1 FROM public.rental_quotes rq
                        WHERE rq.opportunity_id = p_id AND rq.deleted_at IS NULL
                          AND rq.status = 'da_duyet' AND rq.sent_to_customer_at IS NOT NULL)),
           'Báo giá (hoặc báo giá thuê) đã duyệt và đã gửi khách, hoặc gói thầu đã nộp, hoặc phương án thiết kế đã gửi khách duyệt'::text,
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
    SELECT id, value, stage, deleted_at, scope_kind INTO c FROM public.contracts WHERE id = p_id;
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

    -- 0257: hợp đồng cho thuê không có công trình — dòng «mọi công trình đã bàn giao» vô nghĩa (đúng rỗng);
    -- thay bằng «mọi đơn thuê đã tất toán», đúng điều kiện trigger `contracts_rental_settlement_gate` (0256) chặn.
    IF (SELECT ct.type::text FROM public.contracts ct WHERE ct.id = p_id) = 'cho_thue' THEN
      RETURN QUERY SELECT 'hoan_thanh'::text, 'rentals_settled'::text,
             public.contract_rental_settlement_problem(p_id) IS NULL,
             COALESCE('Chưa quyết toán được: ' || public.contract_rental_settlement_problem(p_id),
                      'Mọi đơn thuê của hợp đồng đã tất toán'), false;
    ELSE
    RETURN QUERY SELECT 'hoan_thanh'::text, 'sites_done'::text,
           NOT EXISTS (SELECT 1 FROM public.construction_sites s
                        WHERE s.contract_id = p_id AND s.deleted_at IS NULL
                          AND s.stage NOT IN ('bao_hanh', 'hoan_thanh')),
           'Mọi công trình của hợp đồng đã sang Bảo hành hoặc Hoàn thành'::text, false;
    END IF;

    -- 0253 (việc 1): hợp đồng thiết kế quyết toán khi khách đã duyệt hồ sơ kỹ thuật — đúng điều kiện
    -- trigger `contracts_design_settlement_gate` chặn.
    IF c.scope_kind = 'thiet_ke' THEN
      v_dproblem := public.contract_design_settlement_problem(p_id);
      RETURN QUERY SELECT 'hoan_thanh'::text, 'design_tech_approved'::text,
             v_dproblem IS NULL,
             COALESCE(v_dproblem, 'Khách đã duyệt hồ sơ kỹ thuật của hồ sơ thiết kế'),
             false;
    END IF;
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

    -- 0253 (việc 3): ngân sách thi công ban đầu đã được Tổng Giám đốc duyệt, hoặc dựng từ dự toán đã
    -- duyệt (DA-09). Trigger 0164 `construction_sites_ready_to_start` đọc lại hàm này nên chặn mọi đường.
    v_budget := public._site_budget_state(p_id);
    RETURN QUERY SELECT 'dang_thi_cong'::text, 'budget_approved'::text,
           v_budget IN ('da_duyet', 'theo_du_toan'),
           CASE v_budget
             WHEN 'da_duyet'     THEN 'Ngân sách thi công đã được Tổng Giám đốc duyệt'
             WHEN 'theo_du_toan' THEN 'Ngân sách thi công dựng từ dự toán đã duyệt'
             WHEN 'cho_duyet'    THEN 'Ngân sách thi công đang chờ Tổng Giám đốc duyệt'
             WHEN 'tra_ve'       THEN 'Ngân sách thi công bị trả lại — sửa rồi gửi duyệt lại (tab Ngân sách)'
             WHEN 'nhap'         THEN 'Gửi Tổng Giám đốc duyệt ngân sách thi công (tab Ngân sách)'
             ELSE 'Lập ngân sách thi công và gửi Tổng Giám đốc duyệt (tab Ngân sách)'
           END::text,
           false;

    -- 0249 (G4): điều kiện khởi công bắt buộc của danh mục pháp nhân (pháp lý, an toàn… — DỮ LIỆU ở
    -- `site_checklist_items`). Công trình không có mục bắt buộc thì không đòi.
    IF EXISTS (SELECT 1 FROM public.site_checklist_items ci
                WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong' AND ci.is_required) THEN
      RETURN QUERY SELECT 'dang_thi_cong'::text, 'start_conditions'::text,
             NOT EXISTS (SELECT 1 FROM public.site_checklist_items ci
                          WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong'
                            AND ci.is_required AND ci.status <> 'da_dat'),
             COALESCE('Xác nhận đủ điều kiện khởi công bắt buộc (còn: '
                      || (SELECT string_agg(ci.label, ', ' ORDER BY ci.position) FROM public.site_checklist_items ci
                           WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong'
                             AND ci.is_required AND ci.status <> 'da_dat') || ')',
                      'Đã xác nhận đủ điều kiện khởi công bắt buộc'),
             false;
    END IF;

    -- 0249 (G4): gói bàn giao bắt buộc — CHỈ chặn khi pháp nhân đặt `tc.handover_blocks_start` = 1.
    -- Để trống thì chỉ cảnh báo trên khối Chuẩn bị khởi công (danh mục vẫn đọc được qua `site_checklist`).
    IF public.system_parameter_number('tc.handover_blocks_start', 'company',
                                      (SELECT cs.company_id FROM public.construction_sites cs WHERE cs.id = p_id)) = 1
       AND EXISTS (SELECT 1 FROM public.site_checklist_items ci
                    WHERE ci.construction_site_id = p_id AND ci.kind = 'ban_giao' AND ci.is_required) THEN
      RETURN QUERY SELECT 'dang_thi_cong'::text, 'handover_received'::text,
             NOT EXISTS (SELECT 1 FROM public.site_checklist_items ci
                          WHERE ci.construction_site_id = p_id AND ci.kind = 'ban_giao'
                            AND ci.is_required AND ci.status <> 'da_nhan'),
             'Thi công đã nhận đủ mục bàn giao bắt buộc'::text, false;
    END IF;

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
  -- 0247 (G6): gói thầu — Ban Giám đốc duyệt tham gia trước khi lập dự toán và trước khi trình giá.
  -- Đúng điều kiện mà `estimates_participation_gate` / `bidding_projects_participation_gate` chặn.
  IF p_entity_type = 'bidding' THEN
    SELECT id, stage, participation_status, deleted_at INTO v_bid
      FROM public.bidding_projects WHERE id = p_id;
    IF NOT FOUND OR v_bid.deleted_at IS NOT NULL OR NOT public.rls_bidding_project_readable(p_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT s.st, 'participation_approved'::text,
           v_bid.participation_status IN ('da_duyet', 'truoc_quy_dinh'),
           CASE v_bid.participation_status
             WHEN 'da_duyet' THEN 'Ban Giám đốc đã duyệt tham gia gói thầu'
             WHEN 'truoc_quy_dinh' THEN 'Gói thầu lập trước khi có bước quyết định tham gia — không đòi'
             ELSE public.bid_participation_block_reason(v_bid.participation_status)
           END::text,
           false
      FROM unnest(ARRAY['du_toan', 'cho_duyet_gia']) AS s(st);
  END IF;
END;
$$;
