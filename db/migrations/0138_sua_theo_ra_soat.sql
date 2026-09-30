-- ============================================================================
-- Sửa theo lượt rà soát backend 30/09/2026 (migration 0132–0137).
--
--   1. site_request_tracker và request_reminders_select: chỉ vai trò xem được MH — đúng như
--      purchase_requests_select. Trước đây «TC hoặc MH» mở cho vai trò chỉ xem TC (Nhân sự) đọc
--      mã, tiêu đề, người gửi, người giữ của mọi đề nghị mua công trường qua hàm SECURITY DEFINER.
--   2. Bộ đếm mã: đẩy VƯỢT QUA mã đúng dạng đã có sẵn (0132 giữ nguyên mã đúng dạng nhưng không
--      nâng bộ đếm — mã tay trùng dạng sẽ bị cấp trùng). Chỉ nâng, không bao giờ hạ.
--   3. record_acceptance_with_checklist: danh mục đúng loại nghiệm thu; kết quả thiếu khoá
--      `result` báo câu tiếng Việt thay vì lỗi NOT NULL thô.
--   4. project_profit_loss: bỏ biên bản nghiệm thu đã xoá mềm khỏi doanh thu.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Theo dõi đề nghị: cùng điều kiện đọc với bảng gốc
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.site_request_tracker(
  p_site_id uuid DEFAULT NULL,
  p_mine_only boolean DEFAULT false
)
RETURNS TABLE (
  entity_type        text,
  entity_id          uuid,
  code               text,
  title              text,
  site_id            uuid,
  site_code          text,
  site_name          text,
  company_id         uuid,
  requested_by       uuid,
  requested_by_name  text,
  needed_date        date,
  urgency            text,
  stage              text,
  is_closed          boolean,
  holder_kind        text,
  holder_label       text,
  holder_ids         uuid[],
  holder_names       text[],
  waiting_since      timestamptz,
  due_at             timestamptz,
  promised_date      date,
  last_nudged_at     timestamptz,
  nudge_count        integer,
  next_nudge_at      timestamptz,
  created_at         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT public.auth_user_id() AS id
  ),
  interval_param AS (
    SELECT NULLIF(public.system_parameter_number('request_nudge_min_interval_hours'), 0) AS hours
  ),
  base AS (
    SELECT pr.*, s.code AS s_code, s.name AS s_name
    FROM public.purchase_requests pr
    JOIN public.construction_sites s ON s.id = pr.construction_site_id
    WHERE pr.deleted_at IS NULL
      AND (p_site_id IS NULL OR pr.construction_site_id = p_site_id)
      AND (NOT p_mine_only OR pr.requested_by = (SELECT id FROM me))
      AND public.rls_company_access(pr.company_id)
      -- 0138: chỉ MH, đúng như purchase_requests_select. Trước đây «TC hoặc MH» cho vai trò chỉ xem
      -- TC (vd. Nhân sự) đọc qua hàm này thứ bảng gốc không cho đọc.
      AND public.auth_can_view_module('MH')
      AND public.rls_site_in_scope(pr.construction_site_id)
  ),
  appr AS (
    SELECT DISTINCT ON (a.entity_id) a.entity_id, a.requested_at, a.amount
    FROM public.approvals a
    WHERE a.entity_type = 'purchase_requests'
      AND a.status = 'pending_approval'
      AND a.deleted_at IS NULL
      AND a.entity_id IN (SELECT id FROM base)
    ORDER BY a.entity_id, a.requested_at DESC
  ),
  po AS (
    SELECT DISTINCT ON (o.purchase_request_id) o.purchase_request_id, o.created_at, o.promised_date
    FROM public.purchase_orders o
    WHERE o.deleted_at IS NULL
      AND o.purchase_request_id IN (SELECT id FROM base)
    ORDER BY o.purchase_request_id, o.created_at DESC
  ),
  -- Vai trò giữ bước «chờ duyệt»: vai trò có hạn mức ĐỦ cho số tiền, lấy bậc thấp nhất — đúng
  -- người được trông đợi xử lý trước (decide_approval cho mọi người có hạn mức đủ duyệt).
  approver_role AS (
    SELECT DISTINCT ON (b.id) b.id AS request_id, al.role_id, r.label AS role_label
    FROM base b
    JOIN appr ap ON ap.entity_id = b.id
    JOIN public.approval_limits al
      ON al.subject = 'purchase_request' AND al.is_active
     AND (al.company_id IS NULL OR al.company_id = b.company_id)
     AND (al.max_amount IS NULL OR al.max_amount >= COALESCE(ap.amount, b.estimated_value))
    JOIN public.roles r ON r.id = al.role_id
    ORDER BY b.id, al.step, al.max_amount NULLS LAST
  ),
  mh_role AS (
    SELECT id AS role_id, label FROM public.roles WHERE code = 'MH' LIMIT 1
  ),
  holder AS (
    SELECT
      b.id AS request_id,
      CASE
        WHEN b.stage IN ('nhap', 'tu_choi') THEN 'requester'
        WHEN b.stage = 'cho_duyet' THEN 'approver'
        WHEN b.stage IN ('da_duyet', 'dang_mua') THEN 'purchasing'
        ELSE NULL
      END AS kind,
      CASE
        WHEN b.stage = 'cho_duyet' THEN ar.role_id
        WHEN b.stage IN ('da_duyet', 'dang_mua') THEN (SELECT role_id FROM mh_role)
      END AS role_id,
      CASE
        WHEN b.stage IN ('nhap', 'tu_choi') THEN 'Người gửi đề nghị'
        WHEN b.stage = 'cho_duyet' THEN COALESCE(ar.role_label, 'Người có hạn mức phê duyệt')
        WHEN b.stage = 'da_duyet' THEN (SELECT label FROM mh_role)
        WHEN b.stage = 'dang_mua' THEN (SELECT label FROM mh_role) || ' — chờ nhà cung cấp giao'
      END AS label
    FROM base b
    LEFT JOIN approver_role ar ON ar.request_id = b.id
  ),
  holder_people AS (
    SELECT h.request_id,
           array_agg(DISTINCT u.id) AS ids,
           array_agg(DISTINCT u.full_name) AS names
    FROM holder h
    JOIN base b ON b.id = h.request_id
    JOIN public.user_companies uc ON uc.role_id = h.role_id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
    WHERE h.role_id IS NOT NULL
      AND (uc.company_id = b.company_id OR r.sees_all_companies)
      -- Người gửi không tự duyệt đề nghị của mình.
      AND NOT (h.kind = 'approver' AND u.id IS NOT DISTINCT FROM b.requested_by)
    GROUP BY h.request_id
  ),
  nudges AS (
    SELECT rr.entity_id, max(rr.nudged_at) AS last_at, count(*)::int AS n
    FROM public.request_reminders rr
    WHERE rr.entity_type = 'purchase_requests'
      AND rr.entity_id IN (SELECT id FROM base)
    GROUP BY rr.entity_id
  ),
  rows AS (
    SELECT
      b.*,
      h.kind, h.label, h.role_id,
      hp.ids, hp.names,
      ap.requested_at AS appr_at,
      po.created_at AS po_at, po.promised_date AS po_promised,
      n.last_at, n.n,
      CASE
        WHEN b.stage = 'cho_duyet' THEN COALESCE(ap.requested_at, b.submitted_at)
        WHEN b.stage = 'da_duyet' THEN b.approved_at
        WHEN b.stage = 'dang_mua' THEN COALESCE(po.created_at, b.approved_at)
        WHEN b.stage IN ('nhap', 'tu_choi') THEN b.updated_at
      END AS since
    FROM base b
    LEFT JOIN holder h ON h.request_id = b.id
    LEFT JOIN holder_people hp ON hp.request_id = b.id
    LEFT JOIN appr ap ON ap.entity_id = b.id
    LEFT JOIN po ON po.purchase_request_id = b.id
    LEFT JOIN nudges n ON n.entity_id = b.id
  )
  SELECT
    'purchase_requests'::text,
    x.id,
    x.code::text,
    x.title,
    x.construction_site_id,
    x.s_code::text,
    x.s_name,
    x.company_id,
    x.requested_by,
    (SELECT full_name FROM public.users WHERE id = x.requested_by),
    x.needed_date,
    x.urgency::text,
    x.stage::text,
    x.stage IN ('hoan_thanh', 'huy'),
    x.kind,
    x.label,
    COALESCE(x.ids, '{}'),
    COALESCE(x.names, '{}'),
    x.since,
    -- Hạn cam kết tính từ `sla_definitions`. Chưa khai thì RỖNG — giao diện không hiện đồng
    -- hồ, không tự dựng một con số (CLAUDE.md 5.2).
    CASE
      WHEN x.stage = 'cho_duyet' THEN
        x.since + make_interval(hours => public.sla_target_hours('purchase_request', x.company_id, x.role_id))
      WHEN x.stage = 'da_duyet' THEN
        x.since + make_interval(hours => public.sla_target_hours('purchase_ordering', x.company_id, x.role_id))
    END,
    x.po_promised,
    x.last_at,
    COALESCE(x.n, 0),
    CASE WHEN x.last_at IS NOT NULL AND (SELECT hours FROM interval_param) IS NOT NULL
         THEN x.last_at + make_interval(hours => (SELECT hours FROM interval_param)::int)
    END,
    x.created_at
  FROM rows x
  ORDER BY
    (x.stage IN ('hoan_thanh', 'huy')),
    x.needed_date NULLS LAST,
    x.created_at DESC;
$$;

DROP POLICY IF EXISTS request_reminders_select ON public.request_reminders;
CREATE POLICY request_reminders_select ON public.request_reminders
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND public.auth_can_view_module('MH')
    AND public.rls_site_in_scope(construction_site_id)
  );


-- ----------------------------------------------------------------------------
-- 2. Bộ đếm mã vượt qua mã đã có — chỉ nâng
-- ----------------------------------------------------------------------------

INSERT INTO public.catalog_sequences (record_type, last_value)
SELECT m[1], max(m[2]::int)
FROM (
  SELECT regexp_matches(code, '^(KH)-(\d{5,})$') AS m FROM public.customers
  UNION ALL
  SELECT regexp_matches(code, '^(NCC)-(\d{5,})$') FROM public.suppliers
) x
GROUP BY m[1]
ON CONFLICT (record_type)
DO UPDATE SET last_value = GREATEST(public.catalog_sequences.last_value, EXCLUDED.last_value);

INSERT INTO public.record_sequences (company_code, record_type, year, last_value)
SELECT m[1], 'TS', m[2]::int, max(m[3]::int)
FROM (SELECT regexp_matches(code, '^([A-Z]{3})-TS-(\d{4})-(\d{4,})$') AS m FROM public.assets) x
GROUP BY m[1], m[2]
ON CONFLICT (company_code, record_type, year)
DO UPDATE SET last_value = GREATEST(public.record_sequences.last_value, EXCLUDED.last_value);


-- ----------------------------------------------------------------------------
-- 3. Nghiệm thu kèm danh mục kiểm tra
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_acceptance_with_checklist(
  p_site_id uuid,
  p_acceptance_type acceptance_type,
  p_stage_name text,
  p_checklist_id uuid,
  p_results jsonb,
  p_value bigint DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_accepted_date date DEFAULT NULL,
  p_subcontractor_id uuid DEFAULT NULL,
  p_counterpart_signed_by text DEFAULT NULL,
  p_outstanding_issues text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  v_list      record;
  v_item      jsonb;
  v_given     jsonb;
  v_path      text;
  v_pos       integer := 0;
  v_failed    boolean := false;
  v_id        uuid;
  v_company   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v_list FROM public.acceptance_checklists
   WHERE id = p_checklist_id AND deleted_at IS NULL AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy danh mục kiểm tra đã chọn, hoặc danh mục đã ngừng dùng.';
  END IF;

  SELECT company_id INTO v_company FROM public.construction_sites WHERE id = p_site_id;
  -- 0138: danh mục soạn cho một loại nghiệm thu thì chỉ dùng cho đúng loại đó.
  IF v_list.acceptance_type IS NOT NULL AND v_list.acceptance_type <> p_acceptance_type THEN
    RAISE EXCEPTION 'Danh mục kiểm tra này dành cho loại nghiệm thu khác. Chọn danh mục đúng loại.';
  END IF;
  IF v_list.company_id IS NOT NULL AND v_list.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Danh mục kiểm tra này thuộc pháp nhân khác.';
  END IF;

  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Chưa có kết quả kiểm tra.';
  END IF;

  -- Mọi mục của danh mục phải có kết quả; mục bắt buộc ảnh phải có ảnh đúng công trình.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items) LOOP
    SELECT r INTO v_given FROM jsonb_array_elements(p_results) r
     WHERE r->>'key' = v_item->>'key' LIMIT 1;
    -- 0138: thiếu khoá `result` thì `NULL NOT IN (...)` ra NULL và lọt qua — kiểm tường minh.
    IF v_given IS NULL OR (v_given->>'result') IS NULL
       OR (v_given->>'result') NOT IN ('dat', 'khong_dat', 'khong_ap_dung') THEN
      RAISE EXCEPTION 'Chưa chấm mục «%». Chọn Đạt, Không đạt hoặc Không áp dụng cho mọi mục.', v_item->>'label';
    END IF;
    IF (v_item->>'requires_photo')::boolean IS TRUE
       AND (v_given->>'result') <> 'khong_ap_dung'
       AND COALESCE(jsonb_array_length(v_given->'photo_paths'), 0) = 0 THEN
      RAISE EXCEPTION 'Mục «%» cần ít nhất một ảnh hiện trường.', v_item->>'label';
    END IF;
    FOR v_path IN SELECT jsonb_array_elements_text(COALESCE(v_given->'photo_paths', '[]'::jsonb)) LOOP
      IF left(v_path, length(p_site_id::text) + 1) <> p_site_id::text || '/' THEN
        RAISE EXCEPTION 'Ảnh của mục «%» không thuộc công trình này.', v_item->>'label';
      END IF;
    END LOOP;
    IF v_given->>'result' = 'khong_dat' THEN
      v_failed := true;
    END IF;
  END LOOP;

  IF v_failed AND COALESCE(btrim(p_outstanding_issues), '') = '' THEN
    RAISE EXCEPTION 'Có mục Không đạt — ghi rõ tồn tại cần khắc phục trước khi ký biên bản.';
  END IF;

  -- Dùng lại toàn bộ kiểm tra, cấp mã và thông báo Kế toán của record_acceptance (kể cả Mẫu E).
  v_id := public.record_acceptance(
    p_site_id, p_acceptance_type, p_stage_name, p_value, p_scope, p_accepted_date,
    p_subcontractor_id, p_counterpart_signed_by, p_outstanding_issues
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items) LOOP
    v_pos := v_pos + 1;
    SELECT r INTO v_given FROM jsonb_array_elements(p_results) r
     WHERE r->>'key' = v_item->>'key' LIMIT 1;
    INSERT INTO public.acceptance_checklist_results (
      company_id, acceptance_record_id, acceptance_checklist_id, position,
      item_key, item_label, result, note, photo_paths, created_by, updated_by
    ) VALUES (
      v_company, v_id, p_checklist_id, v_pos,
      v_item->>'key', v_item->>'label', (v_given->>'result')::public.checklist_result,
      NULLIF(btrim(COALESCE(v_given->>'note', '')), ''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_given->'photo_paths', '[]'::jsonb))),
      v_user, v_user
    );
  END LOOP;

  RETURN v_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Lãi/lỗ: bỏ biên bản đã xoá mềm
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_profit_loss(p_company_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(construction_site_id uuid, company_id uuid, site_code text, site_name text, stage site_stage, contract_id uuid, contract_value bigint, collected_amount bigint, accepted_revenue bigint, budgeted_cost bigint, actual_cost bigint, committed_cost bigint, target_profit bigint, profit_actual bigint, profit_forecast bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := public.auth_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_can_view_module('BC') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không xem được báo cáo điều hành.';
  END IF;

  IF NOT public.rls_sees_sensitive('profit') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem lãi/lỗ. Liên hệ Ban Giám đốc hoặc Tài chính nếu cần số liệu này.';
  END IF;

  PERFORM public.log_sensitive_access('profit', 'profit_loss_report', NULL, 'view', p_company_id);

  RETURN QUERY
  WITH accepted AS (
    -- Doanh thu TỚI HIỆN TẠI = giá trị đã nghiệm thu với chủ đầu tư, biên bản chưa huỷ — căn
    -- cứ thu tiền theo hợp đồng (TC-04), cũng là cách ngành xây dựng ghi doanh thu theo khối
    -- lượng hoàn thành. Nghiệm thu nội bộ và với tổ đội không phải doanh thu.
    SELECT ar.construction_site_id AS site_id, COALESCE(SUM(ar.value), 0)::bigint AS revenue
    FROM public.acceptance_records ar
    WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
      AND ar.deleted_at IS NULL
    GROUP BY ar.construction_site_id
  ),
  costs AS (
    SELECT b.construction_site_id AS site_id,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS budgeted_cost,
           COALESCE(SUM(b.actual_amount)    FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS actual_cost,
           COALESCE(SUM(b.committed_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS committed_cost,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group = 'loi_nhuan'), 0)::bigint  AS target_profit
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL
       AND b.construction_site_id IS NOT NULL
     GROUP BY b.construction_site_id
  )
  SELECT
    s.id, s.company_id, s.code::text, s.name, s.stage, s.contract_id,
    c.value, c.collected_amount, COALESCE(accepted.revenue, 0),
    COALESCE(costs.budgeted_cost, 0), COALESCE(costs.actual_cost, 0), COALESCE(costs.committed_cost, 0),
    COALESCE(costs.target_profit, 0),
    -- 0137: trước đây lấy TOÀN BỘ giá trị hợp đồng trừ chi phí đã phát sinh — công trình mới
    -- xong móng đã hiện lãi gần bằng cả hợp đồng. Nay: đã nghiệm thu − đã phát sinh.
    CASE WHEN c.value IS NULL THEN NULL
         ELSE COALESCE(accepted.revenue, 0) - COALESCE(costs.actual_cost, 0) END,
    CASE WHEN c.value IS NULL THEN NULL
         ELSE c.value - (
           COALESCE(costs.actual_cost, 0) + COALESCE(costs.committed_cost, 0)
           + GREATEST(
               COALESCE(costs.budgeted_cost, 0) - COALESCE(costs.actual_cost, 0)
                 - COALESCE(costs.committed_cost, 0),
               0
             )
         ) END
    FROM public.construction_sites s
    LEFT JOIN public.contracts c ON c.id = s.contract_id
    LEFT JOIN costs ON costs.site_id = s.id
    LEFT JOIN accepted ON accepted.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$fn$;
