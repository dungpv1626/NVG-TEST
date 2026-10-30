
-- Ảnh nội thất TỪNG PHÒNG vẽ thẳng từ đầu bài (B3b «bộ ý tưởng cho khách», 30/10/2026). Mở MỘT loại artifact
-- `ai_room_image` và MỘT bước lineage `ai_room_image_draw` (nối từ `design_brief`).
-- Danh sách = danh sách của 0153 (kind) / 0131 (step) cộng đúng một giá trị — kiểm lại chưa migration nào sau
-- 0153 / 0131 đụng hai constraint này trước khi chạy. NỚI RỘNG tập giá trị nên không cần đếm dòng.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
  'ai_plan_sheet_image',
  'ai_facade_brief',
  'ai_facade_image',
  'ai_facade_review',
  'ai_uploaded_drawing',
  -- Ảnh nội thất một phòng vẽ từ đầu bài, không ảnh neo (B3b).
  'ai_room_image',
  'ai_plan_proposal'
));
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge DROP CONSTRAINT design_artifact_edge_step_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge ADD CONSTRAINT design_artifact_edge_step_known CHECK (step IN (
  'layer1_brief', 'layer2_program', 'layer3a_intent',
  'layer3b_solve', 'layer4_arch', 'layer5_render',
  'ai_program_propose', 'ai_plan_propose', 'ai_facade_propose',
  'ai_facade_edit', 'ai_image_render',
  'ai_plan_sheet',
  'ai_facade_image_draw',
  'ai_facade_review',
  -- Vẽ ảnh nội thất một phòng từ đầu bài (B3b). Nối từ `design_brief`.
  'ai_room_image_draw',
  'ai_plan_check'
));
