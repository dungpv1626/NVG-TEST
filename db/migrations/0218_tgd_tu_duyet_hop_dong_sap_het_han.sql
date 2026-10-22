-- 0218 — Hai câu hỏi treo anh Dũng trả lời 22/10/2026 (CLAUDE.md 9.5).
--
-- Câu 2: «Tổng Giám đốc tự duyệt» — hồ sơ do Tổng Giám đốc gửi thì chính Tổng Giám đốc được
--   ĐỒNG Ý (vẫn trong hạn mức `approval_limits` của vai trò TGĐ). Các vai trò khác giữ nguyên
--   quy tắc 0156. Đơn nghỉ của chính mình vẫn không tự duyệt được (người hưởng là chính mình).
--   Ba chỗ đổi: hai trigger chặn tự duyệt, hộp thư phê duyệt, «đang chờ ai».
-- Câu 8: hợp đồng còn ≤ 90 ngày tới ngày kết thúc thì tính «sắp hết hạn» — tham số
--   `hd.expiring_soon_days` = 90 và hàm `contracts_expiring_soon()` (SECURITY INVOKER — RLS hợp
--   đồng quyết ai thấy gì).

CREATE OR REPLACE FUNCTION public.user_may_self_approve(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.roles r ON r.id = uc.role_id
     WHERE uc.user_id = p_user_id AND uc.deleted_at IS NULL AND r.code::text = 'TGD'
  );
$$;

COMMENT ON FUNCTION public.user_may_self_approve(uuid) IS
  'Người được tự ĐỒNG Ý hồ sơ do chính mình gửi: Tổng Giám đốc (0218, anh Dũng 22/10/2026).';

REVOKE ALL ON FUNCTION public.user_may_self_approve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_may_self_approve(uuid) TO authenticated;

-- Thân hàm NGUYÊN VĂN 0156, chỉ thêm ngoại lệ Tổng Giám đốc ở nhánh «người gửi = người duyệt».
CREATE OR REPLACE FUNCTION public.approval_decisions_no_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  a              record;
  v_beneficiary  uuid;
BEGIN
  IF NEW.decision <> 'approved' OR NEW.decided_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requested_by, entity_type, entity_id INTO a
    FROM public.approvals WHERE id = NEW.approval_id;

  -- Hồ sơ NHẬP HỘ: người gửi không phải người hưởng.
  --   · Đơn nghỉ — Nhân sự nhập thay nhân viên (đa số không có tài khoản), và chỉ vai trò NS
  --     duyệt đơn nghỉ. Người không được tự duyệt là CHÍNH NHÂN VIÊN trong đơn.
  --   · Yêu cầu tuyển dụng — Nhân sự lập thay phòng ban đề xuất; không có người hưởng cá nhân.
  IF a.entity_type = 'leave_requests' THEN
    SELECT e.user_id INTO v_beneficiary
      FROM public.leave_requests l JOIN public.employees e ON e.id = l.employee_id
     WHERE l.id = a.entity_id;
    IF v_beneficiary IS NOT NULL AND v_beneficiary = NEW.decided_by THEN
      RAISE EXCEPTION 'Không tự phê duyệt được đơn nghỉ của chính mình. Cần một người khác có quyền duyệt xử lý.';
    END IF;
    RETURN NEW;
  ELSIF a.entity_type = 'recruitment_positions' THEN
    RETURN NEW;
  END IF;

  IF a.requested_by IS NOT NULL AND a.requested_by = NEW.decided_by
     AND NOT public.user_may_self_approve(NEW.decided_by) THEN
    RAISE EXCEPTION 'Không tự phê duyệt được hồ sơ do chính mình gửi. Cần một người khác có hạn mức phê duyệt xử lý.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.approval_decisions_no_self_approval() IS
  'Chặn người gửi tự ĐỒNG Ý hồ sơ của chính mình, mọi loại phê duyệt (0156); Tổng Giám đốc được '
  'tự duyệt (0218). Tự huỷ (rejected) vẫn được.';

CREATE OR REPLACE FUNCTION public.payment_request_steps_no_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_requested_by uuid;
BEGIN
  IF NEW.decision <> 'approved' OR NEW.decided_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requested_by INTO v_requested_by
    FROM public.payment_requests WHERE id = NEW.payment_request_id;

  IF v_requested_by IS NOT NULL AND v_requested_by = NEW.decided_by
     AND NOT public.user_may_self_approve(NEW.decided_by) THEN
    RAISE EXCEPTION 'Không tự xác nhận được đề nghị chi do chính mình lập. Cần một người khác ở bước này xử lý.';
  END IF;

  RETURN NEW;
END;
$$;

-- Hộp thư phê duyệt: thân hàm NGUYÊN VĂN 0175, chỉ đổi điều kiện bỏ hồ sơ của chính mình.
CREATE OR REPLACE FUNCTION public.my_pending_approvals()
RETURNS TABLE (
  id                uuid,
  subject           approval_subject,
  entity_type       varchar(64),
  entity_id         uuid,
  entity_code       varchar(40),
  title             text,
  amount            bigint,
  reason            text,
  requested_at      timestamptz,
  requested_by_name text,
  company_code      varchar(8),
  company_name      varchar(64),
  parent_id         uuid,
  parent_module     varchar(8),
  due_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending AS (
    SELECT
      a.id, a.subject, a.entity_type, a.entity_id, a.entity_code, a.title, a.amount, a.reason,
      a.requested_at, u.full_name AS requested_by_name, c.code AS company_code,
      c.short_name AS company_name,
      CASE
        WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
        WHEN a.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
        WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
        WHEN a.entity_type = 'site_surveys'        THEN sv.opportunity_id
      END AS parent_id,
      CASE
        WHEN a.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
        WHEN a.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
      END AS parent_module,
      a.requested_at
        + make_interval(hours => public.sla_target_hours(a.subject::text, a.company_id))
        AS due_at
    FROM public.approvals a
    LEFT JOIN public.users     u ON u.id = a.requested_by
    LEFT JOIN public.companies c ON c.id = a.company_id
    LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
    LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
    LEFT JOIN public.contract_amendments am
           ON a.entity_type = 'contract_amendments' AND am.id = a.entity_id
    LEFT JOIN public.site_surveys sv
           ON a.entity_type = 'site_surveys' AND sv.id = a.entity_id
    WHERE a.status = 'pending_approval'
      AND a.deleted_at IS NULL
      AND public.rls_can_approve(a.subject, a.company_id, a.amount)
      -- 0156: hồ sơ do chính mình gửi không nằm trong hộp thư của mình — trừ Tổng Giám đốc,
      -- người được tự duyệt hồ sơ của chính mình (0218, anh Dũng 22/10/2026).
      AND (a.requested_by IS DISTINCT FROM public.auth_user_id()
           OR public.user_may_self_approve(public.auth_user_id()))
  )
  SELECT id, subject, entity_type, entity_id, entity_code, title, amount, reason,
         requested_at, requested_by_name, company_code, company_name,
         parent_id, parent_module::varchar(8), due_at
  FROM pending
  ORDER BY (due_at IS NOT NULL AND due_at < now()) DESC, due_at NULLS LAST, requested_at;
$$;

REVOKE ALL ON FUNCTION public.my_pending_approvals() FROM public;
GRANT EXECUTE ON FUNCTION public.my_pending_approvals() TO authenticated;

-- «Đang chờ ai»: thân hàm NGUYÊN VĂN 0165, chỉ giữ Tổng Giám đốc khi chính họ gửi.
CREATE OR REPLACE FUNCTION public.approval_waiting_on(p_approval_id uuid)
RETURNS TABLE (
  role_labels    text[],
  user_names     text[],
  user_ids       uuid[],
  waiting_since  timestamptz,
  last_nudged_at timestamptz,
  nudge_count    integer,
  next_nudge_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a       record;
  v_hours numeric := NULLIF(public.system_parameter_number('request_nudge_min_interval_hours'), 0);
  v_last  timestamptz;
  v_count integer;
BEGIN
  SELECT id, company_id, subject, amount, status, requested_by, requested_at, deleted_at
    INTO a
    FROM public.approvals WHERE id = p_approval_id;

  -- Chỉ trả cho người xem được pháp nhân của hồ sơ, và chỉ khi còn đang chờ.
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.status <> 'pending_approval'
     OR NOT public.rls_company_access(a.company_id) THEN
    RETURN;
  END IF;

  SELECT max(r.nudged_at), count(*)::int INTO v_last, v_count
    FROM public.approval_reminders r WHERE r.approval_id = p_approval_id;

  RETURN QUERY
  WITH roles_ok AS (
    -- Mọi vai trò có hạn mức ĐỦ (decide_approval cho bất kỳ ai trong số đó duyệt), bậc thấp
    -- xếp trước — xem 0162 vì sao không lọc theo `current_step`.
    SELECT al.role_id, min(al.step) AS step
      FROM public.approval_limits al
     WHERE al.subject = a.subject AND al.is_active
       AND (al.company_id IS NULL OR al.company_id = a.company_id)
       AND (al.max_amount IS NULL OR a.amount IS NULL OR al.max_amount >= a.amount)
     GROUP BY al.role_id
  ),
  people AS (
    SELECT ro.step, r.label::text AS role_label, u.id AS user_id, u.full_name::text AS full_name
      FROM roles_ok ro
      JOIN public.roles r ON r.id = ro.role_id
      JOIN public.user_companies uc ON uc.role_id = ro.role_id AND uc.deleted_at IS NULL
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE (uc.company_id = a.company_id OR r.sees_all_companies)
       AND (u.id IS DISTINCT FROM a.requested_by OR public.user_may_self_approve(u.id))
  )
  SELECT COALESCE((SELECT array_agg(x.role_label ORDER BY x.step)
                      FROM (SELECT p.role_label, min(p.step) AS step FROM people p
                             GROUP BY p.role_label) x), ARRAY[]::text[]),
         COALESCE((SELECT array_agg(y.full_name ORDER BY y.step, y.full_name)
                      FROM (SELECT p.full_name, min(p.step) AS step FROM people p
                             GROUP BY p.full_name) y), ARRAY[]::text[]),
         COALESCE((SELECT array_agg(DISTINCT p.user_id) FROM people p), ARRAY[]::uuid[]),
         a.requested_at,
         v_last,
         COALESCE(v_count, 0),
         CASE WHEN v_last IS NOT NULL AND v_hours IS NOT NULL
              THEN v_last + make_interval(secs => (v_hours * 3600)::double precision) END;
END;
$$;

REVOKE ALL ON FUNCTION public.approval_waiting_on(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_waiting_on(uuid) TO authenticated;

-- --- Câu 8: hợp đồng sắp hết hạn ----------------------------------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'hd.expiring_soon_days', 'global', '90'::jsonb, 'ngày', 'Hợp đồng sắp hết hạn (ngày)',
       'Hợp đồng đã ký còn từ số ngày này trở xuống tới ngày kết thúc thì hiện «Sắp hết hạn» '
       '(anh Dũng 22/10/2026: 90 ngày). Để trống = không cảnh báo.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
   WHERE p.param_key = 'hd.expiring_soon_days' AND p.scope_type = 'global'
);

-- Chỉ hợp đồng ĐÃ KÝ (đang hiệu lực) có ngày kết thúc từ hôm nay tới hôm nay + N (giờ Việt Nam).
-- Đã qua ngày kết thúc là «Quá hạn» (contractDisplayStatus), không nằm ở đây.
CREATE OR REPLACE FUNCTION public.contracts_expiring_soon()
RETURNS TABLE (
  id              uuid,
  company_id      uuid,
  company_code    varchar(8),
  code            varchar(40),
  contract_number text,
  title           text,
  end_date        date,
  days_left       integer,
  responsible     text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH p AS (
    SELECT public.system_parameter_number('hd.expiring_soon_days', 'global', NULL)::integer AS days,
           (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
  )
  SELECT c.id, c.company_id, co.code, c.code, c.contract_number::text, c.title, c.end_date,
         (c.end_date - p.today)::integer, u.full_name::text
    FROM p
    JOIN public.contracts c ON TRUE
    JOIN public.companies co ON co.id = c.company_id
    LEFT JOIN public.users u ON u.id = c.responsible_user_id
   WHERE p.days IS NOT NULL
     AND c.deleted_at IS NULL
     AND c.stage = 'da_ky'
     AND c.end_date IS NOT NULL
     AND c.end_date BETWEEN p.today AND p.today + p.days
   ORDER BY c.end_date, c.code;
$$;

COMMENT ON FUNCTION public.contracts_expiring_soon() IS
  'Hợp đồng đã ký còn ≤ hd.expiring_soon_days ngày tới ngày kết thúc (0218). SECURITY INVOKER: '
  'RLS hợp đồng quyết phạm vi; tham số trống thì không trả dòng nào.';

REVOKE ALL ON FUNCTION public.contracts_expiring_soon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contracts_expiring_soon() TO authenticated;
