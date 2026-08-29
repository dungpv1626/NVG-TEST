-- ============================================================================
-- Knowledge Base — bản ghi hồ sơ công trình cũ đã số hoá (Mốc 3).
--
-- Nguồn: `doc/design/06-knowledge-base.md` mục 6.2. Hợp đồng dữ liệu:
-- `contracts/kb-record.schema.json`.
--
-- MỘT NGUỒN SỰ THẬT: cột `payload` giữ nguyên bản ghi theo hợp đồng. Mọi cột dùng để LỌC
-- (`project_code`, `tier`, `building_type`, `floors`, `quality_score`, `has_brief`,
-- `has_slicing_tree`) đều là cột SINH `GENERATED ALWAYS ... STORED` đọc thẳng từ `payload`.
-- Chép tay sang cột riêng sẽ tạo hai nguồn có thể nói khác nhau — đúng thứ mục 5.2 của
-- CLAUDE.md cấm. Cột sinh thì CSDL không cho phép lệch.
--
-- VÌ SAO KHÔNG CÓ CHIỀU DỰ ÁN TRONG PHÂN QUYỀN (khác `design_artifact`):
-- bản ghi Knowledge Base là tri thức ở mức TENANT, không thuộc một dự án nào. Nó mô tả một
-- công trình ĐÃ XÂY và được dùng làm tham chiếu cho MỌI dự án mới; `project_id` còn được
-- phép rỗng vì nhiều hồ sơ cũ không còn dự án tương ứng trong hệ thống. Ràng buộc thật sự
-- là ranh giới tenant — mục 6.0 của tài liệu nói thẳng: "rò rỉ giữa các tenant là hỏng sản
-- phẩm". Đây là quyết định, không phải sót.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kb_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,

  -- Pháp nhân nào đã làm công trình này (CLAUDE.md 3.5 — mọi bảng nghiệp vụ mang company_id).
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,

  -- Rỗng khi hồ sơ cũ không còn dự án tương ứng: vẫn số hoá được, chỉ là không nối được sang
  -- module khác. Xoá dự án KHÔNG kéo theo xoá tri thức đã trích.
  project_id uuid REFERENCES public.design_projects (id) ON DELETE SET NULL,

  discipline design_discipline NOT NULL DEFAULT 'kien_truc',

  -- Toàn bộ bản ghi theo `contracts/kb-record.schema.json`. Nguồn sự thật duy nhất.
  payload jsonb NOT NULL,

  -- Kết quả kiểm tra chéo (Bước 2). Lưu cùng bản ghi chứ không chỉ ghi nhật ký: người xác
  -- nhận cần thấy bản ghi mất điểm vì lý do gì, đúng lúc đang xem nó.
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Tên các tệp nguồn đã dùng, để truy ngược khi kết quả trích trông sai.
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- --- Cột sinh: chỉ để LỌC, không bao giờ ghi trực tiếp ---------------------
  project_code text GENERATED ALWAYS AS (payload ->> 'project_code') STORED,
  tier text GENERATED ALWAYS AS (payload ->> 'tier') STORED,
  building_type text GENERATED ALWAYS AS (payload ->> 'building_type') STORED,
  floors integer GENERATED ALWAYS AS ((payload ->> 'floors')::integer) STORED,
  quality_score double precision GENERATED ALWAYS AS ((payload ->> 'quality_score')::double precision) STORED,
  has_brief boolean GENERATED ALWAYS AS ((payload ->> 'has_brief')::boolean) STORED,

  -- Bản ghi không dựng được cây chia không gian vẫn dùng cho thống kê, nhưng KHÔNG được dùng
  -- làm few-shot cho Layer 3a. Cột này là bộ lọc của việc truy hồi, nên nó phải suy từ chính
  -- payload — nhớ đặt cờ bằng tay là sẽ có ngày quên.
  has_slicing_tree boolean GENERATED ALWAYS AS (
    COALESCE(jsonb_typeof(payload -> 'slicing_tree') = 'object', false)
  ) STORED,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users (id) ON DELETE SET NULL,

  -- Xoá mềm: số hoá một bộ hồ sơ tốn công người, xoá cứng là mất hẳn.
  deleted_at timestamptz,

  -- Cùng ràng buộc với `design_artifact`: `phuong_an` là giai đoạn của Module TK, không phải
  -- một bộ môn kỹ thuật, nên không có hồ sơ nào được ký dưới tên nó.
  CONSTRAINT kb_record_discipline_check CHECK (discipline <> 'phuong_an'),
  CONSTRAINT kb_record_tier_check CHECK (tier IN ('A', 'B', 'C')),
  CONSTRAINT kb_record_quality_check CHECK (quality_score >= 0 AND quality_score <= 1)
);

-- Một mã công trình chỉ có một bản ghi còn hiệu lực trong mỗi tenant. Chỉ mục MỘT PHẦN để
-- bản đã xoá mềm không chặn việc số hoá lại.
CREATE UNIQUE INDEX IF NOT EXISTS kb_record_tenant_code_unique
  ON public.kb_record (tenant_id, project_code)
  WHERE deleted_at IS NULL;

-- Truy hồi lọc theo loại hình + chất lượng, trong phạm vi một tenant.
CREATE INDEX IF NOT EXISTS kb_record_retrieval_idx
  ON public.kb_record (tenant_id, building_type, quality_score DESC)
  WHERE deleted_at IS NULL;

-- Few-shot chỉ lấy bản ghi có cây chia không gian.
CREATE INDEX IF NOT EXISTS kb_record_fewshot_idx
  ON public.kb_record (tenant_id, has_slicing_tree)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS kb_record_project_idx ON public.kb_record (project_id);

COMMENT ON TABLE public.kb_record IS
  'Hồ sơ công trình cũ đã số hoá (doc/design/06-knowledge-base.md 6.2). payload là nguồn sự thật; các cột lọc là cột sinh.';
COMMENT ON COLUMN public.kb_record.has_slicing_tree IS
  'Suy từ payload. false = không dùng làm few-shot cho Layer 3a.';


-- ----------------------------------------------------------------------------
-- Nhật ký thay đổi
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.kb_record');


-- ----------------------------------------------------------------------------
-- Phân quyền — HAI chiều: tenant + bộ môn
-- ----------------------------------------------------------------------------

-- Không gọi `rls_design_readable` được: hàm đó đòi `project_id` NOT NULL, mà bản ghi
-- Knowledge Base cố ý cho phép rỗng. Hai hàm riêng, cùng khuôn, cùng cách đọc quyền chuỗi.
CREATE OR REPLACE FUNCTION public.rls_kb_readable(
  p_tenant_id  uuid,
  p_discipline design_discipline
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_design_tenant_access(p_tenant_id)
     AND public.auth_has_capability('design.read.' || p_discipline::text);
$$;

COMMENT ON FUNCTION public.rls_kb_readable(uuid, design_discipline) IS
  'RLS Knowledge Base — đọc: tenant + bộ môn. Không có chiều dự án: bản ghi là tri thức mức tenant.';

GRANT EXECUTE ON FUNCTION public.rls_kb_readable(uuid, design_discipline) TO authenticated;


CREATE OR REPLACE FUNCTION public.rls_kb_writable(
  p_tenant_id  uuid,
  p_discipline design_discipline
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_design_tenant_access(p_tenant_id)
     AND public.auth_has_capability('design.write.' || p_discipline::text);
$$;

COMMENT ON FUNCTION public.rls_kb_writable(uuid, design_discipline) IS
  'RLS Knowledge Base — ghi: tenant + bộ môn. Bước chú giải của kiến trúc sư đi qua đây.';

GRANT EXECUTE ON FUNCTION public.rls_kb_writable(uuid, design_discipline) TO authenticated;


ALTER TABLE public.kb_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_record_select ON public.kb_record;
CREATE POLICY kb_record_select ON public.kb_record
  FOR SELECT TO authenticated
  USING (public.rls_kb_readable(tenant_id, discipline));

DROP POLICY IF EXISTS kb_record_insert ON public.kb_record;
CREATE POLICY kb_record_insert ON public.kb_record
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_kb_writable(tenant_id, discipline));

-- Có UPDATE, khác hẳn `design_artifact`: bản ghi Knowledge Base KHÔNG bất biến. Bước 3 của
-- pipeline là kiến trúc sư bổ sung `rationale` vào bản ghi đã trích (mục 6.1) — đó là việc
-- sửa đúng nghĩa, không phải tạo phiên bản mới.
DROP POLICY IF EXISTS kb_record_update ON public.kb_record;
CREATE POLICY kb_record_update ON public.kb_record
  FOR UPDATE TO authenticated
  USING (public.rls_kb_writable(tenant_id, discipline))
  WITH CHECK (public.rls_kb_writable(tenant_id, discipline));

-- KHÔNG có policy DELETE: số hoá một bộ hồ sơ tốn công người. Bỏ một bản ghi là đặt
-- `deleted_at`, đi qua policy UPDATE ở trên.
