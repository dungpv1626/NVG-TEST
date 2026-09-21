-- Kỹ sư chấm lại bản mặt đứng (T63, 20/09/2026 — Haan chọn «Máy chấm + kỹ sư chấm lại»).
--
-- Mở hai giá trị:
--   1. Loại artifact `ai_facade_review` — bảng điểm kỹ sư chấm tay trên đúng tiêu chí của máy.
--      Loại artifact ĐẦU TIÊN mà nội dung do NGƯỜI viết chứ không do mô hình sinh.
--   2. Bước lineage `ai_facade_review` — cạnh `ai_facade_concept` → `ai_facade_review`.
--      Không có cạnh này thì tìm «bản chấm của đúng bản vẽ này» phải đọc payload của từng bản
--      chấm trong hồ sơ, tức mỗi lần mở màn hình là một chuỗi lượt đi kho lớn dần theo thói quen
--      dùng — đúng cái bẫy mà `edgeTargets` sinh ra để tránh.
--
-- Danh sách loại = danh sách của 0129 cộng một giá trị; danh sách bước cũng vậy. Cả hai NỚI RỘNG
-- tập giá trị hợp lệ, nên không dòng nào đang có có thể bị từ chối — không cần đếm dòng trước khi chạy.

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
  -- Kỹ sư chấm lại bản mặt đứng (T63).
  'ai_facade_review',
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
  -- Kỹ sư chấm lại (T63). Nối từ `ai_facade_concept`.
  'ai_facade_review',
  -- Phương án cũ — chỉ để đọc lại.
  'ai_plan_check'
));
