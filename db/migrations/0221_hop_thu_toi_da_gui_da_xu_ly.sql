-- 0221 — Hộp thư phê duyệt v2: ô «Tôi đã gửi» và «Đã xử lý» (anh Dũng 24/10/2026, gợi ý của màn 1.5
-- `design_handoff_nvg_v2`).
--
-- Chỉ ĐỌC. Không đổi quyền, không đổi luồng duyệt. Hàm SECURITY INVOKER: RLS của `approvals` vẫn
-- quyết — người gửi luôn đọc được hồ sơ của mình (`requested_by = auth_user_id()`), người duyệt đọc
-- được hồ sơ trong hạn mức (`rls_can_approve`). Cột trả về giống `my_pending_approvals` (0175, bản
-- 0218) cộng ba cột trạng thái, để giao diện dùng lại đúng một thẻ hồ sơ.
--
--   p_box = 'sent'    — hồ sơ chính mình gửi trong 90 ngày gần nhất (mọi trạng thái).
--   p_box = 'decided' — hồ sơ chính mình đã ra quyết định trong 90 ngày gần nhất (quyết định mới nhất
--                       của mình trên hồ sơ đó).

-- Đổi cột trả về thì CREATE OR REPLACE không đủ — xoá trước để tệp chạy lại được.
DROP FUNCTION IF EXISTS public.my_approval_box(text);

CREATE FUNCTION public.my_approval_box(p_box text)
RETURNS TABLE (
  id uuid,
  subject public.approval_subject,
  entity_type character varying,
  entity_id uuid,
  entity_code character varying,
  title text,
  amount bigint,
  reason text,
  requested_at timestamptz,
  requested_by_name text,
  company_code character varying,
  company_name character varying,
  parent_id uuid,
  parent_module character varying,
  due_at timestamptz,
  status text,
  final_decision text,
  my_decision text,
  decided_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT a.*, d.decision::text AS my_decision, d.decided_at AS my_decided_at
    FROM public.approvals a
    LEFT JOIN LATERAL (
      SELECT ad.decision, ad.decided_at
      FROM public.approval_decisions ad
      WHERE ad.approval_id = a.id AND ad.decided_by = public.auth_user_id()
      ORDER BY ad.decided_at DESC
      LIMIT 1
    ) d ON true
    WHERE a.deleted_at IS NULL
      AND CASE p_box
            WHEN 'sent' THEN a.requested_by = public.auth_user_id()
                         AND a.requested_at > now() - interval '90 days'
            WHEN 'decided' THEN d.decided_at IS NOT NULL
                         AND d.decided_at > now() - interval '90 days'
            ELSE false
          END
  )
  SELECT
    m.id, m.subject, m.entity_type, m.entity_id, m.entity_code, m.title, m.amount, m.reason,
    m.requested_at, u.full_name AS requested_by_name, c.code AS company_code,
    c.short_name AS company_name,
    CASE
      WHEN m.entity_type = 'quotes'              THEN q.opportunity_id
      WHEN m.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
      WHEN m.entity_type = 'contract_amendments' THEN am.contract_id
      WHEN m.entity_type = 'site_surveys'        THEN sv.opportunity_id
    END AS parent_id,
    (CASE
      WHEN m.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
      WHEN m.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
    END)::varchar(8) AS parent_module,
    CASE WHEN m.status = 'pending_approval' THEN
      m.requested_at + make_interval(hours => public.sla_target_hours(m.subject::text, m.company_id))
    END AS due_at,
    m.status::text AS status,
    m.final_decision::text AS final_decision,
    m.my_decision,
    m.my_decided_at AS decided_at
  FROM mine m
  LEFT JOIN public.users     u ON u.id = m.requested_by
  LEFT JOIN public.companies c ON c.id = m.company_id
  LEFT JOIN public.quotes    q ON m.entity_type = 'quotes'    AND q.id = m.entity_id
  LEFT JOIN public.estimates e ON m.entity_type = 'estimates' AND e.id = m.entity_id
  LEFT JOIN public.contract_amendments am
         ON m.entity_type = 'contract_amendments' AND am.id = m.entity_id
  LEFT JOIN public.site_surveys sv
         ON m.entity_type = 'site_surveys' AND sv.id = m.entity_id
  ORDER BY COALESCE(m.my_decided_at, m.requested_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.my_approval_box(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_approval_box(text) TO authenticated;
