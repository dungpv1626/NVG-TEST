-- ============================================================================
-- TC-10 — Theo dõi đề nghị từ công trường và nút «Thúc» (AFD 4.7, mẫu bố cục 7).
--
-- Khảo sát công trường: việc tốn công nhất của chỉ huy trưởng không phải lập đề nghị mà là HỎI
-- LẠI — gửi rồi không biết ai đang giữ, đã bao lâu, và phải gọi Zalo để giục. TC-10 là ưu tiên
-- số một của công trường (CLAUDE.md 4.6).
--
-- Thiết kế — dùng lại `purchase_requests` + `approvals`, KHÔNG dựng bảng đề nghị chung:
--   · Một nguồn dữ liệu (PRD 2.3): đề nghị vật tư đã có đủ bước, ngày cần hàng, phê duyệt. Một
--     bảng «đề nghị công trường» loại vật tư sẽ là bản sao có thể nói khác bản gốc.
--   · Mọi bước đã có người giữ: nháp/bị từ chối → người gửi; chờ duyệt → người có hạn mức đủ;
--     đã duyệt → Mua hàng; đang mua → Mua hàng/nhà cung cấp tới ngày hẹn giao.
--   · «Theo dõi» là thứ TÍNH ĐƯỢC từ chứng từ gốc (CHANGELOG 5.6: không lưu thứ tính được),
--     nên là hàm `site_request_tracker`, không phải bảng. Bảng mới duy nhất là lịch sử «Thúc».
--   · Hàm và bảng đều khoá theo `entity_type`, nên RFI hay loại đề nghị sau này chỉ thêm một
--     nhánh, không đổi hình.
--
-- Kèm theo, vá một lỗ Mẫu E có thật: `purchase_requests_select` chỉ là Mẫu A, nên chỉ huy
-- trưởng thấy đề nghị mua của MỌI công trình cùng pháp nhân, kể cả nơi không được phân công.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Lịch sử «Thúc»
-- ----------------------------------------------------------------------------

CREATE TABLE public.request_reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,

  -- Đa hình: bảng nguồn + dòng. Hiện chỉ `purchase_requests`.
  entity_type           varchar(64) NOT NULL,
  entity_id             uuid NOT NULL,

  -- Chụp lại lúc thúc — bước và người giữ đổi theo thời gian, lịch sử thì không.
  stage_at_nudge        varchar(32) NOT NULL,
  holder_kind           varchar(16) NOT NULL,
  notified_user_ids     uuid[] NOT NULL DEFAULT '{}',
  waited_hours          integer,
  note                  text,

  nudged_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  nudged_at             timestamptz NOT NULL DEFAULT now(),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX request_reminders_entity_idx
  ON public.request_reminders (entity_type, entity_id, nudged_at DESC);
CREATE INDEX request_reminders_site_idx ON public.request_reminders (construction_site_id);

COMMENT ON TABLE public.request_reminders IS
  'Lịch sử «Thúc» đề nghị từ công trường (TC-10). Chỉ ghi qua nudge_request; không sửa, không xoá.';

ALTER TABLE public.request_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_reminders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.request_reminders FROM authenticated;

-- Mẫu A + E: đúng pháp nhân, và với vai trò hiện trường thì đúng công trình được giao.
CREATE POLICY request_reminders_select ON public.request_reminders
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (public.auth_can_view_module('TC') OR public.auth_can_view_module('MH'))
    AND public.rls_site_in_scope(construction_site_id)
  );


-- ----------------------------------------------------------------------------
-- 2. Giãn cách giữa hai lần thúc — tham số, không viết cứng (NEN-12)
-- ----------------------------------------------------------------------------

INSERT INTO public.system_parameters
  (param_key, scope_type, value, unit, label, description, is_sensitive)
VALUES
  ('request_nudge_min_interval_hours', 'global', to_jsonb(4), 'giờ',
   'Giãn cách tối thiểu giữa hai lần «Thúc» một đề nghị',
   'SUY LUẬN của đội triển khai (TC-10), khảo sát KHÔNG xác nhận. Tính theo ĐỀ NGHỊ, không theo người: chỉ huy trưởng và văn phòng thi công không cùng thúc một đề nghị hai lần liền. Để trống hoặc 0 = không giới hạn.',
   false)
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
-- 3. Theo dõi đề nghị — hàm tính
--
-- SECURITY DEFINER vì cần đọc `approval_limits` và `user_companies`, mà chỉ huy trưởng không
-- đọc được. Điều kiện hiển thị viết TƯỜNG MINH bên dưới, cùng các hàm mà chính sách dùng.
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
      AND (public.auth_can_view_module('MH') OR public.auth_can_view_module('TC'))
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

REVOKE ALL ON FUNCTION public.site_request_tracker(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_request_tracker(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.site_request_tracker(uuid, boolean) IS
  'TC-10: bước hiện tại, người giữ, chờ từ lúc nào, hạn cam kết (rỗng khi chưa khai SLA), lịch sử thúc — cho đề nghị gắn công trình. Mẫu A + E.';


-- ----------------------------------------------------------------------------
-- 4. «Thúc» — ghi lịch sử và báo đúng người đang giữ
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nudge_request(
  p_entity_type text,
  p_entity_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := public.auth_user_id();
  t      record;
  v_id   uuid;
  v_url  text;
  v_msg  text;
  v_hours integer;
  u      uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF p_entity_type IS DISTINCT FROM 'purchase_requests' THEN
    RAISE EXCEPTION 'Chưa thúc được loại đề nghị này.';
  END IF;

  -- Cùng một điều kiện hiển thị với màn hình theo dõi: không thấy thì không thúc được.
  SELECT * INTO t FROM public.site_request_tracker() tr WHERE tr.entity_id = p_entity_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề nghị, hoặc tài khoản không được xem đề nghị này.';
  END IF;

  IF NOT (t.requested_by = v_me OR public.rls_site_writable(t.site_id)) THEN
    RAISE EXCEPTION 'Chỉ người gửi đề nghị hoặc người được phân công công trình này mới thúc được.';
  END IF;

  IF t.holder_kind IS NULL OR t.holder_kind NOT IN ('approver', 'purchasing') THEN
    RAISE EXCEPTION 'Đề nghị này không có ai ở văn phòng đang giữ — không có ai để thúc.';
  END IF;

  IF t.next_nudge_at IS NOT NULL AND t.next_nudge_at > now() THEN
    RAISE EXCEPTION 'Đã thúc lúc %; thúc lại được sau %.',
      to_char(t.last_nudged_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      to_char(t.next_nudge_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');
  END IF;

  IF cardinality(t.holder_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa có ai được giao xử lý bước này. Báo Quản trị hệ thống để phân công người phụ trách.';
  END IF;

  v_hours := CASE WHEN t.waiting_since IS NOT NULL
                  THEN floor(extract(epoch FROM (now() - t.waiting_since)) / 3600)::int END;

  INSERT INTO public.request_reminders (
    company_id, construction_site_id, entity_type, entity_id,
    stage_at_nudge, holder_kind, notified_user_ids, waited_hours, note,
    nudged_by, created_by, updated_by
  ) VALUES (
    t.company_id, t.site_id, p_entity_type, p_entity_id,
    t.stage, t.holder_kind, t.holder_ids, v_hours, NULLIF(btrim(p_note), ''),
    v_me, v_me, v_me
  )
  RETURNING id INTO v_id;

  v_url := CASE WHEN t.holder_kind = 'approver' THEN '/viec-can-lam'
                ELSE '/mh/de-nghi-mua/' || p_entity_id::text END;
  v_msg := format('Công trường %s thúc đề nghị %s «%s»%s.',
                  t.site_code, t.code, t.title,
                  CASE WHEN v_hours IS NOT NULL THEN format(' — đã chờ %s giờ', v_hours) ELSE '' END);

  FOREACH u IN ARRAY t.holder_ids LOOP
    PERFORM public.create_notification(
      u, t.company_id, 'request_nudge', v_msg, p_entity_type, p_entity_id, v_url
    );
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.nudge_request(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nudge_request(text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.nudge_request(text, uuid, text) IS
  'TC-10 «Thúc»: người gửi hoặc người được phân công công trình nhắc người đang giữ đề nghị; ghi request_reminders và gửi thông báo. Giãn cách theo tham số request_nudge_min_interval_hours.';


-- ----------------------------------------------------------------------------
-- 5. Vá lỗ Mẫu E trên đề nghị mua
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS purchase_requests_select ON public.purchase_requests;
CREATE POLICY purchase_requests_select ON public.purchase_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('MH')
    -- Đề nghị gắn công trình: vai trò hiện trường chỉ thấy công trình được giao. Đề nghị văn
    -- phòng (không gắn công trình) giữ nguyên Mẫu A.
    AND (construction_site_id IS NULL OR public.rls_site_in_scope(construction_site_id))
  );
