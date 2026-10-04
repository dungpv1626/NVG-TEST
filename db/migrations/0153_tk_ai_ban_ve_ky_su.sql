-- Bản vẽ kỹ sư tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4, 03/10/2026 — Haan: ảnh mặt bằng có nội
-- thất và ảnh mặt đứng có vật liệu vẽ được «dựa trên bản vẽ do AI tạo hoặc bản vẽ do kỹ sư chỉnh sửa
-- (hoặc tự tạo)»).
--
-- Mở MỘT loại artifact mới: `ai_uploaded_drawing`. Lưu thành artifact (bất biến, băm nội dung): ảnh vẽ
-- từ nó trỏ về đúng bản đã dùng qua cạnh lineage; tải lại bản sửa là artifact MỚI.
--
-- Danh sách dưới đây = danh sách của 0131 cộng đúng một giá trị. Đã kiểm: 0131 là migration cuối cùng
-- đụng constraint này. NỚI RỘNG tập giá trị hợp lệ nên không cần đếm dòng trước khi chạy. Không đụng
-- `design_artifact_edge_step_known`: ảnh vẽ từ bản tải lên dùng lại `ai_plan_sheet` và
-- `ai_facade_image_draw` đã có.

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
  -- Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2). Từ T114 không ghi mới — yêu cầu nằm trong đầu bài.
  'ai_facade_brief',
  -- Ảnh mặt đứng có vật liệu do mô hình ảnh vẽ từ ảnh neo (T59 Đợt E).
  'ai_facade_image',
  -- Kỹ sư chấm lại bản mặt đứng (T63).
  'ai_facade_review',
  -- Bản vẽ kỹ sư tải lên làm nguồn cho mô hình ảnh (T114 Đợt 4).
  'ai_uploaded_drawing',
  -- Nhánh AI, phương án cũ — chỉ để đọc lại, không ghi thêm.
  -- `ai_plan_proposal`: T14 (mô hình tự viết SVG).
  'ai_plan_proposal'
));
