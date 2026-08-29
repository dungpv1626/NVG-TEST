-- ============================================================================
-- Module Thiết kế AI — phân quyền BA CHIỀU trên mọi bảng của module.
--
-- Nguồn: `doc/design/02-architecture.md` mục 2.8, `03-data-contracts.md` mục 3.9.
--
--   1. `tenant_id`  — không rò rỉ giữa các khách hàng thuê phần mềm
--   2. phân công dự án — kỹ sư thuê ngoài chỉ thấy dự án được giao
--   3. `discipline` — chỉ ghi được phần bộ môn mình phụ trách
--
-- "Thiếu một chiều ở một bảng là một lỗ hổng" (02-architecture 2.8). Vì vậy ba chiều gói
-- vào HAI hàm dùng chung (`rls_design_readable` / `rls_design_writable`) và mọi policy gọi
-- chúng, thay vì mỗi bảng chép lại điều kiện rồi lệch nhau về sau — đúng cách
-- `rls_design_project_readable` của migration 0025 đã làm cho bảy bảng của Module TK.
--
-- KHÔNG hard-code tên vai trò trong policy: tenant thứ hai sẽ có cơ cấu tổ chức khác
-- (02-architecture 2.8). Policy hỏi `auth_has_capability('design.write.ket_cau')`, không
-- hỏi "người này có phải kỹ sư kết cấu".
--
-- ⚠️ Hàm tạo sau migration `0062` KHÔNG còn tự mở EXECUTE cho PUBLIC — mỗi hàm dưới đây
-- phải có dòng GRANT tường minh, nếu không chính policy gọi nó sẽ lỗi quyền.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Hàm trợ giúp
-- ----------------------------------------------------------------------------

-- Người dùng có quyền chuỗi này không. Đọc `role_capabilities`, không đọc tên vai trò.
CREATE OR REPLACE FUNCTION public.auth_has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_capabilities rc
    JOIN public.user_companies uc ON uc.role_id = rc.role_id
    WHERE uc.user_id = public.auth_user_id()
      AND uc.deleted_at IS NULL
      AND rc.capability = p_capability
  );
$$;

COMMENT ON FUNCTION public.auth_has_capability(text) IS
  'Quyền chuỗi của Module Thiết kế (design.*). Đọc role_capabilities — KHÔNG hard-code tên vai trò.';

GRANT EXECUTE ON FUNCTION public.auth_has_capability(text) TO authenticated;


-- Tenant mà người dùng thuộc về, suy từ các pháp nhân họ được gán.
--
-- Cố ý KHÔNG dùng `auth_sees_all_companies()`: vai trò "xem mọi pháp nhân" là phạm vi TRONG
-- một tenant (Ban Giám đốc NVG xem được NVC, NVS, NVO), không phải giấy thông hành sang
-- tenant khác. Nhầm chỗ này là đúng cái lỗ hổng mà chiều thứ nhất sinh ra để bịt.
CREATE OR REPLACE FUNCTION public.auth_tenant_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT c.tenant_id), ARRAY[]::uuid[])
  FROM public.user_companies uc
  JOIN public.companies c ON c.id = uc.company_id
  WHERE uc.user_id = public.auth_user_id()
    AND uc.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.auth_tenant_ids() IS
  'Tenant của người dùng, suy từ pháp nhân được gán. Chiều thứ nhất của RLS ba chiều.';

GRANT EXECUTE ON FUNCTION public.auth_tenant_ids() TO authenticated;


CREATE OR REPLACE FUNCTION public.rls_design_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_id() IS NOT NULL
     AND p_tenant_id = ANY (public.auth_tenant_ids());
$$;

GRANT EXECUTE ON FUNCTION public.rls_design_tenant_access(uuid) TO authenticated;


-- Chiều 2 — dự án này có nằm trong phạm vi của người dùng không.
--
-- Hai đường vào, cố ý khác nhau:
--   · nội bộ  — có `design.project.all`, thấy mọi dự án trong phạm vi pháp nhân;
--   · thuê ngoài — không có quyền đó, chỉ thấy dự án có dòng phân công cho chính mình.
-- Không có đường thứ ba. Người không thuộc cả hai nhóm không thấy gì.
CREATE OR REPLACE FUNCTION public.rls_design_project_in_scope(p_project_id uuid, p_discipline design_discipline)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_capability('design.project.all')
      OR EXISTS (
        SELECT 1
        FROM public.design_project_assignment a
        WHERE a.project_id = p_project_id
          AND a.user_id = public.auth_user_id()
          AND a.discipline = p_discipline
      );
$$;

GRANT EXECUTE ON FUNCTION public.rls_design_project_in_scope(uuid, design_discipline) TO authenticated;


-- Ba chiều gộp lại — ĐỌC.
--
-- `rls_design_project_readable` (migration 0025) đã bao gồm phạm vi pháp nhân và quyền xem
-- module TK; giữ nguyên để một người bị gỡ quyền TK là mất luôn quyền ở đây, không phải nhớ
-- gỡ ở hai nơi.
CREATE OR REPLACE FUNCTION public.rls_design_readable(
  p_tenant_id  uuid,
  p_project_id uuid,
  p_discipline design_discipline
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_design_tenant_access(p_tenant_id)
     AND public.rls_design_project_readable(p_project_id)
     AND public.rls_design_project_in_scope(p_project_id, p_discipline)
     AND public.auth_has_capability('design.read.' || p_discipline::text);
$$;

COMMENT ON FUNCTION public.rls_design_readable(uuid, uuid, design_discipline) IS
  'RLS ba chiều — đọc: tenant + phân công dự án + bộ môn (doc/design/02-architecture.md 2.8).';

GRANT EXECUTE ON FUNCTION public.rls_design_readable(uuid, uuid, design_discipline) TO authenticated;


-- Ba chiều gộp lại — GHI.
--
-- Quyền ghi bộ môn có hai đường vào giống chiều 2, nhưng đường "thuê ngoài" phải là dòng
-- phân công `access_level = 'write'`: phân công để ĐỌC không kéo theo quyền ghi.
CREATE OR REPLACE FUNCTION public.rls_design_writable(
  p_tenant_id  uuid,
  p_project_id uuid,
  p_discipline design_discipline
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_design_tenant_access(p_tenant_id)
     AND public.rls_design_project_writable(p_project_id)
     AND (
       public.auth_has_capability('design.write.' || p_discipline::text)
       OR EXISTS (
         SELECT 1
         FROM public.design_project_assignment a
         WHERE a.project_id = p_project_id
           AND a.user_id = public.auth_user_id()
           AND a.discipline = p_discipline
           AND a.access_level = 'write'
       )
     );
$$;

COMMENT ON FUNCTION public.rls_design_writable(uuid, uuid, design_discipline) IS
  'RLS ba chiều — ghi: tenant + dự án còn sửa được + bộ môn được phụ trách.';

GRANT EXECUTE ON FUNCTION public.rls_design_writable(uuid, uuid, design_discipline) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Bật RLS
--
-- Dự án có event trigger `ensure_rls` tự bật RLS cho mọi bảng mới trong schema `public`,
-- nên các dòng dưới là dư — giữ lại để migration tự mô tả đầy đủ, không phụ thuộc hành vi
-- ngầm của nền tảng (CLAUDE.md 3.4).
-- ----------------------------------------------------------------------------

ALTER TABLE public.tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_capabilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_artifact           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_artifact_edge      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_head               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_project_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_publication        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_setting            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenants                   FROM anon;
REVOKE ALL ON public.role_capabilities         FROM anon;
REVOKE ALL ON public.design_artifact           FROM anon;
REVOKE ALL ON public.design_artifact_edge      FROM anon;
REVOKE ALL ON public.design_head               FROM anon;
REVOKE ALL ON public.design_project_assignment FROM anon;
REVOKE ALL ON public.design_publication        FROM anon;
REVOKE ALL ON public.design_setting            FROM anon;


-- ----------------------------------------------------------------------------
-- 3. Tenant và quyền chuỗi — chỉ ĐỌC từ trình duyệt
--
-- Giao diện phải biết người dùng có quyền gì để ẩn menu và nút trước khi bấm (AFD 6.5:
-- "không hiển thị rồi mới báo lỗi"). Nhưng GÁN quyền thì không mở ra trình duyệt: sửa được
-- `role_capabilities` từ trình duyệt là tự cấp cho mình quyền ký hồ sơ kết cấu. Thao tác đó
-- đi qua migration hoặc Workers (`service_role`) — cùng cách đã áp dụng cho `audit_logs`.
-- ----------------------------------------------------------------------------

CREATE POLICY tenants_select ON public.tenants
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND id = ANY (public.auth_tenant_ids()));

CREATE POLICY role_capabilities_select ON public.role_capabilities
  FOR SELECT TO authenticated
  USING (public.auth_user_id() IS NOT NULL);


-- ----------------------------------------------------------------------------
-- 4. Artifact — chỉ SELECT và INSERT
--
-- KHÔNG có policy UPDATE và KHÔNG có policy DELETE, cố ý: tính bất biến của artifact
-- (03-data-contracts 3.8) do CSDL giữ, không do kỷ luật lập trình. Sửa = tạo artifact mới +
-- đổi `design_head`. Muốn xoá thật thì phải đi qua `service_role` trong Workers, và đó là
-- việc phải cân nhắc chứ không phải thao tác thường ngày.
-- ----------------------------------------------------------------------------

CREATE POLICY design_artifact_select ON public.design_artifact
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));

CREATE POLICY design_artifact_insert ON public.design_artifact
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_design_writable(tenant_id, project_id, discipline)
    -- Pháp nhân của artifact phải là pháp nhân của chính dự án. Không kiểm thì một người có
    -- quyền ở NVC ghi được artifact mang mã NVO vào dự án của NVO.
    AND company_id = (SELECT p.company_id FROM public.design_projects p WHERE p.id = project_id)
    AND tenant_id = (SELECT c.tenant_id FROM public.companies c WHERE c.id = company_id)
  );


CREATE POLICY design_artifact_edge_select ON public.design_artifact_edge
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.design_artifact a
      WHERE a.id = design_artifact_edge.to_id
        AND public.rls_design_readable(a.tenant_id, a.project_id, a.discipline)
    )
  );

-- Cạnh lineage ghi được khi ghi được artifact ĐÍCH. Không đòi quyền ghi trên artifact nguồn:
-- nguồn có thể là bộ môn khác (kết cấu dựng trên mặt bằng kiến trúc) và đó là điều bình thường.
CREATE POLICY design_artifact_edge_insert ON public.design_artifact_edge
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.design_artifact a
      WHERE a.id = design_artifact_edge.to_id
        AND a.tenant_id = design_artifact_edge.tenant_id
        AND public.rls_design_writable(a.tenant_id, a.project_id, a.discipline)
    )
    AND EXISTS (
      SELECT 1 FROM public.design_artifact a
      WHERE a.id = design_artifact_edge.from_id
        AND public.rls_design_readable(a.tenant_id, a.project_id, a.discipline)
    )
  );


-- ----------------------------------------------------------------------------
-- 5. Bản đang hiệu lực — con trỏ, nên UPDATE là hợp lệ
-- ----------------------------------------------------------------------------

CREATE POLICY design_head_select ON public.design_head
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));

CREATE POLICY design_head_insert ON public.design_head
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_design_writable(tenant_id, project_id, discipline)
    AND EXISTS (
      SELECT 1 FROM public.design_artifact a
      WHERE a.id = design_head.artifact_id
        AND a.project_id = design_head.project_id
        AND a.discipline = design_head.discipline
        AND a.kind = design_head.kind
    )
  );

CREATE POLICY design_head_update ON public.design_head
  FOR UPDATE TO authenticated
  USING (public.rls_design_writable(tenant_id, project_id, discipline))
  WITH CHECK (
    public.rls_design_writable(tenant_id, project_id, discipline)
    -- Con trỏ chỉ được chuyển sang artifact CÙNG dự án, CÙNG bộ môn, CÙNG loại. Không kiểm
    -- thì "đổi bản đang hiệu lực" thành đường trỏ mặt bằng của dự án khác vào đây.
    AND EXISTS (
      SELECT 1 FROM public.design_artifact a
      WHERE a.id = design_head.artifact_id
        AND a.project_id = design_head.project_id
        AND a.discipline = design_head.discipline
        AND a.kind = design_head.kind
    )
  );


-- ----------------------------------------------------------------------------
-- 6. Phân công dự án
--
-- Ai phân công được: người ghi được dự án đó VÀ có `design.project.all` (tức là người nội
-- bộ). Kỹ sư thuê ngoài được giao một bộ môn không tự thêm mình vào bộ môn khác.
-- ----------------------------------------------------------------------------

CREATE POLICY design_project_assignment_select ON public.design_project_assignment
  FOR SELECT TO authenticated
  USING (
    public.rls_design_tenant_access(tenant_id)
    AND public.rls_design_project_readable(project_id)
    AND (user_id = public.auth_user_id() OR public.auth_has_capability('design.project.all'))
  );

CREATE POLICY design_project_assignment_insert ON public.design_project_assignment
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_design_tenant_access(tenant_id)
    AND public.rls_design_project_writable(project_id)
    AND public.auth_has_capability('design.project.all')
  );

CREATE POLICY design_project_assignment_update ON public.design_project_assignment
  FOR UPDATE TO authenticated
  USING (
    public.rls_design_tenant_access(tenant_id)
    AND public.rls_design_project_writable(project_id)
    AND public.auth_has_capability('design.project.all')
  )
  WITH CHECK (public.rls_design_tenant_access(tenant_id));

CREATE POLICY design_project_assignment_delete ON public.design_project_assignment
  FOR DELETE TO authenticated
  USING (
    public.rls_design_tenant_access(tenant_id)
    AND public.rls_design_project_writable(project_id)
    AND public.auth_has_capability('design.project.all')
  );


-- ----------------------------------------------------------------------------
-- 7. Phát hành — ký theo từng bộ môn
--
-- Ba điều kiện phải cùng đúng, và cả ba đều nằm trong CSDL chứ không ở tầng ứng dụng:
--   · người ký phải là CHÍNH NGƯỜI ĐANG ĐĂNG NHẬP — không ký hộ;
--   · phải có `design.publish.<bộ môn của lần phát hành này>`;
--   · phải ghi được bộ môn đó trong dự án đó.
--
-- Kiến trúc sư không ký được hồ sơ kết cấu kể cả khi là trưởng phòng (03-data-contracts 3.8b).
-- Không có policy UPDATE/DELETE: đã phát hành thì không rút lại bằng cách sửa dòng — phát hành
-- bản mới, đúng cơ chế phiên bản của NEN-05.
-- ----------------------------------------------------------------------------

CREATE POLICY design_publication_select ON public.design_publication
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));

CREATE POLICY design_publication_insert ON public.design_publication
  FOR INSERT TO authenticated
  WITH CHECK (
    signed_by = public.auth_user_id()
    AND public.auth_has_capability('design.publish.' || discipline::text)
    AND public.rls_design_writable(tenant_id, project_id, discipline)
    AND company_id = (SELECT p.company_id FROM public.design_projects p WHERE p.id = project_id)
  );


-- ----------------------------------------------------------------------------
-- 8. Cấu hình module
-- ----------------------------------------------------------------------------

CREATE POLICY design_setting_select ON public.design_setting
  FOR SELECT TO authenticated
  USING (public.rls_design_tenant_access(tenant_id));

CREATE POLICY design_setting_insert ON public.design_setting
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_design_tenant_access(tenant_id)
    AND public.auth_has_capability('design.settings.write')
  );

CREATE POLICY design_setting_update ON public.design_setting
  FOR UPDATE TO authenticated
  USING (
    public.rls_design_tenant_access(tenant_id)
    AND public.auth_has_capability('design.settings.write')
  )
  WITH CHECK (public.rls_design_tenant_access(tenant_id));
