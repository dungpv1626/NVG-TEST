-- 0162 — Chặng Báo giá → Đàm phán: biết đang chờ AI duyệt, và giá đã tới tay khách thì cơ hội tự
-- sang Đàm phán.
--
-- Chạy thử chuỗi bước sau phản hồi chủ dự án (doc/MOC_CAI_TIEN_UX.md): gửi báo giá đi duyệt thì
-- thẻ chỉ ghi «Chờ duyệt» — không nói ai đang giữ, chờ bao lâu (AFD 4.7: bước hiện tại, AI giữ,
-- chờ bao lâu). Gửi báo giá cho khách xong thì vẫn phải tự đi tìm nút «Chuyển sang Đàm phán».
--
--  1. `approval_waiting_on(approval_id)` — vai trò và người đang giữ một phê duyệt chờ, cùng
--     cách tính với `site_request_tracker` (0134): mọi vai trò có hạn mức ĐỦ cho số tiền
--     (`decide_approval` cho bất kỳ ai trong số đó duyệt), bậc thấp xếp trước; bỏ người gửi
--     (0156 không cho tự duyệt). Không lọc theo `current_step`: báo giá 120 triệu nằm trong hạn
--     mức bậc 1 của Kinh doanh, mà người Kinh doanh duy nhất của pháp nhân là người gửi — lọc
--     theo bậc thì ra danh sách rỗng trong khi TGĐ vẫn duyệt được. Dùng chung mọi loại phê duyệt.
--  2. Trigger đồng bộ: báo giá đang hiệu lực được gửi khách / gói thầu được nộp / phương án thiết
--     kế gửi khách duyệt → cơ hội đang ở «Báo giá» sang «Đàm phán». Đúng điều kiện `offer_sent`
--     của `stage_readiness`. Chỉ từ «Báo giá»: cơ hội chưa phân loại / chưa khảo sát không được
--     nhảy qua nhờ hồ sơ liên kết.
--  3. Báo người phụ trách cơ hội khi báo giá được duyệt / bị từ chối — trước đây không ai báo.
--  4. Lập phiên bản báo giá mới thì đóng phê duyệt đang chờ của bản cũ.

-- --- 1. Ai đang giữ một phê duyệt ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approval_waiting_on(p_approval_id uuid)
RETURNS TABLE (role_labels text[], user_names text[], waiting_since timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
BEGIN
  SELECT id, company_id, subject, amount, current_step, status, requested_by, requested_at,
         deleted_at
    INTO a
    FROM public.approvals WHERE id = p_approval_id;

  -- Chỉ trả cho người xem được pháp nhân của hồ sơ, và chỉ khi còn đang chờ.
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.status <> 'pending_approval'
     OR NOT public.rls_company_access(a.company_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH roles_ok AS (
    SELECT al.role_id, min(al.step) AS step
      FROM public.approval_limits al
     WHERE al.subject = a.subject AND al.is_active
       AND (al.company_id IS NULL OR al.company_id = a.company_id)
       AND (al.max_amount IS NULL OR a.amount IS NULL OR al.max_amount >= a.amount)
     GROUP BY al.role_id
  ),
  people AS (
    SELECT ro.step, r.label::text AS role_label, u.full_name::text AS full_name
      FROM roles_ok ro
      JOIN public.roles r ON r.id = ro.role_id
      JOIN public.user_companies uc ON uc.role_id = ro.role_id AND uc.deleted_at IS NULL
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE (uc.company_id = a.company_id OR r.sees_all_companies)
       AND u.id IS DISTINCT FROM a.requested_by
  )
  SELECT COALESCE((SELECT array_agg(x.role_label ORDER BY x.step)
                      FROM (SELECT p.role_label, min(p.step) AS step FROM people p
                             GROUP BY p.role_label) x), ARRAY[]::text[]),
         COALESCE((SELECT array_agg(y.full_name ORDER BY y.step, y.full_name)
                      FROM (SELECT p.full_name, min(p.step) AS step FROM people p
                             GROUP BY p.full_name) y), ARRAY[]::text[]),
         a.requested_at;
END;
$$;

COMMENT ON FUNCTION public.approval_waiting_on(uuid) IS
  'Phê duyệt đang chờ ai (0162): vai trò có hạn mức đủ ở bước hiện tại, tên người trong vai '
  'trò (trừ người gửi), chờ từ lúc nào. Mẫu theo dõi AFD 4.7, cùng cách tính site_request_tracker.';

REVOKE ALL ON FUNCTION public.approval_waiting_on(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_waiting_on(uuid) TO authenticated;

-- --- 2. Giá đã tới tay khách → cơ hội sang Đàm phán ------------------------------------------
CREATE OR REPLACE FUNCTION public._offer_sent_to_negotiation(p_opportunity_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_opportunity_id IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.opportunities
              WHERE id = p_opportunity_id AND stage = 'bao_gia' AND deleted_at IS NULL) THEN
    PERFORM public._sync_opportunity_stage(p_opportunity_id, 'dam_phan', p_note);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._offer_sent_to_negotiation(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quotes_sent_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sent_to_customer_at IS NOT NULL AND OLD.sent_to_customer_at IS NULL
     AND NEW.is_current_version AND NEW.deleted_at IS NULL THEN
    PERFORM public._offer_sent_to_negotiation(
      NEW.opportunity_id, 'Báo giá ' || COALESCE(NEW.code, '') || ' đã gửi khách');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quotes_sent_sync_opportunity ON public.quotes;
CREATE TRIGGER quotes_sent_sync_opportunity
  AFTER UPDATE OF sent_to_customer_at ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_sent_sync_opportunity();

CREATE OR REPLACE FUNCTION public.bidding_submitted_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'nop_thau' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM public._offer_sent_to_negotiation(
      NEW.opportunity_id, 'Gói thầu ' || COALESCE(NEW.code, '') || ' đã nộp');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bidding_submitted_sync_opportunity ON public.bidding_projects;
CREATE TRIGGER bidding_submitted_sync_opportunity
  AFTER UPDATE OF stage ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.bidding_submitted_sync_opportunity();

CREATE OR REPLACE FUNCTION public.design_offer_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage = 'cho_khach_duyet' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM public._offer_sent_to_negotiation(
      NEW.opportunity_id, 'Phương án thiết kế ' || COALESCE(NEW.code, '') || ' đã gửi khách duyệt');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS design_offer_sync_opportunity ON public.design_projects;
CREATE TRIGGER design_offer_sync_opportunity
  AFTER UPDATE OF stage ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.design_offer_sync_opportunity();

-- --- 3. Báo kết quả duyệt báo giá cho người phụ trách cơ hội ---------------------------------
-- `decide_approval` báo người gửi với đề nghị mua, đơn nghỉ… nhưng KHÔNG với báo giá: người
-- Kinh doanh không biết báo giá đã duyệt để gửi khách. Trigger trên bảng, không chép lại
-- `decide_approval` (bài học 0086).
CREATE OR REPLACE FUNCTION public.quotes_decision_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  -- Chỉ bản đang hiệu lực: bản cũ bị thay bằng phiên bản mới về Nháp ở mục 4, không phải
  -- «bị từ chối», không báo.
  IF OLD.status = 'pending_approval' AND NEW.status IN ('completed', 'draft')
     AND NEW.is_current_version THEN
    SELECT id, owner_id INTO o FROM public.opportunities WHERE id = NEW.opportunity_id;
    IF o.owner_id IS NOT NULL THEN
      PERFORM public.create_notification(
        o.owner_id, NEW.company_id,
        CASE WHEN NEW.status = 'completed' THEN 'quote_approved' ELSE 'quote_rejected' END,
        CASE WHEN NEW.status = 'completed'
             THEN format('Báo giá %s đã được phê duyệt — gửi cho khách hàng.', COALESCE(NEW.code, ''))
             ELSE format('Báo giá %s bị từ chối — xem lý do và lập phiên bản mới.', COALESCE(NEW.code, ''))
        END,
        'opportunities', o.id,
        format('/crm/co-hoi/%s?tab=bao-gia', o.id)
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quotes_decision_notify ON public.quotes;
CREATE TRIGGER quotes_decision_notify
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_decision_notify();

-- --- 4. Lập phiên bản mới thì đóng phê duyệt đang chờ của bản cũ ------------------------------
-- Thấy thật khi chạy thử: phiên bản 1 còn «Chờ duyệt» sau khi đã có phiên bản 2 — người duyệt
-- vẫn thấy một báo giá không còn hiệu lực trong Hộp thư, duyệt nhầm là duyệt một giá đã bỏ.
-- Cùng cách `cancel_payment_request` (0043): một dòng lịch sử đứng tên người lập bản mới, hồ sơ
-- rời Hộp thư. Bản cũ về Nháp (không phải «bị từ chối» — không ai từ chối nó).
CREATE OR REPLACE FUNCTION public._close_superseded_quote_approval(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT a.id, a.current_step, 'rejected',
         'Đã lập phiên bản báo giá mới — phiên bản này không cần duyệt nữa.',
         public.auth_user_id()
    FROM public.approvals a
   WHERE a.entity_type = 'quotes' AND a.entity_id = p_quote_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  UPDATE public.approvals
     SET status = 'completed', final_decision = 'rejected', decided_at = now(), updated_at = now()
   WHERE entity_type = 'quotes' AND entity_id = p_quote_id
     AND status = 'pending_approval' AND deleted_at IS NULL;

  UPDATE public.quotes SET status = 'draft', updated_at = now()
   WHERE id = p_quote_id AND status = 'pending_approval';
END;
$$;

REVOKE ALL ON FUNCTION public._close_superseded_quote_approval(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quotes_superseded_close_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_current_version AND NOT NEW.is_current_version AND NEW.status = 'pending_approval' THEN
    PERFORM public._close_superseded_quote_approval(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS quotes_superseded_close_approval ON public.quotes;
CREATE TRIGGER quotes_superseded_close_approval
  AFTER UPDATE OF is_current_version ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_superseded_close_approval();

-- Dọn những bản cũ đã lỡ kẹt «Chờ duyệt» trước migration này.
SELECT public._close_superseded_quote_approval(q.id)
  FROM public.quotes q
 WHERE NOT q.is_current_version AND q.status = 'pending_approval' AND q.deleted_at IS NULL;
