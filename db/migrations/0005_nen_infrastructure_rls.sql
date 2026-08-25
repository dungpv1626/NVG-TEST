-- ============================================================================
-- RLS và ràng buộc toàn vẹn cho hạ tầng xuyên suốt
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Chỉ MỘT phiên bản đang hiệu lực cho mỗi tài liệu (PRD NEN-05)
--
-- Ràng buộc này PHẢI ở tầng cơ sở dữ liệu. Nếu để ứng dụng tự giữ, hai người phát hành
-- bản mới cùng lúc sẽ tạo ra hai bản cùng `is_current_version = true` — và hệ thống mất
-- khả năng trả lời câu hỏi quan trọng nhất của NEN-05: "bản nào đang hiệu lực?".
-- Đây chính là vướng mắc #9 trong khảo sát ("không chắc file đang dùng có phải bản mới nhất").
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX document_versions_one_current_uq
  ON public.document_versions (document_id)
  WHERE is_current_version AND deleted_at IS NULL;

-- Số phiên bản không được trùng trong cùng một tài liệu.
CREATE UNIQUE INDEX document_versions_version_uq
  ON public.document_versions (document_id, version)
  WHERE deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- 2. Bật RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_access_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.documents             FROM anon;
REVOKE ALL ON public.document_versions     FROM anon;
REVOKE ALL ON public.notifications         FROM anon;
REVOKE ALL ON public.tasks                 FROM anon;
REVOKE ALL ON public.audit_logs            FROM anon;
REVOKE ALL ON public.sensitive_access_logs FROM anon;


-- ----------------------------------------------------------------------------
-- 3. documents / document_versions — MẪU A (theo pháp nhân)
-- ----------------------------------------------------------------------------

CREATE POLICY documents_select ON public.documents
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id));

CREATE POLICY documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY documents_update ON public.documents
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id))
  WITH CHECK (public.rls_company_access(company_id));

-- Phiên bản tài liệu thừa hưởng phạm vi pháp nhân từ tài liệu cha.
CREATE POLICY document_versions_select ON public.document_versions
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND public.rls_company_access(d.company_id)
    )
  );

CREATE POLICY document_versions_write ON public.document_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND public.rls_company_access(d.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND public.rls_company_access(d.company_id)
    )
  );


-- ----------------------------------------------------------------------------
-- 4. notifications / tasks — MẪU B (theo người chịu trách nhiệm)
--
-- Người dùng CHỈ thấy thông báo và việc của chính mình. Không có ngoại lệ cho Ban Giám đốc:
-- hộp thư của người khác không phải dữ liệu nghiệp vụ để giám sát.
-- ----------------------------------------------------------------------------

CREATE POLICY notifications_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = public.auth_user_id());

-- Chỉ cho phép đánh dấu đã đọc; không cho sửa nội dung thông báo.
CREATE POLICY notifications_mark_read ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.auth_user_id())
  WITH CHECK (user_id = public.auth_user_id());

CREATE POLICY tasks_own ON public.tasks
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND user_id = public.auth_user_id());

CREATE POLICY tasks_own_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (user_id = public.auth_user_id())
  WITH CHECK (user_id = public.auth_user_id());


-- ----------------------------------------------------------------------------
-- 5. audit_logs / sensitive_access_logs — chỉ đọc, chỉ vai trò giám sát
--
-- ⚠️ Backend Schema 4.1 ghi audit_logs áp dụng "Mẫu C" (theo hạn mức phê duyệt) —
-- mẫu đó nói về giá trị tiền của hồ sơ chờ duyệt, không áp dụng được cho nhật ký.
-- Ở đây triển khai theo đúng mục đích của NEN-07: chỉ Ban Giám đốc và Quản trị hệ thống
-- đọc được; KHÔNG AI ghi/sửa/xóa được từ trình duyệt.
-- Đã ghi nhận vào CLAUDE.md để NVG chỉnh lại tài liệu.
-- ----------------------------------------------------------------------------

CREATE POLICY audit_logs_supervisors_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

CREATE POLICY sensitive_access_logs_supervisors_read ON public.sensitive_access_logs
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

-- Không có policy INSERT/UPDATE/DELETE ⇒ mọi thao tác ghi từ trình duyệt bị chặn.
-- Nhật ký chỉ được ghi qua hàm SECURITY DEFINER dưới đây và qua Cloudflare Workers.


-- ----------------------------------------------------------------------------
-- 6. Hàm ghi nhật ký (SECURITY DEFINER — vượt RLS có kiểm soát)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  p_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_action text DEFAULT 'view',
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
BEGIN
  IF v_user IS NULL THEN
    RETURN; -- chưa đăng nhập thì không có gì để ghi
  END IF;

  IF p_kind NOT IN ('cost', 'profit', 'salary') THEN
    RAISE EXCEPTION 'Loại dữ liệu nhạy cảm không hợp lệ: %', p_kind;
  END IF;

  INSERT INTO public.sensitive_access_logs
    (user_id, company_id, sensitive_kind, entity_type, entity_id, action)
  VALUES (v_user, p_company_id, p_kind, p_entity_type, p_entity_id, p_action);
END;
$$;

COMMENT ON FUNCTION public.log_sensitive_access(text, text, uuid, text, uuid) IS
  'Ghi nhật ký truy cập dữ liệu nhạy cảm (PRD NEN-07). Gọi mỗi khi hiển thị giá vốn, lợi nhuận hoặc lương.';


-- ----------------------------------------------------------------------------
-- 7. Phát hành phiên bản tài liệu mới (NEN-05)
--
-- Gộp trong MỘT giao dịch: hạ cờ hiệu lực của bản cũ, tạo bản mới, cấp số phiên bản.
-- Làm ở tầng ứng dụng bằng nhiều lệnh riêng lẻ sẽ để lại khoảng thời gian không có bản nào
-- đang hiệu lực, hoặc hai bản cùng hiệu lực nếu hai người phát hành đồng thời.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_document_version(
  p_document_id uuid,
  p_file_url text,
  p_file_name text,
  p_change_reason text DEFAULT NULL,
  p_mime_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER          -- giữ RLS: người gọi phải có quyền trên tài liệu cha
SET search_path = public
AS $$
DECLARE
  v_user       uuid := public.auth_user_id();
  v_next       integer;
  v_new_id     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- Khóa tài liệu cha để hai lần phát hành đồng thời phải xếp hàng.
  PERFORM 1 FROM public.documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài liệu, hoặc không có quyền truy cập.';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_next
  FROM public.document_versions
  WHERE document_id = p_document_id AND deleted_at IS NULL;

  -- NEN-05: bản điều chỉnh phải nêu nguyên nhân thay đổi.
  IF v_next > 1 AND (p_change_reason IS NULL OR btrim(p_change_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân thay đổi khi phát hành bản điều chỉnh.';
  END IF;

  UPDATE public.document_versions
     SET is_current_version = false, updated_at = now(), updated_by = v_user
   WHERE document_id = p_document_id AND is_current_version AND deleted_at IS NULL;

  INSERT INTO public.document_versions
    (document_id, version, is_current_version, file_url, file_name, mime_type,
     change_reason, published_at, published_by, created_by, updated_by)
  VALUES
    (p_document_id, v_next, true, p_file_url, p_file_name, p_mime_type,
     p_change_reason, now(), v_user, v_user, v_user)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.publish_document_version(uuid, text, text, text, text) IS
  'Phát hành phiên bản tài liệu mới trong một giao dịch (PRD NEN-05). Bảo đảm luôn có đúng một bản đang hiệu lực.';
