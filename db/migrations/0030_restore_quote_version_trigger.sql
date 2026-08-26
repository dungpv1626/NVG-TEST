-- ============================================================================
-- Khôi phục `quotes_assign_version` về đúng bản của migration 0013
--
-- Migration này là BẢN VÁ, không mang thay đổi nghiệp vụ nào.
--
-- Bối cảnh: trong lúc sửa hệ quả của migration 0028, một bản nháp của 0029 đã ghi đè nhầm
-- `quotes_assign_version` bằng một phiên bản rút gọn — phiên bản đó KHÔNG sinh mã báo giá,
-- nên mọi lượt lập báo giá đều lỗi "null value in column code". Bản nháp đó đã được gỡ khỏi
-- 0029, nhưng cơ sở dữ liệu nào đã chạy nó rồi thì vẫn đang giữ hàm sai — trình chạy
-- migration đối chiếu theo mốc thời gian trong journal nên không chạy lại 0029.
--
-- Vì vậy cần một migration riêng. Trên cơ sở dữ liệu sạch, đây chỉ là khai lại đúng cái hàm
-- mà 0013 đã tạo — chạy vào không đổi gì.
--
-- Bài học ghi lại để không lặp: khi một migration ĐÃ CHẠY, sửa file cũ không có tác dụng.
-- Mọi sửa chữa phải là một migration MỚI.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quotes_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_version integer;
  v_base_code    text;
  v_company_code text;
BEGIN
  SELECT COALESCE(max(version), 0) INTO v_prev_version
  FROM public.quotes
  WHERE opportunity_id = NEW.opportunity_id AND deleted_at IS NULL;

  NEW.version := v_prev_version + 1;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    IF v_prev_version = 0 THEN
      SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = NEW.company_id;
      NEW.code := public.next_record_code(v_company_code, 'BG');
    ELSE
      SELECT regexp_replace(q.code, '-V[0-9]+$', '') INTO v_base_code
      FROM public.quotes q
      WHERE q.opportunity_id = NEW.opportunity_id AND q.deleted_at IS NULL
      ORDER BY q.version
      LIMIT 1;
      NEW.code := format('%s-V%s', v_base_code, NEW.version);
    END IF;
  END IF;

  -- Đúng một bản đang hiệu lực tại mọi thời điểm (NEN-05) — chỉ số duy nhất
  -- `quotes_one_current_version` là lưới an toàn nếu chỗ nào đó lách qua trigger này.
  UPDATE public.quotes
     SET is_current_version = false
   WHERE opportunity_id = NEW.opportunity_id AND is_current_version AND deleted_at IS NULL;

  NEW.is_current_version := true;
  -- Phiên bản mới luôn bắt đầu ở trạng thái nháp, chưa gửi và chưa có phản hồi:
  -- không thừa hưởng chữ ký phê duyệt của bản trước.
  NEW.status              := 'draft';
  NEW.sent_to_customer_at := NULL;
  NEW.customer_response   := NULL;
  NEW.responded_at        := NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.quotes_assign_version() IS
  'Cấp số phiên bản, mã báo giá và giữ đúng một bản đang hiệu lực cho mỗi cơ hội (PRD NEN-05, CRM-04).';
