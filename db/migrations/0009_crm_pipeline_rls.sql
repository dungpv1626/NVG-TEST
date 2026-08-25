-- ============================================================================
-- RLS và quy tắc nghiệp vụ cho pipeline CRM
-- ============================================================================

ALTER TABLE public.opportunities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_stage_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_surveys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints                 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.opportunities             FROM anon;
REVOKE ALL ON public.opportunity_stage_history FROM anon;
REVOKE ALL ON public.site_surveys              FROM anon;
REVOKE ALL ON public.quotes                    FROM anon;
REVOKE ALL ON public.complaints                FROM anon;


-- ----------------------------------------------------------------------------
-- 1. opportunities — MẪU A + B (Backend Schema 4.2, ghi chú)
--
-- "opportunities dùng Mẫu B khi còn ở trạng thái nháp (chỉ người phụ trách sửa),
--  chuyển sang Mẫu A sau khi bàn giao (cả công ty xem được, chỉ xem)."
--
-- Diễn giải khi triển khai: XEM luôn theo Mẫu A (cả pháp nhân thấy) — vì CRM-06 yêu cầu bàn
-- giao kèm toàn bộ lịch sử, và giấu cơ hội với đồng nghiệp cùng công ty sẽ tái tạo đúng
-- vướng mắc #5 ("phải hỏi đi hỏi lại mới đủ thông tin"). SỬA theo Mẫu B.
-- ----------------------------------------------------------------------------

CREATE POLICY opportunities_select ON public.opportunities
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id));

CREATE POLICY opportunities_insert ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND EXISTS (
      SELECT 1 FROM public.user_companies uc
      JOIN public.permissions p ON p.role_id = uc.role_id
      WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
        AND p.module_code = 'CRM' AND p.can_create
    )
  );

-- Sau khi BÀN GIAO, cơ hội chuyển chế độ chỉ xem (CRM-06) — kể cả với người phụ trách.
-- Đây là điểm mấu chốt: hồ sơ đã bàn giao mà còn sửa được thì bên nhận không thể tin
-- vào dữ liệu mình vừa nhận.
CREATE POLICY opportunities_update ON public.opportunities
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND handed_over_at IS NULL
    AND public.rls_owner_can_write(company_id, owner_id)
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 2. opportunity_stage_history — chỉ đọc từ trình duyệt
--
-- Lịch sử chỉ được ghi qua hàm `move_opportunity_stage` bên dưới, để không thể tạo
-- lịch sử giả hoặc đổi giai đoạn mà quên ghi vết (NEN-03).
-- ----------------------------------------------------------------------------

CREATE POLICY opportunity_stage_history_select ON public.opportunity_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id AND public.rls_company_access(o.company_id)
    )
  );


-- ----------------------------------------------------------------------------
-- 3. site_surveys / complaints — thừa hưởng phạm vi pháp nhân
-- ----------------------------------------------------------------------------

CREATE POLICY site_surveys_select ON public.site_surveys
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id AND public.rls_company_access(o.company_id)
    )
  );

CREATE POLICY site_surveys_write ON public.site_surveys
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id
        AND o.handed_over_at IS NULL
        AND public.rls_owner_can_write(o.company_id, o.owner_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_id AND public.rls_company_access(o.company_id)
    )
  );

CREATE POLICY complaints_select ON public.complaints
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id));

CREATE POLICY complaints_write ON public.complaints
  FOR ALL TO authenticated
  USING (deleted_at IS NULL AND public.rls_owner_can_write(company_id, assignee_id))
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 4. quotes — MẪU C (theo hạn mức phê duyệt)
--
-- PRD CRM-04: báo giá phải qua phê duyệt nội bộ TRƯỚC KHI GỬI khách hàng.
-- PRD CRM-05: giảm giá đặc biệt do Tổng Giám đốc duyệt.
-- ----------------------------------------------------------------------------

CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_company_access(company_id));

CREATE POLICY quotes_insert ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_company_access(company_id));

-- Báo giá ĐÃ GỬI khách hàng thì không sửa được nữa — muốn đổi giá phải phát hành phiên bản
-- mới, để lịch sử báo giá đã gửi luôn trung thực (CRM-04: "theo dõi CÁC PHIÊN BẢN báo giá
-- đã gửi khách hàng và phản hồi").
CREATE POLICY quotes_update ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND sent_to_customer_at IS NULL
    AND public.rls_company_access(company_id)
  )
  WITH CHECK (public.rls_company_access(company_id));


-- ----------------------------------------------------------------------------
-- 5. Chuyển giai đoạn pipeline — ghi lịch sử trong cùng giao dịch
--
-- Đổi giai đoạn và ghi lịch sử PHẢI đi liền nhau. Nếu để ứng dụng gọi hai lệnh riêng,
-- một lần lỗi mạng giữa chừng sẽ tạo ra cơ hội đã đổi giai đoạn nhưng không có vết —
-- đúng thứ NEN-03 cấm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_opportunity_stage(
  p_opportunity_id uuid,
  p_to_stage opportunity_stage,
  p_note text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER          -- giữ RLS: người gọi phải có quyền sửa cơ hội
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  v_from  opportunity_stage;
  v_handed timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT stage, handed_over_at INTO v_from, v_handed
  FROM public.opportunities
  WHERE id = p_opportunity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội, hoặc không có quyền truy cập.';
  END IF;

  IF v_handed IS NOT NULL THEN
    RAISE EXCEPTION 'Cơ hội đã bàn giao nên không đổi được giai đoạn.';
  END IF;

  IF v_from = p_to_stage THEN
    RETURN; -- không có gì thay đổi
  END IF;

  -- CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội" — không cho bỏ trống.
  IF p_to_stage = 'mat_co_hoi' AND (p_lost_reason IS NULL OR btrim(p_lost_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân mất cơ hội.';
  END IF;

  UPDATE public.opportunities
     SET stage       = p_to_stage,
         lost_reason = CASE WHEN p_to_stage = 'mat_co_hoi' THEN p_lost_reason ELSE lost_reason END,
         updated_at  = now(),
         updated_by  = v_user
   WHERE id = p_opportunity_id;

  INSERT INTO public.opportunity_stage_history
    (opportunity_id, from_stage, to_stage, note, changed_by)
  VALUES (p_opportunity_id, v_from, p_to_stage, p_note, v_user);
END;
$$;

COMMENT ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, text, text) IS
  'Chuyển giai đoạn pipeline và ghi lịch sử trong cùng một giao dịch (PRD CRM-02, NEN-03).';


-- Ghi lịch sử cho giai đoạn ĐẦU TIÊN khi cơ hội vừa được tạo, để phễu bán hàng (CRM-09)
-- có đủ mốc thời gian tính tỷ lệ chuyển đổi.
CREATE OR REPLACE FUNCTION public.log_initial_opportunity_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.opportunity_stage_history
    (opportunity_id, from_stage, to_stage, note, changed_by)
  VALUES (NEW.id, NULL, NEW.stage, 'Khởi tạo cơ hội', NEW.created_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER opportunities_log_initial_stage
  AFTER INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.log_initial_opportunity_stage();


-- ----------------------------------------------------------------------------
-- 6. Gửi báo giá cho khách hàng — chặn nếu chưa phê duyệt nội bộ (CRM-04)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_quote_to_customer(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v_status   status_group;
  v_sent     timestamptz;
  v_discount bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT status, sent_to_customer_at, discount_amount
    INTO v_status, v_sent, v_discount
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá, hoặc không có quyền truy cập.';
  END IF;

  IF v_sent IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã được gửi cho khách hàng.';
  END IF;

  -- PRD CRM-04: "báo giá phải qua phê duyệt nội bộ trước khi gửi".
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Báo giá chưa được phê duyệt nội bộ nên chưa gửi được cho khách hàng.';
  END IF;

  UPDATE public.quotes
     SET sent_to_customer_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.send_quote_to_customer(uuid) IS
  'Đánh dấu báo giá đã gửi khách hàng. Chặn nếu chưa qua phê duyệt nội bộ (PRD CRM-04).';
