-- ============================================================================
-- Đợt 3 — 3E: danh sách bất thường cho Kiểm soát nội bộ (doc/KE_HOACH_LAM_HO.md).
--
-- KSNB hiện phải mở từng phân hệ để tìm chỗ quy trình bị đi tắt. Hàm này gom các DẤU HIỆU — không
-- kết luận ai sai (PRD 2.3), chỉ đưa hồ sơ ra để người kiểm soát mở xem:
--   bo_qua_khao_sat     cơ hội bỏ qua khảo sát (ghi lý do — 0160)
--   duyet_sat_han_muc   phê duyệt có giá trị ≥ X % hạn mức của người duyệt lúc duyệt.
--                       X = `ksnb.near_limit_percent` — NVG CHƯA đặt (câu 17) → không có dòng nào,
--                       màn hình ghi «Chưa cấu hình ngưỡng».
--   phat_sinh_khan_cap  phát sinh hợp đồng thực hiện theo lối khẩn cấp (trước khi duyệt / khách xác nhận)
--   chenh_lech_kiem_ke  đợt kiểm kê có mặt hàng đếm lệch sổ
--   moc_tra_lai         mốc thi công bị kiểm lớp 3 trả lại / biên bản mốc không đạt (0182)
--   bien_ban_chua_ky    biên bản nghiệm thu lập quá N ngày chưa ký hai bên.
--                       N = `ksnb.acceptance_unsigned_days` — chưa đặt → không có dòng nào.
-- Mỗi dòng mang đường dẫn tới hồ sơ.
--
-- Quyền: KSNB, Tổng Giám đốc, Ban Giám đốc, Giám đốc Tài chính, Quản trị. Vai khác bị TỪ CHỐI.
-- SECURITY DEFINER (đọc qua nhiều phân hệ) nhưng vẫn lọc theo pháp nhân người xem
-- (`rls_company_access`). Không đọc lương / hồ sơ cá nhân.
-- ============================================================================

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ksnb.near_limit_percent', 'global', NULL, 'Ngưỡng «duyệt sát hạn mức» (%)',
       'Phê duyệt có giá trị từ ngần này phần trăm hạn mức của người duyệt trở lên thì hiện ở danh sách bất thường của Kiểm soát nội bộ. Để trống = chưa cấu hình, không liệt kê.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'ksnb.near_limit_percent' AND p.scope_type = 'global');

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ksnb.acceptance_unsigned_days', 'global', NULL, 'Biên bản lập quá lâu chưa ký (ngày)',
       'Biên bản nghiệm thu lập quá ngần này ngày mà chưa ký hai bên thì hiện ở danh sách bất thường của Kiểm soát nội bộ. Để trống = chưa cấu hình, không liệt kê.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'ksnb.acceptance_unsigned_days' AND p.scope_type = 'global');

CREATE OR REPLACE FUNCTION public.auth_can_see_anomalies()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
      OR public.auth_role_codes()::text[] && ARRAY['KSNB'];
$$;

REVOKE ALL ON FUNCTION public.auth_can_see_anomalies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_can_see_anomalies() TO authenticated;

DROP FUNCTION IF EXISTS public.ksnb_anomalies(uuid);
CREATE OR REPLACE FUNCTION public.ksnb_anomalies(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  kind        text,
  company_id  uuid,
  company_code text,
  entity_type text,
  entity_id   uuid,
  code        text,
  title       text,
  detail      text,
  occurred_at timestamptz,
  link        text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_pct  numeric := public.system_parameter_number('ksnb.near_limit_percent');
  v_days numeric := public.system_parameter_number('ksnb.acceptance_unsigned_days');
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF NOT public.auth_can_see_anomalies() THEN
    RAISE EXCEPTION 'Danh sách bất thường chỉ dành cho Kiểm soát nội bộ và Ban Giám đốc.';
  END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT 'bo_qua_khao_sat'::text AS kind, o.company_id, 'opportunities'::text AS entity_type, o.id AS entity_id,
           o.code::text AS code, o.name AS title, 'Lý do bỏ qua khảo sát: ' || o.survey_waived_reason AS detail,
           o.updated_at AS occurred_at, '/crm/co-hoi/' || o.id AS link
      FROM public.opportunities o
     WHERE o.deleted_at IS NULL AND o.survey_waived_reason IS NOT NULL
    UNION ALL
    SELECT 'duyet_sat_han_muc', ap.company_id, ap.entity_type::text, ap.entity_id,
           ap.entity_code::text, ap.title,
           format('Giá trị %s đồng = %s%% hạn mức %s đồng của %s',
                  replace(to_char(ap.amount, 'FM999,999,999,999'), ',', '.'),
                  round(ap.amount * 100.0 / d.approver_limit_at_time),
                  replace(to_char(d.approver_limit_at_time, 'FM999,999,999,999'), ',', '.'),
                  COALESCE((SELECT u.full_name FROM public.users u WHERE u.id = d.decided_by), 'người duyệt')),
           d.decided_at,
           CASE ap.entity_type
             WHEN 'contracts' THEN '/hd/hop-dong/' || ap.entity_id
             WHEN 'payment_requests' THEN '/kt/de-nghi-thanh-toan/' || ap.entity_id
             WHEN 'purchase_requests' THEN '/mh/de-nghi-mua/' || ap.entity_id
             WHEN 'contract_amendments' THEN COALESCE((SELECT '/hd/hop-dong/' || a.contract_id || '?tab=phat-sinh'
                                                         FROM public.contract_amendments a WHERE a.id = ap.entity_id), '/hd/hop-dong')
             WHEN 'quotes' THEN COALESCE((SELECT '/crm/co-hoi/' || q.opportunity_id || '?tab=bao-gia'
                                            FROM public.quotes q WHERE q.id = ap.entity_id), '/crm/co-hoi')
             ELSE '/phe-duyet'
           END
      FROM public.approval_decisions d
      JOIN public.approvals ap ON ap.id = d.approval_id
     WHERE v_pct IS NOT NULL AND d.decision = 'approved' AND ap.deleted_at IS NULL
       AND NOT d.approver_unlimited AND COALESCE(d.approver_limit_at_time, 0) > 0
       AND ap.amount IS NOT NULL AND ap.amount * 100 >= d.approver_limit_at_time * v_pct
    UNION ALL
    SELECT 'phat_sinh_khan_cap', a.company_id, 'contract_amendments', a.id, a.code::text, a.title,
           format('Thực hiện khẩn cấp%s%s — %s đồng',
                  COALESCE(', người cho phép: ' || (SELECT u.full_name FROM public.users u WHERE u.id = a.emergency_authorized_by), ''),
                  COALESCE(', lý do: ' || a.emergency_reason, ''),
                  replace(to_char(a.value_change, 'FM999,999,999,999'), ',', '.')),
           COALESCE(a.executed_at, a.requested_at),
           '/hd/hop-dong/' || a.contract_id || '?tab=phat-sinh'
      FROM public.contract_amendments a
     WHERE a.deleted_at IS NULL AND a.is_emergency
    UNION ALL
    SELECT 'chenh_lech_kiem_ke', st.company_id, 'stocktakes', st.id, st.code::text,
           'Kiểm kê ' || COALESCE(w.name, ''),
           format('%s mặt hàng đếm lệch sổ%s', x.n, COALESCE('; giải trình: ' || st.variance_reason, '')),
           COALESCE(st.counted_at, st.started_at), '/kho/kiem-ke'
      FROM public.stocktakes st
      JOIN LATERAL (SELECT count(*) AS n FROM public.stocktake_items i
                     WHERE i.stocktake_id = st.id AND i.counted_quantity IS NOT NULL
                       AND i.counted_quantity <> i.book_quantity) x ON x.n > 0
      LEFT JOIN public.warehouses w ON w.id = st.warehouse_id
     WHERE st.deleted_at IS NULL AND st.status <> 'huy'
    UNION ALL
    SELECT 'moc_tra_lai', e.company_id, 'construction_sites', s.id, s.code::text,
           format('Mốc «%s»', sm.label),
           CASE e.event WHEN 'tra_lai' THEN 'Kiểm lớp 3 trả lại' ELSE 'Biên bản mốc không đạt' END
             || COALESCE(': ' || e.note, '')
             || COALESCE(' — ' || (SELECT u.full_name FROM public.users u WHERE u.id = e.actor_id), ''),
           e.created_at, '/tc/cong-trinh/' || s.id || '?tab=moc'
      FROM public.site_milestone_events e
      JOIN public.site_milestones sm ON sm.id = e.site_milestone_id
      JOIN public.construction_sites s ON s.id = sm.construction_site_id
     WHERE e.event IN ('tra_lai', 'khong_dat') AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'bien_ban_chua_ky', ar.company_id, 'acceptance_records', ar.id, ar.code::text,
           ar.stage_name,
           format('Lập %s, %s ngày chưa ký hai bên — công trình %s',
                  to_char(ar.accepted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY'),
                  (current_date - (ar.accepted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), s.code),
           ar.accepted_at, '/tc/cong-trinh/' || s.id || '?tab=nghiem-thu'
      FROM public.acceptance_records ar
      JOIN public.construction_sites s ON s.id = ar.construction_site_id
     WHERE v_days IS NOT NULL AND ar.deleted_at IS NULL AND ar.status = 'da_nghiem_thu'
       AND ar.signed_at IS NULL AND ar.acceptance_type IN ('khach_hang', 'thau_phu')
       AND ar.accepted_at < now() - make_interval(days => v_days::int)
  )
  SELECT r.kind, r.company_id, c.code::text, r.entity_type, r.entity_id, r.code, r.title, r.detail,
         r.occurred_at, r.link
    FROM rows r
    JOIN public.companies c ON c.id = r.company_id
   WHERE public.rls_company_access(r.company_id)
     AND (p_company_id IS NULL OR r.company_id = p_company_id)
   ORDER BY r.occurred_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.ksnb_anomalies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ksnb_anomalies(uuid) TO authenticated;
