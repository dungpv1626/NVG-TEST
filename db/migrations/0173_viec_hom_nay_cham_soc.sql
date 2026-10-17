-- ============================================================================
-- Đợt 1 — 1C Việc cần làm hôm nay của Kinh doanh (khối nền K4, doc/KE_HOACH_LAM_HO.md).
--
-- Một định nghĩa duy nhất cho «việc chăm sóc khách đến hạn», dùng ở hai nơi:
--   my_crm_followups(horizon)      — trang Việc cần làm của người đang đăng nhập
--   scan_crm_followup_reminders()  — cron đêm: mỗi người MỘT thông báo tóm tắt mỗi ngày
--                                    (CGD 3.4 — không nhắc từng việc cho loãng chuông)
--
-- Nguồn việc:
--   · Đầu mối của tôi: Mới (liên hệ lần đầu, tính từ ngày ghi), Đã liên hệ (ngày hẹn bước tiếp),
--     M1 Lưu trữ (ngày liên hệ lại).
--   · Cơ hội tôi phụ trách còn mở: dòng nhật ký MỚI NHẤT còn hẹn bước tiếp.
--   · Chăm sóc khách cũ (nhật ký gắn khách hàng, không qua cơ hội / đầu mối): dòng mới nhất mỗi
--     khách × pháp nhân, giao cho người đã ghi dòng đó.
-- Số ngày nhắc «chưa phản hồi» (câu hỏi 16) chưa quyết nên KHÔNG tự đặt — chỉ dựa vào ngày
-- người dùng tự hẹn.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crm_followups_for(p_user uuid, p_until date)
RETURNS TABLE (
  kind text,
  entity_id uuid,
  code text,
  title text,
  action text,
  due_date date,
  company_code text,
  path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lead_items AS (
    SELECT
      CASE l.status WHEN 'moi' THEN 'lead_first_contact'
                    WHEN 'luu_tru' THEN 'lead_recontact'
                    ELSE 'lead_followup' END AS kind,
      l.id AS entity_id, l.code::text AS code, l.full_name AS title,
      CASE l.status WHEN 'moi' THEN 'Liên hệ lần đầu'
                    WHEN 'luu_tru' THEN 'Liên hệ lại — M1 Lưu trữ'
                    ELSE COALESCE(l.next_action, 'Liên hệ tiếp') END AS action,
      CASE l.status WHEN 'moi' THEN (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                    WHEN 'luu_tru' THEN l.recontact_at
                    ELSE l.next_action_at END AS due_date,
      c.code::text AS company_code,
      '/crm/dau-moi/' || l.id AS path
    FROM public.leads l
    JOIN public.companies c ON c.id = l.company_id
    WHERE l.owner_id = p_user
      AND l.deleted_at IS NULL
      AND l.converted_at IS NULL
      AND l.status IN ('moi', 'da_lien_he', 'luu_tru')
  ),
  opp_latest AS (
    SELECT DISTINCT ON (cl.opportunity_id) cl.*
    FROM public.contact_logs cl
    WHERE cl.opportunity_id IS NOT NULL
    ORDER BY cl.opportunity_id, cl.contacted_at DESC, cl.created_at DESC
  ),
  opp_items AS (
    SELECT 'opportunity_followup', o.id, o.code::text, o.name, ol.next_action, ol.next_action_at,
           c.code::text, '/crm/co-hoi/' || o.id || '?tab=cham-soc'
    FROM opp_latest ol
    JOIN public.opportunities o ON o.id = ol.opportunity_id
    JOIN public.companies c ON c.id = o.company_id
    WHERE o.owner_id = p_user
      AND o.deleted_at IS NULL
      AND o.stage NOT IN ('ky_hop_dong', 'mat_co_hoi')
      AND NOT ol.closes_followup
      AND ol.next_action_at IS NOT NULL
  ),
  customer_latest AS (
    SELECT DISTINCT ON (cl.customer_id, cl.company_id) cl.*
    FROM public.contact_logs cl
    WHERE cl.customer_id IS NOT NULL AND cl.opportunity_id IS NULL AND cl.lead_id IS NULL
    ORDER BY cl.customer_id, cl.company_id, cl.contacted_at DESC, cl.created_at DESC
  ),
  customer_items AS (
    SELECT 'customer_followup', k.id, k.code::text, k.name, cl.next_action, cl.next_action_at,
           c.code::text, '/crm/khach-hang/' || k.id || '?tab=cham-soc'
    FROM customer_latest cl
    JOIN public.customers k ON k.id = cl.customer_id AND k.deleted_at IS NULL
    JOIN public.companies c ON c.id = cl.company_id
    WHERE cl.created_by = p_user
      AND NOT cl.closes_followup
      AND cl.next_action_at IS NOT NULL
  )
  SELECT * FROM (
    SELECT * FROM lead_items
    UNION ALL SELECT * FROM opp_items
    UNION ALL SELECT * FROM customer_items
  ) t
  WHERE t.due_date IS NOT NULL AND t.due_date <= p_until
  ORDER BY t.due_date, t.title
$$;

REVOKE ALL ON FUNCTION public.crm_followups_for(uuid, date) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.crm_followups_for(uuid, date) IS
  'Nội bộ — việc chăm sóc khách đến hạn của một người (Đợt 1 — 1C). Trình duyệt gọi my_crm_followups.';

CREATE OR REPLACE FUNCTION public.my_crm_followups(p_horizon_days integer DEFAULT 7)
RETURNS TABLE (
  kind text,
  entity_id uuid,
  code text,
  title text,
  action text,
  due_date date,
  company_code text,
  path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Chỉ việc của CHÍNH người gọi, và chỉ khi còn xem được CRM: người rời phòng Kinh doanh không
  -- còn thấy danh sách khách cũ của mình qua cửa này.
  SELECT f.*
  FROM public.crm_followups_for(
         public.auth_user_id(),
         (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + GREATEST(0, LEAST(COALESCE(p_horizon_days, 7), 60))
       ) f
  WHERE public.auth_can_view_module('CRM')
$$;

REVOKE ALL ON FUNCTION public.my_crm_followups(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_crm_followups(integer) TO authenticated;
COMMENT ON FUNCTION public.my_crm_followups(integer) IS
  'Việc chăm sóc khách của người đang đăng nhập: quá hạn, hôm nay và trong N ngày tới (Đợt 1 — 1C).';

-- Cron đêm (Worker `runScheduledScans`): mỗi người có việc đến hạn / quá hạn nhận ĐÚNG MỘT thông
-- báo tóm tắt trong ngày. Trả số thông báo đã tạo.
CREATE OR REPLACE FUNCTION public.scan_crm_followup_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_user record;
  v_count integer;
  v_overdue integer;
  v_sent integer := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT uid FROM (
      SELECT owner_id AS uid FROM public.leads
      WHERE deleted_at IS NULL AND converted_at IS NULL AND owner_id IS NOT NULL
      UNION SELECT owner_id FROM public.opportunities WHERE deleted_at IS NULL AND owner_id IS NOT NULL
      UNION SELECT created_by FROM public.contact_logs WHERE created_by IS NOT NULL
    ) s
    JOIN public.users u ON u.id = s.uid AND u.is_active AND u.deleted_at IS NULL
  LOOP
    SELECT count(*), count(*) FILTER (WHERE due_date < v_today)
    INTO v_count, v_overdue
    FROM public.crm_followups_for(v_user.uid, v_today);

    CONTINUE WHEN v_count = 0;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = v_user.uid AND n.type = 'crm_followup'
        AND (n.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
    );

    PERFORM public.create_notification(
      v_user.uid, NULL, 'crm_followup',
      format('Hôm nay có %s việc chăm sóc khách cần làm%s.', v_count,
             CASE WHEN v_overdue > 0 THEN format(' (%s việc đã quá hạn)', v_overdue) ELSE '' END),
      NULL, NULL, '/viec-can-lam'
    );
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_crm_followup_reminders() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.scan_crm_followup_reminders() IS
  'Cron đêm — mỗi người một thông báo tóm tắt việc chăm sóc khách đến hạn / quá hạn trong ngày (Đợt 1 — 1C).';
