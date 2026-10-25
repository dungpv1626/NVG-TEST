-- 0222 — Văn bản hợp đồng SỬA TRONG WORD (anh Dũng 25/10/2026).
--
-- Vì sao: mẫu chỉ cho điền chỗ trống; câu chữ, thêm / bớt điều khoản thì không sửa được trên hệ thống. Người
-- soạn tải bản đã điền về, sửa trong Word rồi tải lên làm PHIÊN BẢN MỚI. Hệ thống không đọc ngược tệp Word
-- (9.4 CLAUDE.md), nên phiên bản ấy phải được đánh dấu: người duyệt biết mình đang đọc bản sửa tay, người soạn
-- biết lưu lại từ mẫu sẽ KHÔNG giữ các sửa đó.
--
-- Bất biến giữ nguyên: chỉ lập khi hợp đồng còn Nháp, đánh số phiên bản, bản sau phải có lý do. Thêm: bản sửa
-- trong Word LUÔN phải có lý do (kể cả bản 1 — ghi đã sửa gì), tệp phải là .docx nằm trong thư mục của hợp đồng
-- và có thật trong kho.

ALTER TABLE public.contract_documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mau';

ALTER TABLE public.contract_documents DROP CONSTRAINT IF EXISTS contract_documents_source_check;
ALTER TABLE public.contract_documents
  ADD CONSTRAINT contract_documents_source_check CHECK (source IN ('mau', 'sua_trong_word'));

COMMENT ON COLUMN public.contract_documents.source IS
  'mau = máy điền từ mẫu; sua_trong_word = người soạn sửa trong Word rồi tải lên (0222). Hệ thống không đọc ngược tệp Word.';

-- Chép nguyên bản 0176, thêm khối «sửa trong Word».
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

  -- Bản sửa trong Word: câu hỏi lý do riêng, đứng TRƯỚC câu chung của NEN-05 cho người soạn biết phải ghi gì.
  IF NEW.source = 'sua_trong_word' AND (NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '') THEN
    RAISE EXCEPTION 'Ghi rõ đã sửa gì trong Word — người duyệt cần biết bản này khác bản điền từ mẫu ở đâu.';
  END IF;

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

  IF NEW.source = 'sua_trong_word' THEN
    IF NEW.storage_path NOT LIKE NEW.contract_id::text || '/%' OR lower(NEW.storage_path) NOT LIKE '%.docx' THEN
      RAISE EXCEPTION 'Tệp sửa trong Word phải là tệp .docx của chính hợp đồng này.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'contract-documents' AND o.name = NEW.storage_path
    ) THEN
      RAISE EXCEPTION 'Chưa thấy tệp đã tải lên — tải lại tệp rồi thử lại.';
    END IF;
    -- Máy không đọc ngược Word: không có giá trị điền, không có danh sách ô thiếu.
    NEW.filled_values := '{}'::jsonb;
    NEW.missing_fields := '{}';
  END IF;

  RETURN NEW;
END;
$fn$;
