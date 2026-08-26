-- ============================================================================
-- Module TK — phân quyền và luồng nghiệp vụ
--
-- Nguồn: PRD TK-01 → TK-08, Backend Schema 4.4, Webapp Flow 3.3.
--
-- Vướng mắc khảo sát mà module này phải giải quyết (Webapp Flow 3.3): "không chắc file đang
-- dùng có phải bản mới nhất". Vì vậy MỌI ràng buộc về phiên bản ở đây nằm trong CSDL, không
-- nằm ở trình duyệt: unique index có điều kiện giữ "chỉ một bản đang hiệu lực", trigger cấp
-- số phiên bản, và hàm SECURITY DEFINER là cửa duy nhất để phát hành.
--
-- Module này KHÔNG có dữ liệu Mẫu D mới. Dự toán NVO dùng lại đúng bảng `estimates` của
-- Module DA (TK-07), nên toàn bộ cơ chế che giá vốn của migration 0021 áp dụng nguyên vẹn.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bốn cột kiểm toán và các cột định danh bất biến (migration 0019)
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.design_projects');
SELECT public.attach_audit_touch('public.design_briefs');
SELECT public.attach_audit_touch('public.design_surveys');
SELECT public.attach_audit_touch('public.design_versions');
SELECT public.attach_audit_touch('public.design_reviews');
SELECT public.attach_audit_touch('public.design_discipline_tasks');
SELECT public.attach_audit_touch('public.change_requests');

CREATE TRIGGER design_projects_freeze_identity
  BEFORE UPDATE ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

-- Đầu bài và bản vẽ: khoá luôn `version`. Số phiên bản là căn cứ trả lời "công trường đang
-- cầm bản nào" — sửa được số đó thì cơ chế một bản hiệu lực duy nhất mất ý nghĩa.
CREATE TRIGGER design_briefs_freeze_identity
  BEFORE UPDATE ON public.design_briefs
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'design_project_id', 'version'
  );

CREATE TRIGGER design_versions_freeze_identity
  BEFORE UPDATE ON public.design_versions
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'design_project_id', 'discipline', 'version'
  );

CREATE TRIGGER design_surveys_freeze_identity
  BEFORE UPDATE ON public.design_surveys
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'design_project_id'
  );

CREATE TRIGGER design_discipline_tasks_freeze_identity
  BEFORE UPDATE ON public.design_discipline_tasks
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'design_project_id', 'discipline'
  );

CREATE TRIGGER change_requests_freeze_identity
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'design_project_id'
  );


-- ----------------------------------------------------------------------------
-- 1. Dự án thiết kế — Mẫu A (Backend Schema 4.4)
-- ----------------------------------------------------------------------------

ALTER TABLE public.design_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_briefs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_surveys           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_versions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_discipline_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_requests          ENABLE ROW LEVEL SECURITY;

CREATE POLICY design_projects_select ON public.design_projects
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('TK')
  );

CREATE POLICY design_projects_insert ON public.design_projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_create_in('TK', company_id)
  );

CREATE POLICY design_projects_update ON public.design_projects
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('TK')
  )
  WITH CHECK (public.rls_company_access(company_id));


-- Điều kiện dùng chung cho mọi bảng con — viết thành hàm để bảy bảng không chép lại rồi
-- lệch nhau về sau (đúng cách đã làm với `rls_bidding_project_readable` ở Module DA).
CREATE OR REPLACE FUNCTION public.rls_design_project_readable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.design_projects p
    WHERE p.id = p_project_id
      AND p.deleted_at IS NULL
      AND public.rls_company_access(p.company_id)
      AND public.auth_can_view_module('TK')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_design_project_writable(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.design_projects p
    WHERE p.id = p_project_id
      AND p.deleted_at IS NULL
      AND public.rls_company_access(p.company_id)
      AND public.auth_can_edit_module('TK')
      -- Đã bàn giao thi công thì hồ sơ đóng băng: sửa bản vẽ sau khi công trường đã nhận là
      -- tạo ra bộ hồ sơ trên hệ thống khác bộ đang thi công ngoài công trình (TK-05, TK-08).
      -- Muốn đổi sau bàn giao thì đi đường yêu cầu thay đổi (TK-06), không sửa thẳng.
      AND p.handed_over_at IS NULL
      AND p.stage <> 'dung_thiet_ke'
  );
$$;

COMMENT ON FUNCTION public.rls_design_project_writable(uuid) IS
  'Dự án thiết kế còn sửa được không: đúng pháp nhân, có quyền sửa module TK, chưa bàn giao thi công và chưa dừng (TK-08).';


-- ----------------------------------------------------------------------------
-- 2. Đầu bài, khảo sát, phiên bản, yêu cầu thay đổi — theo quyền của dự án cha
-- ----------------------------------------------------------------------------

CREATE POLICY design_briefs_select ON public.design_briefs
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));

CREATE POLICY design_briefs_insert ON public.design_briefs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_design_project_writable(design_project_id)
  );

CREATE POLICY design_briefs_update ON public.design_briefs
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_design_project_writable(design_project_id)
    -- Bản đã hết hiệu lực không sửa được nữa: sửa lịch sử thì không còn là lịch sử.
    AND is_current_version
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY design_versions_select ON public.design_versions
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));

CREATE POLICY design_versions_insert ON public.design_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_design_project_writable(design_project_id)
  );

CREATE POLICY design_versions_update ON public.design_versions
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_design_project_writable(design_project_id)
    -- Bản ĐÃ PHÁT HÀNH không sửa được từ trình duyệt (TK-05). Phát hành là một cam kết đã
    -- gửi thông báo cho kiến trúc, kết cấu, điện nước, dự toán, Kinh doanh và công trường —
    -- sửa lặng lẽ sau đó là đúng cái sai mà cơ chế phiên bản sinh ra để chặn.
    AND published_at IS NULL
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY change_requests_select ON public.change_requests
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));

CREATE POLICY change_requests_insert ON public.change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    -- CỐ Ý dùng `readable` chứ không phải `writable`: TK-08 nói rõ hồ sơ đã bàn giao vẫn
    -- phải "xử lý sai khác/thay đổi tại hiện trường" — công trường phải ghi được yêu cầu
    -- thay đổi sau bàn giao, nếu không họ sẽ quay lại gọi điện và Zalo như trước.
    AND public.rls_design_project_readable(design_project_id)
    AND public.auth_can_view_module('TK')
  );

CREATE POLICY change_requests_update ON public.change_requests
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_design_project_readable(design_project_id)
    AND public.auth_can_edit_module('TK')
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 3. Khảo sát hiện trạng và tiến độ bộ môn — Mẫu B (Backend Schema 4.4)
--
-- Mẫu B = điều kiện Mẫu A cộng thêm: chỉ người chịu trách nhiệm / người được giao / quản lý
-- mới SỬA được; người khác cùng pháp nhân chỉ XEM.
--
-- Vì sao trưởng phòng (người chịu trách nhiệm dự án) sửa được mọi bộ môn: một kỹ sư nghỉ ốm
-- mà không ai cập nhật được tiến độ bộ môn đó thì cả dự án đứng — Mẫu B ở Backend Schema 3.3
-- ghi rõ "người chịu trách nhiệm/phối hợp/QUẢN LÝ TRỰC TIẾP".
-- ----------------------------------------------------------------------------

CREATE POLICY design_surveys_select ON public.design_surveys
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));

CREATE POLICY design_surveys_insert ON public.design_surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_design_project_writable(design_project_id)
  );

-- Người chịu trách nhiệm dự án luôn nằm trong danh sách "người phối hợp" của Mẫu B: một
-- kỹ sư nghỉ mà trưởng phòng không sửa được biên bản của dự án mình phụ trách thì cả dự án
-- đứng (Backend Schema 3.3 Mẫu B ghi rõ "quản lý trực tiếp").
CREATE POLICY design_surveys_update ON public.design_surveys
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_design_project_writable(design_project_id)
    AND (
      public.rls_owner_can_write(
        company_id,
        surveyed_by,
        (SELECT array_remove(ARRAY[p.responsible_user_id], NULL)
           FROM public.design_projects p WHERE p.id = design_project_id)
      )
      -- Chưa ghi người khảo sát → ai tạo được hồ sơ TK trong pháp nhân đó thì nhận được.
      -- Bỏ trống không được phép làm hồ sơ khoá chặt hơn là điền tên ai đó (bài học 0018).
      OR (surveyed_by IS NULL AND public.auth_can_create_in('TK', company_id))
    )
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY design_discipline_tasks_select ON public.design_discipline_tasks
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));

CREATE POLICY design_discipline_tasks_insert ON public.design_discipline_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_design_project_writable(design_project_id)
  );

CREATE POLICY design_discipline_tasks_update ON public.design_discipline_tasks
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_design_project_writable(design_project_id)
    AND (
      public.rls_owner_can_write(
        company_id,
        assignee_id,
        (SELECT array_remove(ARRAY[p.responsible_user_id], NULL)
           FROM public.design_projects p WHERE p.id = design_project_id)
      )
      -- Bộ môn chưa giao cho ai thì người có quyền tạo hồ sơ TK giao được (bài học 0018).
      OR (assignee_id IS NULL AND public.auth_can_create_in('TK', company_id))
    )
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 4. Lịch sử góp ý — chỉ ghi thêm, không sửa, không xoá (TK-03)
--
-- "Xác nhận duyệt của khách hàng làm CĂN CỨ chuyển bước tiếp theo" (TK-03). Một căn cứ sửa
-- được thì không còn là căn cứ — nên bảng này không có policy UPDATE và không có DELETE.
-- Ghi cũng chỉ qua hàm `record_design_review`, để việc "khách đã duyệt bản nào" luôn đi kèm
-- cập nhật cột `customer_approved_at` trong cùng một giao dịch.
-- ----------------------------------------------------------------------------

CREATE POLICY design_reviews_select ON public.design_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.design_versions v
      WHERE v.id = design_version_id AND public.rls_design_project_readable(v.design_project_id)
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.design_reviews FROM authenticated, anon;
REVOKE SELECT ON public.design_reviews FROM anon;

-- Không bảng nào có policy DELETE ⇒ xoá cứng bị chặn, chỉ xoá mềm qua `deleted_at`.


-- ----------------------------------------------------------------------------
-- 5. Dự toán dùng chung cho cả hai module (TK-07)
--
-- `estimates` và `boq_items` từ nay nhận hai loại hồ sơ cha. Quyền phải hỏi đúng module của
-- hồ sơ cha đó: dự toán của gói thầu hỏi quyền DA, dự toán của dự án thiết kế hỏi quyền TK.
-- Nếu cứ hỏi DA cho cả hai thì kiến trúc sư NVO (vai trò TKE, không có quyền DA) không lập
-- nổi dự toán cho chính dự án của mình.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_estimate_parent_readable(
  p_bidding_project_id uuid,
  p_design_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bidding_project_id IS NOT NULL
      THEN public.rls_bidding_project_readable(p_bidding_project_id)
    WHEN p_design_project_id IS NOT NULL
      THEN public.rls_design_project_readable(p_design_project_id)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.rls_estimate_parent_writable(
  p_bidding_project_id uuid,
  p_design_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_bidding_project_id IS NOT NULL
      THEN public.rls_bidding_project_writable(p_bidding_project_id)
    WHEN p_design_project_id IS NOT NULL
      THEN public.rls_design_project_writable(p_design_project_id)
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.rls_estimate_parent_writable(uuid, uuid) IS
  'Hồ sơ cha của một bản dự toán còn sửa được không — hỏi đúng module của hồ sơ đó (TK-07).';

DROP POLICY boq_items_select ON public.boq_items;
DROP POLICY boq_items_write ON public.boq_items;
DROP POLICY boq_items_update ON public.boq_items;

CREATE POLICY boq_items_select ON public.boq_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_estimate_parent_readable(bidding_project_id, design_project_id)
  );

CREATE POLICY boq_items_write ON public.boq_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_estimate_parent_writable(bidding_project_id, design_project_id)
  );

CREATE POLICY boq_items_update ON public.boq_items
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_estimate_parent_writable(bidding_project_id, design_project_id)
  )
  WITH CHECK (public.rls_company_access(company_id));

DROP POLICY estimates_select ON public.estimates;
DROP POLICY estimates_insert ON public.estimates;
DROP POLICY estimates_update ON public.estimates;

CREATE POLICY estimates_select ON public.estimates
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_estimate_parent_readable(bidding_project_id, design_project_id)
  );

CREATE POLICY estimates_insert ON public.estimates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_estimate_parent_writable(bidding_project_id, design_project_id)
  );

CREATE POLICY estimates_update ON public.estimates
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_estimate_parent_writable(bidding_project_id, design_project_id)
    AND status = 'draft'
  )
  WITH CHECK (public.rls_company_access(company_id));

-- Cột mới `design_project_id` phải được cấp quyền tường minh: migration 0021 đã THU HỒI
-- quyền ở mức bảng và cấp lại theo danh sách cột, nên cột thêm sau mặc định KHÔNG đọc được.
-- Quên bước này thì mọi truy vấn dự toán của NVO trả về lỗi quyền mà không rõ vì sao.
GRANT
  SELECT (design_project_id),
  INSERT (design_project_id)
ON public.estimates TO authenticated;

DROP POLICY estimate_items_select ON public.estimate_items;

CREATE POLICY estimate_items_select ON public.estimate_items
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_sees_sensitive('cost')
    AND EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_id
        AND public.rls_estimate_parent_readable(e.bidding_project_id, e.design_project_id)
    )
  );


-- Bốn hàm giá vốn của Module DA phải hỏi đúng hồ sơ cha. Thay bằng bản dùng hàm điều phối;
-- phần còn lại giữ nguyên để không đổi hành vi đã có test bao phủ.
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

  IF NOT public.rls_estimate_parent_readable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không xem được dự toán của hồ sơ này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem giá vốn. Liên hệ Phòng Dự án – Đấu thầu nếu cần số liệu này.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'estimates', p_estimate_id, 'view', e.company_id);

  RETURN QUERY
  SELECT e.direct_cost, e.overhead_cost, e.contingency_cost, e.finance_cost,
         e.tax_amount, e.profit_amount, e.profit_margin_percent;
END;
$$;

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

  IF NOT public.rls_estimate_parent_writable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không sửa được dự toán của hồ sơ này.';
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

  IF NOT public.rls_estimate_parent_writable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không sửa được dự toán của hồ sơ này.';
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
    COALESCE((i->>'quantity')::numeric, 0)::bigint * COALESCE((i->>'unit_price')::bigint, 0),
    NULLIF(i->>'notes', '')
  FROM jsonb_array_elements(p_items) AS i;

  GET DIAGNOSTICS v_count = ROW_COUNT;

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


-- Trigger cấp số phiên bản: gom theo ĐÚNG hồ sơ cha của dòng đang chèn.
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


-- Trình duyệt giá: lấy tên hồ sơ và hạn duyệt từ đúng hồ sơ cha.
CREATE OR REPLACE FUNCTION public.request_estimate_approval(p_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  e          record;
  v_name     text;
  v_due      timestamptz;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF NOT public.rls_estimate_parent_writable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên hồ sơ này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã được trình duyệt.';
  END IF;

  IF e.bid_price IS NULL OR e.bid_price <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá dự thầu. Nhập giá trước khi gửi phê duyệt.';
  END IF;

  IF e.bidding_project_id IS NOT NULL THEN
    -- Hạn duyệt bám hạn nộp thầu: duyệt sau khi đã quá hạn nộp thì không còn ý nghĩa gì.
    SELECT p.name, p.submission_deadline::timestamptz INTO v_name, v_due
      FROM public.bidding_projects p WHERE p.id = e.bidding_project_id;
  ELSE
    -- Với NVO, hạn duyệt bám hạn bàn giao hồ sơ thi công.
    SELECT p.name, p.handover_deadline::timestamptz INTO v_name, v_due
      FROM public.design_projects p WHERE p.id = e.design_project_id;
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    e.company_id, 'estimate_price', 'estimates', e.id, e.code,
    format('Giá dự thầu %s — %s', e.code, v_name),
    e.bid_price, e.basis_notes, 'pending_approval', v_user, v_due
  )
  RETURNING id INTO v_approval;

  UPDATE public.estimates SET status = 'pending_approval' WHERE id = p_estimate_id;

  IF e.bidding_project_id IS NOT NULL THEN
    UPDATE public.bidding_projects SET stage = 'cho_duyet_gia' WHERE id = e.bidding_project_id;
  END IF;

  RETURN v_approval;
END;
$$;


-- Quyết định phê duyệt: chỉ đổi bước gói thầu khi dự toán THUỘC gói thầu. Dự án thiết kế
-- giữ nguyên bước `du_toan` — Webapp Flow 3.3 bước 5 nói rõ việc tiếp theo của NVO là "gửi
-- Kinh doanh xác nhận với khách", không phải một bước mới trong module TK.
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
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      -- Từ chối thì gói thầu quay lại bước lập dự toán để sửa, không nằm mãi ở "chờ duyệt giá".
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. Phiên bản đầu bài và bản vẽ — CSDL cấp số, không phải trình duyệt (TK-01, TK-05)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.design_briefs_assign_version()
RETURNS trigger
LANGUAGE plpgsql
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

  -- NEN-05: bản điều chỉnh phải nêu nguyên nhân. Bản đầu tiên thì không có gì để nêu.
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

CREATE TRIGGER design_briefs_assign_version
  BEFORE INSERT ON public.design_briefs
  FOR EACH ROW EXECUTE FUNCTION public.design_briefs_assign_version();


/**
 * Số phiên bản bản vẽ đánh riêng theo TỪNG BỘ MÔN.
 *
 * Đánh số chung cả dự án thì "Kết cấu bản 7" có thể là bản kết cấu đầu tiên — người ngoài
 * công trường không đọc được con số đó. Đánh riêng theo bộ môn thì "Kết cấu bản 2" đúng là
 * lần thứ hai kết cấu ra bản vẽ.
 *
 * Bản mới KHÔNG tự thành bản đang hiệu lực: nó là bản NHÁP cho tới khi phát hành
 * (`publish_design_version`). Bản đang dùng ngoài công trường chỉ đổi khi có người bấm phát
 * hành và thông báo đi kèm — đúng yêu cầu TK-05.
 */
CREATE OR REPLACE FUNCTION public.design_versions_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT max(version) INTO v_max
    FROM public.design_versions
   WHERE design_project_id = NEW.design_project_id
     AND discipline = NEW.discipline
     AND deleted_at IS NULL;

  NEW.version := COALESCE(v_max, 0) + 1;
  NEW.is_current_version := false;
  NEW.published_at := NULL;
  NEW.published_by := NULL;
  NEW.customer_approved_at := NULL;

  IF NEW.version > 1 AND (NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân điều chỉnh so với bản trước.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER design_versions_assign_version
  BEFORE INSERT ON public.design_versions
  FOR EACH ROW EXECUTE FUNCTION public.design_versions_assign_version();


-- ----------------------------------------------------------------------------
-- 7. Phát hành phiên bản và thông báo đồng thời các bên (TK-05)
--
-- PRD TK-05 nguyên văn: "khi phát hành bản điều chỉnh, thông báo ĐỒNG THỜI cho kiến trúc,
-- kết cấu, điện nước, dự toán, Kinh doanh và Ban công trường".
--
-- Đây chính là endpoint `POST /api/design-projects/:id/publish-version` của Backend Schema
-- 4.4. Đặt ở CSDL chứ không ở Workers vì cả ba việc — hạ bản cũ, nâng bản mới, gửi thông báo —
-- phải nằm trong MỘT giao dịch: hạ được bản cũ mà thông báo lỗi giữa chừng thì công trường
-- vẫn đang cầm bản đã hết hiệu lực và không ai biết.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_design_version(p_version_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v          record;
  p          record;
  v_notified integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v FROM public.design_versions
   WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bản này.';
  END IF;

  IF NOT public.rls_design_project_writable(v.design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này, hoặc hồ sơ đã bàn giao.';
  END IF;

  IF v.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phiên bản này đã phát hành.';
  END IF;

  IF v.document_version_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đính kèm tệp bản vẽ. Tải tệp lên trước khi phát hành.';
  END IF;

  SELECT * INTO p FROM public.design_projects WHERE id = v.design_project_id;

  -- Hạ bản cũ TRƯỚC khi nâng bản mới: unique index chỉ cho một bản đã phát hành đang hiệu
  -- lực trên mỗi bộ môn, làm ngược thứ tự sẽ vi phạm ràng buộc ngay giữa giao dịch.
  UPDATE public.design_versions
     SET is_current_version = false, updated_at = now(), updated_by = v_user
   WHERE design_project_id = v.design_project_id
     AND discipline = v.discipline
     AND is_current_version
     AND published_at IS NOT NULL
     AND deleted_at IS NULL;

  UPDATE public.design_versions
     SET is_current_version = true,
         published_at = now(),
         published_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_version_id;

  -- Thông báo cho ĐÚNG những bộ phận PRD TK-05 liệt kê, trong đúng pháp nhân của dự án.
  -- Người vừa bấm phát hành không nhận thông báo về việc mình vừa làm (create_notification lo).
  SELECT count(*) INTO v_notified
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_version_published',
      format('Bản %s của dự án thiết kế %s đã phát hành phiên bản %s.',
             lower(replace(v.discipline::text, '_', ' ')), p.code, v.version),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TKE', 'DA_DT', 'KD', 'TC') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_notified;
END;
$$;

COMMENT ON FUNCTION public.publish_design_version(uuid) IS
  'Phát hành một phiên bản bản vẽ và thông báo đồng thời các bên liên quan — TK-05, Backend Schema 4.4.';


-- ----------------------------------------------------------------------------
-- 8. Ghi nhận vòng góp ý và xác nhận duyệt của khách hàng (TK-03)
--
-- Cửa DUY NHẤT ghi vào `design_reviews`. Đi qua hàm thay vì mở INSERT vì "khách đã duyệt"
-- phải đồng thời ghi lịch sử VÀ đóng dấu lên phiên bản trong cùng một giao dịch — hai thao
-- tác rời nhau sẽ có lúc chỉ chạy được một nửa.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_design_review(
  p_version_id uuid,
  p_reviewer_type design_reviewer_type,
  p_decision design_review_decision,
  p_comments text,
  p_reviewer_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  v        record;
  p        record;
  v_review uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v FROM public.design_versions
   WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bản này.';
  END IF;

  IF NOT public.rls_design_project_writable(v.design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này, hoặc hồ sơ đã bàn giao.';
  END IF;

  IF p_comments IS NULL OR btrim(p_comments) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi nội dung góp ý.';
  END IF;

  -- Góp ý trên bản chưa phát hành thì không có gì để khách xem: khách đang cầm bản khác.
  IF v.published_at IS NULL THEN
    RAISE EXCEPTION 'Phiên bản này chưa phát hành nên chưa có gì để lấy ý kiến.';
  END IF;

  IF p_reviewer_type = 'khach_hang' AND (p_reviewer_name IS NULL OR btrim(p_reviewer_name) = '') THEN
    RAISE EXCEPTION 'Vui lòng ghi tên người góp ý phía khách hàng.';
  END IF;

  SELECT * INTO p FROM public.design_projects WHERE id = v.design_project_id;

  INSERT INTO public.design_reviews (
    company_id, design_version_id, reviewer_type, decision,
    recorded_by, reviewer_name, comments
  )
  VALUES (
    p.company_id, p_version_id, p_reviewer_type, p_decision,
    v_user, NULLIF(btrim(p_reviewer_name), ''), btrim(p_comments)
  )
  RETURNING id INTO v_review;

  IF p_decision = 'duyet' AND p_reviewer_type = 'khach_hang' THEN
    UPDATE public.design_versions
       SET customer_approved_at = now(), updated_at = now(), updated_by = v_user
     WHERE id = p_version_id;

    -- TK-03: "xác nhận duyệt của khách hàng làm CĂN CỨ chuyển bước tiếp theo". Chỉ phương án
    -- kiến trúc mới mở khoá bước hồ sơ kỹ thuật — khách duyệt bản kết cấu không có nghĩa là
    -- quay lại đầu quy trình.
    IF v.discipline = 'phuong_an' AND p.stage IN ('phuong_an', 'cho_khach_duyet') THEN
      UPDATE public.design_projects
         SET stage = 'ho_so_ky_thuat', updated_at = now(), updated_by = v_user
       WHERE id = p.id;
    END IF;
  END IF;

  RETURN v_review;
END;
$$;

COMMENT ON FUNCTION public.record_design_review(uuid, design_reviewer_type, design_review_decision, text, text) IS
  'Ghi một vòng góp ý/duyệt của khách hàng lên phiên bản thiết kế — cửa duy nhất vào bảng lịch sử (TK-03).';


-- ----------------------------------------------------------------------------
-- 9. Kiểm tra đồng bộ đa bộ môn (TK-04, TK-08)
--
-- MỘT hàm dùng cho cả hai chỗ: nút "Kiểm tra đồng bộ" ở tab Hồ sơ kỹ thuật, và bước chặn
-- trước khi bàn giao thi công. Hai bộ quy tắc riêng thì sớm muộn cũng lệch nhau, và lúc đó
-- màn hình báo "đã đồng bộ" trong khi nút bàn giao vẫn từ chối.
--
-- `blocking = false` là cảnh báo để người phụ trách cân nhắc, không chặn bàn giao.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_design_sync(p_design_project_id uuid)
RETURNS TABLE (
  code text,
  discipline design_discipline,
  message text,
  blocking boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_design_project_readable(p_design_project_id) THEN
    RAISE EXCEPTION 'Không xem được dự án thiết kế này.';
  END IF;

  -- (a) Thiếu bản vẽ đang hiệu lực của một bộ môn — thiếu là không thi công được.
  RETURN QUERY
  SELECT 'thieu_ban_ve'::text,
         d.discipline,
         format('Bộ môn %s chưa có bản vẽ nào được phát hành.',
                lower(replace(d.discipline::text, '_', ' '))),
         true
    FROM unnest(ARRAY['kien_truc', 'ket_cau', 'dien_nuoc']::design_discipline[]) AS d(discipline)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = d.discipline
        AND v.is_current_version
        AND v.published_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (b) Bộ môn chưa báo hoàn thành. Phát hành khi bộ môn còn đang vẽ nghĩa là bản trên hệ
  -- thống không phải bản cuối — đúng vướng mắc #9 mà module này sinh ra để giải.
  RETURN QUERY
  SELECT 'bo_mon_chua_xong'::text,
         t.discipline,
         format('Bộ môn %s đang ở trạng thái "%s", chưa báo hoàn thành.',
                lower(replace(t.discipline::text, '_', ' ')),
                replace(t.status::text, '_', ' ')),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.discipline <> 'phuong_an'
     AND t.status <> 'hoan_thanh';

  -- (c) Xung đột giữa các bộ môn còn ghi trong hồ sơ (TK-04) — ví dụ dầm chắn cửa sổ, ống
  -- kỹ thuật đâm vào cột. Còn nội dung ở đây thì chưa phát hành được.
  RETURN QUERY
  SELECT 'con_xung_dot'::text,
         t.discipline,
         format('Bộ môn %s còn ghi nhận xung đột chưa xử lý: %s',
                lower(replace(t.discipline::text, '_', ' ')),
                left(t.conflict_notes, 160)),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.conflict_notes IS NOT NULL
     AND btrim(t.conflict_notes) <> '';

  -- (d) Yêu cầu thay đổi đã chấp thuận nhưng chưa thực hiện: bàn giao lúc này là giao bộ hồ
  -- sơ mà chính mình đã biết là phải sửa (TK-06).
  RETURN QUERY
  SELECT 'thay_doi_chua_lam'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s đã chấp thuận nhưng chưa thực hiện.',
                COALESCE(c.code, c.title)),
         true
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status = 'chap_thuan';

  -- (e) Yêu cầu thay đổi còn đang đánh giá — cảnh báo, không chặn: có thể kết luận là không
  -- làm, và chặn cứng ở đây thì một yêu cầu bỏ quên treo cả dự án.
  RETURN QUERY
  SELECT 'thay_doi_dang_mo'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s chưa có kết luận.', COALESCE(c.code, c.title)),
         false
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status IN ('moi', 'dang_danh_gia');

  -- (f) Phương án kiến trúc chưa được khách duyệt (TK-03).
  RETURN QUERY
  SELECT 'phuong_an_chua_duyet'::text,
         'phuong_an'::design_discipline,
         'Phương án kiến trúc chưa có xác nhận duyệt của khách hàng.',
         true
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = 'phuong_an'
        AND v.customer_approved_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (g) Đầu bài chưa xác nhận — cảnh báo: hồ sơ vẫn có thể đúng, nhưng không có căn cứ đối
  -- chiếu khi khách nói "tôi đâu có yêu cầu thế này".
  RETURN QUERY
  SELECT 'dau_bai_chua_xac_nhan'::text,
         NULL::design_discipline,
         'Đầu bài đang hiệu lực chưa được xác nhận.',
         false
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_briefs b
      WHERE b.design_project_id = p_design_project_id
        AND b.is_current_version
        AND b.confirmed_at IS NOT NULL
        AND b.deleted_at IS NULL
   );
END;
$$;

COMMENT ON FUNCTION public.check_design_sync(uuid) IS
  'Kiểm tra tính đầy đủ và đồng bộ giữa các bộ môn — dùng chung cho tab Hồ sơ kỹ thuật (TK-04) và bước bàn giao (TK-08).';


-- ----------------------------------------------------------------------------
-- 10. Bàn giao hồ sơ thi công (TK-08)
--
-- Endpoint `POST /api/design-projects/:id/handover-construction` của Backend Schema 4.4.
--
-- ⏳ CHƯA tạo `construction_sites`: bảng đó thuộc Module TC (Giai đoạn 2). Cột
-- `construction_site_id` đã khai sẵn ở `design_projects`, migration của TC chỉ cần thêm
-- khoá ngoại và một dòng INSERT vào hàm này — không phải viết lại luồng bàn giao.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handover_design_to_construction(p_design_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  p          record;
  v_blocking integer;
  v_first    text;
  v_notified integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('TK') THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này.';
  END IF;

  IF p.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hồ sơ của dự án này đã bàn giao cho Ban công trường.';
  END IF;

  -- TK-08: "kiểm tra tính đầy đủ và đồng bộ giữa các bộ môn TRƯỚC KHI phát hành cho Ban
  -- công trường". Kiểm tra ở CSDL chứ không ở giao diện: gọi thẳng hàm này qua PostgREST
  -- vẫn phải đi qua đúng bộ điều kiện đó.
  SELECT count(*), min(s.message) INTO v_blocking, v_first
    FROM public.check_design_sync(p_design_project_id) s
   WHERE s.blocking;

  IF v_blocking > 0 THEN
    RAISE EXCEPTION 'Hồ sơ chưa đồng bộ, còn % hạng mục phải xử lý. Ví dụ: %', v_blocking, v_first;
  END IF;

  UPDATE public.design_projects
     SET handed_over_at = now(), stage = 'ban_giao',
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;

  -- Bàn giao là phải có người BIẾT mà nhận (NEN-03) — cùng nguyên tắc với DA-09.
  SELECT count(*) INTO v_notified
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_handover',
      format('Hồ sơ thi công của dự án thiết kế %s đã bàn giao.', p.code),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TC', 'DA_DT', 'KD') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_notified;
END;
$$;

COMMENT ON FUNCTION public.handover_design_to_construction(uuid) IS
  'Bàn giao hồ sơ thi công sau khi kiểm tra đồng bộ đa bộ môn — TK-08, Backend Schema 4.4.';


-- ----------------------------------------------------------------------------
-- 11. Chuyển bước dự án thiết kế
--
-- Đi qua hàm thay vì UPDATE thẳng vì hai bước có điều kiện bắt buộc: gửi khách duyệt phải
-- có phương án ĐÃ PHÁT HÀNH, và dừng thiết kế phải nêu nguyên nhân. Đặt hai quy tắc đó ở
-- trình duyệt thì gọi thẳng PostgREST là đi vòng qua được.
--
-- `ban_giao` KHÔNG đặt được ở đây: bước đó chỉ đến từ `handover_design_to_construction`,
-- nơi có kiểm tra đồng bộ. Cho phép đặt tay là mở đúng cánh cửa mà TK-08 khoá lại.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_design_stage(
  p_design_project_id uuid,
  p_stage design_stage,
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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_design_project_writable(p_design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này, hoặc hồ sơ đã bàn giao.';
  END IF;

  IF p_stage = 'ban_giao' THEN
    RAISE EXCEPTION 'Bàn giao thi công phải đi qua bước kiểm tra đồng bộ hồ sơ.';
  END IF;

  IF p_stage = 'dung_thiet_ke' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân dừng thiết kế.';
  END IF;

  IF p_stage = 'cho_khach_duyet' AND NOT EXISTS (
    SELECT 1 FROM public.design_versions v
     WHERE v.design_project_id = p_design_project_id
       AND v.discipline = 'phuong_an'
       AND v.published_at IS NOT NULL
       AND v.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Chưa phát hành phương án kiến trúc nào để gửi khách hàng xem.';
  END IF;

  UPDATE public.design_projects
     SET stage = p_stage,
         stopped_reason = CASE WHEN p_stage = 'dung_thiet_ke' THEN btrim(p_reason) ELSE NULL END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;
END;
$$;

COMMENT ON FUNCTION public.move_design_stage(uuid, design_stage, text) IS
  'Chuyển bước dự án thiết kế — chặn đặt tay bước bàn giao và bắt buộc nêu nguyên nhân khi dừng (TK-08).';
