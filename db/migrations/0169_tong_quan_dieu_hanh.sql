/**
 * «Tổng quan điều hành» — `exec_overview()` (Giai đoạn 2, doc/MOC_CAI_TIEN_UX.md vấn đề 1:
 * «lãnh đạo / kiểm soát không thấy vấn đề ngay»).
 *
 * Dashboard chung tính «Quá hạn» ở TRÌNH DUYỆT, theo quyền xem của từng người, và bỏ sót đề nghị
 * chi, công nợ phải trả, giàn giáo quá hạn trả, giấy tờ nhân sự. Hàm này trả MỘT danh sách cảnh
 * báo toàn hệ thống cho lãnh đạo và Kiểm soát nội bộ — mỗi dòng một ô: mức, số lượng, số tiền,
 * liên kết tới danh sách đã lọc, và tối đa 5 hồ sơ cụ thể để thấy ngay đó là gì.
 *
 * Quy tắc «quá hạn» chép ĐÚNG các hàm `*DisplayStatus` của `shared/` (hợp đồng hd.ts, công trình
 * tc.ts, thuê giàn giáo sx.ts, công nợ kt.ts) — lệch nhau thì ô nói 5 mà danh sách lọc ra 4.
 * Ngưỡng không viết cứng ở đây (NEN-12):
 *   - phê duyệt / đề nghị chi «để lâu»: SLA của loại hồ sơ (`sla_target_hours`) nếu đã cấu hình,
 *     không thì `p_stale_days` do trang truyền vào (`PENDING_APPROVAL_AGING_DAYS`, một hằng số
 *     duy nhất ở shared/bc.ts — cùng mốc Dashboard đang dùng);
 *   - giấy tờ nhân sự: `p_hr_notice_days` (mốc nhắc gần nhất của `DOCUMENT_REMINDER_DAYS`).
 *
 * Quyền: chỉ TGĐ, CFO, BGĐ, Quản trị và Kiểm soát nội bộ — hàm đếm xuyên mọi pháp nhân nên là
 * SECURITY DEFINER, cửa vào phải là vai trò chứ không phải RLS từng bảng. Số tiền công nợ chỉ
 * trả khi `rls_sees_finance()`; ngân sách công trình đi qua `sites_budget_status` (tự kiểm quyền).
 */

-- «Gửi hôm nay» / «Chờ N ngày» — cùng cách nói với `formatWaiting` (shared/format.ts).
CREATE OR REPLACE FUNCTION public._waited_text(p_since timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE WHEN (current_date - (p_since AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) <= 0
              THEN 'Gửi hôm nay'
              ELSE format('Chờ %s ngày', current_date - (p_since AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) END;
$$;

CREATE OR REPLACE FUNCTION public.exec_overview(
  p_company_id    uuid    DEFAULT NULL,
  p_stale_days    integer DEFAULT NULL,
  p_hr_notice_days integer DEFAULT NULL
)
RETURNS TABLE (
  key     text,
  area    text,
  label   text,
  level   text,     -- 'red' | 'amber' | 'ok' | 'no_data'
  total   integer,
  amount  bigint,
  link    text,
  note    text,
  items   jsonb     -- tối đa 5 hồ sơ: [{code, title, detail, link}]
)
LANGUAGE plpgsql
-- KHÔNG đánh dấu STABLE: `sites_budget_status` ghi nhật ký truy cập dữ liệu nhạy cảm (NEN-07),
-- hàm STABLE chạy trong giao dịch chỉ đọc và lệnh ghi đó bị từ chối.
SECURITY DEFINER
SET search_path = public
AS $$
-- Tên cột trả về (amount, total, level…) trùng tên cột bảng: trong câu truy vấn luôn hiểu là cột.
#variable_conflict use_column
DECLARE
  v_finance boolean := public.rls_sees_finance();
  v_n       integer;
  v_m       integer;
  v_amt     bigint;
  v_items   jsonb;
BEGIN
  IF NOT (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
          OR public.auth_role_codes()::text[] && ARRAY['KSNB']) THEN
    RAISE EXCEPTION 'Chỉ Ban Giám đốc và Kiểm soát nội bộ xem được Tổng quan điều hành.';
  END IF;

  -- 1. Phê duyệt chờ lâu ----------------------------------------------------------------------
  WITH p AS (
    SELECT a.id, a.entity_code, a.title, a.requested_at, a.company_id,
           COALESCE(make_interval(hours => public.sla_target_hours(a.subject::text, a.company_id)),
                    make_interval(days => p_stale_days)) AS allowed,
           (SELECT count(*) FROM public.approval_reminders r WHERE r.approval_id = a.id) AS nudges
      FROM public.approvals a
     WHERE a.status = 'pending_approval' AND a.deleted_at IS NULL
       AND (p_company_id IS NULL OR a.company_id = p_company_id)
  )
  SELECT count(*) FILTER (WHERE allowed IS NOT NULL AND requested_at + allowed < now()),
         count(*),
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object(
                     'code', p2.entity_code, 'title', p2.title,
                     'detail', public._waited_text(p2.requested_at)
                               || CASE WHEN p2.nudges > 0 THEN format(' · đã thúc %s lần', p2.nudges) ELSE '' END,
                     'link', NULL) AS x
              FROM p p2 ORDER BY p2.requested_at LIMIT 5) q)
    INTO v_n, v_m, v_items
    FROM p;
  -- Số lớn là số ĐANG CHỜ (thứ lãnh đạo hỏi trước); số quá mốc nằm ở ghi chú và quyết định mức.
  RETURN QUERY SELECT 'approvals_stale', 'Phê duyệt', 'Phê duyệt đang chờ',
    CASE WHEN v_n > 0 THEN 'red' WHEN v_m > 0 THEN 'amber' ELSE 'ok' END,
    -- Người duyệt được thì dẫn tới Hộp thư; Kiểm soát nội bộ không duyệt nên không có lối đó.
    v_m, NULL::bigint, CASE WHEN public.auth_is_read_only() THEN NULL ELSE '/viec-can-lam' END,
    CASE WHEN v_n > 0 THEN format('%s hồ sơ chờ quá mốc', v_n) ELSE 'Chưa hồ sơ nào chờ quá mốc' END,
    COALESCE(v_items, '[]'::jsonb);

  -- 2. Đề nghị chi kẹt ở bước kiểm tra -----------------------------------------------------------
  WITH s AS (
    SELECT pr.id, pr.code, pr.title, pr.amount, pr.stage, pr.due_date,
           COALESCE((SELECT max(st.decided_at) FROM public.payment_request_steps st
                      WHERE st.payment_request_id = pr.id), pr.submitted_at) AS at_step_since,
           COALESCE(make_interval(hours => public.sla_target_hours('payment_request', pr.company_id)),
                    make_interval(days => p_stale_days)) AS allowed
      FROM public.payment_requests pr
     WHERE pr.deleted_at IS NULL
       AND pr.stage IN ('cho_don_vi', 'cho_ke_toan', 'cho_tai_chinh', 'cho_phe_duyet')
       AND (p_company_id IS NULL OR pr.company_id = p_company_id)
  )
  SELECT count(*) FILTER (WHERE (allowed IS NOT NULL AND at_step_since + allowed < now())
                                OR due_date < current_date),
         CASE WHEN v_finance THEN COALESCE(sum(amount) FILTER (
                WHERE (allowed IS NOT NULL AND at_step_since + allowed < now())
                      OR due_date < current_date), 0) END,
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('code', s2.code, 'title', s2.title,
                     'detail', CASE WHEN current_date - (s2.at_step_since AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= 0
                                    THEN 'Vào bước hiện tại hôm nay'
                                    ELSE format('Ở bước hiện tại %s ngày',
                                                current_date - (s2.at_step_since AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) END,
                     'link', '/kt/de-nghi-thanh-toan/' || s2.id) AS x
              FROM s s2
             WHERE (s2.allowed IS NOT NULL AND s2.at_step_since + s2.allowed < now())
                   OR s2.due_date < current_date
             ORDER BY s2.at_step_since LIMIT 5) q)
    INTO v_n, v_amt, v_items
    FROM s;
  RETURN QUERY SELECT 'payments_stuck', 'Tài chính', 'Đề nghị chi kẹt / quá hạn',
    CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, v_amt,
    '/kt/de-nghi-thanh-toan?trang-thai=overdue', NULL::text, COALESCE(v_items, '[]'::jsonb);

  -- 3–4. Công nợ quá hạn (phải thu, phải trả) ----------------------------------------------------
  IF v_finance THEN
    SELECT count(*), COALESCE(sum(amount - settled_amount), 0)
      INTO v_n, v_amt
      FROM public.receivables_payables
     WHERE deleted_at IS NULL AND direction = 'phai_thu'
       AND amount > settled_amount AND due_date < current_date
       AND (p_company_id IS NULL OR company_id = p_company_id);
    RETURN QUERY SELECT 'receivables_overdue', 'Tài chính', 'Công nợ phải thu quá hạn',
      CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, v_amt,
      '/kt/cong-no?trang-thai=overdue', NULL::text, '[]'::jsonb;

    SELECT count(*), COALESCE(sum(amount - settled_amount), 0)
      INTO v_n, v_amt
      FROM public.receivables_payables
     WHERE deleted_at IS NULL AND direction = 'phai_tra'
       AND amount > settled_amount AND due_date < current_date
       AND (p_company_id IS NULL OR company_id = p_company_id);
    RETURN QUERY SELECT 'payables_overdue', 'Tài chính', 'Công nợ phải trả quá hạn',
      CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, v_amt,
      '/kt/cong-no?trang-thai=overdue&chieu=phai-tra', NULL::text, '[]'::jsonb;
  END IF;

  -- 5. Hợp đồng quá hạn (contractDisplayStatus) -------------------------------------------------
  SELECT count(*),
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('code', COALESCE(c2.contract_number, c2.code), 'title', c2.title,
                     'detail', 'Hết hạn ' || to_char(c2.end_date, 'DD/MM/YYYY'),
                     'link', '/hd/hop-dong/' || c2.id) AS x
              FROM public.contracts c2
             WHERE c2.deleted_at IS NULL AND c2.stage NOT IN ('hoan_thanh', 'huy')
               AND c2.end_date < current_date
               AND (p_company_id IS NULL OR c2.company_id = p_company_id)
             ORDER BY c2.end_date LIMIT 5) q)
    INTO v_n, v_items
    FROM public.contracts c
   WHERE c.deleted_at IS NULL AND c.stage NOT IN ('hoan_thanh', 'huy')
     AND c.end_date < current_date
     AND (p_company_id IS NULL OR c.company_id = p_company_id);
  RETURN QUERY SELECT 'contracts_overdue', 'Hợp đồng', 'Hợp đồng quá hạn chưa quyết toán',
    CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, NULL::bigint,
    '/hd/hop-dong?trang-thai=overdue', NULL::text, COALESCE(v_items, '[]'::jsonb);

  -- 6. Công trình trễ tiến độ (siteDisplayStatus) ------------------------------------------------
  SELECT count(*),
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('code', s2.code, 'title', s2.name,
                     'detail', 'Kế hoạch xong ' || to_char(s2.planned_end_date, 'DD/MM/YYYY'),
                     'link', '/tc/cong-trinh/' || s2.id) AS x
              FROM public.construction_sites s2
             WHERE s2.deleted_at IS NULL AND s2.stage <> 'hoan_thanh'
               AND s2.planned_end_date < current_date
               AND (p_company_id IS NULL OR s2.company_id = p_company_id)
             ORDER BY s2.planned_end_date LIMIT 5) q)
    INTO v_n, v_items
    FROM public.construction_sites s
   WHERE s.deleted_at IS NULL AND s.stage <> 'hoan_thanh'
     AND s.planned_end_date < current_date
     AND (p_company_id IS NULL OR s.company_id = p_company_id);
  RETURN QUERY SELECT 'sites_late', 'Thi công', 'Công trình trễ tiến độ',
    CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, NULL::bigint,
    '/tc/cong-trinh?trang-thai=overdue', NULL::text, COALESCE(v_items, '[]'::jsonb);

  -- 7. Công trình vượt ngân sách (sites_budget_status tự đọc ngưỡng cảnh báo) --------------------
  SELECT count(*) FILTER (WHERE b.health = 'vuot_ngan_sach'),
         count(*) FILTER (WHERE b.health = 'sap_vuot'),
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('code', b2.site_code, 'title', b2.site_name,
                     'detail', CASE b2.health WHEN 'vuot_ngan_sach' THEN 'Vượt ngân sách'
                                              ELSE 'Sắp vượt ngân sách' END,
                     'link', '/tc/cong-trinh/' || b2.construction_site_id) AS x
              FROM public.sites_budget_status(p_company_id) b2
             WHERE b2.health IN ('vuot_ngan_sach', 'sap_vuot')
             ORDER BY b2.health DESC LIMIT 5) q)
    INTO v_n, v_m, v_items
    FROM public.sites_budget_status(p_company_id) b;
  RETURN QUERY SELECT 'sites_over_budget', 'Thi công', 'Công trình vượt ngân sách',
    CASE WHEN v_n > 0 THEN 'red' WHEN v_m > 0 THEN 'amber' ELSE 'ok' END, v_n, NULL::bigint,
    '/tc/cong-trinh?ngan-sach=vuot',
    CASE WHEN v_m > 0 THEN format('%s công trình sắp vượt', v_m) END,
    COALESCE(v_items, '[]'::jsonb);

  -- 8. Giàn giáo quá hạn trả (rentalAgreementDisplayStatus) -------------------------------------
  SELECT count(*) INTO v_n
    FROM public.rental_agreements r
   WHERE r.deleted_at IS NULL AND r.status = 'dang_thue' AND r.expected_end_date < current_date
     AND (p_company_id IS NULL OR r.company_id = p_company_id);
  RETURN QUERY SELECT 'rentals_overdue', 'Sản xuất – Cho thuê', 'Giàn giáo quá hạn trả',
    CASE WHEN v_n > 0 THEN 'red' ELSE 'ok' END, v_n, NULL::bigint,
    '/sx/tai-san-cho-thue?trang-thai=overdue', NULL::text, '[]'::jsonb;

  -- 9. Giấy tờ nhân sự hết hạn / sắp hết hạn (scan_hr_document_reminders) ----------------------
  IF p_hr_notice_days IS NULL THEN
    RETURN QUERY SELECT 'hr_documents', 'Nhân sự', 'Giấy tờ nhân sự hết hạn',
      'no_data', NULL::integer, NULL::bigint, '/ns/giay-to', NULL::text, '[]'::jsonb;
  ELSE
    SELECT count(*) FILTER (WHERE d.expiry_date < current_date),
           count(*) FILTER (WHERE d.expiry_date >= current_date)
      INTO v_n, v_m
      FROM public.hr_documents d
      LEFT JOIN public.employees e ON e.id = d.employee_id
     WHERE d.deleted_at IS NULL AND d.expiry_date IS NOT NULL
       AND d.expiry_date <= current_date + p_hr_notice_days
       AND (e.id IS NULL OR e.status IS DISTINCT FROM 'da_nghi')
       AND (p_company_id IS NULL OR d.company_id = p_company_id);
    RETURN QUERY SELECT 'hr_documents', 'Nhân sự', 'Giấy tờ nhân sự hết hạn / sắp hết hạn',
      CASE WHEN v_n > 0 THEN 'red' WHEN v_m > 0 THEN 'amber' ELSE 'ok' END, v_n + v_m, NULL::bigint,
      '/ns/giay-to',
      format('%s đã hết hạn · %s hết hạn trong %s ngày tới', v_n, v_m, p_hr_notice_days),
      '[]'::jsonb;
  END IF;

  -- 10. Báo giá không qua khảo sát (0160) — để kiểm soát xem lý do -------------------------------
  SELECT count(*),
         (SELECT jsonb_agg(x) FROM (
            SELECT jsonb_build_object('code', o2.code, 'title', o2.name,
                     'detail', 'Lý do: ' || o2.survey_waived_reason,
                     'link', '/crm/co-hoi/' || o2.id) AS x
              FROM public.opportunities o2
             WHERE o2.deleted_at IS NULL AND o2.survey_waived_reason IS NOT NULL
               AND o2.survey_waived_at > now() - interval '90 days'
               AND (p_company_id IS NULL OR o2.company_id = p_company_id)
             ORDER BY o2.survey_waived_at DESC LIMIT 5) q)
    INTO v_n, v_items
    FROM public.opportunities o
   WHERE o.deleted_at IS NULL AND o.survey_waived_reason IS NOT NULL
     AND o.survey_waived_at > now() - interval '90 days'
     AND (p_company_id IS NULL OR o.company_id = p_company_id);
  RETURN QUERY SELECT 'survey_waived', 'Kinh doanh', 'Báo giá không qua khảo sát (90 ngày)',
    CASE WHEN v_n > 0 THEN 'amber' ELSE 'ok' END, v_n, NULL::bigint,
    '/crm/co-hoi', NULL::text, COALESCE(v_items, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.exec_overview(uuid, integer, integer) IS
  'Tổng quan điều hành (0169): cảnh báo toàn hệ thống cho Ban Giám đốc và Kiểm soát nội bộ. Quy '
  'tắc quá hạn chép đúng *DisplayStatus của shared/; ngưỡng từ SLA hoặc tham số trang truyền vào.';

REVOKE ALL ON FUNCTION public.exec_overview(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exec_overview(uuid, integer, integer) TO authenticated;
