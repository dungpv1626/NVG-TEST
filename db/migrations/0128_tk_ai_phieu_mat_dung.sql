-- Phiếu yêu cầu mặt đứng của kỹ sư (T59 Đợt F2, 19/09/2026 — Haan: «thêm tính năng khảo sát riêng
-- cho phần này … để kỹ sư điền yêu cầu vào»).
--
-- Mở MỘT loại artifact mới: `ai_facade_brief` — phiếu kỹ sư điền trên màn hình bước Mặt đứng. Lưu
-- thành artifact (bất biến, băm nội dung) chứ không thành một bảng sửa tại chỗ: ý tưởng mặt đứng trỏ
-- về đúng bản phiếu nó đã theo, nên sửa phiếu phải là bản MỚI, bản cũ còn nguyên để truy.
--
-- Danh sách dưới đây = danh sách của 0127 cộng đúng một giá trị. Đã kiểm: 0127 là migration cuối
-- cùng đụng constraint này. NỚI RỘNG tập giá trị hợp lệ nên không cần đếm dòng trước khi chạy.
-- Không đụng `design_artifact_edge_step_known`: phiếu không có cạnh đi vào, còn cạnh phiếu → ý tưởng
-- dùng bước `ai_facade_propose` đã có từ 0123.

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
  -- Nhánh AI, phương án cũ — chỉ để đọc lại, không ghi thêm.
  -- `ai_plan_proposal`: T14 (mô hình tự viết SVG).
  'ai_plan_proposal'
));
