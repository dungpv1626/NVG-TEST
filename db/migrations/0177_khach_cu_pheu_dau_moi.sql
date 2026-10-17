-- ============================================================================
-- Đợt 1 — 1F: Khách cũ + phễu từ đầu mối (PRD CRM-07, CRM-09; doc/KE_HOACH_LAM_HO.md).
--
--   · Khách giới thiệu khách: đầu mối ghi được «do khách cũ nào giới thiệu» — vòng đời khép lại,
--     và biết khách nào mang lại khách mới.
--   · `old_customers()` — khách đã ký hợp đồng, kèm lần liên hệ gần nhất và hẹn chăm sóc tiếp.
--     Số ngày chăm sóc định kỳ (câu hỏi 16) CHƯA quyết nên không tự đặt — chỉ dựa vào ngày người
--     dùng hẹn trong nhật ký; khách chưa hẹn thì hiện «Chưa hẹn» để người phụ trách tự quyết.
--   · `lead_funnel_by_source()` — phễu từ ĐẦU MỐI theo nguồn: đầu mối → đã liên hệ → thành cơ
--     hội → ký hợp đồng (bổ sung báo cáo BC-03 vốn chỉ bắt đầu từ cơ hội).
-- Hai hàm chạy theo quyền người gọi (RLS lọc) — không lộ khách / đầu mối ngoài phạm vi.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referred_by_customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.referred_by_customer_id IS
  'Khách cũ đã giới thiệu đầu mối này (CRM-07 «đề nghị khách hàng giới thiệu cơ hội mới», 0177).';

CREATE INDEX IF NOT EXISTS leads_referred_by_idx ON public.leads (referred_by_customer_id)
  WHERE referred_by_customer_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Khách cũ
-- ----------------------------------------------------------------------------
-- Kiểu trả về đổi được khi chạy lại tệp trên máy: bỏ hàm cũ trước.
DROP FUNCTION IF EXISTS public.old_customers(uuid);
CREATE OR REPLACE FUNCTION public.old_customers(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  customer_id uuid,
  customer_code text,
  customer_name text,
  phone text,
  company_id uuid,
  company_code text,
  contract_count integer,
  last_contract_code text,
  last_signed_at timestamptz,
  last_contact_at timestamptz,
  next_care_at date,
  next_care_action text,
  referral_count integer,
  responsible_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH signed AS (
    SELECT c.customer_id, c.company_id, c.code, c.signed_at,
           row_number() OVER (PARTITION BY c.customer_id, c.company_id
                              ORDER BY c.signed_at DESC NULLS LAST, c.created_at DESC) AS rn,
           count(*) OVER (PARTITION BY c.customer_id, c.company_id) AS n
    FROM public.contracts c
    WHERE c.deleted_at IS NULL
      AND c.stage IN ('da_ky', 'hoan_thanh')
      AND c.customer_id IS NOT NULL
      AND (p_company_id IS NULL OR c.company_id = p_company_id)
  ),
  latest_care AS (
    SELECT DISTINCT ON (cl.customer_id, cl.company_id)
           cl.customer_id, cl.company_id, cl.next_action, cl.next_action_at, cl.closes_followup
    FROM public.contact_logs cl
    WHERE cl.customer_id IS NOT NULL AND cl.opportunity_id IS NULL AND cl.lead_id IS NULL
    ORDER BY cl.customer_id, cl.company_id, cl.contacted_at DESC, cl.created_at DESC
  )
  SELECT k.id, k.code::text, k.name, k.phone::text,
         s.company_id, co.code::text,
         s.n::integer, s.code::text, s.signed_at,
         (SELECT max(cl.contacted_at) FROM public.contact_logs cl
           WHERE cl.customer_id = k.id AND cl.company_id = s.company_id),
         CASE WHEN lc.closes_followup THEN NULL ELSE lc.next_action_at END,
         CASE WHEN lc.closes_followup THEN NULL ELSE lc.next_action END,
         (SELECT count(*)::integer FROM public.leads l
           WHERE l.referred_by_customer_id = k.id AND l.deleted_at IS NULL),
         u.full_name::text
  FROM signed s
  JOIN public.customers k ON k.id = s.customer_id AND k.deleted_at IS NULL
  LEFT JOIN public.users u ON u.id = k.responsible_user_id
  JOIN public.companies co ON co.id = s.company_id
  LEFT JOIN latest_care lc ON lc.customer_id = s.customer_id AND lc.company_id = s.company_id
  WHERE s.rn = 1
  ORDER BY (CASE WHEN lc.closes_followup THEN NULL ELSE lc.next_action_at END) NULLS FIRST,
           s.signed_at DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.old_customers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.old_customers(uuid) TO authenticated;
COMMENT ON FUNCTION public.old_customers(uuid) IS
  'Khách đã ký hợp đồng (mỗi khách × pháp nhân một dòng) kèm lần liên hệ gần nhất, hẹn chăm sóc tiếp, số khách đã giới thiệu (CRM-07, 0177).';

-- ----------------------------------------------------------------------------
-- Phễu từ đầu mối theo nguồn
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_funnel_by_source(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  source text,
  lead_count integer,
  contacted_count integer,
  converted_count integer,
  signed_count integer,
  archived_count integer,
  rejected_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.company_id, l.source::text,
         count(*)::integer,
         count(*) FILTER (WHERE l.status <> 'moi')::integer,
         count(*) FILTER (WHERE l.status = 'co_nhu_cau')::integer,
         count(*) FILTER (WHERE o.stage = 'ky_hop_dong')::integer,
         count(*) FILTER (WHERE l.status = 'luu_tru')::integer,
         count(*) FILTER (WHERE l.status = 'khong_phu_hop')::integer
  FROM public.leads l
  LEFT JOIN public.opportunities o ON o.id = l.opportunity_id
  WHERE l.deleted_at IS NULL
    AND (p_company_id IS NULL OR l.company_id = p_company_id)
  GROUP BY l.company_id, l.source
  ORDER BY count(*) DESC
$$;

REVOKE ALL ON FUNCTION public.lead_funnel_by_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_funnel_by_source(uuid) TO authenticated;
COMMENT ON FUNCTION public.lead_funnel_by_source(uuid) IS
  'Phễu từ đầu mối theo nguồn: đầu mối → đã liên hệ → thành cơ hội → ký hợp đồng (CRM-09, 0177).';
