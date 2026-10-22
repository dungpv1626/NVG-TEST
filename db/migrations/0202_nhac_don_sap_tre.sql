-- ============================================================================
-- Đợt 4 — 4C. Nhắc đơn đặt hàng sắp trễ / trễ hẹn giao.
--
-- So ngày hẹn giao (`purchase_orders.promised_date`) với HÔM NAY theo giờ Việt Nam, cho đơn còn
-- chờ hàng (Đã đặt / Đang giao):
--   · quá hẹn hoặc đến hạn hôm nay → LUÔN báo;
--   · «sắp tới hạn» chỉ báo khi NVG đã đặt tham số `mh.order_due_soon_days` (để TRỐNG — CLAUDE.md
--     5.2: con số NVG chưa quyết thì không tự đặt).
-- Người nhận: Mua hàng của pháp nhân + người lập đơn + chỉ huy trưởng của công trình nhận hàng
-- (`construction_sites.responsible_user_id`). Mỗi người mỗi đơn tối đa MỘT thông báo một ngày.
-- Chạy bằng cron đêm sẵn có của Worker (`runScheduledScans`, cùng cách 1C).
-- ============================================================================

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'mh.order_due_soon_days', 'global', NULL, 'Báo trước hẹn giao đơn hàng (ngày)',
       'Đơn đặt hàng còn bấy nhiêu ngày tới hẹn giao thì báo Mua hàng và chỉ huy trưởng. Để trống = chỉ báo khi đến hạn hôm nay hoặc đã quá hẹn.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'mh.order_due_soon_days' AND p.scope_type = 'global'
);


-- ----------------------------------------------------------------------------
-- 1. Danh sách đơn sắp trễ / trễ hẹn
--
-- Phạm vi viết tường minh, đúng điều kiện đọc đề nghị mua (0134): Mẫu A theo pháp nhân + quyền xem
-- MH, Mẫu E cho chỉ huy trưởng — chỉ thấy đơn giao về công trình được giao. (Chính sách của bảng
-- `purchase_orders` hiện chỉ là Mẫu A; danh sách này không mở rộng thêm lỗ đó.)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.purchase_order_due_list();

CREATE FUNCTION public.purchase_order_due_list()
RETURNS TABLE (
  order_id          uuid,
  order_code        text,
  company_id        uuid,
  company_code      text,
  stage             public.purchase_order_stage,
  supplier_name     text,
  request_id        uuid,
  request_code      text,
  request_title     text,
  site_id           uuid,
  site_code         text,
  site_name         text,
  promised_date     date,
  days_left         integer,
  due_state         text,
  total_value       bigint,
  soon_days_setting numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
           public.system_parameter_number('mh.order_due_soon_days') AS soon
  )
  SELECT po.id, po.code::text, po.company_id, c.code::text, po.stage, s.name,
         pr.id, pr.code::text, pr.title, cs.id, cs.code::text, cs.name,
         po.promised_date,
         (po.promised_date - cfg.today)::integer,
         CASE
           WHEN po.promised_date < cfg.today THEN 'qua_han'
           WHEN po.promised_date = cfg.today THEN 'hom_nay'
           ELSE 'sap_toi'
         END,
         po.total_value,
         cfg.soon
    FROM public.purchase_orders po
    CROSS JOIN cfg
    JOIN public.purchase_requests pr ON pr.id = po.purchase_request_id AND pr.deleted_at IS NULL
    JOIN public.companies c ON c.id = po.company_id
    JOIN public.suppliers s ON s.id = po.supplier_id
    LEFT JOIN public.construction_sites cs ON cs.id = pr.construction_site_id
   WHERE po.deleted_at IS NULL
     AND po.stage IN ('da_dat', 'dang_giao')
     AND po.promised_date IS NOT NULL
     AND (po.promised_date <= cfg.today
          OR (cfg.soon IS NOT NULL AND po.promised_date - cfg.today <= cfg.soon))
     AND public.auth_can_view_module('MH')
     AND public.rls_company_access(po.company_id)
     AND (pr.construction_site_id IS NULL OR public.rls_site_in_scope(pr.construction_site_id))
   ORDER BY po.promised_date, po.code;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_due_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_order_due_list() TO authenticated;

COMMENT ON FUNCTION public.purchase_order_due_list() IS
  '4C: đơn đặt hàng còn chờ hàng đã quá hẹn / đến hạn hôm nay (và sắp tới hạn nếu đã đặt mh.order_due_soon_days). Phạm vi: Mẫu A + Mẫu E.';


-- ----------------------------------------------------------------------------
-- 2. Quét đêm — báo Mua hàng, người lập đơn, chỉ huy trưởng công trình nhận hàng
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_purchase_order_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_soon  numeric := public.system_parameter_number('mh.order_due_soon_days');
  o       record;
  v_uid   uuid;
  v_msg   text;
  v_sent  integer := 0;
BEGIN
  FOR o IN
    SELECT po.id, po.code, po.company_id, po.promised_date, po.created_by,
           s.name AS supplier_name, cs.code AS site_code, cs.responsible_user_id
      FROM public.purchase_orders po
      JOIN public.purchase_requests pr ON pr.id = po.purchase_request_id AND pr.deleted_at IS NULL
      JOIN public.suppliers s ON s.id = po.supplier_id
      LEFT JOIN public.construction_sites cs ON cs.id = pr.construction_site_id AND cs.deleted_at IS NULL
     WHERE po.deleted_at IS NULL
       AND po.stage IN ('da_dat', 'dang_giao')
       AND po.promised_date IS NOT NULL
       AND (po.promised_date <= v_today
            OR (v_soon IS NOT NULL AND po.promised_date - v_today <= v_soon))
  LOOP
    v_msg := CASE
      WHEN o.promised_date < v_today THEN format(
        'Đơn hàng %s (%s) đã quá hẹn giao %s ngày — hẹn %s%s. Liên hệ nhà cung cấp hoặc cập nhật ngày giao.',
        o.code, o.supplier_name, v_today - o.promised_date, to_char(o.promised_date, 'DD/MM/YYYY'),
        CASE WHEN o.site_code IS NOT NULL THEN ', công trình ' || o.site_code ELSE '' END)
      WHEN o.promised_date = v_today THEN format(
        'Đơn hàng %s (%s) đến hạn giao hôm nay%s.',
        o.code, o.supplier_name,
        CASE WHEN o.site_code IS NOT NULL THEN ' về công trình ' || o.site_code ELSE '' END)
      ELSE format(
        'Đơn hàng %s (%s) còn %s ngày tới hẹn giao %s%s.',
        o.code, o.supplier_name, o.promised_date - v_today, to_char(o.promised_date, 'DD/MM/YYYY'),
        CASE WHEN o.site_code IS NOT NULL THEN ', công trình ' || o.site_code ELSE '' END)
    END;

    FOR v_uid IN
      SELECT DISTINCT r.uid FROM (
        SELECT uc.user_id AS uid
          FROM public.user_companies uc
          JOIN public.roles ro ON ro.id = uc.role_id
         WHERE uc.deleted_at IS NULL AND ro.code = 'MH'
           AND (uc.company_id = o.company_id OR ro.sees_all_companies)
        UNION SELECT o.created_by
        UNION SELECT o.responsible_user_id
      ) r
      JOIN public.users u ON u.id = r.uid AND u.is_active AND u.deleted_at IS NULL
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_uid AND n.type = 'purchase_order_due'
           AND n.related_entity_id = o.id
           AND (n.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = v_today
      );
      PERFORM public.create_notification(
        v_uid, o.company_id, 'purchase_order_due', v_msg,
        'purchase_orders', o.id, format('/mh/don-hang/%s', o.id)
      );
      v_sent := v_sent + 1;
    END LOOP;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_purchase_order_due_reminders() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.scan_purchase_order_due_reminders() IS
  'Cron đêm (4C): báo Mua hàng, người lập đơn và chỉ huy trưởng công trình về đơn hàng quá hẹn / đến hạn hôm nay / sắp tới hạn (nếu đã đặt mh.order_due_soon_days). Mỗi người mỗi đơn một thông báo một ngày.';
