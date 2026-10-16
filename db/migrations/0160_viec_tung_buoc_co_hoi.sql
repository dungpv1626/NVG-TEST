-- 0160 — Việc của từng bước cơ hội phải làm xong mới đi tiếp (CRM-02, CRM-03).
--
-- Phản hồi chủ dự án sau GĐ1 (doc/MOC_CAI_TIEN_UX.md): bước «Xác minh / Phân loại» không có
-- việc gì để làm — trường `classification` (M1–M4, hồ sơ khảo sát Phòng Kinh doanh) không có
-- chỗ nhập — và khảo sát bỏ qua được hoàn toàn (Xác minh đi thẳng Báo giá, hoặc qua bước Khảo
-- sát mà không khảo sát). Chủ dự án chốt:
--   * Rời «Xác minh» phải có Phân loại M2–M4 VÀ Loại công trình. M1 «Lưu trữ» = chưa có nhu cầu
--     thực, đứng lại để chăm sóc sau.
--   * Khảo sát bắt buộc trước Báo giá, được BỎ QUA kèm lý do. Lý do lưu trên cơ hội (không chỉ
--     trong ghi chú lịch sử) để lãnh đạo lọc được những cơ hội báo giá không khảo sát.
--
-- `stage_readiness` thêm cột `waivable`: điều kiện miễn được bằng lý do (giao diện hiện nút
-- «Bỏ qua … kèm lý do» thay vì chỉ chữ «Cần»). Đổi kiểu trả về nên phải DROP rồi tạo lại.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS survey_waived_reason text,
  ADD COLUMN IF NOT EXISTS survey_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS survey_waived_by uuid REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.opportunities.survey_waived_reason IS
  'Lý do báo giá không qua khảo sát hiện trạng (0160). Chỉ ghi qua waive_opportunity_survey.';

-- Ba cột miễn khảo sát chỉ đổi qua hàm — như `stage`, `lost_reason`.
DROP TRIGGER IF EXISTS opportunities_stage_guard ON public.opportunities;
CREATE TRIGGER opportunities_stage_guard
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'lost_reason', 'survey_waived_reason', 'survey_waived_at', 'survey_waived_by'
  );

-- --- Điều kiện của từng bước ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.stage_readiness(text, uuid);

CREATE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
RETURNS TABLE (for_stage text, requirement text, met boolean, label text, waivable boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o            record;
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
                             AND s.surveyed_at IS NOT NULL);

    RETURN QUERY SELECT 'khao_sat'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY SELECT 'bao_gia'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'survey_done'::text,
           v_surveyed OR o.survey_waived_reason IS NOT NULL,
           CASE WHEN NOT v_surveyed AND o.survey_waived_reason IS NOT NULL
                THEN 'Bỏ qua khảo sát: ' || o.survey_waived_reason
                ELSE 'Đã khảo sát hiện trạng (biên bản có thời điểm khảo sát)' END,
           true;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'pricing_started'::text,
           (EXISTS (SELECT 1 FROM public.quotes q
                     WHERE q.opportunity_id = p_id AND q.is_current_version AND q.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.bidding_projects b
                        WHERE b.opportunity_id = p_id AND b.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.opportunity_id = p_id AND d.deleted_at IS NULL)),
           'Đã lập báo giá, hoặc đã có gói thầu / hồ sơ thiết kế liên kết cơ hội'::text,
           false;

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
END;
$$;

COMMENT ON FUNCTION public.stage_readiness(text, uuid) IS
  'Điều kiện để sang từng bước của một hồ sơ (0155, 0160) — CÙNG một nguồn cho hàm chuyển bước '
  'và dải tiến trình trên giao diện. `waivable` = miễn được bằng lý do (khảo sát). Chỉ trả cờ '
  'đạt/chưa đạt + nhãn, không lộ hồ sơ liên kết.';

REVOKE ALL ON FUNCTION public.stage_readiness(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_readiness(text, uuid) TO authenticated;

-- --- Bỏ qua khảo sát kèm lý do ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waive_opportunity_survey(p_opportunity_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  o      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT id, company_id, owner_id, stage, handed_over_at, deleted_at
    INTO o FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;

  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;

  IF NOT public.rls_owner_can_write(o.company_id, o.owner_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội này mới bỏ qua khảo sát được.';
  END IF;

  IF o.handed_over_at IS NOT NULL OR o.stage NOT IN ('xac_minh', 'khao_sat') THEN
    RAISE EXCEPTION 'Chỉ bỏ qua khảo sát được khi cơ hội đang ở Xác minh hoặc Khảo sát.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do không khảo sát hiện trạng.';
  END IF;

  UPDATE public.opportunities
     SET survey_waived_reason = btrim(p_reason),
         survey_waived_at     = now(),
         survey_waived_by     = v_user,
         updated_at           = now(),
         updated_by           = v_user
   WHERE id = p_opportunity_id;
END;
$$;

COMMENT ON FUNCTION public.waive_opportunity_survey(uuid, text) IS
  'Ghi lý do báo giá không qua khảo sát (0160) — điều kiện «Đã khảo sát» của bước Báo giá coi '
  'như đạt. Chỉ người chịu trách nhiệm, chỉ ở Xác minh / Khảo sát.';

REVOKE ALL ON FUNCTION public.waive_opportunity_survey(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_opportunity_survey(uuid, text) TO authenticated;
