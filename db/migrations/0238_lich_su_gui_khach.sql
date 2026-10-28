-- ============================================================================
-- 0238 — Lịch sử «đã mở Zalo để gửi khách» (anh Dũng 28/10/2026, «cách 1»)
--
-- Nhân viên gửi cho khách qua Zalo CÁ NHÂN của mình: hệ thống chỉ soạn sẵn lời nhắn, mở Zalo (máy tính) hoặc bảng
-- chia sẻ (điện thoại); người dùng tự bấm gửi trong Zalo. Zalo không có API cho tài khoản cá nhân và dự án không tự
-- động hoá Zalo — nên hệ thống KHÔNG biết tin đã đi hay chưa. Bảng này chỉ ghi «ai đã mở Zalo để gửi gì cho số nào,
-- lúc nào», để người khác trong phòng không gửi trùng và lãnh đạo biết khách đã nhận gì.
--
--  - Một dòng = một lần bấm «Mở Zalo» / «Chia sẻ». Bất biến: không có quyền sửa / xoá.
--  - KHÔNG lưu lời nhắn (người gửi sửa tự do, có thể có nội dung riêng); chỉ lưu số người nhận và tên tệp đã kèm.
--  - `channel` để sẵn `email` cho đợt gửi email.
--  - Hồ sơ gốc đa hình (`entity_type` + `entity_id`): đọc theo quyền đọc hồ sơ gốc, ghi theo quyền gửi của hồ sơ
--    gốc — gom ở hai hàm `rls_outbound_share_readable` / `_writable`, không chép điều kiện vào chính sách.
--  - `company_id`, `created_by`, `created_at` do trigger đặt từ hồ sơ gốc / người gọi — trình duyệt không tự khai.
--
-- Chạy lại được.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outbound_shares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  entity_type    text NOT NULL CHECK (entity_type IN
                   ('quotes', 'contracts', 'contract_signed_scan', 'showcase_shares')),
  entity_id      uuid NOT NULL,
  channel        text NOT NULL DEFAULT 'zalo' CHECK (channel IN ('zalo', 'email')),
  -- `bang_chia_se` = bảng chia sẻ của điện thoại (người dùng chọn Zalo hay ứng dụng khác); `zalo_web` = mở
  -- zalo.me trên máy tính.
  via            text CHECK (via IN ('bang_chia_se', 'zalo_web')),
  recipient      text CHECK (recipient IS NULL OR char_length(recipient) <= 255),
  file_name      text CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  share_link_id  uuid,
  created_by     uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_shares_entity_idx
  ON public.outbound_shares (entity_type, entity_id, created_at DESC);

COMMENT ON TABLE public.outbound_shares IS
  'Lần người dùng mở Zalo / bảng chia sẻ để gửi một hồ sơ cho khách (0238). Không biết tin đã gửi hay chưa — chỉ ghi lần mở. Bất biến, không lưu lời nhắn.';

-- Đọc: theo quyền đọc hồ sơ gốc.
CREATE OR REPLACE FUNCTION public.rls_outbound_share_readable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
       WHERE q.id = p_id AND q.deleted_at IS NULL AND public.rls_company_access(q.company_id))
    WHEN 'contracts' THEN public.rls_contract_readable(p_id)
    WHEN 'contract_signed_scan' THEN public.rls_contract_readable(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id
         AND (s.created_by = public.auth_user_id()
              OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KSNB')))
    ELSE false
  END;
$$;

-- Ghi: đúng người được gửi hồ sơ gốc cho khách (CLAUDE.md 5.4 — nút cũng chỉ hiện cho họ).
--  - Báo giá: ĐÃ DUYỆT, người chịu trách nhiệm cơ hội hoặc lãnh đạo (Mẫu B của cơ hội).
--  - Văn bản hợp đồng: hợp đồng đã duyệt trở đi và có bản đã duyệt; người chịu trách nhiệm có quyền sửa HD hoặc
--    người có quyền phê duyệt HD — cùng nhóm với link bản đã ký (0189).
--  - Bản đã ký: đúng `rls_contract_scan_sharer` (0189).
--  - Link mẫu công trình: người tạo link hoặc lãnh đạo, link còn hiệu lực.
CREATE OR REPLACE FUNCTION public.rls_outbound_share_writable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
        JOIN public.opportunities o ON o.id = q.opportunity_id
       WHERE q.id = p_id AND q.deleted_at IS NULL AND o.deleted_at IS NULL
         AND q.status = 'completed'
         AND public.rls_company_access(q.company_id)
         AND public.rls_owner_can_write(o.company_id, o.owner_id))
    WHEN 'contracts' THEN EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = p_id AND c.deleted_at IS NULL
         AND c.stage::text IN ('da_duyet', 'da_ky', 'hoan_thanh')
         AND c.approved_document_id IS NOT NULL
         AND public.rls_company_access(c.company_id)
         AND (public.auth_can_approve_module('HD')
              OR (public.auth_can_edit_module('HD')
                  AND public.rls_owner_can_write(c.company_id, c.responsible_user_id))))
    WHEN 'contract_signed_scan' THEN public.rls_contract_scan_sharer(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id AND s.revoked_at IS NULL AND s.expires_at > now()
         AND (s.created_by = public.auth_user_id() OR public.auth_manages_all_companies()))
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.rls_outbound_share_readable(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_outbound_share_writable(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_outbound_share_readable(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_outbound_share_writable(text, uuid) TO authenticated;

-- Pháp nhân, người ghi, giờ ghi lấy từ hồ sơ gốc / người gọi; link có hạn phải thuộc đúng hồ sơ.
CREATE OR REPLACE FUNCTION public.outbound_shares_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF public.auth_user_id() IS NOT NULL THEN
    NEW.created_by := public.auth_user_id();
    NEW.created_at := now();
  END IF;

  IF NEW.entity_type = 'quotes' THEN
    SELECT q.company_id INTO v_company FROM public.quotes q WHERE q.id = NEW.entity_id;
    NEW.share_link_id := NULL;
  ELSIF NEW.entity_type IN ('contracts', 'contract_signed_scan') THEN
    SELECT c.company_id INTO v_company FROM public.contracts c WHERE c.id = NEW.entity_id;
    IF NEW.entity_type = 'contracts' THEN
      NEW.share_link_id := NULL;
    ELSIF NEW.share_link_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contract_scan_shares sh
       WHERE sh.id = NEW.share_link_id AND sh.contract_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'Link không thuộc hợp đồng này.';
    END IF;
  ELSIF NEW.entity_type = 'showcase_shares' THEN
    SELECT COALESCE(s.company_id,
                    (SELECT i.company_id FROM public.showcase_items i WHERE i.id = s.item_ids[1]))
      INTO v_company
      FROM public.showcase_shares s WHERE s.id = NEW.entity_id;
    NEW.share_link_id := NEW.entity_id;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ được gửi.';
  END IF;
  NEW.company_id := v_company;
  NEW.recipient := NULLIF(btrim(NEW.recipient), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbound_shares_before_insert ON public.outbound_shares;
CREATE TRIGGER outbound_shares_before_insert
  BEFORE INSERT ON public.outbound_shares
  FOR EACH ROW EXECUTE FUNCTION public.outbound_shares_before_insert();

ALTER TABLE public.outbound_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_shares FROM anon, authenticated;
GRANT SELECT, INSERT ON public.outbound_shares TO authenticated;

DROP POLICY IF EXISTS outbound_shares_select ON public.outbound_shares;
CREATE POLICY outbound_shares_select ON public.outbound_shares
  FOR SELECT TO authenticated
  USING (public.rls_outbound_share_readable(entity_type, entity_id));

DROP POLICY IF EXISTS outbound_shares_insert ON public.outbound_shares;
CREATE POLICY outbound_shares_insert ON public.outbound_shares
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.auth_user_id()
              AND public.rls_outbound_share_writable(entity_type, entity_id));
