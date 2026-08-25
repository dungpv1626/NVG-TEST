-- ============================================================================
-- Luồng báo giá và phê duyệt (PRD CRM-04, CRM-05, NEN-02, NEN-05)
--
-- Nguyên tắc xuyên suốt file này: BÁO GIÁ CHỈ SỬA TỰ DO KHI CÒN LÀ NHÁP.
-- Mọi bước sau đó (gửi phê duyệt → duyệt/từ chối → gửi khách → ghi nhận phản hồi) đi qua
-- một hàm nghiệp vụ có kiểm tra và có ghi vết. Lý do: nếu còn sửa được sau khi duyệt thì
-- chữ ký phê duyệt vô nghĩa — người duyệt một mức giá, khách hàng nhận một mức giá khác.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RLS cho bảng phê duyệt dùng chung — MẪU C (Backend Schema 3.3)
--
-- "Chỉ hiển thị trong Hộp thư Phê duyệt (và cho phép duyệt) nếu giá trị hồ sơ nằm trong
--  hạn mức của vai trò người dùng (đối chiếu approval_limits)."
--
-- Thêm một điều kiện nữa: NGƯỜI ĐỀ NGHỊ luôn xem được hồ sơ mình gửi, để theo dõi
-- "hồ sơ đang nằm ở ai" — đúng vướng mắc #6 trong khảo sát.
--
-- Ai không duyệt được và không phải người đề nghị thì KHÔNG thấy dòng nào: lý do giảm giá
-- và ý kiến phê duyệt là nội dung thương thảo, PRD Module CRM ghi rõ "phải phân quyền chặt,
-- không hiển thị đại trà cho toàn bộ nhân sự".
-- ----------------------------------------------------------------------------

ALTER TABLE public.approvals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.approvals          FROM anon;
REVOKE ALL ON public.approval_decisions FROM anon;

CREATE POLICY approvals_select ON public.approvals
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      requested_by = public.auth_user_id()
      OR public.rls_can_approve(subject, company_id, amount)
    )
  );

-- KHÔNG có policy INSERT/UPDATE/DELETE: đề nghị phê duyệt chỉ sinh ra từ trigger của hồ sơ
-- nguồn, quyết định chỉ ghi qua `decide_approval`. Không tạo được đề nghị giả từ trình duyệt.

-- Lịch sử quyết định đi theo hồ sơ cha: điều kiện dưới đây chạy qua policy của `approvals`
-- ở trên, nên không phải chép lại logic Mẫu C ở hai nơi (chép là sẽ lệch nhau về sau).
CREATE POLICY approval_decisions_select ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.approvals a WHERE a.id = approval_id));


-- ----------------------------------------------------------------------------
-- 2. Ai được sửa báo giá của một cơ hội — Mẫu B qua cơ hội mẹ
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_quote_writable(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = p_opportunity_id
      AND o.deleted_at IS NULL
      -- CRM-06: cơ hội đã bàn giao chuyển chế độ chỉ xem, kéo theo cả báo giá của nó.
      AND o.handed_over_at IS NULL
      AND public.rls_owner_can_write(o.company_id, o.owner_id)
  );
$$;

COMMENT ON FUNCTION public.rls_quote_writable(uuid) IS
  'Báo giá thừa hưởng quyền sửa từ cơ hội mẹ (Mẫu B) — chỉ người chịu trách nhiệm và quản lý.';


-- ----------------------------------------------------------------------------
-- 3. Đánh số phiên bản và cấp mã báo giá — NEN-05, CRM-04
--
-- Làm bằng trigger thay vì để ứng dụng tự tính, vì hai lý do:
--   a) Hai người soạn báo giá cùng lúc mà ứng dụng tự đếm sẽ ra hai bản cùng số phiên bản.
--   b) Việc hạ cờ "đang hiệu lực" của bản CŨ phải xảy ra cùng lúc với việc tạo bản MỚI.
--      Bản cũ thường ĐÃ GỬI khách hàng, mà policy chặn sửa báo giá đã gửi — nên nếu để ứng
--      dụng làm, thao tác sẽ bị RLS chặn. Trigger SECURITY DEFINER làm đúng và làm gọn.
--
-- Mã phiên bản 2 trở đi giữ nguyên mã gốc + hậu tố -V<n> (NVC-BG-2026-0001-V2), để nhìn mã
-- là biết ngay hai bản thuộc cùng một chuỗi báo giá.
-- ----------------------------------------------------------------------------

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

CREATE TRIGGER quotes_assign_version
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_assign_version();


-- ----------------------------------------------------------------------------
-- 4. Siết quyền ghi trên `quotes`
--
-- Policy cũ (0009) cho phép bất kỳ ai trong pháp nhân sửa báo giá chưa gửi, và cho sửa cả
-- khi báo giá đang chờ duyệt hoặc đã duyệt. Cả hai đều sai:
--   - Đồng nghiệp không phụ trách cơ hội không nên sửa giá của người khác (Mẫu B).
--   - Sửa được sau khi gửi duyệt/đã duyệt thì kết quả phê duyệt không còn giá trị.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS quotes_insert ON public.quotes;
DROP POLICY IF EXISTS quotes_update ON public.quotes;

CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_quote_writable(opportunity_id)
  );

CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND status = 'draft'                 -- chỉ nháp mới sửa tự do
    AND sent_to_customer_at IS NULL
    AND public.rls_quote_writable(opportunity_id)
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 5. Gửi phê duyệt nội bộ (CRM-04) — SECURITY INVOKER
--
-- Giữ INVOKER để chính RLS quyết định ai được gửi: lệnh UPDATE bên dưới chỉ chạy được nếu
-- người gọi thật sự có quyền sửa báo giá nháp này. Dòng phê duyệt do trigger ở mục 6 tạo.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_quote_approval(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá, hoặc không có quyền truy cập.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã gửi khách hàng. Tạo phiên bản mới nếu cần thay đổi giá.';
  END IF;

  IF q.status = 'pending_approval' THEN
    RAISE EXCEPTION 'Báo giá này đang chờ phê duyệt.';
  END IF;

  IF q.status = 'completed' THEN
    RAISE EXCEPTION 'Báo giá này đã được phê duyệt.';
  END IF;

  IF q.total_value IS NULL OR q.total_value <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị báo giá trước khi gửi phê duyệt.';
  END IF;

  -- CRM-05: giảm giá phải có căn cứ, vì đây chính là thứ Tổng Giám đốc cần để quyết định.
  IF COALESCE(q.discount_amount, 0) > 0
     AND (q.discount_reason IS NULL OR btrim(q.discount_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do giảm giá trước khi gửi phê duyệt.';
  END IF;

  IF COALESCE(q.discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Mức giảm giá không được là số âm.';
  END IF;

  IF COALESCE(q.discount_amount, 0) > q.total_value THEN
    RAISE EXCEPTION 'Mức giảm giá không được lớn hơn giá trị báo giá.';
  END IF;

  UPDATE public.quotes
     SET status = 'pending_approval', updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.request_quote_approval(uuid) IS
  'Gửi báo giá đi phê duyệt nội bộ (PRD CRM-04). Dòng trong Hộp thư Phê duyệt do trigger quotes_open_approval tạo.';


-- ----------------------------------------------------------------------------
-- 6. Mở hồ sơ trong Hộp thư Phê duyệt — trigger, không phải lệnh trong hàm
--
-- Cùng bài học với lịch sử giai đoạn ở 0010: bảng `approvals` cố tình không có policy
-- INSERT, nên lệnh INSERT chạy dưới quyền người gọi sẽ bị RLS chặn. Đưa vào trigger
-- SECURITY DEFINER vừa chạy được, vừa mạnh hơn — báo giá chuyển sang "chờ duyệt" bằng
-- đường nào cũng chắc chắn xuất hiện trong Hộp thư của đúng người.
--
-- Chọn loại nghiệp vụ ngay tại đây, không để ứng dụng truyền vào: nếu để ứng dụng chọn,
-- một báo giá có giảm giá vẫn có thể bị gửi nhầm sang luồng duyệt thường và né được
-- Tổng Giám đốc — đúng thứ CRM-05 muốn chặn.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quotes_open_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject  approval_subject;
  v_amount   bigint;
  v_opp_name text;
  v_actor    uuid := COALESCE(public.auth_user_id(), NEW.updated_by, NEW.created_by);
BEGIN
  IF NEW.status = 'pending_approval' AND OLD.status IS DISTINCT FROM 'pending_approval' THEN
    SELECT o.name INTO v_opp_name
    FROM public.opportunities o WHERE o.id = NEW.opportunity_id;

    IF COALESCE(NEW.discount_amount, 0) > 0 THEN
      -- CRM-05: "quy định người có quyền giảm giá... mặc định Tổng Giám đốc".
      -- Đối chiếu hạn mức theo MỨC GIẢM, không theo tổng giá trị.
      v_subject := 'special_discount';
      v_amount  := NEW.discount_amount;
    ELSE
      -- CRM-04: mọi báo giá đều qua phê duyệt nội bộ trước khi gửi.
      v_subject := 'quote_price';
      v_amount  := NEW.total_value;
    END IF;

    INSERT INTO public.approvals (
      company_id, subject, entity_type, entity_id, entity_code,
      title, amount, reason, requested_by, created_by, updated_by
    )
    VALUES (
      NEW.company_id, v_subject, 'quotes', NEW.id, NEW.code,
      format('%s — báo giá phiên bản %s', COALESCE(v_opp_name, 'Cơ hội kinh doanh'), NEW.version),
      v_amount, NEW.discount_reason, v_actor, v_actor, v_actor
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.quotes_open_approval() IS
  'Mở hồ sơ trong Hộp thư Phê duyệt khi báo giá chuyển sang chờ duyệt. Có giảm giá thì đi luồng Tổng Giám đốc (PRD CRM-05).';

CREATE TRIGGER quotes_open_approval
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_open_approval();


-- ----------------------------------------------------------------------------
-- 7. Phê duyệt / từ chối — hàm dùng chung cho MỌI module
--
-- SECURITY DEFINER vì phải ghi 3 bảng trong cùng một giao dịch (approvals,
-- approval_decisions, hồ sơ nguồn) mà hai bảng đầu không mở quyền ghi từ trình duyệt.
-- Đổi lại, RLS KHÔNG tự bảo vệ hàm này — nên bước kiểm tra hạn mức Mẫu C phải làm
-- TƯỜNG MINH ngay đầu hàm. Bỏ dòng đó là mở toang quyền duyệt cho mọi người.
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

  -- Mẫu C (Backend Schema 3.3) — hàng rào thật sự của hàm này.
  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  -- Từ chối mà không nêu lý do thì người đề nghị không biết phải sửa gì (CGD 4.6).
  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  -- Ghi hạn mức TẠI THỜI ĐIỂM duyệt: quy chế phân quyền sẽ đổi (PRD Mục 10), mà nhật ký
  -- phải đọc đúng mãi về sau — "người này khi đó được duyệt tới mức nào" (NEN-03).
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

  -- Cập nhật hồ sơ nguồn. Mỗi module thêm một nhánh ở đây khi có luồng duyệt mới.
  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Phê duyệt/từ chối một hồ sơ bất kỳ và ghi lịch sử quyết định (PRD NEN-02, NEN-03, CRM-05, DA-07).';


-- ----------------------------------------------------------------------------
-- 8. Gửi báo giá cho khách hàng (CRM-04)
--
-- Đổi từ SECURITY INVOKER sang DEFINER: policy mới ở mục 4 chỉ cho sửa báo giá còn NHÁP,
-- mà thao tác này diễn ra khi báo giá ĐÃ ĐƯỢC DUYỆT. Vì mất lớp bảo vệ của RLS nên phải
-- tự kiểm tra quyền sửa bằng `rls_quote_writable`.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_quote_to_customer(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội hoặc quản lý trực tiếp mới gửi được báo giá cho khách hàng.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã được gửi cho khách hàng.';
  END IF;

  -- PRD CRM-04: "báo giá phải qua phê duyệt nội bộ trước khi gửi".
  IF q.status <> 'completed' THEN
    RAISE EXCEPTION 'Báo giá chưa được phê duyệt nội bộ nên chưa gửi được cho khách hàng.';
  END IF;

  IF NOT q.is_current_version THEN
    RAISE EXCEPTION 'Đây không phải phiên bản đang hiệu lực. Gửi phiên bản mới nhất cho khách hàng.';
  END IF;

  UPDATE public.quotes
     SET sent_to_customer_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 9. Ghi nhận phản hồi của khách hàng (CRM-04)
--
-- Phản hồi luôn đến SAU khi gửi, mà báo giá đã gửi thì policy khoá lại — nên cũng phải là
-- DEFINER kèm kiểm tra quyền tường minh. Đây là ngoại lệ có kiểm soát: chỉ hai cột phản hồi
-- được ghi, giá và điều kiện thương mại vẫn bất biến.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_quote_response(p_quote_id uuid, p_response text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_response IS NULL OR btrim(p_response) = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập nội dung phản hồi của khách hàng.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội hoặc quản lý trực tiếp mới ghi nhận được phản hồi.';
  END IF;

  IF q.sent_to_customer_at IS NULL THEN
    RAISE EXCEPTION 'Báo giá chưa gửi khách hàng nên chưa có phản hồi để ghi nhận.';
  END IF;

  UPDATE public.quotes
     SET customer_response = btrim(p_response), responded_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.record_quote_response(uuid, text) IS
  'Ghi nhận phản hồi của khách hàng với một phiên bản báo giá đã gửi (PRD CRM-04).';
