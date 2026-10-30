-- ============================================================================
-- 0253 — Gói A: bảy quyết định nghiệp vụ của anh Dũng sau lượt chạy thử trọn luồng NVO / NVC
--        (30/10/2026, sau 0250 / 0251).
--
--   1. Hợp đồng THIẾT KẾ (`scope_kind = 'thiet_ke'`) chỉ quyết toán khi khách đã duyệt HỒ SƠ KỸ THUẬT
--      của hồ sơ thiết kế gắn hợp đồng / cơ hội. «Khách duyệt hồ sơ kỹ thuật» = phiên bản đang hiệu lực
--      của bộ môn kỹ thuật (kiến trúc / kết cấu / điện nước) có `customer_approved_at` — đúng dấu mà
--      `record_design_review` (0025) ghi khi khách «Duyệt». Đủ khi: có ít nhất một bản kỹ thuật được khách
--      duyệt VÀ mọi bản kỹ thuật đang hiệu lực đã phát hành đều được duyệt (bản mới phát hành chưa duyệt
--      = khách đang cầm bản chưa chốt). Hồ sơ thiết kế đã «Dừng thiết kế» không xét (thanh lý hợp đồng
--      dừng giữa chừng không bị kẹt); không có hồ sơ thiết kế nào gắn → chưa quyết toán được.
--      Chặn ở CSDL: trigger `contracts_design_settlement_gate` (mọi đường đổi bước), và hiện ở
--      `stage_readiness('contract')` (chép NGUYÊN VĂN 0249, thêm một nhánh).
--   2. Ký hợp đồng thiết kế xong → máy TỰ TẠO hồ sơ thiết kế gắn cơ hội + hợp đồng (cột mới
--      `design_projects.contract_id`), nếu cơ hội chưa có hồ sơ thiết kế đang làm (có thì chỉ gắn hợp
--      đồng). Trọn gói: chỉ khi pháp nhân tự làm thiết kế — tham số `tk.design_in_house` theo pháp nhân
--      (đặt sẵn = true cho NVO, NVG đổi được; KHÔNG viết cứng mã pháp nhân trong hàm). Người chịu trách
--      nhiệm: trưởng phòng Thiết kế của pháp nhân (vai trò duyệt được Module TK, không giới hạn hiện
--      trường, không phải vai trò xem mọi pháp nhân); không có ai thì để trống. Báo cả phòng Thiết kế.
--      Trigger AFTER trên `contracts` — không chép lại `sign_contract`. Vì hồ sơ thiết kế được tạo TRƯỚC
--      phần «tự mở công trình» của `sign_contract`, hợp đồng trọn gói NVO sẽ mở công trình lúc bàn giao
--      thiết kế (đúng đường 0243 / 0250), không mở ngay khi ký.
--   3. Ngân sách thi công cần Tổng Giám đốc duyệt TRƯỚC khởi công.
--      (a) `build_site_budget_from_quote` (chép 0235): báo giá có GIÁ VỐN đầy đủ (0244 — dự toán đã duyệt
--          gắn báo giá, hoặc mọi hạng mục có đơn giá vốn) thì lập ngân sách từ giá vốn; không có thì giữ
--          cách cũ (một dòng tổng 0 đồng). Không bao giờ lấy giá bán làm chi phí.
--      (b) Bảng `site_budget_submissions` + loại duyệt mới `site_budget` (hạn mức seed: chỉ Tổng Giám đốc).
--          `submit_site_budget` → hộp Phê duyệt; `decide_approval` (chép NGUYÊN VĂN 0249) thêm nhánh.
--          Sửa dòng ngân sách khi đang chờ duyệt bị chặn (hủy gửi rồi sửa); sửa sau khi đã duyệt → bản
--          duyệt «hết hiệu lực», phải gửi lại. `stage_readiness('site')` thêm điều kiện khởi công
--          «ngân sách đã được duyệt» → trigger 0164 `construction_sites_ready_to_start` chặn mọi đường.
--          Ngân sách đi từ GÓI THẦU / HỒ SƠ THIẾT KẾ (DA-09): dựng từ dự toán ĐÃ DUYỆT (giá + cấu thành chi
--          phí đã qua hộp Phê duyệt theo hạn mức, dưới lợi nhuận tối thiểu thì Tổng Giám đốc) → coi như
--          đã duyệt, không bắt duyệt lần hai (`theo_du_toan`). Lý do: cùng một bộ số đã có người có thẩm
--          quyền duyệt; duyệt lại chỉ thêm một bước chờ cho NVC (khảo sát: gói thầu là luồng chính).
--      (c) `site_budget_approval(p_site_id)` cho màn hình: nhãn theo trạng thái thật.
--   4. Đợt thu «khi ký hợp đồng»: cột `contract_terms.collection_trigger` ('ky_hop_dong' | 'het_bao_hanh').
--      Ký xong → đợt đến hạn thu ngay, báo như 3A (0195). `contract_terms_collection_guard`,
--      `contract_terms_collection_notify`, `link_collection_term`, `kt_collection_schedule`,
--      `scan_collection_reminders` chép bản 0195, thêm nhánh.
--   5. «Gửi khách» báo giá ghi KÊNH: `quotes.sent_channel` (zalo / email / tan_tay / khac);
--      `send_quote_to_customer` (chép 0013) thêm tham số `p_channel`. Mở Zalo từ nút «Gửi qua Zalo»
--      (0238) với báo giá đã duyệt chưa gửi → máy ghi đã gửi qua Zalo; email của Worker ghi 'email'.
--   6. Lợi nhuận dự toán: căn cứ là số MÁY TÍNH (giá trước thuế − chi phí cấu thành), không phải số người
--      lập gõ. `_estimate_margin_state` (0244) đổi thân, giữ chữ ký; `price_margin_brief` thêm số gõ tay
--      + cờ lệch để hộp duyệt cảnh báo.
--   7. Tiền giữ lại bảo hành chỉ giữ ở ĐỢT THANH TOÁN («Hết thời hạn bảo hành» của mẫu NVC-HĐ-01 = một
--      đợt `contract_terms` có `collection_trigger = 'het_bao_hanh'`): hạn = ngày hết bảo hành muộn nhất
--      của công trình (tự cập nhật), tới hạn thì đến hạn thu + nhắc theo `kt.retention_remind_days`.
--      `record_collection_owner_approval` (chép 0248) KHÔNG còn tự trừ giữ lại theo tỷ lệ điều khoản
--      Bảo hành, và từ chối số giữ lại > 0 — hết đếm trùng ở dòng tiền.
--      Dữ liệu cũ: KHÔNG xoá, KHÔNG sửa. Khoản `receivable_kind = 'giu_lai'` đã ghi vẫn được nhắc / thu
--      hồi như cũ (`retention_due_date`, `warranties_refresh_retention_due`, quét 0248 giữ nguyên). Hồ sơ
--      thanh toán chưa ghi công nợ mà đã có số giữ lại (đo trên CSDL máy 30/10/2026: 0 hồ sơ) vẫn tách
--      khoản giữ lại khi ghi công nợ — đó là số đã được ghi trước quyết định. Chỉ dừng SINH MỚI.
--
-- Hàm chép-dài nay có bản mới nhất ở 0253: `stage_readiness`, `decide_approval`.
-- ⚠️ Giá trị enum mới `site_budget` chỉ dùng TRONG THÂN hàm plpgsql và so dạng text. Hạn mức nạp ở seed
-- (`DEFAULT_APPROVAL_LIMITS`) — `db:seed` sau migrate.
-- Chạy lại được.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'site_budget';

-- Cột dùng ở việc 1 và 2 (hàm SQL kiểm cột lúc tạo nên thêm trước).
ALTER TABLE public.design_projects
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- ============================================================================
-- 1. Hợp đồng thiết kế chỉ quyết toán khi khách đã duyệt hồ sơ kỹ thuật
-- ============================================================================

-- Hồ sơ thiết kế gắn một hợp đồng: gắn thẳng (`contract_id`), là nguồn của hợp đồng, hoặc cùng cơ hội gốc.
CREATE OR REPLACE FUNCTION public.contract_design_projects(p_contract_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT d.id
    FROM public.contracts c
    JOIN public.design_projects d
      ON d.deleted_at IS NULL
     AND (d.contract_id = c.id
          OR (c.source_type::text = 'design_projects' AND d.id = c.source_id)
          OR (d.opportunity_id IS NOT NULL
              AND d.opportunity_id = public.contract_source_opportunity(c.source_type, c.source_id)))
   WHERE c.id = p_contract_id;
$$;
REVOKE ALL ON FUNCTION public.contract_design_projects(uuid) FROM PUBLIC, anon, authenticated;

-- Lý do chưa quyết toán được hợp đồng thiết kế; NULL = đủ điều kiện.
CREATE OR REPLACE FUNCTION public.contract_design_settlement_problem(p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active  uuid[];
  v_pending text;
  v_none    text;
BEGIN
  SELECT array_agg(d.id) INTO v_active
    FROM public.design_projects d
   WHERE d.id IN (SELECT public.contract_design_projects(p_contract_id))
     AND d.stage::text <> 'dung_thiet_ke';

  IF v_active IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.contract_design_projects(p_contract_id)) THEN
      RETURN NULL;  -- mọi hồ sơ thiết kế đã dừng: thanh lý theo phần đã làm, không chờ khách duyệt.
    END IF;
    RETURN 'Chưa có hồ sơ thiết kế gắn hợp đồng / cơ hội — chưa có căn cứ khách đã duyệt hồ sơ kỹ thuật';
  END IF;

  -- Hồ sơ chưa có bản kỹ thuật nào được khách duyệt.
  SELECT string_agg(d.code, ', ' ORDER BY d.code) INTO v_none
    FROM public.design_projects d
   WHERE d.id = ANY (v_active)
     AND NOT EXISTS (SELECT 1 FROM public.design_versions v
                      WHERE v.design_project_id = d.id AND v.deleted_at IS NULL AND v.is_current_version
                        AND v.discipline::text IN ('kien_truc', 'ket_cau', 'dien_nuoc')
                        AND v.customer_approved_at IS NOT NULL);
  IF v_none IS NOT NULL THEN
    RETURN 'Khách chưa duyệt hồ sơ kỹ thuật của hồ sơ thiết kế ' || v_none;
  END IF;

  -- Bản kỹ thuật đang hiệu lực đã phát hành mà khách chưa duyệt.
  SELECT string_agg(DISTINCT d.code, ', ') INTO v_pending
    FROM public.design_projects d
    JOIN public.design_versions v ON v.design_project_id = d.id
   WHERE d.id = ANY (v_active) AND v.deleted_at IS NULL AND v.is_current_version
     AND v.discipline::text IN ('kien_truc', 'ket_cau', 'dien_nuoc')
     AND v.published_at IS NOT NULL AND v.customer_approved_at IS NULL;
  IF v_pending IS NOT NULL THEN
    RETURN 'Hồ sơ thiết kế ' || v_pending || ' còn bản hồ sơ kỹ thuật đã phát hành mà khách chưa duyệt';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contract_design_settlement_problem(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contracts_design_settlement_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_problem text;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage OR NEW.stage::text <> 'hoan_thanh'
     OR COALESCE(NEW.scope_kind, '') <> 'thiet_ke' THEN
    RETURN NEW;
  END IF;
  -- Tác vụ hệ thống (dọn dữ liệu, migration) không mang người dùng — như các cổng bước 0164 / 0187.
  IF public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  v_problem := public.contract_design_settlement_problem(NEW.id);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'Chưa quyết toán được hợp đồng thiết kế: %. Quyết toán sau khi khách duyệt hồ sơ kỹ thuật.', v_problem;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_design_settlement_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_design_settlement_gate ON public.contracts;
CREATE TRIGGER contracts_design_settlement_gate
  BEFORE UPDATE OF stage ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_design_settlement_gate();

-- ============================================================================
-- 2. Ký hợp đồng thiết kế → tự tạo hồ sơ thiết kế
-- ============================================================================
CREATE INDEX IF NOT EXISTS design_projects_contract_idx
  ON public.design_projects (contract_id) WHERE contract_id IS NOT NULL;
COMMENT ON COLUMN public.design_projects.contract_id IS
  'Hợp đồng thiết kế / trọn gói sinh ra hồ sơ này (0253). Máy ghi lúc ký — không sửa tay.';

DROP TRIGGER IF EXISTS design_projects_contract_guard ON public.design_projects;
CREATE TRIGGER design_projects_contract_guard
  BEFORE UPDATE ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only('contract_id');

INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, label, description)
SELECT 'tk.design_in_house', 'global', NULL, NULL,
       'Pháp nhân tự làm thiết kế (hợp đồng trọn gói)',
       'true = ký hợp đồng thiết kế – thi công trọn gói thì máy tự tạo hồ sơ thiết kế (0253). Đặt theo pháp nhân. '
       'Hợp đồng THIẾT KẾ luôn tạo hồ sơ, không phụ thuộc tham số này.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters p
                   WHERE p.param_key = 'tk.design_in_house' AND p.scope_type = 'global');

INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, label, description)
SELECT 'tk.design_in_house', 'company', c.id, 'true'::jsonb,
       'Pháp nhân tự làm thiết kế — NVO',
       'NVO thiết kế + thi công trọn gói nhà ở (CLAUDE.md 1): hợp đồng trọn gói ký xong thì có hồ sơ thiết kế.'
  FROM public.companies c
 WHERE c.code = 'NVO'
   AND NOT EXISTS (SELECT 1 FROM public.system_parameters p
                    WHERE p.param_key = 'tk.design_in_house' AND p.scope_type = 'company' AND p.scope_id = c.id);

CREATE OR REPLACE FUNCTION public.contracts_auto_design_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp      uuid;
  v_existing uuid;
  v_resp     uuid;
  v_cc       text;
  v_id       uuid;
  v_code     text;
BEGIN
  IF NEW.scope_kind = 'tron_goi' THEN
    IF NOT COALESCE(public.system_parameter('tk.design_in_house', 'company', NEW.company_id) = 'true'::jsonb, false) THEN
      RETURN NULL;
    END IF;
  ELSIF COALESCE(NEW.scope_kind, '') <> 'thiet_ke' THEN
    RETURN NULL;
  END IF;

  -- Hợp đồng lập từ hồ sơ thiết kế: hồ sơ đã có, chỉ gắn hợp đồng.
  IF NEW.source_type::text = 'design_projects' THEN
    UPDATE public.design_projects SET contract_id = NEW.id
     WHERE id = NEW.source_id AND contract_id IS NULL;
    RETURN NULL;
  END IF;

  v_opp := public.contract_source_opportunity(NEW.source_type, NEW.source_id);
  IF v_opp IS NOT NULL THEN
    SELECT d.id INTO v_existing
      FROM public.design_projects d
     WHERE d.opportunity_id = v_opp AND d.deleted_at IS NULL AND d.stage::text <> 'dung_thiet_ke'
     ORDER BY (d.handed_over_at IS NULL) DESC, d.created_at
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      UPDATE public.design_projects SET contract_id = NEW.id
       WHERE id = v_existing AND contract_id IS NULL;
      RETURN NULL;
    END IF;
  END IF;

  -- Trưởng phòng Thiết kế của pháp nhân: duyệt được TK, không phải vai trò hiện trường, không phải vai
  -- trò xem mọi pháp nhân (Ban Giám đốc / Quản trị). Không có thì để trống — phòng Thiết kế được báo.
  SELECT u.id INTO v_resp
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'TK' AND pm.can_approve
   WHERE u.is_active AND u.deleted_at IS NULL AND uc.company_id = NEW.company_id
     AND NOT r.site_scoped AND NOT r.sees_all_companies
   ORDER BY u.created_at
   LIMIT 1;

  SELECT code INTO v_cc FROM public.companies WHERE id = NEW.company_id;
  v_code := public.issue_record_code(v_cc, 'TK');

  INSERT INTO public.design_projects (
    company_id, code, name, opportunity_id, customer_id, responsible_user_id, site_address,
    contract_id, notes, created_by, updated_by
  ) VALUES (
    NEW.company_id, v_code, NEW.title, v_opp, NEW.customer_id, v_resp, NEW.project_location,
    NEW.id,
    format('Máy tạo khi ký %s %s (0253).', public.contract_scope_kind_label(NEW.scope_kind), NEW.code),
    public.auth_user_id(), public.auth_user_id()
  )
  RETURNING id INTO v_id;

  PERFORM public.create_notification(
    x.id, NEW.company_id, 'design_project_from_contract',
    format('%s %s đã ký — hồ sơ thiết kế %s đã được tạo%s.',
           initcap(public.contract_scope_kind_label(NEW.scope_kind)), NEW.code, v_code,
           CASE WHEN v_resp IS NULL THEN ', chưa có người chịu trách nhiệm — phân công người làm'
                WHEN x.id = v_resp THEN ', bạn là người chịu trách nhiệm'
                ELSE '' END),
    'design_projects', v_id, '/tk/du-an/' || v_id::text
  )
  FROM (
    SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'TK'
                                AND (pm.can_edit OR pm.can_approve)
     WHERE u.is_active AND u.deleted_at IS NULL AND uc.company_id = NEW.company_id
       AND NOT r.sees_all_companies
       AND u.id IS DISTINCT FROM public.auth_user_id()
  ) x;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_auto_design_project() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_auto_design_project ON public.contracts;
CREATE TRIGGER contracts_auto_design_project
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW
  WHEN (NEW.stage = 'da_ky' AND OLD.stage IS DISTINCT FROM 'da_ky')
  EXECUTE FUNCTION public.contracts_auto_design_project();

-- ============================================================================
-- 3. Ngân sách thi công: lập từ giá vốn, Tổng Giám đốc duyệt trước khởi công
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_budget_submissions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  round_no             integer NOT NULL,
  total_amount         bigint NOT NULL CHECK (total_amount >= 0),
  lines                jsonb NOT NULL DEFAULT '[]'::jsonb,
  note                 text,
  status               varchar(16) NOT NULL DEFAULT 'cho_duyet'
                       CHECK (status IN ('cho_duyet', 'da_duyet', 'tra_ve', 'huy', 'het_hieu_luc')),
  approval_id          uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  submitted_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at         timestamptz NOT NULL DEFAULT now(),
  decided_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  decision_note        text,
  superseded_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (construction_site_id, round_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS site_budget_submissions_one_pending
  ON public.site_budget_submissions (construction_site_id) WHERE status = 'cho_duyet';
COMMENT ON TABLE public.site_budget_submissions IS
  'Các lần gửi Tổng Giám đốc duyệt ngân sách thi công BAN ĐẦU của công trình (0253) — bảng lịch sử, chỉ ghi qua hàm. '
  'Chụp tổng + từng dòng lúc gửi. Sửa dòng sau khi duyệt → bản duyệt «het_hieu_luc», phải gửi lại.';

DO $$
BEGIN
  DROP TRIGGER IF EXISTS audit_touch ON public.site_budget_submissions;
  PERFORM public.attach_audit_touch('public.site_budget_submissions');
  DROP TRIGGER IF EXISTS trg_transactional_company ON public.site_budget_submissions;
  CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.site_budget_submissions
    FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company();
END;
$$;

ALTER TABLE public.site_budget_submissions ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.site_budget_submissions FROM anon, authenticated;
-- Cùng phạm vi đọc với `project_budgets` (0235): xem được giá vốn, hoặc Thi công trong phạm vi công trình.
DROP POLICY IF EXISTS site_budget_submissions_select ON public.site_budget_submissions;
CREATE POLICY site_budget_submissions_select ON public.site_budget_submissions
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (public.rls_sees_sensitive('cost')
         OR (public.auth_can_edit_module('TC') AND public.rls_site_readable(construction_site_id)))
  );

-- Trạng thái duyệt ngân sách ban đầu của công trình:
--   theo_du_toan — mọi dòng dựng từ dự toán ĐÃ DUYỆT của gói thầu / hồ sơ thiết kế (DA-09);
--   da_duyet / cho_duyet / tra_ve — theo lần gửi gần nhất; nhap — có dòng, chưa gửi (hoặc bản duyệt hết
--   hiệu lực / đã hủy); chua_co — chưa có dòng nào.
CREATE OR REPLACE FUNCTION public._site_budget_state(p_site_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines  integer;
  v_site   integer;
  v_est    integer;
  v_status text;
BEGIN
  -- Dòng gắn thẳng công trình có số dự trù > 0 mới là ngân sách lập tại chỗ; dòng 0 đồng do máy lập khi
  -- hạch toán (vd thuê giàn giáo nội bộ, 0245) không biến ngân sách theo dự toán thành «Nháp».
  SELECT count(*),
         count(*) FILTER (WHERE b.bidding_project_id IS NULL AND b.design_project_id IS NULL
                            AND b.budgeted_amount > 0),
         count(*) FILTER (WHERE b.bidding_project_id IS NOT NULL OR b.design_project_id IS NOT NULL)
    INTO v_lines, v_site, v_est
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL;

  SELECT s.status INTO v_status
    FROM public.site_budget_submissions s
   WHERE s.construction_site_id = p_site_id
   ORDER BY s.round_no DESC
   LIMIT 1;

  IF v_status IN ('da_duyet', 'cho_duyet', 'tra_ve') THEN
    RETURN v_status;
  END IF;
  IF v_est > 0 AND v_site = 0 THEN
    RETURN 'theo_du_toan';
  END IF;
  RETURN CASE WHEN v_lines = 0 THEN 'chua_co' ELSE 'nhap' END;
END;
$$;
REVOKE ALL ON FUNCTION public._site_budget_state(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.site_budget_state_label(p_state text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_state
    WHEN 'theo_du_toan' THEN 'Đã duyệt theo dự toán'
    WHEN 'da_duyet'     THEN 'Đã duyệt'
    WHEN 'cho_duyet'    THEN 'Chờ Tổng Giám đốc duyệt'
    WHEN 'tra_ve'       THEN 'Bị trả lại'
    WHEN 'nhap'         THEN 'Nháp — chưa gửi duyệt'
    ELSE 'Chưa lập'
  END;
$$;

-- Cho màn hình (tab Ngân sách): trạng thái thật + lần gửi gần nhất. Ai đọc được ngân sách thì đọc được.
CREATE OR REPLACE FUNCTION public.site_budget_approval(p_site_id uuid)
RETURNS TABLE (
  state           text,
  state_label     text,
  can_submit      boolean,
  submission_id   uuid,
  round_no        integer,
  total_amount    bigint,
  submitted_at    timestamptz,
  submitted_by    text,
  decided_at      timestamptz,
  decided_by      text,
  decision_note   text,
  superseded      boolean,
  is_mine         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       record;
  v_state text;
  v_co    uuid;
  v_stage text;
BEGIN
  SELECT cs.company_id, cs.stage::text INTO v_co, v_stage
    FROM public.construction_sites cs WHERE cs.id = p_site_id AND cs.deleted_at IS NULL;
  IF v_co IS NULL OR NOT public.rls_company_access(v_co)
     OR NOT (public.rls_sees_sensitive('cost')
             OR (public.auth_can_edit_module('TC') AND public.rls_site_readable(p_site_id))) THEN
    RETURN;
  END IF;
  v_state := public._site_budget_state(p_site_id);
  SELECT sb.* INTO s FROM public.site_budget_submissions sb
   WHERE sb.construction_site_id = p_site_id ORDER BY sb.round_no DESC LIMIT 1;
  RETURN QUERY SELECT
    v_state,
    public.site_budget_state_label(v_state),
    public.auth_manages_site_budget(p_site_id) AND v_stage = 'chuan_bi' AND v_state IN ('nhap', 'tra_ve'),
    s.id, s.round_no, s.total_amount, s.submitted_at,
    (SELECT u.full_name FROM public.users u WHERE u.id = s.submitted_by)::text,
    s.decided_at,
    (SELECT u.full_name FROM public.users u WHERE u.id = s.decided_by)::text,
    s.decision_note,
    COALESCE(s.status = 'het_hieu_luc', false),
    COALESCE(s.submitted_by = public.auth_user_id(), false);
END;
$$;
REVOKE ALL ON FUNCTION public.site_budget_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_budget_approval(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_site_budget(p_site_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  s       record;
  v_state text;
  v_total bigint;
  v_lines jsonb;
  v_round integer;
  v_id    uuid;
  v_appr  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF NOT public.auth_manages_site_budget(p_site_id) THEN
    RAISE EXCEPTION 'Trưởng phòng Thi công hoặc Ban Giám đốc gửi duyệt ngân sách công trình.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id FOR UPDATE;
  IF s.stage::text <> 'chuan_bi' THEN
    RAISE EXCEPTION 'Công trình đã khởi công — ngân sách chỉ đổi qua «Điều chỉnh ngân sách».';
  END IF;
  v_state := public._site_budget_state(p_site_id);
  IF v_state = 'cho_duyet' THEN
    RAISE EXCEPTION 'Ngân sách đang chờ Tổng Giám đốc duyệt.';
  ELSIF v_state = 'da_duyet' THEN
    RAISE EXCEPTION 'Ngân sách đã được duyệt — sửa dòng ngân sách thì mới gửi lại.';
  ELSIF v_state = 'theo_du_toan' THEN
    RAISE EXCEPTION 'Ngân sách dựng từ dự toán đã duyệt — không cần gửi duyệt lần nữa.';
  ELSIF v_state = 'chua_co' THEN
    RAISE EXCEPTION 'Chưa có dòng ngân sách nào — lập ngân sách trước khi gửi duyệt.';
  END IF;
  IF char_length(btrim(COALESCE(p_note, ''))) > 2000 THEN
    RAISE EXCEPTION 'Ghi chú dài quá 2.000 ký tự.';
  END IF;

  SELECT COALESCE(sum(b.budgeted_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0),
         COALESCE(jsonb_agg(jsonb_build_object('cost_code', b.cost_code, 'cost_group', b.cost_group,
                                               'name', b.name, 'budgeted_amount', b.budgeted_amount)
                            ORDER BY b.cost_code) FILTER (WHERE b.cost_group <> 'loi_nhuan'), '[]'::jsonb)
    INTO v_total, v_lines
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Tổng ngân sách đang là 0 đồng — nhập số dự trù cho các dòng trước khi gửi duyệt.';
  END IF;

  SELECT COALESCE(max(sb.round_no), 0) + 1 INTO v_round
    FROM public.site_budget_submissions sb WHERE sb.construction_site_id = p_site_id;

  INSERT INTO public.site_budget_submissions (
    company_id, construction_site_id, round_no, total_amount, lines, note, status,
    submitted_by, created_by, updated_by)
  VALUES (s.company_id, p_site_id, v_round, v_total, v_lines, NULLIF(btrim(COALESCE(p_note, '')), ''),
          'cho_duyet', v_user, v_user, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  VALUES (s.company_id, 'site_budget'::public.approval_subject, 'site_budget_submissions', v_id, s.code,
          format('Ngân sách thi công — %s (%s)%s', s.name, s.code,
                 CASE WHEN v_round > 1 THEN format(' — lần %s', v_round) ELSE '' END),
          v_total, NULLIF(btrim(COALESCE(p_note, '')), ''), 'pending_approval', v_user)
  RETURNING id INTO v_appr;

  UPDATE public.site_budget_submissions SET approval_id = v_appr WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_site_budget(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_site_budget(uuid, text) TO authenticated;

-- Người gửi rút lại lần gửi đang chờ (để sửa ngân sách) — như `cancel_budget_adjustment` (0249).
CREATE OR REPLACE FUNCTION public.cancel_site_budget_submission(p_site_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  SELECT * INTO a FROM public.site_budget_submissions
   WHERE construction_site_id = p_site_id AND status = 'cho_duyet' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không có lần gửi duyệt ngân sách nào đang chờ.';
  END IF;
  IF v_user IS NULL OR NOT (a.submitted_by = v_user OR public.auth_manages_site_budget(p_site_id)) THEN
    RAISE EXCEPTION 'Chỉ người gửi hoặc người lập ngân sách rút lại được.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Nêu lý do rút lại.';
  END IF;
  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT ap.id, ap.current_step, 'rejected', 'Người gửi rút lại: ' || btrim(p_reason), v_user
    FROM public.approvals ap WHERE ap.id = a.approval_id AND ap.status = 'pending_approval';
  UPDATE public.approvals SET status = 'completed', final_decision = 'rejected', decided_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = a.approval_id AND status = 'pending_approval';
  UPDATE public.site_budget_submissions
     SET status = 'huy', decided_at = now(), decision_note = btrim(p_reason), updated_at = now(), updated_by = v_user
   WHERE id = a.id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_site_budget_submission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_site_budget_submission(uuid, text) TO authenticated;

-- Gọi từ `decide_approval` (nhánh site_budget_submissions).
CREATE OR REPLACE FUNCTION public._decide_site_budget(p_id uuid, p_decision approval_decision, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  s      record;
BEGIN
  SELECT * INTO a FROM public.site_budget_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy lần gửi duyệt ngân sách.'; END IF;
  IF a.status <> 'cho_duyet' THEN RAISE EXCEPTION 'Lần gửi duyệt ngân sách này đã được xử lý.'; END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = a.construction_site_id;

  UPDATE public.site_budget_submissions
     SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tra_ve' END,
         decided_by = v_user, decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = now(), updated_by = v_user
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, a.company_id,
          CASE WHEN p_decision = 'approved' THEN 'approve_site_budget' ELSE 'reject_site_budget' END,
          'construction_sites', a.construction_site_id, NULL,
          jsonb_build_object('round_no', a.round_no, 'total_amount', a.total_amount), p_note);

  PERFORM public.create_notification(
    x.uid, a.company_id,
    CASE WHEN p_decision = 'approved' THEN 'site_budget_approved' ELSE 'site_budget_rejected' END,
    CASE WHEN p_decision = 'approved'
         THEN format('Ngân sách thi công công trình %s đã được Tổng Giám đốc duyệt.', s.code)
         ELSE format('Ngân sách thi công công trình %s bị trả lại: %s', s.code,
                     COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), ''))
    END,
    'construction_sites', a.construction_site_id,
    '/tc/cong-trinh/' || a.construction_site_id || '?tab=ngan-sach')
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[a.submitted_by, s.responsible_user_id]) AS t(uid)
         WHERE uid IS NOT NULL AND uid IS DISTINCT FROM v_user) x;
END;
$$;
REVOKE ALL ON FUNCTION public._decide_site_budget(uuid, approval_decision, text) FROM PUBLIC, anon, authenticated;

-- Dòng ngân sách gắn thẳng công trình, công trình CHƯA khởi công (sau khởi công 0249 đã khoá):
--   · đang chờ duyệt → chặn (rút lại rồi sửa);
--   · đã duyệt → bản duyệt hết hiệu lực, phải gửi lại.
-- Chỉ xét thay đổi số dự trù / mã / nhóm / xoá / thêm; cam kết, thực tế của chứng từ đi qua.
CREATE OR REPLACE FUNCTION public.project_budgets_site_approval_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site   uuid := NEW.construction_site_id;
  v_status text;
BEGIN
  IF v_site IS NULL OR NEW.bidding_project_id IS NOT NULL OR NEW.design_project_id IS NOT NULL
     OR public.auth_user_id() IS NULL
     OR current_setting('nvg.budget_adjustment_apply', true) = 'on'
     OR public.site_budget_locked(v_site) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND pg_trigger_depth() > 1 AND COALESCE(NEW.budgeted_amount, 0) = 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.budgeted_amount IS NOT DISTINCT FROM OLD.budgeted_amount
     AND NEW.cost_code IS NOT DISTINCT FROM OLD.cost_code
     AND NEW.cost_group IS NOT DISTINCT FROM OLD.cost_group
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  SELECT sb.status INTO v_status FROM public.site_budget_submissions sb
   WHERE sb.construction_site_id = v_site ORDER BY sb.round_no DESC LIMIT 1;
  IF v_status = 'cho_duyet' THEN
    RAISE EXCEPTION 'Ngân sách đang chờ Tổng Giám đốc duyệt — rút lại lần gửi rồi mới sửa được.';
  END IF;
  IF v_status = 'da_duyet' THEN
    UPDATE public.site_budget_submissions
       SET status = 'het_hieu_luc', superseded_at = now(), updated_at = now()
     WHERE construction_site_id = v_site AND status = 'da_duyet';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.project_budgets_site_approval_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_budgets_site_approval_guard ON public.project_budgets;
CREATE TRIGGER project_budgets_site_approval_guard
  BEFORE INSERT OR UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.project_budgets_site_approval_guard();

-- Lập ngân sách từ báo giá — chép bản 0235, thêm nhánh GIÁ VỐN (0244).
CREATE OR REPLACE FUNCTION public.build_site_budget_from_quote(p_site_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  s      record;
  q      record;
  -- 0253
  qs     record;
  e      record;
  v_rows integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_manages_site_budget(p_site_id) THEN
    RAISE EXCEPTION 'Không lập được ngân sách cho công trình này. Trưởng phòng Thi công hoặc Ban Giám đốc lập ngân sách công trình.';
  END IF;

  -- Khoá dòng công trình: hai người bấm cùng lúc thì người sau thấy ngân sách đã có.
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.project_budgets b
              WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Công trình đã có ngân sách. Sửa từng dòng thay vì lập lại.';
  END IF;

  SELECT * INTO q FROM public._site_budget_source_quote(p_site_id);
  IF q.quote_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có báo giá đã duyệt và đã gửi khách của cơ hội sinh ra hợp đồng này — chưa lập được ngân sách từ báo giá.';
  END IF;

  -- 0253: báo giá có GIÁ VỐN đầy đủ (0244) → ngân sách theo giá vốn, không theo giá bán.
  qs := public._quote_margin_state(q.quote_id);
  IF qs.cost_complete AND qs.cost_source = 'du_toan' THEN
    -- Dự toán đã duyệt gắn báo giá: chia nhóm như DA-09 (`build_budget_lines`), BỎ dòng lợi nhuận.
    SELECT * INTO e FROM public.estimates WHERE id = (SELECT cost_estimate_id FROM public.quotes WHERE id = q.quote_id);
    INSERT INTO public.project_budgets (
      company_id, construction_site_id, estimate_id, cost_group, cost_code, name, budgeted_amount, notes,
      created_by, updated_by)
    SELECT s.company_id, p_site_id, e.id, g.cost_group, g.cost_code, g.name, g.amount,
           format('Lập từ giá vốn (dự toán %s) của báo giá %s.', e.code, q.quote_code), v_user, v_user
      FROM (
        SELECT i.cost_group, upper(i.cost_group::text) AS cost_code,
               public.cost_group_label(i.cost_group) AS name, sum(i.amount)::bigint AS amount
          FROM public.estimate_items i
         WHERE i.estimate_id = e.id AND i.deleted_at IS NULL AND i.cost_group <> 'loi_nhuan'
           AND i.cost_group NOT IN ('chi_phi_chung', 'du_phong')
         GROUP BY i.cost_group
        UNION ALL
        SELECT 'chi_phi_chung'::public.cost_group, 'CHI_PHI_CHUNG', 'Chi phí chung',
               COALESCE(e.overhead_cost, 0)
               + COALESCE((SELECT sum(i.amount) FROM public.estimate_items i
                            WHERE i.estimate_id = e.id AND i.deleted_at IS NULL AND i.cost_group = 'chi_phi_chung'), 0)
               + COALESCE(e.finance_cost, 0)
        UNION ALL
        SELECT 'du_phong'::public.cost_group, 'DU_PHONG', 'Dự phòng rủi ro',
               COALESCE(e.contingency_cost, 0)
               + COALESCE((SELECT sum(i.amount) FROM public.estimate_items i
                            WHERE i.estimate_id = e.id AND i.deleted_at IS NULL AND i.cost_group = 'du_phong'), 0)
      ) g
     WHERE g.amount > 0;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSIF qs.cost_complete AND qs.cost IS NOT NULL AND qs.cost > 0 THEN
    -- Đơn giá vốn từng hạng mục: hạng mục báo giá không có nhóm chi phí → một dòng tổng = tổng giá vốn.
    INSERT INTO public.project_budgets (
      company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount, notes,
      created_by, updated_by)
    VALUES (
      s.company_id, p_site_id, 'vat_tu', 'TONG', 'Chi phí thi công (theo giá vốn báo giá)', qs.cost,
      format('Lập từ giá vốn các hạng mục của báo giá %s (hợp đồng %s). Chia thêm dòng theo nhóm chi phí nếu cần.',
             q.quote_code, q.contract_code),
      v_user, v_user);
    v_rows := 1;
  END IF;

  IF v_rows = 0 THEN
    -- Báo giá CRM không có giá vốn → một dòng tổng. Số dự trù để 0: giá báo khách là GIÁ
    -- BÁN, lấy nó làm chi phí là tự đặt tỷ lệ lợi nhuận 0 % — việc của người lập (5.2).
    INSERT INTO public.project_budgets (
      company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount, notes,
      created_by, updated_by
    )
    VALUES (
      s.company_id, p_site_id, 'vat_tu', 'TONG', 'Chi phí thi công (chưa chia nhóm)', 0,
      format('Lập từ báo giá %s của hợp đồng %s — giá trị đã gửi khách %s đồng (giá bán, chưa phải chi phí). Số dự trù do người lập nhập.',
             q.quote_code, q.contract_code,
             COALESCE(replace(to_char(q.quote_value, 'FM999,999,999,999,999'), ',', '.'), 'chưa ghi')),
      v_user, v_user
    );
    v_rows := 1;
  END IF;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, s.company_id, 'build_site_budget', 'construction_sites', p_site_id, NULL,
          jsonb_build_object('quote_code', q.quote_code, 'quote_value', q.quote_value,
                             'from_cost', qs.cost_complete), NULL);

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.build_site_budget_from_quote(uuid) IS
  'Lập ngân sách nháp cho công trình mở từ hợp đồng của cơ hội CRM (0235). 0253: báo giá có giá vốn đầy đủ thì lập theo giá vốn '
  '(dự toán đã duyệt → chia nhóm, bỏ lợi nhuận; đơn giá vốn hạng mục → một dòng tổng); không có thì một dòng tổng 0 đồng. '
  'Ngân sách phải được Tổng Giám đốc duyệt (submit_site_budget) trước khởi công.';

GRANT EXECUTE ON FUNCTION public.build_site_budget_from_quote(uuid) TO authenticated;

-- ============================================================================
-- 4 + 7. Căn cứ thu «khi ký hợp đồng» / «khi hết hạn bảo hành» (tiền giữ lại)
-- ============================================================================
ALTER TABLE public.contract_terms
  ADD COLUMN IF NOT EXISTS collection_trigger text;
ALTER TABLE public.contract_terms DROP CONSTRAINT IF EXISTS contract_terms_collection_trigger_check;
ALTER TABLE public.contract_terms ADD CONSTRAINT contract_terms_collection_trigger_check
  CHECK (collection_trigger IS NULL OR collection_trigger IN ('ky_hop_dong', 'het_bao_hanh'));
ALTER TABLE public.contract_terms DROP CONSTRAINT IF EXISTS contract_terms_one_collection_basis;
ALTER TABLE public.contract_terms ADD CONSTRAINT contract_terms_one_collection_basis
  CHECK (num_nonnulls(site_milestone_id, acceptance_record_id, collection_trigger) <= 1);
COMMENT ON COLUMN public.contract_terms.collection_trigger IS
  'Căn cứ thu không gắn hồ sơ (0253): ky_hop_dong = đến hạn ngay khi ký (tạm ứng / đợt đầu); het_bao_hanh = đợt '
  'tiền giữ lại bảo hành, hạn = ngày hết bảo hành muộn nhất của công trình. Loại trừ với mốc / biên bản.';

-- Hạn thu hồi của đợt giữ lại: ngày hết bảo hành muộn nhất của các công trình thuộc hợp đồng.
CREATE OR REPLACE FUNCTION public.contract_warranty_end(p_contract_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(w.warranty_until)
    FROM public.warranties w
    JOIN public.construction_sites s ON s.id = w.construction_site_id AND s.deleted_at IS NULL
   WHERE s.contract_id = p_contract_id AND w.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.contract_warranty_end(uuid) FROM PUBLIC, anon, authenticated;

-- Canh — chép bản 0195, thêm hai căn cứ mới.
CREATE OR REPLACE FUNCTION public.contract_terms_collection_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system  boolean := COALESCE(current_setting('nvg.collection_due', true), '') = 'on';
  v_changed boolean;
  m         record;
  a         record;
  -- 0253
  k         record;
  v_wend    date;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT v_system
     AND (NEW.collection_due_at IS DISTINCT FROM OLD.collection_due_at
          OR NEW.collection_reminded_at IS DISTINCT FROM OLD.collection_reminded_at) THEN
    RAISE EXCEPTION 'Thời điểm đến hạn thu do hệ thống ghi khi mốc đạt / biên bản ký — không sửa tay.';
  END IF;
  IF TG_OP = 'INSERT' AND NOT v_system THEN
    NEW.collection_due_at := NULL;
    NEW.collection_reminded_at := NULL;
  END IF;

  v_changed := CASE WHEN TG_OP = 'INSERT'
                    THEN NEW.site_milestone_id IS NOT NULL OR NEW.acceptance_record_id IS NOT NULL
                         OR NEW.collection_trigger IS NOT NULL
                    ELSE NEW.site_milestone_id IS DISTINCT FROM OLD.site_milestone_id
                      OR NEW.acceptance_record_id IS DISTINCT FROM OLD.acceptance_record_id
                      OR NEW.collection_trigger IS DISTINCT FROM OLD.collection_trigger END;
  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF (NEW.site_milestone_id IS NOT NULL OR NEW.acceptance_record_id IS NOT NULL OR NEW.collection_trigger IS NOT NULL)
     AND NEW.term_type NOT IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan') THEN
    RAISE EXCEPTION 'Chỉ đợt tạm ứng, tiến độ thanh toán hoặc quyết toán mới gắn được căn cứ thu.';
  END IF;
  -- 0253: đến hạn khi ký chỉ hợp với tạm ứng / đợt thanh toán, không với quyết toán.
  IF NEW.collection_trigger = 'ky_hop_dong' AND NEW.term_type = 'quyet_toan' THEN
    RAISE EXCEPTION 'Đợt quyết toán không đến hạn khi ký hợp đồng — chọn căn cứ khác.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Đợt này đã hoàn thành — không đổi căn cứ thu.';
  END IF;

  NEW.collection_due_at := NULL;
  NEW.collection_reminded_at := NULL;

  IF NEW.site_milestone_id IS NOT NULL THEN
    SELECT sm.status, sm.passed_at INTO m
      FROM public.site_milestones sm
      JOIN public.construction_sites s ON s.id = sm.construction_site_id
     WHERE sm.id = NEW.site_milestone_id AND s.contract_id = NEW.contract_id AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Mốc được chọn không thuộc công trình của hợp đồng này.';
    END IF;
    IF m.status = 'dat' THEN
      NEW.collection_due_at := COALESCE(m.passed_at, now());
    END IF;
  ELSIF NEW.acceptance_record_id IS NOT NULL THEN
    SELECT ar.signed_at, ar.status INTO a
      FROM public.acceptance_records ar
      JOIN public.construction_sites s ON s.id = ar.construction_site_id
     WHERE ar.id = NEW.acceptance_record_id AND s.contract_id = NEW.contract_id
       AND ar.acceptance_type = 'khach_hang' AND ar.deleted_at IS NULL AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Biên bản được chọn không phải biên bản nghiệm thu với chủ đầu tư của công trình thuộc hợp đồng này.';
    END IF;
    IF a.status <> 'da_nghiem_thu' THEN
      RAISE EXCEPTION 'Biên bản này đã hủy — chọn biên bản khác.';
    END IF;
    NEW.collection_due_at := a.signed_at;
  ELSIF NEW.collection_trigger = 'ky_hop_dong' THEN
    -- 0253: hợp đồng đã ký → đến hạn từ lúc ký; chưa ký → trigger trên `contracts` ghi lúc ký.
    SELECT c.stage::text AS stage, c.signed_at INTO k FROM public.contracts c WHERE c.id = NEW.contract_id;
    IF k.stage IN ('da_ky', 'hoan_thanh') THEN
      NEW.collection_due_at := COALESCE(k.signed_at, now());
    END IF;
  ELSIF NEW.collection_trigger = 'het_bao_hanh' THEN
    -- 0253: hạn = ngày hết bảo hành muộn nhất (chưa khai bảo hành thì giữ hạn đã ghi); tới hạn do quét đêm.
    v_wend := public.contract_warranty_end(NEW.contract_id);
    IF v_wend IS NOT NULL THEN
      NEW.due_date := v_wend;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Báo khi đợt đến hạn thu — chép bản 0195, thêm câu căn cứ cho hai căn cứ mới.
CREATE OR REPLACE FUNCTION public.contract_terms_collection_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_basis  text;
  v_amount bigint;
BEGIN
  IF NEW.collection_due_at IS NULL OR NEW.completed_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
     OR (TG_OP = 'UPDATE' AND OLD.collection_due_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO c FROM public.contracts WHERE id = NEW.contract_id;
  IF NOT FOUND OR c.stage NOT IN ('da_ky', 'hoan_thanh') THEN
    RETURN NULL;
  END IF;
  IF NEW.site_milestone_id IS NOT NULL THEN
    SELECT format('mốc «%s» (công trình %s) đã đạt', sm.label, s.code) INTO v_basis
      FROM public.site_milestones sm JOIN public.construction_sites s ON s.id = sm.construction_site_id
     WHERE sm.id = NEW.site_milestone_id;
  ELSIF NEW.collection_trigger = 'ky_hop_dong' THEN
    v_basis := 'hợp đồng đã ký';
  ELSIF NEW.collection_trigger = 'het_bao_hanh' THEN
    v_basis := format('hết hạn bảo hành%s', COALESCE(' ngày ' || to_char(NEW.due_date, 'DD/MM/YYYY'), ''));
  ELSE
    SELECT format('biên bản %s (%s) đã ký hai bên', ar.code, ar.stage_name) INTO v_basis
      FROM public.acceptance_records ar WHERE ar.id = NEW.acceptance_record_id;
  END IF;
  v_amount := public.contract_term_amount(NEW.amount, NEW.percent_value, c.value);
  PERFORM public.notify_collection_recipients(
    NEW.id, 'collection_due',
    format('Đợt thu «%s» của hợp đồng %s đến hạn thu: %s%s.',
           btrim(NEW.description), c.code, COALESCE(v_basis, 'căn cứ đã đạt'),
           CASE WHEN v_amount IS NOT NULL
                THEN ' — ' || replace(to_char(v_amount, 'FM999,999,999,999'), ',', '.') || ' đồng' ELSE '' END)
  );
  RETURN NULL;
END;
$$;

-- Ký hợp đồng → các đợt «khi ký» đến hạn thu (notify chạy theo trigger 0195).
CREATE OR REPLACE FUNCTION public.contracts_collection_due_on_sign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('nvg.collection_due', 'on', true);
  UPDATE public.contract_terms
     SET collection_due_at = COALESCE(NEW.signed_at, now())
   WHERE contract_id = NEW.id AND collection_trigger = 'ky_hop_dong'
     AND collection_due_at IS NULL AND completed_at IS NULL AND deleted_at IS NULL;
  PERFORM set_config('nvg.collection_due', '', true);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_collection_due_on_sign() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_collection_due_on_sign ON public.contracts;
CREATE TRIGGER contracts_collection_due_on_sign
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW
  WHEN (NEW.stage = 'da_ky' AND OLD.stage IS DISTINCT FROM 'da_ky')
  EXECUTE FUNCTION public.contracts_collection_due_on_sign();

-- Khai / sửa bảo hành → hạn của đợt giữ lại theo ngày hết bảo hành muộn nhất.
CREATE OR REPLACE FUNCTION public.warranties_refresh_retention_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
  v_end      date;
BEGIN
  SELECT s.contract_id INTO v_contract FROM public.construction_sites s
   WHERE s.id = COALESCE(NEW.construction_site_id, OLD.construction_site_id);
  IF v_contract IS NULL THEN
    RETURN NULL;
  END IF;
  v_end := public.contract_warranty_end(v_contract);
  IF v_end IS NOT NULL THEN
    PERFORM set_config('nvg.collection_due', 'on', true);
    UPDATE public.contract_terms
       SET due_date = v_end, collection_reminded_at = NULL,
           collection_due_at = CASE WHEN v_end > current_date THEN NULL ELSE collection_due_at END
     WHERE contract_id = v_contract AND collection_trigger = 'het_bao_hanh'
       AND completed_at IS NULL AND deleted_at IS NULL AND due_date IS DISTINCT FROM v_end;
    PERFORM set_config('nvg.collection_due', '', true);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.warranties_refresh_retention_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS warranties_refresh_retention_terms ON public.warranties;
CREATE TRIGGER warranties_refresh_retention_terms
  AFTER INSERT OR UPDATE OF warranty_until, deleted_at ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.warranties_refresh_retention_terms();

-- Gắn / gỡ căn cứ — bản 0195 thêm `p_trigger` (ky_hop_dong | het_bao_hanh).
DROP FUNCTION IF EXISTS public.link_collection_term(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.link_collection_term(
  p_term_id       uuid,
  p_milestone_id  uuid DEFAULT NULL,
  p_acceptance_id uuid DEFAULT NULL,
  p_trigger       text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t     record;
  v_due timestamptz;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO t FROM public.contract_terms WHERE id = p_term_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_collection_editable(t.contract_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc Kế toán của pháp nhân gắn được căn cứ thu.';
  END IF;
  IF num_nonnulls(p_milestone_id, p_acceptance_id, NULLIF(p_trigger, '')) > 1 THEN
    RAISE EXCEPTION 'Mỗi đợt chỉ gắn một căn cứ: mốc, biên bản, khi ký hợp đồng HOẶC khi hết bảo hành.';
  END IF;
  UPDATE public.contract_terms
     SET site_milestone_id = p_milestone_id, acceptance_record_id = p_acceptance_id,
         collection_trigger = NULLIF(p_trigger, ''),
         updated_by = public.auth_user_id()
   WHERE id = p_term_id
  RETURNING collection_due_at INTO v_due;
  RETURN v_due;
END;
$$;
REVOKE ALL ON FUNCTION public.link_collection_term(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_collection_term(uuid, uuid, uuid, text) TO authenticated;

-- Danh sách đợt thu của Kế toán — chép bản 0195; `basis_kind` thêm 'ky' / 'bao_hanh'.
DROP FUNCTION IF EXISTS public.kt_collection_schedule(uuid);
CREATE OR REPLACE FUNCTION public.kt_collection_schedule(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  term_id uuid, company_id uuid, contract_id uuid, contract_code text, contract_number text,
  contract_title text, customer_name text, responsible_name text, term_type text,
  description text, amount bigint, due_date date, completed_at timestamptz,
  basis_kind text, basis_label text, basis_reached_at timestamptz, site_code text,
  acceptance_record_id uuid, collection_due_at timestamptz, state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_soon numeric := public.system_parameter_number('kt.collection_remind_days_before');
BEGIN
  IF NOT public.auth_can_view_module('KT') THEN
    RAISE EXCEPTION 'Chỉ Kế toán – Tài chính và Ban Giám đốc xem được danh sách đợt thu.';
  END IF;
  RETURN QUERY
  SELECT ct.id, c.company_id, c.id, c.code::text, c.contract_number::text, c.title,
         COALESCE(cu.name, '')::text, (SELECT u.full_name FROM public.users u WHERE u.id = c.responsible_user_id)::text,
         ct.term_type::text, ct.description,
         public.contract_term_amount(ct.amount, ct.percent_value, c.value),
         ct.due_date, ct.completed_at,
         CASE WHEN ct.site_milestone_id IS NOT NULL THEN 'moc'
              WHEN ct.acceptance_record_id IS NOT NULL THEN 'bien_ban'
              WHEN ct.collection_trigger = 'ky_hop_dong' THEN 'ky'
              WHEN ct.collection_trigger = 'het_bao_hanh' THEN 'bao_hanh' END,
         COALESCE(sm.label, CASE WHEN ar.id IS NOT NULL THEN format('%s — %s', ar.code, ar.stage_name) END,
                  CASE ct.collection_trigger WHEN 'ky_hop_dong' THEN 'Khi ký hợp đồng'
                                             WHEN 'het_bao_hanh' THEN 'Khi hết hạn bảo hành (tiền giữ lại)' END),
         COALESCE(sm.passed_at, ar.signed_at,
                  CASE WHEN ct.collection_trigger = 'ky_hop_dong' THEN c.signed_at END),
         COALESCE(s1.code, s2.code)::text,
         ct.acceptance_record_id,
         ct.collection_due_at,
         CASE
           WHEN ct.completed_at IS NOT NULL THEN 'da_xong'
           WHEN ct.collection_due_at IS NOT NULL OR ct.due_date <= current_date THEN 'den_han'
           WHEN v_soon IS NOT NULL AND ct.due_date - v_soon::int <= current_date THEN 'sap_den'
           ELSE 'chua_den'
         END
    FROM public.contract_terms ct
    JOIN public.contracts c ON c.id = ct.contract_id
    LEFT JOIN public.customers cu ON cu.id = c.customer_id
    LEFT JOIN public.site_milestones sm ON sm.id = ct.site_milestone_id
    LEFT JOIN public.construction_sites s1 ON s1.id = sm.construction_site_id
    LEFT JOIN public.acceptance_records ar ON ar.id = ct.acceptance_record_id
    LEFT JOIN public.construction_sites s2 ON s2.id = ar.construction_site_id
   WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
     AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
     AND c.stage IN ('da_ky', 'hoan_thanh')
     AND public.rls_company_access(c.company_id)
     AND (p_company_id IS NULL OR c.company_id = p_company_id)
   ORDER BY (ct.completed_at IS NOT NULL), ct.collection_due_at NULLS LAST,
            ct.due_date NULLS LAST, c.code, ct.position;
END;
$$;

REVOKE ALL ON FUNCTION public.kt_collection_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_collection_schedule(uuid) TO authenticated;

-- Quét đêm — chép bản 0195; đợt giữ lại (het_bao_hanh) tách khỏi vòng nhắc chung: nhắc trước theo
-- `kt.retention_remind_days` (TRỐNG = báo đúng ngày tới hạn, như 0248), tới hạn thì «đến hạn thu».
CREATE OR REPLACE FUNCTION public.scan_collection_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days numeric := public.system_parameter_number('kt.collection_remind_days_before');
  t      record;
  v_sent integer := 0;
  -- 0253
  v_rlead numeric := public.system_parameter_number('kt.retention_remind_days');
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF v_days IS NOT NULL THEN
    FOR t IN
      SELECT ct.id, ct.description, ct.due_date, ct.amount, ct.percent_value, c.code, c.value
        FROM public.contract_terms ct
        JOIN public.contracts c ON c.id = ct.contract_id
       WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
         AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
         AND c.stage IN ('da_ky', 'hoan_thanh')
         AND ct.completed_at IS NULL AND ct.collection_reminded_at IS NULL
         AND ct.collection_trigger IS DISTINCT FROM 'het_bao_hanh'
         AND ct.due_date IS NOT NULL AND ct.due_date - v_days::int <= current_date
    LOOP
      PERFORM public.notify_collection_recipients(
        t.id, 'collection_reminder',
        format('Đợt thu «%s» của hợp đồng %s hạn %s%s — chuẩn bị đề nghị thu.',
               btrim(t.description), t.code, to_char(t.due_date, 'DD/MM/YYYY'),
               COALESCE(' — ' || replace(to_char(public.contract_term_amount(t.amount, t.percent_value, t.value),
                                         'FM999,999,999,999'), ',', '.') || ' đồng', '')));
      PERFORM set_config('nvg.collection_due', 'on', true);
      UPDATE public.contract_terms SET collection_reminded_at = now() WHERE id = t.id;
      PERFORM set_config('nvg.collection_due', '', true);
      v_sent := v_sent + 1;
    END LOOP;
  END IF;

  -- 0253: đợt tiền giữ lại bảo hành.
  FOR t IN
    SELECT ct.id, ct.description, ct.due_date, ct.amount, ct.percent_value, ct.collection_reminded_at,
           c.code, c.value
      FROM public.contract_terms ct
      JOIN public.contracts c ON c.id = ct.contract_id
     WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
       AND c.stage IN ('da_ky', 'hoan_thanh')
       AND ct.collection_trigger = 'het_bao_hanh'
       AND ct.completed_at IS NULL AND ct.collection_due_at IS NULL
       AND ct.due_date IS NOT NULL AND ct.due_date - COALESCE(v_rlead, 0)::int <= v_today
  LOOP
    PERFORM set_config('nvg.collection_due', 'on', true);
    IF t.due_date <= v_today THEN
      -- Tới hạn: «đến hạn thu» — báo bằng trigger 0195 (contract_terms_collection_notify).
      UPDATE public.contract_terms SET collection_due_at = now(), collection_reminded_at = now() WHERE id = t.id;
      v_sent := v_sent + 1;
    ELSIF t.collection_reminded_at IS NULL THEN
      PERFORM public.notify_collection_recipients(
        t.id, 'retention_due',
        format('Đợt giữ lại bảo hành «%s» của hợp đồng %s tới hạn thu hồi ngày %s%s — chuẩn bị thủ tục thu hồi.',
               btrim(t.description), t.code, to_char(t.due_date, 'DD/MM/YYYY'),
               COALESCE(' — ' || replace(to_char(public.contract_term_amount(t.amount, t.percent_value, t.value),
                                         'FM999,999,999,999'), ',', '.') || ' đồng', '')));
      UPDATE public.contract_terms SET collection_reminded_at = now() WHERE id = t.id;
      v_sent := v_sent + 1;
    END IF;
    PERFORM set_config('nvg.collection_due', '', true);
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_collection_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_collection_reminders() TO service_role;

-- --- 7. Hồ sơ thanh toán chủ đầu tư không tự trừ giữ lại ---------------------------------------
-- Chép bản 0248: bỏ mặc định theo tỷ lệ điều khoản Bảo hành; từ chối số giữ lại > 0.
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
  -- 0253 (anh Dũng 30/10/2026): tiền giữ lại bảo hành chỉ giữ ở ĐỢT THANH TOÁN của hợp đồng — tính thêm
  -- ở đây là đếm hai lần trên dòng tiền.
  IF COALESCE(p_retention_amount, 0) > 0 OR COALESCE(p_retention_rate, 0) > 0 THEN
    RAISE EXCEPTION 'Tiền giữ lại bảo hành chỉ ghi ở đợt thanh toán «giữ lại bảo hành» của hợp đồng — hồ sơ thanh toán không trừ thêm.';
  END IF;

  PERFORM set_config('nvg.collection_request', 'on', true);
  UPDATE public.collection_requests
     SET owner_approved_amount = p_approved_amount, owner_approved_date = p_approved_date,
         owner_approval_scan_path = p_scan_path, owner_approved_by = public.auth_user_id(),
         retention_rate = NULL,
         retention_amount = 0
   WHERE id = p_id;
  PERFORM set_config('nvg.collection_request', '', true);
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_collection_owner_approval(uuid, bigint, date, text, numeric, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_collection_owner_approval(uuid, bigint, date, text, numeric, bigint) TO authenticated;

-- Tiền giữ lại còn mở của hợp đồng — chép bản 0248, thêm các ĐỢT giữ lại chưa thu (0253).
CREATE OR REPLACE FUNCTION public.contract_open_retention_guarantees(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value bigint;
BEGIN
  IF NOT public.rls_contract_guarantee_readable(p_contract_id) THEN
    RETURN NULL;
  END IF;
  SELECT value INTO v_value FROM public.contracts WHERE id = p_contract_id;
  RETURN jsonb_build_object(
    'retention_outstanding', COALESCE((
      SELECT sum(rp.amount - rp.settled_amount) FROM public.receivables_payables rp
       WHERE rp.contract_id = p_contract_id AND rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL
         AND rp.settled_amount < rp.amount), 0)
      + COALESCE((
      SELECT sum(public.contract_term_amount(ct.amount, ct.percent_value, v_value)) FROM public.contract_terms ct
       WHERE ct.contract_id = p_contract_id AND ct.collection_trigger = 'het_bao_hanh'
         AND ct.deleted_at IS NULL AND ct.completed_at IS NULL), 0),
    'retention_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', rp.id, 'description', rp.description, 'amount', rp.amount,
                                          'settled_amount', rp.settled_amount, 'due_date', rp.due_date)
                       ORDER BY rp.due_date NULLS LAST)
        FROM public.receivables_payables rp
       WHERE rp.contract_id = p_contract_id AND rp.receivable_kind = 'giu_lai' AND rp.deleted_at IS NULL
         AND rp.settled_amount < rp.amount), '[]'::jsonb),
    'retention_terms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'description', ct.description,
                                          'amount', public.contract_term_amount(ct.amount, ct.percent_value, v_value),
                                          'due_date', ct.due_date, 'due', ct.collection_due_at IS NOT NULL)
                       ORDER BY ct.due_date NULLS LAST)
        FROM public.contract_terms ct
       WHERE ct.contract_id = p_contract_id AND ct.collection_trigger = 'het_bao_hanh'
         AND ct.deleted_at IS NULL AND ct.completed_at IS NULL), '[]'::jsonb),
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

-- Báo thu hồi khi công trình kết thúc / quyết toán / thanh lý — chép bản 0248, cộng các đợt giữ lại (0253).
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
  -- 0253: đợt giữ lại của hợp đồng chưa thu.
  v_ret := v_ret + COALESCE((
    SELECT sum(public.contract_term_amount(ct.amount, ct.percent_value, c.value))
      FROM public.contract_terms ct JOIN public.contracts c ON c.id = ct.contract_id
     WHERE ct.contract_id = p_contract_id AND ct.collection_trigger = 'het_bao_hanh'
       AND ct.deleted_at IS NULL AND ct.completed_at IS NULL), 0);
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

-- ============================================================================
-- 5. Báo giá «Gửi khách» ghi kênh
-- ============================================================================
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS sent_channel text;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_sent_channel_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('zalo', 'email', 'tan_tay', 'khac'));
COMMENT ON COLUMN public.quotes.sent_channel IS
  'Kênh gửi báo giá cho khách (0253): zalo / email / tan_tay / khac. Ghi cùng sent_to_customer_at; báo giá gửi trước 0253 để trống.';

DROP TRIGGER IF EXISTS quotes_sent_channel_guard ON public.quotes;
CREATE TRIGGER quotes_sent_channel_guard
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only('sent_channel');

-- Chép bản 0013, thêm kênh gửi.
DROP FUNCTION IF EXISTS public.send_quote_to_customer(uuid);
CREATE OR REPLACE FUNCTION public.send_quote_to_customer(p_quote_id uuid, p_channel text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- 0253: kênh gửi.
  IF p_channel IS NOT NULL AND p_channel NOT IN ('zalo', 'email', 'tan_tay', 'khac') THEN
    RAISE EXCEPTION 'Kênh gửi không hợp lệ — chọn Zalo, Email, Gửi tận tay hoặc Khác.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội hoặc quản lý trực tiếp mới gửi được báo giá cho khách hàng.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã được gửi cho khách hàng.';
  END IF;

  -- PRD CRM-04: "báo giá phải qua phê duyệt nội bộ trước khi gửi".
  IF q.status <> 'completed' THEN
    RAISE EXCEPTION 'Báo giá chưa được phê duyệt nội bộ nên chưa gửi được cho khách hàng.';
  END IF;

  IF NOT q.is_current_version THEN
    RAISE EXCEPTION 'Đây không phải phiên bản đang hiệu lực. Gửi phiên bản mới nhất cho khách hàng.';
  END IF;

  UPDATE public.quotes
     SET sent_to_customer_at = now(), sent_channel = p_channel, updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_quote_to_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_quote_to_customer(uuid, text) TO authenticated;

-- Mở Zalo gửi báo giá đã duyệt (0238 ghi `outbound_shares`) → máy ghi đã gửi qua Zalo; đã gửi mà chưa
-- ghi kênh thì bổ sung kênh. Lỗi ở đây không làm hỏng lượt ghi lịch sử chia sẻ.
CREATE OR REPLACE FUNCTION public.outbound_shares_quote_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q record;
BEGIN
  IF NEW.entity_type <> 'quotes' OR NEW.channel <> 'zalo' OR NEW.simulated THEN
    RETURN NULL;
  END IF;
  SELECT id, status, is_current_version, sent_to_customer_at, sent_channel INTO q
    FROM public.quotes WHERE id = NEW.entity_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  BEGIN
    IF q.sent_to_customer_at IS NULL AND q.status = 'completed' AND q.is_current_version THEN
      PERFORM public.send_quote_to_customer(q.id, 'zalo');
    ELSIF q.sent_to_customer_at IS NOT NULL AND q.sent_channel IS NULL THEN
      UPDATE public.quotes SET sent_channel = 'zalo' WHERE id = q.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Không ghi được kênh gửi báo giá %: %', q.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.outbound_shares_quote_sent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS outbound_shares_quote_sent ON public.outbound_shares;
CREATE TRIGGER outbound_shares_quote_sent
  AFTER INSERT ON public.outbound_shares
  FOR EACH ROW EXECUTE FUNCTION public.outbound_shares_quote_sent();

-- ============================================================================
-- 6. Lợi nhuận dự toán: số MÁY TÍNH là căn cứ
-- ============================================================================
-- Bản 0244 đổi thân, giữ chữ ký: lợi nhuận = giá trước thuế − (trực tiếp + chung + dự phòng + tài chính);
-- % = lợi nhuận ÷ giá trước thuế. Số người lập gõ (`profit_amount`, `profit_margin_percent`) KHÔNG còn quyết
-- loại duyệt — chỉ hiện cạnh bên kèm cảnh báo lệch (`price_margin_brief`).
CREATE OR REPLACE FUNCTION public._estimate_margin_state(
  p_estimate_id uuid,
  OUT revenue bigint,
  OUT cost bigint,
  OUT profit bigint,
  OUT margin_percent numeric,
  OUT cost_complete boolean,
  OUT min_margin numeric,
  OUT needs_ceo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  revenue := CASE WHEN e.bid_price IS NULL THEN NULL ELSE e.bid_price - COALESCE(e.tax_amount, 0) END;
  cost_complete := e.direct_cost IS NOT NULL OR e.overhead_cost IS NOT NULL
                   OR e.contingency_cost IS NOT NULL OR e.finance_cost IS NOT NULL;
  IF cost_complete THEN
    cost := COALESCE(e.direct_cost, 0) + COALESCE(e.overhead_cost, 0)
          + COALESCE(e.contingency_cost, 0) + COALESCE(e.finance_cost, 0);
  END IF;
  -- 0253: chỉ số máy tính.
  profit := CASE WHEN cost_complete AND revenue IS NOT NULL THEN revenue - cost END;
  margin_percent := CASE WHEN profit IS NOT NULL AND revenue > 0
                         THEN round(profit::numeric * 100 / revenue, 2) END;
  min_margin := CASE WHEN e.status = 'draft'
                     THEN public.system_parameter_number('min_margin_percent', 'company', e.company_id)
                     ELSE e.min_margin_applied END;
  needs_ceo := min_margin IS NOT NULL AND (margin_percent IS NULL OR margin_percent < min_margin);
END;
$$;
REVOKE ALL ON FUNCTION public._estimate_margin_state(uuid) FROM PUBLIC, anon, authenticated;

-- Số người lập gõ và có lệch số máy tính không. Lệch = lợi nhuận gõ khác số tính quá 0,5 % giá trước thuế,
-- hoặc % gõ khác % tính quá 0,5 điểm.
CREATE OR REPLACE FUNCTION public._estimate_typed_margin(
  p_estimate_id uuid,
  OUT typed_profit bigint,
  OUT typed_margin_percent numeric,
  OUT mismatch boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e  record;
  st record;
BEGIN
  SELECT profit_amount, profit_margin_percent INTO e FROM public.estimates WHERE id = p_estimate_id;
  typed_profit := e.profit_amount;
  typed_margin_percent := e.profit_margin_percent;
  st := public._estimate_margin_state(p_estimate_id);
  mismatch := (typed_profit IS NOT NULL
               AND (st.profit IS NULL
                    OR abs(typed_profit - st.profit) > GREATEST(abs(COALESCE(st.revenue, 0)) * 0.005, 1000)))
           OR (typed_margin_percent IS NOT NULL
               AND (st.margin_percent IS NULL OR abs(typed_margin_percent - st.margin_percent) > 0.5));
END;
$$;
REVOKE ALL ON FUNCTION public._estimate_typed_margin(uuid) FROM PUBLIC, anon, authenticated;

-- Chép bản 0244, thêm ba cột: số gõ tay + cờ lệch (chỉ người xem được giá vốn).
DROP FUNCTION IF EXISTS public.price_margin_brief(text, uuid);
CREATE OR REPLACE FUNCTION public.price_margin_brief(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (
  entity_type text,
  scope_kind text,
  revenue bigint,
  vat_amount bigint,
  discount_amount bigint,
  sees_cost boolean,
  cost bigint,
  profit bigint,
  margin_percent numeric,
  cost_complete boolean,
  cost_source text,
  min_margin numeric,
  needs_ceo boolean,
  routed_to_ceo boolean,
  risk_note text,
  payment_terms text,
  typed_profit bigint,
  typed_margin_percent numeric,
  typed_mismatch boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_sees    boolean := public.rls_sees_sensitive('cost');
  v_visible boolean;
  q         record;
  e         record;
  st        record;
  v_routed  boolean;
  -- 0253
  tm        record;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_entity_type = 'quotes' THEN
    SELECT * INTO q FROM public.quotes WHERE id = p_entity_id AND deleted_at IS NULL;
    v_company := q.company_id;
  ELSIF p_entity_type = 'estimates' THEN
    SELECT * INTO e FROM public.estimates WHERE id = p_entity_id AND deleted_at IS NULL;
    v_company := e.company_id;
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ.';
  END IF;

  v_visible := EXISTS (
    SELECT 1 FROM public.approvals a
     WHERE a.entity_type = p_entity_type AND a.entity_id = p_entity_id AND a.deleted_at IS NULL
       AND (a.requested_by = public.auth_user_id() OR public.rls_can_approve(a.subject, a.company_id, a.amount))
  );
  -- Không đọc biến bản ghi của nhánh kia: record chưa gán thì plpgsql báo lỗi.
  IF NOT v_visible THEN
    IF p_entity_type = 'quotes' THEN
      v_visible := public.rls_company_access(v_company);
    ELSE
      v_visible := public.rls_estimate_parent_readable(e.bidding_project_id, e.design_project_id);
    END IF;
  END IF;
  IF NOT v_visible THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ.';
  END IF;

  SELECT COALESCE(bool_or(a.subject::text = 'low_margin_price'), false) INTO v_routed
    FROM public.approvals a
   WHERE a.entity_type = p_entity_type AND a.entity_id = p_entity_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  IF v_sees THEN
    PERFORM public.log_sensitive_access('cost', p_entity_type, p_entity_id, 'view', v_company);
  END IF;

  IF p_entity_type = 'quotes' THEN
    st := public._quote_margin_state(p_entity_id);
    RETURN QUERY SELECT
      'quotes'::text, q.scope_kind, st.revenue, q.vat_amount, q.discount_amount, v_sees,
      CASE WHEN v_sees THEN st.cost END,
      CASE WHEN v_sees THEN st.profit END,
      CASE WHEN v_sees THEN st.margin_percent END,
      st.cost_complete, st.cost_source,
      CASE WHEN v_sees THEN st.min_margin END,
      CASE WHEN v_sees THEN st.needs_ceo END,
      v_routed, q.risk_note,
      (SELECT t.texts ->> 'dieu_khoan_thanh_toan' FROM public.quote_texts t WHERE t.quote_id = q.id),
      NULL::bigint, NULL::numeric, NULL::boolean;
  ELSE
    st := public._estimate_margin_state(p_entity_id);
    tm := public._estimate_typed_margin(p_entity_id);
    RETURN QUERY SELECT
      'estimates'::text, NULL::text, st.revenue, e.tax_amount, NULL::bigint, v_sees,
      CASE WHEN v_sees THEN st.cost END,
      CASE WHEN v_sees THEN st.profit END,
      CASE WHEN v_sees THEN st.margin_percent END,
      st.cost_complete, 'du_toan'::text,
      CASE WHEN v_sees THEN st.min_margin END,
      CASE WHEN v_sees THEN st.needs_ceo END,
      v_routed, e.risk_note, NULL::text,
      CASE WHEN v_sees THEN tm.typed_profit END,
      CASE WHEN v_sees THEN tm.typed_margin_percent END,
      CASE WHEN v_sees THEN tm.mismatch END;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.price_margin_brief(text, uuid) IS
  'Doanh thu, giá vốn, lợi nhuận, %, mức tối thiểu, rủi ro, điều kiện thanh toán của báo giá / dự toán cho hộp duyệt (0244). '
  '0253: lợi nhuận dự toán là số máy tính; số người lập gõ trả riêng kèm cờ lệch. Số giá vốn chỉ cho vai trò xem giá vốn, có ghi nhật ký.';
REVOKE ALL ON FUNCTION public.price_margin_brief(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.price_margin_brief(text, uuid) TO authenticated;

-- ============================================================================
-- stage_readiness — chép NGUYÊN VĂN bản 0249, thêm: hợp đồng thiết kế (việc 1), ngân sách đã duyệt (việc 3)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.stage_readiness(p_entity_type text, p_id uuid)
RETURNS TABLE (for_stage text, requirement text, met boolean, label text, waivable boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o            record;
  c            record;
  v_site       record;
  v_missing    text[];
  v_classified boolean;
  v_class_lbl  text;
  v_surveyed   boolean;
  v_any_surveyed boolean;
  v_bid        record;
  -- 0253
  v_budget     text;
  v_dproblem   text;
BEGIN
  IF p_entity_type = 'opportunity' THEN
    SELECT id, company_id, stage, classification, project_type, survey_waived_reason, deleted_at
      INTO o
      FROM public.opportunities WHERE id = p_id;
    -- Không đọc được cơ hội thì không trả gì — không lộ cả việc cơ hội có tồn tại.
    IF NOT FOUND OR o.deleted_at IS NOT NULL OR NOT public.rls_company_access(o.company_id) THEN
      RETURN;
    END IF;

    v_classified := o.classification IN ('M2', 'M3', 'M4')
                    AND NULLIF(btrim(o.project_type), '') IS NOT NULL;
    v_class_lbl := CASE
      WHEN o.classification = 'M1' THEN
        'Khách đang ở mức «Chưa có nhu cầu — lưu để chăm sóc sau» (M1): chỉ đi tiếp khi khách có nhu cầu thật'
      ELSE 'Đã phân loại: khách có nhu cầu thật (M2–M4) và khai loại công trình'
    END;
    -- 0175 (Đợt 1 — 1D): «đã khảo sát» = có biên bản đã khảo sát VÀ báo cáo đã được Ban Giám đốc
    -- duyệt. Chưa duyệt (nháp, chờ duyệt, bị trả về) thì chưa sang Báo giá — chủ dự án chốt.
    v_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                           WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                             AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                             AND s.report_status = 'da_duyet');
    -- Đã có buổi khảo sát thật thì KHÔNG còn lối «bỏ qua khảo sát»: lối đó dành cho cơ hội không
    -- khảo sát, dùng ở đây là vượt qua Ban Giám đốc (thấy khi chạy thử 17/10/2026).
    v_any_surveyed := EXISTS (SELECT 1 FROM public.site_surveys s
                               WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                                 AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now());

    RETURN QUERY SELECT 'khao_sat'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY SELECT 'bao_gia'::text, 'classified'::text, v_classified, v_class_lbl, false;

    RETURN QUERY
    SELECT 'bao_gia'::text, 'survey_done'::text,
           v_surveyed OR (o.survey_waived_reason IS NOT NULL AND NOT v_any_surveyed),
           CASE WHEN NOT v_any_surveyed AND o.survey_waived_reason IS NOT NULL
                THEN 'Bỏ qua khảo sát: ' || o.survey_waived_reason
                -- 0183: nói đúng tình trạng báo cáo — «gửi báo cáo, chờ duyệt» đọc như ĐÃ gửi rồi,
                -- trong khi báo cáo còn nháp (anh Dũng chạy thử 20/10/2026).
                WHEN v_any_surveyed AND NOT v_surveyed
                THEN CASE (SELECT s.report_status::text FROM public.site_surveys s
                            WHERE s.opportunity_id = p_id AND s.deleted_at IS NULL
                              AND s.surveyed_at IS NOT NULL AND s.surveyed_at <= now()
                            ORDER BY s.surveyed_at DESC LIMIT 1)
                       WHEN 'cho_duyet'
                       THEN 'Báo cáo khảo sát đang chờ Ban Giám đốc duyệt — duyệt xong tự sang Báo giá'
                       WHEN 'tra_ve'
                       THEN 'Báo cáo khảo sát bị Ban Giám đốc trả về — sửa theo ý kiến rồi gửi lại'
                       ELSE 'Đã khảo sát nhưng chưa gửi báo cáo — bấm «Gửi Ban Giám đốc duyệt» ở tab Khảo sát'
                     END
                ELSE 'Báo cáo khảo sát đã được Ban Giám đốc duyệt' END,
           NOT v_any_surveyed;

    RETURN QUERY
    SELECT 'dam_phan'::text, 'offer_sent'::text,
           (EXISTS (SELECT 1 FROM public.quotes q
                     WHERE q.opportunity_id = p_id AND q.is_current_version AND q.deleted_at IS NULL
                       AND q.status = 'completed' AND q.sent_to_customer_at IS NOT NULL)
            OR EXISTS (SELECT 1 FROM public.bidding_projects b
                        WHERE b.opportunity_id = p_id AND b.deleted_at IS NULL
                          AND b.stage IN ('nop_thau', 'trung_thau'))
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.opportunity_id = p_id AND d.deleted_at IS NULL
                          AND d.stage IN ('cho_khach_duyet', 'ho_so_ky_thuat', 'du_toan',
                                          'ban_giao', 'dung_thiet_ke'))),
           'Báo giá đã duyệt và đã gửi khách, hoặc gói thầu đã nộp, hoặc phương án thiết kế đã gửi khách duyệt'::text,
           false;

    RETURN QUERY
    SELECT 'ky_hop_dong'::text, 'contract_signed'::text, false,
           -- 0243: hợp đồng thiết kế ký xong chưa đủ (còn hợp đồng thi công), trừ khi «Chỉ thiết kế».
           CASE WHEN (SELECT design_only_at FROM public.opportunities WHERE id = p_id) IS NOT NULL
                THEN 'Chỉ thiết kế: tự chuyển khi hợp đồng thiết kế được ghi nhận đã ký'
                ELSE 'Tự chuyển khi hợp đồng thi công (hoặc thiết kế – thi công trọn gói) được ghi nhận đã ký — hợp đồng thiết kế ký xong cơ hội vẫn mở'
           END::text, false;
  END IF;
  IF p_entity_type = 'contract' THEN
    SELECT id, value, stage, deleted_at, scope_kind INTO c FROM public.contracts WHERE id = p_id;
    IF NOT FOUND OR c.deleted_at IS NOT NULL OR NOT public.rls_contract_readable(p_id) THEN
      RETURN;
    END IF;

    -- Cùng ba nhóm điều khoản mà `submit_contract_approval` (0027) chặn — đọc trước để màn hình
    -- nói «còn thiếu gì» thay vì để người dùng bấm rồi mới nhận lỗi.
    SELECT array_agg(CASE r.t WHEN 'pham_vi' THEN 'phạm vi công việc'
                              ELSE 'tiến độ thanh toán' END ORDER BY r.n)
      INTO v_missing
      FROM unnest(ARRAY['pham_vi', 'tien_do_thanh_toan']::contract_term_type[])
           WITH ORDINALITY AS r(t, n)
     WHERE NOT EXISTS (SELECT 1 FROM public.contract_terms ct
                        WHERE ct.contract_id = p_id AND ct.deleted_at IS NULL AND ct.term_type = r.t);

    RETURN QUERY SELECT 'cho_duyet'::text, 'value_set'::text,
           COALESCE(c.value, 0) > 0,
           'Có giá trị hợp đồng (lấy từ báo giá / dự toán đã duyệt)'::text, false;

    RETURN QUERY SELECT 'cho_duyet'::text, 'terms_complete'::text,
           v_missing IS NULL,
           CASE WHEN v_missing IS NULL
                THEN 'Đã ghi đủ điều khoản bắt buộc: phạm vi công việc, tiến độ thanh toán'
                ELSE 'Ghi điều khoản còn thiếu: ' || array_to_string(v_missing, ', ') END,
           false;

    -- 0176 (Đợt 1 — 1E): pháp nhân đã có mẫu Word cho loại hợp đồng này thì phải lập văn bản trước
    -- khi gửi phê duyệt — người duyệt xem đúng văn bản sẽ ký. Chưa có mẫu thì không đòi.
    IF public.contract_requires_document(p_id) THEN
      RETURN QUERY SELECT 'cho_duyet'::text, 'document_ready'::text,
             EXISTS (SELECT 1 FROM public.contract_documents d WHERE d.contract_id = p_id),
             'Đã lập văn bản hợp đồng từ mẫu (tab Văn bản)'::text, false;
    END IF;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'sites_done'::text,
           NOT EXISTS (SELECT 1 FROM public.construction_sites s
                        WHERE s.contract_id = p_id AND s.deleted_at IS NULL
                          AND s.stage NOT IN ('bao_hanh', 'hoan_thanh')),
           'Mọi công trình của hợp đồng đã sang Bảo hành hoặc Hoàn thành'::text, false;

    -- 0253 (việc 1): hợp đồng thiết kế quyết toán khi khách đã duyệt hồ sơ kỹ thuật — đúng điều kiện
    -- trigger `contracts_design_settlement_gate` chặn.
    IF c.scope_kind = 'thiet_ke' THEN
      v_dproblem := public.contract_design_settlement_problem(p_id);
      RETURN QUERY SELECT 'hoan_thanh'::text, 'design_tech_approved'::text,
             v_dproblem IS NULL,
             COALESCE(v_dproblem, 'Khách đã duyệt hồ sơ kỹ thuật của hồ sơ thiết kế'),
             false;
    END IF;
  END IF;
  IF p_entity_type = 'site' THEN
    SELECT id, responsible_user_id, planned_start_date, planned_end_date, deleted_at
      INTO v_site FROM public.construction_sites WHERE id = p_id;
    IF NOT FOUND OR v_site.deleted_at IS NOT NULL OR NOT public.rls_site_readable(p_id) THEN
      RETURN;
    END IF;

    -- Chỉ huy trưởng phải là người làm thi công (có quyền sửa Module TC) — không phải bất kỳ ai:
    -- trước 0164 công trình mở từ hợp đồng tự lấy người Kinh doanh phụ trách hợp đồng.
    RETURN QUERY SELECT 'dang_thi_cong'::text, 'commander_assigned'::text,
           v_site.responsible_user_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.user_companies uc
                         JOIN public.permissions pm ON pm.role_id = uc.role_id
                        WHERE uc.user_id = v_site.responsible_user_id AND uc.deleted_at IS NULL
                          AND pm.module_code = 'TC' AND pm.can_edit),
           'Đã phân công chỉ huy trưởng (người thuộc bộ phận Thi công)'::text, false;

    RETURN QUERY SELECT 'dang_thi_cong'::text, 'planned_dates'::text,
           v_site.planned_start_date IS NOT NULL AND v_site.planned_end_date IS NOT NULL,
           'Đã ghi ngày khởi công và ngày hoàn thành dự kiến'::text, false;

    -- 0253 (việc 3): ngân sách thi công ban đầu đã được Tổng Giám đốc duyệt, hoặc dựng từ dự toán đã
    -- duyệt (DA-09). Trigger 0164 `construction_sites_ready_to_start` đọc lại hàm này nên chặn mọi đường.
    v_budget := public._site_budget_state(p_id);
    RETURN QUERY SELECT 'dang_thi_cong'::text, 'budget_approved'::text,
           v_budget IN ('da_duyet', 'theo_du_toan'),
           CASE v_budget
             WHEN 'da_duyet'     THEN 'Ngân sách thi công đã được Tổng Giám đốc duyệt'
             WHEN 'theo_du_toan' THEN 'Ngân sách thi công dựng từ dự toán đã duyệt'
             WHEN 'cho_duyet'    THEN 'Ngân sách thi công đang chờ Tổng Giám đốc duyệt'
             WHEN 'tra_ve'       THEN 'Ngân sách thi công bị trả lại — sửa rồi gửi duyệt lại (tab Ngân sách)'
             WHEN 'nhap'         THEN 'Gửi Tổng Giám đốc duyệt ngân sách thi công (tab Ngân sách)'
             ELSE 'Lập ngân sách thi công và gửi Tổng Giám đốc duyệt (tab Ngân sách)'
           END::text,
           false;

    -- 0249 (G4): điều kiện khởi công bắt buộc của danh mục pháp nhân (pháp lý, an toàn… — DỮ LIỆU ở
    -- `site_checklist_items`). Công trình không có mục bắt buộc thì không đòi.
    IF EXISTS (SELECT 1 FROM public.site_checklist_items ci
                WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong' AND ci.is_required) THEN
      RETURN QUERY SELECT 'dang_thi_cong'::text, 'start_conditions'::text,
             NOT EXISTS (SELECT 1 FROM public.site_checklist_items ci
                          WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong'
                            AND ci.is_required AND ci.status <> 'da_dat'),
             COALESCE('Xác nhận đủ điều kiện khởi công bắt buộc (còn: '
                      || (SELECT string_agg(ci.label, ', ' ORDER BY ci.position) FROM public.site_checklist_items ci
                           WHERE ci.construction_site_id = p_id AND ci.kind = 'khoi_cong'
                             AND ci.is_required AND ci.status <> 'da_dat') || ')',
                      'Đã xác nhận đủ điều kiện khởi công bắt buộc'),
             false;
    END IF;

    -- 0249 (G4): gói bàn giao bắt buộc — CHỈ chặn khi pháp nhân đặt `tc.handover_blocks_start` = 1.
    -- Để trống thì chỉ cảnh báo trên khối Chuẩn bị khởi công (danh mục vẫn đọc được qua `site_checklist`).
    IF public.system_parameter_number('tc.handover_blocks_start', 'company',
                                      (SELECT cs.company_id FROM public.construction_sites cs WHERE cs.id = p_id)) = 1
       AND EXISTS (SELECT 1 FROM public.site_checklist_items ci
                    WHERE ci.construction_site_id = p_id AND ci.kind = 'ban_giao' AND ci.is_required) THEN
      RETURN QUERY SELECT 'dang_thi_cong'::text, 'handover_received'::text,
             NOT EXISTS (SELECT 1 FROM public.site_checklist_items ci
                          WHERE ci.construction_site_id = p_id AND ci.kind = 'ban_giao'
                            AND ci.is_required AND ci.status <> 'da_nhan'),
             'Thi công đã nhận đủ mục bàn giao bắt buộc'::text, false;
    END IF;

    -- Đúng điều kiện `move_site_stage` (0035) chặn khi bàn giao.
    RETURN QUERY SELECT 'bao_hanh'::text, 'customer_acceptance'::text,
           EXISTS (SELECT 1 FROM public.acceptance_records a
                    WHERE a.construction_site_id = p_id AND a.deleted_at IS NULL
                      AND a.acceptance_type = 'khach_hang' AND a.status = 'da_nghiem_thu'),
           'Có biên bản nghiệm thu với chủ đầu tư đã ký'::text, false;

    -- 0182 (Đợt 2 — 2A): công trình có mốc thi công thì chỉ sang Nghiệm thu bàn giao khi mọi mốc đã
    -- đạt (nghiệm thu nội bộ + phụ trách kỹ thuật nếu mốc cần). Công trình không có mốc: không đòi.
    IF EXISTS (SELECT 1 FROM public.site_milestones sm WHERE sm.construction_site_id = p_id) THEN
      RETURN QUERY SELECT 'nghiem_thu'::text, 'milestones_passed'::text,
             NOT EXISTS (SELECT 1 FROM public.site_milestones sm
                          WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'),
             COALESCE('Đạt đủ các mốc thi công (còn: '
                      || (SELECT sm.label FROM public.site_milestones sm
                           WHERE sm.construction_site_id = p_id AND sm.status <> 'dat'
                           ORDER BY sm.position LIMIT 1) || ')',
                      'Đạt đủ các mốc thi công'),
             false;
    END IF;

    -- 0166: kết thúc công trình = hết bảo hành, không còn việc bảo hành nào treo. Áp cho cả
    -- đường tắt Nghiệm thu → Kết thúc: công trình không khai bảo hành thì không kết thúc được.
    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_declared'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL),
           'Đã khai hạng mục bảo hành'::text, false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'warranties_expired'::text,
           EXISTS (SELECT 1 FROM public.warranties w
                    WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM public.warranties w
                            WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL
                              AND (w.warranty_until IS NULL OR w.warranty_until > current_date)),
           COALESCE('Mọi hạng mục đã hết hạn bảo hành (hạng mục cuối hết hạn '
                    || (SELECT to_char(max(w.warranty_until), 'DD/MM/YYYY') FROM public.warranties w
                         WHERE w.construction_site_id = p_id AND w.deleted_at IS NULL) || ')',
                    'Mọi hạng mục đã hết hạn bảo hành'),
           false;

    RETURN QUERY SELECT 'hoan_thanh'::text, 'claims_closed'::text,
           NOT EXISTS (SELECT 1 FROM public.warranty_claims wc
                         JOIN public.warranties w ON w.id = wc.warranty_id
                        WHERE w.construction_site_id = p_id AND wc.deleted_at IS NULL
                          AND wc.status IN ('tiep_nhan', 'dang_xu_ly')),
           'Không còn yêu cầu bảo hành nào đang mở'::text, false;
  END IF;
  -- 0247 (G6): gói thầu — Ban Giám đốc duyệt tham gia trước khi lập dự toán và trước khi trình giá.
  -- Đúng điều kiện mà `estimates_participation_gate` / `bidding_projects_participation_gate` chặn.
  IF p_entity_type = 'bidding' THEN
    SELECT id, stage, participation_status, deleted_at INTO v_bid
      FROM public.bidding_projects WHERE id = p_id;
    IF NOT FOUND OR v_bid.deleted_at IS NOT NULL OR NOT public.rls_bidding_project_readable(p_id) THEN
      RETURN;
    END IF;

    RETURN QUERY
    SELECT s.st, 'participation_approved'::text,
           v_bid.participation_status IN ('da_duyet', 'truoc_quy_dinh'),
           CASE v_bid.participation_status
             WHEN 'da_duyet' THEN 'Ban Giám đốc đã duyệt tham gia gói thầu'
             WHEN 'truoc_quy_dinh' THEN 'Gói thầu lập trước khi có bước quyết định tham gia — không đòi'
             ELSE public.bid_participation_block_reason(v_bid.participation_status)
           END::text,
           false
      FROM unnest(ARRAY['du_toan', 'cho_duyet_gia']) AS s(st);
  END IF;
END;
$$;

-- ============================================================================
-- decide_approval — chép NGUYÊN VĂN bản 0249, thêm nhánh `site_budget_submissions`
-- ============================================================================
CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
  st     record;
  adj    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'payment_requests' THEN
    /*
     * KT-01 bước 5 — phê duyệt theo hạn mức. Ba bước kiểm trước đó đã xong và đã ghi vào
     * `payment_request_steps`; ở đây chỉ còn quyết định cuối cùng về tiền.
     *
     * Từ chối thì hồ sơ về "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy hồ sơ của
     * mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa. Sửa xong gửi lại là
     * đi LẠI TỪ ĐẦU cả ba bước kiểm — người kiểm trước đó đã ký trên một con số khác.
     */
    UPDATE public.payment_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::payment_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Khoản đã duyệt là việc cần làm của Kế toán – Tài chính: họ lập phiếu chi và thực
      -- hiện chi (KT-01 bước 6, 7). Người đề nghị thường không mở màn hình KT hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'payment_request_approved',
        format('Đề nghị chi %s đã được phê duyệt, giá trị %s đồng. Lập phiếu chi để thực hiện.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'payment_requests', a.entity_id,
        format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code = 'KT';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'payment_request_approved' ELSE 'payment_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị chi %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị chi %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'payment_requests', a.entity_id,
      format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'leave_requests' THEN
    /*
     * NS-05 — đơn nghỉ phép. Từ chối thì đơn ĐÓNG kèm lý do, không quay về Nháp: người lao
     * động cần đọc được vì sao bị từ chối trước khi xin lại ngày khác.
     */
    UPDATE public.leave_requests
       SET status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::leave_request_status,
           decided_at = now(),
           reject_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'leave_approved' ELSE 'leave_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN 'Đơn nghỉ phép đã được duyệt.'
           ELSE format('Đơn nghỉ phép bị từ chối. %s', COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'leave_requests', a.entity_id, '/ns/nghi-phep'
    );

  ELSIF a.entity_type = 'recruitment_positions' THEN
    /*
     * NS-02 — yêu cầu tuyển dụng. Được duyệt thì chuyển sang "Đang tuyển" và HCNS bắt đầu
     * đăng tuyển; từ chối thì dừng hẳn, người đề nghị lập yêu cầu mới nếu vẫn cần người.
     */
    UPDATE public.recruitment_positions
       SET status = (CASE WHEN p_decision = 'approved' THEN 'dang_tuyen' ELSE 'dung_tuyen' END)::recruitment_position_status,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      PERFORM public.create_notification(
        u.id, a.company_id, 'recruitment_approved',
        format('Yêu cầu tuyển dụng %s đã được duyệt. Bắt đầu đăng tuyển.', COALESCE(a.entity_code, '')),
        'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'NS';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'recruitment_approved' ELSE 'recruitment_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Yêu cầu tuyển dụng %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Yêu cầu tuyển dụng %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'recruitment_positions', a.entity_id, '/ns/tuyen-dung'
    );
  ELSIF a.entity_type = 'site_surveys' THEN
    /*
     * Đợt 1 — 1D (0175): báo cáo khảo sát. Duyệt → «Đã duyệt», cơ hội còn ở Khảo sát thì tự sang
     * Báo giá. Trả về → «Bị trả về» kèm ý kiến (bắt buộc — kiểm ở đầu hàm), người khảo sát sửa
     * rồi gửi lại. Báo cho người gửi cả hai trường hợp.
     */
    PERFORM set_config('nvg.survey_report', 'on', true);
    UPDATE public.site_surveys
       SET report_status = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tra_ve' END)::survey_report_status,
           report_feedback = CASE WHEN p_decision = 'approved' THEN NULL ELSE NULLIF(btrim(p_note), '') END,
           report_decided_at = now(),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING opportunity_id INTO e;
    PERFORM set_config('nvg.survey_report', 'off', true);

    IF p_decision = 'approved' THEN
      PERFORM public._sync_opportunity_stage(e.opportunity_id, 'bao_gia',
        'Báo cáo khảo sát đã được duyệt');
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'survey_report_approved' ELSE 'survey_report_returned' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo cáo khảo sát %s đã được duyệt — lập báo giá.', COALESCE(a.entity_code, ''))
           ELSE format('Báo cáo khảo sát %s bị trả về: %s', COALESCE(a.entity_code, ''),
                       COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'opportunities', e.opportunity_id,
      '/crm/co-hoi/' || e.opportunity_id || '?tab=khao-sat'
    );
  ELSIF a.entity_type = 'showcase_items' THEN
    /*
     * Đợt 1 — 1H (0179): Thiết kế đề nghị xoá mẫu công trình, Giám đốc đồng ý thì xoá mềm; không
     * đồng ý thì mẫu giữ nguyên, bỏ dấu «đang đề nghị xoá». Báo người đề nghị.
     */
    PERFORM set_config('nvg.showcase', 'on', true);
    IF p_decision = 'approved' THEN
      UPDATE public.showcase_items
         SET deleted_at = now(), updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    ELSE
      UPDATE public.showcase_items
         SET deletion_requested_at = NULL, deletion_requested_by = NULL,
             deletion_reason = NULL, deletion_approval_id = NULL,
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;
    PERFORM set_config('nvg.showcase', 'off', true);

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'showcase_deleted' ELSE 'showcase_kept' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Giám đốc đã đồng ý xoá mẫu «%s».', a.title)
           ELSE format('Giám đốc giữ lại mẫu «%s»: %s', a.title, COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'showcase_items', a.entity_id, '/mau-cong-trinh'
    );
  ELSIF a.entity_type = 'rental_quotes' THEN
    /*
     * G5 (0245): báo giá thuê giàn giáo có giá đặc biệt hoặc công nợ vượt hạn mức. Duyệt → «Đã duyệt»
     * (lập đơn thuê được); từ chối → «Bị từ chối» kèm ý kiến, Xưởng sửa rồi gửi lại.
     */
    UPDATE public.rental_quotes
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'rental_quote_approved' ELSE 'rental_quote_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Báo giá thuê %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Báo giá thuê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'rental_quotes', a.entity_id, '/sx/bao-gia-thue?bao-gia=' || a.entity_id
    );
  ELSIF a.entity_type = 'internal_rental_requests' THEN
    /*
     * G5 (0245): cho thuê giàn giáo nội bộ (QĐ-6). Duyệt → Xưởng xuất giàn giáo; từ chối → đề nghị
     * đóng kèm lý do. Báo người gửi (chỉ huy trưởng) và Xưởng.
     */
    UPDATE public.internal_rental_requests
       SET status = CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END,
           decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING requested_by, requesting_company_id, construction_site_id INTO e;

    PERFORM public.create_notification(
      e.requested_by, e.requesting_company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê giàn giáo %s đã được duyệt — chờ Nhà Việt Steel xuất hàng.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê giàn giáo %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'construction_sites', e.construction_site_id,
      '/tc/cong-trinh/' || e.construction_site_id || '?tab=gian-giao'
    );
    PERFORM public.notify_sx_editors(
      a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'internal_rental_approved' ELSE 'internal_rental_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị thuê nội bộ %s đã được duyệt — xuất giàn giáo.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị thuê nội bộ %s bị từ chối.', COALESCE(a.entity_code, ''))
      END,
      'internal_rental_requests', a.entity_id, '/sx/thue-noi-bo'
    );
  ELSIF a.entity_type = 'subcontract_selections' THEN
    /*
     * G2 (0246): chọn thầu phụ / tổ đội. Duyệt → tạo / cập nhật tổ đội của công trình (khoán gọn tự
     * có dòng trọn gói), báo người gửi và người soạn hợp đồng của pháp nhân (soạn hợp đồng khoán).
     * Từ chối → «Bị từ chối» kèm ý kiến; Ban công trường sửa báo giá rồi gửi lại.
     */
    IF p_decision = 'approved' THEN
      PERFORM public._apply_subcontract_selection(a.entity_id);
      PERFORM public.create_notification(
        u.id, a.company_id, 'subcontract_selection_approved',
        format('Chọn thầu phụ %s đã được duyệt — soạn hợp đồng khoán.', COALESCE(a.entity_code, '')),
        'subcontract_selections', a.entity_id, '/hd/hop-dong?thau-phu=1'
      )
      FROM public.users u
      WHERE u.is_active AND u.deleted_at IS NULL
        AND u.id IS DISTINCT FROM a.requested_by
        AND EXISTS (SELECT 1 FROM public.user_companies uc
                      JOIN public.permissions pm ON pm.role_id = uc.role_id
                     WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = a.company_id
                       AND pm.module_code = 'HD' AND pm.can_create);
    ELSE
      UPDATE public.subcontract_selections
         SET status = 'tu_choi', decided_at = now(), decision_note = NULLIF(btrim(p_note), ''),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'subcontract_selection_approved' ELSE 'subcontract_selection_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Chọn thầu phụ %s đã được duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Chọn thầu phụ %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'subcontract_selections', a.entity_id, '/tc/chon-thau-phu/' || a.entity_id
    );
  ELSIF a.entity_type = 'bidding_projects' THEN
    /*
     * G6 (0247): quyết định tham gia gói thầu. Duyệt → lập dự toán được. Từ chối → «Không tham gia»:
     * gói đóng ở bước khong_tham_gia, lý do (bắt buộc — kiểm ở đầu hàm) vào lost_reason; cơ hội gốc đi
     * theo bidding_projects_notify_opportunity (0217 + 0247). Tắt nhắc hạn nộp (0208).
     */
    IF p_decision = 'approved' THEN
      UPDATE public.bidding_projects
         SET participation_status = 'da_duyet',
             participation_decided_at = now(), participation_decided_by = v_user,
             participation_decision_note = NULLIF(btrim(p_note), ''),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING responsible_user_id INTO e;
    ELSE
      UPDATE public.bidding_projects
         SET participation_status = 'khong_tham_gia',
             participation_decided_at = now(), participation_decided_by = v_user,
             participation_decision_note = NULLIF(btrim(p_note), ''),
             stage = 'khong_tham_gia',
             lost_reason = 'Không tham gia: ' || btrim(p_note),
             deadline_reminded_stage = 0,
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING responsible_user_id INTO e;
    END IF;

    PERFORM public.create_notification(
      x.uid, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'bid_participation_approved' ELSE 'bid_participation_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Ban Giám đốc đã duyệt tham gia gói thầu %s — lập dự toán.', COALESCE(a.entity_code, ''))
           ELSE format('Ban Giám đốc quyết định không tham gia gói thầu %s: %s', COALESCE(a.entity_code, ''),
                       COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'bidding_projects', a.entity_id,
      '/da/goi-thau/' || a.entity_id || CASE WHEN p_decision = 'approved' THEN '?tab=du-toan' ELSE '' END
    )
    FROM (SELECT DISTINCT uid FROM unnest(ARRAY[a.requested_by, e.responsible_user_id]) AS t(uid)
           WHERE uid IS NOT NULL) x;
  ELSIF a.entity_type = 'budget_adjustments' THEN
    -- G4 (0249): điều chỉnh ngân sách công trình sau khởi công. Duyệt → đổi dòng ngân sách, thêm
    -- phiên bản lãi dự kiến; từ chối → giữ nguyên ngân sách. Báo người gửi trong cả hai trường hợp.
    PERFORM public._decide_budget_adjustment(a.entity_id, p_decision, p_note);
  ELSIF a.entity_type = 'site_budget_submissions' THEN
    -- 0253: ngân sách thi công ban đầu của công trình — Tổng Giám đốc duyệt / trả lại trước khởi công.
    PERFORM public._decide_site_budget(a.entity_id, p_decision, p_note);
  ELSE
    -- Không có nhánh nào khớp: loại hồ sơ lạ (gõ sai, hoặc module mới chưa nối). Raise ở
    -- đây cuộn ngược toàn bộ giao dịch — kể cả UPDATE approvals/INSERT approval_decisions
    -- phía trên — để không xảy ra tình trạng "phê duyệt xong" mà hồ sơ gốc không hề đổi
    -- (0086, sửa lại đúng ở 0088 sau khi 0086 tự ý viết lại các nhánh khác và làm sai).
    RAISE EXCEPTION 'Loại hồ sơ phê duyệt không xác định: %.', a.entity_type;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179), báo giá thuê + thuê nội bộ giàn giáo (0245), chọn thầu phụ (0246), quyết định tham gia gói thầu (0247), điều chỉnh ngân sách (0249), ngân sách thi công ban đầu (0253).';

NOTIFY pgrst, 'reload schema';
