-- ============================================================================
-- 0121 — Nhánh thiết kế bằng AI (T10–T13, 08/09/2026)
--
-- Bốn việc, gộp một migration vì cùng một đợt và áp một lần trên CSDL dùng chung:
--   1. Bảng `design_ai_call`: nhật ký từng lượt gọi mô hình của nhà cung cấp ngoài — Haan trả
--      tiền API, chi phí phải đối chiếu được theo dự án, model, việc.
--   2. Nới CHECK `design_artifact.kind` và `design_artifact_edge.step` cho loại artifact và
--      bước của nhánh AI (mặt bằng do AI đề xuất, kiểm ở Container).
--   3. Bucket `design-renders` cho ảnh do mô hình ảnh sinh (T13) — ảnh không phải dòng
--      `design_artifact`; artifact `render_result` trỏ tới nó.
--   4. Hai khoá `design_setting`: tuyến mặc định cho ô chọn model.
-- ============================================================================

CREATE TABLE public.design_ai_call (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  discipline      design_discipline NOT NULL,

  route           varchar(64) NOT NULL,
  provider        varchar(32) NOT NULL,
  model           varchar(96) NOT NULL,
  purpose         varchar(64) NOT NULL,
  data_class      smallint NOT NULL,
  prompt_version  varchar(16),

  input_tokens    integer,
  output_tokens   integer,
  image_count     integer NOT NULL DEFAULT 0,
  latency_ms      integer NOT NULL,
  status          varchar(16) NOT NULL,
  error_code      varchar(64),
  -- Tính từ giá niêm yết trong config/models.yaml lúc gọi; NULL khi tuyến không khai giá.
  cost_usd        numeric(10, 6),

  artifact_id     varchar(71) REFERENCES public.design_artifact(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT design_ai_call_data_class CHECK (data_class IN (1, 2, 3)),
  CONSTRAINT design_ai_call_status CHECK (status IN ('ok', 'rejected', 'failed')),
  CONSTRAINT design_ai_call_discipline_technical CHECK (discipline <> 'phuong_an')
);
--> statement-breakpoint
CREATE INDEX design_ai_call_project_idx ON public.design_ai_call (project_id, created_at);
--> statement-breakpoint
CREATE INDEX design_ai_call_tenant_time_idx ON public.design_ai_call (tenant_id, created_at);
--> statement-breakpoint
COMMENT ON TABLE public.design_ai_call IS
  'Nhật ký từng lượt gọi mô hình AI của nhà cung cấp ngoài (nhánh AI, T10–T13): model, token, độ trễ, chi phí, kết quả. Chỉ Worker ghi (service_role).';
--> statement-breakpoint
ALTER TABLE public.design_ai_call ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Đọc theo ba chiều RLS của module. KHÔNG có policy INSERT/UPDATE/DELETE cho `authenticated`:
-- dòng chi phí do Worker ghi bằng service_role sau lời gọi thật, trình duyệt không được tự ghi.
CREATE POLICY design_ai_call_select ON public.design_ai_call
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));
--> statement-breakpoint
-- Loại artifact và bước mới của nhánh AI. `ai_plan_proposal` là mặt bằng AI đề xuất TRƯỚC khi
-- Container kiểm; `ai_plan_propose` nối chương trình không gian → đề xuất, `ai_plan_check` nối
-- đề xuất → floor_plan (hoặc infeasibility_report).
ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  'ai_plan_proposal'
));
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge DROP CONSTRAINT design_artifact_edge_step_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge ADD CONSTRAINT design_artifact_edge_step_known CHECK (step IN (
  'layer1_brief', 'layer2_program', 'layer3a_intent',
  'layer3b_solve', 'layer4_arch', 'layer5_render',
  'ai_plan_propose', 'ai_plan_check'
));
--> statement-breakpoint
-- Bucket ảnh AI. Riêng, không dùng `design-artifacts` (JSON) hay `design-site-photos` (ảnh
-- hiện trạng của khách, hạng 1): ảnh sinh ra mang nhãn cảnh báo và đường dẫn theo dự án.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-renders',
  'design-renders',
  false,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Đọc ảnh theo dự án ở thư mục đầu của đường dẫn (`<project_id>/render/<hash>.png`), cùng
-- khuôn với ảnh khảo sát (0118). Ghi chỉ qua Worker.
CREATE POLICY design_renders_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'design-renders'
    AND public.rls_design_project_readable(public.try_uuid((storage.foldername(name))[1]))
  );
--> statement-breakpoint
INSERT INTO public.design_setting (tenant_id, key, value, description)
SELECT t.id, s.key, s.value::jsonb, s.description
FROM public.tenants t,
  (VALUES
    ('ai_text_route_default', '"ai_text_gemini"',
     'Tuyến mô hình VĂN BẢN mặc định trên ô chọn của trang thiết kế (nhánh AI). Phải là một tên tuyến ai_text_* trong config/models.yaml.'),
    ('ai_image_route_default', '"ai_image_gemini"',
     'Tuyến mô hình ẢNH mặc định trên ô chọn của trang thiết kế (nhánh AI). Phải là một tên tuyến ai_image_* trong config/models.yaml.')
  ) AS s(key, value, description)
WHERE t.code = 'nvg'
ON CONFLICT (tenant_id, key) DO NOTHING;
