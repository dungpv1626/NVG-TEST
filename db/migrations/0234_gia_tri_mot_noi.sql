-- ============================================================================
-- Giá trị hợp đồng nhập ở MỘT nơi (anh Dũng 28/10/2026: «nhập ở 1 nơi thôi»).
--
-- Trước đây giá trị nằm hai chỗ: cột `contracts.value` (văn bản in số này, hạn mức duyệt dùng số này)
-- và nhóm điều khoản «Giá trị hợp đồng» (một dòng chữ + số tiền, văn bản KHÔNG in). Hai số lệch nhau
-- là chuyện thật (27/10/2026). Nay chỉ còn `contracts.value`, sửa ở bước «1. Thông tin» của tab Soạn
-- hợp đồng; nhóm `gia_tri` thôi là điều khoản bắt buộc. Giá trị enum giữ để dòng cũ đọc được.
--
-- Hai hàm chép nguyên bản mới nhất, chỉ bỏ 'gia_tri' khỏi danh sách nhóm bắt buộc:
--   · stage_readiness — bản 0183.
--   · submit_contract_approval — bản 0223 (đã chặn riêng «chưa có giá trị hợp đồng»).
-- ============================================================================

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

CREATE OR REPLACE FUNCTION public.submit_contract_approval(p_contract_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.auth_user_id();
  c          record;
  v_missing  integer;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_drafts_contract(c.responsible_user_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  IF c.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng này đã được trình ký.';
  END IF;

  IF c.value IS NULL OR c.value <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá trị hợp đồng. Nhập giá trị trước khi trình ký.';
  END IF;

  -- HD-02 liệt kê tám nhóm điều khoản phải theo dõi. Ba nhóm dưới đây là những nhóm mà
  -- thiếu chúng thì hợp đồng không thực hiện được, nên chặn ngay ở bước trình ký — phát
  -- hiện sau khi đã ký là quá muộn để bổ sung.
  SELECT count(*) INTO v_missing
    FROM unnest(ARRAY['pham_vi', 'tien_do_thanh_toan']::contract_term_type[]) AS r(t)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.contract_terms ct
      WHERE ct.contract_id = p_contract_id AND ct.deleted_at IS NULL AND ct.term_type = r.t
   );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Còn % nhóm điều khoản bắt buộc chưa ghi (phạm vi công việc, tiến độ thanh toán). Kiểm tra tab Điều khoản.', v_missing;
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    c.company_id, 'contract', 'contracts', c.id, c.code,
    format('Hợp đồng %s — %s', c.code, c.title),
    c.value, c.notes, 'pending_approval', v_user,
    -- Hạn duyệt bám ngày bắt đầu thực hiện: duyệt sau khi đã phải khởi công thì vô nghĩa.
    c.start_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.contracts
     SET stage = 'cho_duyet', updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  RETURN v_approval;
END;
$function$;

-- Nhận soạn thay.
CREATE OR REPLACE FUNCTION public.take_over_contract(p_contract_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;
  IF NOT public.auth_can_approve_module('HD') OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Chỉ Ban Giám đốc nhận soạn thay được hợp đồng.';
  END IF;
  IF c.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng đã gửi phê duyệt — chỉ nhận soạn thay được khi còn Nháp.';
  END IF;
  IF c.responsible_user_id = v_user THEN
    RAISE EXCEPTION 'Đang là người chịu trách nhiệm của hợp đồng này.';
  END IF;

  UPDATE public.contracts SET responsible_user_id = v_user, updated_by = v_user, updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, c.company_id, 'take_over_contract', 'contracts', c.id,
          jsonb_build_object('responsible_user_id', c.responsible_user_id),
          jsonb_build_object('responsible_user_id', v_user),
          nullif(btrim(coalesce(p_reason, '')), ''));

  IF c.responsible_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      c.responsible_user_id, c.company_id, 'contract_taken_over',
      format('%s đã nhận soạn thay hợp đồng %s%s.',
             (SELECT full_name FROM public.users WHERE id = v_user), c.code,
             CASE WHEN nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN ''
                  ELSE ' — ' || btrim(p_reason) END),
      'contracts', c.id,
      format('/hd/hop-dong/%s', c.id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_contract(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_over_contract(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_drafts_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_drafts_contract(uuid) TO authenticated;
