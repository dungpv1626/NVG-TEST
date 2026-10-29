-- ============================================================================
-- 0240 — Mẫu Word báo giá NVG tự tải lên (anh Dũng 29/10/2026)
--
-- Trang Mẫu hợp đồng nhận thêm loại «Báo giá» (`contract_templates.document_kind = 'bao_gia'`, có từ 0239). Quyền
-- tải lên / ngừng dùng giữ nguyên `auth_can_manage_contract_templates` (chính sách 0171) — không đổi chính sách nào.
--
-- 1. Chọn mẫu: `quote_template_for(p_quote_id)` — MỘT chỗ quyết mẫu nào dựng văn bản của một báo giá:
--    - báo giá đã gửi khách thì dùng ĐÚNG mẫu đã dùng lúc gửi (`quotes.template_id`), kể cả khi mẫu ấy đã ngừng dùng
--      — không hồi tố văn bản đã gửi (CLAUDE.md 5.2);
--    - chưa gửi: mẫu đang dùng của pháp nhân, mẫu NGƯỜI tải lên (có `created_by`) đứng trước mẫu DEMO do seed nạp
--      (`created_by` rỗng), mới hơn đứng trước.
--    SECURITY INVOKER: người không đọc được mẫu (RLS `contract_templates_select`) nhận rỗng.
-- 2. `quotes.template_id` do trigger ghi đúng một lần, lúc báo giá chuyển sang «đã gửi khách»; trình duyệt không
--    đặt / đổi được.
--
-- Chạy lại được.
-- ============================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quotes.template_id IS
  'Mẫu Word báo giá đã dùng lúc gửi khách (0240) — văn bản của báo giá đã gửi luôn dựng lại bằng đúng mẫu này.';

-- Mẫu đang dùng của pháp nhân theo thứ tự ưu tiên — dùng chung cho trigger và hàm chọn mẫu.
CREATE OR REPLACE FUNCTION public.preferred_quote_template(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.id FROM public.contract_templates t
   WHERE t.company_id = p_company_id AND t.document_kind = 'bao_gia' AND t.is_active
   ORDER BY (t.created_by IS NULL), t.created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.quote_template_for(p_quote_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT t.id FROM public.contract_templates t WHERE t.id = q.template_id),
    CASE WHEN q.sent_to_customer_at IS NULL OR q.template_id IS NULL
         THEN public.preferred_quote_template(q.company_id) END)
    FROM public.quotes q WHERE q.id = p_quote_id;
$$;

COMMENT ON FUNCTION public.quote_template_for(uuid) IS
  'Mẫu Word dựng văn bản một báo giá (0240): đã gửi khách = mẫu lúc gửi; chưa gửi = mẫu người tải lên trước mẫu DEMO.';

REVOKE ALL ON FUNCTION public.preferred_quote_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.quote_template_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preferred_quote_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quote_template_for(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quotes_stamp_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.template_id := NULL;
  ELSIF OLD.sent_to_customer_at IS NULL AND NEW.sent_to_customer_at IS NOT NULL THEN
    -- Chạy dưới quyền chủ hàm: chọn mẫu theo đúng thứ tự ưu tiên, không phụ thuộc người bấm gửi xem được mẫu nào.
    NEW.template_id := public.preferred_quote_template(NEW.company_id);
  ELSE
    NEW.template_id := OLD.template_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_stamp_template ON public.quotes;
CREATE TRIGGER quotes_stamp_template
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_stamp_template();
