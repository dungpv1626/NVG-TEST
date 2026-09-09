-- Nhánh thiết kế bằng AI — dòng RIÊNG, độc lập hoàn toàn với bộ giải nội bộ.
--
-- Bối cảnh (09/09/2026, Haan): bộ giải CP-SAT không đạt qua thử nghiệm thực tế. Bộ giải bằng
-- AI thay thế nó, và phải tách sạch để sau này xoá bộ giải mà nhánh AI không vỡ. Quyết định
-- T15–T19 ghi ở CLAUDE.md 8.5.
--
-- Migration này mở ba thứ:
--   1. Bốn loại artifact mới của nhánh AI — KHÔNG dùng lại loại nào của bộ giải.
--   2. Bốn bước lineage mới.
--   3. Bảng `design_ai_run` theo dõi tiến độ các lượt chạy nền (Workflow).
--
-- Loại `ai_plan_proposal` và bước `ai_plan_check` của phương án cũ (T14) GIỮ NGUYÊN trong
-- danh sách cho phép: artifact là bất biến, thứ đã đúc phải còn đọc được. Mã nguồn không sinh
-- chúng nữa.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  -- Bộ giải nội bộ — sẽ xoá khi nhánh AI thay thế xong.
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  -- Nhánh AI.
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
  -- Nhánh AI, phương án cũ (T14) — chỉ để đọc lại.
  'ai_plan_proposal'
));
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge DROP CONSTRAINT design_artifact_edge_step_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge ADD CONSTRAINT design_artifact_edge_step_known CHECK (step IN (
  'layer1_brief', 'layer2_program', 'layer3a_intent',
  'layer3b_solve', 'layer4_arch', 'layer5_render',
  -- Nhánh AI: đầu bài → chương trình → mặt bằng → mặt đứng → bộ ảnh.
  -- `ai_facade_edit` là bản mặt đứng do kiến trúc sư sửa: artifact bất biến nên sửa = artifact
  -- mới nối vào bản cũ, không có UPDATE.
  'ai_program_propose', 'ai_plan_propose', 'ai_facade_propose',
  'ai_facade_edit', 'ai_image_render',
  -- Phương án cũ (T14) — chỉ để đọc lại.
  'ai_plan_check'
));
--> statement-breakpoint
-- Lượt chạy nền của nhánh AI.
--
-- Vì sao cần bảng riêng thay vì chỉ đọc trạng thái của Cloudflare Workflow: trạng thái kia
-- không biết bước nghiệp vụ nào đang chạy, không đi qua RLS nên trình duyệt không đọc trực
-- tiếp được, và không giữ được ảnh đã dựng xong khi ảnh sau còn đang chạy. Ba thứ đó đúng là
-- những gì màn hình cần hiện.
--
-- Một lượt = một GIAI ĐOẠN (`stage`), vì kiến trúc sư duyệt giữa các bước.
CREATE TABLE public.design_ai_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  project_id      uuid NOT NULL REFERENCES public.design_projects(id) ON DELETE CASCADE,
  discipline      design_discipline NOT NULL,

  stage           varchar(16) NOT NULL,
  -- Mã instance của Workflow. Rỗng khi lượt chạy đồng bộ (bước chương trình không gian).
  workflow_id     varchar(64),
  status          varchar(16) NOT NULL DEFAULT 'queued',
  -- { steps: [{id, label, status, started_at, ended_at, error}], done, total, partial: {...} }
  progress        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Mã artifact đã đúc, để màn hình nhảy thẳng tới kết quả khi lượt chạy xong.
  result          jsonb,
  error           text,

  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT design_ai_run_stage CHECK (stage IN ('program', 'plan', 'facade', 'images')),
  CONSTRAINT design_ai_run_status CHECK (status IN ('queued', 'running', 'done', 'failed')),
  CONSTRAINT design_ai_run_discipline_technical CHECK (discipline <> 'phuong_an')
);
--> statement-breakpoint
CREATE INDEX design_ai_run_project_idx ON public.design_ai_run (project_id, stage, created_at DESC);
--> statement-breakpoint
ALTER TABLE public.design_ai_run ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Chỉ ĐỌC từ trình duyệt, cùng ba chiều quyền của mọi bảng trong module (8.8 mục 3). Ghi chỉ
-- qua Worker bằng khoá service_role: dòng này là nhật ký máy, người dùng không sửa được.
CREATE POLICY design_ai_run_select ON public.design_ai_run
  FOR SELECT TO authenticated
  USING (public.rls_design_readable(tenant_id, project_id, discipline));
