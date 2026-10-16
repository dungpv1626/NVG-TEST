/**
 * Tổng quan điều hành — tách theo TỪNG CÔNG TY (phản hồi chủ dự án sau GĐ2).
 *
 * «Tổng giám đốc nắm cả 3 công ty»: trang 0169 gộp mọi pháp nhân thành một con số, muốn biết NVC
 * hay NVO đang có vấn đề phải đổi bộ chọn pháp nhân rồi tự so trong đầu; và không có chỉ số kinh
 * doanh riêng cho ba mảng rất khác nhau (nhà xưởng, giàn giáo, nhà ở). Chủ dự án chọn: một trang,
 * ba công ty đặt cạnh nhau.
 *
 *  1. `exec_overview_by_company` — gọi `exec_overview` (0169) cho từng pháp nhân giao dịch (bỏ mã
 *     tổng hợp NVG, CLAUDE.md 3.5). Một quy tắc duy nhất cho cả ô gộp lẫn ô từng công ty.
 *  2. `exec_company_pulse` — hoạt động đang chạy của từng công ty: cơ hội đang mở, hợp đồng đang
 *     thực hiện, công trình đang làm, hồ sơ thiết kế, giàn giáo đang cho thuê, lệnh sản xuất. Không
 *     gán cứng «NVC là nhà xưởng»: mỗi công ty trả đủ các chỉ số, trang chỉ hiện chỉ số có hoạt động.
 *
 * Cùng cửa vào với 0169: lãnh đạo và Kiểm soát nội bộ.
 */

CREATE OR REPLACE FUNCTION public.exec_overview_by_company(
  p_stale_days     integer DEFAULT NULL,
  p_hr_notice_days integer DEFAULT NULL
)
RETURNS TABLE (
  company_id   uuid,
  company_code text,
  company_name text,
  key          text,
  area         text,
  label        text,
  level        text,
  total        integer,
  amount       bigint,
  link         text,
  note         text,
  items        jsonb
)
LANGUAGE plpgsql
-- Không STABLE: exec_overview gọi sites_budget_status, hàm đó ghi nhật ký truy cập (NEN-07).
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- exec_overview tự kiểm vai trò; gọi trước một lần để lỗi quyền nói đúng câu của nó.
  PERFORM 1 FROM public.exec_overview(NULL, p_stale_days, p_hr_notice_days) LIMIT 1;

  RETURN QUERY
  SELECT c.id, c.code::text, c.short_name::text,
         e.key, e.area, e.label, e.level, e.total, e.amount, e.link, e.note, e.items
    FROM public.companies c
   CROSS JOIN LATERAL public.exec_overview(c.id, p_stale_days, p_hr_notice_days) e
   WHERE c.code::text <> 'NVG'
   ORDER BY c.display_order, c.code;
END;
$$;

COMMENT ON FUNCTION public.exec_overview_by_company(integer, integer) IS
  'Cảnh báo điều hành tách theo từng pháp nhân giao dịch (0170) — cùng quy tắc với exec_overview.';

REVOKE ALL ON FUNCTION public.exec_overview_by_company(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exec_overview_by_company(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.exec_company_pulse()
RETURNS TABLE (
  company_id   uuid,
  company_code text,
  company_name text,
  metric       text,
  label        text,
  total        integer,
  amount       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
          OR public.auth_role_codes()::text[] && ARRAY['KSNB']) THEN
    RAISE EXCEPTION 'Chỉ Ban Giám đốc và Kiểm soát nội bộ xem được Tổng quan điều hành.';
  END IF;

  RETURN QUERY
  WITH co AS (
    SELECT c.id, c.code::text AS code, c.short_name::text AS name, c.display_order
      FROM public.companies c WHERE c.code::text <> 'NVG'
  ),
  m AS (
    SELECT o.company_id AS cid, 'opportunities_open'::text AS metric, 1 AS ord,
           'Cơ hội đang theo đuổi'::text AS label, count(*)::int AS total,
           COALESCE(sum(o.estimated_value), 0)::bigint AS amount
      FROM public.opportunities o
     WHERE o.deleted_at IS NULL AND o.stage NOT IN ('ky_hop_dong', 'mat_co_hoi')
     GROUP BY o.company_id
    UNION ALL
    SELECT ct.company_id, 'contracts_active', 2, 'Hợp đồng đang thực hiện', count(*)::int,
           COALESCE(sum(ct.value), 0)::bigint
      FROM public.contracts ct
     WHERE ct.deleted_at IS NULL AND ct.stage = 'da_ky'
     GROUP BY ct.company_id
    UNION ALL
    SELECT ct.company_id, 'contracts_pending', 3, 'Hợp đồng chờ duyệt / chờ ký', count(*)::int,
           COALESCE(sum(ct.value), 0)::bigint
      FROM public.contracts ct
     WHERE ct.deleted_at IS NULL AND ct.stage IN ('cho_duyet', 'da_duyet')
     GROUP BY ct.company_id
    UNION ALL
    SELECT s.company_id, 'sites_active', 4, 'Công trình đang triển khai', count(*)::int, NULL::bigint
      FROM public.construction_sites s
     WHERE s.deleted_at IS NULL AND s.stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu')
     GROUP BY s.company_id
    UNION ALL
    SELECT s.company_id, 'sites_warranty', 5, 'Công trình trong bảo hành', count(*)::int, NULL::bigint
      FROM public.construction_sites s
     WHERE s.deleted_at IS NULL AND s.stage = 'bao_hanh'
     GROUP BY s.company_id
    UNION ALL
    SELECT d.company_id, 'designs_active', 6, 'Hồ sơ thiết kế đang làm', count(*)::int, NULL::bigint
      FROM public.design_projects d
     WHERE d.deleted_at IS NULL AND d.stage NOT IN ('ban_giao', 'dung_thiet_ke')
     GROUP BY d.company_id
    UNION ALL
    SELECT d.company_id, 'designs_waiting_customer', 7, 'Thiết kế chờ khách duyệt', count(*)::int,
           NULL::bigint
      FROM public.design_projects d
     WHERE d.deleted_at IS NULL AND d.stage = 'cho_khach_duyet'
     GROUP BY d.company_id
    UNION ALL
    SELECT r.company_id, 'rentals_active', 8, 'Hợp đồng thuê giàn giáo đang chạy', count(*)::int,
           NULL::bigint
      FROM public.rental_agreements r
     WHERE r.deleted_at IS NULL AND r.status = 'dang_thue'
     GROUP BY r.company_id
    UNION ALL
    SELECT p.company_id, 'production_running', 9, 'Lệnh sản xuất đang chạy', count(*)::int,
           NULL::bigint
      FROM public.production_orders p
     WHERE p.deleted_at IS NULL AND p.status = 'dang_san_xuat'
     GROUP BY p.company_id
  )
  SELECT co.id, co.code, co.name, m.metric, m.label, m.total, m.amount
    FROM co JOIN m ON m.cid = co.id
   WHERE m.total > 0
   ORDER BY co.display_order, co.code, m.ord;
END;
$$;

COMMENT ON FUNCTION public.exec_company_pulse() IS
  'Hoạt động đang chạy của từng pháp nhân giao dịch (0170) — chỉ số có hoạt động mới trả về.';

REVOKE ALL ON FUNCTION public.exec_company_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exec_company_pulse() TO authenticated;
