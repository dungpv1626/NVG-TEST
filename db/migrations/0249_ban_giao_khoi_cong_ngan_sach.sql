-- ============================================================================
-- 0249 — G4 (A2 + A3 của doc/KE_HOACH_KHOP_KHAO_SAT_ANH_THI.md, T9 của
--        doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md): gói bàn giao Dự án / Thiết kế → Thi công, điều
--        kiện khởi công, lãi dự kiến «lúc nhận việc», điều chỉnh ngân sách có duyệt, mua vượt
--        ngân sách phải duyệt lại.
--
-- Căn cứ (doc/khao-sat/HoSo_KhaoSat_NVG_full.md): bàn giao gồm hợp đồng, bản vẽ, BOQ, dự toán nội
-- bộ, báo giá nhà cung cấp, biện pháp, tiến độ, cam kết, rủi ro (dòng 721, 749); trước khởi công
-- kiểm pháp lý, bảo lãnh, bảo hiểm, đăng ký nhân sự, máy móc, an toàn, biện pháp, mẫu vật tư, phê
-- duyệt của chủ đầu tư (751); lãi lúc nhận việc = giá bán so với ngân sách được duyệt (890–892);
-- mua trong ngân sách, vượt / ngoài kế hoạch phải duyệt lại, điều chỉnh ngân sách cần nguyên nhân,
-- trách nhiệm, ảnh hưởng và phê duyệt (830, 834); Dự án và Thi công cãi nhau bàn giao đủ chưa (971).
--
--   1. Danh mục theo pháp nhân (`site_checklist_templates`, DỮ LIỆU): hai loại `ban_giao` (gói bàn
--      giao) và `khoi_cong` (điều kiện khởi công). Công trình mới chụp danh mục vào
--      `site_checklist_items` (đổi mẫu không đổi công trình đang chạy); lịch sử từng lần giao / nhận /
--      báo thiếu / xác nhận ở `site_checklist_events`. Danh mục mặc định là ĐỀ XUẤT DEMO
--      (`is_demo_default`) — NVG sửa bằng Quản trị, mục bắt buộc là cột `is_required`.
--   2. Bàn giao: mỗi mục có bộ phận giao (Dự án / Thiết kế / Kinh doanh), người nhận là Trưởng phòng
--      Thi công (hoặc Ban Giám đốc). «Đã giao» / «Đã nhận» ghi người + giờ; người nhận báo «Thiếu /
--      chưa đạt» kèm ý kiến → bộ phận giao được báo. Mục có sẵn trên hệ thống tự nối: hợp đồng (CHỈ
--      phạm vi + tiến độ, không giá trị), bản vẽ đang hiệu lực (`site_design_drawings`), dự toán đã
--      duyệt (chỉ «có / chưa có» — Mẫu D). Tệp của mục nhạy cảm (dự toán, báo giá nhà cung cấp) chỉ
--      người xem được giá vốn mở được.
--      Thiếu mục bắt buộc: CHỈ CẢNH BÁO. Chặn khởi công khi tham số `tc.handover_blocks_start` = 1
--      (để TRỐNG = không chặn) — khi đó điều kiện vào `stage_readiness('site')`.
--   3. Điều kiện khởi công: chỉ huy trưởng / Thi công đánh dấu từng mục kèm căn cứ (ghi chú, đường
--      dẫn hoặc tệp). Chưa đủ mục bắt buộc thì không sang «Đang thi công»: điều kiện vào
--      `stage_readiness('site')` (chép NGUYÊN VĂN bản 0247, thêm hai dòng), trigger 0164
--      `construction_sites_ready_to_start` đọc lại hàm đó nên không sửa.
--   4. Lãi dự kiến lúc nhận việc (`site_profit_baselines`, BẤT BIẾN, có phiên bản): chụp giá bán
--      (hợp đồng + phát sinh đã duyệt), ngân sách chi phí, lãi dự kiến khi công trình khởi công —
--      lúc ngân sách khoá lại, tức lần «duyệt» đầu (công trình chưa có ngân sách thì chụp ở lần điều
--      chỉnh ngân sách được duyệt đầu tiên). Về sau mỗi điều chỉnh ngân sách / phát sinh được duyệt
--      thêm một phiên bản, ghi tên người duyệt. Không dựng lùi cho công trình đã chạy (5.2).
--      `site_profit_loss_list` (chép bản 0198) thêm cột «lúc nhận việc». Mẫu D.
--   5. Điều chỉnh ngân sách (`budget_adjustments` = bảng lịch sử): sau khởi công mọi thay đổi số dự
--      trù / mã / nhóm / thêm / xoá dòng đi qua `request_budget_adjustment` → hộp Phê duyệt loại
--      `budget_adjustment` (hạn mức theo |chênh lệch|, mặc định seed: Thi công → Ban Giám đốc → Tổng
--      Giám đốc, GIẢ ĐỊNH). Trigger `project_budgets_started_site_guard` chặn mọi đường sửa trực tiếp.
--   6. Vượt ngân sách: đề nghị mua / chọn thầu phụ có giá trị vượt phần còn lại của dòng ngân sách
--      KHÔNG bị chặn — trigger BEFORE INSERT trên `approvals` đổi loại sang `over_budget` (cách 0244
--      đổi `low_margin_price`), chụp số dòng ngân sách vào `budget_overrun_checks` để người duyệt xem.
--      «Còn lại» = dự trù − cam kết − thực tế − phần đã giữ chỗ bởi đề nghị / gói việc gửi TRƯỚC đang
--      chờ (hoặc đã duyệt chưa đặt hàng). Dung sai `tc.over_budget_tolerance_percent` để TRỐNG = không
--      dung sai. Ngân sách đổi trong lúc chờ duyệt → hồ sơ đang mở tự lên `over_budget`; lưới an toàn
--      lúc duyệt trên `approval_decisions`.
--   7. Chọn thầu phụ được duyệt thì CAM KẾT ngân sách (G2 thiếu): cộng `committed_amount` dòng nguồn,
--      giữ phần còn treo ở `subcontractors.committed_to_budget`; chi trả cho tổ đội (ghi chi phí thực
--      tế ở `post_payment_to_budget`, chép bản 0043) chuyển dần từ cam kết sang thực tế.
--   8. `decide_approval`: chép NGUYÊN VĂN bản 0247, thêm nhánh `budget_adjustments`.
--
-- ⚠️ Giá trị enum mới chỉ dùng TRONG THÂN hàm plpgsql và so dạng text (migration chạy trong một
-- giao dịch). Hạn mức của hai loại mới nạp ở seed (`DEFAULT_APPROVAL_LIMITS`) — `db:seed` sau migrate.
-- Chạy lại được.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'budget_adjustment';
ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'over_budget';

-- --- Tham số (để TRỐNG — NVG chưa quyết) --------------------------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, unit, label, description, is_sensitive)
SELECT 'tc.over_budget_tolerance_percent', 'company', c.id, NULL, '%',
       'Dung sai vượt ngân sách (%)',
       'Đề nghị mua / chọn thầu phụ vượt phần còn lại của dòng ngân sách quá mức này (tính trên số dự trù '
       'của dòng) thì phải duyệt «Vượt ngân sách». Để trống = không có dung sai: vượt 1 đồng cũng phải duyệt.',
       false
  FROM public.companies c
 WHERE c.code IN ('NVC', 'NVO', 'NVS')
   AND NOT EXISTS (SELECT 1 FROM public.system_parameters p
                    WHERE p.param_key = 'tc.over_budget_tolerance_percent' AND p.scope_type = 'company'
                      AND p.scope_id = c.id);

INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, unit, label, description, is_sensitive)
SELECT 'tc.handover_blocks_start', 'company', c.id, NULL, NULL,
       'Thiếu mục bàn giao bắt buộc thì chặn khởi công (1 = chặn)',
       'Để trống = chỉ cảnh báo khi gói bàn giao Dự án / Thiết kế → Thi công còn thiếu mục bắt buộc. '
       'Đặt 1 thì công trình chỉ sang «Đang thi công» khi mọi mục bàn giao bắt buộc đã được Thi công nhận.',
       false
  FROM public.companies c
 WHERE c.code IN ('NVC', 'NVO', 'NVS')
   AND NOT EXISTS (SELECT 1 FROM public.system_parameters p
                    WHERE p.param_key = 'tc.handover_blocks_start' AND p.scope_type = 'company'
                      AND p.scope_id = c.id);


-- ============================================================================
-- 1. Danh mục bàn giao / điều kiện khởi công
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_checklist_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind             varchar(16) NOT NULL CHECK (kind IN ('ban_giao', 'khoi_cong')),
  item_key         varchar(64) NOT NULL,
  label            text NOT NULL,
  description      text,
  giver_department varchar(16) CHECK (giver_department IS NULL OR giver_department IN ('du_an', 'thiet_ke', 'kinh_doanh')),
  is_required      boolean NOT NULL DEFAULT false,
  auto_source      varchar(16) CHECK (auto_source IS NULL OR auto_source IN ('hop_dong', 'ban_ve', 'du_toan')),
  is_sensitive     boolean NOT NULL DEFAULT false,
  position         integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  is_demo_default  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT site_checklist_templates_unique UNIQUE (company_id, kind, item_key),
  CONSTRAINT site_checklist_templates_giver CHECK ((kind = 'ban_giao') = (giver_department IS NOT NULL))
);

COMMENT ON TABLE public.site_checklist_templates IS
  'Danh mục bàn giao sang Thi công (ban_giao) và điều kiện khởi công (khoi_cong) của từng pháp nhân (G4, 0249) — DỮ LIỆU, '
  'không viết trong mã. Công trình mới chụp danh mục này; đổi mẫu không đổi công trình đang chạy. '
  'is_demo_default = mục đề xuất DEMO, NVG sửa / ẩn trong Quản trị.';

CREATE TABLE IF NOT EXISTS public.site_checklist_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  kind                 varchar(16) NOT NULL CHECK (kind IN ('ban_giao', 'khoi_cong')),
  item_key             varchar(64) NOT NULL,
  label                text NOT NULL,
  description          text,
  giver_department     varchar(16),
  is_required          boolean NOT NULL DEFAULT false,
  auto_source          varchar(16),
  is_sensitive         boolean NOT NULL DEFAULT false,
  position             integer NOT NULL DEFAULT 0,
  status               varchar(16) NOT NULL,
  link_url             text,
  attachment_path      text,
  note                 text,
  given_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  given_at             timestamptz,
  received_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  received_at          timestamptz,
  issue_note           text,
  issue_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issue_at             timestamptz,
  confirmed_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT site_checklist_items_unique UNIQUE (construction_site_id, kind, item_key),
  CONSTRAINT site_checklist_items_status CHECK (
    (kind = 'ban_giao' AND status IN ('cho_giao', 'da_giao', 'da_nhan', 'thieu'))
    OR (kind = 'khoi_cong' AND status IN ('chua_dat', 'da_dat'))
  ),
  CONSTRAINT site_checklist_items_link_len CHECK (link_url IS NULL OR char_length(link_url) <= 2000),
  CONSTRAINT site_checklist_items_note_len CHECK (note IS NULL OR char_length(note) <= 2000)
);
CREATE INDEX IF NOT EXISTS site_checklist_items_site_idx
  ON public.site_checklist_items (construction_site_id, kind, position);

COMMENT ON TABLE public.site_checklist_items IS
  'Danh mục bàn giao / điều kiện khởi công của MỘT công trình, chụp từ site_checklist_templates lúc mở công trình (G4, 0249). '
  'Không có quyền ghi từ trình duyệt — đi qua give_handover_item / receive_handover_item / confirm_start_condition.';

CREATE TABLE IF NOT EXISTS public.site_checklist_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  item_id    uuid NOT NULL REFERENCES public.site_checklist_items(id) ON DELETE CASCADE,
  action     varchar(16) NOT NULL CHECK (action IN ('giao', 'nhan', 'bao_thieu', 'dat', 'bo_dat')),
  note       text,
  link_url   text,
  attachment_path text,
  actor_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_checklist_events_item_idx ON public.site_checklist_events (item_id, created_at);

COMMENT ON TABLE public.site_checklist_events IS
  'Lịch sử từng lần giao / nhận / báo thiếu / xác nhận một mục bàn giao hoặc điều kiện khởi công (G4, 0249). Chỉ thêm, không sửa.';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_checklist_templates', 'site_checklist_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_touch ON public.%I', t);
    PERFORM public.attach_audit_touch('public.' || t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['site_checklist_items', 'site_checklist_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_transactional_company ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company()', t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.site_checklist_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR public.auth_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Lịch sử bàn giao / điều kiện khởi công không sửa, không xoá được.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS site_checklist_events_immutable ON public.site_checklist_events;
CREATE TRIGGER site_checklist_events_immutable
  BEFORE UPDATE OR DELETE ON public.site_checklist_events
  FOR EACH ROW EXECUTE FUNCTION public.site_checklist_events_immutable();

-- --- Ai là ai ------------------------------------------------------------------------------------
-- Phân hệ của bộ phận giao: Dự án = DA, Thiết kế = TK, Kinh doanh = CRM. Ban Giám đốc / Quản trị
-- giao thay được (họ không có quyền sửa phân hệ nhưng quản lý mọi pháp nhân).
CREATE OR REPLACE FUNCTION public.handover_department_module(p_department text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_department WHEN 'du_an' THEN 'DA' WHEN 'thiet_ke' THEN 'TK' WHEN 'kinh_doanh' THEN 'CRM' END;
$$;

CREATE OR REPLACE FUNCTION public.auth_is_handover_giver(p_company_id uuid, p_department text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_id() IS NOT NULL
     AND NOT public.auth_is_read_only()
     AND public.rls_company_access(p_company_id)
     AND (public.auth_manages_all_companies()
          OR (p_department IS NOT NULL
              AND public.auth_can_edit_module(public.handover_department_module(p_department))));
$$;
REVOKE ALL ON FUNCTION public.auth_is_handover_giver(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_handover_giver(uuid, text) TO authenticated;

-- Người nhận bàn giao: Trưởng phòng Thi công (sửa TC, không phải vai trò hiện trường) hoặc Ban Giám
-- đốc — cùng nhóm với người lập ngân sách công trình (0235).
CREATE OR REPLACE FUNCTION public.auth_is_handover_receiver(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND public.auth_manages_site_budget(p_site_id);
$$;
REVOKE ALL ON FUNCTION public.auth_is_handover_receiver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_handover_receiver(uuid) TO authenticated;

-- Đọc được danh mục của công trình: người xem được công trình (Mẫu E), và — riêng gói bàn giao —
-- người của bộ phận giao trong pháp nhân (họ không xem được phân hệ Thi công).
CREATE OR REPLACE FUNCTION public.rls_site_checklist_readable(p_site_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_site_readable(p_site_id)
      OR (p_kind = 'ban_giao' AND EXISTS (
            SELECT 1 FROM public.construction_sites s
             WHERE s.id = p_site_id AND s.deleted_at IS NULL
               AND (public.auth_is_handover_giver(s.company_id, 'du_an')
                    OR public.auth_is_handover_giver(s.company_id, 'thiet_ke')
                    OR public.auth_is_handover_giver(s.company_id, 'kinh_doanh'))));
$$;
REVOKE ALL ON FUNCTION public.rls_site_checklist_readable(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_site_checklist_readable(uuid, text) TO authenticated;

-- --- RLS: đọc theo công trình; không ghi từ trình duyệt ------------------------------------------
ALTER TABLE public.site_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_checklist_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_checklist_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_checklist_templates_select ON public.site_checklist_templates;
CREATE POLICY site_checklist_templates_select ON public.site_checklist_templates
  FOR SELECT TO authenticated USING (public.rls_company_access(company_id));
-- Quản trị / Ban Giám đốc sửa danh mục (NEN-12): tham số hoá, không phải nghiệp vụ hằng ngày.
DROP POLICY IF EXISTS site_checklist_templates_write ON public.site_checklist_templates;
CREATE POLICY site_checklist_templates_write ON public.site_checklist_templates
  FOR ALL TO authenticated
  USING (public.rls_company_access(company_id) AND NOT public.auth_is_read_only()
         AND (public.auth_manages_all_companies() OR public.auth_has_role('ADMIN')))
  WITH CHECK (public.rls_company_access(company_id) AND NOT public.auth_is_read_only()
              AND (public.auth_manages_all_companies() OR public.auth_has_role('ADMIN')));

DROP POLICY IF EXISTS site_checklist_items_select ON public.site_checklist_items;
CREATE POLICY site_checklist_items_select ON public.site_checklist_items
  FOR SELECT TO authenticated USING (public.rls_site_checklist_readable(construction_site_id, kind));

DROP POLICY IF EXISTS site_checklist_events_select ON public.site_checklist_events;
CREATE POLICY site_checklist_events_select ON public.site_checklist_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.site_checklist_items i
                  WHERE i.id = item_id AND public.rls_site_checklist_readable(i.construction_site_id, i.kind)));

-- --- Danh mục mặc định — ĐỀ XUẤT DEMO -------------------------------------------------------------
-- Bàn giao: theo dòng 721 / 749 của phiếu khảo sát. Điều kiện khởi công: dòng 751; chỉ PHÁP LÝ và
-- AN TOÀN bắt buộc (giấy phép, bảo hiểm, bảo lãnh… tuỳ hợp đồng — NVG bật khi cần). Chỉ thêm mục
-- chưa có, không đè mục NVG đã sửa.
INSERT INTO public.site_checklist_templates
  (company_id, kind, item_key, label, description, giver_department, is_required, auto_source, is_sensitive, position, is_demo_default)
SELECT c.id, t.kind, t.item_key, t.label, t.description, t.giver, t.req, t.auto_source, t.sens, t.pos, true
  FROM public.companies c
 CROSS JOIN (VALUES
   ('ban_giao', 'hop_dong', 'Hợp đồng — phạm vi công việc và tiến độ',
    'Phạm vi, tiến độ, điều kiện nghiệm thu của hợp đồng với chủ đầu tư. Thi công không xem giá trị hợp đồng.',
    'kinh_doanh', true, 'hop_dong', false, 10),
   ('ban_giao', 'ban_ve', 'Bản vẽ thi công đang hiệu lực',
    'Bản vẽ đã phát hành cho thi công — tự nối từ hồ sơ thiết kế gắn công trình.',
    'thiet_ke', true, 'ban_ve', false, 20),
   ('ban_giao', 'du_toan', 'BOQ / dự toán nội bộ',
    'Khối lượng và dự toán đã duyệt làm căn cứ lập ngân sách. Đơn giá vốn chỉ người được xem giá vốn mở được.',
    'du_an', true, 'du_toan', true, 30),
   ('ban_giao', 'vat_tu', 'Danh mục vật tư chính',
    'Chủng loại, quy cách, thương hiệu đã chốt với chủ đầu tư.', 'du_an', false, NULL, false, 40),
   ('ban_giao', 'bien_phap', 'Biện pháp thi công',
    'Biện pháp / phương án kỹ thuật đã trình trong hồ sơ thầu hoặc đã thống nhất với chủ đầu tư.',
    'du_an', false, NULL, false, 50),
   ('ban_giao', 'tien_do', 'Tiến độ thi công',
    'Tiến độ tổng đã cam kết với chủ đầu tư.', 'du_an', false, NULL, false, 60),
   ('ban_giao', 'cam_ket', 'Cam kết với khách',
    'Những điều đã hứa với khách ngoài hợp đồng (vật tư thay thế, mốc bàn giao, yêu cầu riêng).',
    'kinh_doanh', true, NULL, false, 70),
   ('ban_giao', 'rui_ro', 'Danh sách rủi ro',
    'Rủi ro đã thấy khi báo giá / dự thầu: mặt bằng, hàng xóm, nguồn vật tư, điều khoản phạt.',
    'du_an', true, NULL, false, 80),
   ('ban_giao', 'bao_gia_ncc', 'Báo giá nhà cung cấp (nếu có)',
    'Báo giá vật tư / thầu phụ đã dùng để lập giá. Chỉ người được xem giá vốn mở được tệp.',
    'du_an', false, NULL, true, 90),
   ('khoi_cong', 'phap_ly', 'Hồ sơ pháp lý công trình',
    'Hợp đồng đã ký, quyết định giao mặt bằng / biên bản bàn giao mặt bằng của chủ đầu tư.',
    NULL, true, NULL, false, 10),
   ('khoi_cong', 'giay_phep', 'Giấy phép xây dựng',
    'Giấy phép (hoặc văn bản miễn phép) — chủ đầu tư cung cấp.', NULL, false, NULL, false, 20),
   ('khoi_cong', 'bao_hiem', 'Bảo hiểm công trình / người lao động', NULL, NULL, false, NULL, false, 30),
   ('khoi_cong', 'bao_lanh', 'Bảo lãnh thực hiện hợp đồng', 'Nếu hợp đồng yêu cầu.', NULL, false, NULL, false, 40),
   ('khoi_cong', 'nhan_su', 'Đăng ký nhân sự với chủ đầu tư / ban quản lý', NULL, NULL, false, NULL, false, 50),
   ('khoi_cong', 'may_moc', 'Máy móc, thiết bị đã kiểm định', NULL, NULL, false, NULL, false, 60),
   ('khoi_cong', 'an_toan', 'Phương án an toàn lao động',
    'Phương án an toàn, phổ biến an toàn cho đội thi công, biển báo, rào chắn.', NULL, true, NULL, false, 70),
   ('khoi_cong', 'bien_phap_duyet', 'Biện pháp thi công được chủ đầu tư chấp thuận', NULL, NULL, false, NULL, false, 80),
   ('khoi_cong', 'mau_vat_tu', 'Mẫu vật tư đã được chủ đầu tư duyệt', NULL, NULL, false, NULL, false, 90),
   ('khoi_cong', 'chu_dau_tu_duyet', 'Các phê duyệt khác của chủ đầu tư', NULL, NULL, false, NULL, false, 100)
 ) AS t(kind, item_key, label, description, giver, req, auto_source, sens, pos)
 WHERE c.code IN ('NVC', 'NVO', 'NVS')
ON CONFLICT (company_id, kind, item_key) DO NOTHING;

-- --- Chụp danh mục vào công trình ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._seed_site_checklists(p_site_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO public.site_checklist_items
    (company_id, construction_site_id, kind, item_key, label, description, giver_department,
     is_required, auto_source, is_sensitive, position, status)
  SELECT s.company_id, s.id, t.kind, t.item_key, t.label, t.description, t.giver_department,
         t.is_required, t.auto_source, t.is_sensitive, t.position,
         CASE t.kind WHEN 'ban_giao' THEN 'cho_giao' ELSE 'chua_dat' END
    FROM public.construction_sites s
    JOIN public.site_checklist_templates t ON t.company_id = s.company_id AND t.is_active
   WHERE s.id = p_site_id
  ON CONFLICT (construction_site_id, kind, item_key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public._seed_site_checklists(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.construction_sites_seed_checklists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._seed_site_checklists(NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS construction_sites_seed_checklists ON public.construction_sites;
CREATE TRIGGER construction_sites_seed_checklists
  AFTER INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_seed_checklists();

-- Công trình đang ở Chuẩn bị lúc chạy migration: có danh mục ngay. Công trình đã khởi công không
-- cần điều kiện khởi công, và bàn giao của nó đã xong ngoài hệ thống — không dựng lùi.
SELECT public._seed_site_checklists(s.id)
  FROM public.construction_sites s
 WHERE s.deleted_at IS NULL AND s.stage = 'chuan_bi';

-- --- Kho tệp ------------------------------------------------------------------------------------
-- Đường dẫn `<công trình>/<mục>/<tên tệp>`. Mục nhạy cảm (dự toán, báo giá nhà cung cấp) chỉ người
-- xem được giá vốn mở được — Thi công thấy «đã giao / đã nhận» chứ không thấy đơn giá vốn (Mẫu D).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('site-handover-files', 'site-handover-files', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE OR REPLACE FUNCTION public.rls_checklist_file_readable(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_checklist_items i
     WHERE i.id = public.try_uuid((string_to_array(p_path, '/'))[2])
       AND i.construction_site_id = public.try_uuid((string_to_array(p_path, '/'))[1])
       AND public.rls_site_checklist_readable(i.construction_site_id, i.kind)
       AND (NOT i.is_sensitive OR public.rls_sees_sensitive('cost'))
  );
$$;
REVOKE ALL ON FUNCTION public.rls_checklist_file_readable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_checklist_file_readable(text) TO authenticated;

-- Tải tệp lên: người giao mục bàn giao / người đánh dấu điều kiện khởi công của đúng mục đó.
CREATE OR REPLACE FUNCTION public.rls_checklist_file_writable(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_checklist_items i
     WHERE i.id = public.try_uuid((string_to_array(p_path, '/'))[2])
       AND i.construction_site_id = public.try_uuid((string_to_array(p_path, '/'))[1])
       AND CASE i.kind
             WHEN 'ban_giao' THEN public.auth_is_handover_giver(i.company_id, i.giver_department)
             ELSE public.rls_site_writable(i.construction_site_id) AND NOT public.auth_is_read_only()
           END
  );
$$;
REVOKE ALL ON FUNCTION public.rls_checklist_file_writable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_checklist_file_writable(text) TO authenticated;

DROP POLICY IF EXISTS site_handover_files_select ON storage.objects;
CREATE POLICY site_handover_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'site-handover-files' AND public.rls_checklist_file_readable(name));

DROP POLICY IF EXISTS site_handover_files_insert ON storage.objects;
CREATE POLICY site_handover_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-handover-files' AND public.rls_checklist_file_writable(name));

-- --- Đọc danh mục kèm phần tự nối ---------------------------------------------------------------
-- Một hàm cho cả hai loại. Không bao giờ trả giá trị hợp đồng, giá trị dự toán hay đơn giá: mục
-- «hợp đồng» chỉ nói số hợp đồng + đã ghi phạm vi / tiến độ chưa; mục «dự toán» chỉ «có / chưa có».
-- Tệp của mục nhạy cảm: người không xem được giá vốn nhận đường dẫn rỗng.
DROP FUNCTION IF EXISTS public.site_checklist(uuid, text);
CREATE OR REPLACE FUNCTION public.site_checklist(p_site_id uuid, p_kind text)
RETURNS TABLE (
  id               uuid,
  item_key         text,
  label            text,
  description      text,
  giver_department text,
  is_required      boolean,
  is_sensitive     boolean,
  status           text,
  link_url         text,
  attachment_path  text,
  note             text,
  given_by_name    text,
  given_at         timestamptz,
  received_by_name text,
  received_at      timestamptz,
  issue_note       text,
  issue_at         timestamptz,
  confirmed_by_name text,
  confirmed_at     timestamptz,
  auto_available   boolean,
  auto_label       text,
  can_give         boolean,
  can_receive      boolean,
  can_confirm      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  s            record;
  v_cost       boolean := public.rls_sees_sensitive('cost');
  v_receiver   boolean;
  v_writable   boolean;
  v_contract   record;
  v_scope      boolean;
  v_drawings   integer;
  v_estimate   boolean;
BEGIN
  SELECT * INTO s FROM public.construction_sites cs WHERE cs.id = p_site_id AND cs.deleted_at IS NULL;
  IF NOT FOUND OR p_kind NOT IN ('ban_giao', 'khoi_cong')
     OR NOT public.rls_site_checklist_readable(p_site_id, p_kind) THEN
    RETURN;
  END IF;
  v_receiver := public.auth_is_handover_receiver(p_site_id);
  v_writable := public.rls_site_writable(p_site_id) AND NOT public.auth_is_read_only();

  SELECT c.code::text AS code, c.start_date, c.end_date INTO v_contract
    FROM public.contracts c WHERE c.id = s.contract_id AND c.deleted_at IS NULL;
  v_scope := EXISTS (SELECT 1 FROM public.contract_terms ct
                      WHERE ct.contract_id = s.contract_id AND ct.deleted_at IS NULL AND ct.term_type = 'pham_vi');
  SELECT count(*) INTO v_drawings
    FROM public.design_versions v
   WHERE v.design_project_id = s.design_project_id AND v.deleted_at IS NULL
     AND v.published_at IS NOT NULL AND v.is_current_version
     AND v.discipline IN ('kien_truc', 'ket_cau', 'dien_nuoc');
  v_estimate := EXISTS (SELECT 1 FROM public.estimates e
                         WHERE e.deleted_at IS NULL AND e.status = 'completed'
                           AND ((s.bidding_project_id IS NOT NULL AND e.bidding_project_id = s.bidding_project_id)
                                OR (s.design_project_id IS NOT NULL AND e.design_project_id = s.design_project_id)))
                OR EXISTS (SELECT 1 FROM public.project_budgets b
                            WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL
                              AND b.cost_group <> 'loi_nhuan' AND b.budgeted_amount > 0);

  RETURN QUERY
  SELECT i.id, i.item_key::text, i.label, i.description, i.giver_department::text, i.is_required,
         i.is_sensitive, i.status::text, i.link_url,
         CASE WHEN i.is_sensitive AND NOT v_cost THEN NULL ELSE i.attachment_path END,
         i.note,
         (SELECT u.full_name::text FROM public.users u WHERE u.id = i.given_by),
         i.given_at,
         (SELECT u.full_name::text FROM public.users u WHERE u.id = i.received_by),
         i.received_at, i.issue_note, i.issue_at,
         (SELECT u.full_name::text FROM public.users u WHERE u.id = i.confirmed_by),
         i.confirmed_at,
         CASE i.auto_source
           WHEN 'hop_dong' THEN v_contract.code IS NOT NULL AND v_scope
           WHEN 'ban_ve' THEN v_drawings > 0
           WHEN 'du_toan' THEN v_estimate
           ELSE false
         END,
         CASE i.auto_source
           WHEN 'hop_dong' THEN
             CASE WHEN v_contract.code IS NULL THEN 'Công trình chưa gắn hợp đồng.'
                  ELSE format('Hợp đồng %s — %s; %s.', v_contract.code,
                              CASE WHEN v_scope THEN 'đã ghi phạm vi công việc' ELSE 'chưa ghi phạm vi công việc' END,
                              CASE WHEN v_contract.start_date IS NOT NULL OR v_contract.end_date IS NOT NULL
                                   THEN 'thời hạn ' || COALESCE(to_char(v_contract.start_date, 'DD/MM/YYYY'), '…')
                                        || ' — ' || COALESCE(to_char(v_contract.end_date, 'DD/MM/YYYY'), '…')
                                   ELSE 'chưa ghi thời hạn' END)
             END
           WHEN 'ban_ve' THEN
             CASE WHEN s.design_project_id IS NULL THEN 'Công trình không gắn hồ sơ thiết kế — bản vẽ giao kèm tệp.'
                  WHEN v_drawings = 0 THEN 'Hồ sơ thiết kế chưa phát hành bản vẽ thi công.'
                  ELSE format('%s bản vẽ đang hiệu lực — xem ở tab Bản vẽ của công trình.', v_drawings) END
           WHEN 'du_toan' THEN
             CASE WHEN v_estimate THEN 'Đã có dự toán / ngân sách được duyệt trên hệ thống.'
                  ELSE 'Chưa có dự toán được duyệt trên hệ thống.' END
         END,
         i.kind = 'ban_giao' AND i.status <> 'da_nhan' AND s.stage <> 'hoan_thanh'
           AND public.auth_is_handover_giver(s.company_id, i.giver_department),
         i.kind = 'ban_giao' AND v_receiver,
         i.kind = 'khoi_cong' AND v_writable
    FROM public.site_checklist_items i
   WHERE i.construction_site_id = p_site_id AND i.kind = p_kind
   ORDER BY i.position, i.label;
END;
$$;
REVOKE ALL ON FUNCTION public.site_checklist(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_checklist(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.site_checklist(uuid, text) IS
  'Gói bàn giao (ban_giao) / điều kiện khởi công (khoi_cong) của công trình kèm phần tự nối (G4, 0249). Không trả giá trị hợp đồng, dự toán, đơn giá; tệp mục nhạy cảm chỉ cho người xem được giá vốn.';

-- Tóm tắt cho công trình: tên, mã công trình, đếm thiếu — dùng ở trang bàn giao cho bộ phận giao
-- (không xem được phân hệ Thi công).
CREATE OR REPLACE FUNCTION public.site_handover_header(p_site_id uuid)
RETURNS TABLE (site_id uuid, site_code text, site_name text, stage text, company_id uuid,
               missing_required integer, open_issues integer, can_open_site boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.code::text, s.name, s.stage::text, s.company_id,
         (SELECT count(*)::int FROM public.site_checklist_items i
           WHERE i.construction_site_id = s.id AND i.kind = 'ban_giao' AND i.is_required AND i.status <> 'da_nhan'),
         (SELECT count(*)::int FROM public.site_checklist_items i
           WHERE i.construction_site_id = s.id AND i.kind = 'ban_giao' AND i.status = 'thieu'),
         public.rls_site_readable(s.id)
    FROM public.construction_sites s
   WHERE s.id = p_site_id AND s.deleted_at IS NULL
     AND public.rls_site_checklist_readable(p_site_id, 'ban_giao');
$$;
REVOKE ALL ON FUNCTION public.site_handover_header(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_handover_header(uuid) TO authenticated;

-- Báo cho mọi người của một vai trò trong pháp nhân.
CREATE OR REPLACE FUNCTION public._notify_company_roles(
  p_company_id uuid, p_roles text[], p_type text, p_message text,
  p_entity_type text, p_entity_id uuid, p_url text, p_except uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_notification(x.uid, p_company_id, p_type, p_message, p_entity_type, p_entity_id, p_url)
    FROM (SELECT DISTINCT u.id AS uid
            FROM public.users u
            JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
            JOIN public.roles r ON r.id = uc.role_id
           WHERE u.is_active AND u.deleted_at IS NULL
             AND uc.company_id = p_company_id AND r.code::text = ANY (p_roles)
             AND u.id IS DISTINCT FROM p_except) x;
$$;
REVOKE ALL ON FUNCTION public._notify_company_roles(uuid, text[], text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handover_department_roles(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_department
           WHEN 'du_an' THEN ARRAY['DA_DT']
           WHEN 'thiet_ke' THEN ARRAY['TKE']
           WHEN 'kinh_doanh' THEN ARRAY['KD']
           ELSE ARRAY[]::text[] END;
$$;

-- --- Giao một mục -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.give_handover_item(
  p_item_id uuid,
  p_note text DEFAULT NULL,
  p_link_url text DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  i      record;
  s      record;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_link text := NULLIF(btrim(COALESCE(p_link_url, '')), '');
  v_file text := NULLIF(btrim(COALESCE(p_attachment_path, '')), '');
  v_auto boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO i FROM public.site_checklist_items WHERE id = p_item_id AND kind = 'ban_giao' FOR UPDATE;
  IF NOT FOUND OR NOT public.auth_is_handover_giver(i.company_id, i.giver_department) THEN
    RAISE EXCEPTION 'Không giao được mục này. Bộ phận giao (%) hoặc Ban Giám đốc giao mục bàn giao.',
      CASE i.giver_department WHEN 'du_an' THEN 'Dự án' WHEN 'thiet_ke' THEN 'Thiết kế'
                              WHEN 'kinh_doanh' THEN 'Kinh doanh' ELSE 'theo danh mục' END
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = i.construction_site_id;
  IF s.stage = 'hoan_thanh' THEN RAISE EXCEPTION 'Công trình đã kết thúc.'; END IF;
  IF i.status = 'da_nhan' THEN
    RAISE EXCEPTION 'Mục «%» Thi công đã nhận.', i.label;
  END IF;
  IF v_file IS NOT NULL AND v_file NOT LIKE (i.construction_site_id::text || '/' || i.id::text || '/%') THEN
    RAISE EXCEPTION 'Tệp đính kèm không thuộc mục bàn giao này.';
  END IF;
  -- Phải có căn cứ: tệp, đường dẫn, ghi chú — hoặc mục đã có sẵn trên hệ thống (tự nối).
  SELECT c.auto_available INTO v_auto FROM public.site_checklist(i.construction_site_id, 'ban_giao') c WHERE c.id = i.id;
  IF v_note IS NULL AND v_link IS NULL AND v_file IS NULL AND NOT COALESCE(v_auto, false) THEN
    RAISE EXCEPTION 'Đính kèm tệp, dán đường dẫn hoặc ghi rõ nội dung đã giao.';
  END IF;

  UPDATE public.site_checklist_items
     SET status = 'da_giao', note = COALESCE(v_note, note), link_url = COALESCE(v_link, link_url),
         attachment_path = COALESCE(v_file, attachment_path),
         given_by = v_user, given_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = i.id;
  INSERT INTO public.site_checklist_events (company_id, item_id, action, note, link_url, attachment_path, actor_id)
  VALUES (i.company_id, i.id, 'giao', v_note, v_link, v_file, v_user);

  PERFORM public._notify_company_roles(
    i.company_id, ARRAY['TC'], 'site_handover_given',
    format('Công trình %s: đã giao «%s» — kiểm và xác nhận nhận bàn giao.', s.code, i.label),
    'construction_sites', s.id, '/ban-giao-thi-cong/' || s.id, v_user);
END;
$$;
REVOKE ALL ON FUNCTION public.give_handover_item(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.give_handover_item(uuid, text, text, text) TO authenticated;

-- --- Nhận / báo thiếu ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_handover_item(p_item_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  i      record;
  s      record;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_auto boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO i FROM public.site_checklist_items WHERE id = p_item_id AND kind = 'ban_giao' FOR UPDATE;
  IF NOT FOUND OR NOT public.auth_is_handover_receiver(i.construction_site_id) THEN
    RAISE EXCEPTION 'Không xác nhận được mục bàn giao này. Trưởng phòng Thi công hoặc Ban Giám đốc nhận bàn giao.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = i.construction_site_id;

  IF p_accept THEN
    SELECT c.auto_available INTO v_auto FROM public.site_checklist(i.construction_site_id, 'ban_giao') c WHERE c.id = i.id;
    IF i.status <> 'da_giao' AND NOT COALESCE(v_auto, false) THEN
      RAISE EXCEPTION 'Mục «%» chưa được giao. Chờ bộ phận giao, hoặc báo thiếu.', i.label;
    END IF;
    UPDATE public.site_checklist_items
       SET status = 'da_nhan', received_by = v_user, received_at = now(),
           issue_note = NULL, updated_at = now(), updated_by = v_user
     WHERE id = i.id;
    INSERT INTO public.site_checklist_events (company_id, item_id, action, note, actor_id)
    VALUES (i.company_id, i.id, 'nhan', v_note, v_user);
  ELSE
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Ghi rõ thiếu gì hoặc chưa đạt ở đâu để bộ phận giao bổ sung.';
    END IF;
    UPDATE public.site_checklist_items
       SET status = 'thieu', issue_note = v_note, issue_by = v_user, issue_at = now(),
           received_by = NULL, received_at = NULL, updated_at = now(), updated_by = v_user
     WHERE id = i.id;
    INSERT INTO public.site_checklist_events (company_id, item_id, action, note, actor_id)
    VALUES (i.company_id, i.id, 'bao_thieu', v_note, v_user);

    -- Báo người đã giao; chưa ai giao thì báo cả bộ phận giao của pháp nhân.
    IF i.given_by IS NOT NULL AND i.given_by <> v_user THEN
      PERFORM public.create_notification(
        i.given_by, i.company_id, 'site_handover_issue',
        format('Công trình %s: Thi công báo «%s» còn thiếu / chưa đạt — %s', s.code, i.label, v_note),
        'construction_sites', s.id, '/ban-giao-thi-cong/' || s.id);
    ELSE
      PERFORM public._notify_company_roles(
        i.company_id, public.handover_department_roles(i.giver_department), 'site_handover_issue',
        format('Công trình %s: Thi công báo «%s» còn thiếu / chưa đạt — %s', s.code, i.label, v_note),
        'construction_sites', s.id, '/ban-giao-thi-cong/' || s.id, v_user);
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_handover_item(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_handover_item(uuid, boolean, text) TO authenticated;

-- --- Điều kiện khởi công -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_start_condition(
  p_item_id uuid,
  p_done boolean,
  p_note text DEFAULT NULL,
  p_link_url text DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  i      record;
  s      record;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_link text := NULLIF(btrim(COALESCE(p_link_url, '')), '');
  v_file text := NULLIF(btrim(COALESCE(p_attachment_path, '')), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO i FROM public.site_checklist_items WHERE id = p_item_id AND kind = 'khoi_cong' FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_site_writable(i.construction_site_id) OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Không xác nhận được điều kiện khởi công này. Chỉ huy trưởng của công trình hoặc Phòng Thi công xác nhận.'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = i.construction_site_id;
  IF s.stage <> 'chuan_bi' THEN
    RAISE EXCEPTION 'Công trình đã khởi công — điều kiện khởi công không sửa nữa.';
  END IF;
  IF v_file IS NOT NULL AND v_file NOT LIKE (i.construction_site_id::text || '/' || i.id::text || '/%') THEN
    RAISE EXCEPTION 'Tệp đính kèm không thuộc mục này.';
  END IF;
  IF p_done AND v_note IS NULL AND v_link IS NULL AND v_file IS NULL THEN
    RAISE EXCEPTION 'Ghi căn cứ (số văn bản, ngày, người cấp), dán đường dẫn hoặc chụp ảnh giấy tờ.';
  END IF;

  UPDATE public.site_checklist_items
     SET status = CASE WHEN p_done THEN 'da_dat' ELSE 'chua_dat' END,
         note = CASE WHEN p_done THEN COALESCE(v_note, note) ELSE COALESCE(v_note, note) END,
         link_url = COALESCE(v_link, link_url),
         attachment_path = COALESCE(v_file, attachment_path),
         confirmed_by = CASE WHEN p_done THEN v_user END,
         confirmed_at = CASE WHEN p_done THEN now() END,
         updated_at = now(), updated_by = v_user
   WHERE id = i.id;
  INSERT INTO public.site_checklist_events (company_id, item_id, action, note, link_url, attachment_path, actor_id)
  VALUES (i.company_id, i.id, CASE WHEN p_done THEN 'dat' ELSE 'bo_dat' END, v_note, v_link, v_file, v_user);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_start_condition(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_start_condition(uuid, boolean, text, text, text) TO authenticated;

-- Danh sách cho bộ phận giao: công trình còn mục của bộ phận mình chưa được nhận.
CREATE OR REPLACE FUNCTION public.my_handover_tasks()
RETURNS TABLE (site_id uuid, site_code text, site_name text, company_id uuid,
               pending integer, issues integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.code::text, s.name, s.company_id,
         count(*) FILTER (WHERE i.status IN ('cho_giao', 'thieu'))::int,
         count(*) FILTER (WHERE i.status = 'thieu')::int
    FROM public.site_checklist_items i
    JOIN public.construction_sites s ON s.id = i.construction_site_id AND s.deleted_at IS NULL
   WHERE i.kind = 'ban_giao' AND s.stage NOT IN ('hoan_thanh', 'bao_hanh')
     AND i.status IN ('cho_giao', 'thieu')
     AND public.auth_is_handover_giver(s.company_id, i.giver_department)
     AND NOT public.auth_manages_all_companies()
   GROUP BY s.id, s.code, s.name, s.company_id
   ORDER BY s.code;
$$;
REVOKE ALL ON FUNCTION public.my_handover_tasks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_handover_tasks() TO authenticated;


-- ============================================================================
-- 2. Lãi dự kiến lúc nhận việc — bất biến, có phiên bản (Mẫu D)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_profit_baselines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id  uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  version               integer NOT NULL CHECK (version >= 1),
  reason_kind           varchar(24) NOT NULL
                        CHECK (reason_kind IN ('khoi_cong', 'ngan_sach_duyet', 'dieu_chinh_ngan_sach', 'phat_sinh')),
  selling_price         bigint,
  approved_budget       bigint NOT NULL,
  expected_profit       bigint,
  margin_percent        numeric(7, 2),
  budget_adjustment_id  uuid,
  contract_amendment_id uuid,
  approved_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  note                  text,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_profit_baselines_version_unique UNIQUE (construction_site_id, version)
);
COMMENT ON TABLE public.site_profit_baselines IS
  'Lãi dự kiến «lúc nhận việc» của công trình (G4, 0249): giá bán (hợp đồng + phát sinh đã duyệt) − ngân sách chi phí, chụp khi '
  'ngân sách khoá lại (khởi công) và thêm phiên bản ở mỗi điều chỉnh ngân sách / phát sinh được duyệt — ghi tên người duyệt. '
  'BẤT BIẾN. Mẫu D: chỉ người xem được lợi nhuận đọc.';

DROP TRIGGER IF EXISTS trg_transactional_company ON public.site_profit_baselines;
CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.site_profit_baselines
  FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company();

CREATE OR REPLACE FUNCTION public.site_profit_baselines_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Xoá theo dây chuyền khi dọn dữ liệu thử (không người đăng nhập) vẫn được; người dùng thì không.
  IF TG_OP = 'UPDATE' OR public.auth_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Lãi dự kiến lúc nhận việc đã chụp không sửa, không xoá được — thay đổi đi qua điều chỉnh ngân sách / phát sinh có duyệt.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS site_profit_baselines_immutable ON public.site_profit_baselines;
CREATE TRIGGER site_profit_baselines_immutable
  BEFORE UPDATE OR DELETE ON public.site_profit_baselines
  FOR EACH ROW EXECUTE FUNCTION public.site_profit_baselines_immutable();

ALTER TABLE public.site_profit_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_profit_baselines_select ON public.site_profit_baselines;
CREATE POLICY site_profit_baselines_select ON public.site_profit_baselines
  FOR SELECT TO authenticated
  USING (public.rls_company_access(company_id) AND public.rls_sees_sensitive('profit'));

-- Chụp một phiên bản. Giá bán theo đúng cách `site_profit_loss_list` (0198) tính doanh thu hợp đồng.
CREATE OR REPLACE FUNCTION public._capture_site_baseline(
  p_site_id uuid, p_kind text, p_approver uuid,
  p_adjustment_id uuid DEFAULT NULL, p_amendment_id uuid DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s        record;
  v_price  bigint;
  v_budget bigint;
  v_ver    integer;
  v_id     uuid;
BEGIN
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id FOR UPDATE;
  SELECT CASE WHEN c.value IS NULL THEN NULL
              ELSE c.value + COALESCE((SELECT sum(a.value_change) FROM public.contract_amendments a
                                        WHERE a.contract_id = c.id AND a.deleted_at IS NULL
                                          AND a.stage IN ('da_duyet', 'da_thuc_hien')), 0) END
    INTO v_price
    FROM public.contracts c WHERE c.id = s.contract_id AND c.deleted_at IS NULL;
  SELECT COALESCE(sum(b.budgeted_amount), 0)::bigint INTO v_budget
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL AND b.cost_group <> 'loi_nhuan';

  SELECT COALESCE(max(version), 0) + 1 INTO v_ver FROM public.site_profit_baselines WHERE construction_site_id = p_site_id;

  INSERT INTO public.site_profit_baselines (
    company_id, construction_site_id, version, reason_kind, selling_price, approved_budget,
    expected_profit, margin_percent, budget_adjustment_id, contract_amendment_id, approved_by, note)
  VALUES (
    s.company_id, p_site_id, v_ver, p_kind, v_price, v_budget,
    -- Ngân sách 0 đồng là «chưa có ngân sách», không phải lãi 100 % (5.2).
    CASE WHEN v_price IS NOT NULL AND v_budget > 0 THEN v_price - v_budget END,
    CASE WHEN v_price IS NOT NULL AND v_price > 0 AND v_budget > 0
         THEN round((v_price - v_budget)::numeric * 100 / v_price, 2) END,
    p_adjustment_id, p_amendment_id, p_approver, p_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._capture_site_baseline(uuid, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Khởi công = ngân sách khoá lại = lần «duyệt» đầu: chụp phiên bản 1. Chưa có ngân sách thì chưa
-- chụp — lần điều chỉnh ngân sách được duyệt đầu tiên chụp thay (`ngan_sach_duyet`).
CREATE OR REPLACE FUNCTION public.construction_sites_capture_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stage = 'chuan_bi' AND NEW.stage = 'dang_thi_cong'
     AND NOT EXISTS (SELECT 1 FROM public.site_profit_baselines b WHERE b.construction_site_id = NEW.id)
     AND EXISTS (SELECT 1 FROM public.project_budgets b
                  WHERE b.construction_site_id = NEW.id AND b.deleted_at IS NULL
                    AND b.cost_group <> 'loi_nhuan' AND b.budgeted_amount > 0) THEN
    PERFORM public._capture_site_baseline(NEW.id, 'khoi_cong', public.auth_user_id(), NULL, NULL,
                                          'Ngân sách khoá khi khởi công');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS construction_sites_capture_baseline ON public.construction_sites;
CREATE TRIGGER construction_sites_capture_baseline
  AFTER UPDATE OF stage ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_capture_baseline();

-- Phát sinh được duyệt đổi giá bán: thêm phiên bản cho công trình đã có lãi lúc nhận việc.
CREATE OR REPLACE FUNCTION public.contract_amendments_capture_baseline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site uuid;
BEGIN
  IF NEW.stage = 'da_duyet' AND OLD.stage IS DISTINCT FROM 'da_duyet' AND COALESCE(NEW.value_change, 0) <> 0 THEN
    FOR v_site IN
      SELECT s.id FROM public.construction_sites s
       WHERE s.contract_id = NEW.contract_id AND s.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM public.site_profit_baselines b WHERE b.construction_site_id = s.id)
    LOOP
      PERFORM public._capture_site_baseline(v_site, 'phat_sinh', public.auth_user_id(), NULL, NEW.id,
                                            'Phát sinh ' || COALESCE(NEW.code::text, '') || ' được duyệt');
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS contract_amendments_capture_baseline ON public.contract_amendments;
CREATE TRIGGER contract_amendments_capture_baseline
  AFTER UPDATE OF stage ON public.contract_amendments
  FOR EACH ROW EXECUTE FUNCTION public.contract_amendments_capture_baseline();

-- Các phiên bản cho trang lãi / lỗ (Mẫu D, ghi nhật ký).
CREATE OR REPLACE FUNCTION public.site_profit_baseline_history(p_site_id uuid)
RETURNS TABLE (version integer, reason_kind text, selling_price bigint, approved_budget bigint,
               expected_profit bigint, margin_percent numeric, approved_by_name text,
               captured_at timestamptz, note text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    PERFORM public.site_profit_guard(NULL);
    RAISE EXCEPTION 'Không tìm thấy công trình.';
  END IF;
  PERFORM public.site_profit_guard(s.company_id);
  PERFORM public.log_sensitive_access('profit', 'site_profit_baselines', s.id, 'view', s.company_id);
  RETURN QUERY
  SELECT b.version, b.reason_kind::text, b.selling_price, b.approved_budget, b.expected_profit,
         b.margin_percent, u.full_name::text, b.captured_at, b.note
    FROM public.site_profit_baselines b
    LEFT JOIN public.users u ON u.id = b.approved_by
   WHERE b.construction_site_id = p_site_id
   ORDER BY b.version;
END;
$$;
REVOKE ALL ON FUNCTION public.site_profit_baseline_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_profit_baseline_history(uuid) TO authenticated;


-- ============================================================================
-- 3. Điều chỉnh ngân sách sau khởi công — phải duyệt
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.budget_adjustments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  code                 varchar(48),
  project_budget_id    uuid REFERENCES public.project_budgets(id) ON DELETE SET NULL,
  action               varchar(8) NOT NULL CHECK (action IN ('sua', 'them', 'xoa')),
  cost_group           public.cost_group NOT NULL,
  cost_code            varchar(64) NOT NULL,
  name                 text NOT NULL,
  old_amount           bigint NOT NULL DEFAULT 0,
  new_amount           bigint NOT NULL CHECK (new_amount >= 0),
  delta                bigint NOT NULL,
  reason               text NOT NULL,
  cause                text NOT NULL,
  responsibility       text NOT NULL,
  impact               text NOT NULL,
  status               varchar(16) NOT NULL DEFAULT 'cho_duyet'
                       CHECK (status IN ('cho_duyet', 'da_duyet', 'tu_choi', 'huy')),
  approval_id          uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  requested_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  decided_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  decision_note        text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS budget_adjustments_site_idx ON public.budget_adjustments (construction_site_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS budget_adjustments_one_pending
  ON public.budget_adjustments (construction_site_id, cost_code) WHERE status = 'cho_duyet';

COMMENT ON TABLE public.budget_adjustments IS
  'Điều chỉnh ngân sách công trình sau khởi công (G4, 0249) — bảng LỊCH SỬ: mỗi đề nghị một dòng, số cũ / số mới, lý do, nguyên nhân, '
  'trách nhiệm, ảnh hưởng, người đề nghị, người duyệt. Chỉ ghi qua hàm. Duyệt xong mới đổi project_budgets và thêm phiên bản lãi dự kiến.';

DO $$
BEGIN
  DROP TRIGGER IF EXISTS audit_touch ON public.budget_adjustments;
  PERFORM public.attach_audit_touch('public.budget_adjustments');
  DROP TRIGGER IF EXISTS trg_transactional_company ON public.budget_adjustments;
  CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.budget_adjustments
    FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company();
END;
$$;

-- Nội dung đề nghị không đổi sau khi gửi — chỉ trạng thái / kết quả duyệt.
CREATE OR REPLACE FUNCTION public.budget_adjustments_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Dọn dữ liệu / xoá theo dây chuyền (không người đăng nhập): khoá ngoại SET NULL phải đi qua.
  IF public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (NEW.construction_site_id, NEW.project_budget_id, NEW.action, NEW.cost_group, NEW.cost_code, NEW.name,
      NEW.old_amount, NEW.new_amount, NEW.delta, NEW.reason, NEW.cause, NEW.responsibility, NEW.impact,
      NEW.requested_by, NEW.requested_at)
     IS DISTINCT FROM
     (OLD.construction_site_id, OLD.project_budget_id, OLD.action, OLD.cost_group, OLD.cost_code, OLD.name,
      OLD.old_amount, OLD.new_amount, OLD.delta, OLD.reason, OLD.cause, OLD.responsibility, OLD.impact,
      OLD.requested_by, OLD.requested_at)
     AND NOT (OLD.action = 'them' AND NEW.project_budget_id IS NOT NULL AND OLD.project_budget_id IS NULL
              AND (NEW.construction_site_id, NEW.cost_code, NEW.new_amount) = (OLD.construction_site_id, OLD.cost_code, OLD.new_amount)) THEN
    RAISE EXCEPTION 'Nội dung đề nghị điều chỉnh ngân sách đã gửi không sửa được — hủy và lập đề nghị mới.';
  END IF;
  IF OLD.status <> 'cho_duyet' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Đề nghị điều chỉnh ngân sách đã được xử lý.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_adjustments_frozen ON public.budget_adjustments;
CREATE TRIGGER budget_adjustments_frozen
  BEFORE UPDATE ON public.budget_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.budget_adjustments_frozen();

ALTER TABLE public.budget_adjustments ENABLE ROW LEVEL SECURITY;
-- Cùng phạm vi đọc với `project_budgets` (0235): xem được giá vốn, hoặc Thi công trong phạm vi
-- công trình; dòng lợi nhuận chỉ người xem được lợi nhuận.
DROP POLICY IF EXISTS budget_adjustments_select ON public.budget_adjustments;
CREATE POLICY budget_adjustments_select ON public.budget_adjustments
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      (cost_group = 'loi_nhuan' AND public.rls_sees_sensitive('profit'))
      OR (cost_group <> 'loi_nhuan'
          AND (public.rls_sees_sensitive('cost')
               OR (public.auth_can_edit_module('TC') AND public.rls_site_readable(construction_site_id))))
    )
  );

CREATE OR REPLACE FUNCTION public.site_budget_locked(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.construction_sites s
                  WHERE s.id = p_site_id AND s.stage <> 'chuan_bi');
$$;
GRANT EXECUTE ON FUNCTION public.site_budget_locked(uuid) TO authenticated;
COMMENT ON FUNCTION public.site_budget_locked(uuid) IS
  'Công trình đã khởi công (G4, 0249): ngân sách chỉ đổi qua «Điều chỉnh ngân sách» có phê duyệt.';

-- Chặn MỌI đường sửa trực tiếp sau khởi công: save_site_budget_line, delete_site_budget_line,
-- dựng lại ngân sách từ dự toán, PostgREST. Cam kết / thực tế vẫn chạy (đơn hàng, chi trả).
-- Không người đăng nhập (dọn dữ liệu, migration) thì không chặn — như các cổng bước 0164.
CREATE OR REPLACE FUNCTION public.project_budgets_started_site_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_site uuid := COALESCE(NEW.construction_site_id, OLD.construction_site_id);
BEGIN
  IF public.auth_user_id() IS NULL
     OR current_setting('nvg.budget_adjustment_apply', true) = 'on'
     OR v_site IS NULL OR NOT public.site_budget_locked(v_site) THEN
    RETURN NEW;
  END IF;
  -- Hạch toán của hệ thống đi qua: cam kết / thực tế (giao hàng, chi trả, thuê nội bộ, cam kết thầu
  -- phụ) không bị xét ở đây; dòng chi phí do MÁY lập với số dự trù 0 bên trong một trigger hạch toán
  -- (vd `rental_returns_post_internal_cost` 0245 lập dòng THUE_GIAN_GIAO_NB) cũng đi qua. Người dùng
  -- thêm dòng qua hàm / REST thì độ sâu trigger là 1 → bị chặn.
  IF TG_OP = 'INSERT' AND pg_trigger_depth() > 1 AND COALESCE(NEW.budgeted_amount, 0) = 0
     AND NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.budgeted_amount IS DISTINCT FROM OLD.budgeted_amount
     OR NEW.cost_code IS DISTINCT FROM OLD.cost_code
     OR NEW.cost_group IS DISTINCT FROM OLD.cost_group
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id THEN
    RAISE EXCEPTION 'Công trình đã khởi công: thêm, sửa, xoá dòng ngân sách phải gửi «Điều chỉnh ngân sách» kèm lý do để phê duyệt.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS project_budgets_started_site_guard ON public.project_budgets;
CREATE TRIGGER project_budgets_started_site_guard
  BEFORE INSERT OR UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.project_budgets_started_site_guard();

-- Ai được đề nghị: người lập ngân sách (Trưởng phòng Thi công, Ban Giám đốc) và Ban công trường
-- của chính công trình (chỉ huy trưởng — Mẫu E). Người duyệt theo hạn mức `budget_adjustment`.
CREATE OR REPLACE FUNCTION public.auth_can_request_budget_adjustment(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only()
     AND (public.auth_manages_site_budget(p_site_id) OR public.rls_site_writable(p_site_id));
$$;
GRANT EXECUTE ON FUNCTION public.auth_can_request_budget_adjustment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_budget_adjustment(
  p_site_id uuid,
  p_line_id uuid,
  p_action text,
  p_cost_group public.cost_group,
  p_cost_code text,
  p_name text,
  p_new_amount bigint,
  p_reason text,
  p_cause text,
  p_responsibility text,
  p_impact text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  s        record;
  b        public.project_budgets;
  v_code   text := upper(btrim(COALESCE(p_cost_code, '')));
  v_name   text := btrim(COALESCE(p_name, ''));
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cause  text := NULLIF(btrim(COALESCE(p_cause, '')), '');
  v_resp   text := NULLIF(btrim(COALESCE(p_responsibility, '')), '');
  v_impact text := NULLIF(btrim(COALESCE(p_impact, '')), '');
  v_old    bigint := 0;
  v_new    bigint;
  v_group  public.cost_group := p_cost_group;
  v_id     uuid;
  v_appr   uuid;
  v_cc     text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.auth_can_request_budget_adjustment(p_site_id) THEN
    RAISE EXCEPTION 'Không gửi được điều chỉnh ngân sách cho công trình này. Ban công trường của công trình, Trưởng phòng Thi công hoặc Ban Giám đốc gửi.'
      USING ERRCODE = '42501';
  END IF;
  IF s.stage = 'chuan_bi' THEN
    RAISE EXCEPTION 'Công trình chưa khởi công — sửa thẳng ngân sách, chưa cần phê duyệt.';
  END IF;
  IF s.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc.';
  END IF;
  IF p_action NOT IN ('sua', 'them', 'xoa') THEN
    RAISE EXCEPTION 'Loại điều chỉnh không hợp lệ.';
  END IF;
  IF v_reason IS NULL OR v_cause IS NULL OR v_resp IS NULL OR v_impact IS NULL THEN
    RAISE EXCEPTION 'Điều chỉnh ngân sách cần đủ bốn ý: lý do, nguyên nhân, trách nhiệm, ảnh hưởng.';
  END IF;

  IF p_action = 'them' THEN
    IF v_group IS NULL THEN RAISE EXCEPTION 'Chưa chọn nhóm chi phí.'; END IF;
    IF v_code = '' OR length(v_code) > 64 THEN RAISE EXCEPTION 'Mã chi phí phải có từ 1 đến 64 ký tự.'; END IF;
    IF v_name = '' THEN RAISE EXCEPTION 'Chưa nhập tên dòng ngân sách.'; END IF;
    IF EXISTS (SELECT 1 FROM public.project_budgets x
                WHERE x.construction_site_id = p_site_id AND x.deleted_at IS NULL AND x.cost_code = v_code) THEN
      RAISE EXCEPTION 'Mã chi phí % đã có trong ngân sách công trình — điều chỉnh dòng đó.', v_code;
    END IF;
    v_new := p_new_amount;
  ELSE
    SELECT * INTO b FROM public.project_budgets
     WHERE id = p_line_id AND construction_site_id = p_site_id AND deleted_at IS NULL;
    IF NOT FOUND OR (b.cost_group = 'loi_nhuan' AND NOT public.rls_sees_sensitive('profit')) THEN
      RAISE EXCEPTION 'Không tìm thấy dòng ngân sách này.';
    END IF;
    v_code := b.cost_code;
    v_group := b.cost_group;
    v_name := COALESCE(NULLIF(v_name, ''), b.name);
    v_old := b.budgeted_amount;
    v_new := CASE WHEN p_action = 'xoa' THEN 0 ELSE p_new_amount END;
    IF p_action = 'xoa' AND (b.committed_amount <> 0 OR b.actual_amount <> 0) THEN
      RAISE EXCEPTION 'Dòng % đã có cam kết hoặc chi phí — không xoá được. Điều chỉnh số dự trù thay vì xoá.', v_code;
    END IF;
  END IF;
  IF v_group = 'loi_nhuan' AND NOT public.rls_sees_sensitive('profit') THEN
    RAISE EXCEPTION 'Dòng lợi nhuận chỉ Ban Giám đốc điều chỉnh được.';
  END IF;
  IF v_new IS NULL OR v_new < 0 THEN RAISE EXCEPTION 'Số tiền dự trù phải từ 0 đồng trở lên.'; END IF;
  IF p_action = 'sua' AND v_new = v_old THEN
    RAISE EXCEPTION 'Số dự trù mới bằng số đang có — không có gì để điều chỉnh.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.budget_adjustments x
              WHERE x.construction_site_id = p_site_id AND x.cost_code = v_code AND x.status = 'cho_duyet') THEN
    RAISE EXCEPTION 'Dòng % đang có một đề nghị điều chỉnh chờ duyệt.', v_code;
  END IF;

  SELECT code INTO v_cc FROM public.companies WHERE id = s.company_id;
  INSERT INTO public.budget_adjustments (
    company_id, construction_site_id, code, project_budget_id, action, cost_group, cost_code, name,
    old_amount, new_amount, delta, reason, cause, responsibility, impact, requested_by,
    created_by, updated_by)
  VALUES (
    s.company_id, p_site_id, public.next_record_code(v_cc, 'DCNS'),
    CASE WHEN p_action = 'them' THEN NULL ELSE p_line_id END,
    p_action, v_group, v_code, v_name, v_old, v_new, v_new - v_old,
    v_reason, v_cause, v_resp, v_impact, v_user, v_user, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  SELECT s.company_id, 'budget_adjustment'::public.approval_subject, 'budget_adjustments', v_id, a.code,
         format('Điều chỉnh ngân sách — %s (%s) — %s', s.name, s.code, v_name),
         abs(v_new - v_old),
         format('%s dòng %s: %s → %s đồng (%s%s). Lý do: %s. Nguyên nhân: %s. Trách nhiệm: %s. Ảnh hưởng: %s.',
                CASE p_action WHEN 'them' THEN 'Thêm' WHEN 'xoa' THEN 'Xoá' ELSE 'Sửa' END, v_code,
                to_char(v_old, 'FM999G999G999G999'), to_char(v_new, 'FM999G999G999G999'),
                CASE WHEN v_new >= v_old THEN '+' ELSE '' END, to_char(v_new - v_old, 'FM999G999G999G999'),
                v_reason, v_cause, v_resp, v_impact),
         'pending_approval', v_user
    FROM public.budget_adjustments a WHERE a.id = v_id
  RETURNING id INTO v_appr;

  UPDATE public.budget_adjustments SET approval_id = v_appr WHERE id = v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_budget_adjustment(uuid, uuid, text, public.cost_group, text, text, bigint, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_budget_adjustment(uuid, uuid, text, public.cost_group, text, text, bigint, text, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.request_budget_adjustment(uuid, uuid, text, public.cost_group, text, text, bigint, text, text, text, text) IS
  'Gửi duyệt «Điều chỉnh ngân sách» cho công trình đã khởi công (G4, 0249): sua / them / xoa một dòng, bắt buộc lý do, nguyên nhân, trách nhiệm, ảnh hưởng; hạn mức theo |chênh lệch|.';

CREATE OR REPLACE FUNCTION public.cancel_budget_adjustment(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  SELECT * INTO a FROM public.budget_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_user IS NULL OR a.requested_by IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Chỉ người gửi hủy được đề nghị điều chỉnh này.' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'cho_duyet' THEN RAISE EXCEPTION 'Đề nghị đã được xử lý.'; END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Nêu lý do hủy.'; END IF;

  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT ap.id, ap.current_step, 'rejected', 'Người gửi hủy: ' || btrim(p_reason), v_user
    FROM public.approvals ap WHERE ap.id = a.approval_id AND ap.status = 'pending_approval';
  UPDATE public.approvals SET status = 'completed', final_decision = 'rejected', decided_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = a.approval_id AND status = 'pending_approval';
  UPDATE public.budget_adjustments
     SET status = 'huy', decided_at = now(), decision_note = btrim(p_reason), updated_at = now(), updated_by = v_user
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_budget_adjustment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_budget_adjustment(uuid, text) TO authenticated;

-- Gọi từ `decide_approval` (nhánh budget_adjustments).
CREATE OR REPLACE FUNCTION public._decide_budget_adjustment(p_id uuid, p_decision approval_decision, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  s      record;
  v_line uuid;
  v_first boolean;
BEGIN
  SELECT * INTO a FROM public.budget_adjustments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đề nghị điều chỉnh ngân sách.'; END IF;
  IF a.status <> 'cho_duyet' THEN RAISE EXCEPTION 'Đề nghị điều chỉnh ngân sách đã được xử lý.'; END IF;
  SELECT * INTO s FROM public.construction_sites WHERE id = a.construction_site_id;

  IF p_decision = 'approved' THEN
    PERFORM set_config('nvg.budget_adjustment_apply', 'on', true);
    IF a.action = 'them' THEN
      INSERT INTO public.project_budgets (company_id, construction_site_id, cost_group, cost_code, name,
                                          budgeted_amount, notes, created_by, updated_by)
      VALUES (a.company_id, a.construction_site_id, a.cost_group, a.cost_code, a.name, a.new_amount,
              'Thêm bằng điều chỉnh ngân sách ' || COALESCE(a.code::text, ''), v_user, v_user)
      RETURNING id INTO v_line;
      UPDATE public.budget_adjustments SET project_budget_id = v_line WHERE id = p_id;
    ELSIF a.action = 'xoa' THEN
      UPDATE public.project_budgets
         SET budgeted_amount = 0, deleted_at = CASE WHEN committed_amount = 0 AND actual_amount = 0 THEN now() END,
             updated_at = now(), updated_by = v_user
       WHERE id = a.project_budget_id;
    ELSE
      UPDATE public.project_budgets
         SET budgeted_amount = a.new_amount, name = a.name, updated_at = now(), updated_by = v_user
       WHERE id = a.project_budget_id;
    END IF;
    PERFORM set_config('nvg.budget_adjustment_apply', 'off', true);

    INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
    VALUES (v_user, a.company_id, 'approve_budget_adjustment', 'project_budgets', COALESCE(v_line, a.project_budget_id),
            jsonb_build_object('cost_code', a.cost_code, 'budgeted_amount', a.old_amount),
            jsonb_build_object('cost_code', a.cost_code, 'budgeted_amount', a.new_amount, 'adjustment', a.code),
            a.reason);

    UPDATE public.budget_adjustments
       SET status = 'da_duyet', decided_by = v_user, decided_at = now(),
           decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = now(), updated_by = v_user
     WHERE id = p_id;

    v_first := NOT EXISTS (SELECT 1 FROM public.site_profit_baselines b WHERE b.construction_site_id = a.construction_site_id);
    PERFORM public._capture_site_baseline(
      a.construction_site_id, CASE WHEN v_first THEN 'ngan_sach_duyet' ELSE 'dieu_chinh_ngan_sach' END,
      v_user, p_id, NULL, 'Điều chỉnh ngân sách ' || COALESCE(a.code::text, '') || ': ' || a.reason);
  ELSE
    UPDATE public.budget_adjustments
       SET status = 'tu_choi', decided_by = v_user, decided_at = now(),
           decision_note = NULLIF(btrim(COALESCE(p_note, '')), ''), updated_at = now(), updated_by = v_user
     WHERE id = p_id;
  END IF;

  IF a.requested_by IS NOT NULL THEN
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'budget_adjustment_approved' ELSE 'budget_adjustment_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Điều chỉnh ngân sách %s (%s, công trình %s) đã được duyệt.', COALESCE(a.code::text, ''), a.cost_code, s.code)
           ELSE format('Điều chỉnh ngân sách %s (%s, công trình %s) bị từ chối. %s', COALESCE(a.code::text, ''), a.cost_code, s.code,
                       COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), ''))
      END,
      'construction_sites', a.construction_site_id,
      '/tc/cong-trinh/' || a.construction_site_id || '?tab=ngan-sach');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._decide_budget_adjustment(uuid, approval_decision, text) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 4. Vượt ngân sách → duyệt lại (không chặn)
-- ============================================================================

-- Phần còn lại của dòng ngân sách, trừ phần đã GIỮ CHỖ bởi đề nghị mua / gói việc gửi trước mốc
-- `p_before` (đang chờ duyệt, hoặc đã duyệt mà chưa đặt hàng / chưa duyệt chọn) — hai đề nghị gửi
-- cùng lúc không cùng lọt qua một phần còn lại.
CREATE OR REPLACE FUNCTION public._budget_line_headroom(
  p_site_id uuid, p_cost_code text, p_before timestamptz,
  p_exclude_type text DEFAULT NULL, p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (found boolean, line_name text, budgeted bigint, committed bigint, actual bigint,
               reserved bigint, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH line AS (
    SELECT count(*) > 0 AS found, min(pb.name) AS line_name,
           COALESCE(sum(pb.budgeted_amount), 0)::bigint AS budgeted,
           COALESCE(sum(pb.committed_amount), 0)::bigint AS committed,
           COALESCE(sum(pb.actual_amount), 0)::bigint AS actual
      FROM public.project_budgets pb
     WHERE pb.construction_site_id = p_site_id AND pb.cost_code = p_cost_code AND pb.deleted_at IS NULL
  ),
  res AS (
    SELECT COALESCE(sum(pr.estimated_value), 0)::bigint AS amt
      FROM public.purchase_requests pr
      JOIN public.approvals ap ON ap.entity_type = 'purchase_requests' AND ap.entity_id = pr.id
                              AND ap.deleted_at IS NULL AND ap.requested_at < p_before
                              AND (ap.status = 'pending_approval' OR ap.final_decision = 'approved')
     WHERE pr.construction_site_id = p_site_id AND pr.cost_code = p_cost_code AND pr.deleted_at IS NULL
       AND pr.stage IN ('cho_duyet', 'da_duyet')
       AND NOT (p_exclude_type = 'purchase_requests' AND pr.id = p_exclude_id)
       AND NOT EXISTS (SELECT 1 FROM public.purchase_orders po
                        WHERE po.purchase_request_id = pr.id AND po.deleted_at IS NULL AND po.stage <> 'huy')
       AND ap.id = (SELECT ap2.id FROM public.approvals ap2
                     WHERE ap2.entity_type = 'purchase_requests' AND ap2.entity_id = pr.id AND ap2.deleted_at IS NULL
                     ORDER BY ap2.requested_at DESC LIMIT 1)
    UNION ALL
    SELECT COALESCE(sum(o.offered_value), 0)::bigint
      FROM public.subcontract_selections ss
      JOIN public.subcontract_offers o ON o.id = ss.selected_offer_id
      JOIN public.approvals ap ON ap.id = ss.approval_id AND ap.requested_at < p_before
     WHERE ss.construction_site_id = p_site_id AND ss.cost_code = p_cost_code AND ss.deleted_at IS NULL
       AND ss.status = 'cho_duyet'
       AND NOT (p_exclude_type = 'subcontract_selections' AND ss.id = p_exclude_id)
  )
  SELECT l.found, l.line_name, l.budgeted, l.committed, l.actual,
         (SELECT COALESCE(sum(amt), 0)::bigint FROM res),
         l.budgeted - l.committed - l.actual - (SELECT COALESCE(sum(amt), 0)::bigint FROM res)
    FROM line l;
$$;
REVOKE ALL ON FUNCTION public._budget_line_headroom(uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;

-- Chụp số dòng ngân sách lúc hồ sơ lên «Vượt ngân sách» — người duyệt đọc đúng số này.
CREATE TABLE IF NOT EXISTS public.budget_overrun_checks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id          uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  entity_type          varchar(40) NOT NULL,
  entity_id            uuid NOT NULL,
  cost_code            varchar(64) NOT NULL,
  line_name            text,
  budgeted             bigint NOT NULL,
  committed            bigint NOT NULL,
  actual               bigint NOT NULL,
  reserved             bigint NOT NULL,
  remaining            bigint NOT NULL,
  amount               bigint NOT NULL,
  overrun              bigint NOT NULL,
  tolerance_percent    numeric(6, 2),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_overrun_checks_approval_idx ON public.budget_overrun_checks (approval_id);
DROP TRIGGER IF EXISTS trg_transactional_company ON public.budget_overrun_checks;
CREATE TRIGGER trg_transactional_company BEFORE INSERT OR UPDATE OF company_id ON public.budget_overrun_checks
  FOR EACH ROW EXECUTE FUNCTION public.assert_transactional_company();
ALTER TABLE public.budget_overrun_checks ENABLE ROW LEVEL SECURITY;
-- Không mở quyền đọc thẳng: đọc qua `approval_budget_brief`.
COMMENT ON TABLE public.budget_overrun_checks IS
  'Số dòng ngân sách lúc hồ sơ (đề nghị mua / chọn thầu phụ) chuyển sang duyệt «Vượt ngân sách» (G4, 0249): dự trù, cam kết, thực tế, giữ chỗ, còn lại, số vượt, dung sai áp dụng.';

-- Một hồ sơ duyệt có vượt không. Trả NULL khi hồ sơ không gắn dòng ngân sách công trình.
CREATE OR REPLACE FUNCTION public._approval_overrun(
  p_entity_type text, p_entity_id uuid, p_amount bigint, p_before timestamptz,
  OUT site_id uuid, OUT cost_code text, OUT line_name text, OUT budgeted bigint, OUT committed bigint,
  OUT actual bigint, OUT reserved bigint, OUT remaining bigint, OUT allowed bigint, OUT overrun bigint,
  OUT tolerance numeric, OUT company_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h record;
BEGIN
  IF p_entity_type = 'purchase_requests' THEN
    SELECT pr.construction_site_id, pr.cost_code, pr.company_id INTO site_id, cost_code, company_id
      FROM public.purchase_requests pr WHERE pr.id = p_entity_id;
  ELSIF p_entity_type = 'subcontract_selections' THEN
    SELECT ss.construction_site_id, ss.cost_code, ss.company_id INTO site_id, cost_code, company_id
      FROM public.subcontract_selections ss WHERE ss.id = p_entity_id;
  END IF;
  IF site_id IS NULL OR NULLIF(btrim(COALESCE(cost_code, '')), '') IS NULL OR p_amount IS NULL THEN
    site_id := NULL;
    RETURN;
  END IF;
  SELECT * INTO h FROM public._budget_line_headroom(site_id, cost_code, p_before, p_entity_type, p_entity_id);
  IF NOT h.found THEN
    site_id := NULL;
    RETURN;
  END IF;
  line_name := h.line_name; budgeted := h.budgeted; committed := h.committed; actual := h.actual;
  reserved := h.reserved; remaining := h.remaining;
  -- Dung sai trống = 0: vượt một đồng cũng phải duyệt (coalesce đặt ở nơi gọi — CLAUDE.md 5.2).
  tolerance := public.system_parameter_number('tc.over_budget_tolerance_percent', 'company', company_id);
  allowed := h.remaining + COALESCE(floor(GREATEST(h.budgeted, 0) * tolerance / 100)::bigint, 0);
  overrun := GREATEST(p_amount - h.remaining, 0);
  IF p_amount <= allowed THEN
    overrun := 0;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._approval_overrun(text, uuid, bigint, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._record_overrun_check(
  p_approval_id uuid, p_entity_type text, p_entity_id uuid, p_amount bigint,
  p_company_id uuid, p_site_id uuid, p_cost_code text, p_line_name text, p_budgeted bigint,
  p_committed bigint, p_actual bigint, p_reserved bigint, p_remaining bigint, p_overrun bigint,
  p_tolerance numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.budget_overrun_checks (approval_id, company_id, construction_site_id, entity_type, entity_id,
                                            cost_code, line_name, budgeted, committed, actual, reserved, remaining,
                                            amount, overrun, tolerance_percent)
  VALUES (p_approval_id, p_company_id, p_site_id, p_entity_type, p_entity_id, p_cost_code, p_line_name,
          p_budgeted, p_committed, p_actual, p_reserved, p_remaining, p_amount, p_overrun, p_tolerance);
$$;
REVOKE ALL ON FUNCTION public._record_overrun_check(uuid, text, uuid, bigint, uuid, uuid, text, text, bigint, bigint, bigint, bigint, bigint, bigint, numeric) FROM PUBLIC, anon, authenticated;

-- Lúc mở hồ sơ duyệt: vượt thì đổi loại sang `over_budget` (cách 0244). Không chặn người gửi.
CREATE OR REPLACE FUNCTION public.approvals_over_budget_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  IF NOT ((NEW.entity_type = 'purchase_requests' AND NEW.subject::text = 'purchase_request')
          OR (NEW.entity_type = 'subcontract_selections' AND NEW.subject::text = 'subcontractor_selection'))
     OR NEW.status IS DISTINCT FROM 'pending_approval' THEN
    RETURN NEW;
  END IF;
  o := public._approval_overrun(NEW.entity_type, NEW.entity_id, NEW.amount, COALESCE(NEW.requested_at, now()));
  IF o.site_id IS NULL OR o.overrun <= 0 THEN
    RETURN NEW;
  END IF;
  NEW.subject := 'over_budget'::public.approval_subject;
  NEW.title := 'Vượt ngân sách — ' || NEW.title;
  NEW.reason := concat_ws(' ', NEW.reason,
    format('Vượt ngân sách dòng «%s» (%s): còn lại %s đồng, hồ sơ %s đồng, vượt %s đồng.',
           o.line_name, o.cost_code, to_char(o.remaining, 'FM999G999G999G999'),
           to_char(NEW.amount, 'FM999G999G999G999'), to_char(o.overrun, 'FM999G999G999G999')));
  PERFORM public._record_overrun_check(NEW.id, NEW.entity_type, NEW.entity_id, NEW.amount, o.company_id, o.site_id,
    o.cost_code, o.line_name, o.budgeted, o.committed, o.actual, o.reserved, o.remaining, o.overrun, o.tolerance);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS approvals_over_budget_route ON public.approvals;
CREATE TRIGGER approvals_over_budget_route
  BEFORE INSERT ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.approvals_over_budget_route();

-- Ngân sách đổi trong lúc chờ duyệt (đơn hàng khác cam kết, điều chỉnh giảm…): hồ sơ thường đang mở
-- mà nay vượt thì lên `over_budget`. Chỉ đi lên — không tự hạ.
CREATE OR REPLACE FUNCTION public._reroute_over_budget(p_site_id uuid, p_cost_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ap record;
  o  record;
BEGIN
  FOR ap IN
    SELECT a.* FROM public.approvals a
     WHERE a.status = 'pending_approval' AND a.deleted_at IS NULL
       AND ((a.entity_type = 'purchase_requests' AND a.subject::text = 'purchase_request'
             AND EXISTS (SELECT 1 FROM public.purchase_requests pr WHERE pr.id = a.entity_id
                          AND pr.construction_site_id = p_site_id AND pr.cost_code = p_cost_code))
            OR (a.entity_type = 'subcontract_selections' AND a.subject::text = 'subcontractor_selection'
                AND EXISTS (SELECT 1 FROM public.subcontract_selections ss WHERE ss.id = a.entity_id
                             AND ss.construction_site_id = p_site_id AND ss.cost_code = p_cost_code)))
     ORDER BY a.requested_at
  LOOP
    o := public._approval_overrun(ap.entity_type, ap.entity_id, ap.amount, ap.requested_at);
    IF o.site_id IS NOT NULL AND o.overrun > 0 THEN
      UPDATE public.approvals
         SET subject = 'over_budget'::public.approval_subject, title = 'Vượt ngân sách — ' || title,
             reason = concat_ws(' ', reason,
               format('Ngân sách dòng «%s» (%s) đổi trong lúc chờ duyệt: còn lại %s đồng, vượt %s đồng.',
                      o.line_name, o.cost_code, to_char(o.remaining, 'FM999G999G999G999'),
                      to_char(o.overrun, 'FM999G999G999G999'))),
             updated_at = now()
       WHERE id = ap.id;
      PERFORM public._record_overrun_check(ap.id, ap.entity_type, ap.entity_id, ap.amount, o.company_id, o.site_id,
        o.cost_code, o.line_name, o.budgeted, o.committed, o.actual, o.reserved, o.remaining, o.overrun, o.tolerance);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._reroute_over_budget(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.project_budgets_reroute_over_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.construction_site_id IS NOT NULL
     AND (NEW.budgeted_amount IS DISTINCT FROM OLD.budgeted_amount
          OR NEW.committed_amount IS DISTINCT FROM OLD.committed_amount
          OR NEW.actual_amount IS DISTINCT FROM OLD.actual_amount
          OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    PERFORM public._reroute_over_budget(NEW.construction_site_id, NEW.cost_code);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS project_budgets_reroute_over_budget ON public.project_budgets;
CREATE TRIGGER project_budgets_reroute_over_budget
  AFTER UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.project_budgets_reroute_over_budget();

-- Lưới an toàn lúc ĐỒNG Ý (cách 0244): hồ sơ loại thường mà nay vượt thì không duyệt được.
CREATE OR REPLACE FUNCTION public.approval_decisions_over_budget_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
  o record;
BEGIN
  IF NEW.decision <> 'approved' THEN RETURN NEW; END IF;
  SELECT subject::text AS subject, entity_type, entity_id, amount, requested_at INTO a
    FROM public.approvals WHERE id = NEW.approval_id;
  IF NOT ((a.entity_type = 'purchase_requests' AND a.subject = 'purchase_request')
          OR (a.entity_type = 'subcontract_selections' AND a.subject = 'subcontractor_selection')) THEN
    RETURN NEW;
  END IF;
  o := public._approval_overrun(a.entity_type, a.entity_id, a.amount, a.requested_at);
  IF o.site_id IS NOT NULL AND o.overrun > 0 THEN
    RAISE EXCEPTION 'Hồ sơ nay vượt ngân sách dòng «%» (vượt % đồng) — cần duyệt «Vượt ngân sách». Tải lại hộp thư.',
      o.line_name, to_char(o.overrun, 'FM999G999G999G999');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS approval_decisions_over_budget_gate ON public.approval_decisions;
CREATE TRIGGER approval_decisions_over_budget_gate
  BEFORE INSERT ON public.approval_decisions
  FOR EACH ROW EXECUTE FUNCTION public.approval_decisions_over_budget_gate();

-- Hộp duyệt đọc số dòng ngân sách của hồ sơ. Ai xem được: người duyệt được loại này, người gửi,
-- người xem được giá vốn / Thi công trong phạm vi công trình (gương quyền đọc `project_budgets`).
CREATE OR REPLACE FUNCTION public.approval_budget_brief(p_approval_id uuid)
RETURNS TABLE (site_code text, site_name text, cost_code text, line_name text, budgeted bigint,
               committed bigint, actual bigint, reserved bigint, remaining bigint, amount bigint,
               overrun bigint, tolerance_percent numeric, checked_at timestamptz,
               current_remaining bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  a record;
  c record;
BEGIN
  SELECT * INTO a FROM public.approvals WHERE id = p_approval_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM public.budget_overrun_checks k WHERE k.approval_id = p_approval_id
   ORDER BY k.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (public.rls_can_approve(a.subject, a.company_id, a.amount)
          OR a.requested_by = public.auth_user_id()
          OR (public.rls_company_access(c.company_id)
              AND (public.rls_sees_sensitive('cost')
                   OR (public.auth_can_edit_module('TC') AND public.rls_site_readable(c.construction_site_id))))) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.code::text, s.name, c.cost_code::text, c.line_name, c.budgeted, c.committed, c.actual, c.reserved,
         c.remaining, c.amount, c.overrun, c.tolerance_percent, c.created_at,
         (SELECT h.remaining FROM public._budget_line_headroom(c.construction_site_id, c.cost_code, a.requested_at,
                                                               c.entity_type, c.entity_id) h)
    FROM public.construction_sites s WHERE s.id = c.construction_site_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approval_budget_brief(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_budget_brief(uuid) TO authenticated;


-- ============================================================================
-- 5. Chọn thầu phụ được duyệt thì cam kết ngân sách (lấp chỗ thiếu của G2)
-- ============================================================================
ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS budget_commit_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed_to_budget bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_line_id uuid REFERENCES public.project_budgets(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.subcontractors.committed_to_budget IS
  'Phần cam kết ngân sách còn treo của tổ đội (G4, 0249): giá trị chọn thầu phụ đã duyệt trừ phần đã chi trả. Chi trả chuyển dần sang chi phí thực tế.';

CREATE OR REPLACE FUNCTION public.subcontract_selections_commit_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub    record;
  v_val  bigint;
  v_line uuid;
  v_paid bigint;
  v_rem  bigint;
BEGIN
  IF NOT (NEW.status = 'da_duyet' AND OLD.status IS DISTINCT FROM 'da_duyet' AND NEW.subcontractor_id IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO sub FROM public.subcontractors WHERE id = NEW.subcontractor_id FOR UPDATE;
  SELECT o.offered_value INTO v_val FROM public.subcontract_offers o WHERE o.id = NEW.selected_offer_id;
  SELECT pb.id INTO v_line FROM public.project_budgets pb
   WHERE pb.construction_site_id = NEW.construction_site_id AND pb.cost_code = NEW.cost_code
     AND pb.company_id = NEW.company_id AND pb.deleted_at IS NULL
   ORDER BY pb.created_at LIMIT 1;
  IF v_val IS NULL OR v_line IS NULL THEN
    RETURN NULL;
  END IF;
  -- Chọn lại cho tổ đã có: trả phần cam kết cũ còn treo, cam kết theo giá mới trừ phần đã chi.
  IF sub.committed_to_budget > 0 AND sub.budget_line_id IS NOT NULL THEN
    UPDATE public.project_budgets
       SET committed_amount = GREATEST(committed_amount - sub.committed_to_budget, 0), updated_at = now()
     WHERE id = sub.budget_line_id;
  END IF;
  v_paid := GREATEST(sub.budget_commit_total - sub.committed_to_budget, 0);
  v_rem := GREATEST(v_val - v_paid, 0);
  UPDATE public.project_budgets
     SET committed_amount = committed_amount + v_rem, updated_at = now()
   WHERE id = v_line;
  UPDATE public.subcontractors
     SET budget_commit_total = v_val, committed_to_budget = v_rem, budget_line_id = v_line
   WHERE id = sub.id;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS subcontract_selections_commit_budget ON public.subcontract_selections;
CREATE TRIGGER subcontract_selections_commit_budget
  AFTER UPDATE OF status ON public.subcontract_selections
  FOR EACH ROW EXECUTE FUNCTION public.subcontract_selections_commit_budget();

-- Chép bản 0043, thêm: khoản chi cho tổ đội có cam kết thì chuyển phần chi từ «đã cam kết» sang
-- «đã phát sinh» (như `record_delivery` làm với đơn hàng) — không đếm tiền hai lần.
CREATE OR REPLACE FUNCTION public.post_payment_to_budget(p_request_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  pr       record;
  a        record;
  v_posted bigint := 0;
  v_sub    uuid;
  sub      record;
  v_on_line bigint := 0;
  v_release bigint;
BEGIN
  SELECT * INTO pr FROM public.payment_requests WHERE id = p_request_id;

  IF pr.request_type = 'tam_ung' THEN
    RETURN 0;
  END IF;

  IF pr.purchase_order_id IS NOT NULL OR pr.delivery_id IS NOT NULL THEN
    RETURN 0;
  END IF;

  FOR a IN
    SELECT * FROM public.payment_request_allocations
     WHERE payment_request_id = p_request_id
       AND construction_site_id IS NOT NULL
       AND cost_code IS NOT NULL
  LOOP
    UPDATE public.project_budgets
       SET actual_amount = actual_amount + a.amount,
           updated_at = now(), updated_by = v_user
     WHERE construction_site_id = a.construction_site_id
       AND cost_code = a.cost_code
       AND company_id = pr.company_id
       AND deleted_at IS NULL;

    IF FOUND THEN
      v_posted := v_posted + a.amount;
    END IF;
  END LOOP;

  -- 0249: tổ đội / thầu phụ có cam kết từ lần chọn thầu phụ được duyệt.
  v_sub := COALESCE(pr.subcontractor_id,
                    (SELECT p.subcontractor_id FROM public.subcontract_periods p WHERE p.id = pr.subcontract_period_id));
  IF v_sub IS NOT NULL THEN
    SELECT * INTO sub FROM public.subcontractors WHERE id = v_sub FOR UPDATE;
    IF sub.committed_to_budget > 0 AND sub.budget_line_id IS NOT NULL THEN
      SELECT COALESCE(sum(al.amount), 0)::bigint INTO v_on_line
        FROM public.payment_request_allocations al
        JOIN public.project_budgets pb ON pb.id = sub.budget_line_id
       WHERE al.payment_request_id = p_request_id
         AND al.construction_site_id = pb.construction_site_id AND al.cost_code = pb.cost_code;
      v_release := LEAST(v_on_line, sub.committed_to_budget);
      IF v_release > 0 THEN
        UPDATE public.project_budgets
           SET committed_amount = GREATEST(committed_amount - v_release, 0), updated_at = now(), updated_by = v_user
         WHERE id = sub.budget_line_id;
        UPDATE public.subcontractors SET committed_to_budget = committed_to_budget - v_release WHERE id = sub.id;
      END IF;
    END IF;
  END IF;

  RETURN v_posted;
END;
$$;

COMMENT ON FUNCTION public.post_payment_to_budget(uuid) IS
  'Ghi chi phí thực tế của một khoản chi vào ngân sách công trình (KT-05). Bỏ qua khoản đã ghi ở Module MH và khoản tạm ứng. '
  'Khoản chi cho tổ đội có cam kết (chọn thầu phụ đã duyệt, 0249) thì trả phần cam kết tương ứng.';
REVOKE EXECUTE ON FUNCTION public.post_payment_to_budget(uuid) FROM authenticated, anon, public;


-- ============================================================================
-- 6. stage_readiness — chép NGUYÊN VĂN bản 0247, thêm hai dòng ở nhánh công trình
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
    SELECT id, value, stage, deleted_at INTO c FROM public.contracts WHERE id = p_id;
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
-- 7. decide_approval — chép NGUYÊN VĂN bản 0247, thêm nhánh `budget_adjustments`
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
  'Ghi quyết định phê duyệt và áp dụng hệ quả cho hồ sơ nguồn — MỘT cửa duy nhất cho mọi module (Webapp Flow 4.6). entity_type lạ thì raise (0088). Nhánh báo cáo khảo sát (0175), xoá mẫu công trình (0179), báo giá thuê + thuê nội bộ giàn giáo (0245), chọn thầu phụ (0246), quyết định tham gia gói thầu (0247), điều chỉnh ngân sách (0249).';


-- ============================================================================
-- 8. site_profit_loss_list — chép NGUYÊN VĂN bản 0198, thêm cột «lúc nhận việc»
-- ============================================================================
DROP FUNCTION IF EXISTS public.site_profit_loss_list(uuid);
CREATE OR REPLACE FUNCTION public.site_profit_loss_list(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  construction_site_id uuid,
  company_id           uuid,
  site_code            text,
  site_name            text,
  stage                text,
  contract_id          uuid,
  contract_code        text,
  contract_value       bigint,
  amendments_value     bigint,
  revenue_contract     bigint,
  accepted_revenue     bigint,
  collected_amount     bigint,
  budgeted_cost        bigint,
  actual_cost          bigint,
  committed_cost       bigint,
  profit_to_date       bigint,
  profit_forecast      bigint,
  -- 0249 (G4): «lúc nhận việc» — phiên bản lãi dự kiến hiện hành (site_profit_baselines).
  baseline_version         integer,
  baseline_reason          text,
  baseline_captured_at     timestamptz,
  baseline_selling_price   bigint,
  baseline_budget          bigint,
  baseline_profit          bigint,
  first_baseline_profit    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.site_profit_guard(p_company_id);
  PERFORM public.log_sensitive_access('profit', 'site_profit_loss_list', NULL, 'view', p_company_id);

  RETURN QUERY
  WITH accepted AS (
    SELECT ar.construction_site_id AS site_id, COALESCE(SUM(ar.value), 0)::bigint AS revenue
      FROM public.acceptance_records ar
     WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu' AND ar.deleted_at IS NULL
     GROUP BY ar.construction_site_id
  ),
  amend AS (
    SELECT a.contract_id, COALESCE(SUM(a.value_change), 0)::bigint AS total
      FROM public.contract_amendments a
     WHERE a.deleted_at IS NULL AND a.stage IN ('da_duyet', 'da_thuc_hien')
     GROUP BY a.contract_id
  ),
  costs AS (
    SELECT b.construction_site_id AS site_id,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS budgeted,
           COALESCE(SUM(b.actual_amount)    FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS actual,
           COALESCE(SUM(b.committed_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS committed
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL AND b.construction_site_id IS NOT NULL
     GROUP BY b.construction_site_id
  ),
  base AS (
    SELECT DISTINCT ON (pb.construction_site_id) pb.construction_site_id AS site_id, pb.version, pb.reason_kind,
           pb.captured_at, pb.selling_price, pb.approved_budget, pb.expected_profit
      FROM public.site_profit_baselines pb
     ORDER BY pb.construction_site_id, pb.version DESC
  ),
  first_base AS (
    SELECT pb.construction_site_id AS site_id, pb.expected_profit
      FROM public.site_profit_baselines pb WHERE pb.version = 1
  )
  SELECT s.id, s.company_id, s.code::text, s.name, s.stage::text, c.id, c.code::text,
         c.value, COALESCE(amend.total, 0),
         CASE WHEN c.value IS NULL THEN NULL ELSE c.value + COALESCE(amend.total, 0) END,
         COALESCE(accepted.revenue, 0), c.collected_amount,
         COALESCE(costs.budgeted, 0), COALESCE(costs.actual, 0), COALESCE(costs.committed, 0),
         CASE WHEN c.value IS NULL OR costs.site_id IS NULL THEN NULL
              ELSE COALESCE(accepted.revenue, 0) - COALESCE(costs.actual, 0) END,
         CASE WHEN c.value IS NULL OR costs.site_id IS NULL THEN NULL
              ELSE c.value + COALESCE(amend.total, 0) - (
                COALESCE(costs.actual, 0) + COALESCE(costs.committed, 0)
                + GREATEST(COALESCE(costs.budgeted, 0) - COALESCE(costs.actual, 0) - COALESCE(costs.committed, 0), 0)
              ) END,
         base.version, base.reason_kind::text, base.captured_at, base.selling_price, base.approved_budget,
         base.expected_profit, first_base.expected_profit
    FROM public.construction_sites s
    LEFT JOIN public.contracts c ON c.id = s.contract_id AND c.deleted_at IS NULL
    LEFT JOIN amend ON amend.contract_id = c.id
    LEFT JOIN accepted ON accepted.site_id = s.id
    LEFT JOIN costs ON costs.site_id = s.id
    LEFT JOIN base ON base.site_id = s.id
    LEFT JOIN first_base ON first_base.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.site_profit_loss_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_profit_loss_list(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
