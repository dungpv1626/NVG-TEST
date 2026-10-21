-- ============================================================================
-- Văn bản hợp đồng hoàn chỉnh: mọi chỗ trống của mẫu nhập được và được lưu theo hợp đồng.
--
-- Anh Dũng chạy thử 21/10/2026: gói thầu, phạm vi loại trừ, hạng mục, số ngày, tỷ lệ… vẫn tô
-- vàng — «chưa thành một bộ hoàn chỉnh». Bộ mẫu chuyển từ bản dự thảo (convert.py) nay đánh số
-- MỌI dải chấm ({o_N}), lựa chọn trong ngoặc vuông ({c_N}) và khối «☐ Phương án» ({#pa_N_x}).
--
-- 1. `contract_templates.free_fields` — mỗi chỗ trống: khoá, Điều chứa nó, câu văn trước / sau,
--    mức «mặc định» mẫu ghi, các lựa chọn, khối phương án chứa nó.
--    `contract_templates.options` — các nhóm phương án: câu dẫn, Điều, từng phương án.
--    Danh mục này là dữ liệu kèm TỆP mẫu (seed ghi cùng lúc), không phải cấu hình sửa tay.
-- 2. `contract_document_inputs` — giá trị người soạn đã điền cho một hợp đồng, lưu dần khi gõ
--    (trước đây ô điền tay chỉ nằm trong trình duyệt, tải lại trang là mất). Một dòng một hợp
--    đồng; khoá trong `values`: chỗ trống chuẩn (`so_hop_dong`…) dùng chung mọi mẫu, chỗ trống
--    tự do gắn mẫu (`<template_id>:o_12`, `<template_id>:pa_3` = chữ phương án đã chọn).
--    Quyền theo hợp đồng: đọc như hợp đồng, ghi khi hợp đồng còn sửa được (`rls_contract_writable`).
--    Văn bản đã lưu (`contract_documents.filled_values`) vẫn là bản ghi bất biến của từng bản.
-- ============================================================================

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS free_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.contract_templates.free_fields IS
  'Chỗ trống tự do của mẫu: [{key, article, before, after, default, choices?, option}] (convert.py).';
COMMENT ON COLUMN public.contract_templates.options IS
  'Nhóm «☐ Phương án»: [{id, article, label, options: [{key, letter, text}]}] (convert.py).';

CREATE TABLE IF NOT EXISTS public.contract_document_inputs (
  contract_id uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  "values"    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.contract_document_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_document_inputs_select ON public.contract_document_inputs;
CREATE POLICY contract_document_inputs_select ON public.contract_document_inputs
  FOR SELECT TO authenticated
  USING (public.rls_contract_readable(contract_id));

DROP POLICY IF EXISTS contract_document_inputs_insert ON public.contract_document_inputs;
CREATE POLICY contract_document_inputs_insert ON public.contract_document_inputs
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_contract_writable(contract_id));

DROP POLICY IF EXISTS contract_document_inputs_update ON public.contract_document_inputs;
CREATE POLICY contract_document_inputs_update ON public.contract_document_inputs
  FOR UPDATE TO authenticated
  USING (public.rls_contract_writable(contract_id))
  WITH CHECK (public.rls_contract_writable(contract_id));

-- Pháp nhân theo hợp đồng, người ghi do CSDL đặt — trình duyệt gửi sai cũng không lọt.
CREATE OR REPLACE FUNCTION public.contract_document_inputs_fill()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.contracts WHERE id = NEW.contract_id;
  NEW.updated_at := now();
  NEW.updated_by := public.auth_user_id();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := NEW.updated_by;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_document_inputs_fill ON public.contract_document_inputs;
CREATE TRIGGER contract_document_inputs_fill
  BEFORE INSERT OR UPDATE ON public.contract_document_inputs
  FOR EACH ROW EXECUTE FUNCTION public.contract_document_inputs_fill();

GRANT SELECT, INSERT, UPDATE ON public.contract_document_inputs TO authenticated;
