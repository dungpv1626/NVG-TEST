-- ============================================================================
-- Module Thiết kế AI (TK-10 → TK-17) — nền tảng: tenant, artifact, lineage, quyền chuỗi.
--
-- Nguồn: `doc/design/03-data-contracts.md` mục 3.8, `02-architecture.md` mục 2.8,
-- hàng rào cứng ở CLAUDE.md mục 8.
--
-- Migration này chỉ THÊM. Không đổi cấu trúc bảng nào của 12 module đang chạy ngoài hai
-- việc phụ, cả hai đều cộng thêm cột và không đổi hành vi sẵn có:
--   1. `companies` thêm `tenant_id` (điền sẵn cho cả 4 dòng, rồi mới NOT NULL);
--   2. `design_projects` thêm `is_draft` / `converted_at` / `converted_by`.
-- Ma trận `permissions` và chính sách RLS của 12 module KHÔNG bị đụng tới.
--
-- ⚠️ CSDL này đang dùng chung cho máy phát triển và bản chạy thử công khai (CLAUDE.md 6.3).
-- Haan đã xác nhận cho chạy trên cơ sở migration chỉ thêm bảng và cột cho phép rỗng.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Tenant — đơn vị THUÊ phần mềm, khác pháp nhân giao dịch
--
-- Module chuẩn bị bán lại cho công ty xây dựng khác, nên mọi bảng của module mang
-- `tenant_id` ngay từ khung, kể cả khi hiện chỉ có một tenant (02-architecture 2.8).
-- Thêm `tenant_id` sau nghĩa là sửa mọi bảng, mọi hợp đồng dữ liệu và mọi policy cùng lúc
-- — bỏ sót một bảng là một lỗ rò rỉ dữ liệu giữa hai khách hàng.
-- ----------------------------------------------------------------------------

CREATE TABLE public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(32) NOT NULL UNIQUE,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at  timestamptz
);

COMMENT ON TABLE public.tenants IS
  'Khách hàng THUÊ phần mềm. Khác companies (pháp nhân giao dịch của NVG). Xem doc/design/02-architecture.md 2.8.';

INSERT INTO public.tenants (code, name)
VALUES ('nvg', 'Nhà Việt Group');


-- Pháp nhân thuộc về tenant nào.
--
-- Vì sao gắn tenant vào `companies` chứ không tạo bảng nối `tenant_users`: phạm vi tenant
-- của một người ĐÃ được xác định bởi các pháp nhân họ được gán (`user_companies`) — thêm
-- một bảng nối thứ hai là tạo ra hai nguồn sự thật có thể nói khác nhau, và mỗi lần tạo tài
-- khoản mới lại phải nhớ ghi vào cả hai nơi. Một tenant sở hữu nhiều pháp nhân; một pháp
-- nhân thuộc đúng một tenant.
ALTER TABLE public.companies ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

UPDATE public.companies SET tenant_id = (SELECT id FROM public.tenants WHERE code = 'nvg');

ALTER TABLE public.companies ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX companies_tenant_idx ON public.companies (tenant_id);

COMMENT ON COLUMN public.companies.tenant_id IS
  'Tenant sở hữu pháp nhân này. Nền của chiều "tenant" trong RLS ba chiều của Module Thiết kế.';


-- ----------------------------------------------------------------------------
-- 2. Quyền dạng chuỗi — bổ sung cho ma trận `permissions`, KHÔNG thay thế
--
-- Ma trận cũ chỉ tới mức module (`TK` + 5 cờ) nên không phân biệt được ba bộ môn. Mà "kiến
-- trúc sư không ký được hồ sơ kết cấu" là ràng buộc pháp lý, không phải tuỳ chọn cấu hình
-- (03-data-contracts 3.8b). CLAUDE.md 8.5 T6.
-- ----------------------------------------------------------------------------

CREATE TABLE public.role_capabilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id     uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  capability  varchar(64) NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT role_capabilities_unique UNIQUE (role_id, capability),
  -- Khoá vùng tên: bảng này khởi động CHỈ với nhóm `design.*`. Mở rộng sang module khác là
  -- một quyết định kiến trúc (hai cơ chế phân quyền song song), không phải một dòng INSERT.
  CONSTRAINT role_capabilities_namespace CHECK (capability LIKE 'design.%')
);

CREATE INDEX role_capabilities_capability_idx ON public.role_capabilities (capability);

COMMENT ON TABLE public.role_capabilities IS
  'Quyền dạng chuỗi gắn với vai trò (design.*). Bổ sung cho permissions, không thay thế — xem doc/design/02-architecture.md 2.8.';


-- ----------------------------------------------------------------------------
-- 3. Artifact — kết quả BẤT BIẾN của một bước trong pipeline
--
-- Khoá chính là chính mã băm nội dung, không phải UUID: nhờ đó "cùng input + cùng cấu hình
-- → cùng artifact" là ràng buộc do CSDL giữ, không phải quy ước phải nhớ. Ghi lại một
-- payload y hệt sẽ đụng khoá chính thay vì lặng lẽ tạo bản thứ hai.
-- ----------------------------------------------------------------------------

CREATE TABLE public.design_artifact (
  id              varchar(71) PRIMARY KEY,

  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,

  discipline      design_discipline NOT NULL,
  kind            varchar(32) NOT NULL,
  schema_version  varchar(16) NOT NULL,
  payload_uri     text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT design_artifact_id_format CHECK (id ~ '^sha256:[0-9a-f]{64}$'),

  -- `phuong_an` là một BƯỚC hồ sơ (TK-03), không phải bộ môn kỹ thuật — không có người chịu
  -- trách nhiệm chuyên môn để ký, mà chữ ký theo bộ môn là thứ 03-data-contracts 3.8b cưỡng chế.
  CONSTRAINT design_artifact_discipline_technical
    CHECK (discipline <> 'phuong_an'),

  CONSTRAINT design_artifact_kind_known CHECK (kind IN (
    'design_brief', 'space_program', 'layout_intent', 'floor_plan',
    'infeasibility_report', 'arch_model', 'schedules', 'render_result'
  )),

  -- URI phải có scheme để đổi kho lưu trữ mà không sửa nơi gọi (interface ArtifactStore).
  CONSTRAINT design_artifact_payload_uri_scheme
    CHECK (payload_uri ~ '^(supabase|r2)://.+')
);

CREATE INDEX design_artifact_project_kind_idx ON public.design_artifact (project_id, kind, created_at);
CREATE INDEX design_artifact_tenant_idx       ON public.design_artifact (tenant_id);

COMMENT ON TABLE public.design_artifact IS
  'Artifact bất biến của pipeline thiết kế. KHÔNG BAO GIỜ UPDATE — sửa = tạo artifact mới + đổi design_head (03-data-contracts 3.8).';


-- Cạnh của đồ thị phụ thuộc: artifact nào sinh ra artifact nào, bằng bước gì, với cấu hình nào.
CREATE TABLE public.design_artifact_edge (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  from_id     varchar(71) NOT NULL REFERENCES public.design_artifact(id) ON DELETE CASCADE,
  to_id       varchar(71) NOT NULL REFERENCES public.design_artifact(id) ON DELETE CASCADE,
  step        varchar(32) NOT NULL,
  params_hash varchar(64) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (from_id, to_id, step),

  CONSTRAINT design_artifact_edge_step_known CHECK (step IN (
    'layer1_brief', 'layer2_program', 'layer3a_intent',
    'layer3b_solve', 'layer4_arch', 'layer5_render'
  )),
  CONSTRAINT design_artifact_edge_no_self_loop CHECK (from_id <> to_id)
);

CREATE INDEX design_artifact_edge_to_idx     ON public.design_artifact_edge (to_id);
CREATE INDEX design_artifact_edge_params_idx ON public.design_artifact_edge (from_id, step, params_hash);

COMMENT ON COLUMN public.design_artifact_edge.params_hash IS
  'Băm cấu hình đã dùng. Trả lời "cùng input, cùng cấu hình → đã có kết quả chưa" để bỏ qua tính lại.';


-- Bản ĐANG HIỆU LỰC của mỗi loại artifact, theo từng bộ môn của từng dự án.
--
-- Có `discipline` trong khoá vì bộ hồ sơ hoàn chỉnh là ba bộ môn song song, mỗi bộ môn có
-- mặt bằng đang hiệu lực riêng — gộp lại thì kỹ sư kết cấu phát hành sẽ hạ bản kiến trúc xuống.
CREATE TABLE public.design_head (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id  uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  discipline  design_discipline NOT NULL,
  kind        varchar(32) NOT NULL,
  artifact_id varchar(71) NOT NULL REFERENCES public.design_artifact(id) ON DELETE RESTRICT,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  PRIMARY KEY (project_id, discipline, kind),
  CONSTRAINT design_head_discipline_technical CHECK (discipline <> 'phuong_an')
);

CREATE INDEX design_head_tenant_idx ON public.design_head (tenant_id);

COMMENT ON TABLE public.design_head IS
  'Bản đang hiệu lực (thuật ngữ chuẩn CGD 4.4) của mỗi loại artifact, theo dự án × bộ môn.';


-- ----------------------------------------------------------------------------
-- 4. Phân công dự án theo bộ môn — chiều thứ hai và thứ ba của RLS
--
-- Vì sao không dùng `design_discipline_tasks.assignee_id` (TK-04): bảng kia là TIẾN ĐỘ (một
-- dòng một bộ môn, có phần trăm hoàn thành, có hạn), còn đây là QUYỀN (nhiều người cùng bộ
-- môn, có người chỉ đọc). Dùng bảng tiến độ làm bảng quyền thì thêm người thứ hai vào một bộ
-- môn là làm hỏng số liệu tiến độ.
-- ----------------------------------------------------------------------------

CREATE TABLE public.design_project_assignment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id   uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  discipline   design_discipline NOT NULL,
  access_level varchar(8) NOT NULL DEFAULT 'read',

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT design_project_assignment_unique UNIQUE (project_id, user_id, discipline),
  CONSTRAINT design_project_assignment_level CHECK (access_level IN ('read', 'write')),
  CONSTRAINT design_project_assignment_discipline_technical CHECK (discipline <> 'phuong_an')
);

CREATE INDEX design_project_assignment_user_idx ON public.design_project_assignment (user_id);

COMMENT ON TABLE public.design_project_assignment IS
  'Kỹ sư kết cấu/điện nước thuê ngoài: tài khoản đầy đủ, giới hạn đúng dự án được giao và bộ môn phụ trách (03-data-contracts 3.9, D17).';


-- ----------------------------------------------------------------------------
-- 5. Lần phát hành sang hệ tài liệu — cầu nối MỘT CHIỀU
-- ----------------------------------------------------------------------------

CREATE TABLE public.design_publication (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  project_id          uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,

  discipline          design_discipline NOT NULL,

  artifact_ids        jsonb NOT NULL,

  document_id         uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  document_version_id uuid REFERENCES public.document_versions(id) ON DELETE SET NULL,

  signed_by           uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  signed_at           timestamptz NOT NULL DEFAULT now(),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT design_publication_discipline_technical CHECK (discipline <> 'phuong_an'),
  -- Giữ tham chiếu ngược về artifact nguồn để sau này truy được "bản vẽ này sinh ra từ đầu
  -- bài nào" (03-data-contracts 3.8b). Rỗng thì mất đúng thứ cầu nối này sinh ra để giữ.
  CONSTRAINT design_publication_has_source CHECK (jsonb_typeof(artifact_ids) = 'object' AND artifact_ids <> '{}'::jsonb)
);

CREATE INDEX design_publication_project_idx ON public.design_publication (project_id, discipline, signed_at);
CREATE INDEX design_publication_tenant_idx  ON public.design_publication (tenant_id);

COMMENT ON TABLE public.design_publication IS
  'MỘT lần phát hành = MỘT bộ môn, ký bởi người có quyền design.publish.<discipline>. Publish là một chiều (03-data-contracts 3.8b).';


-- ----------------------------------------------------------------------------
-- 6. Cấu hình module theo tenant
--
-- Bảng khoá/giá trị chứ không phải cột cố định: cấu hình còn thay đổi nhiều trong Giai đoạn
-- 1, và mỗi lần thêm một ngưỡng mà phải sinh migration thì cám dỗ hard-code (CLAUDE.md 8.2
-- nguyên tắc 4 cấm) sẽ thắng.
-- ----------------------------------------------------------------------------

CREATE TABLE public.design_setting (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key         varchar(64) NOT NULL,
  value       jsonb NOT NULL,
  description text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  PRIMARY KEY (tenant_id, key)
);

INSERT INTO public.design_setting (tenant_id, key, value, description)
SELECT t.id, s.key, s.value::jsonb, s.description
FROM public.tenants t,
  (VALUES
    ('rule_pack_locality', '"thai_binh"',
     'Pack địa phương nạp chồng lên pack base. ⚠️ Sau sắp xếp đơn vị hành chính 2025, Thái Bình đã sáp nhập vào Hưng Yên — chờ Haan xác nhận (câu hỏi Q-8).'),
    ('brief_completeness_min', '0.7',
     'Dưới ngưỡng này thì Layer 2 KHÔNG được chạy, trả về yêu cầu bổ sung thông tin (03-data-contracts 3.1).'),
    ('layout_variants_per_run', '4',
     'Số phương án Layer 3a sinh mỗi lần chạy.'),
    ('solver_time_budget_s', '60',
     'Ngân sách thời gian cho bộ giải CP-SAT. Đo được ở Mốc 0.2: 4 tầng/18 phòng hết 6 mili giây.')
  ) AS s(key, value, description)
WHERE t.code = 'nvg';


-- ----------------------------------------------------------------------------
-- 7. Dự án nháp của khách vãng lai (02-architecture 2.8b)
--
-- Chuyển đổi TẠI CHỖ khi Kinh doanh tiếp nhận, không tạo dự án mới rồi chép sang: chép sang
-- là mất toàn bộ artifact và đồ thị phụ thuộc đã sinh trong lúc khách tự thử.
--
-- ⚠️ Luồng khách vãng lai THẬT (đăng nhập ẩn danh, giới hạn số lần) thuộc Mốc 8 và CHƯA mở.
-- Migration `0062` đang khoá EXECUTE của `anon`; không nới ở đây. Xem câu hỏi Q-4.
-- ----------------------------------------------------------------------------

ALTER TABLE public.design_projects
  ADD COLUMN is_draft     boolean NOT NULL DEFAULT false,
  ADD COLUMN converted_at timestamptz,
  ADD COLUMN converted_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.design_projects.is_draft IS
  'Dự án nháp do khách vãng lai tạo, chưa phải dự án chính thức (doc/design/02-architecture.md 2.8b).';


-- ----------------------------------------------------------------------------
-- 8. Bốn cột kiểm toán tự ghi (migration 0019)
--
-- `design_artifact` và `design_artifact_edge` KHÔNG gắn: chúng chỉ có `created_*`, không có
-- `updated_*` — đúng ý đồ, artifact bất biến thì không tồn tại khái niệm "ai sửa lần cuối".
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.tenants');
SELECT public.attach_audit_touch('public.role_capabilities');
SELECT public.attach_audit_touch('public.design_head');
SELECT public.attach_audit_touch('public.design_project_assignment');
SELECT public.attach_audit_touch('public.design_publication');
SELECT public.attach_audit_touch('public.design_setting');


-- ----------------------------------------------------------------------------
-- 9. Gán quyền `design.*` cho các vai trò sẵn có
--
-- Ánh xạ vai trò của tài liệu sang vai trò đang chạy (03-data-contracts 3.9):
--   sales → KD · architect / design_lead → TKE · executive → TGD, BGD, CFO · guest → chưa có.
--
-- ⚠️ Ba điểm cần Haan xác nhận, đều sửa được bằng DỮ LIỆU chứ không phải mã nguồn:
--   - `design_lead` chưa có vai trò riêng, tạm gộp vào TKE (câu hỏi Q-6).
--   - ADMIN (Quản trị hệ thống) CỐ Ý không có quyền `design.write.*` và `design.publish.*`:
--     phát hành hồ sơ là trách nhiệm chuyên môn có chữ ký, không phải việc quản trị hệ thống.
--   - `design.publish.ket_cau` và `design.publish.dien_nuoc` khởi động KHÔNG AI có. Đúng
--     hiện trạng: Giai đoạn 1 chỉ sinh hồ sơ kiến trúc, và NVG chưa có vai trò kỹ sư kết cấu
--     trong hệ thống. Đây cũng là điều kiện làm cho phép thử "phát hành kết cấu bị chặn" có
--     nghĩa.
-- ----------------------------------------------------------------------------

INSERT INTO public.role_capabilities (role_id, capability)
SELECT r.id, c.capability
FROM public.roles r
JOIN (VALUES
  -- Phòng Thiết kế: thấy mọi dự án, đọc cả ba bộ môn (phối hợp chéo — TK-04), ghi và ký kiến trúc.
  ('TKE', 'design.project.all'),
  ('TKE', 'design.read.kien_truc'),
  ('TKE', 'design.read.ket_cau'),
  ('TKE', 'design.read.dien_nuoc'),
  ('TKE', 'design.write.kien_truc'),
  ('TKE', 'design.publish.kien_truc'),
  ('TKE', 'design.settings.write'),

  -- Kinh doanh: chỉ ĐỌC, và chỉ kiến trúc — hồ sơ kết cấu/điện nước không phục vụ việc bán hàng.
  ('KD', 'design.project.all'),
  ('KD', 'design.read.kien_truc'),

  -- Ban Giám đốc: đọc toàn bộ, không ghi.
  ('TGD', 'design.project.all'),
  ('TGD', 'design.read.kien_truc'),
  ('TGD', 'design.read.ket_cau'),
  ('TGD', 'design.read.dien_nuoc'),
  ('BGD', 'design.project.all'),
  ('BGD', 'design.read.kien_truc'),
  ('BGD', 'design.read.ket_cau'),
  ('BGD', 'design.read.dien_nuoc'),
  ('CFO', 'design.project.all'),
  ('CFO', 'design.read.kien_truc'),
  ('CFO', 'design.read.ket_cau'),
  ('CFO', 'design.read.dien_nuoc'),

  -- Quản trị hệ thống: đọc và cấu hình, KHÔNG ghi hồ sơ, KHÔNG ký.
  ('ADMIN', 'design.project.all'),
  ('ADMIN', 'design.read.kien_truc'),
  ('ADMIN', 'design.read.ket_cau'),
  ('ADMIN', 'design.read.dien_nuoc'),
  ('ADMIN', 'design.settings.write')
) AS c(role_code, capability) ON r.code = c.role_code::role_code;
