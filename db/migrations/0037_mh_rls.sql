-- ============================================================================
-- Module MH — phân quyền và luồng nghiệp vụ mua hàng
--
-- Nguồn: PRD MH-01 → MH-09, Backend Schema 4.7, Webapp Flow 3.5.
--
-- Bốn thứ file này phải giữ được, xếp theo thiệt hại nếu mất:
--
--  1. KHÔNG MUA TRƯỚC, DUYỆT SAU (MH-02). Đơn đặt hàng chỉ sinh ra từ một đề nghị đã được
--     duyệt ĐÚNG HẠN MỨC. Mở INSERT thẳng vào `purchase_orders` là mở đường đặt hàng vài
--     trăm triệu rồi mới trình duyệt cho hợp lệ hoá.
--  2. CHỌN NHÀ CUNG CẤP PHẢI GIẢI TRÌNH ĐƯỢC (MH-04). "Không chỉ so sánh giá thấp nhất" —
--     nên chọn báo giá KHÔNG rẻ nhất là hợp lệ, nhưng bắt buộc nêu căn cứ. Đây là chỗ
--     PRD Mục 2.3 gọi là "con người quyết định, phần mềm ghi lại vì sao".
--  3. CHI PHÍ GẮN VÀO CÔNG TRÌNH NGAY KHI PHÁT SINH (KT-05, TC-05). Đơn hàng đã đặt cộng
--     ngay vào phần ĐÃ CAM KẾT của ngân sách công trình; hàng về đến đâu chuyển sang ĐÃ
--     PHÁT SINH đến đó. Đợi hoá đơn mới ghi thì cảnh báo vượt ngân sách luôn tới muộn.
--  4. NỘI DUNG THƯƠNG THẢO KHÔNG HIỂN THỊ ĐẠI TRÀ (NEN-07). Các báo giá KHÔNG được chọn là
--     nội dung thương thảo với nhà cung cấp; chỉ vai trò được xem giá vốn mới đọc được.
--     Báo giá ĐƯỢC CHỌN thì mọi người có quyền xem MH đều thấy — nó là một phần bộ chứng
--     từ chuyển sang Kế toán (MH-08).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bộ theo dõi chuẩn và các cột định danh bất biến (migration 0019, 0028)
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.suppliers');
SELECT public.attach_audit_touch('public.purchase_requests');
SELECT public.attach_audit_touch('public.purchase_request_items');
SELECT public.attach_audit_touch('public.quotations');
SELECT public.attach_audit_touch('public.quotation_items');
SELECT public.attach_audit_touch('public.purchase_orders');
SELECT public.attach_audit_touch('public.purchase_order_items');
SELECT public.attach_audit_touch('public.deliveries');
SELECT public.attach_audit_touch('public.delivery_items');

CREATE TRIGGER suppliers_freeze_identity
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code');

CREATE TRIGGER purchase_requests_freeze_identity
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'requested_by'
  );

CREATE TRIGGER purchase_request_items_freeze_identity
  BEFORE UPDATE ON public.purchase_request_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('purchase_request_id');

CREATE TRIGGER quotations_freeze_identity
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'purchase_request_id', 'supplier_id'
  );

CREATE TRIGGER quotation_items_freeze_identity
  BEFORE UPDATE ON public.quotation_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('quotation_id');

CREATE TRIGGER purchase_orders_freeze_identity
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'purchase_request_id', 'supplier_id'
  );

CREATE TRIGGER purchase_order_items_freeze_identity
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'purchase_order_id', 'unit_price'
  );

CREATE TRIGGER deliveries_freeze_identity
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'purchase_order_id'
  );

CREATE TRIGGER delivery_items_freeze_identity
  BEFORE UPDATE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'delivery_id', 'purchase_order_item_id'
  );

-- Cột nào chỉ đổi được qua hàm nghiệp vụ. `construction_site_id`/`bidding_project_id` dùng
-- guard này chứ không phải `freeze_record_identity` vì khoá ngoại của chúng là ON DELETE
-- SET NULL — freeze sẽ chặn cả chính CSDL khi nó dọn dây (đúng cái bẫy Module TC đã gặp).
CREATE TRIGGER purchase_requests_stage_guard
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'estimated_value', 'submitted_at', 'approved_at',
    'construction_site_id', 'bidding_project_id'
  );

CREATE TRIGGER quotations_stage_guard
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'selected_at', 'selection_reason'
  );

CREATE TRIGGER purchase_orders_stage_guard
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'total_value', 'committed_to_budget', 'quotation_id'
  );

CREATE TRIGGER purchase_order_items_stage_guard
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'quantity', 'delivered_quantity'
  );


-- ----------------------------------------------------------------------------
-- 1. Điều kiện dùng chung
--
-- Bốn bảng con (dòng đề nghị, báo giá, dòng báo giá, và về sau là đơn hàng) đều thừa hưởng
-- phạm vi từ đề nghị mua. Viết một lần ở đây để không chép rồi lệch nhau.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_purchase_request_readable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND public.rls_company_access(pr.company_id)
      AND public.auth_can_view_module('MH')
  );
$$;

COMMENT ON FUNCTION public.rls_purchase_request_readable(uuid) IS
  'Đề nghị mua này có nằm trong phạm vi xem của người dùng hiện tại không (Mẫu A + quyền module MH).';

/**
 * Ai sửa được nội dung một đề nghị mua.
 *
 * Hai nhóm, không phải một: Phòng Mua hàng có quyền sửa module MH; còn Ban công trường chỉ
 * có quyền `view` + `create` trên MH (xem `db/src/seed/data.ts`) vì TC-03 cho họ GỬI đề
 * nghị chứ không cho họ xử lý mua hàng. Nếu chỉ xét `auth_can_edit_module('MH')` thì người
 * vừa tạo đề nghị không sửa nổi bản nháp của chính mình.
 *
 * Cả hai nhóm chỉ sửa được khi hồ sơ còn ở bước Nháp hoặc vừa bị từ chối: sửa số lượng sau
 * khi đã duyệt là vô hiệu hoá hạn mức MH-02 mà không để lại dấu vết nào.
 */
CREATE OR REPLACE FUNCTION public.rls_purchase_request_draft_writable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND pr.stage IN ('nhap', 'tu_choi')
      AND public.rls_company_access(pr.company_id)
      AND (
        public.auth_can_edit_module('MH')
        OR (pr.requested_by = public.auth_user_id()
            AND public.auth_can_create_in('MH', pr.company_id))
      )
  );
$$;

COMMENT ON FUNCTION public.rls_purchase_request_draft_writable(uuid) IS
  'Sửa được nội dung đề nghị mua khi còn Nháp/Bị từ chối — Mua hàng, hoặc chính người đề nghị (TC-03).';

/** Bước nào của đề nghị mua thì còn nhận thêm báo giá (MH-04). */
CREATE OR REPLACE FUNCTION public.rls_quotation_writable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND pr.stage IN ('da_duyet', 'dang_mua')
      AND public.rls_company_access(pr.company_id)
      AND public.auth_can_edit_module('MH')
  );
$$;

/**
 * Hồ sơ nguồn của một đề nghị mua có cùng pháp nhân với đề nghị không.
 *
 * Phải là SECURITY DEFINER chứ không viết thẳng truy vấn con vào policy: policy được đánh giá
 * BẰNG QUYỀN CỦA NGƯỜI GỌI, mà Phòng Mua hàng không có quyền xem phân hệ Thi công ở mức đủ để
 * đọc mọi công trình. Viết thẳng thì truy vấn con trả về rỗng và policy chặn nhầm chính người
 * dùng hợp lệ — thay vì chặn đúng thứ cần chặn.
 */
CREATE OR REPLACE FUNCTION public.rls_purchase_source_matches_company(
  p_company_id uuid,
  p_site_id uuid,
  p_bidding_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    p_site_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.construction_sites s
       WHERE s.id = p_site_id AND s.company_id = p_company_id AND s.deleted_at IS NULL
    )
  ) AND (
    p_bidding_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.bidding_projects b
       WHERE b.id = p_bidding_id AND b.company_id = p_company_id AND b.deleted_at IS NULL
    )
  );
$$;

COMMENT ON FUNCTION public.rls_purchase_source_matches_company(uuid, uuid, uuid) IS
  'Đề nghị mua và hồ sơ nguồn của nó phải cùng pháp nhân — NEN-01.';


CREATE OR REPLACE FUNCTION public.rls_purchase_order_readable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = p_order_id
      AND po.deleted_at IS NULL
      AND public.rls_company_access(po.company_id)
      AND public.auth_can_view_module('MH')
  );
$$;


-- ----------------------------------------------------------------------------
-- 2. Chính sách truy cập
-- ----------------------------------------------------------------------------

ALTER TABLE public.suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.suppliers              FROM anon;
REVOKE ALL ON public.purchase_requests      FROM anon;
REVOKE ALL ON public.purchase_request_items FROM anon;
REVOKE ALL ON public.quotations             FROM anon;
REVOKE ALL ON public.quotation_items        FROM anon;
REVOKE ALL ON public.purchase_orders        FROM anon;
REVOKE ALL ON public.purchase_order_items   FROM anon;
REVOKE ALL ON public.deliveries             FROM anon;
REVOKE ALL ON public.delivery_items         FROM anon;

-- Không xoá cứng bảng nghiệp vụ nào — xoá mềm qua `deleted_at`, giữ lịch sử (NEN-03).
REVOKE DELETE ON public.suppliers         FROM authenticated;
REVOKE DELETE ON public.purchase_requests FROM authenticated;
REVOKE DELETE ON public.quotations        FROM authenticated;
REVOKE DELETE ON public.purchase_orders   FROM authenticated;
REVOKE DELETE ON public.deliveries        FROM authenticated;

-- Đơn hàng, dòng đơn hàng và phiếu giao nhận CHỈ sinh ra từ hàm nghiệp vụ: mỗi bảng trong
-- nhóm này đều ghi kèm một con số vào ngân sách công trình, và con số đó phải khớp với
-- chứng từ. Một câu INSERT thẳng từ trình duyệt sẽ tạo đơn hàng không cam kết gì vào ngân
-- sách, hoặc phiếu nhận hàng nhiều hơn số đã đặt.
REVOKE INSERT, UPDATE, DELETE ON public.purchase_order_items FROM authenticated;
REVOKE INSERT, DELETE ON public.purchase_orders FROM authenticated;
REVOKE INSERT ON public.deliveries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.delivery_items FROM authenticated;


-- Nhà cung cấp — bảng DÙNG CHUNG, cùng cách `customers` đã làm ở migration 0007.
CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.auth_can_view_module('MH'));

-- Lập danh mục nhà cung cấp là việc của Mua hàng (MH-03), không phải của mọi vai trò có
-- quyền tạo đề nghị mua: Ban công trường có quyền `create` trên MH chỉ để gửi đề nghị theo
-- TC-03. Mở thêm ở đây thì danh mục dùng chung sẽ nhanh chóng có ba dòng cho cùng một
-- nhà cung cấp — đúng thứ MH-03 sinh ra để tránh.
CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_edit_module('MH'));

CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.auth_can_edit_module('MH'))
  WITH CHECK (public.auth_can_edit_module('MH'));


-- Đề nghị mua — Mẫu A (Backend Schema 4.7).
CREATE POLICY purchase_requests_select ON public.purchase_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('MH')
  );

CREATE POLICY purchase_requests_insert ON public.purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in('MH', company_id)
    -- Hồ sơ mới luôn bắt đầu ở bước Nháp: tạo thẳng ở bước "đã duyệt" là bỏ qua MH-02.
    AND stage = 'nhap'
    /*
     * Hồ sơ nguồn phải CÙNG pháp nhân với đề nghị — NEN-01.
     *
     * Khoá ngoại không kiểm được điều này, và RLS của `construction_sites` chỉ giấu công
     * trình khỏi danh sách chứ không chặn việc gán một `uuid` đã biết. Thiếu điều kiện dưới
     * đây thì một người của NVC tạo được đề nghị NVC trỏ vào công trình NVO, và tiền đơn
     * hàng sẽ cộng vào ngân sách của pháp nhân khác — sai P&L của cả hai công ty.
     */
    AND public.rls_purchase_source_matches_company(
      company_id, construction_site_id, bidding_project_id
    )
  );

CREATE POLICY purchase_requests_update ON public.purchase_requests
  FOR UPDATE TO authenticated
  USING (public.rls_purchase_request_draft_writable(id))
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY purchase_request_items_select ON public.purchase_request_items
  FOR SELECT TO authenticated
  USING (public.rls_purchase_request_readable(purchase_request_id));

CREATE POLICY purchase_request_items_insert ON public.purchase_request_items
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_purchase_request_draft_writable(purchase_request_id));

CREATE POLICY purchase_request_items_update ON public.purchase_request_items
  FOR UPDATE TO authenticated
  USING (public.rls_purchase_request_draft_writable(purchase_request_id))
  WITH CHECK (public.rls_purchase_request_draft_writable(purchase_request_id));

-- Dòng đề nghị là bảng chi tiết của bản nháp, không phải hồ sơ độc lập: xoá một dòng khi
-- đang soạn là thao tác bình thường, nên ở đây cho xoá cứng (khác các bảng hồ sơ ở trên).
CREATE POLICY purchase_request_items_delete ON public.purchase_request_items
  FOR DELETE TO authenticated
  USING (public.rls_purchase_request_draft_writable(purchase_request_id));


/*
 * Báo giá — các báo giá KHÔNG được chọn là nội dung thương thảo (NEN-07).
 *
 * Ai xem được giá vốn thì thấy toàn bộ bảng so sánh. Ai không, chỉ thấy báo giá ĐƯỢC CHỌN —
 * vì nó là một phần bộ chứng từ chuyển sang Kế toán (MH-08), Kế toán phải đối chiếu được
 * đơn hàng với báo giá đã chọn mà không cần mở quyền xem giá vốn cho cả phòng.
 */
CREATE POLICY quotations_select ON public.quotations
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_purchase_request_readable(purchase_request_id)
    AND (status = 'duoc_chon' OR public.rls_sees_sensitive('cost'))
  );

CREATE POLICY quotations_insert ON public.quotations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_quotation_writable(purchase_request_id)
    AND public.rls_sees_sensitive('cost')
    AND company_id = (
      SELECT pr.company_id FROM public.purchase_requests pr WHERE pr.id = purchase_request_id
    )
    -- Báo giá mới không tự khai là đã được chọn: việc chọn đi qua `select_quotation`,
    -- nơi kiểm căn cứ chọn theo MH-04.
    AND status IN ('cho_bao_gia', 'da_nhan')
  );

CREATE POLICY quotations_update ON public.quotations
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_quotation_writable(purchase_request_id)
    AND public.rls_sees_sensitive('cost')
  )
  WITH CHECK (public.rls_sees_sensitive('cost'));

-- Dòng báo giá đi theo báo giá mẹ: điều kiện chạy qua policy của `quotations` ở trên nên
-- không phải chép lại luật xem giá vốn ở hai nơi.
CREATE POLICY quotation_items_select ON public.quotation_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id));

CREATE POLICY quotation_items_write ON public.quotation_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_id
        AND q.deleted_at IS NULL
        AND public.rls_quotation_writable(q.purchase_request_id)
        AND public.rls_sees_sensitive('cost')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_id
        AND q.deleted_at IS NULL
        AND public.rls_quotation_writable(q.purchase_request_id)
        AND public.rls_sees_sensitive('cost')
    )
  );


-- Đơn đặt hàng, dòng đơn hàng, giao nhận — Mẫu A, chỉ đọc từ trình duyệt.
CREATE POLICY purchase_orders_select ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('MH')
  );

-- Sửa được: ngày giao cam kết, số hợp đồng mua bán, ghi chú. Các cột còn lại đã bị hai
-- trigger ở mục 0 chặn, nên policy này không cần liệt kê lại từng cột.
CREATE POLICY purchase_orders_update ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('MH')
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY purchase_order_items_select ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (public.rls_purchase_order_readable(purchase_order_id));

CREATE POLICY deliveries_select ON public.deliveries
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_purchase_order_readable(purchase_order_id));

CREATE POLICY deliveries_update ON public.deliveries
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_purchase_order_readable(purchase_order_id)
    AND public.auth_can_edit_module('MH')
  )
  WITH CHECK (public.auth_can_edit_module('MH'));

CREATE POLICY delivery_items_select ON public.delivery_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id = delivery_id));


-- ----------------------------------------------------------------------------
-- 3. Người đề nghị và mã hồ sơ
--
-- `requested_by` do CSDL đóng dấu từ phiên đăng nhập, không nhận từ trình duyệt: cột này
-- vừa là đường truy vết của MH-01 ("người đề nghị"), vừa là điều kiện cho phép người tạo
-- sửa bản nháp của chính mình. Nhận từ trình duyệt thì ai cũng ghi được một đề nghị mang
-- tên đồng nghiệp, rồi trigger đóng băng khiến nó vĩnh viễn không sửa lại được.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purchase_requests_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
BEGIN
  NEW.requested_by := COALESCE(public.auth_user_id(), NEW.requested_by);

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = NEW.company_id;
    NEW.code := public.next_record_code(v_company_code, 'DNM');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER purchase_requests_before_insert
  BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.purchase_requests_before_insert();

COMMENT ON FUNCTION public.purchase_requests_before_insert() IS
  'Đóng dấu người đề nghị từ phiên đăng nhập và cấp mã đề nghị mua (MH-01).';


-- ----------------------------------------------------------------------------
-- 4. Gửi phê duyệt đề nghị mua — MH-02
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_purchase_request_approval(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  pr         record;
  v_items    integer;
  v_value    bigint;
  v_approval uuid;
  v_budget   record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_purchase_request_draft_writable(p_request_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị mua này.';
  END IF;

  SELECT count(*), COALESCE(SUM(pri.quantity * pri.estimated_unit_price), 0)::bigint
    INTO v_items, v_value
    FROM public.purchase_request_items pri
   WHERE pri.purchase_request_id = p_request_id;

  IF v_items = 0 THEN
    RAISE EXCEPTION 'Chưa có mặt hàng nào trong đề nghị. Thêm ít nhất một dòng trước khi gửi phê duyệt.';
  END IF;

  IF pr.needed_date IS NULL THEN
    RAISE EXCEPTION 'Chưa có thời điểm cần hàng. Nhập ngày cần hàng trước khi gửi phê duyệt.';
  END IF;

  IF v_value <= 0 THEN
    RAISE EXCEPTION 'Giá trị ước tính bằng 0. Nhập đơn giá ước tính để đối chiếu hạn mức phê duyệt.';
  END IF;

  /*
   * KT-05: "gắn chi phí vào mã công trình ngay từ khi phát sinh, không hạch toán lại thủ
   * công". Chỗ duy nhất còn kịp làm việc đó là ở đây — sau khi duyệt, đơn hàng sẽ cộng
   * thẳng vào phần đã cam kết của ngân sách, mà không có mã chi phí thì không biết cộng
   * vào dòng nào. Đề nghị mua cho văn phòng (không gắn công trình) thì không cần.
   */
  IF pr.construction_site_id IS NOT NULL THEN
    IF pr.cost_code IS NULL OR btrim(pr.cost_code) = '' THEN
      RAISE EXCEPTION 'Chưa chọn mã chi phí trong ngân sách công trình. Chọn mã chi phí để theo dõi được đúng khoản này.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.construction_sites s
       WHERE s.id = pr.construction_site_id AND s.company_id = pr.company_id
    ) THEN
      RAISE EXCEPTION 'Công trình được chọn không thuộc pháp nhân của đề nghị mua này.';
    END IF;

    SELECT * INTO v_budget FROM public.project_budgets pb
     WHERE pb.construction_site_id = pr.construction_site_id
       AND pb.cost_code = pr.cost_code
       AND pb.company_id = pr.company_id
       AND pb.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mã chi phí % không có trong ngân sách của công trình này. Chọn lại mã chi phí.', pr.cost_code;
    END IF;
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    pr.company_id, 'purchase_request', 'purchase_requests', pr.id, pr.code,
    format('Đề nghị mua %s — %s', pr.code, pr.title),
    v_value, pr.notes, 'pending_approval', v_user,
    -- Hạn duyệt là ngày cần hàng: duyệt sau ngày đó thì hàng chắc chắn về muộn.
    pr.needed_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.purchase_requests
     SET stage = 'cho_duyet',
         estimated_value = v_value,
         submitted_at = now(),
         closed_reason = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_purchase_request_approval(uuid) IS
  'Gửi đề nghị mua đi phê duyệt theo hạn mức, sau khi chốt giá trị và mã chi phí công trình (MH-02, KT-05).';


CREATE OR REPLACE FUNCTION public.cancel_purchase_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  pr     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(pr.company_id)
     OR NOT (public.auth_can_edit_module('MH') OR pr.requested_by = v_user) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị mua này.';
  END IF;

  IF pr.stage IN ('hoan_thanh', 'huy') THEN
    RAISE EXCEPTION 'Đề nghị mua này đã kết thúc.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.purchase_request_id = p_request_id
       AND po.deleted_at IS NULL
       AND po.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Đề nghị này đã có đơn đặt hàng. Hủy đơn đặt hàng trước, rồi hủy đề nghị.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đề nghị mua.';
  END IF;

  /*
   * Đề nghị đang chờ duyệt mà bị hủy thì đóng luôn hồ sơ trong Hộp thư Phê duyệt, không để
   * người duyệt mở ra một việc đã không còn tồn tại.
   *
   * Ghi kèm MỘT DÒNG LỊCH SỬ: đóng hồ sơ bằng một câu UPDATE trần sẽ để lại một đề nghị mang
   * kết quả "bị từ chối" mà không ai đứng tên và không nói vì sao — đúng thứ bảng lịch sử
   * riêng của Backend Schema 2.3 sinh ra để tránh.
   */
  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT a.id, a.current_step, 'rejected',
         format('Người đề nghị hủy đề nghị mua: %s', btrim(p_reason)), v_user
    FROM public.approvals a
   WHERE a.entity_type = 'purchase_requests' AND a.entity_id = p_request_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  UPDATE public.approvals
     SET status = 'completed', final_decision = 'rejected',
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE entity_type = 'purchase_requests' AND entity_id = p_request_id
     AND status = 'pending_approval' AND deleted_at IS NULL;

  UPDATE public.purchase_requests
     SET stage = 'huy',
         closed_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_purchase_request(uuid, text) IS
  'Hủy một đề nghị mua kèm lý do, và đóng hồ sơ tương ứng trong Hộp thư Phê duyệt.';


-- ----------------------------------------------------------------------------
-- 5. Quyết định phê duyệt — thêm nhánh đề nghị mua
--
-- Định nghĩa lại NGUYÊN hàm `decide_approval` (lần gần nhất ở migration 0027) và bổ sung
-- nhánh `purchase_requests`. Hộp thư Phê duyệt là MỘT màn hình duy nhất cho mọi module
-- (Webapp Flow 4.6), nên mọi loại hồ sơ đều đi qua đúng hàm này.
-- ----------------------------------------------------------------------------

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
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi một quyết định phê duyệt và cập nhật hồ sơ nguồn — báo giá, dự toán, hợp đồng, phát sinh, đề nghị mua.';


-- ----------------------------------------------------------------------------
-- 6. Bảng so sánh báo giá chuẩn hóa — MH-04
--
-- Backend Schema 4.7 đặc tả việc này là `POST /api/purchase-requests/:id/compare-quotations`
-- trên Cloudflare Workers. Ở đây làm bằng hàm CSDL vì đúng quy tắc chọn lớp của CLAUDE.md
-- Mục 3.1: phép tính chỉ đọc dữ liệu sẵn có, không gọi dịch vụ bên ngoài, nhưng cần chạy
-- SAU khi kiểm quyền xem giá vốn — nên nó thuộc lớp nghiệp vụ chứ không phải CRUD thường.
-- Cùng cách `construction_budget_status` của Module TC đã làm.
--
-- Công thức phải KHỚP TỪNG ĐỒNG với `standardizeQuotationCost` ở `@nvg/shared/mh`: màn hình
-- tính lại tại chỗ khi người dùng gõ, còn hàm này là con số đem lưu vào đơn hàng. Hai công
-- thức lệch nhau thì bảng so sánh và đơn hàng nói hai giá khác nhau. Có kiểm thử đối chiếu.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quotation_goods_subtotal(p_quotation_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(qi.quantity * qi.unit_price), 0)::numeric
  FROM public.quotation_items qi
  WHERE qi.quotation_id = p_quotation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.quotation_goods_subtotal(uuid) FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.quotation_landed_total(p_quotation_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q         record;
  v_goods   numeric;
  v_wastage numeric;
  v_taxable numeric;
  v_tax     numeric;
BEGIN
  SELECT * INTO q FROM public.quotations WHERE id = p_quotation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_goods   := public.quotation_goods_subtotal(p_quotation_id);
  -- Hao hụt cộng vào tiền hàng TRƯỚC khi tính thuế: phần mua bù cũng chịu thuế như hàng chính.
  v_wastage := floor(v_goods * q.wastage_rate_bp / 10000);
  v_taxable := v_goods + v_wastage;
  v_tax     := floor(v_taxable * q.tax_rate_bp / 10000);

  RETURN (v_taxable + v_tax + q.shipping_fee)::bigint;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quotation_landed_total(uuid) FROM authenticated, anon, public;

COMMENT ON FUNCTION public.quotation_landed_total(uuid) IS
  'Tổng chi phí một báo giá đã quy về cùng mặt bằng: tiền hàng + hao hụt + thuế + vận chuyển (MH-04).';


CREATE OR REPLACE FUNCTION public.compare_quotations(p_request_id uuid)
RETURNS TABLE (
  quotation_id      uuid,
  supplier_id       uuid,
  supplier_name     text,
  supplier_class    supplier_class,
  status            quotation_status,
  quoted_date       date,
  goods_subtotal    bigint,
  wastage_amount    bigint,
  tax_amount        bigint,
  shipping_fee      bigint,
  landed_total      bigint,
  cost_rank         integer,
  cost_gap_vs_lowest bigint,
  delivery_days     integer,
  payment_term_days integer,
  warranty_months   integer
)
LANGUAGE plpgsql
-- KHÔNG khai STABLE: hàm này ghi một dòng vào `sensitive_access_logs` (NEN-07), mà PostgREST
-- chạy hàm STABLE trong giao dịch CHỈ ĐỌC — khai STABLE thì mọi lần gọi đều lỗi 25006.
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
BEGIN
  SELECT * INTO pr FROM public.purchase_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_purchase_request_readable(p_request_id) THEN
    RAISE EXCEPTION 'Không xem được đề nghị mua này.';
  END IF;

  -- Bảng so sánh gồm cả các báo giá không được chọn — nội dung thương thảo với nhà cung cấp.
  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Bảng so sánh báo giá chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'purchase_requests', p_request_id, 'view', pr.company_id);

  RETURN QUERY
  WITH costed AS (
    SELECT
      q.id, q.supplier_id, s.name AS supplier_name, s.supplier_class, q.status, q.quoted_date,
      q.delivery_days, q.payment_term_days, q.warranty_months,
      g.goods,
      floor(g.goods * q.wastage_rate_bp / 10000) AS wastage,
      q.shipping_fee,
      q.tax_rate_bp
    FROM public.quotations q
    JOIN public.suppliers s ON s.id = q.supplier_id
    CROSS JOIN LATERAL (
      SELECT public.quotation_goods_subtotal(q.id) AS goods
    ) g
    WHERE q.purchase_request_id = p_request_id
      AND q.deleted_at IS NULL
      AND q.status <> 'cho_bao_gia'
  ),
  totalled AS (
    SELECT c.*,
           floor((c.goods + c.wastage) * c.tax_rate_bp / 10000) AS tax,
           ((c.goods + c.wastage)
            + floor((c.goods + c.wastage) * c.tax_rate_bp / 10000)
            + c.shipping_fee)::bigint AS landed
    FROM costed c
  )
  SELECT
    t.id, t.supplier_id, t.supplier_name, t.supplier_class, t.status, t.quoted_date,
    t.goods::bigint, t.wastage::bigint, t.tax::bigint, t.shipping_fee, t.landed,
    rank() OVER (ORDER BY t.landed)::integer,
    (t.landed - min(t.landed) OVER ())::bigint,
    t.delivery_days, t.payment_term_days, t.warranty_months
  FROM totalled t
  ORDER BY t.landed, t.supplier_name;
END;
$$;

COMMENT ON FUNCTION public.compare_quotations(uuid) IS
  'Bảng so sánh báo giá đã chuẩn hóa cho một đề nghị mua — MH-04. Xếp hạng theo tổng chi phí, KHÔNG đề xuất chọn ai.';


-- ----------------------------------------------------------------------------
-- 7. Chọn nhà cung cấp — MH-04
--
-- PRD MH-04: "không chỉ so sánh giá thấp nhất mà so sánh TỔNG CHI PHÍ VÀ RỦI RO". Nghĩa là
-- chọn báo giá đắt hơn hoàn toàn hợp lệ — giao nhanh hơn, bảo hành dài hơn, chứng từ đầy đủ
-- hơn đều là lý do chính đáng. Điều KHÔNG hợp lệ là chọn đắt hơn mà không nói vì sao.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.select_quotation(p_quotation_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  q        record;
  pr       record;
  v_this   bigint;
  v_lowest bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotations WHERE id = p_quotation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests WHERE id = q.purchase_request_id;

  IF NOT public.rls_quotation_writable(q.purchase_request_id)
     OR NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Không thao tác được trên báo giá của đề nghị mua này.';
  END IF;

  IF q.status = 'cho_bao_gia' THEN
    RAISE EXCEPTION 'Nhà cung cấp này chưa gửi báo giá. Nhập nội dung báo giá trước khi chọn.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.purchase_request_id = q.purchase_request_id
       AND po.deleted_at IS NULL AND po.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Đề nghị này đã có đơn đặt hàng. Hủy đơn đặt hàng trước nếu cần chọn lại nhà cung cấp.';
  END IF;

  IF (SELECT s.supplier_class FROM public.suppliers s WHERE s.id = q.supplier_id) = 'ngung_giao_dich' THEN
    RAISE EXCEPTION 'Nhà cung cấp này đã ngừng giao dịch. Chọn nhà cung cấp khác, hoặc mở lại giao dịch ở danh mục nhà cung cấp.';
  END IF;

  IF (SELECT count(*) FROM public.quotation_items qi WHERE qi.quotation_id = p_quotation_id) = 0 THEN
    RAISE EXCEPTION 'Báo giá chưa có dòng hàng nào. Nhập đơn giá từng mặt hàng trước khi chọn.';
  END IF;

  v_this := public.quotation_landed_total(p_quotation_id);

  SELECT min(public.quotation_landed_total(q2.id)) INTO v_lowest
    FROM public.quotations q2
   WHERE q2.purchase_request_id = q.purchase_request_id
     AND q2.deleted_at IS NULL
     AND q2.status <> 'cho_bao_gia'
     AND EXISTS (SELECT 1 FROM public.quotation_items qi WHERE qi.quotation_id = q2.id);

  IF v_this > v_lowest AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Báo giá này cao hơn báo giá thấp nhất % đồng. Nêu căn cứ chọn (tiến độ giao, bảo hành, điều kiện thanh toán) trước khi chọn.',
      to_char(v_this - v_lowest, 'FM999,999,999,999');
  END IF;

  UPDATE public.quotations
     SET status = 'khong_chon', selected_at = NULL,
         updated_at = now(), updated_by = v_user
   WHERE purchase_request_id = q.purchase_request_id
     AND id <> p_quotation_id
     AND deleted_at IS NULL
     AND status <> 'cho_bao_gia';

  UPDATE public.quotations
     SET status = 'duoc_chon',
         selection_reason = NULLIF(btrim(p_reason), ''),
         selected_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_quotation_id;
END;
$$;

COMMENT ON FUNCTION public.select_quotation(uuid, text) IS
  'Chọn báo giá của một nhà cung cấp; bắt buộc nêu căn cứ nếu không phải báo giá thấp nhất (MH-04).';


-- ----------------------------------------------------------------------------
-- 8. Lập đơn đặt hàng — MH-06, và ghi cam kết vào ngân sách công trình (TC-05, KT-05)
-- ----------------------------------------------------------------------------

/**
 * Dòng ngân sách mà một đề nghị mua tiêu vào. Rỗng khi đề nghị không gắn công trình
 * (mua cho văn phòng) — khi đó không có gì để cộng, và đó là trường hợp hợp lệ.
 */
CREATE OR REPLACE FUNCTION public.purchase_request_budget_line(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pb.id
  FROM public.purchase_requests pr
  JOIN public.project_budgets pb
    ON pb.construction_site_id = pr.construction_site_id
   AND pb.cost_code = pr.cost_code
   -- Lưới an toàn thứ hai cho NEN-01: kể cả khi một dòng lọt qua policy (dữ liệu cũ, hoặc
   -- lệnh chạy từ Workers), tiền vẫn không cộng sang ngân sách của pháp nhân khác.
   AND pb.company_id = pr.company_id
   AND pb.deleted_at IS NULL
  WHERE pr.id = p_request_id
    AND pr.construction_site_id IS NOT NULL
    AND pr.cost_code IS NOT NULL
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_request_budget_line(uuid) FROM authenticated, anon, public;


CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_quotation_id uuid,
  p_promised_date date DEFAULT NULL,
  p_contract_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  q              record;
  pr             record;
  v_company_code text;
  v_total        bigint;
  v_order        uuid;
  v_budget       uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotations WHERE id = p_quotation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests
   WHERE id = q.purchase_request_id AND deleted_at IS NULL;

  IF NOT public.rls_company_access(pr.company_id) OR NOT public.auth_can_edit_module('MH') THEN
    RAISE EXCEPTION 'Không lập được đơn đặt hàng cho đề nghị mua này.';
  END IF;

  -- Đây là chốt chặn quan trọng nhất của module: không có nó thì đặt hàng trước, trình
  -- duyệt sau, và hạn mức MH-02 chỉ còn là một màn hình cho đẹp.
  IF pr.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ lập đơn đặt hàng sau khi đề nghị mua được phê duyệt.';
  END IF;

  IF q.status <> 'duoc_chon' THEN
    RAISE EXCEPTION 'Chọn nhà cung cấp trong bảng so sánh báo giá trước khi lập đơn đặt hàng.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.purchase_request_id = pr.id AND po.deleted_at IS NULL AND po.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Đề nghị này đã có đơn đặt hàng. Mở đơn đó để theo dõi giao hàng.';
  END IF;

  v_total := public.quotation_landed_total(p_quotation_id);
  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = pr.company_id;

  INSERT INTO public.purchase_orders (
    company_id, code, purchase_request_id, supplier_id, quotation_id,
    stage, order_date, promised_date, contract_number, total_value, committed_to_budget,
    created_by, updated_by
  )
  VALUES (
    pr.company_id, public.next_record_code(v_company_code, 'DH'), pr.id, q.supplier_id, q.id,
    'da_dat', current_date,
    COALESCE(p_promised_date, (current_date + COALESCE(q.delivery_days, 0))),
    NULLIF(btrim(p_contract_number), ''), v_total, 0,
    v_user, v_user
  )
  RETURNING id INTO v_order;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, position, item_code, name, specification, unit,
    quantity, unit_price, created_by, updated_by
  )
  SELECT v_order, row_number() OVER (ORDER BY qi.created_at, qi.id),
         qi.item_code, qi.name, qi.specification, qi.unit,
         qi.quantity, qi.unit_price, v_user, v_user
  FROM public.quotation_items qi
  WHERE qi.quotation_id = q.id;

  /*
   * TC-05 cần cảnh báo vượt ngân sách SỚM, tức là ngay khi tiền được hứa chi chứ không phải
   * khi hoá đơn về. Cộng vào phần "đã cam kết"; hàng về đến đâu sẽ chuyển sang "đã phát
   * sinh" đến đó trong `record_delivery`. `committed_to_budget` giữ phần còn treo lại, để
   * hủy đơn giữa chừng hoàn đúng số chưa dùng.
   */
  v_budget := public.purchase_request_budget_line(pr.id);
  IF v_budget IS NOT NULL THEN
    UPDATE public.project_budgets
       SET committed_amount = committed_amount + v_total,
           updated_at = now(), updated_by = v_user
     WHERE id = v_budget;

    UPDATE public.purchase_orders SET committed_to_budget = v_total WHERE id = v_order;
  END IF;

  UPDATE public.purchase_requests
     SET stage = 'dang_mua', updated_at = now(), updated_by = v_user
   WHERE id = pr.id;

  -- Người đề nghị (thường ở công trường) cần biết hàng đã đặt và hẹn ngày nào.
  PERFORM public.create_notification(
    pr.requested_by, pr.company_id, 'purchase_order_created',
    format('Đề nghị mua %s đã được đặt hàng, hẹn giao ngày %s.',
           COALESCE(pr.code, ''),
           to_char(COALESCE(p_promised_date, current_date + COALESCE(q.delivery_days, 0)), 'DD/MM/YYYY')),
    'purchase_orders', v_order,
    format('/mh/don-hang/%s', v_order)
  );

  RETURN v_order;
END;
$$;

COMMENT ON FUNCTION public.create_purchase_order(uuid, date, text) IS
  'Lập đơn đặt hàng từ báo giá đã chọn của một đề nghị đã duyệt, và ghi cam kết vào ngân sách công trình (MH-06, TC-05).';


CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  po       record;
  v_budget uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO po FROM public.purchase_orders
   WHERE id = p_order_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(po.company_id)
     OR NOT public.auth_can_edit_module('MH') THEN
    RAISE EXCEPTION 'Không thao tác được trên đơn đặt hàng này.';
  END IF;

  IF po.stage = 'huy' THEN
    RAISE EXCEPTION 'Đơn đặt hàng này đã hủy.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đơn đặt hàng.';
  END IF;

  -- Hoàn lại đúng phần còn treo ở "đã cam kết". Phần hàng đã nhận vẫn nằm ở "đã phát sinh"
  -- và KHÔNG được rút ra: hàng đã về kho rồi, tiền đó đã tiêu thật.
  v_budget := public.purchase_request_budget_line(po.purchase_request_id);
  IF v_budget IS NOT NULL AND po.committed_to_budget > 0 THEN
    UPDATE public.project_budgets
       SET committed_amount = greatest(committed_amount - po.committed_to_budget, 0),
           updated_at = now(), updated_by = v_user
     WHERE id = v_budget;
  END IF;

  UPDATE public.purchase_orders
     SET stage = 'huy', committed_to_budget = 0, closed_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_order_id;

  -- Đề nghị mua quay lại bước đã duyệt để chọn nhà cung cấp khác, không phải làm lại từ đầu.
  UPDATE public.purchase_requests
     SET stage = 'da_duyet', updated_at = now(), updated_by = v_user
   WHERE id = po.purchase_request_id AND stage = 'dang_mua';
END;
$$;

COMMENT ON FUNCTION public.cancel_purchase_order(uuid, text) IS
  'Hủy đơn đặt hàng kèm lý do và hoàn phần cam kết chưa dùng về ngân sách công trình.';


-- ----------------------------------------------------------------------------
-- 9. Ghi nhận giao nhận — MH-07, và chuyển bộ chứng từ sang Kế toán — MH-08
--
-- Backend Schema 4.7 đặc tả `POST /api/deliveries` "ghi nhận giao nhận, tự cập nhật tồn kho
-- liên module". Phần TỒN KHO chưa làm được ở bước này vì `inventory_items` thuộc Module KHO
-- (Phase 3C) — chỗ nối sẵn là thông báo cho Kho ở cuối hàm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_delivery(
  p_purchase_order_id uuid,
  p_delivered_date date,
  p_items jsonb,
  p_delivered_by_name text DEFAULT NULL,
  p_delivery_note_number text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_has_quality_certificate boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  po             record;
  pr             record;
  v_company_code text;
  v_delivery     uuid;
  v_line         jsonb;
  v_item         record;
  v_ok           numeric;
  v_issue        numeric;
  v_goods_total  numeric;
  v_delivered_v  numeric;
  v_share        bigint;
  v_complete     boolean;
  v_budget       uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- FOR UPDATE: hàm này đọc `committed_to_budget` rồi tính phần chuyển sang chi phí thực tế
  -- dựa trên chính con số vừa đọc. Hai người ghi hai đợt giao của cùng một đơn trong cùng
  -- lúc mà không khoá thì cả hai cùng đọc số cũ, và ngân sách bị cộng vào "đã phát sinh"
  -- nhiều hơn giá trị đơn hàng. Cùng cách `decide_approval` khoá dòng phê duyệt.
  SELECT * INTO po FROM public.purchase_orders
   WHERE id = p_purchase_order_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(po.company_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đơn đặt hàng này.';
  END IF;

  -- SUY LUẬN: hàng về thì Kho là bên kiểm đếm thực tế, còn Mua hàng là bên đối chiếu đơn
  -- hàng (MH-07 nói "chữ ký xác nhận của người giao và người nhận", KHO-03 nói Kho lập
  -- phiếu nhập). Vai trò Kho chỉ có quyền XEM module MH nên phải mở riêng ở đây.
  IF NOT (public.auth_can_edit_module('MH') OR public.auth_has_role('KHO')) THEN
    RAISE EXCEPTION 'Ghi nhận giao nhận do Mua hàng hoặc Kho thực hiện.';
  END IF;

  IF po.stage NOT IN ('da_dat', 'dang_giao') THEN
    RAISE EXCEPTION 'Đơn đặt hàng này không còn nhận hàng: %.', po.stage;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Chưa có mặt hàng nào được kiểm đếm. Nhập số lượng thực nhận trước khi lưu.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = po.company_id;

  INSERT INTO public.deliveries (
    company_id, code, purchase_order_id, delivered_date, received_by, delivered_by_name,
    delivery_note_number, invoice_number, has_quality_certificate, notes, created_by, updated_by
  )
  VALUES (
    po.company_id, public.next_record_code(v_company_code, 'GN'), po.id,
    COALESCE(p_delivered_date, current_date), v_user, NULLIF(btrim(p_delivered_by_name), ''),
    NULLIF(btrim(p_delivery_note_number), ''), NULLIF(btrim(p_invoice_number), ''),
    COALESCE(p_has_quality_certificate, false), NULLIF(btrim(p_notes), ''), v_user, v_user
  )
  RETURNING id INTO v_delivery;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id = (v_line ->> 'purchase_order_item_id')::uuid
       AND poi.purchase_order_id = p_purchase_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Có dòng kiểm đếm không thuộc đơn đặt hàng này.';
    END IF;

    v_ok    := COALESCE((v_line ->> 'quantity_ok')::numeric, 0);
    v_issue := COALESCE((v_line ->> 'quantity_issue')::numeric, 0);

    IF v_ok < 0 OR v_issue < 0 THEN
      RAISE EXCEPTION 'Số lượng nhận không được là số âm.';
    END IF;

    -- Nhận nhiều hơn số đã đặt nghĩa là hoặc đếm nhầm, hoặc nhà cung cấp giao dư mà chưa ai
    -- đồng ý mua thêm. Cả hai đều phải dừng lại xử lý, không lặng lẽ ghi vào chi phí.
    IF v_item.delivered_quantity + v_ok > v_item.quantity THEN
      RAISE EXCEPTION 'Mặt hàng "%" nhận vượt số đã đặt: đã nhận %, đặt %, lần này %.',
        v_item.name, v_item.delivered_quantity, v_item.quantity, v_ok;
    END IF;

    IF v_ok = 0 AND v_issue = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.delivery_items (
      delivery_id, purchase_order_item_id, quantity_ok, quantity_issue,
      issue_type, issue_note, created_by, updated_by
    )
    VALUES (
      v_delivery, v_item.id, v_ok, v_issue,
      NULLIF(v_line ->> 'issue_type', '')::delivery_issue_type,
      NULLIF(btrim(v_line ->> 'issue_note'), ''), v_user, v_user
    );

    UPDATE public.purchase_order_items
       SET delivered_quantity = delivered_quantity + v_ok,
           updated_at = now(), updated_by = v_user
     WHERE id = v_item.id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.delivery_items di WHERE di.delivery_id = v_delivery) THEN
    RAISE EXCEPTION 'Chưa có mặt hàng nào được kiểm đếm. Nhập số lượng thực nhận trước khi lưu.';
  END IF;

  SELECT bool_and(poi.delivered_quantity >= poi.quantity) INTO v_complete
    FROM public.purchase_order_items poi
   WHERE poi.purchase_order_id = p_purchase_order_id;

  /*
   * Chuyển tiền từ "đã cam kết" sang "đã phát sinh" theo đúng tỷ lệ hàng đã nhận.
   *
   * Tỷ lệ tính trên TIỀN HÀNG chứ không trên số lượng: một đơn có cả thép và bulông thì
   * nhận hết bulông mà chưa có thép không phải là "đã tiêu gần hết ngân sách".
   * Thuế và vận chuyển đi kèm theo cùng tỷ lệ — chúng thuộc về lô hàng, không tách được.
   */
  SELECT COALESCE(SUM(poi.quantity * poi.unit_price), 0)::numeric INTO v_goods_total
    FROM public.purchase_order_items poi WHERE poi.purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(SUM(di.quantity_ok * poi.unit_price), 0)::numeric INTO v_delivered_v
    FROM public.delivery_items di
    JOIN public.purchase_order_items poi ON poi.id = di.purchase_order_item_id
   WHERE di.delivery_id = v_delivery;

  IF v_goods_total > 0 THEN
    v_share := floor(po.total_value * v_delivered_v / v_goods_total)::bigint;
  ELSE
    v_share := 0;
  END IF;

  -- Đợt cuối quét nốt phần lẻ còn treo, để tổng đã phát sinh khớp đúng giá trị đơn hàng.
  IF v_complete THEN
    v_share := po.committed_to_budget;
  ELSE
    v_share := least(v_share, po.committed_to_budget);
  END IF;

  v_budget := public.purchase_request_budget_line(po.purchase_request_id);
  IF v_budget IS NOT NULL AND v_share > 0 THEN
    UPDATE public.project_budgets
       SET committed_amount = greatest(committed_amount - v_share, 0),
           actual_amount = actual_amount + v_share,
           updated_at = now(), updated_by = v_user
     WHERE id = v_budget;
  END IF;

  UPDATE public.purchase_orders
     SET stage = (CASE WHEN v_complete THEN 'da_giao_du' ELSE 'dang_giao' END)::purchase_order_stage,
         committed_to_budget = greatest(committed_to_budget - v_share, 0),
         updated_at = now(), updated_by = v_user
   WHERE id = p_purchase_order_id;

  SELECT * INTO pr FROM public.purchase_requests WHERE id = po.purchase_request_id;

  IF v_complete THEN
    UPDATE public.purchase_requests
       SET stage = 'hoan_thanh', updated_at = now(), updated_by = v_user
     WHERE id = po.purchase_request_id;

    /*
     * MH-08: bộ chứng từ (đơn hàng, báo giá, phiếu giao hàng, hoá đơn, biên bản) chuyển
     * sang Kế toán để thanh toán, KHÔNG NHẬP LẠI. Ở bước này việc chuyển giao là một thông
     * báo dẫn thẳng tới đơn hàng; đề nghị thanh toán sinh ra từ đó thuộc Module KT (KT-01).
     */
    PERFORM public.create_notification(
      u.id, po.company_id, 'purchase_order_delivered',
      format('Đơn hàng %s đã nhận đủ, giá trị %s đồng. Bộ chứng từ sẵn sàng để lập đề nghị thanh toán.',
             COALESCE(po.code, ''), to_char(po.total_value, 'FM999,999,999,999')),
      'purchase_orders', po.id,
      format('/mh/don-hang/%s', po.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = po.company_id
      AND r.code IN ('KT', 'CFO');
  END IF;

  -- Kho cần biết có hàng về để lập phiếu nhập (KHO-03). Chỗ này sẽ thay bằng lệnh nhập kho
  -- thật khi Module KHO có mặt.
  PERFORM public.create_notification(
    u.id, po.company_id, 'delivery_received',
    format('Đơn hàng %s vừa nhận một đợt hàng ngày %s.',
           COALESCE(po.code, ''), to_char(COALESCE(p_delivered_date, current_date), 'DD/MM/YYYY')),
    'deliveries', v_delivery,
    format('/mh/don-hang/%s', po.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = po.company_id
    AND (r.code = 'KHO' OR u.id = pr.requested_by);

  RETURN v_delivery;
END;
$$;

COMMENT ON FUNCTION public.record_delivery(uuid, date, jsonb, text, text, text, boolean, text) IS
  'Ghi nhận một đợt giao nhận: kiểm đếm theo dòng, chuyển cam kết sang chi phí thực tế, báo Kho và Kế toán (MH-07, MH-08).';


-- ----------------------------------------------------------------------------
-- 10. Lịch sử giá mua — MH-05, gợi ý ngược cho đơn giá dự toán (DA-05)
--
-- Chỉ TRẢ VỀ dữ liệu để người lập dự toán tham khảo. CỐ Ý không ghi thẳng vào `unit_prices`:
-- PRD Mục 2.3 xếp "giá bán cuối cùng, tỷ lệ lợi nhuận" vào nhóm phần mềm không được tự
-- quyết, và một đơn giá dự toán tự đổi theo lần mua gần nhất chính là như vậy.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purchase_price_history(
  p_item_code text,
  p_company_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  quotation_item_id uuid,
  item_code         varchar(64),
  name              text,
  specification     text,
  unit              varchar(32),
  unit_price        bigint,
  quoted_date       date,
  supplier_id       uuid,
  supplier_name     text,
  was_selected      boolean,
  purchase_request_code varchar(40),
  company_id        uuid
)
LANGUAGE plpgsql
-- Cũng không STABLE, cùng lý do như `compare_quotations`: có ghi nhật ký truy cập giá vốn.
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Lịch sử giá mua chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.';
  END IF;

  IF p_item_code IS NULL OR btrim(p_item_code) = '' THEN
    RAISE EXCEPTION 'Chưa có mã vật tư để tra lịch sử giá.';
  END IF;

  -- Giá mua là giá vốn: mọi lượt xem phải ghi lại (PRD NEN-07, Backend Schema 3.4).
  PERFORM public.log_sensitive_access('cost', 'quotation_items', NULL, 'view', p_company_id);

  RETURN QUERY
  SELECT qi.id, qi.item_code, qi.name, qi.specification, qi.unit, qi.unit_price,
         q.quoted_date, q.supplier_id, s.name, (q.status = 'duoc_chon'),
         pr.code, pr.company_id
  FROM public.quotation_items qi
  JOIN public.quotations q       ON q.id = qi.quotation_id AND q.deleted_at IS NULL
  JOIN public.purchase_requests pr ON pr.id = q.purchase_request_id AND pr.deleted_at IS NULL
  JOIN public.suppliers s        ON s.id = q.supplier_id
  WHERE qi.item_code = btrim(p_item_code)
    AND public.rls_company_access(pr.company_id)
    AND (p_company_id IS NULL OR pr.company_id = p_company_id)
  ORDER BY q.quoted_date DESC NULLS LAST, qi.created_at DESC
  LIMIT greatest(1, least(COALESCE(p_limit, 20), 200));
END;
$$;

COMMENT ON FUNCTION public.purchase_price_history(text, uuid, integer) IS
  'Lịch sử giá theo mã vật tư – nhà cung cấp – ngày báo giá – hồ sơ áp dụng (MH-05). Chỉ gợi ý, không tự cập nhật đơn giá.';


-- ----------------------------------------------------------------------------
-- 11. Hai lối đọc tối thiểu mà Mua hàng cần ở phía Thi công
--
-- Vai trò Mua hàng KHÔNG có quyền xem phân hệ Thi công (`db/src/seed/data.ts`), nhưng MH-01
-- bắt buộc đề nghị mua mang "mã công trình", và MH-07 giao hàng ĐẾN công trình. Không đọc
-- nổi tên công trình thì chính màn hình của Mua hàng không gọi được tên hồ sơ nó đang xử lý.
--
-- Mở đúng hai thứ, không mở hơn:
--  1. Phần ĐẦU hồ sơ công trình (mã, tên, địa chỉ). Nhật ký, nghiệm thu, tổ đội, bảo hành và
--     ngân sách vẫn đóng — chúng đi qua `rls_site_readable`, hàm này KHÔNG đổi và vẫn đòi
--     quyền xem phân hệ Thi công.
--  2. Danh sách MÃ CHI PHÍ của một công trình — chỉ mã và tên, KHÔNG kèm con số tiền nào.
--     Biểu mẫu đề nghị mua cần đúng chừng đó để gắn chi phí vào đúng dòng ngân sách (KT-05).
--
-- ⚠️ GIẢ ĐỊNH CHỜ HAAN XÁC NHẬN: Webapp Flow 2.3 xếp Mua hàng vào "Mua hàng – Vật tư; Kho
-- (xem tồn)" và không nhắc phân hệ Thi công. Diễn giải ở đây là quyền ĐỌC TỐI THIỂU để MH-01
-- thực hiện được, không phải mở phân hệ Thi công cho Mua hàng.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS construction_sites_select ON public.construction_sites;

CREATE POLICY construction_sites_select ON public.construction_sites
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (public.auth_can_view_module('TC') OR public.auth_can_view_module('MH'))
  );

CREATE OR REPLACE FUNCTION public.site_cost_codes(p_site_id uuid)
RETURNS TABLE (
  cost_code  varchar(64),
  name       text,
  cost_group cost_group
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT (public.auth_can_view_module('TC') OR public.auth_can_view_module('MH')) THEN
    RAISE EXCEPTION 'Không xem được công trình này.';
  END IF;

  -- KHÔNG trả về cột tiền nào: đây là danh sách để CHỌN mã, không phải màn hình ngân sách.
  -- Số liệu ngân sách vẫn chỉ đi qua `construction_budget_status` với Mẫu D nguyên vẹn.
  RETURN QUERY
  SELECT pb.cost_code, pb.name, pb.cost_group
  FROM public.project_budgets pb
  WHERE pb.construction_site_id = p_site_id
    AND pb.deleted_at IS NULL
    AND pb.cost_group <> 'loi_nhuan'
  ORDER BY pb.cost_group, pb.cost_code;
END;
$$;

COMMENT ON FUNCTION public.site_cost_codes(uuid) IS
  'Danh sách mã chi phí của một công trình, KHÔNG kèm số tiền — để biểu mẫu đề nghị mua gắn đúng dòng ngân sách (MH-01, KT-05).';
