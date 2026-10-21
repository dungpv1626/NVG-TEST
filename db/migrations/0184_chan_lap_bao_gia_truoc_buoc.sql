-- ============================================================================
-- Chỉ lập báo giá khi cơ hội đã ở bước Báo giá / Đàm phán.
--
-- Lỗ hổng anh Dũng chỉ ra khi chạy thử 20/10/2026: «sếp chưa duyệt biên bản khảo sát nhưng vẫn vào
-- lập báo giá thì sao?». Trước đây chỉ việc CHUYỂN BƯỚC bị chặn (`stage_readiness` + 0175);
-- nút «Lập báo giá» luôn hiện và bảng `quotes` nhận dòng mới ở mọi bước — Kinh doanh lập, gửi
-- duyệt, gửi khách một báo giá dựa trên khảo sát Ban Giám đốc chưa duyệt.
--
-- Chặn ở TRIGGER (mọi đường ghi đều qua). Điều kiện còn thiếu lấy từ chính `stage_readiness`
-- để câu báo trùng với câu ở dải tiến trình. Hệ thống (auth_user_id rỗng) không bị chặn.
-- Đàm phán vẫn lập được phiên bản mới (khách mặc cả lại giá).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quotes_require_quote_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage   text;
  v_missing text;
BEGIN
  IF public.auth_user_id() IS NULL OR NEW.opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stage::text INTO v_stage FROM public.opportunities WHERE id = NEW.opportunity_id;
  IF v_stage IN ('bao_gia', 'dam_phan') THEN
    RETURN NEW;
  END IF;

  IF v_stage IN ('ky_hop_dong', 'mat_co_hoi') THEN
    RAISE EXCEPTION 'Không lập báo giá mới: cơ hội đã %.',
      CASE v_stage WHEN 'ky_hop_dong' THEN 'ký hợp đồng' ELSE 'được đánh dấu mất' END;
  END IF;

  SELECT string_agg(r.label, '; ') INTO v_missing
    FROM public.stage_readiness('opportunity', NEW.opportunity_id) r
   WHERE r.for_stage = 'bao_gia' AND NOT r.met;

  RAISE EXCEPTION 'Chưa lập báo giá được: cơ hội chưa sang bước Báo giá.%',
    COALESCE(' Cần: ' || v_missing || '.', '');
END;
$$;

DROP TRIGGER IF EXISTS quotes_require_quote_stage ON public.quotes;
CREATE TRIGGER quotes_require_quote_stage
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_require_quote_stage();
