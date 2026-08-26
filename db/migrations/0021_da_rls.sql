-- ============================================================================
-- Module DA — phân quyền và luồng nghiệp vụ
--
-- Nguồn: PRD DA-01 → DA-10, Backend Schema 4.3, Webapp Flow 3.2.
--
-- Đây là module ĐẦU TIÊN có dữ liệu Mẫu D (giá vốn, lợi nhuận). Nguyên tắc áp dụng:
--
--   PRD NEN-07 bắt buộc GHI NHẬT KÝ mọi lượt xem dữ liệu nhạy cảm. Một câu SELECT không ghi
--   được nhật ký, một hàm thì có. Vì vậy dữ liệu giá vốn chi tiết KHÔNG đọc thẳng từ bảng:
--   quyền đọc bị thu hồi ở tầng CSDL và chỉ mở qua hàm SECURITY DEFINER có ghi nhật ký.
--   Nếu chỉ dùng policy hoặc view, người dùng vẫn đọc được mà không để lại dấu vết nào.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bốn cột kiểm toán và các cột định danh bất biến (migration 0019)
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.bidding_projects');
SELECT public.attach_audit_touch('public.boq_items');
SELECT public.attach_audit_touch('public.unit_prices');
SELECT public.attach_audit_touch('public.estimates');
SELECT public.attach_audit_touch('public.estimate_items');
SELECT public.attach_audit_touch('public.bid_documents');
SELECT public.attach_audit_touch('public.project_budgets');

CREATE TRIGGER bidding_projects_freeze_identity
  BEFORE UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

-- Dự toán: khoá luôn `version`. Số phiên bản do CSDL cấp và là căn cứ để nói "bản nào đã
-- được duyệt" — sửa được số đó thì chữ ký phê duyệt trỏ vào chỗ khác.
CREATE TRIGGER estimates_freeze_identity
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'bidding_project_id', 'version'
  );

CREATE TRIGGER boq_items_freeze_identity
  BEFORE UPDATE ON public.boq_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'bidding_project_id');

CREATE TRIGGER estimate_items_freeze_identity
  BEFORE UPDATE ON public.estimate_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'estimate_id');

CREATE TRIGGER bid_documents_freeze_identity
  BEFORE UPDATE ON public.bid_documents
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'bidding_project_id');

CREATE TRIGGER project_budgets_freeze_identity
  BEFORE UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'bidding_project_id');


-- ----------------------------------------------------------------------------
-- 0.5. Helper thông báo dùng chung (NEN-03, BUILD_PLAN 1.4)
--
-- Bảng `notifications` không có policy INSERT: trình duyệt KHÔNG tự tạo thông báo cho người
-- khác được (nếu không, ai cũng gửi được thông báo giả mạo hệ thống). Mọi thông báo đi qua
-- hàm này hoặc qua Workers.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_company_id uuid,
  p_type text,
  p_message text,
  p_entity_type text,
  p_entity_id uuid,
  p_action_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Không tự báo cho chính người vừa thao tác: họ vừa làm việc đó xong, thông báo lại chỉ
  -- làm loãng danh sách và tập cho người dùng bỏ qua thông báo (Content Guidelines 3.4).
  IF p_user_id IS NULL OR p_user_id = public.auth_user_id() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications
    (user_id, company_id, type, message, related_entity_type, related_entity_id, action_url)
  VALUES
    (p_user_id, p_company_id, p_type, p_message, p_entity_type, p_entity_id, p_action_url)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid, text) IS
  'Tạo một thông báo cho người dùng khác — cửa duy nhất, vì bảng notifications không cho ghi từ trình duyệt (NEN-03).';


-- ----------------------------------------------------------------------------
-- 1. Ai được xem giá vốn — mở rộng danh sách vai trò
--
-- `rls_sees_sensitive('cost')` ban đầu chỉ gồm Ban Giám đốc, Tài chính và Dự án – Đấu thầu.
-- Nhưng đơn giá vật tư là công cụ làm việc hằng ngày của thêm hai bộ phận nữa:
--   - Thiết kế (NVO): PRD TK-07 nói rõ dùng CHUNG cơ chế dự toán với DA (DA-04 → DA-06).
--   - Cung ứng: PRD MH-05 yêu cầu lịch sử giá mua "gợi ý ngược cho đơn giá" (DA-05) —
--     không đọc được đơn giá thì không so sánh được báo giá nhà cung cấp.
--
-- ⚠️ GIẢ ĐỊNH CHỜ HAAN XÁC NHẬN: đây là quyết định về việc AI trong công ty được nhìn giá
-- vốn, không phải quyết định kỹ thuật. Lợi nhuận ('profit') KHÔNG mở thêm cho ai.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_sees_sensitive(kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE kind
    -- Giá vốn: Ban Giám đốc, Tài chính, Dự án – Đấu thầu (người lập giá),
    -- Thiết kế (dự toán NVO — TK-07) và Cung ứng (so sánh báo giá — MH-04, MH-05).
    WHEN 'cost'   THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'DA_DT', 'TKE', 'MH')
    WHEN 'profit' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
    -- Lương: Ban Giám đốc, Tài chính, Hành chính – Nhân sự.
    WHEN 'salary' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'NS', 'KT')
    ELSE false
  END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Gói thầu, khối lượng, hồ sơ thầu — Mẫu A (Backend Schema 4.3)
--
-- Mẫu A chứ không phải B: Phòng Dự án – Đấu thầu làm việc theo nhóm trên cùng một gói thầu
-- (PRD Mục 3: 2 trưởng team + 2 nhân viên), người này bóc khối lượng, người kia lập giá.
-- Khoá theo người chịu trách nhiệm như Mẫu B sẽ chặn đúng cách họ đang làm việc.
-- ----------------------------------------------------------------------------

ALTER TABLE public.bidding_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_prices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_budgets  ENABLE ROW LEVEL SECURITY;

CREATE POLICY bidding_projects_select ON public.bidding_projects
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('DA')
  );

CREATE POLICY bidding_projects_insert ON public.bidding_projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_create_in('DA', company_id)
  );

CREATE POLICY bidding_projects_update ON public.bidding_projects
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('DA')
  )
  WITH CHECK (public.rls_company_access(company_id));

-- Bảng con dùng chung một điều kiện: quyền trên gói thầu cha quyết định tất cả.
-- Viết thành hàm để ba bảng không chép lại điều kiện rồi lệch nhau về sau.
CREATE OR REPLACE FUNCTION public.rls_bidding_project_readable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bidding_projects p
    WHERE p.id = p_project_id
      AND p.deleted_at IS NULL
      AND public.rls_company_access(p.company_id)
      AND public.auth_can_view_module('DA')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_bidding_project_writable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bidding_projects p
    WHERE p.id = p_project_id
      AND p.deleted_at IS NULL
      AND public.rls_company_access(p.company_id)
      AND public.auth_can_edit_module('DA')
      -- Đã nộp thầu thì hồ sơ đóng băng: sửa khối lượng hay hồ sơ sau khi nộp là làm cho
      -- bộ hồ sơ trên hệ thống khác bộ đã gửi chủ đầu tư (PRD Mục 2.3 — một nguồn dữ liệu).
      AND p.submitted_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.rls_bidding_project_writable(uuid) IS
  'Gói thầu còn sửa được không: đúng pháp nhân, có quyền sửa module DA, và chưa nộp thầu (DA-08).';

CREATE POLICY boq_items_select ON public.boq_items
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_readable(bidding_project_id));

CREATE POLICY boq_items_write ON public.boq_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_bidding_project_writable(bidding_project_id)
  );

CREATE POLICY boq_items_update ON public.boq_items
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_writable(bidding_project_id))
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY bid_documents_select ON public.bid_documents
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_readable(bidding_project_id));

CREATE POLICY bid_documents_write ON public.bid_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_bidding_project_writable(bidding_project_id)
  );

CREATE POLICY bid_documents_update ON public.bid_documents
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_writable(bidding_project_id))
  WITH CHECK (public.rls_company_access(company_id));

-- Không bảng nào có policy DELETE ⇒ xoá cứng bị chặn, chỉ xoá mềm qua `deleted_at`.


-- ----------------------------------------------------------------------------
-- 3. Đơn giá và định mức — Mẫu D ở mức DÒNG (DA-05)
--
-- Toàn bộ bảng là giá vốn, không có cột nào "công khai", nên chặn cả dòng thay vì che cột:
-- vai trò không được xem giá vốn nhận danh sách rỗng, không nhận dòng có ô trống khó hiểu.
--
-- Đây là danh mục tra cứu (Webapp Flow 7 có màn hình "Bảng đơn giá & định mức"), nên vẫn đọc
-- thẳng bằng SELECT để lọc và tìm kiếm hoạt động. Nhật ký NEN-07 ghi ở mức MỞ MÀN HÌNH: giao
-- diện gọi `log_sensitive_access('cost','unit_prices',NULL,'view')` một lần khi mở, thay vì
-- ghi một dòng nhật ký cho mỗi dòng đơn giá hiển thị.
-- ----------------------------------------------------------------------------

CREATE POLICY unit_prices_select ON public.unit_prices
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_sees_sensitive('cost')
  );

CREATE POLICY unit_prices_insert ON public.unit_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_sees_sensitive('cost')
    AND public.auth_can_create_in('DA', company_id)
  );

CREATE POLICY unit_prices_update ON public.unit_prices
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.rls_sees_sensitive('cost')
    AND public.auth_can_edit_module('DA')
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 4. Dự toán — Mẫu D ở mức CỘT (DA-06)
--
-- `bid_price` là con số gửi ra ngoài: ai xem được gói thầu cũng phải thấy, nếu không thì
-- Kinh doanh và Ban Giám đốc không biết đang chào bao nhiêu. Các cột cấu thành chi phí thì
-- ngược lại.
--
-- Thu hồi quyền ở tầng CSDL chứ không lọc ở giao diện: PostgREST cho phép gọi thẳng bảng,
-- nên cột nào không được phép đọc thì phải không đọc được, kể cả khi biết tên cột.
--
-- ⚠️ HỆ QUẢ CẦN NHỚ KHI VIẾT TRUY VẤN: `select=*` trên bảng này sẽ bị từ chối vì có cột
-- không được cấp quyền. Luôn liệt kê cột tường minh — cả mã hiện có trong `web/` đều đang
-- làm vậy.
-- ----------------------------------------------------------------------------

CREATE POLICY estimates_select ON public.estimates
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_bidding_project_readable(bidding_project_id));

CREATE POLICY estimates_insert ON public.estimates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_bidding_project_writable(bidding_project_id)
  );

CREATE POLICY estimates_update ON public.estimates
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_bidding_project_writable(bidding_project_id)
    -- Dự toán đã trình duyệt hoặc đã duyệt thì không sửa nữa; muốn đổi giá phải lập phiên
    -- bản mới (DA-07 yêu cầu giữ toàn bộ các phiên bản).
    AND status = 'draft'
  )
  WITH CHECK (public.rls_company_access(company_id));

-- ⚠️ Cú pháp phải viết danh sách cột cho TỪNG quyền: `GRANT SELECT, UPDATE (cols)` bị Postgres
-- hiểu là cấp SELECT ở mức BẢNG rồi mới tới UPDATE theo cột — nghĩa là cấp lại quyền đọc
-- toàn bộ cột vừa thu hồi, mà không có lỗi nào báo ra.
REVOKE SELECT, INSERT, UPDATE ON public.estimates FROM authenticated, anon;

GRANT
  SELECT (
    id, company_id, bidding_project_id, code, version, is_current_version, status,
    bid_price, basis_notes, prepared_by, approved_at,
    created_at, updated_at, created_by, updated_by, deleted_at
  ),
  INSERT (id, company_id, bidding_project_id, code, bid_price, basis_notes, prepared_by),
  UPDATE (
    is_current_version, status, bid_price, basis_notes, prepared_by, approved_at,
    updated_at, updated_by, deleted_at
  )
ON public.estimates TO authenticated;

-- direct_cost, overhead_cost, contingency_cost, finance_cost, tax_amount, profit_amount,
-- profit_margin_percent: CỐ Ý không cấp quyền — chỉ đọc/ghi qua hai hàm ở mục 5.

CREATE POLICY estimate_items_select ON public.estimate_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_sees_sensitive('cost')
    AND EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id AND public.rls_bidding_project_readable(e.bidding_project_id)
    )
  );

-- Ghi dòng chi tiết đi qua hàm `save_estimate_items` để ghi nhật ký NEN-07; không mở
-- INSERT/UPDATE trực tiếp.
REVOKE INSERT, UPDATE, DELETE ON public.estimate_items FROM authenticated, anon;
REVOKE SELECT ON public.estimate_items FROM anon;


-- ----------------------------------------------------------------------------
-- 5. Hai cửa duy nhất vào dữ liệu giá vốn — có ghi nhật ký (NEN-07)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.estimate_cost_breakdown(p_estimate_id uuid)
RETURNS TABLE (
  direct_cost bigint,
  overhead_cost bigint,
  contingency_cost bigint,
  finance_cost bigint,
  tax_amount bigint,
  profit_amount bigint,
  profit_margin_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF NOT public.rls_bidding_project_readable(e.bidding_project_id) THEN
    RAISE EXCEPTION 'Không xem được dự toán của gói thầu này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem giá vốn. Liên hệ Phòng Dự án – Đấu thầu nếu cần số liệu này.';
  END IF;

  -- Ghi TRƯỚC khi trả dữ liệu: ghi sau thì một lỗi giữa chừng sẽ để lọt lượt xem không dấu vết.
  PERFORM public.log_sensitive_access('cost', 'estimates', p_estimate_id, 'view', e.company_id);

  RETURN QUERY
  SELECT e.direct_cost, e.overhead_cost, e.contingency_cost, e.finance_cost,
         e.tax_amount, e.profit_amount, e.profit_margin_percent;
END;
$$;

COMMENT ON FUNCTION public.estimate_cost_breakdown(uuid) IS
  'Cấu thành giá vốn của một bản dự toán — Mẫu D, có ghi nhật ký truy cập (PRD DA-06, NEN-07).';


CREATE OR REPLACE FUNCTION public.save_estimate_costs(
  p_estimate_id uuid,
  p_direct_cost bigint,
  p_overhead_cost bigint,
  p_contingency_cost bigint,
  p_finance_cost bigint,
  p_tax_amount bigint,
  p_profit_amount bigint,
  p_profit_margin_percent numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã trình duyệt nên không sửa được. Lập phiên bản mới nếu cần đổi giá.';
  END IF;

  IF NOT public.rls_bidding_project_writable(e.bidding_project_id) THEN
    RAISE EXCEPTION 'Không sửa được dự toán của gói thầu này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được nhập giá vốn.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'estimates', p_estimate_id, 'edit', e.company_id);

  UPDATE public.estimates
     SET direct_cost = p_direct_cost,
         overhead_cost = p_overhead_cost,
         contingency_cost = p_contingency_cost,
         finance_cost = p_finance_cost,
         tax_amount = p_tax_amount,
         profit_amount = p_profit_amount,
         profit_margin_percent = p_profit_margin_percent
   WHERE id = p_estimate_id;
END;
$$;

COMMENT ON FUNCTION public.save_estimate_costs(uuid, bigint, bigint, bigint, bigint, bigint, bigint, numeric) IS
  'Ghi cấu thành giá vốn của dự toán — Mẫu D, có ghi nhật ký (PRD DA-06, NEN-07).';


/**
 * Ghi lại TOÀN BỘ dòng chi tiết của một bản dự toán.
 *
 * Thay cả bảng thay vì sửa từng dòng: người lập dự toán làm việc trên một bảng tính, một
 * lần lưu là một trạng thái nhất quán. Sửa lẻ từng dòng qua PostgREST sẽ có lúc lưu được
 * nửa bảng khi mất mạng giữa chừng.
 */
CREATE OR REPLACE FUNCTION public.save_estimate_items(p_estimate_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e       record;
  v_count integer;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã trình duyệt nên không sửa được. Lập phiên bản mới nếu cần đổi giá.';
  END IF;

  IF NOT public.rls_bidding_project_writable(e.bidding_project_id) THEN
    RAISE EXCEPTION 'Không sửa được dự toán của gói thầu này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được nhập giá vốn.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'estimates', p_estimate_id, 'edit', e.company_id);

  DELETE FROM public.estimate_items WHERE estimate_id = p_estimate_id;

  INSERT INTO public.estimate_items (
    company_id, estimate_id, boq_item_id, unit_price_id, position, cost_group,
    description, unit, quantity, unit_price, amount, notes
  )
  SELECT
    e.company_id,
    p_estimate_id,
    NULLIF(i->>'boq_item_id', '')::uuid,
    NULLIF(i->>'unit_price_id', '')::uuid,
    COALESCE((i->>'position')::numeric, 0),
    (i->>'cost_group')::cost_group,
    i->>'description',
    NULLIF(i->>'unit', ''),
    COALESCE((i->>'quantity')::numeric, 0),
    COALESCE((i->>'unit_price')::bigint, 0),
    -- Thành tiền tính ở CSDL, không nhận từ trình duyệt: hai nơi cùng tính ra hai con số
    -- lệch nhau là chuyện sớm muộn, và bảng dự toán thì không được phép cộng sai.
    COALESCE((i->>'quantity')::numeric, 0)::bigint * COALESCE((i->>'unit_price')::bigint, 0),
    NULLIF(i->>'notes', '')
  FROM jsonb_array_elements(p_items) AS i;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Tổng chi phí trực tiếp luôn khớp với các dòng vừa ghi.
  UPDATE public.estimates
     SET direct_cost = COALESCE((
           SELECT sum(amount) FROM public.estimate_items
           WHERE estimate_id = p_estimate_id AND deleted_at IS NULL
             AND cost_group IN ('vat_tu', 'nhan_cong', 'may_moc', 'thau_phu')
         ), 0)
   WHERE id = p_estimate_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.save_estimate_items(uuid, jsonb) IS
  'Ghi lại toàn bộ dòng chi tiết dự toán trong một giao dịch — Mẫu D, có ghi nhật ký (DA-06).';


-- ----------------------------------------------------------------------------
-- 6. Ngân sách thi công — Mẫu D ở mức DÒNG (DA-09)
--
-- Ngân sách vật tư/nhân công là thứ Thi công, Cung ứng và Kế toán phải đọc hằng ngày, nên
-- KHÔNG chặn cả bảng. Riêng dòng "lợi nhuận mục tiêu" chỉ mở cho vai trò được xem lợi nhuận —
-- đây chính là Mẫu D diễn đạt bằng dòng thay vì bằng cột, vì cấu trúc bảng vốn đã tách theo
-- nhóm chi phí.
-- ----------------------------------------------------------------------------

CREATE POLICY project_budgets_select ON public.project_budgets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (cost_group <> 'loi_nhuan' OR public.rls_sees_sensitive('profit'))
  );

-- Ngân sách chỉ sinh ra từ dự toán đã duyệt (hàm ở mục 8), không nhập tay từ trình duyệt.
REVOKE INSERT, DELETE ON public.project_budgets FROM authenticated, anon;
REVOKE SELECT, UPDATE ON public.project_budgets FROM anon;

CREATE POLICY project_budgets_update ON public.project_budgets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('DA')
    AND (cost_group <> 'loi_nhuan' OR public.rls_sees_sensitive('profit'))
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 7. Phiên bản dự toán — CSDL cấp số, không phải trình duyệt (DA-07, NEN-05)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.estimates_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prev record;
BEGIN
  SELECT code, max(version) AS max_version
    INTO v_prev
    FROM public.estimates
   WHERE bidding_project_id = NEW.bidding_project_id
     AND deleted_at IS NULL
   GROUP BY code
   ORDER BY max(version) DESC
   LIMIT 1;

  IF v_prev.code IS NOT NULL THEN
    -- Cùng gói thầu ⇒ cùng mã hồ sơ, chỉ khác số phiên bản. Nhìn mã là biết cùng một bộ
    -- dự toán qua các lần chỉnh (NEN-05).
    NEW.code := v_prev.code;
    NEW.version := v_prev.max_version + 1;
  ELSE
    NEW.version := 1;
  END IF;

  NEW.is_current_version := true;
  NEW.status := 'draft';

  -- Bản cũ thôi hiệu lực. Unique index `estimates_one_current_per_project` là lưới an toàn
  -- nếu dòng này sót.
  UPDATE public.estimates
     SET is_current_version = false
   WHERE bidding_project_id = NEW.bidding_project_id
     AND is_current_version
     AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER estimates_assign_version
  BEFORE INSERT ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.estimates_assign_version();


-- ----------------------------------------------------------------------------
-- 8. Luồng phê duyệt giá dự thầu (DA-07)
--
-- Dùng lại nguyên bảng `approvals` và hàm `decide_approval` đã có từ CRM-04 — Hộp thư Phê
-- duyệt là MỘT màn hình cho mọi module (Webapp Flow 4.6), nên không dựng bảng duyệt riêng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_estimate_approval(p_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  e          record;
  p          record;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF NOT public.rls_bidding_project_writable(e.bidding_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên gói thầu này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã được trình duyệt.';
  END IF;

  IF e.bid_price IS NULL OR e.bid_price <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá dự thầu. Nhập giá trước khi gửi phê duyệt.';
  END IF;

  SELECT * INTO p FROM public.bidding_projects WHERE id = e.bidding_project_id;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    e.company_id, 'estimate_price', 'estimates', e.id, e.code,
    format('Giá dự thầu %s — %s', e.code, p.name),
    e.bid_price,
    e.basis_notes,
    'pending_approval',
    v_user,
    -- Hạn duyệt bám hạn nộp thầu: duyệt sau khi đã quá hạn nộp thì không còn ý nghĩa gì.
    p.submission_deadline::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.estimates SET status = 'pending_approval' WHERE id = p_estimate_id;
  UPDATE public.bidding_projects SET stage = 'cho_duyet_gia' WHERE id = e.bidding_project_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.request_estimate_approval(uuid) IS
  'Trình duyệt giá dự thầu — tạo hồ sơ trong Hộp thư Phê duyệt chung (DA-07, NEN-02).';


-- Bổ sung nhánh xử lý cho dự toán vào hàm quyết định phê duyệt dùng chung.
CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  -- ⚠️ Ép kiểu tường minh cho cả hai nhánh: một biểu thức CASE trả về `text`, mà cột đích là
  -- enum. Thiếu ép kiểu thì hàm chạy tới đây mới lỗi — nghĩa là hồ sơ phê duyệt đã ghi nhận
  -- quyết định nhưng hồ sơ nguồn không đổi trạng thái (lỗi này từng xảy ra ở 0013, sửa ở 0014).
  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id INTO e;

    -- Từ chối thì gói thầu quay lại bước lập dự toán để sửa, không nằm mãi ở "chờ duyệt giá".
    UPDATE public.bidding_projects
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
           updated_at = now(), updated_by = v_user
     WHERE id = e.bidding_project_id;
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 9. Nộp thầu và ghi kết quả (DA-08)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_bid(p_bidding_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.auth_user_id();
  v_missing integer;
  v_priced  integer;
BEGIN
  IF NOT public.rls_bidding_project_writable(p_bidding_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên gói thầu này, hoặc hồ sơ đã nộp.';
  END IF;

  -- Giá chưa duyệt mà nộp thầu thì chữ ký phê duyệt của DA-07 thành hình thức.
  SELECT count(*) INTO v_priced
    FROM public.estimates
   WHERE bidding_project_id = p_bidding_project_id
     AND is_current_version AND deleted_at IS NULL AND status = 'completed';

  IF v_priced = 0 THEN
    RAISE EXCEPTION 'Chưa có bản dự toán được phê duyệt. Trình duyệt giá trước khi nộp thầu.';
  END IF;

  -- Checklist DA-08: thiếu đầu mục bắt buộc thì chặn, vì phát hiện sau khi nộp là quá muộn.
  SELECT count(*) INTO v_missing
    FROM public.bid_documents
   WHERE bidding_project_id = p_bidding_project_id
     AND deleted_at IS NULL AND is_required AND submitted_at IS NULL;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Còn % đầu mục hồ sơ bắt buộc chưa hoàn thành. Kiểm tra tab Hồ sơ thầu.', v_missing;
  END IF;

  UPDATE public.bidding_projects
     SET submitted_at = now(), stage = 'nop_thau', updated_at = now(), updated_by = v_user
   WHERE id = p_bidding_project_id;
END;
$$;

COMMENT ON FUNCTION public.submit_bid(uuid) IS
  'Đánh dấu đã nộp thầu — chặn nếu giá chưa duyệt hoặc hồ sơ bắt buộc còn thiếu (DA-07, DA-08).';


CREATE OR REPLACE FUNCTION public.record_bid_result(
  p_bidding_project_id uuid,
  p_won boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
BEGIN
  SELECT * INTO p FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('DA') THEN
    RAISE EXCEPTION 'Không thao tác được trên gói thầu này.';
  END IF;

  IF p.submitted_at IS NULL THEN
    RAISE EXCEPTION 'Gói thầu chưa nộp nên chưa có kết quả để ghi nhận.';
  END IF;

  -- DA-08 yêu cầu ghi "kết quả VÀ NGUYÊN NHÂN" — trượt thầu không nêu nguyên nhân thì gói
  -- sau lặp lại đúng sai lầm đó.
  IF NOT p_won AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân trượt thầu.';
  END IF;

  UPDATE public.bidding_projects
     SET stage = (CASE WHEN p_won THEN 'trung_thau' ELSE 'truot_thau' END)::bidding_stage,
         lost_reason = CASE WHEN p_won THEN NULL ELSE btrim(p_reason) END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_bidding_project_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 10. Chuyển dự toán đã duyệt thành ngân sách thi công (DA-09)
--
-- Đây là mắt xích nối Giai đoạn 1 sang Giai đoạn 2: Module TC nhận đúng bộ ngân sách này
-- (TC-01) và so sánh chi phí thực tế với nó (TC-05). PRD DA-09 nhấn mạnh "bàn giao đầy đủ
-- hồ sơ, không chỉ một file tổng giá" — nên ngân sách tách theo NHÓM CHI PHÍ, không phải một
-- con số tổng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_project_budget(p_bidding_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  p       record;
  e       record;
  v_rows  integer;
BEGIN
  SELECT * INTO p FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('DA') THEN
    RAISE EXCEPTION 'Không thao tác được trên gói thầu này.';
  END IF;

  IF p.stage <> 'trung_thau' THEN
    RAISE EXCEPTION 'Chỉ lập ngân sách thi công sau khi trúng thầu.';
  END IF;

  IF p.budget_generated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ngân sách thi công đã được lập cho gói thầu này.';
  END IF;

  SELECT * INTO e FROM public.estimates
   WHERE bidding_project_id = p_bidding_project_id
     AND is_current_version AND deleted_at IS NULL AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có bản dự toán được phê duyệt để chuyển thành ngân sách.';
  END IF;

  -- Chi phí trực tiếp: gộp theo nhóm từ các dòng dự toán, giữ nguyên cách phân nhóm của
  -- người lập giá thay vì tự chia lại.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, estimate_id, cost_group, cost_code, name, budgeted_amount
  )
  SELECT p.company_id, p.id, e.id, i.cost_group,
         upper(i.cost_group::text),
         initcap(replace(i.cost_group::text, '_', ' ')),
         sum(i.amount)
    FROM public.estimate_items i
   WHERE i.estimate_id = e.id AND i.deleted_at IS NULL
   GROUP BY i.cost_group;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Các khoản không nằm trong dòng chi tiết nhưng DA-09 liệt kê thành mã chi phí riêng.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, estimate_id, cost_group, cost_code, name, budgeted_amount
  )
  SELECT p.company_id, p.id, e.id, g.cost_group, g.cost_code, g.name, g.amount
    FROM (
      VALUES
        ('chi_phi_chung'::cost_group, 'CHI_PHI_CHUNG', 'Chi phí chung', COALESCE(e.overhead_cost, 0)),
        ('du_phong'::cost_group,      'DU_PHONG',      'Dự phòng rủi ro', COALESCE(e.contingency_cost, 0)),
        ('loi_nhuan'::cost_group,     'LOI_NHUAN',     'Lợi nhuận mục tiêu', COALESCE(e.profit_amount, 0))
    ) AS g(cost_group, cost_code, name, amount)
   WHERE g.amount > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_budgets b
       WHERE b.bidding_project_id = p.id AND b.cost_code = g.cost_code AND b.deleted_at IS NULL
     );

  UPDATE public.bidding_projects
     SET budget_generated_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_bidding_project_id;

  -- Bàn giao là phải có người BIẾT mà nhận (PRD DA-09, NEN-03). Báo cho người chịu trách
  -- nhiệm gói thầu và toàn bộ vai trò Thi công của pháp nhân đó.
  PERFORM public.create_notification(
    u.id, p.company_id, 'budget_handover',
    format('Ngân sách thi công của gói thầu %s đã được bàn giao.', p.code),
    'bidding_projects', p.id,
    format('/da/goi-thau/%s?tab=ngan-sach', p.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p.company_id
    AND (r.code IN ('TC', 'DA_DT') OR u.id = p.responsible_user_id);

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.generate_project_budget(uuid) IS
  'Chuyển dự toán đã duyệt thành ngân sách thi công theo nhóm chi phí và thông báo các bên (DA-09).';
