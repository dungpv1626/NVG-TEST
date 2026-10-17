-- ============================================================================
-- Đợt 1 — 1E: hợp đồng gửi phê duyệt KÈM VĂN BẢN (chủ dự án chốt «gửi sếp duyệt kèm văn bản»).
--
--   · Pháp nhân đã có mẫu Word đang dùng cho loại hợp đồng (và hình thức giá, nếu mẫu khai) thì
--     phải lập văn bản trước khi gửi phê duyệt — `contract_requires_document`.
--   · Lúc gửi, ghi lại bản đang gửi (`submitted_document_id`); lúc duyệt, bản đó thành bản đã duyệt
--     (`approved_document_id`). Người duyệt xem văn bản ngay trong Hộp thư.
--   · Chỉ lập văn bản khi hợp đồng còn Nháp: đang chờ duyệt mà đổi văn bản thì người duyệt duyệt
--     một bản, ký một bản khác. Bị trả về → Nháp → lập bản mới (bắt buộc lý do — 0171).
-- Quy tắc đặt ở TRIGGER trên `contracts` (CLAUDE.md 9.4 «quy tắc hợp đồng ở trigger, không chép
-- lại hàm dài»): `submit_contract_approval` và `decide_approval` không phải sửa.
-- ============================================================================

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS submitted_document_id uuid
    REFERENCES public.contract_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_document_id uuid
    REFERENCES public.contract_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.contracts.submitted_document_id IS
  'Văn bản (bản điền từ mẫu) đang gửi phê duyệt — đặt bởi trigger lúc Nháp → Chờ duyệt (0176).';
COMMENT ON COLUMN public.contracts.approved_document_id IS
  'Văn bản đã được duyệt — bản sẽ ký. Đặt bởi trigger lúc Chờ duyệt → Đã duyệt (0176).';

-- Mẫu áp cho hợp đồng: cùng pháp nhân, cùng loại hợp đồng, đang dùng, và hình thức giá trùng
-- (mẫu để trống hình thức giá thì áp cho mọi hình thức).
CREATE OR REPLACE FUNCTION public.contract_requires_document(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contracts c
    JOIN public.contract_templates t
      ON t.company_id = c.company_id AND t.contract_type = c.type AND t.is_active
     AND (t.price_form IS NULL OR t.price_form = c.price_form)
    WHERE c.id = p_contract_id
  );
$$;

REVOKE ALL ON FUNCTION public.contract_requires_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_requires_document(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contracts_document_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc uuid;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    -- Hai cột này chỉ trigger ghi.
    NEW.submitted_document_id := OLD.submitted_document_id;
    NEW.approved_document_id := OLD.approved_document_id;
    RETURN NEW;
  END IF;

  IF OLD.stage = 'nhap' AND NEW.stage = 'cho_duyet' THEN
    SELECT d.id INTO v_doc FROM public.contract_documents d
     WHERE d.contract_id = NEW.id ORDER BY d.version DESC LIMIT 1;
    IF v_doc IS NULL AND public.contract_requires_document(NEW.id) THEN
      RAISE EXCEPTION 'Lập văn bản hợp đồng từ mẫu ở tab Văn bản trước khi gửi phê duyệt — người duyệt cần xem đúng văn bản sẽ ký.';
    END IF;
    NEW.submitted_document_id := v_doc;
    NEW.approved_document_id := NULL;
  ELSIF OLD.stage = 'cho_duyet' AND NEW.stage = 'da_duyet' THEN
    NEW.approved_document_id := OLD.submitted_document_id;
  ELSE
    NEW.submitted_document_id := OLD.submitted_document_id;
    NEW.approved_document_id := OLD.approved_document_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_document_gate ON public.contracts;
CREATE TRIGGER contracts_document_gate
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_document_gate();

-- Văn bản chỉ lập khi hợp đồng còn Nháp (trước: Nháp, Chờ duyệt, Đã duyệt — 0171).
CREATE OR REPLACE FUNCTION public.contract_documents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_contract record;
BEGIN
  SELECT c.company_id, c.stage INTO v_contract
  FROM public.contracts c
  WHERE c.id = NEW.contract_id
  FOR UPDATE;  -- hai người lưu cùng lúc phải xếp hàng để số phiên bản không trùng
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;

  IF v_contract.stage IN ('cho_duyet', 'da_duyet') THEN
    RAISE EXCEPTION 'Hợp đồng đang chờ duyệt hoặc đã duyệt: văn bản đã khoá theo bản đã gửi. Bị trả về thì lập bản mới.';
  END IF;
  IF v_contract.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng đã ký: văn bản đã khoá, không lập thêm bản điền mới. Thay đổi sau ký đi qua phát sinh / phụ lục.';
  END IF;

  NEW.company_id := v_contract.company_id;
  NEW.created_by := public.auth_user_id();
  NEW.created_at := now();

  SELECT coalesce(max(version), 0) + 1 INTO NEW.version
  FROM public.contract_documents WHERE contract_id = NEW.contract_id;

  -- NEN-05: bản sau phải nêu nguyên nhân thay đổi.
  IF NEW.version > 1 AND (NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân lập lại văn bản (đã có bản %).', NEW.version - 1;
  END IF;

  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates t
    WHERE t.id = NEW.template_id AND t.company_id = v_contract.company_id
  ) THEN
    RAISE EXCEPTION 'Mẫu hợp đồng không thuộc pháp nhân của hợp đồng này.';
  END IF;

  RETURN NEW;
END;
$fn$;

-- stage_readiness — chép nguyên bản 0175, thêm điều kiện «đã lập văn bản» cho bước Chờ duyệt.
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
        'Đang phân loại M1 — Lưu trữ: chỉ đi tiếp khi khách có nhu cầu thực (M2–M4)'
      ELSE 'Đã phân loại M2–M4 và khai loại công trình'
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

