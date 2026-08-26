-- ============================================================================
-- Module HD — phân quyền và luồng nghiệp vụ
--
-- Nguồn: PRD HD-01 → HD-05, Backend Schema 4.5, Webapp Flow 3.1 bước 5.
--
-- Module này khép lại Giai đoạn 1, nên hai thứ phải đúng tuyệt đối:
--
--  1. ĐƯỜNG TRUY NGƯỢC. PRD Mục 7 đòi "từ một hợp đồng, truy ngược về đúng cơ hội gốc,
--     đúng phiên bản dự toán đã duyệt, ai duyệt, khi nào". Nên `source_type`/`source_id`
--     và `estimate_id` bị KHOÁ sau khi tạo, và hồ sơ nguồn được kiểm tra có thật + cùng
--     pháp nhân ngay lúc ghi.
--
--  2. CHỮ KÝ PHÊ DUYỆT PHẢI CÓ NGHĨA. Hợp đồng đã duyệt mà còn sửa được giá trị thì hạn
--     mức của HD-05 chỉ là hình thức.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bốn cột kiểm toán và các cột định danh bất biến (migration 0019)
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.contracts');
SELECT public.attach_audit_touch('public.contract_terms');
SELECT public.attach_audit_touch('public.contract_amendments');

-- `source_type`/`source_id`/`estimate_id` nằm trong danh sách khoá: đổi được chúng nghĩa là
-- đổi được câu trả lời cho "hợp đồng này sinh ra từ đâu" sau khi đã ký — đúng thứ tiêu chí
-- nghiệm thu Giai đoạn 1 phải bảo đảm.
CREATE TRIGGER contracts_freeze_identity
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'source_type', 'source_id', 'estimate_id'
  );

CREATE TRIGGER contract_terms_freeze_identity
  BEFORE UPDATE ON public.contract_terms
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'contract_id');

CREATE TRIGGER contract_amendments_freeze_identity
  BEFORE UPDATE ON public.contract_amendments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('company_id', 'contract_id');


-- ----------------------------------------------------------------------------
-- 1. Hồ sơ nguồn phải có thật và cùng pháp nhân (HD-01)
--
-- `source_id` là tham chiếu đa hình nên không có khoá ngoại nào kiểm hộ. Không kiểm thì
-- hợp đồng trỏ vào một id không tồn tại — hoặc tệ hơn, trỏ sang gói thầu của pháp nhân
-- khác, và đường truy ngược dẫn người đọc tới nhầm hồ sơ mà không có dấu hiệu gì.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contracts_check_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source_company uuid;
BEGIN
  IF NEW.source_type IS NULL THEN
    RETURN NEW;
  END IF;

  v_source_company := CASE NEW.source_type
    WHEN 'opportunities' THEN
      (SELECT company_id FROM public.opportunities WHERE id = NEW.source_id AND deleted_at IS NULL)
    WHEN 'bidding_projects' THEN
      (SELECT company_id FROM public.bidding_projects WHERE id = NEW.source_id AND deleted_at IS NULL)
    WHEN 'design_projects' THEN
      (SELECT company_id FROM public.design_projects WHERE id = NEW.source_id AND deleted_at IS NULL)
  END;

  IF v_source_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn của hợp đồng.';
  END IF;

  IF v_source_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Hồ sơ nguồn thuộc pháp nhân khác. Hợp đồng phải cùng pháp nhân với hồ sơ sinh ra nó.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER contracts_check_source
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_check_source();

COMMENT ON FUNCTION public.contracts_check_source() IS
  'Hồ sơ nguồn của hợp đồng phải có thật và cùng pháp nhân — thay cho khoá ngoại mà tham chiếu đa hình không có (HD-01).';


-- ----------------------------------------------------------------------------
-- 2. Hợp đồng — Mẫu C (Backend Schema 4.5)
--
-- Mẫu C nói về quyền DUYỆT theo hạn mức, không phải quyền XEM: rất nhiều vai trò cần xem
-- hợp đồng (Kinh doanh, Dự án – Đấu thầu, Thiết kế, Kế toán — Webapp Flow 2.3). Nên phần
-- đọc theo Mẫu A, còn phần quyết định phê duyệt đi qua `rls_can_approve` trong
-- `decide_approval` — đúng cách `quotes` và `estimates` đã làm.
--
-- Phần RIÊNG của HD: hợp đồng chỉ SỬA được khi còn nháp hoặc bị trả về. Đã trình ký, đã
-- duyệt, đã ký mà còn sửa giá trị thì chữ ký phê duyệt theo hạn mức trỏ vào một con số
-- khác con số cuối cùng — và không ai phát hiện ra.
-- ----------------------------------------------------------------------------

ALTER TABLE public.contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_terms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_amendments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY contracts_select ON public.contracts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('HD')
  );

CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_create_in('HD', company_id)
  );

CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('HD')
    AND stage = 'nhap'
  )
  WITH CHECK (public.rls_company_access(company_id));

COMMENT ON POLICY contracts_update ON public.contracts IS
  'Chỉ sửa được hợp đồng còn ở bước Nháp. Từ Chờ phê duyệt trở đi mọi thay đổi đi qua hàm nghiệp vụ (HD-05).';


-- Điều kiện dùng chung cho bảng con — viết thành hàm để hai bảng không chép lại rồi lệch
-- nhau về sau (đúng cách đã làm ở Module DA và TK).
CREATE OR REPLACE FUNCTION public.rls_contract_readable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.deleted_at IS NULL
      AND public.rls_company_access(c.company_id)
      AND public.auth_can_view_module('HD')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_contract_writable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.deleted_at IS NULL
      AND public.rls_company_access(c.company_id)
      AND public.auth_can_edit_module('HD')
      -- Đã quyết toán hoặc đã hủy thì hồ sơ đóng lại. Điều khoản và phát sinh của một hợp
      -- đồng đã thanh lý mà còn sửa được thì con số quyết toán không còn là con số cuối.
      AND c.stage NOT IN ('hoan_thanh', 'huy')
  );
$$;

COMMENT ON FUNCTION public.rls_contract_writable(uuid) IS
  'Hợp đồng còn thao tác được không: đúng pháp nhân, có quyền sửa module HD, chưa quyết toán và chưa hủy.';


-- ----------------------------------------------------------------------------
-- 3. Điều khoản — Mẫu A theo hợp đồng cha (HD-02)
--
-- CỐ Ý cho sửa cả khi hợp đồng đã ký: điều khoản là thứ phải ĐÁNH DẤU HOÀN THÀNH trong
-- suốt quá trình thực hiện (đã tạm ứng đợt 1, đã hết hạn bảo lãnh). Khoá lại sau khi ký thì
-- bảng theo dõi tiến độ thanh toán của HD-02 thành một danh sách chết.
-- ----------------------------------------------------------------------------

CREATE POLICY contract_terms_select ON public.contract_terms
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_contract_readable(contract_id));

CREATE POLICY contract_terms_insert ON public.contract_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_contract_writable(contract_id)
  );

CREATE POLICY contract_terms_update ON public.contract_terms
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_contract_writable(contract_id))
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 4. Phát sinh ngoài hợp đồng — Mẫu C (HD-04)
--
-- Ghi nhận đề xuất thì mở (công trường phải đề xuất được), nhưng bước THỰC HIỆN đi qua hàm
-- `execute_amendment` — nơi kiểm tra đúng quy tắc HD-04. Mở UPDATE tự do thì ai cũng tự đặt
-- `stage = 'da_thuc_hien'` và toàn bộ điều khoản đó thành trang trí.
-- ----------------------------------------------------------------------------

CREATE POLICY contract_amendments_select ON public.contract_amendments
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_contract_readable(contract_id));

CREATE POLICY contract_amendments_insert ON public.contract_amendments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_contract_writable(contract_id)
    -- Phát sinh mới luôn bắt đầu ở bước Đề xuất. Tạo thẳng ở bước "đã duyệt" là tự cấp cho
    -- mình chữ ký phê duyệt mà không ai ký.
    AND stage = 'de_xuat'
    AND approved_at IS NULL
    AND executed_at IS NULL
  );

CREATE POLICY contract_amendments_update ON public.contract_amendments
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_contract_writable(contract_id)
    -- Chỉ sửa nội dung khi còn ở bước Đề xuất. Trình duyệt, phê duyệt và thực hiện đều đi
    -- qua hàm nghiệp vụ.
    AND stage = 'de_xuat'
  )
  WITH CHECK (public.rls_company_access(company_id));

-- Không bảng nào có policy DELETE ⇒ xoá cứng bị chặn, chỉ xoá mềm qua `deleted_at`.


-- ----------------------------------------------------------------------------
-- 5. Soạn hợp đồng từ hồ sơ nguồn (HD-01)
--
-- Endpoint `POST /api/contracts/from-opportunity` của Backend Schema 4.5.
--
-- PRD Mục 2.3 cấm nhập lại dữ liệu đã có ở nơi khác. Hàm này lấy khách hàng, tên và giá trị
-- từ đúng hồ sơ nguồn — và với gói thầu/dự án thiết kế thì lấy giá từ bản dự toán ĐÃ DUYỆT
-- đang hiệu lực, không phải từ con số ước tính ban đầu.
--
-- Đặt ở CSDL chứ không ở Workers vì việc này chỉ đọc vài bảng rồi ghi một bảng, và quyền
-- diễn đạt được bằng RLS — đúng quy tắc chọn lớp ở CLAUDE.md 3.1.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_contract_from_source(
  p_source_type contract_source_type,
  p_source_id uuid,
  p_type contract_type,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.auth_user_id();
  v_company     uuid;
  v_customer    uuid;
  v_name        text;
  v_value       bigint;
  v_estimate    uuid;
  v_company_code text;
  v_code        text;
  v_contract    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- Lấy dữ liệu nguồn. Giá trị ưu tiên bản dự toán ĐÃ DUYỆT đang hiệu lực; không có thì
  -- mới dùng con số ước tính, và khi đó `estimate_id` để rỗng chứ không trỏ bừa.
  IF p_source_type = 'opportunities' THEN
    SELECT o.company_id, o.customer_id, o.name INTO v_company, v_customer, v_name
      FROM public.opportunities o WHERE o.id = p_source_id AND o.deleted_at IS NULL;

    -- Với cơ hội, giá trị đến từ báo giá đang hiệu lực đã được duyệt (CRM-04).
    SELECT q.total_value INTO v_value
      FROM public.quotes q
     WHERE q.opportunity_id = p_source_id
       AND q.is_current_version AND q.deleted_at IS NULL AND q.status = 'completed';

  ELSIF p_source_type = 'bidding_projects' THEN
    SELECT b.company_id, b.customer_id, b.name, b.estimated_value
      INTO v_company, v_customer, v_name, v_value
      FROM public.bidding_projects b WHERE b.id = p_source_id AND b.deleted_at IS NULL;

    SELECT e.id, e.bid_price INTO v_estimate, v_value
      FROM public.estimates e
     WHERE e.bidding_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

  ELSE
    SELECT d.company_id, d.customer_id, d.name INTO v_company, v_customer, v_name
      FROM public.design_projects d WHERE d.id = p_source_id AND d.deleted_at IS NULL;

    SELECT e.id, e.bid_price INTO v_estimate, v_value
      FROM public.estimates e
     WHERE e.design_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn, hoặc hồ sơ đã bị xóa.';
  END IF;

  IF NOT public.auth_can_create_in('HD', v_company) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được soạn hợp đồng trong pháp nhân này.';
  END IF;

  -- Một hồ sơ nguồn chỉ sinh MỘT hợp đồng còn hiệu lực. Hai hợp đồng cho cùng một gói thầu
  -- nghĩa là doanh thu bị đếm hai lần ở báo cáo, mà không có dấu hiệu nào để nhận ra.
  IF EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.source_type = p_source_type AND c.source_id = p_source_id
       AND c.deleted_at IS NULL AND c.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Hồ sơ này đã có hợp đồng. Mở hợp đồng hiện có thay vì soạn bản mới.';
  END IF;

  SELECT code INTO v_company_code FROM public.companies WHERE id = v_company;
  v_code := public.next_record_code(v_company_code, 'HD');

  INSERT INTO public.contracts (
    company_id, code, title, type, source_type, source_id, estimate_id,
    customer_id, responsible_user_id, value
  )
  VALUES (
    v_company, v_code, COALESCE(NULLIF(btrim(p_title), ''), v_name), p_type,
    p_source_type, p_source_id, v_estimate, v_customer, v_user, v_value
  )
  RETURNING id INTO v_contract;

  RETURN v_contract;
END;
$$;

COMMENT ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text) IS
  'Soạn hợp đồng từ cơ hội / gói thầu / dự án thiết kế, lấy sẵn khách hàng và giá đã duyệt — không nhập lại (HD-01).';


-- ----------------------------------------------------------------------------
-- 6. Trình ký theo hạn mức thẩm quyền (HD-05)
--
-- Endpoint `POST /api/contracts/:id/submit-approval` của Backend Schema 4.5.
-- Dùng lại nguyên bảng `approvals` và hàm `decide_approval` — Hộp thư Phê duyệt là MỘT màn
-- hình cho mọi module (Webapp Flow 4.6), không dựng bảng duyệt riêng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_contract_approval(p_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  c          record;
  v_missing  integer;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_can_edit_module('HD') THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  IF c.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng này đã được trình ký.';
  END IF;

  IF c.value IS NULL OR c.value <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá trị hợp đồng. Nhập giá trị trước khi trình ký.';
  END IF;

  -- HD-02 liệt kê tám nhóm điều khoản phải theo dõi. Ba nhóm dưới đây là những nhóm mà
  -- thiếu chúng thì hợp đồng không thực hiện được, nên chặn ngay ở bước trình ký — phát
  -- hiện sau khi đã ký là quá muộn để bổ sung.
  SELECT count(*) INTO v_missing
    FROM unnest(ARRAY['pham_vi', 'gia_tri', 'tien_do_thanh_toan']::contract_term_type[]) AS r(t)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.contract_terms ct
      WHERE ct.contract_id = p_contract_id AND ct.deleted_at IS NULL AND ct.term_type = r.t
   );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Còn % nhóm điều khoản bắt buộc chưa ghi (phạm vi, giá trị, tiến độ thanh toán). Kiểm tra tab Điều khoản.', v_missing;
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    c.company_id, 'contract', 'contracts', c.id, c.code,
    format('Hợp đồng %s — %s', c.code, c.title),
    c.value, c.notes, 'pending_approval', v_user,
    -- Hạn duyệt bám ngày bắt đầu thực hiện: duyệt sau khi đã phải khởi công thì vô nghĩa.
    c.start_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.contracts
     SET stage = 'cho_duyet', updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_contract_approval(uuid) IS
  'Trình ký hợp đồng theo hạn mức thẩm quyền — vào Hộp thư Phê duyệt chung (HD-05, NEN-02).';


CREATE OR REPLACE FUNCTION public.submit_amendment_approval(p_amendment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  a          record;
  c          record;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.contract_amendments
   WHERE id = p_amendment_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_writable(a.contract_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên phát sinh này.';
  END IF;

  IF a.stage <> 'de_xuat' THEN
    RAISE EXCEPTION 'Phát sinh này đã được trình duyệt.';
  END IF;

  -- HD-04: phải có BÁO GIÁ trước khi thực hiện. Trường hợp khẩn cấp được miễn — nhưng chỉ
  -- khi đã ghi rõ ai cho phép, và ràng buộc CHECK ở migration 0026 đã giữ điều đó.
  IF NOT a.is_emergency AND a.quote_sent_at IS NULL THEN
    RAISE EXCEPTION 'Chưa gửi báo giá phát sinh cho khách hàng. Gửi báo giá trước khi trình duyệt.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = a.contract_id;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by
  )
  VALUES (
    a.company_id, 'contract_amendment', 'contract_amendments', a.id, COALESCE(a.code, c.code),
    format('Phát sinh hợp đồng %s — %s', c.code, a.title),
    -- Hạn mức xét trên ĐỘ LỚN của thay đổi: giảm trừ 100 triệu cũng là quyết định 100 triệu.
    abs(a.value_change),
    a.reason, 'pending_approval', v_user
  )
  RETURNING id INTO v_approval;

  UPDATE public.contract_amendments
     SET stage = 'cho_duyet', updated_at = now(), updated_by = v_user
   WHERE id = p_amendment_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_amendment_approval(uuid) IS
  'Trình duyệt phát sinh ngoài hợp đồng theo hạn mức — chặn nếu chưa gửi báo giá cho khách (HD-04, HD-05).';


-- ----------------------------------------------------------------------------
-- 7. Bổ sung nhánh hợp đồng và phát sinh vào hàm quyết định phê duyệt dùng chung
--
-- ⚠️ Ép kiểu tường minh cho biểu thức CASE trả enum — lỗi từng xảy ra ở 0013, sửa ở 0014:
-- thiếu ép kiểu thì hàm chạy tới đây mới lỗi, nghĩa là hồ sơ phê duyệt ĐÃ ghi nhận quyết
-- định nhưng hồ sơ nguồn không đổi trạng thái.
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
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 8. Ký, quyết toán và hủy hợp đồng
--
-- Ba bước này không mở cho UPDATE thẳng vì mỗi bước có điều kiện riêng: ký phải sau khi
-- duyệt, quyết toán phải sau khi ký, hủy phải nêu nguyên nhân.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sign_contract(
  p_contract_id uuid,
  p_contract_number text,
  p_signed_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_can_edit_module('HD') THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  -- Ghi nhận đã ký trước khi có phê duyệt nội bộ nghĩa là hạn mức HD-05 bị bỏ qua hoàn toàn.
  IF c.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ ghi nhận đã ký sau khi hợp đồng được phê duyệt nội bộ.';
  END IF;

  IF p_contract_number IS NULL OR btrim(p_contract_number) = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập số hợp đồng theo văn bản đã ký.';
  END IF;

  UPDATE public.contracts
     SET stage = 'da_ky',
         contract_number = btrim(p_contract_number),
         signed_date = COALESCE(p_signed_date, current_date),
         signed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  -- Hợp đồng đã ký là tín hiệu khởi động của Thi công và Kế toán (PRD Mục 7, TC-01).
  PERFORM public.create_notification(
    u.id, c.company_id, 'contract_signed',
    format('Hợp đồng %s đã được ký, giá trị %s đồng.', c.code, to_char(c.value, 'FM999,999,999,999')),
    'contracts', c.id,
    format('/hd/hop-dong/%s', c.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = c.company_id
    AND (r.code IN ('TC', 'KT', 'KD') OR u.id = c.responsible_user_id);
END;
$$;

COMMENT ON FUNCTION public.sign_contract(uuid, text, date) IS
  'Ghi nhận hợp đồng đã ký — chỉ sau khi phê duyệt nội bộ, và thông báo cho Thi công, Kế toán (HD-05).';


CREATE OR REPLACE FUNCTION public.close_contract(
  p_contract_id uuid,
  p_stage contract_stage,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  c        record;
  v_open   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_stage NOT IN ('hoan_thanh', 'huy') THEN
    RAISE EXCEPTION 'Hàm này chỉ dùng để quyết toán hoặc hủy hợp đồng.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_can_edit_module('HD') THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  IF c.stage IN ('hoan_thanh', 'huy') THEN
    RAISE EXCEPTION 'Hợp đồng này đã kết thúc.';
  END IF;

  IF p_stage = 'huy' AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân hủy hợp đồng.';
  END IF;

  IF p_stage = 'hoan_thanh' THEN
    IF c.stage <> 'da_ky' THEN
      RAISE EXCEPTION 'Chỉ quyết toán được hợp đồng đã ký.';
    END IF;

    -- Quyết toán khi còn phát sinh chưa ngã ngũ nghĩa là con số quyết toán chưa phải con số
    -- cuối — và sau khi đóng hồ sơ thì không sửa được nữa (HD-04).
    SELECT count(*) INTO v_open
      FROM public.contract_amendments am
     WHERE am.contract_id = p_contract_id AND am.deleted_at IS NULL
       AND am.stage IN ('de_xuat', 'cho_duyet', 'da_duyet');

    IF v_open > 0 THEN
      RAISE EXCEPTION 'Còn % phát sinh chưa xử lý xong. Hoàn tất hoặc đóng các phát sinh trước khi quyết toán.', v_open;
    END IF;
  END IF;

  UPDATE public.contracts
     SET stage = p_stage,
         settled_at = CASE WHEN p_stage = 'hoan_thanh' THEN now() ELSE NULL END,
         cancel_reason = CASE WHEN p_stage = 'huy' THEN btrim(p_reason) ELSE NULL END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;
END;
$$;

COMMENT ON FUNCTION public.close_contract(uuid, contract_stage, text) IS
  'Quyết toán hoặc hủy hợp đồng — chặn quyết toán khi còn phát sinh chưa xử lý xong (HD-03, HD-04).';


-- ----------------------------------------------------------------------------
-- 9. Đánh dấu phát sinh đã thực hiện (HD-04) — điều khoản khó nhất của module này
--
-- PRD HD-04 nguyên văn: "mọi phát sinh phải có đề xuất, báo giá và XÁC NHẬN CỦA KHÁCH HÀNG
-- trước khi thực hiện, TRỪ trường hợp khẩn cấp được cấp có thẩm quyền cho phép — ghi nhận
-- rõ trường hợp khẩn cấp và người phê duyệt".
--
-- Hai đường hợp lệ, không có đường thứ ba. Quy tắc này nằm ở CSDL chứ không ở giao diện vì
-- đây chính xác là chỗ mà "làm trước, hợp thức hóa sau" gây tranh chấp với khách hàng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.contract_amendments
   WHERE id = p_amendment_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_writable(a.contract_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên phát sinh này.';
  END IF;

  IF a.stage = 'da_thuc_hien' THEN
    RAISE EXCEPTION 'Phát sinh này đã được ghi nhận thực hiện.';
  END IF;

  IF a.stage = 'tu_choi' THEN
    RAISE EXCEPTION 'Phát sinh này đã có kết luận không thực hiện.';
  END IF;

  IF a.is_emergency THEN
    -- Ràng buộc CHECK ở 0026 đã bảo đảm có người cho phép; kiểm lại ở đây để thông báo lỗi
    -- nói đúng việc phải làm thay vì để CSDL trả về tên ràng buộc.
    IF a.emergency_authorized_by IS NULL THEN
      RAISE EXCEPTION 'Trường hợp khẩn cấp phải ghi rõ người có thẩm quyền đã cho phép (HD-04).';
    END IF;
  ELSE
    IF a.stage <> 'da_duyet' THEN
      RAISE EXCEPTION 'Phát sinh chưa được phê duyệt nội bộ. Trình duyệt trước khi thực hiện.';
    END IF;

    IF a.customer_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Chưa có xác nhận của khách hàng. Không thực hiện phát sinh trước khi khách đồng ý (HD-04).';
    END IF;
  END IF;

  UPDATE public.contract_amendments
     SET stage = 'da_thuc_hien', executed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_amendment_id;
END;
$$;

COMMENT ON FUNCTION public.execute_amendment(uuid) IS
  'Ghi nhận phát sinh đã thực hiện — chỉ khi đã duyệt VÀ khách xác nhận, hoặc khẩn cấp có người cho phép (HD-04).';


CREATE OR REPLACE FUNCTION public.confirm_amendment_by_customer(
  p_amendment_id uuid,
  p_confirmed_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.contract_amendments
   WHERE id = p_amendment_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_writable(a.contract_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên phát sinh này.';
  END IF;

  -- Khách xác nhận cái gì thì phải nói rõ ai xác nhận — "khách hàng đồng ý" chung chung
  -- không đối chiếu được với ai khi có tranh chấp.
  IF p_confirmed_by IS NULL OR btrim(p_confirmed_by) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi tên người xác nhận phía khách hàng.';
  END IF;

  IF a.quote_sent_at IS NULL THEN
    RAISE EXCEPTION 'Chưa gửi báo giá phát sinh. Khách hàng xác nhận trên căn cứ nào (HD-04)?';
  END IF;

  UPDATE public.contract_amendments
     SET customer_confirmed_at = now(),
         customer_confirmed_by = btrim(p_confirmed_by),
         updated_at = now(), updated_by = v_user
   WHERE id = p_amendment_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_amendment_by_customer(uuid, text) IS
  'Ghi nhận khách hàng xác nhận phát sinh — bắt buộc đã gửi báo giá trước đó (HD-04).';
