-- Tờ mặt bằng công năng do MÔ HÌNH ẢNH vẽ (T21, 10/09/2026 — Haan quyết).
--
-- Bối cảnh: bộ vẽ SVG tất định của T15 («AI thiết kế, chương trình cầm bút») đã qua hai vòng
-- sửa và vẫn không cho ra tờ vẽ mà một kiến trúc sư chấp nhận được. Haan chuyển phần VẼ sang
-- mô hình ảnh: mô hình văn bản vẫn khai mặt bằng dạng dữ liệu — đó mới là thứ đo diện tích và
-- đối chiếu quy chuẩn được — nhưng khai thêm một đoạn mô tả tờ giấy, và một mô hình ảnh dựng
-- tờ ấy từ đoạn mô tả.
--
-- Migration này mở đúng hai thứ:
--   1. Loại artifact `ai_plan_sheet_image` — MỘT artifact là MỘT tờ của MỘT tầng.
--   2. Bước lineage `ai_plan_sheet` — nối tờ ảnh về đúng bản mặt bằng nó vẽ theo.
--
-- KHÔNG tạo bucket: `design-renders` đã có từ `0121_tk_ai_design.sql` cùng policy đọc theo
-- thư mục đầu tiên của khoá (`(storage.foldername(name))[1]` = mã hồ sơ). Chưa mã nào ghi vào
-- đó cho tới đợt này.
--
-- `ai_image_set` và `ai_image_render` GIỮ NGUYÊN: chúng dành cho bộ ảnh phối cảnh (T16), một
-- việc khác hẳn. Tờ mặt bằng không có ảnh neo và không đi qua ý tưởng mặt đứng.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  -- Bộ giải nội bộ — sẽ xoá khi nhánh AI thay thế xong.
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  -- Nhánh AI.
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
  'ai_plan_sheet_image',
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
  'ai_program_propose', 'ai_plan_propose', 'ai_facade_propose',
  'ai_facade_edit', 'ai_image_render',
  -- Vẽ tờ mặt bằng bằng mô hình ảnh (T21).
  'ai_plan_sheet',
  -- Phương án cũ (T14) — chỉ để đọc lại.
  'ai_plan_check'
));
