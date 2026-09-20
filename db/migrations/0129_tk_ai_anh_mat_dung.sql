-- Ảnh mặt đứng CÓ VẬT LIỆU do mô hình ảnh vẽ từ ảnh neo (T59 Đợt E, 20/09/2026 — Haan: «làm đợt E»).
--
-- Mở hai giá trị:
--   1. Loại artifact `ai_facade_image` — một tấm ảnh trình khách, trỏ ý tưởng mặt đứng nó vẽ theo.
--   2. Bước lineage `ai_facade_image_draw` — cạnh `ai_facade_concept` → `ai_facade_image`.
--
-- Danh sách loại = danh sách của 0128 cộng một giá trị; danh sách bước = danh sách của 0127 cộng một
-- giá trị (0128 không đụng constraint bước). Cả hai NỚI RỘNG tập giá trị hợp lệ, nên không dòng nào
-- đang có có thể bị từ chối — không cần đếm dòng trước khi chạy.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  -- Bộ giải nội bộ — đã gỡ (T58); giữ để dòng cũ còn nguyên.
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  -- Nhánh AI.
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
  -- Tờ mặt bằng có nội thất do mô hình ảnh vẽ từ ảnh neo (T57). Một artifact = một tờ = một tầng.
  'ai_plan_sheet_image',
  -- Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2).
  'ai_facade_brief',
  -- Ảnh mặt đứng có vật liệu do mô hình ảnh vẽ từ ảnh neo (T59 Đợt E).
  'ai_facade_image',
  -- Nhánh AI, phương án cũ — chỉ để đọc lại, không ghi thêm.
  -- `ai_plan_proposal`: T14 (mô hình tự viết SVG).
  'ai_plan_proposal'
));
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge DROP CONSTRAINT design_artifact_edge_step_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact_edge ADD CONSTRAINT design_artifact_edge_step_known CHECK (step IN (
  'layer1_brief', 'layer2_program', 'layer3a_intent',
  'layer3b_solve', 'layer4_arch', 'layer5_render',
  -- Nhánh AI: đầu bài → chương trình → mặt bằng → mặt đứng → bộ ảnh.
  'ai_program_propose', 'ai_plan_propose', 'ai_facade_propose',
  'ai_facade_edit', 'ai_image_render',
  -- Vẽ tờ mặt bằng có nội thất (T57). Nối từ `ai_floor_plan`.
  'ai_plan_sheet',
  -- Vẽ ảnh mặt đứng có vật liệu (T59 Đợt E). Nối từ `ai_facade_concept`.
  'ai_facade_image_draw',
  -- Phương án cũ — chỉ để đọc lại.
  'ai_plan_check'
));
