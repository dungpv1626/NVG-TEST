-- ============================================================================
-- Trigger cấp số phiên bản là LOGIC HỆ THỐNG, không phải thao tác của người dùng
--
-- Hệ quả trực tiếp của migration 0028. Hai trigger dưới đây hạ bản cũ xuống bằng một câu
-- `UPDATE ... SET is_current_version = false` ngay bên trong trigger BEFORE INSERT. Chúng
-- KHÔNG khai `SECURITY DEFINER`, nên chạy dưới vai trò của người gọi — tức `authenticated`
-- khi lệnh đến từ trình duyệt. Trigger canh trạng thái ở 0028 vì thế chặn nhầm chính chúng:
-- lập một bản báo giá hay dự toán mới lập tức báo "Không đổi trực tiếp được trạng thái".
--
-- Cách sửa đúng là khai đúng bản chất của chúng: đây là logic của CSDL tự thi hành ràng
-- buộc NEN-05 ("chỉ một bản đang hiệu lực"), không phải một thao tác người dùng gõ ra. Khai
-- `SECURITY DEFINER` đặt chúng vào đúng nhóm với các hàm nghiệp vụ khác.
--
-- Phạm vi mở rộng thêm là hẹp và có chủ đích: câu `UPDATE` bên trong chỉ đụng tới các dòng
-- CÙNG hồ sơ cha với dòng đang chèn, và chỉ đổi đúng cột `is_current_version`.
--
-- Cách khác đã cân nhắc và LOẠI: bỏ `is_current_version` khỏi danh sách canh ở 0028. Loại
-- vì unique index chỉ chặn được "hai bản cùng hiệu lực", KHÔNG chặn được việc hạ bản đang
-- hiệu lực xuống để không còn bản nào — và lúc đó công trường mở hồ sơ ra không thấy bản
-- nào đang dùng, đúng vướng mắc #9 mà cả cơ chế phiên bản sinh ra để giải.
--
-- `quotes_assign_version` KHÔNG nằm trong danh sách: nó đã khai `SECURITY DEFINER` ngay từ
-- migration 0013, nên không bị 0028 chặn.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.estimates_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev record;
BEGIN
  SELECT code, max(version) AS max_version
    INTO v_prev
    FROM public.estimates
   WHERE deleted_at IS NULL
     AND bidding_project_id IS NOT DISTINCT FROM NEW.bidding_project_id
     AND design_project_id IS NOT DISTINCT FROM NEW.design_project_id
   GROUP BY code
   ORDER BY max(version) DESC
   LIMIT 1;

  IF v_prev.code IS NOT NULL THEN
    NEW.code := v_prev.code;
    NEW.version := v_prev.max_version + 1;
  ELSE
    NEW.version := 1;
  END IF;

  NEW.is_current_version := true;
  NEW.status := 'draft';

  UPDATE public.estimates
     SET is_current_version = false
   WHERE is_current_version
     AND deleted_at IS NULL
     AND bidding_project_id IS NOT DISTINCT FROM NEW.bidding_project_id
     AND design_project_id IS NOT DISTINCT FROM NEW.design_project_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.design_briefs_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT max(version) INTO v_max
    FROM public.design_briefs
   WHERE design_project_id = NEW.design_project_id AND deleted_at IS NULL;

  NEW.version := COALESCE(v_max, 0) + 1;
  NEW.is_current_version := true;

  IF NEW.version > 1 AND (NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân điều chỉnh đầu bài.';
  END IF;

  UPDATE public.design_briefs
     SET is_current_version = false
   WHERE design_project_id = NEW.design_project_id
     AND is_current_version
     AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

