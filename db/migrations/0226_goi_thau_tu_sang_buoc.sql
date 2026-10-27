-- 0226 — Gói thầu tự sang bước khi đã làm việc của bước (dải tiến trình gói thầu, GĐ1 còn thiếu).
--
-- Vì sao: bước gói thầu chỉ đổi qua hàm (0028 chặn sửa tay) — gửi duyệt giá, duyệt / trả về, nộp thầu, ghi kết quả.
-- KHÔNG có đường nào vào Khảo sát hiện trạng / Bóc tách khối lượng / Lập dự toán: gói thầu đang lập dự toán vẫn ghi
-- «Tiếp nhận hồ sơ», dải tiến trình dựng trên đó nói sai. Theo quyết định đã chốt (CLAUDE.md 9.4: «làm xong việc của
-- bước thì tự sang bước kế»), bước đi theo việc thật:
--
-- - ghi kết quả khảo sát (`survey_notes` có chữ)          → Khảo sát hiện trạng
-- - có dòng khối lượng đầu tiên (`boq_items`)              → Bóc tách khối lượng
-- - có dự toán (`estimates`)                               → Lập dự toán
--
-- Chỉ đi TỚI, không lùi, và chỉ trong bốn bước đầu (gói thầu đã gửi duyệt giá thì không đụng). Khảo sát bỏ qua được —
-- NVC hay nhận sẵn BOQ của chủ đầu tư. Lịch sử bước (0225) ghi các lần tự chuyển này.

-- Khảo sát: cùng một dòng nên đổi ngay trong BEFORE UPDATE. Tên trigger đứng SAU `bidding_projects_stage_guard`
-- (thứ tự chữ cái) — trigger canh so bước trước khi bước đổi, nên không chặn nhầm người dùng đang lưu ghi chú.
CREATE OR REPLACE FUNCTION public.bidding_projects_survey_advance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'tiep_nhan_ho_so' AND NULLIF(btrim(NEW.survey_notes), '') IS NOT NULL THEN
    NEW.stage := 'khao_sat';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bidding_projects_survey_advance ON public.bidding_projects;
CREATE TRIGGER bidding_projects_survey_advance
  BEFORE UPDATE OF survey_notes ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_projects_survey_advance();

-- Bóc tách / dự toán: bảng khác — đẩy bước gói thầu bằng hàm SECURITY DEFINER (đi qua trigger canh 0028 như mọi hàm
-- nghiệp vụ).
CREATE OR REPLACE FUNCTION public.bidding_advance_to(p_project uuid, p_stage public.bidding_stage)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bidding_projects
     SET stage = p_stage
   WHERE id = p_project
     AND deleted_at IS NULL
     AND stage IN ('tiep_nhan_ho_so', 'khao_sat', 'boc_tach', 'du_toan')
     -- Chỉ đi tới: thứ tự trong enum là thứ tự của đường chính.
     AND stage < p_stage;
$$;

REVOKE ALL ON FUNCTION public.bidding_advance_to(uuid, public.bidding_stage) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.boq_items_bidding_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bidding_project_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM public.bidding_advance_to(NEW.bidding_project_id, 'boc_tach');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS boq_items_bidding_advance ON public.boq_items;
CREATE TRIGGER boq_items_bidding_advance
  AFTER INSERT ON public.boq_items
  FOR EACH ROW EXECUTE FUNCTION public.boq_items_bidding_advance();

CREATE OR REPLACE FUNCTION public.estimates_bidding_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bidding_project_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM public.bidding_advance_to(NEW.bidding_project_id, 'du_toan');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS estimates_bidding_advance ON public.estimates;
CREATE TRIGGER estimates_bidding_advance
  AFTER INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.estimates_bidding_advance();

-- Gói thầu đang có: đặt bước theo việc ĐÃ có trong hồ sơ (dữ kiện thật, không đoán). Lịch sử bước ghi «Hệ thống».
UPDATE public.bidding_projects b
   SET stage = 'khao_sat'
 WHERE b.deleted_at IS NULL AND b.stage = 'tiep_nhan_ho_so'
   AND NULLIF(btrim(b.survey_notes), '') IS NOT NULL;

SELECT public.bidding_advance_to(b.id, 'boc_tach')
  FROM public.bidding_projects b
 WHERE EXISTS (SELECT 1 FROM public.boq_items i WHERE i.bidding_project_id = b.id AND i.deleted_at IS NULL);

SELECT public.bidding_advance_to(b.id, 'du_toan')
  FROM public.bidding_projects b
 WHERE EXISTS (SELECT 1 FROM public.estimates e WHERE e.bidding_project_id = b.id AND e.deleted_at IS NULL);
