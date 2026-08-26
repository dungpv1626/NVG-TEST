-- ============================================================================
-- Module TC — phân quyền và luồng nghiệp vụ thi công
--
-- Nguồn: PRD TC-01 → TC-08, Backend Schema 4.6, Webapp Flow 3.4.
--
-- ⚠️ MODULE ĐỊNH HƯỚNG (PRD Mục 1.2, Mục 10). Chỉ huy – Giám sát công trường chưa có
-- khảo sát trực tiếp. Mỗi chỗ suy luận đều ghi rõ `SUY LUẬN` kèm căn cứ.
--
-- Ba thứ phải đúng dù khảo sát có đổi gì đi nữa, vì chúng là ranh giới đã chốt ở tài liệu
-- khác chứ không phải giả định về cách công trường làm việc:
--
--  1. NGHIỆM THU LÀ CĂN CỨ THU TIỀN (TC-04) — nhưng chỉ nghiệm thu với CHỦ ĐẦU TƯ. Nghiệm
--     thu nội bộ hay nghiệm thu với tổ đội mà cũng báo Kế toán thu tiền thì hệ thống đi đòi
--     khách một khối lượng khách chưa từng ký.
--  2. NHẬT KÝ LÀ BẰNG CHỨNG (TC-08) — "phục vụ truy vết khi phát sinh tranh chấp trách
--     nhiệm". Nhật ký sửa lại được sau một tháng thì không truy vết được gì.
--  3. NGÂN SÁCH LÀ NGÂN SÁCH ĐÃ DUYỆT (TC-01, DA-09) — công trình nhận đúng bộ ngân sách
--     sinh ra từ bản dự toán đã phê duyệt, không phải một bảng Excel lập lại tại công trường.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bộ theo dõi chuẩn và các cột định danh bất biến (migration 0019)
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.construction_sites');
SELECT public.attach_audit_touch('public.site_logs');
SELECT public.attach_audit_touch('public.acceptance_records');
SELECT public.attach_audit_touch('public.subcontractors');
SELECT public.attach_audit_touch('public.warranties');
SELECT public.attach_audit_touch('public.warranty_claims');

CREATE TRIGGER construction_sites_freeze_identity
  BEFORE UPDATE ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

CREATE TRIGGER site_logs_freeze_identity
  BEFORE UPDATE ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'construction_site_id', 'logged_by'
  );

CREATE TRIGGER acceptance_records_freeze_identity
  BEFORE UPDATE ON public.acceptance_records
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'construction_site_id', 'acceptance_type'
  );

CREATE TRIGGER subcontractors_freeze_identity
  BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'construction_site_id'
  );

CREATE TRIGGER warranties_freeze_identity
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'construction_site_id'
  );

CREATE TRIGGER warranty_claims_freeze_identity
  BEFORE UPDATE ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'warranty_id'
  );

-- Bước của công trình và của biên bản nghiệm thu chỉ đổi qua hàm nghiệp vụ (migration 0028).
-- Không có dòng này thì một câu PATCH đặt thẳng `status = 'da_nghiem_thu'` sẽ tạo ra căn cứ
-- thu tiền mà không ai ký, không có thông báo nào cho Kế toán và không có dấu vết.
CREATE TRIGGER construction_sites_stage_guard
  BEFORE UPDATE ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'handed_over_at', 'contract_id', 'bidding_project_id', 'design_project_id'
  );

-- Vì sao ba cột nguồn dùng guard này chứ không phải `freeze_record_identity`: đổi được
-- chúng nghĩa là đổi được câu trả lời cho "công trình này tiêu ngân sách của ai", nên phải
-- chặn — nhưng khoá ngoại của chúng là `ON DELETE SET NULL`, và `freeze_record_identity`
-- chặn CẢ chính CSDL khi nó dọn dây theo khoá ngoại. Guard này chỉ chặn lệnh đến từ trình
-- duyệt (`current_user = 'authenticated'`), đúng thứ cần chặn.

CREATE TRIGGER acceptance_records_stage_guard
  BEFORE UPDATE ON public.acceptance_records
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'accepted_at'
  );


-- ----------------------------------------------------------------------------
-- 1. Điều kiện dùng chung cho bảng con
--
-- Năm bảng con (nhật ký, nghiệm thu, tổ đội, bảo hành, phản ánh) đều thừa hưởng phạm vi từ
-- công trình. Viết một lần ở đây để năm bảng không chép lại rồi lệch nhau — đúng cách DA,
-- TK và HD đã làm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_site_readable(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.construction_sites s
    WHERE s.id = p_site_id
      AND s.deleted_at IS NULL
      AND public.rls_company_access(s.company_id)
      AND public.auth_can_view_module('TC')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_site_writable(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.construction_sites s
    WHERE s.id = p_site_id
      AND s.deleted_at IS NULL
      AND public.rls_company_access(s.company_id)
      AND public.auth_can_edit_module('TC')
      -- Công trình đã kết thúc thì hồ sơ đóng lại: hết bảo hành rồi mà còn thêm được nhật
      -- ký và biên bản nghiệm thu thì con số quyết toán công trình không còn là con số cuối.
      AND s.stage <> 'hoan_thanh'
  );
$$;

COMMENT ON FUNCTION public.rls_site_writable(uuid) IS
  'Công trình còn thao tác được không: đúng pháp nhân, có quyền sửa module TC, chưa kết thúc.';


-- ----------------------------------------------------------------------------
-- 2. Công trình — Mẫu A (Backend Schema 4.6)
--
-- Không mở INSERT từ trình duyệt: công trình LUÔN sinh ra từ một hồ sơ đã có (hợp đồng đã
-- ký, hoặc bàn giao hồ sơ thiết kế), vì đó là chỗ ngân sách và giá trị hợp đồng đến từ. Cho
-- tạo tay thì lập tức có công trình không gắn ngân sách nào — và TC-05 không so được gì.
-- ----------------------------------------------------------------------------

ALTER TABLE public.construction_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.construction_sites FROM anon;
REVOKE ALL ON public.site_logs          FROM anon;
REVOKE ALL ON public.acceptance_records FROM anon;
REVOKE ALL ON public.subcontractors     FROM anon;
REVOKE ALL ON public.warranties         FROM anon;
REVOKE ALL ON public.warranty_claims    FROM anon;

REVOKE INSERT, DELETE ON public.construction_sites FROM authenticated;
REVOKE DELETE ON public.site_logs          FROM authenticated;
REVOKE DELETE ON public.acceptance_records FROM authenticated;
REVOKE DELETE ON public.subcontractors     FROM authenticated;
REVOKE DELETE ON public.warranties         FROM authenticated;
REVOKE DELETE ON public.warranty_claims    FROM authenticated;

CREATE POLICY construction_sites_select ON public.construction_sites
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('TC')
  );

CREATE POLICY construction_sites_update ON public.construction_sites
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('TC')
    AND stage <> 'hoan_thanh'
  )
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_edit_module('TC')
  );


-- ----------------------------------------------------------------------------
-- 3. Nhật ký công trường — Mẫu A, nhưng KHÔNG viết lại được (TC-02, TC-08)
--
-- TC-08 nói nhật ký "phục vụ truy vết khi phát sinh tranh chấp trách nhiệm với chủ đầu tư
-- hoặc đối tác". Một quyển nhật ký sửa được bất cứ lúc nào không phải bằng chứng — bên kia
-- chỉ cần hỏi "sửa lần cuối khi nào" là xong.
--
-- ⚠️ SUY LUẬN: 24 giờ là cửa sổ sửa mà đội triển khai đề xuất, đủ để chữa lỗi gõ và bổ sung
-- ảnh quên tải lên, không đủ để viết lại lịch sử. PRD không nêu con số này; chờ khảo sát
-- Chỉ huy – Giám sát công trường xác nhận.
--
-- Sửa được thì đúng người: người ĐÃ GHI, không phải bất kỳ ai trong ban công trường — vì
-- chữ ký dưới dòng nhật ký là của người đó.
-- ----------------------------------------------------------------------------

CREATE POLICY site_logs_select ON public.site_logs
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

CREATE POLICY site_logs_insert ON public.site_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_site_writable(construction_site_id)
    AND company_id = (
      SELECT s.company_id FROM public.construction_sites s WHERE s.id = construction_site_id
    )
  );

CREATE POLICY site_logs_update ON public.site_logs
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

CREATE OR REPLACE FUNCTION public.site_logs_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Hàm nghiệp vụ SECURITY DEFINER đi qua tự do (cùng cách nhận biết ở migration 0028).
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.auth_has_role('ADMIN') THEN
    RETURN NEW;
  END IF;

  IF OLD.logged_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION
      'Không sửa được nhật ký do người khác ghi. Ghi một mục nhật ký mới để bổ sung thông tin.';
  END IF;

  IF OLD.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION
      'Không sửa được nhật ký đã ghi quá 24 giờ. Ghi một mục nhật ký mới để bổ sung hoặc đính chính.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER site_logs_edit_window
  BEFORE UPDATE ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.site_logs_edit_window();

COMMENT ON FUNCTION public.site_logs_edit_window() IS
  'Nhật ký công trường chỉ người ghi sửa được, trong 24 giờ — để nhật ký còn giá trị truy vết (TC-08).';


-- Người ghi do CSDL đặt, không phải do lệnh gửi lên khai.
--
-- `logged_by` là chữ ký dưới dòng nhật ký, và `freeze_record_identity` khoá nó lại sau khi
-- ghi. Nếu nhận giá trị từ trình duyệt thì một câu INSERT khai tên đồng nghiệp là đủ để tạo
-- ra một dòng nhật ký mang chữ ký người khác, vĩnh viễn không sửa được — đúng thứ TC-08 phải
-- chống, vì nhật ký tồn tại để phân định trách nhiệm khi tranh chấp.
--
-- Cùng cách `touch_audit_columns` xử lý `created_by` (migration 0019): có phiên đăng nhập thì
-- GHI ĐÈ, không có phiên (seed, script quản trị qua kết nối trực tiếp) thì giữ giá trị được
-- khai — đó là đường duy nhất còn lại để dựng dữ liệu mẫu.
CREATE OR REPLACE FUNCTION public.site_logs_stamp_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.logged_by := COALESCE(public.auth_user_id(), NEW.logged_by);
  RETURN NEW;
END;
$$;

CREATE TRIGGER site_logs_stamp_author
  BEFORE INSERT ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.site_logs_stamp_author();

COMMENT ON FUNCTION public.site_logs_stamp_author() IS
  'Người ghi nhật ký lấy từ phiên đăng nhập, không nhận từ lệnh gửi lên — chữ ký dưới nhật ký phải là thật (TC-08).';


-- ----------------------------------------------------------------------------
-- 4. Biên bản nghiệm thu, tổ đội, bảo hành — Mẫu A qua công trình
-- ----------------------------------------------------------------------------

CREATE POLICY acceptance_records_select ON public.acceptance_records
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

-- Biên bản KHÔNG tạo thẳng từ trình duyệt: `record_acceptance` là nơi kiểm tra loại nghiệm
-- thu, cấp mã và báo Kế toán. Cho INSERT thẳng thì biên bản nghiệm thu chủ đầu tư có thể ra
-- đời mà Kế toán không bao giờ biết để thu tiền (TC-04).
REVOKE INSERT ON public.acceptance_records FROM authenticated;

CREATE POLICY acceptance_records_update ON public.acceptance_records
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_site_writable(construction_site_id)
    -- Đã nghiệm thu là đã ký với bên ngoài. Sửa giá trị sau khi ký nghĩa là con số Kế toán
    -- đang đòi khác con số hai bên đã thống nhất.
    AND status = 'nhap'
  )
  WITH CHECK (public.rls_site_writable(construction_site_id));

CREATE POLICY subcontractors_select ON public.subcontractors
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

CREATE POLICY subcontractors_insert ON public.subcontractors
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_site_writable(construction_site_id)
    AND company_id = (
      SELECT s.company_id FROM public.construction_sites s WHERE s.id = construction_site_id
    )
  );

CREATE POLICY subcontractors_update ON public.subcontractors
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

CREATE POLICY warranties_select ON public.warranties
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(construction_site_id));

CREATE POLICY warranties_insert ON public.warranties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_site_writable(construction_site_id)
    AND company_id = (
      SELECT s.company_id FROM public.construction_sites s WHERE s.id = construction_site_id
    )
  );

CREATE POLICY warranties_update ON public.warranties
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(construction_site_id))
  WITH CHECK (public.rls_site_writable(construction_site_id));

-- Phản ánh bảo hành đi qua hạng mục bảo hành, nên phải bắc thêm một nhịp tới công trình.
CREATE OR REPLACE FUNCTION public.rls_warranty_site(p_warranty_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.construction_site_id FROM public.warranties w
   WHERE w.id = p_warranty_id AND w.deleted_at IS NULL;
$$;

CREATE POLICY warranty_claims_select ON public.warranty_claims
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_readable(public.rls_warranty_site(warranty_id)));

CREATE POLICY warranty_claims_insert ON public.warranty_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_site_writable(public.rls_warranty_site(warranty_id))
    AND company_id = (
      SELECT w.company_id FROM public.warranties w WHERE w.id = warranty_id
    )
  );

CREATE POLICY warranty_claims_update ON public.warranty_claims
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_site_writable(public.rls_warranty_site(warranty_id)))
  WITH CHECK (public.rls_site_writable(public.rls_warranty_site(warranty_id)));


-- ----------------------------------------------------------------------------
-- 5. Sinh ngân sách thi công — một nơi duy nhất, dùng cho cả NVC và NVO
--
-- DA-09 đã có `generate_project_budget(uuid)` cho gói thầu. NVO làm trọn gói thiết kế +
-- thi công, không đi qua gói thầu, nhưng vẫn cần TC-05 so chi phí với ngân sách — nên phần
-- sinh dòng ngân sách được tách ra dùng chung, đúng cách bộ máy dự toán đã được dùng chung
-- ở migration 0024. Hai bản sao của cùng công thức là hai bộ số lệch nhau sau lần sửa đầu.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_budget_lines(
  p_bidding_project_id uuid,
  p_design_project_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  e         record;
  v_rows    integer;
BEGIN
  IF num_nonnulls(p_bidding_project_id, p_design_project_id) <> 1 THEN
    RAISE EXCEPTION 'Ngân sách phải thuộc đúng một hồ sơ: gói thầu hoặc dự án thiết kế.';
  END IF;

  SELECT company_id INTO v_company
    FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF v_company IS NULL THEN
    SELECT company_id INTO v_company
      FROM public.design_projects
     WHERE id = p_design_project_id AND deleted_at IS NULL;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn của ngân sách.';
  END IF;

  -- Chỉ bản dự toán ĐANG HIỆU LỰC và ĐÃ DUYỆT mới thành ngân sách (DA-09, PRD Mục 7).
  SELECT * INTO e FROM public.estimates
   WHERE (p_bidding_project_id IS NOT NULL AND bidding_project_id = p_bidding_project_id
          OR p_design_project_id IS NOT NULL AND design_project_id = p_design_project_id)
     AND is_current_version AND deleted_at IS NULL AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có bản dự toán được phê duyệt để chuyển thành ngân sách.';
  END IF;

  -- Chi phí trực tiếp: gộp theo nhóm từ các dòng dự toán, giữ nguyên cách phân nhóm của
  -- người lập giá thay vì tự chia lại.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id, i.cost_group,
         upper(i.cost_group::text),
         initcap(replace(i.cost_group::text, '_', ' ')),
         sum(i.amount)
    FROM public.estimate_items i
   WHERE i.estimate_id = e.id AND i.deleted_at IS NULL
   GROUP BY i.cost_group;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Các khoản không nằm trong dòng chi tiết nhưng DA-09 liệt kê thành mã chi phí riêng.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id,
         g.cost_group, g.cost_code, g.name, g.amount
    FROM (
      VALUES
        ('chi_phi_chung'::cost_group, 'CHI_PHI_CHUNG', 'Chi phí chung', COALESCE(e.overhead_cost, 0)),
        ('du_phong'::cost_group,      'DU_PHONG',      'Dự phòng rủi ro', COALESCE(e.contingency_cost, 0)),
        ('loi_nhuan'::cost_group,     'LOI_NHUAN',     'Lợi nhuận mục tiêu', COALESCE(e.profit_amount, 0))
    ) AS g(cost_group, cost_code, name, amount)
   WHERE g.amount > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_budgets b
       WHERE b.cost_code = g.cost_code AND b.deleted_at IS NULL
         AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
         AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id)
     );

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.build_budget_lines(uuid, uuid) IS
  'Chuyển bản dự toán đã duyệt thành dòng ngân sách theo nhóm chi phí — dùng chung cho gói thầu (DA-09) và dự án thiết kế NVO (TC-01).';

-- Hàm NỘI BỘ: không kiểm quyền vì hai hàm gọi nó đã kiểm rồi. Mọi hàm `SECURITY DEFINER`
-- mặc định gọi được qua PostgREST (`POST /rest/v1/rpc/…`), nên không thu quyền lại thì bất
-- kỳ ai đăng nhập cũng sinh được ngân sách cho gói thầu của pháp nhân khác.
REVOKE EXECUTE ON FUNCTION public.build_budget_lines(uuid, uuid) FROM authenticated, anon, public;


-- `generate_project_budget` giữ nguyên chữ ký và mọi điều kiện của DA-09; phần sinh dòng
-- chuyển sang hàm dùng chung ở trên.
CREATE OR REPLACE FUNCTION public.generate_project_budget(p_bidding_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  p       record;
  v_rows  integer;
BEGIN
  SELECT * INTO p FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('DA') THEN
    RAISE EXCEPTION 'Không thao tác được trên gói thầu này.';
  END IF;

  IF p.stage <> 'trung_thau' THEN
    RAISE EXCEPTION 'Chỉ lập ngân sách thi công sau khi trúng thầu.';
  END IF;

  IF p.budget_generated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ngân sách thi công đã được lập cho gói thầu này.';
  END IF;

  v_rows := public.build_budget_lines(p_bidding_project_id, NULL);

  UPDATE public.bidding_projects
     SET budget_generated_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_bidding_project_id;

  -- Bàn giao là phải có người BIẾT mà nhận (PRD DA-09, NEN-03).
  PERFORM public.create_notification(
    u.id, p.company_id, 'budget_handover',
    format('Ngân sách thi công của gói thầu %s đã được bàn giao.', p.code),
    'bidding_projects', p.id,
    format('/da/goi-thau/%s?tab=ngan-sach', p.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p.company_id
    AND (r.code IN ('TC', 'DA_DT') OR u.id = p.responsible_user_id);

  RETURN v_rows;
END;
$$;


-- Ngân sách vừa có thêm một hồ sơ cha, nên cột đó cũng phải bất biến: đổi được
-- `design_project_id` sau khi tạo là chuyển cả cụm ngân sách sang dự án khác — và lãi/lỗ
-- của hai dự án cùng sai một lúc. `construction_site_id` KHÔNG khoá: nó được gắn sau, ở
-- bước mở công trình.
DROP TRIGGER IF EXISTS project_budgets_freeze_identity ON public.project_budgets;
CREATE TRIGGER project_budgets_freeze_identity
  BEFORE UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'bidding_project_id', 'design_project_id'
  );


-- ----------------------------------------------------------------------------
-- 6. Mở công trình (TC-01)
--
-- Công trình luôn sinh ra từ một hồ sơ đã có, không nhập tay. Hai đường vào:
--   - NVC/NVS: hợp đồng thi công ĐÃ KÝ (HD-05 → TC-01).
--   - NVO: bàn giao hồ sơ thiết kế cho Ban công trường (TK-08 → TC-01).
--
-- Cả hai đường đều đổ về hàm này để việc gắn ngân sách và thông báo cho ban công trường chỉ
-- viết một lần.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_construction_site(
  p_company_id uuid,
  p_name text,
  p_contract_id uuid DEFAULT NULL,
  p_bidding_project_id uuid DEFAULT NULL,
  p_design_project_id uuid DEFAULT NULL,
  p_site_address text DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL,
  p_planned_end_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
  v_site_id      uuid;
  v_code         text;
  v_attached     integer := 0;
BEGIN
  SELECT code INTO v_company_code FROM public.companies WHERE id = p_company_id;
  IF v_company_code IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy pháp nhân của công trình.';
  END IF;

  v_code := public.next_record_code(v_company_code, 'CT');

  INSERT INTO public.construction_sites (
    company_id, code, name, contract_id, bidding_project_id, design_project_id,
    site_address, responsible_user_id, planned_start_date, planned_end_date
  )
  VALUES (
    p_company_id, v_code, p_name, p_contract_id, p_bidding_project_id, p_design_project_id,
    p_site_address, p_responsible_user_id, p_planned_start_date, p_planned_end_date
  )
  RETURNING id INTO v_site_id;

  -- Gắn ngân sách đã duyệt vào công trình (TC-01). Với gói thầu, DA-09 thường đã sinh sẵn
  -- các dòng ngân sách lúc trúng thầu — chỉ cần gắn. Với dự án thiết kế NVO thì chưa có
  -- bước nào sinh, nên sinh tại đây từ bản dự toán đã duyệt.
  IF p_bidding_project_id IS NOT NULL OR p_design_project_id IS NOT NULL THEN
    SELECT count(*) INTO v_attached
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL
       AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
       AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id);

    IF v_attached = 0 THEN
      -- Chưa có dự toán được duyệt thì mở công trình vẫn phải chạy: hồ sơ thi công đã bàn
      -- giao, ban công trường phải bắt đầu ghi nhật ký được. Thiếu ngân sách hiện ra ở tab
      -- Ngân sách như một trạng thái rỗng có hướng xử lý, không phải một lỗi chặn luồng.
      BEGIN
        PERFORM public.build_budget_lines(p_bidding_project_id, p_design_project_id);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    UPDATE public.project_budgets
       SET construction_site_id = v_site_id, updated_at = now()
     WHERE deleted_at IS NULL
       AND construction_site_id IS NULL
       AND (bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
       AND (design_project_id  IS NOT DISTINCT FROM p_design_project_id);
  END IF;

  -- Ban công trường phải BIẾT là có công trình để nhận (NEN-03) — cùng nguyên tắc DA-09,
  -- TK-08. Webapp Flow 3.4 bước 1 đi thẳng từ Trung tâm Thông báo vào Chi tiết Công trình.
  PERFORM public.create_notification(
    u.id, p_company_id, 'site_opened',
    format('Công trình %s đã được mở, hồ sơ và ngân sách thi công đã sẵn sàng.', v_code),
    'construction_sites', v_site_id,
    format('/tc/cong-trinh/%s', v_site_id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p_company_id
    AND (r.code IN ('TC', 'MH', 'KT') OR u.id = p_responsible_user_id);

  RETURN v_site_id;
END;
$$;

COMMENT ON FUNCTION public.open_construction_site(uuid, text, uuid, uuid, uuid, text, uuid, date, date) IS
  'Mở công trình từ hợp đồng đã ký hoặc hồ sơ thiết kế đã bàn giao, gắn ngân sách đã duyệt và báo ban công trường (TC-01).';

-- Cùng lý do với `build_budget_lines`: hàm này không kiểm quyền, điều kiện nằm ở hai hàm
-- gọi nó (`open_site_from_contract`, `handover_design_to_construction`). Để mở thì ai đăng
-- nhập cũng mở được công trình ở pháp nhân bất kỳ, bỏ qua toàn bộ điều kiện "hợp đồng đã ký".
REVOKE EXECUTE ON FUNCTION public.open_construction_site(uuid, text, uuid, uuid, uuid, text, uuid, date, date)
  FROM authenticated, anon, public;


-- Đường vào cho người dùng: mở công trình từ một hợp đồng đã ký.
CREATE OR REPLACE FUNCTION public.open_site_from_contract(
  p_contract_id uuid,
  p_name text DEFAULT NULL,
  p_site_address text DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL,
  p_planned_end_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_bid    uuid;
  v_design uuid;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT (public.auth_can_edit_module('TC') OR public.auth_can_edit_module('HD')) THEN
    RAISE EXCEPTION 'Không mở được công trình từ hợp đồng này.';
  END IF;

  -- Mở công trình trước khi ký nghĩa là bắt đầu tiêu ngân sách của một hợp đồng có thể
  -- không bao giờ được ký.
  IF c.stage <> 'da_ky' THEN
    RAISE EXCEPTION 'Chỉ mở công trình sau khi hợp đồng đã được ký.';
  END IF;

  -- Hợp đồng khoán/thầu phụ là hợp đồng NVG đi THUÊ, nằm bên trong một công trình đã có —
  -- nó không sinh ra công trình mới (xem `subcontractors.contract_id`).
  IF c.type = 'khoan_thau_phu' THEN
    RAISE EXCEPTION 'Hợp đồng khoán tổ đội không mở ra công trình mới. Gắn hợp đồng này vào tổ đội của công trình đang thi công.';
  END IF;

  -- Một hợp đồng mở MỘT công trình.
  --
  -- ⚠️ SUY LUẬN có chủ đích. Lược đồ cho phép nhiều công trình trên một hợp đồng (hợp đồng
  -- chia nhiều hạng mục, nhiều địa điểm là chuyện có thật), nhưng chưa có khảo sát Chỉ huy –
  -- Giám sát công trường để biết NVG có làm vậy không. Trong khi chờ, rủi ro thật và hay gặp
  -- hơn nhiều là bấm nút hai lần rồi có hai công trình song song cùng chia nhau một bộ ngân
  -- sách — và không ai phát hiện cho tới lúc đối chiếu lãi/lỗ. Khi khảo sát xác nhận cần
  -- nhiều công trình, thêm một tham số cho phép tường minh, đừng bỏ hẳn kiểm tra này.
  IF EXISTS (
    SELECT 1 FROM public.construction_sites s
     WHERE s.contract_id = p_contract_id AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Hợp đồng này đã có công trình. Mở công trình đó để tiếp tục thi công.';
  END IF;

  IF c.source_type = 'bidding_projects' THEN
    v_bid := c.source_id;
  ELSIF c.source_type = 'design_projects' THEN
    v_design := c.source_id;
  END IF;

  RETURN public.open_construction_site(
    c.company_id,
    COALESCE(NULLIF(btrim(p_name), ''), c.title),
    c.id, v_bid, v_design,
    p_site_address,
    COALESCE(p_responsible_user_id, c.responsible_user_id),
    COALESCE(p_planned_start_date, c.start_date),
    COALESCE(p_planned_end_date, c.end_date)
  );
END;
$$;

COMMENT ON FUNCTION public.open_site_from_contract(uuid, text, text, uuid, date, date) IS
  'Mở công trình từ hợp đồng đã ký — đường vào TC-01 cho NVC/NVS (Webapp Flow 3.4 bước 1).';


-- ----------------------------------------------------------------------------
-- 7. NVO: bàn giao hồ sơ thiết kế thì mở luôn công trình (TK-08 → TC-01)
--
-- Migration 0025 để sẵn chỗ này: "cột `construction_site_id` đã khai sẵn ở `design_projects`,
-- migration của TC chỉ cần thêm khoá ngoại và một dòng INSERT vào hàm này". Khoá ngoại đã
-- thêm ở 0034; phần còn lại nằm dưới đây. Toàn bộ điều kiện kiểm tra đồng bộ đa bộ môn của
-- TK-08 giữ nguyên không đổi.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handover_design_to_construction(p_design_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  p          record;
  v_blocking integer;
  v_first    text;
  v_notified integer;
  v_site_id  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('TK') THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này.';
  END IF;

  IF p.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hồ sơ của dự án này đã bàn giao cho Ban công trường.';
  END IF;

  -- TK-08: "kiểm tra tính đầy đủ và đồng bộ giữa các bộ môn TRƯỚC KHI phát hành cho Ban
  -- công trường". Kiểm tra ở CSDL chứ không ở giao diện: gọi thẳng hàm này qua PostgREST
  -- vẫn phải đi qua đúng bộ điều kiện đó.
  SELECT count(*), min(s.message) INTO v_blocking, v_first
    FROM public.check_design_sync(p_design_project_id) s
   WHERE s.blocking;

  IF v_blocking > 0 THEN
    RAISE EXCEPTION 'Hồ sơ chưa đồng bộ, còn % hạng mục phải xử lý. Ví dụ: %', v_blocking, v_first;
  END IF;

  -- Mở công trình để Ban công trường có chỗ ghi nhật ký và theo ngân sách ngay khi nhận
  -- bàn giao (TC-01). NVO làm trọn gói nên không có gói thầu nào ở giữa.
  v_site_id := public.open_construction_site(
    p.company_id,
    p.name,
    NULL, NULL, p_design_project_id,
    p.site_address,
    p.responsible_user_id,
    NULL, NULL
  );

  UPDATE public.design_projects
     SET handed_over_at = now(), stage = 'ban_giao',
         construction_site_id = v_site_id,
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;

  -- Bàn giao là phải có người BIẾT mà nhận (NEN-03) — cùng nguyên tắc với DA-09.
  SELECT count(*) INTO v_notified
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_handover',
      format('Hồ sơ thi công của dự án thiết kế %s đã bàn giao.', p.code),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TC', 'DA_DT', 'KD') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_notified;
END;
$$;

COMMENT ON FUNCTION public.handover_design_to_construction(uuid) IS
  'Bàn giao hồ sơ thi công sau khi kiểm tra đồng bộ đa bộ môn, mở luôn công trình cho Ban công trường — TK-08 → TC-01.';


-- `construction_site_id` của dự án thiết kế do hàm bàn giao đặt, không đặt tay được: đổi
-- nó là đổi câu trả lời cho "bản vẽ này đang được thi công ở đâu".
CREATE TRIGGER design_projects_site_guard
  BEFORE UPDATE ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only('construction_site_id');


-- ----------------------------------------------------------------------------
-- 8. Chuyển bước công trình
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_site_stage(
  p_site_id uuid,
  p_stage site_stage,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  s      record;
  v_open integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT public.auth_can_edit_module('TC') THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;

  -- Bảng chuyển bước giữ đúng bản trong `@nvg/shared/tc` (SITE_STAGE_TRANSITIONS). Hai nơi
  -- vì hai lớp: giao diện ẩn nút không hợp lệ, CSDL chặn đường vòng qua PostgREST.
  IF NOT (
    (s.stage = 'chuan_bi'      AND p_stage IN ('dang_thi_cong', 'tam_dung'))
    OR (s.stage = 'dang_thi_cong' AND p_stage IN ('nghiem_thu', 'tam_dung'))
    OR (s.stage = 'nghiem_thu'    AND p_stage IN ('bao_hanh', 'hoan_thanh', 'tam_dung'))
    OR (s.stage = 'bao_hanh'      AND p_stage = 'hoan_thanh')
    OR (s.stage = 'tam_dung'      AND p_stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu'))
  ) THEN
    RAISE EXCEPTION 'Không chuyển được công trình từ bước hiện tại sang bước đã chọn.';
  END IF;

  IF p_stage = 'tam_dung' AND COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân tạm dừng thi công.';
  END IF;

  -- Bàn giao cho chủ đầu tư mà chưa có biên bản nghiệm thu nào với chủ đầu tư thì Kế toán
  -- không có căn cứ nào để thu tiền (TC-04) — và công trình coi như xong trên hệ thống
  -- trong khi hợp đồng vẫn còn treo.
  IF p_stage IN ('bao_hanh', 'hoan_thanh') AND s.stage = 'nghiem_thu' THEN
    SELECT count(*) INTO v_open
      FROM public.acceptance_records a
     WHERE a.construction_site_id = p_site_id
       AND a.deleted_at IS NULL
       AND a.acceptance_type = 'khach_hang'
       AND a.status = 'da_nghiem_thu';

    IF v_open = 0 THEN
      RAISE EXCEPTION 'Chưa có biên bản nghiệm thu với chủ đầu tư. Lập biên bản nghiệm thu trước khi bàn giao công trình.';
    END IF;
  END IF;

  UPDATE public.construction_sites
     SET stage = p_stage,
         pause_reason  = CASE WHEN p_stage = 'tam_dung' THEN btrim(p_reason) ELSE pause_reason END,
         actual_start_date = CASE WHEN p_stage = 'dang_thi_cong' AND actual_start_date IS NULL
                                  THEN current_date ELSE actual_start_date END,
         actual_end_date   = CASE WHEN p_stage IN ('bao_hanh', 'hoan_thanh') AND actual_end_date IS NULL
                                  THEN current_date ELSE actual_end_date END,
         handed_over_at    = CASE WHEN p_stage = 'bao_hanh' AND handed_over_at IS NULL
                                  THEN now() ELSE handed_over_at END,
         updated_at = now(), updated_by = v_user
   WHERE id = p_site_id;
END;
$$;

COMMENT ON FUNCTION public.move_site_stage(uuid, site_stage, text) IS
  'Chuyển bước công trình theo đúng thứ tự, kèm điều kiện của từng bước (TC-01, TC-04).';


-- ----------------------------------------------------------------------------
-- 9. Nghiệm thu (TC-04) — `POST /api/construction-sites/:id/acceptance`
--
-- Backend Schema 4.6 đặc tả endpoint này ở Workers. Ở đây làm bằng hàm CSDL vì nghiệp vụ
-- không gọi dịch vụ bên ngoài và không cần logic ngoài tầm với của Postgres — đúng quy tắc
-- chọn lớp ở CLAUDE.md 3.1: chỉ dựng endpoint Workers khi thật sự cần. Hàm này vẫn ghi
-- nhiều bảng trong CÙNG một giao dịch (biên bản + thông báo Kế toán), là điều kiện (b).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_site_id uuid,
  p_acceptance_type acceptance_type,
  p_stage_name text,
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
  v_user         uuid := public.auth_user_id();
  s              record;
  v_company_code text;
  v_id           uuid;
  v_code         text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT public.auth_can_edit_module('TC') THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;

  IF s.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc, không lập thêm biên bản nghiệm thu.';
  END IF;

  IF COALESCE(btrim(p_stage_name), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập giai đoạn hoặc hạng mục được nghiệm thu.';
  END IF;

  IF p_acceptance_type = 'thau_phu' AND p_subcontractor_id IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn tổ đội được nghiệm thu.';
  END IF;

  IF p_subcontractor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcontractors sc
     WHERE sc.id = p_subcontractor_id AND sc.construction_site_id = p_site_id
       AND sc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tổ đội được chọn không thuộc công trình này.';
  END IF;

  -- Nghiệm thu với chủ đầu tư là căn cứ đòi tiền (TC-04) — không có số tiền thì Kế toán
  -- không biết đòi bao nhiêu.
  IF p_acceptance_type = 'khach_hang' AND COALESCE(p_value, 0) <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị khối lượng được nghiệm thu để Kế toán có căn cứ thu tiền.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = s.company_id;
  v_code := public.next_record_code(v_company_code, 'NT');

  INSERT INTO public.acceptance_records (
    company_id, construction_site_id, code, acceptance_type, status,
    stage_name, scope, value, subcontractor_id,
    accepted_date, accepted_at, accepted_by, counterpart_signed_by, outstanding_issues
  )
  VALUES (
    s.company_id, p_site_id, v_code, p_acceptance_type, 'da_nghiem_thu',
    btrim(p_stage_name), p_scope, p_value, p_subcontractor_id,
    COALESCE(p_accepted_date, current_date), now(), v_user,
    NULLIF(btrim(COALESCE(p_counterpart_signed_by, '')), ''), p_outstanding_issues
  )
  RETURNING id INTO v_id;

  -- TC-04 nguyên văn: "biên bản nghiệm thu là căn cứ để Kế toán thông báo thu tiền theo hợp
  -- đồng". Chỉ với chủ đầu tư — xem ghi chú ở đầu migration.
  IF p_acceptance_type = 'khach_hang' THEN
    PERFORM public.create_notification(
      u.id, s.company_id, 'acceptance_billing',
      format('Công trình %s đã nghiệm thu %s với chủ đầu tư, giá trị %s đồng — đủ căn cứ thu tiền theo hợp đồng.',
             s.code, btrim(p_stage_name), to_char(p_value, 'FM999,999,999,999')),
      'acceptance_records', v_id,
      format('/tc/cong-trinh/%s?tab=nghiem-thu', p_site_id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = s.company_id
      AND r.code IN ('KT', 'CFO');
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_acceptance(uuid, acceptance_type, text, bigint, text, date, uuid, text, text) IS
  'Lập biên bản nghiệm thu; nghiệm thu với chủ đầu tư tự báo Kế toán để thu tiền (TC-04, Backend Schema 4.6).';


CREATE OR REPLACE FUNCTION public.cancel_acceptance(p_acceptance_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  SELECT * INTO a FROM public.acceptance_records
   WHERE id = p_acceptance_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_site_writable(a.construction_site_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên biên bản nghiệm thu này.';
  END IF;

  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân hủy biên bản nghiệm thu.';
  END IF;

  IF a.status = 'huy' THEN
    RAISE EXCEPTION 'Biên bản này đã được hủy.';
  END IF;

  UPDATE public.acceptance_records
     SET status = 'huy', cancel_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_acceptance_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_acceptance(uuid, text) IS
  'Hủy một biên bản nghiệm thu kèm nguyên nhân — biên bản không bị xóa, vẫn truy vết được (TC-08).';


-- ----------------------------------------------------------------------------
-- 10. Ngân sách so với thực tế (TC-05) — `GET /api/construction-sites/:id/budget-status`
--
-- Trả về theo TỪNG MÃ CHI PHÍ chứ không phải một con số tổng: PRD DA-09 nhấn mạnh "bàn giao
-- đầy đủ hồ sơ, không chỉ một file tổng giá", và cảnh báo vượt chỉ hữu ích khi chỉ đúng
-- nhóm đang vượt.
--
-- Dòng "lợi nhuận mục tiêu" bị loại cho vai trò không được xem lợi nhuận — cùng ranh giới
-- Mẫu D mà `project_budgets_select` đang giữ. Không loại thì chỉ huy trưởng đọc được tỷ
-- suất lợi nhuận của công trình mình qua đường vòng này.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.construction_budget_status(p_site_id uuid)
RETURNS TABLE (
  cost_group       cost_group,
  cost_code        text,
  name             text,
  budgeted_amount  bigint,
  actual_amount    bigint,
  committed_amount bigint,
  engaged_amount   bigint,
  remaining_amount bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.cost_group,
         b.cost_code::text,
         b.name,
         b.budgeted_amount,
         b.actual_amount,
         b.committed_amount,
         b.actual_amount + b.committed_amount            AS engaged_amount,
         b.budgeted_amount - b.actual_amount - b.committed_amount AS remaining_amount
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id
     AND b.deleted_at IS NULL
     AND public.rls_site_readable(p_site_id)
     AND (b.cost_group <> 'loi_nhuan' OR public.rls_sees_sensitive('profit'))
   ORDER BY b.cost_group, b.cost_code;
$$;

COMMENT ON FUNCTION public.construction_budget_status(uuid) IS
  'Ngân sách công trình so với chi phí đã phát sinh và đã cam kết, theo từng mã chi phí (TC-05).';


-- ----------------------------------------------------------------------------
-- 11. Cảnh báo sớm vượt ngân sách (TC-05, NEN-04)
--
-- Cảnh báo phát khi ĐÃ PHÁT SINH + ĐÃ CAM KẾT vượt ngưỡng, không đợi tới lúc đã vượt: đơn
-- hàng đã ký mà chưa có hoá đơn vẫn là tiền chắc chắn phải trả. Chỉ nhìn chi phí đã ghi sổ
-- thì cảnh báo luôn đến sau khi tiền đã tiêu — tức là không còn sớm.
--
-- ⚠️ SUY LUẬN: ngưỡng 90% do đội triển khai đề xuất (trùng `BUDGET_WARNING_THRESHOLD` ở
-- `@nvg/shared/tc`); PRD TC-05 chỉ nói "cảnh báo sớm", không nói bao nhiêu phần trăm.
--
-- Chỉ báo khi VỪA VƯỢT ngưỡng, không báo lại ở mỗi lần ghi chi phí sau đó — Content
-- Guidelines 3.4 cấm lặp thông báo đã xử lý, và cảnh báo lặp là cách nhanh nhất khiến người
-- ta bỏ qua mọi cảnh báo.
--
-- Module MH/KHO/KT của Giai đoạn 2 là nơi cập nhật `actual_amount`/`committed_amount`; tới
-- lúc đó trigger này đã sẵn sàng, không phải sửa lại.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.budget_overrun_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          record;
  v_before   numeric;
  v_after    numeric;
  v_threshold constant numeric := 0.9;
BEGIN
  IF NEW.construction_site_id IS NULL OR NEW.budgeted_amount IS NULL OR NEW.budgeted_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_before := (COALESCE(OLD.actual_amount, 0) + COALESCE(OLD.committed_amount, 0))::numeric
              / NEW.budgeted_amount;
  v_after  := (COALESCE(NEW.actual_amount, 0) + COALESCE(NEW.committed_amount, 0))::numeric
              / NEW.budgeted_amount;

  IF v_before >= v_threshold OR v_after < v_threshold THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = NEW.construction_site_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    u.id, s.company_id, 'budget_exceeded',
    format('Công trình %s: mã chi phí %s đã dùng %s%% ngân sách (gồm cả phần đã cam kết).',
           s.code, NEW.cost_code, round(v_after * 100)),
    'construction_sites', s.id,
    format('/tc/cong-trinh/%s?tab=ngan-sach', s.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = s.company_id
    AND (r.code IN ('TC', 'CFO', 'TGD') OR u.id = s.responsible_user_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER project_budgets_overrun_alert
  AFTER UPDATE OF actual_amount, committed_amount ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.budget_overrun_alert();

COMMENT ON FUNCTION public.budget_overrun_alert() IS
  'Cảnh báo sớm khi chi phí đã phát sinh + đã cam kết vượt 90% ngân sách của một mã chi phí (TC-05, NEN-04).';


-- ----------------------------------------------------------------------------
-- 12. Bảo hành (TC-07)
--
-- Ngày hết hạn tính từ ngày bàn giao + số tháng theo hợp đồng, tính ở CSDL để hai màn hình
-- không ra hai ngày khác nhau. Đặt tay `warranty_until` vẫn được — có hạng mục thoả thuận
-- riêng, và hàm này không có cách nào biết trước.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.warranties_fill_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_handover timestamptz;
BEGIN
  IF NEW.start_date IS NULL THEN
    SELECT s.handed_over_at INTO v_handover
      FROM public.construction_sites s WHERE s.id = NEW.construction_site_id;
    NEW.start_date := COALESCE(v_handover::date, current_date);
  END IF;

  IF NEW.warranty_until IS NULL AND NEW.duration_months IS NOT NULL THEN
    NEW.warranty_until := (NEW.start_date + make_interval(months => NEW.duration_months))::date;
  END IF;

  -- Trạng thái phải khớp với ngày: một hạng mục ghi "còn hạn" mà ngày hết hạn đã qua là
  -- đúng thứ sẽ bị chủ đầu tư chỉ ra trong biên bản.
  IF NEW.warranty_until IS NOT NULL AND NEW.warranty_until < current_date
     AND NEW.status = 'con_han' THEN
    NEW.status := 'het_han';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER warranties_fill_dates
  BEFORE INSERT OR UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.warranties_fill_dates();

COMMENT ON FUNCTION public.warranties_fill_dates() IS
  'Tính ngày hết hạn bảo hành từ ngày bàn giao và thời hạn hợp đồng, giữ trạng thái khớp với ngày (TC-07).';


-- Hạng mục đang có phản ánh chưa xử lý xong thì trạng thái bảo hành phải nói ra điều đó —
-- TC-07 yêu cầu theo dõi "tiếp nhận phản ánh, phân công xử lý"; một hạng mục vẫn hiện "còn
-- hạn" trong khi khách đang chờ sửa là chỗ việc bị rơi.
CREATE OR REPLACE FUNCTION public.warranty_claims_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open integer;
  w      record;
BEGIN
  SELECT * INTO w FROM public.warranties WHERE id = NEW.warranty_id;
  IF NOT FOUND OR w.status = 'het_han' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_open
    FROM public.warranty_claims c
   WHERE c.warranty_id = NEW.warranty_id
     AND c.deleted_at IS NULL
     AND c.status IN ('tiep_nhan', 'dang_xu_ly');

  UPDATE public.warranties
     SET status = CASE WHEN v_open > 0 THEN 'dang_xu_ly' ELSE 'con_han' END::warranty_status,
         updated_at = now()
   WHERE id = NEW.warranty_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER warranty_claims_sync_status
  AFTER INSERT OR UPDATE OF status ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.warranty_claims_sync_status();

COMMENT ON FUNCTION public.warranty_claims_sync_status() IS
  'Hạng mục bảo hành chuyển sang "đang xử lý" khi còn phản ánh chưa xong, trở lại "còn hạn" khi hết (TC-07).';
