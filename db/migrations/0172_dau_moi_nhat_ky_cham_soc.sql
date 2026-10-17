-- ============================================================================
-- Đợt 1 — 1A Đầu mối + 1B Nhật ký chăm sóc (doc/KE_HOACH_LAM_HO.md, PRD CRM-01).
--
-- Vấn đề số 1 của phiếu khảo sát Kinh doanh: «thông tin khách chỉ nằm trong Zalo rồi trôi
-- mất». Hệ thống bắt đầu từ CƠ HỘI — trước đó (người vừa gọi tới, data Marketing, khách được
-- giới thiệu chưa rõ nhu cầu) không có chỗ ghi.
--
--   leads          — đầu mối, theo pháp nhân (bảng GIAO DỊCH, có company_id): một người có
--                    thể là đầu mối của NVC và của NVO cùng lúc, mỗi bên một người phụ trách.
--                    Mới → Đã liên hệ → Có nhu cầu (= đã thành cơ hội) / M1 Lưu trữ / Không
--                    phù hợp (bắt buộc lý do).
--   contact_logs   — mỗi lần gọi / Zalo / gặp một dòng, BẤT BIẾN; bắt buộc bước tiếp theo +
--                    ngày hẹn (trừ khi dòng đó đóng việc theo dõi). Gắn với đầu mối, cơ hội
--                    hoặc khách hàng — một dòng thời gian cho cả vòng đời khách.
--
-- Không thay Zalo: hệ thống chỉ giữ KẾT QUẢ của lần liên hệ và việc tiếp theo, không chép
-- tin nhắn (CLAUDE.md 9.4).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE public.lead_status AS ENUM (
      'moi', 'da_lien_he', 'co_nhu_cau', 'luu_tru', 'khong_phu_hop'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_channel') THEN
    CREATE TYPE public.contact_channel AS ENUM ('goi_dien', 'zalo', 'gap_mat', 'email', 'khac');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 1. Đầu mối
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  code             varchar(40) NOT NULL UNIQUE,
  full_name        text NOT NULL CHECK (btrim(full_name) <> ''),
  phone            varchar(20),
  -- Chỉ giữ chữ số để so trùng: «0912.942.202» và «0912 942 202» là một số.
  phone_digits     varchar(20) GENERATED ALWAYS AS (
                     NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '')
                   ) STORED,
  email            varchar(255),
  area             text,
  source           varchar(32) NOT NULL,
  source_detail    text,
  need             text,
  project_type     varchar(64),
  status           public.lead_status NOT NULL DEFAULT 'moi',
  owner_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  next_action      text,
  next_action_at   date,
  last_contacted_at timestamptz,
  recontact_at     date,
  closed_reason    text,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  opportunity_id   uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  converted_at     timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at       timestamptz,
  -- Đầu mối không có cách liên lạc nào thì không chăm sóc được.
  CONSTRAINT leads_has_contact CHECK (
    NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL
  ),
  -- M1 Lưu trữ = chưa có nhu cầu NHƯNG sẽ liên hệ lại — không có ngày thì là bỏ quên.
  CONSTRAINT leads_archive_has_date CHECK (status <> 'luu_tru' OR recontact_at IS NOT NULL),
  CONSTRAINT leads_rejected_has_reason CHECK (
    status <> 'khong_phu_hop' OR NULLIF(btrim(COALESCE(closed_reason, '')), '') IS NOT NULL
  ),
  -- «Có nhu cầu» chỉ đạt được bằng `convert_lead` — nó tạo cơ hội.
  CONSTRAINT leads_converted_has_opportunity CHECK (
    status <> 'co_nhu_cau' OR (opportunity_id IS NOT NULL AND converted_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_phone_unique
  ON public.leads (company_id, phone_digits)
  WHERE deleted_at IS NULL AND phone_digits IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_company_status_idx ON public.leads (company_id, status);
CREATE INDEX IF NOT EXISTS leads_owner_next_idx ON public.leads (owner_id, next_action_at);

COMMENT ON TABLE public.leads IS
  'Đầu mối khách trước khi thành cơ hội (Đợt 1 — 1A, PRD CRM-01). Bảng giao dịch theo pháp nhân.';

SELECT public.attach_audit_touch('public.leads');

-- Cấp mã, người phụ trách mặc định, khoá các cột chỉ `convert_lead` được ghi.
CREATE OR REPLACE FUNCTION public.leads_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_company_code text;
  v_converting boolean := COALESCE(current_setting('nvg.lead_convert', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL OR NEW.code IS NULL OR btrim(NEW.code) = '' THEN
      SELECT code INTO v_company_code FROM public.companies WHERE id = NEW.company_id;
      IF v_company_code IS NULL THEN
        RAISE EXCEPTION 'Không tạo được đầu mối: chưa chọn pháp nhân.';
      END IF;
      NEW.code := public.issue_record_code(v_company_code, 'DM');
    END IF;
    NEW.owner_id := COALESCE(NEW.owner_id, public.auth_user_id());
    IF NOT v_converting THEN
      NEW.status := CASE WHEN NEW.status IN ('luu_tru', 'khong_phu_hop') THEN NEW.status ELSE 'moi' END;
      NEW.customer_id := NULL;
      NEW.opportunity_id := NULL;
      NEW.converted_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Không đổi được mã hoặc pháp nhân của đầu mối.';
  END IF;
  IF NOT v_converting AND (
       NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
       OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
       OR (NEW.status = 'co_nhu_cau' AND OLD.status <> 'co_nhu_cau')
     ) THEN
    RAISE EXCEPTION 'Chuyển đầu mối thành cơ hội bằng nút «Chuyển thành cơ hội».';
  END IF;
  -- Hai cột này do nhật ký chăm sóc ghi (trigger dưới), trình duyệt không tự khai.
  IF NOT v_converting AND COALESCE(current_setting('nvg.contact_log', true), '') <> 'on' THEN
    NEW.last_contacted_at := OLD.last_contacted_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_before_write ON public.leads;
CREATE TRIGGER leads_before_write
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_before_write();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leads FROM anon;

-- Xem: cả pháp nhân có quyền xem CRM (Mẫu A — đồng nghiệp biết khách đã có người chăm, khỏi
-- gọi trùng). Số điện thoại cá nhân nên KHÔNG mở cho phân hệ khác.
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('CRM')
  );

DROP POLICY IF EXISTS leads_insert ON public.leads;
-- Lãnh đạo (TGĐ, CFO, BGĐ, Quản trị) cũng đi chào khách (chủ dự án) nên tạo được đầu mối dù
-- vai trò không có quyền «tạo» CRM; KSNB thì không (`auth_manages_all_companies` loại vai chỉ xem).
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (public.auth_can_create_in('CRM', company_id) OR public.auth_manages_all_companies())
  );

-- Sửa: người phụ trách hoặc lãnh đạo (Mẫu B). Đã thành cơ hội thì chỉ xem — việc chăm sóc
-- tiếp tục trên cơ hội.
DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND converted_at IS NULL
    AND public.rls_owner_can_write(company_id, owner_id)
  )
  WITH CHECK (public.rls_company_access(company_id));

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Nhật ký chăm sóc
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  lead_id          uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  opportunity_id   uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  channel          public.contact_channel NOT NULL,
  contacted_at     timestamptz NOT NULL DEFAULT now(),
  content          text NOT NULL CHECK (btrim(content) <> ''),
  result           text,
  next_action      text,
  next_action_at   date,
  -- Dòng này kết thúc việc theo dõi (khách từ chối, đã chốt xong…) — không cần hẹn tiếp.
  closes_followup  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT contact_logs_has_subject CHECK (
    num_nonnulls(lead_id, customer_id, opportunity_id) >= 1
  ),
  -- Lời hứa «gọi lại sau» không có ngày là lời hứa bị quên (phiếu khảo sát Kinh doanh).
  CONSTRAINT contact_logs_next_step CHECK (
    closes_followup
    OR (NULLIF(btrim(COALESCE(next_action, '')), '') IS NOT NULL AND next_action_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS contact_logs_lead_idx ON public.contact_logs (lead_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS contact_logs_customer_idx ON public.contact_logs (customer_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS contact_logs_opportunity_idx ON public.contact_logs (opportunity_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS contact_logs_next_idx ON public.contact_logs (created_by, next_action_at);

COMMENT ON TABLE public.contact_logs IS
  'Nhật ký chăm sóc khách (Đợt 1 — 1B, PRD CRM-01): mỗi lần liên hệ một dòng, bất biến, bắt buộc bước tiếp + ngày hẹn.';

-- Pháp nhân suy từ hồ sơ cha; người ghi và thời điểm ghi do CSDL đặt; không ghi giờ tương lai.
CREATE OR REPLACE FUNCTION public.contact_logs_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_customer uuid;
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    SELECT company_id, customer_id INTO v_company, v_customer
    FROM public.opportunities WHERE id = NEW.opportunity_id AND deleted_at IS NULL;
    IF v_company IS NULL THEN RAISE EXCEPTION 'Không tìm thấy cơ hội.'; END IF;
    NEW.company_id := v_company;
    NEW.customer_id := COALESCE(NEW.customer_id, v_customer);
  ELSIF NEW.lead_id IS NOT NULL THEN
    SELECT company_id, customer_id INTO v_company, v_customer
    FROM public.leads WHERE id = NEW.lead_id AND deleted_at IS NULL;
    IF v_company IS NULL THEN RAISE EXCEPTION 'Không tìm thấy đầu mối.'; END IF;
    NEW.company_id := v_company;
    NEW.customer_id := COALESCE(NEW.customer_id, v_customer);
  ELSIF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Chọn pháp nhân trước khi ghi liên hệ với khách hàng.';
  END IF;

  NEW.created_at := now();
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  IF NEW.contacted_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Thời điểm liên hệ không được ở tương lai.';
  END IF;
  IF NEW.next_action_at IS NOT NULL
     AND NEW.next_action_at < (NEW.contacted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Ngày hẹn bước tiếp theo phải từ ngày liên hệ trở đi.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_logs_before_insert ON public.contact_logs;
CREATE TRIGGER contact_logs_before_insert
  BEFORE INSERT ON public.contact_logs
  FOR EACH ROW EXECUTE FUNCTION public.contact_logs_before_insert();

-- Liên hệ xong thì đầu mối mang luôn bước tiếp theo — danh sách và «việc hôm nay» đọc ở đó.
CREATE OR REPLACE FUNCTION public.contact_logs_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM set_config('nvg.contact_log', 'on', true);
    UPDATE public.leads
    SET next_action = CASE WHEN NEW.closes_followup THEN NULL ELSE NEW.next_action END,
        next_action_at = CASE WHEN NEW.closes_followup THEN NULL ELSE NEW.next_action_at END,
        last_contacted_at = GREATEST(COALESCE(last_contacted_at, NEW.contacted_at), NEW.contacted_at),
        status = CASE WHEN status = 'moi' THEN 'da_lien_he'::public.lead_status ELSE status END
    WHERE id = NEW.lead_id AND converted_at IS NULL;
    PERFORM set_config('nvg.contact_log', 'off', true);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contact_logs_after_insert ON public.contact_logs;
CREATE TRIGGER contact_logs_after_insert
  AFTER INSERT ON public.contact_logs
  FOR EACH ROW EXECUTE FUNCTION public.contact_logs_after_insert();

ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_logs FROM anon;

DROP POLICY IF EXISTS contact_logs_select ON public.contact_logs;
CREATE POLICY contact_logs_select ON public.contact_logs
  FOR SELECT TO authenticated
  USING (public.rls_company_access(company_id) AND public.auth_can_view_module('CRM'));

-- Ghi: có quyền tạo trong CRM của pháp nhân đó (hoặc là lãnh đạo — xem leads_insert), và (với đầu mối / cơ hội) là người phụ trách
-- hoặc lãnh đạo. Chăm sóc vẫn tiếp tục sau khi cơ hội bàn giao (CRM-07), nên không chặn theo
-- `handed_over_at`. `company_id` ở đây đã do trigger trước điền theo hồ sơ cha.
DROP POLICY IF EXISTS contact_logs_insert ON public.contact_logs;
CREATE POLICY contact_logs_insert ON public.contact_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND (public.auth_can_create_in('CRM', company_id) OR public.auth_manages_all_companies())
    AND (
      lead_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = lead_id AND public.rls_owner_can_write(l.company_id, l.owner_id)
      )
    )
    AND (
      opportunity_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.opportunities o
        WHERE o.id = opportunity_id AND public.rls_owner_can_write(o.company_id, o.owner_id)
      )
    )
  );

-- Không UPDATE / DELETE: nhật ký là lịch sử (Backend Schema 2.3).
GRANT SELECT, INSERT ON public.contact_logs TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Chuyển đầu mối thành cơ hội
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_lead(
  p_lead_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_opportunity_name text DEFAULT NULL,
  p_project_type text DEFAULT NULL,
  p_estimated_value bigint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_company_code text;
  v_customer uuid := p_customer_id;
  v_owner uuid;
  v_opportunity uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND deleted_at IS NULL FOR UPDATE;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy đầu mối.';
  END IF;
  IF NOT (public.rls_owner_can_write(v_lead.company_id, v_lead.owner_id)
          AND (public.auth_can_create_in('CRM', v_lead.company_id)
               OR public.auth_manages_all_companies())) THEN
    RAISE EXCEPTION 'Chỉ người phụ trách đầu mối hoặc Ban Giám đốc chuyển được đầu mối này thành cơ hội.';
  END IF;
  IF v_lead.converted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Đầu mối này đã thành cơ hội.';
  END IF;
  IF v_lead.status = 'khong_phu_hop' THEN
    RAISE EXCEPTION 'Đầu mối đã đánh dấu không phù hợp — mở lại trước khi chuyển thành cơ hội.';
  END IF;

  IF v_customer IS NULL THEN
    INSERT INTO public.customers
      (code, name, source, contact_person, phone, email, address, needs, responsible_user_id)
    VALUES
      ('', v_lead.full_name, v_lead.source, v_lead.full_name, v_lead.phone, v_lead.email,
       v_lead.area, v_lead.need, COALESCE(v_lead.owner_id, public.auth_user_id()))
    RETURNING id INTO v_customer;
  ELSIF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Không tìm thấy khách hàng đã chọn.';
  END IF;

  SELECT code INTO v_company_code FROM public.companies WHERE id = v_lead.company_id;
  v_owner := COALESCE(v_lead.owner_id, public.auth_user_id());

  INSERT INTO public.opportunities
    (company_id, code, customer_id, name, stage, owner_id, project_type, estimated_value, notes)
  VALUES
    (v_lead.company_id, public.issue_record_code(v_company_code, 'CH'), v_customer,
     COALESCE(NULLIF(btrim(p_opportunity_name), ''), 'Nhu cầu của ' || v_lead.full_name),
     'tiep_nhan', v_owner, COALESCE(NULLIF(btrim(p_project_type), ''), v_lead.project_type),
     p_estimated_value, v_lead.need)
  RETURNING id INTO v_opportunity;

  PERFORM set_config('nvg.lead_convert', 'on', true);
  UPDATE public.leads
  SET status = 'co_nhu_cau', customer_id = v_customer, opportunity_id = v_opportunity,
      converted_at = now(), next_action = NULL, next_action_at = NULL
  WHERE id = p_lead_id;
  -- Nhật ký trước đó đi theo khách hàng VÀ cơ hội: hồ sơ khách và cơ hội hiện đủ lịch sử từ lần
  -- đầu liên hệ (CRM-06 «bàn giao kèm toàn bộ lịch sử trao đổi»).
  UPDATE public.contact_logs
  SET customer_id = COALESCE(customer_id, v_customer),
      opportunity_id = COALESCE(opportunity_id, v_opportunity)
  WHERE lead_id = p_lead_id;
  PERFORM set_config('nvg.lead_convert', 'off', true);

  RETURN v_opportunity;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_lead(uuid, uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_lead(uuid, uuid, text, text, bigint) TO authenticated;
COMMENT ON FUNCTION public.convert_lead(uuid, uuid, text, text, bigint) IS
  'Đầu mối có nhu cầu → khách hàng (tạo mới hoặc dùng sẵn) + cơ hội ở bước Tiếp nhận; nhật ký chăm sóc đi theo khách.';

-- ----------------------------------------------------------------------------
-- 4. Kiểm trùng số điện thoại — chạy theo quyền người gọi (RLS lọc)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contact_duplicates(p_phone text, p_exclude_lead uuid DEFAULT NULL)
RETURNS TABLE (
  kind text,
  id uuid,
  code text,
  name text,
  company_code text,
  owner_name text,
  status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '') AS digits
  )
  SELECT 'lead', l.id, l.code::text, l.full_name, c.code::text, u.full_name, l.status::text
  FROM public.leads l
  JOIN q ON length(q.digits) >= 8 AND l.phone_digits = q.digits
  JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.users u ON u.id = l.owner_id
  WHERE l.deleted_at IS NULL AND l.id IS DISTINCT FROM p_exclude_lead
  UNION ALL
  SELECT 'customer', k.id, k.code::text, k.name, NULL, u.full_name, NULL
  FROM public.customers k
  JOIN q ON length(q.digits) >= 8
        AND regexp_replace(COALESCE(k.phone, ''), '\D', '', 'g') = q.digits
  LEFT JOIN public.users u ON u.id = k.responsible_user_id
  WHERE k.deleted_at IS NULL
  LIMIT 20
$$;

REVOKE ALL ON FUNCTION public.contact_duplicates(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contact_duplicates(text, uuid) TO authenticated;
COMMENT ON FUNCTION public.contact_duplicates(text, uuid) IS
  'Đầu mối / khách hàng có cùng số điện thoại mà người gọi được xem — để không gọi trùng khách của đồng nghiệp.';

-- Nhật ký của đầu mối đã chuyển trước khi `convert_lead` gắn cơ hội cho nhật ký (chạy lại được).
UPDATE public.contact_logs cl
SET opportunity_id = l.opportunity_id
FROM public.leads l
WHERE cl.lead_id = l.id AND l.opportunity_id IS NOT NULL AND cl.opportunity_id IS NULL;
