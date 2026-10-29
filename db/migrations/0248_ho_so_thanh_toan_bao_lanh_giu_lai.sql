-- 0248 — Hồ sơ thanh toán gửi chủ đầu tư, bảo lãnh hợp đồng, tiền giữ lại (gói G3 — A8, A9 của
-- doc/KE_HOACH_KHOP_KHAO_SAT_ANH_THI.md).
--
-- Khảo sát (HoSo_KhaoSat_NVG_full.md):
--   · dòng 759: «Hồ sơ thanh toán được Ban công trường, Phòng Thi công, Dự án/QS và Kế toán kiểm tra trước khi gửi
--     chủ đầu tư. Theo dõi giá trị đề nghị, giá trị được duyệt, hóa đơn, tiền đã thu, giữ lại và công nợ.»
--   · dòng 763: «Theo dõi … tiền hoặc bảo lãnh bảo hành … Khi hết thời hạn phải thực hiện thủ tục thanh lý và thu hồi
--     bảo lãnh / tiền giữ lại.»
--   · dòng 938: «cảnh báo trước khi … bảo lãnh hết hạn».
--
-- 1. Hồ sơ thanh toán = MỞ RỘNG `collection_requests` (0196), không bảng song song: đề nghị thu tiền ĐÃ là hồ sơ đề
--    nghị thanh toán gửi chủ đầu tư (một biên bản / một đợt → một hồ sơ, không lập trùng, đã có bản quét, in, ghi công
--    nợ). Bảng thứ hai sẽ đòi đồng bộ hai trạng thái cho cùng một tờ giấy.
--    · Chuỗi kiểm nội bộ bốn bước (bảng `collection_request_checks`, ký tuần tự, KHÔNG dùng `decide_approval`):
--        1 Ban công trường xác nhận khối lượng — người sửa được công trình trong phạm vi (`rls_site_writable`: chỉ huy
--          trưởng được phân công, Trưởng phòng Thi công);
--        2 Trưởng phòng Thi công — `milestone_technical_reviewers` (Thi công không phạm vi hiện trường, hoặc TGĐ / BGĐ);
--        3 Dự án / QS — vai trò Dự án – Đấu thầu của pháp nhân, HOẶC người chịu trách nhiệm hợp đồng (NVC: Phòng Dự án
--          bóc khối lượng và giữ hợp đồng với chủ đầu tư; NVO không có Phòng Dự án, người giữ hợp đồng kiểm);
--        4 Kế toán — quyền sửa phân hệ Kế toán.
--      Một người không ký hai bước của cùng một vòng (người lập / xác nhận khối lượng không tự kiểm ở bước Kế toán).
--      Trả lại phải ghi lý do; Kế toán sửa rồi gửi kiểm vòng mới từ bước 1. Đang kiểm / đã kiểm thì nội dung khoá.
--    · Bắt buộc khi tham số `kt.collection_check_chain` (theo pháp nhân) = true VÀ hồ sơ gắn công trình. Đặt sẵn cho NVC
--      (quy trình khảo sát nói rõ); NVO / NVS để trống = như cũ, vẫn gửi kiểm được nếu muốn. Chụp lúc lập hồ sơ
--      (`check_required`) — đổi tham số không hồi tố.
--    · Số tiền: đề nghị (`amount`, như cũ) → chủ đầu tư duyệt (`owner_approved_amount` + ngày + bản quét, ghi sau khi
--      đã gửi) → giữ lại (`retention_rate` / `retention_amount`, mặc định theo tỷ lệ ở điều khoản Bảo hành của hợp
--      đồng, Kế toán sửa được) → hoá đơn (chỉ số + ngày — hoá đơn điện tử ở phần mềm riêng, CLAUDE.md 5.3) → đã thu
--      (đọc từ chứng từ thu của hai khoản công nợ).
--    · «Ghi công nợ»: khoản phải thu = số duyệt − giữ lại; tiền giữ lại thành khoản phải thu RIÊNG
--      (`receivables_payables.receivable_kind = 'giu_lai'`), hạn = ngày hết bảo hành muộn nhất của công trình (tự cập
--      nhật khi khai bảo hành), không có thì hạn của điều khoản Bảo hành. Hai khoản cộng lại đúng bằng số duyệt — báo
--      cáo cả tập đoàn không đếm tiền giữ lại hai lần.
--    · Quyền đọc `collection_requests` thu về nhóm xem tài chính (`rls_sees_finance`): trước đây ai có quyền xem phân
--      hệ Kế toán (cả Thi công / chỉ huy trưởng, vì họ lập đề nghị chi) đều đọc được số tiền thu của mọi công trình.
--      Người kiểm ngoài Kế toán đọc qua `my_collection_checks()` — Thi công không thấy số tiền / số hợp đồng (Thi công
--      không xem phân hệ Hợp đồng).
-- 2. Bảo lãnh hợp đồng `contract_guarantees`: tạm ứng / thực hiện / bảo hành, cả hai chiều (NVG phát hành cho chủ đầu
--    tư; thầu phụ / nhà cung cấp phát hành cho NVG — suy từ loại hợp đồng). Đọc = xem phân hệ Hợp đồng hoặc nhóm tài
--    chính; ghi = người chịu trách nhiệm / Ban Giám đốc (như bản đã ký) hoặc Kế toán. Nhắc trước `kt.guarantee_remind_days`
--    (TRỐNG = chỉ báo khi đã hết hạn), hết hạn thì báo một lần và ghi «Hết hạn».
-- 3. Thu hồi tiền giữ lại: công trình kết thúc (hết bảo hành), hợp đồng quyết toán, hoặc lập biên bản thanh lý → báo
--    Kế toán + Giám đốc Tài chính + người chịu trách nhiệm nếu còn tiền giữ lại / bảo lãnh đang hiệu lực. Quét đêm báo
--    khoản giữ lại tới hạn (`kt.retention_remind_days`, TRỐNG = báo đúng ngày tới hạn).
-- Chạy lại được.

-- ============================================================================
-- 1. Cột mới
-- ============================================================================
ALTER TABLE public.receivables_payables
  ADD COLUMN IF NOT EXISTS receivable_kind text NOT NULL DEFAULT 'thuong',
  ADD COLUMN IF NOT EXISTS retention_reminded_at timestamptz;

ALTER TABLE public.receivables_payables DROP CONSTRAINT IF EXISTS receivables_payables_kind_check;
ALTER TABLE public.receivables_payables ADD CONSTRAINT receivables_payables_kind_check
  CHECK (receivable_kind IN ('thuong', 'giu_lai'));

CREATE INDEX IF NOT EXISTS receivables_retention_idx
  ON public.receivables_payables (company_id, due_date) WHERE receivable_kind = 'giu_lai' AND deleted_at IS NULL;

COMMENT ON COLUMN public.receivables_payables.receivable_kind IS
  'thuong: công nợ thường · giu_lai: tiền chủ đầu tư giữ lại bảo hành, thu hồi khi hết bảo hành / thanh lý (0248).';

ALTER TABLE public.collection_requests
  ADD COLUMN IF NOT EXISTS check_required          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_status            text,
  ADD COLUMN IF NOT EXISTS check_step              smallint,
  ADD COLUMN IF NOT EXISTS check_round             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_approved_amount   bigint,
  ADD COLUMN IF NOT EXISTS owner_approved_date     date,
  ADD COLUMN IF NOT EXISTS owner_approval_scan_path text,
  ADD COLUMN IF NOT EXISTS owner_approved_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retention_rate          numeric(5, 2),
  ADD COLUMN IF NOT EXISTS retention_amount        bigint,
  ADD COLUMN IF NOT EXISTS invoice_number          varchar(64),
  ADD COLUMN IF NOT EXISTS invoice_date            date,
  ADD COLUMN IF NOT EXISTS retention_receivable_id uuid REFERENCES public.receivables_payables(id) ON DELETE SET NULL;

ALTER TABLE public.collection_requests DROP CONSTRAINT IF EXISTS collection_requests_check_status_check;
ALTER TABLE public.collection_requests ADD CONSTRAINT collection_requests_check_status_check
  CHECK (check_status IS NULL OR check_status IN ('dang_kiem', 'da_kiem', 'tra_lai'));
ALTER TABLE public.collection_requests DROP CONSTRAINT IF EXISTS collection_requests_g3_amounts_check;
ALTER TABLE public.collection_requests ADD CONSTRAINT collection_requests_g3_amounts_check
  CHECK ((owner_approved_amount IS NULL OR owner_approved_amount > 0)
     AND (retention_amount IS NULL OR retention_amount >= 0)
     AND (retention_rate IS NULL OR (retention_rate >= 0 AND retention_rate < 100))
     AND (check_step IS NULL OR check_step BETWEEN 1 AND 4));

COMMENT ON COLUMN public.collection_requests.check_required IS
  'Phải qua bốn bước kiểm nội bộ trước khi gửi chủ đầu tư — chụp từ kt.collection_check_chain lúc lập (0248).';
COMMENT ON COLUMN public.collection_requests.owner_approved_amount IS
  'Số chủ đầu tư duyệt (đồng) — ghi khi hồ sơ duyệt của chủ đầu tư gửi về, kèm bản quét (0248).';
COMMENT ON COLUMN public.collection_requests.retention_amount IS
  'Tiền chủ đầu tư giữ lại bảo hành trên đợt này — thành khoản phải thu riêng lúc ghi công nợ (0248).';

-- Tham số: chuỗi kiểm (theo pháp nhân) + hai số ngày nhắc (TRỐNG).
INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, label, description)
SELECT v.k, 'global', NULL, NULL, v.l, v.d
FROM (VALUES
  ('kt.collection_check_chain', 'Hồ sơ thanh toán phải qua bốn bước kiểm nội bộ',
   'true = hồ sơ đề nghị thanh toán gắn công trình phải được Ban công trường, Trưởng phòng Thi công, Dự án / QS và Kế toán kiểm trước khi gửi chủ đầu tư. Đặt theo pháp nhân. Để trống = không bắt buộc.'),
  ('kt.guarantee_remind_days', 'Nhắc trước hạn bảo lãnh hợp đồng (ngày)',
   'Báo người chịu trách nhiệm hợp đồng, Kế toán, Giám đốc Tài chính trước N ngày bảo lãnh hết hạn. Để trống = chỉ báo khi đã hết hạn.'),
  ('kt.retention_remind_days', 'Nhắc trước hạn thu hồi tiền giữ lại (ngày)',
   'Báo trước N ngày khoản tiền giữ lại bảo hành tới hạn thu hồi. Để trống = báo đúng ngày tới hạn.')
) AS v(k, l, d)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p WHERE p.param_key = v.k AND p.scope_type = 'global'
);

INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, label, description)
SELECT 'kt.collection_check_chain', 'company', c.id, 'true'::jsonb,
       'Hồ sơ thanh toán phải qua bốn bước kiểm nội bộ — NVC',
       'Khảo sát NVC (dòng 759): Ban công trường, Phòng Thi công, Dự án / QS và Kế toán kiểm trước khi gửi chủ đầu tư.'
  FROM public.companies c
 WHERE c.code = 'NVC'
   AND NOT EXISTS (SELECT 1 FROM public.system_parameters p
                    WHERE p.param_key = 'kt.collection_check_chain' AND p.scope_type = 'company'
                      AND p.scope_id = c.id);

-- ============================================================================
-- 2. Chuỗi kiểm nội bộ
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.collection_request_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  collection_request_id uuid NOT NULL REFERENCES public.collection_requests(id) ON DELETE CASCADE,
  round_no              integer NOT NULL,
  step_no               smallint NOT NULL CHECK (step_no BETWEEN 1 AND 4),
  decision              text NOT NULL CHECK (decision IN ('dat', 'tra_lai')),
  note                  text,
  decided_by            uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decided_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_request_checks_note CHECK (decision = 'dat' OR btrim(COALESCE(note, '')) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_request_checks_one_per_step
  ON public.collection_request_checks (collection_request_id, round_no, step_no);

COMMENT ON TABLE public.collection_request_checks IS
  'Bốn bước kiểm hồ sơ thanh toán trước khi gửi chủ đầu tư: công trường → Thi công → Dự án / QS → Kế toán (0248). Chỉ ghi qua decide_collection_check.';

ALTER TABLE public.collection_request_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.collection_request_checks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.collection_request_checks FROM authenticated;
GRANT SELECT ON public.collection_request_checks TO authenticated;

DROP POLICY IF EXISTS collection_request_checks_select ON public.collection_request_checks;
CREATE POLICY collection_request_checks_select ON public.collection_request_checks
  FOR SELECT TO authenticated
  USING ((public.rls_sees_finance() AND public.rls_company_access(company_id))
         OR decided_by = public.auth_user_id());

CREATE OR REPLACE FUNCTION public.collection_check_step_label(p_step smallint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_step
    WHEN 1 THEN 'Ban công trường xác nhận khối lượng'
    WHEN 2 THEN 'Trưởng phòng Thi công kiểm'
    WHEN 3 THEN 'Dự án / QS kiểm'
    WHEN 4 THEN 'Kế toán kiểm'
  END;
$$;

-- Người đang đăng nhập có làm được bước p_step của hồ sơ không (chưa xét «đã ký bước khác»).
CREATE OR REPLACE FUNCTION public.collection_check_actor_ok(p_request_id uuid, p_step smallint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      record;
  v_user uuid := public.auth_user_id();
BEGIN
  IF v_user IS NULL OR public.auth_is_read_only() THEN
    RETURN false;
  END IF;
  SELECT cr.company_id, cr.construction_site_id, c.responsible_user_id INTO r
    FROM public.collection_requests cr JOIN public.contracts c ON c.id = cr.contract_id
   WHERE cr.id = p_request_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN CASE p_step
    WHEN 1 THEN r.construction_site_id IS NOT NULL AND public.rls_site_writable(r.construction_site_id)
    WHEN 2 THEN EXISTS (SELECT 1 FROM public.milestone_technical_reviewers(r.company_id) rv WHERE rv.user_id = v_user)
    WHEN 3 THEN public.rls_company_access(r.company_id) AND (
                  r.responsible_user_id = v_user
               OR EXISTS (SELECT 1 FROM public.user_companies uc
                            JOIN public.roles ro ON ro.id = uc.role_id
                            JOIN public.permissions pm ON pm.role_id = ro.id AND pm.module_code = 'DA'
                           WHERE uc.user_id = v_user AND uc.deleted_at IS NULL
                             AND uc.company_id = r.company_id AND ro.code::text = 'DA_DT' AND pm.can_edit))
    WHEN 4 THEN public.auth_can_edit_module('KT') AND public.rls_company_access(r.company_id)
    ELSE false
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.collection_check_actor_ok(uuid, smallint) FROM PUBLIC, anon, authenticated;

-- Người cần báo khi hồ sơ tới bước p_step.
CREATE OR REPLACE FUNCTION public.collection_check_recipients(p_request_id uuid, p_step smallint)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT cr.company_id, cr.construction_site_id, c.responsible_user_id, s.responsible_user_id AS site_user
      FROM public.collection_requests cr
      JOIN public.contracts c ON c.id = cr.contract_id
      LEFT JOIN public.construction_sites s ON s.id = cr.construction_site_id
     WHERE cr.id = p_request_id
  ), by_role AS (
    SELECT DISTINCT u.id, ro.code::text AS role_code, uc.company_id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles ro ON ro.id = uc.role_id
     WHERE u.is_active AND u.deleted_at IS NULL
  )
  SELECT DISTINCT x.id FROM (
    -- 1: chỉ huy trưởng công trình + người được phân công; không ai thì Trưởng phòng Thi công.
    SELECT r.site_user AS id FROM r WHERE p_step = 1 AND r.site_user IS NOT NULL
    UNION
    SELECT a.user_id FROM r JOIN public.user_site_assignments a ON a.construction_site_id = r.construction_site_id
     WHERE p_step = 1 AND (a.assigned_to IS NULL OR a.assigned_to >= current_date)
    UNION
    SELECT b.id FROM r JOIN by_role b ON b.company_id = r.company_id AND b.role_code = 'TC'
     WHERE p_step = 2 OR (p_step = 1 AND r.site_user IS NULL)
    UNION
    SELECT r.responsible_user_id FROM r WHERE p_step = 3
    UNION
    SELECT b.id FROM r JOIN by_role b ON b.company_id = r.company_id AND b.role_code = 'DA_DT' WHERE p_step = 3
    UNION
    SELECT b.id FROM r JOIN by_role b ON b.company_id = r.company_id AND b.role_code = 'KT' WHERE p_step = 4
  ) x
  JOIN public.users u ON u.id = x.id AND u.is_active AND u.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.collection_check_recipients(uuid, smallint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_collection_check_step(p_request_id uuid, p_step smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT cr.id, cr.company_id, cr.code, cr.title INTO r FROM public.collection_requests cr WHERE cr.id = p_request_id;
  PERFORM public.create_notification(
    rc.user_id, r.company_id, 'collection_check_step',
    format('Hồ sơ thanh toán %s chờ bước «%s» — kiểm trước khi gửi chủ đầu tư.', r.code,
           public.collection_check_step_label(p_step)),
    'collection_requests', r.id, '/kiem-ho-so-thanh-toan'
  )
  FROM public.collection_check_recipients(p_request_id, p_step) rc;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_collection_check_step(uuid, smallint) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Canh cột mới + điều kiện «đã kiểm đủ» trước khi gửi / ghi công nợ.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collection_requests_g3_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.check_required := NEW.construction_site_id IS NOT NULL
    AND COALESCE(public.system_parameter('kt.collection_check_chain', 'company', NEW.company_id) = 'true'::jsonb, false);
  NEW.check_status := NULL;
  NEW.check_step := NULL;
  NEW.check_round := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_requests_g3_before_insert ON public.collection_requests;
CREATE TRIGGER collection_requests_g3_before_insert
  BEFORE INSERT ON public.collection_requests
  FOR EACH ROW EXECUTE FUNCTION public.collection_requests_g3_before_insert();

CREATE OR REPLACE FUNCTION public.collection_requests_g3_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Chạy cả khi cờ hàm đang bật: không đường nào gửi / ghi công nợ hồ sơ bắt buộc kiểm mà chưa kiểm đủ.
  IF OLD.status = 'nhap' AND NEW.status IN ('da_gui', 'da_ghi_cong_no')
     AND NEW.check_required AND NEW.check_status IS DISTINCT FROM 'da_kiem' THEN
    RAISE EXCEPTION 'Hồ sơ thanh toán chưa qua đủ bốn bước kiểm nội bộ (công trường, Thi công, Dự án / QS, Kế toán) — chưa gửi chủ đầu tư được.';
  END IF;
  IF COALESCE(current_setting('nvg.collection_request', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.check_required IS DISTINCT FROM OLD.check_required
     OR NEW.check_status IS DISTINCT FROM OLD.check_status OR NEW.check_step IS DISTINCT FROM OLD.check_step
     OR NEW.check_round IS DISTINCT FROM OLD.check_round
     OR NEW.owner_approved_amount IS DISTINCT FROM OLD.owner_approved_amount
     OR NEW.owner_approved_date IS DISTINCT FROM OLD.owner_approved_date
     OR NEW.owner_approval_scan_path IS DISTINCT FROM OLD.owner_approval_scan_path
     OR NEW.owner_approved_by IS DISTINCT FROM OLD.owner_approved_by
     OR NEW.retention_rate IS DISTINCT FROM OLD.retention_rate
     OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
     OR NEW.retention_receivable_id IS DISTINCT FROM OLD.retention_receivable_id THEN
    RAISE EXCEPTION 'Số chủ đầu tư duyệt, tiền giữ lại, hoá đơn và các bước kiểm chỉ ghi bằng các nút trên hồ sơ.';
  END IF;
  IF OLD.check_status IN ('dang_kiem', 'da_kiem') AND (
       NEW.amount IS DISTINCT FROM OLD.amount OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.basis IS DISTINCT FROM OLD.basis OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.party_name IS DISTINCT FROM OLD.party_name) THEN
    RAISE EXCEPTION 'Hồ sơ đang / đã qua kiểm nội bộ — không sửa nội dung. Cần sửa thì người kiểm trả lại, sửa rồi gửi kiểm lại.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_requests_g3_guard ON public.collection_requests;
CREATE TRIGGER collection_requests_g3_guard
  BEFORE UPDATE ON public.collection_requests
  FOR EACH ROW EXECUTE FUNCTION public.collection_requests_g3_guard();

-- Quyền đọc hồ sơ / kho bản quét: nhóm xem tài chính (trước: mọi người xem được phân hệ Kế toán).
DROP POLICY IF EXISTS collection_requests_select ON public.collection_requests;
CREATE POLICY collection_requests_select ON public.collection_requests
  FOR SELECT TO authenticated
  USING (public.auth_can_view_module('KT') AND public.rls_sees_finance() AND public.rls_company_access(company_id));

CREATE OR REPLACE FUNCTION public.rls_collection_request_access(p_id uuid, p_write boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collection_requests r
     WHERE r.id = p_id AND public.rls_company_access(r.company_id)
       AND public.auth_can_view_module('KT') AND public.rls_sees_finance()
       AND (NOT p_write OR (r.status <> 'huy' AND NOT public.auth_is_read_only()
                            AND public.auth_can_edit_module('KT')))
  );
$$;

-- ----------------------------------------------------------------------------
-- Gửi kiểm / quyết định từng bước
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_collection_check(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.collection_requests := public.collection_request_for_action(p_id);
BEGIN
  IF r.status <> 'nhap' THEN
    RAISE EXCEPTION 'Chỉ gửi kiểm hồ sơ còn nháp (chưa gửi chủ đầu tư).';
  END IF;
  IF r.construction_site_id IS NULL THEN
    RAISE EXCEPTION 'Hồ sơ không gắn công trình — không có bước Ban công trường xác nhận khối lượng.';
  END IF;
  IF r.check_status IN ('dang_kiem', 'da_kiem') THEN
    RAISE EXCEPTION 'Hồ sơ đang kiểm hoặc đã kiểm xong.';
  END IF;
  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET check_status = 'dang_kiem', check_step = 1, check_round = check_round + 1
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);
  PERFORM public.notify_collection_check_step(p_id, 1::smallint);
  RETURN r.check_round + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.start_collection_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_collection_check(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_collection_check(p_id uuid, p_pass boolean, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      public.collection_requests;
  v_user uuid := public.auth_user_id();
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_next smallint;
BEGIN
  SELECT * INTO r FROM public.collection_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.check_status IS DISTINCT FROM 'dang_kiem' OR r.status <> 'nhap' THEN
    RAISE EXCEPTION 'Hồ sơ không ở bước kiểm nội bộ.';
  END IF;
  IF NOT public.collection_check_actor_ok(p_id, r.check_step) THEN
    RAISE EXCEPTION 'Hồ sơ đang chờ bước «%» — chỉ người phụ trách bước đó kiểm được, không bỏ qua bước.',
      public.collection_check_step_label(r.check_step);
  END IF;
  IF EXISTS (SELECT 1 FROM public.collection_request_checks k
              WHERE k.collection_request_id = p_id AND k.round_no = r.check_round AND k.decided_by = v_user) THEN
    RAISE EXCEPTION 'Đã ký một bước của hồ sơ này — bước «%» phải do người khác kiểm.',
      public.collection_check_step_label(r.check_step);
  END IF;
  IF NOT p_pass AND v_note IS NULL THEN
    RAISE EXCEPTION 'Vui lòng ghi lý do trả lại để Kế toán biết cần sửa gì.';
  END IF;

  INSERT INTO public.collection_request_checks
    (company_id, collection_request_id, round_no, step_no, decision, note, decided_by)
  VALUES (r.company_id, p_id, r.check_round, r.check_step, CASE WHEN p_pass THEN 'dat' ELSE 'tra_lai' END, v_note, v_user);

  PERFORM set_config('nvg.collection_request', 'on', true);
  IF NOT p_pass THEN
    UPDATE public.collection_requests SET check_status = 'tra_lai', check_step = NULL WHERE id = p_id;
  ELSIF r.check_step = 4 THEN
    UPDATE public.collection_requests SET check_status = 'da_kiem', check_step = NULL WHERE id = p_id;
  ELSE
    v_next := r.check_step + 1;
    UPDATE public.collection_requests SET check_step = v_next WHERE id = p_id;
  END IF;
  PERFORM set_config('nvg.collection_request', '', true);

  IF NOT p_pass THEN
    PERFORM public.create_notification(
      u.id, r.company_id, 'collection_check_returned',
      format('Hồ sơ thanh toán %s bị trả lại ở bước «%s»: %s', r.code,
             public.collection_check_step_label(r.check_step), v_note),
      'collection_requests', p_id, '/kt/de-nghi-thu/' || p_id::text
    )
    FROM public.users u
    WHERE u.id IN (r.created_by) OR u.id IN (SELECT rc.user_id FROM public.collection_check_recipients(p_id, 4::smallint) rc);
    RETURN 'tra_lai';
  ELSIF v_next IS NULL THEN
    PERFORM public.create_notification(
      u.id, r.company_id, 'collection_check_done',
      format('Hồ sơ thanh toán %s đã qua đủ bốn bước kiểm — in, ký và gửi chủ đầu tư.', r.code),
      'collection_requests', p_id, '/kt/de-nghi-thu/' || p_id::text
    )
    FROM public.users u WHERE u.id = r.created_by;
    RETURN 'da_kiem';
  ELSE
    PERFORM public.notify_collection_check_step(p_id, v_next);
    RETURN 'buoc_' || v_next;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_collection_check(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_collection_check(uuid, boolean, text) TO authenticated;

-- Việc kiểm đang chờ người đăng nhập. Số tiền, số hợp đồng, căn cứ chỉ trả cho người xem được phân hệ Hợp đồng
-- hoặc nhóm tài chính — Thi công kiểm khối lượng theo biên bản, không thấy giá trị hợp đồng.
CREATE OR REPLACE FUNCTION public.my_collection_checks()
RETURNS TABLE (
  id               uuid,
  company_code     text,
  code             text,
  title            text,
  step_no          smallint,
  step_label       text,
  round_no         integer,
  contract_number  text,
  amount           bigint,
  basis            text,
  site_id          uuid,
  site_code        text,
  site_name        text,
  acceptance_id    uuid,
  acceptance_code  text,
  acceptance_stage text,
  previous_checks  jsonb,
  waiting_since    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user  uuid := public.auth_user_id();
  v_money boolean := public.rls_sees_finance() OR public.auth_can_view_module('HD');
BEGIN
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT cr.id, co.code::text, cr.code::text, cr.title, cr.check_step,
         public.collection_check_step_label(cr.check_step), cr.check_round,
         CASE WHEN v_money THEN COALESCE(c.contract_number, c.code)::text END,
         CASE WHEN v_money THEN cr.amount END,
         CASE WHEN v_money THEN cr.basis END,
         s.id, s.code::text, s.name::text, a.id, a.code::text, a.stage_name::text,
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'step_no', k.step_no, 'step_label', public.collection_check_step_label(k.step_no),
                     'decision', k.decision, 'note', k.note, 'decided_at', k.decided_at,
                     'decided_by', u.full_name) ORDER BY k.step_no)
                     FROM public.collection_request_checks k JOIN public.users u ON u.id = k.decided_by
                    WHERE k.collection_request_id = cr.id AND k.round_no = cr.check_round), '[]'::jsonb),
         COALESCE((SELECT max(k.decided_at) FROM public.collection_request_checks k
                    WHERE k.collection_request_id = cr.id AND k.round_no = cr.check_round), cr.updated_at)
    FROM public.collection_requests cr
    JOIN public.companies co ON co.id = cr.company_id
    JOIN public.contracts c ON c.id = cr.contract_id
    LEFT JOIN public.construction_sites s ON s.id = cr.construction_site_id
    LEFT JOIN public.acceptance_records a ON a.id = cr.acceptance_record_id
   WHERE cr.status = 'nhap' AND cr.check_status = 'dang_kiem'
     AND public.collection_check_actor_ok(cr.id, cr.check_step)
     AND NOT EXISTS (SELECT 1 FROM public.collection_request_checks k
                      WHERE k.collection_request_id = cr.id AND k.round_no = cr.check_round
                        AND k.decided_by = v_user)
   ORDER BY cr.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.my_collection_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_collection_checks() TO authenticated;

-- ============================================================================
-- 3. Chủ đầu tư duyệt + giữ lại + ghi công nợ
-- ============================================================================
-- Tỷ lệ giữ lại ghi ở điều khoản Bảo hành của hợp đồng (vd «5»), không có thì rỗng.
CREATE OR REPLACE FUNCTION public.contract_retention_rate(p_contract_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rtrim(replace(btrim(ct.percent_value), ',', '.'), '%')::numeric
    FROM public.contract_terms ct
   WHERE ct.contract_id = p_contract_id AND ct.term_type = 'bao_hanh' AND ct.deleted_at IS NULL
     AND replace(btrim(COALESCE(ct.percent_value, '')), ',', '.') ~ '^[0-9]+(\.[0-9]+)?%?$'
     AND rtrim(replace(btrim(ct.percent_value), ',', '.'), '%')::numeric < 100
   ORDER BY ct.position, ct.created_at
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.contract_retention_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_retention_rate(uuid) TO authenticated;

-- Hạn thu hồi tiền giữ lại: ngày hết bảo hành muộn nhất của công trình; không có thì hạn điều khoản Bảo hành.
CREATE OR REPLACE FUNCTION public.retention_due_date(p_contract_id uuid, p_site_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT max(w.warranty_until) FROM public.warranties w
      WHERE w.construction_site_id = p_site_id AND w.deleted_at IS NULL),
    (SELECT max(ct.due_date) FROM public.contract_terms ct
      WHERE ct.contract_id = p_contract_id AND ct.term_type = 'bao_hanh' AND ct.deleted_at IS NULL));
$$;

REVOKE ALL ON FUNCTION public.retention_due_date(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_collection_owner_approval(
  p_id               uuid,
  p_approved_amount  bigint,
  p_approved_date    date,
  p_scan_path        text,
  p_retention_rate   numeric DEFAULT NULL,
  p_retention_amount bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      public.collection_requests := public.collection_request_for_action(p_id);
  v_rate numeric := p_retention_rate;
  v_ret  bigint;
BEGIN
  IF r.status <> 'da_gui' THEN
    RAISE EXCEPTION 'Ghi số chủ đầu tư duyệt sau khi đã gửi hồ sơ và trước khi ghi công nợ.';
  END IF;
  IF COALESCE(p_approved_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập số chủ đầu tư duyệt lớn hơn 0.';
  END IF;
  IF p_approved_date IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập ngày chủ đầu tư duyệt.';
  END IF;
  IF p_scan_path IS NULL OR left(p_scan_path, length(p_id::text) + 1) <> p_id::text || '/'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'collection-docs' AND o.name = p_scan_path) THEN
    RAISE EXCEPTION 'Vui lòng quét / tải lên bản chủ đầu tư duyệt trước khi ghi số duyệt.';
  END IF;
  IF p_retention_amount IS NOT NULL THEN
    v_ret := p_retention_amount;
  ELSE
    v_rate := COALESCE(v_rate, public.contract_retention_rate(r.contract_id));
    v_ret := CASE WHEN v_rate IS NULL THEN 0 ELSE round(p_approved_amount * v_rate / 100)::bigint END;
  END IF;
  IF v_ret < 0 OR v_ret >= p_approved_amount THEN
    RAISE EXCEPTION 'Tiền giữ lại phải nhỏ hơn số chủ đầu tư duyệt.';
  END IF;
  IF v_rate IS NOT NULL AND (v_rate < 0 OR v_rate >= 100) THEN
    RAISE EXCEPTION 'Tỷ lệ giữ lại phải từ 0 đến dưới 100%%.';
  END IF;

  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET owner_approved_amount = p_approved_amount, owner_approved_date = p_approved_date,
         owner_approval_scan_path = p_scan_path, owner_approved_by = public.auth_user_id(),
         retention_rate = CASE WHEN p_retention_amount IS NOT NULL THEN p_retention_rate ELSE v_rate END,
         retention_amount = v_ret
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);
  RETURN v_ret;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collection_owner_approval(uuid, bigint, date, text, numeric, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_collection_owner_approval(uuid, bigint, date, text, numeric, bigint) TO authenticated;

-- Thay bản 0196: thêm ngày hoá đơn, số duyệt, tách tiền giữ lại thành khoản phải thu riêng.
DROP FUNCTION IF EXISTS public.record_collection_receivable(uuid, date, text);
CREATE OR REPLACE FUNCTION public.record_collection_receivable(
  p_id uuid, p_due_date date DEFAULT NULL, p_invoice_number text DEFAULT NULL, p_invoice_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r         public.collection_requests := public.collection_request_for_action(p_id);
  v_user    uuid := public.auth_user_id();
  v_base    bigint;
  v_ret     bigint;
  v_rp      uuid;
  v_ret_rp  uuid;
  v_invoice text := NULLIF(btrim(COALESCE(p_invoice_number, r.invoice_number, '')), '');
  v_inv_dt  date := COALESCE(p_invoice_date, r.invoice_date);
BEGIN
  IF r.status NOT IN ('nhap', 'da_gui') THEN
    RAISE EXCEPTION 'Đề nghị này đã ghi công nợ hoặc đã hủy.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Chỉ Kế toán / Tài chính ghi được công nợ.';
  END IF;
  IF r.check_required AND r.check_status IS DISTINCT FROM 'da_kiem' THEN
    RAISE EXCEPTION 'Hồ sơ thanh toán chưa qua đủ bốn bước kiểm nội bộ — chưa ghi công nợ được.';
  END IF;
  IF r.check_required AND r.owner_approved_amount IS NULL THEN
    RAISE EXCEPTION 'Chưa ghi số chủ đầu tư duyệt — công nợ ghi theo số được duyệt, không theo số đề nghị.';
  END IF;
  v_base := COALESCE(r.owner_approved_amount, r.amount);
  v_ret := COALESCE(r.retention_amount, 0);

  INSERT INTO public.receivables_payables (
    company_id, direction, party_type, customer_id, party_name, contract_id, construction_site_id,
    invoice_number, invoice_date, description, amount, due_date, created_by, updated_by
  ) VALUES (
    r.company_id, 'phai_thu', 'khach_hang', r.customer_id, r.party_name, r.contract_id,
    r.construction_site_id, v_invoice, v_inv_dt,
    r.title || ' (' || r.code || ')', v_base - v_ret, COALESCE(p_due_date, r.due_date), v_user, v_user
  )
  RETURNING id INTO v_rp;

  IF v_ret > 0 THEN
    INSERT INTO public.receivables_payables (
      company_id, direction, party_type, customer_id, party_name, contract_id, construction_site_id,
      receivable_kind, invoice_number, invoice_date, description, amount, due_date, created_by, updated_by
    ) VALUES (
      r.company_id, 'phai_thu', 'khach_hang', r.customer_id, r.party_name, r.contract_id,
      r.construction_site_id, 'giu_lai', v_invoice, v_inv_dt,
      'Tiền giữ lại bảo hành — ' || r.title || ' (' || r.code || ')', v_ret,
      public.retention_due_date(r.contract_id, r.construction_site_id), v_user, v_user
    )
    RETURNING id INTO v_ret_rp;
  END IF;

  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET status = 'da_ghi_cong_no', receivable_id = v_rp, retention_receivable_id = v_ret_rp,
         recorded_at = now(), recorded_by = v_user,
         due_date = COALESCE(p_due_date, due_date), invoice_number = v_invoice, invoice_date = v_inv_dt,
         sent_at = COALESCE(sent_at, now()), sent_by = COALESCE(sent_by, v_user)
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);

  UPDATE public.acceptance_records
     SET billing_recorded_at = now(), billing_recorded_by = v_user,
         billing_note = 'Đề nghị thu ' || r.code
   WHERE id = r.acceptance_record_id AND billing_recorded_at IS NULL;
  RETURN v_rp;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collection_receivable(uuid, date, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_collection_receivable(uuid, date, text, date) TO authenticated;

-- Khai / sửa bảo hành công trình → hạn thu hồi tiền giữ lại còn mở theo ngày hết bảo hành muộn nhất.
CREATE OR REPLACE FUNCTION public.warranties_refresh_retention_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site uuid := COALESCE(NEW.construction_site_id, OLD.construction_site_id);
  v_due  date;
BEGIN
  SELECT max(w.warranty_until) INTO v_due FROM public.warranties w
   WHERE w.construction_site_id = v_site AND w.deleted_at IS NULL;
  IF v_due IS NOT NULL THEN
    UPDATE public.receivables_payables rp
       SET due_date = v_due, retention_reminded_at = NULL
     WHERE rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL AND rp.construction_site_id = v_site
       AND rp.settled_amount < rp.amount AND rp.due_date IS DISTINCT FROM v_due;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS warranties_refresh_retention_due ON public.warranties;
CREATE TRIGGER warranties_refresh_retention_due
  AFTER INSERT OR UPDATE OF warranty_until, deleted_at ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.warranties_refresh_retention_due();

-- ============================================================================
-- 4. Bảo lãnh hợp đồng
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contract_guarantees (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  contract_id         uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  direction           text NOT NULL CHECK (direction IN ('nvg_phat_hanh', 'doi_tac_phat_hanh')),
  guarantee_type      text NOT NULL CHECK (guarantee_type IN ('tam_ung', 'thuc_hien', 'bao_hanh')),
  bank_name           varchar(255) NOT NULL CHECK (btrim(bank_name) <> ''),
  guarantee_number    varchar(64),
  amount              bigint NOT NULL CHECK (amount > 0),
  valid_from          date,
  valid_to            date NOT NULL,
  scan_path           text,
  status              text NOT NULL DEFAULT 'dang_hieu_luc'
    CHECK (status IN ('dang_hieu_luc', 'da_thu_hoi', 'da_giai_toa', 'het_han')),
  closed_date         date,
  close_note          text,
  closed_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  last_reminded_stage smallint,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS contract_guarantees_contract_idx ON public.contract_guarantees (contract_id, status);
CREATE INDEX IF NOT EXISTS contract_guarantees_expiry_idx
  ON public.contract_guarantees (valid_to) WHERE status = 'dang_hieu_luc' AND deleted_at IS NULL;

COMMENT ON TABLE public.contract_guarantees IS
  'Bảo lãnh tạm ứng / thực hiện / bảo hành của hợp đồng, cả NVG phát hành lẫn đối tác phát hành cho NVG (0248). Nhắc trước khi hết hạn.';

CREATE OR REPLACE FUNCTION public.rls_contract_guarantee_readable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = p_contract_id AND c.deleted_at IS NULL
       AND public.rls_company_access(c.company_id)
       AND (public.auth_can_view_module('HD') OR public.rls_sees_finance())
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_contract_guarantee_writable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = p_contract_id AND c.deleted_at IS NULL AND c.stage::text <> 'huy'
       AND public.rls_company_access(c.company_id)
       AND (public.rls_contract_scan_uploader(c.id) OR public.auth_can_edit_module('KT'))
  );
$$;

REVOKE ALL ON FUNCTION public.rls_contract_guarantee_readable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_contract_guarantee_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_contract_guarantee_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_contract_guarantee_writable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contract_guarantees_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_flag  boolean := COALESCE(current_setting('nvg.contract_guarantee', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.company_id,
           CASE WHEN c.type::text IN ('khoan_thau_phu', 'mua_vat_tu', 'thue_thiet_bi')
                THEN 'doi_tac_phat_hanh' ELSE 'nvg_phat_hanh' END
      INTO NEW.company_id, NEW.direction
      FROM public.contracts c WHERE c.id = NEW.contract_id;
    NEW.status := 'dang_hieu_luc';
    NEW.closed_date := NULL;
    NEW.close_note := NULL;
    NEW.closed_by := NULL;
    NEW.last_reminded_stage := NULL;
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.contract_id := OLD.contract_id;
    NEW.direction := OLD.direction;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    IF OLD.status IN ('da_thu_hoi', 'da_giai_toa') THEN
      RAISE EXCEPTION 'Bảo lãnh đã thu hồi / giải toả — không sửa được.';
    END IF;
    IF NOT v_flag AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.closed_date IS DISTINCT FROM OLD.closed_date
         OR NEW.close_note IS DISTINCT FROM OLD.close_note OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
         OR NEW.last_reminded_stage IS DISTINCT FROM OLD.last_reminded_stage) THEN
      RAISE EXCEPTION 'Trạng thái bảo lãnh chỉ đổi bằng nút «Ghi thu hồi / giải toả».';
    END IF;
    IF NEW.valid_to IS DISTINCT FROM OLD.valid_to THEN
      -- Gia hạn: nhắc lại theo hạn mới; đã ghi hết hạn mà hạn mới còn hiệu lực thì quay lại «Đang hiệu lực».
      NEW.last_reminded_stage := NULL;
      IF NEW.status = 'het_han' AND NEW.valid_to >= v_today THEN
        NEW.status := 'dang_hieu_luc';
      END IF;
    END IF;
  END IF;
  IF NEW.valid_from IS NOT NULL AND NEW.valid_to < NEW.valid_from THEN
    RAISE EXCEPTION 'Ngày hết hiệu lực bảo lãnh phải sau ngày bắt đầu.';
  END IF;
  IF NEW.scan_path IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.scan_path IS DISTINCT FROM OLD.scan_path)
     AND (left(NEW.scan_path, length(NEW.contract_id::text) + 1) <> NEW.contract_id::text || '/'
          OR NOT EXISTS (SELECT 1 FROM storage.objects o
                          WHERE o.bucket_id = 'guarantee-docs' AND o.name = NEW.scan_path)) THEN
    RAISE EXCEPTION 'Tệp bản quét không thuộc hợp đồng này — tải lại.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_guarantees_before_write ON public.contract_guarantees;
CREATE TRIGGER contract_guarantees_before_write
  BEFORE INSERT OR UPDATE ON public.contract_guarantees
  FOR EACH ROW EXECUTE FUNCTION public.contract_guarantees_before_write();

ALTER TABLE public.contract_guarantees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_guarantees FROM anon;
REVOKE DELETE ON public.contract_guarantees FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.contract_guarantees TO authenticated;

DROP POLICY IF EXISTS contract_guarantees_select ON public.contract_guarantees;
CREATE POLICY contract_guarantees_select ON public.contract_guarantees
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_contract_guarantee_readable(contract_id));

DROP POLICY IF EXISTS contract_guarantees_insert ON public.contract_guarantees;
CREATE POLICY contract_guarantees_insert ON public.contract_guarantees
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_contract_guarantee_writable(contract_id));

DROP POLICY IF EXISTS contract_guarantees_update ON public.contract_guarantees;
CREATE POLICY contract_guarantees_update ON public.contract_guarantees
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_contract_guarantee_writable(contract_id))
  WITH CHECK (public.rls_contract_guarantee_writable(contract_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guarantee-docs', 'guarantee-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS guarantee_docs_select ON storage.objects;
CREATE POLICY guarantee_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'guarantee-docs'
         AND public.rls_contract_guarantee_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS guarantee_docs_insert ON storage.objects;
CREATE POLICY guarantee_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'guarantee-docs'
              AND public.rls_contract_guarantee_writable(public.try_uuid((storage.foldername(name))[1])));

CREATE OR REPLACE FUNCTION public.close_contract_guarantee(
  p_id uuid, p_status text, p_closed_date date, p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.contract_guarantees;
BEGIN
  SELECT * INTO g FROM public.contract_guarantees WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_contract_guarantee_writable(g.contract_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng, Ban Giám đốc hoặc Kế toán ghi được thu hồi / giải toả bảo lãnh.';
  END IF;
  IF p_status NOT IN ('da_thu_hoi', 'da_giai_toa') THEN
    RAISE EXCEPTION 'Chọn «Đã thu hồi» hoặc «Đã giải toả».';
  END IF;
  IF p_closed_date IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập ngày thu hồi / giải toả.';
  END IF;
  PERFORM set_config('nvg.contract_guarantee', 'on', true);
  UPDATE public.contract_guarantees
     SET status = p_status, closed_date = p_closed_date, close_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         closed_by = public.auth_user_id()
   WHERE id = p_id;
  PERFORM set_config('nvg.contract_guarantee', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.close_contract_guarantee(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_contract_guarantee(uuid, text, date, text) TO authenticated;

-- Người nhận cảnh báo tiền của một hợp đồng: Kế toán + Giám đốc Tài chính của pháp nhân + người chịu trách nhiệm.
CREATE OR REPLACE FUNCTION public.notify_contract_money_people(
  p_contract_id uuid, p_type text, p_message text, p_entity_type text, p_entity_id uuid, p_url text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c      record;
  v_sent integer := 0;
BEGIN
  SELECT id, company_id, responsible_user_id INTO c FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT count(public.create_notification(recipient.id, c.company_id, p_type, p_message, p_entity_type,
                                          p_entity_id, p_url))
    INTO v_sent
    FROM (
      SELECT DISTINCT u.id
        FROM public.users u
        JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
        JOIN public.roles r ON r.id = uc.role_id
       WHERE u.is_active AND u.deleted_at IS NULL
         AND (uc.company_id = c.company_id OR r.sees_all_companies)
         AND r.code::text IN ('KT', 'CFO')
      UNION
      SELECT u.id FROM public.users u
       WHERE u.id = c.responsible_user_id AND u.is_active AND u.deleted_at IS NULL
    ) recipient;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_contract_money_people(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. Tiền giữ lại + bảo lãnh còn mở của một hợp đồng (khối thanh lý, thẻ hợp đồng)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.contract_open_retention_guarantees(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.rls_contract_guarantee_readable(p_contract_id) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'retention_outstanding', COALESCE((
      SELECT sum(rp.amount - rp.settled_amount) FROM public.receivables_payables rp
       WHERE rp.contract_id = p_contract_id AND rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL
         AND rp.settled_amount < rp.amount), 0),
    'retention_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', rp.id, 'description', rp.description, 'amount', rp.amount,
                                          'settled_amount', rp.settled_amount, 'due_date', rp.due_date)
                       ORDER BY rp.due_date NULLS LAST)
        FROM public.receivables_payables rp
       WHERE rp.contract_id = p_contract_id AND rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL
         AND rp.settled_amount < rp.amount), '[]'::jsonb),
    'open_guarantees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'guarantee_type', g.guarantee_type, 'direction', g.direction,
                                          'bank_name', g.bank_name, 'guarantee_number', g.guarantee_number,
                                          'amount', g.amount, 'valid_to', g.valid_to, 'status', g.status)
                       ORDER BY g.valid_to)
        FROM public.contract_guarantees g
       WHERE g.contract_id = p_contract_id AND g.deleted_at IS NULL AND g.status IN ('dang_hieu_luc', 'het_han')),
      '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contract_open_retention_guarantees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_open_retention_guarantees(uuid) TO authenticated;

-- Báo thu hồi tiền giữ lại / bảo lãnh khi công trình kết thúc, hợp đồng quyết toán, lập biên bản thanh lý.
CREATE OR REPLACE FUNCTION public.notify_retention_release(p_contract_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret   bigint;
  v_guar  integer;
  v_code  text;
  v_parts text[] := ARRAY[]::text[];
BEGIN
  SELECT COALESCE(c.contract_number, c.code) INTO v_code FROM public.contracts c WHERE c.id = p_contract_id;
  SELECT COALESCE(sum(rp.amount - rp.settled_amount), 0) INTO v_ret FROM public.receivables_payables rp
   WHERE rp.contract_id = p_contract_id AND rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL
     AND rp.settled_amount < rp.amount;
  SELECT count(*) INTO v_guar FROM public.contract_guarantees g
   WHERE g.contract_id = p_contract_id AND g.deleted_at IS NULL AND g.status IN ('dang_hieu_luc', 'het_han');
  IF v_ret = 0 AND v_guar = 0 THEN
    RETURN 0;
  END IF;
  IF v_ret > 0 THEN
    v_parts := v_parts || format('thu hồi tiền giữ lại %s đồng', replace(to_char(v_ret, 'FM999,999,999,999'), ',', '.'));
  END IF;
  IF v_guar > 0 THEN
    v_parts := v_parts || format('thu hồi / giải toả %s bảo lãnh', v_guar);
  END IF;
  RETURN public.notify_contract_money_people(
    p_contract_id, 'retention_release',
    format('Hợp đồng %s %s — %s.', v_code, p_reason, array_to_string(v_parts, ', ')),
    'contracts', p_contract_id, '/hd/hop-dong/' || p_contract_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_retention_release(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.construction_sites_retention_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage::text = 'hoan_thanh' AND OLD.stage IS DISTINCT FROM NEW.stage AND NEW.contract_id IS NOT NULL THEN
    PERFORM public.notify_retention_release(NEW.contract_id,
      format('— công trình %s đã kết thúc (hết bảo hành)', NEW.code));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_retention_release ON public.construction_sites;
CREATE TRIGGER construction_sites_retention_release
  AFTER UPDATE OF stage ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_retention_release();

CREATE OR REPLACE FUNCTION public.contracts_retention_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage::text = 'hoan_thanh' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM public.notify_retention_release(NEW.id, 'đã quyết toán');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contracts_retention_release ON public.contracts;
CREATE TRIGGER contracts_retention_release
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_retention_release();

CREATE OR REPLACE FUNCTION public.contract_annex_retention_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'thanh_ly' AND NEW.version = 1 THEN
    PERFORM public.notify_retention_release(NEW.contract_id, 'đang lập biên bản thanh lý');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contract_annex_retention_release ON public.contract_annex_documents;
CREATE TRIGGER contract_annex_retention_release
  AFTER INSERT ON public.contract_annex_documents
  FOR EACH ROW EXECUTE FUNCTION public.contract_annex_retention_release();

-- ============================================================================
-- 6. Quét đêm: bảo lãnh sắp / đã hết hạn, tiền giữ lại tới hạn thu hồi
-- ============================================================================
CREATE OR REPLACE FUNCTION public.scan_contract_guarantee_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_lead  numeric := public.system_parameter_number('kt.guarantee_remind_days');
  v_rlead numeric := public.system_parameter_number('kt.retention_remind_days');
  g       record;
  rp      record;
  v_stage smallint;
  v_sent  integer := 0;
  v_label text;
BEGIN
  FOR g IN
    SELECT cg.*, COALESCE(c.contract_number, c.code) AS contract_label
      FROM public.contract_guarantees cg JOIN public.contracts c ON c.id = cg.contract_id
     WHERE cg.deleted_at IS NULL AND cg.status = 'dang_hieu_luc'
  LOOP
    v_stage := CASE
      WHEN g.valid_to < v_today THEN 0
      WHEN v_lead IS NOT NULL AND g.valid_to - v_today <= v_lead THEN 1
      ELSE NULL END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN g.last_reminded_stage IS NOT NULL AND g.last_reminded_stage <= v_stage;
    v_label := CASE g.guarantee_type WHEN 'tam_ung' THEN 'Bảo lãnh tạm ứng' WHEN 'thuc_hien' THEN 'Bảo lãnh thực hiện'
                                     ELSE 'Bảo lãnh bảo hành' END
               || COALESCE(' số ' || g.guarantee_number, '') || ' (' || g.bank_name || ')';
    PERFORM public.notify_contract_money_people(
      g.contract_id, 'contract_guarantee_expiry',
      CASE WHEN v_stage = 0 THEN
        format('%s của hợp đồng %s đã hết hạn ngày %s — gia hạn, hoặc ghi thu hồi / giải toả.', v_label,
               g.contract_label, to_char(g.valid_to, 'DD/MM/YYYY'))
      ELSE
        format('%s của hợp đồng %s hết hạn ngày %s, còn %s ngày.', v_label, g.contract_label,
               to_char(g.valid_to, 'DD/MM/YYYY'), g.valid_to - v_today)
      END,
      'contract_guarantees', g.id, '/hd/hop-dong/' || g.contract_id::text);
    PERFORM set_config('nvg.contract_guarantee', 'on', true);
    UPDATE public.contract_guarantees
       SET last_reminded_stage = v_stage,
           status = CASE WHEN v_stage = 0 THEN 'het_han' ELSE status END
     WHERE id = g.id;
    PERFORM set_config('nvg.contract_guarantee', '', true);
    v_sent := v_sent + 1;
  END LOOP;

  FOR rp IN
    SELECT r.*, COALESCE(c.contract_number, c.code) AS contract_label
      FROM public.receivables_payables r JOIN public.contracts c ON c.id = r.contract_id
     WHERE r.receivable_kind = 'giu_lai' AND r.deleted_at IS NULL AND r.settled_amount < r.amount
       AND r.due_date IS NOT NULL AND r.retention_reminded_at IS NULL
       AND r.due_date - v_today <= COALESCE(v_rlead, 0)
  LOOP
    PERFORM public.notify_contract_money_people(
      rp.contract_id, 'retention_due',
      format('Tiền giữ lại bảo hành %s đồng của hợp đồng %s %s ngày %s — làm thủ tục thu hồi.',
             replace(to_char(rp.amount - rp.settled_amount, 'FM999,999,999,999'), ',', '.'), rp.contract_label,
             CASE WHEN rp.due_date <= v_today THEN 'tới hạn thu hồi từ' ELSE 'tới hạn thu hồi' END,
             to_char(rp.due_date, 'DD/MM/YYYY')),
      'receivables_payables', rp.id, '/kt/bao-lanh-giu-lai');
    UPDATE public.receivables_payables SET retention_reminded_at = now() WHERE id = rp.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_contract_guarantee_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_contract_guarantee_reminders() TO service_role;

NOTIFY pgrst, 'reload schema';
