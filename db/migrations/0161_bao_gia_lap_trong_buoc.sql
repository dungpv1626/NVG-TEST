-- 0161 — Báo giá được lập TRONG bước «Báo giá»; khảo sát không ghi được thời điểm ở tương lai.
--
-- Phản hồi chủ dự án khi chạy thử 0160: khảo sát xong vẫn không sang được bước tiếp. Ba nguyên
-- nhân, hai cái nằm ở đây:
--   * 0155 đòi «đã lập báo giá» làm điều kiện VÀO bước Báo giá — ngược thứ tự: bước Báo giá chính
--     là nơi lập báo giá. Điều kiện có báo giá vẫn còn, ở chỗ đúng của nó: rời Báo giá sang Đàm
--     phán cần báo giá đã duyệt và đã gửi khách (`offer_sent`).
--   * Biểu mẫu cho ghi «Đã khảo sát lúc» là một ngày chưa tới (thấy thật: 30/10 khi hôm nay
--     16/10). Khảo sát chưa diễn ra thì chưa phải đã khảo sát — CSDL từ chối, và điều kiện bước
--     không tính biên bản như vậy (dữ liệu cũ đã lỡ ghi).
-- (Nguyên nhân thứ ba ở giao diện: lưu biên bản không làm mới điều kiện của bước.)

CREATE OR REPLACE FUNCTION public.site_surveys_not_in_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Chừa vài phút cho đồng hồ máy người dùng lệch với máy chủ.
  IF NEW.surveyed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.surveyed_at IS DISTINCT FROM OLD.surveyed_at)
     AND NEW.surveyed_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'Thời điểm đã khảo sát không được ở tương lai. Buổi khảo sát chưa diễn ra thì ghi vào ô Lịch hẹn.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_surveys_not_in_future ON public.site_surveys;
CREATE TRIGGER site_surveys_not_in_future
  BEFORE INSERT OR UPDATE OF surveyed_at ON public.site_surveys
  FOR EACH ROW EXECUTE FUNCTION public.site_surveys_not_in_future();

CREATE OR REPLACE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
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
END;
$$;
