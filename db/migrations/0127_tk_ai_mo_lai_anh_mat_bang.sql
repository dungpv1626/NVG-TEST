-- Mở lại tờ mặt bằng do mô hình ảnh vẽ — lần này CÓ ẢNH NEO (T57, 19/09/2026 — Haan quyết).
--
-- ── Đây là lần thứ hai, và phải đọc cả hai lần trước khi sửa ─────────────────────────────────
-- 0124 MỞ hai giá trị này cho T21; 0125 ĐÓNG lại cho T22. Lý do đóng, ghi nguyên văn trong 0125:
-- «một tấm ảnh không bao giờ đo được», trong khi mục tiêu của đợt ấy là nâng độ chính xác bản vẽ.
-- Lý do ấy VẪN ĐÚNG và không bị đảo ở đây: tờ SVG tất định (`ai/draw/`) vẫn là tờ CHÍNH, vẫn là
-- tờ hiện mặc định trên màn hình, vẫn là thứ xuất DXF.
--
-- Cái đổi là MỤC ĐÍCH của tấm ảnh, và một khác biệt kỹ thuật:
--   · Mục đích: tờ ảnh không còn đóng vai «bản vẽ», nó là tấm TRÌNH KHÁCH — có nội thất, vật liệu,
--     cây cối. Cùng vai trò với ảnh phối cảnh, đứng CẠNH tờ vector chứ không thay.
--   · Kỹ thuật: T21 CỐ Ý không gửi ảnh neo, mô hình chỉ nhận chữ — nên nó vẽ một ngôi nhà khác với
--     ngôi nhà đã xếp. T57 gửi kèm chính tờ mặt bằng đã dựng từ toạ độ (rasterise ở trình duyệt),
--     nên mô hình vẽ lại ĐÚNG ngôi nhà ấy. Hợp đồng `ai-plan-sheet-image` nay BẮT BUỘC trường
--     `anchor` — bỏ nó đi là lặng lẽ quay về T21 mà vẫn tốn tiền.
--
-- Migration này mở lại đúng hai thứ 0125 đã đóng:
--   1. Loại artifact `ai_plan_sheet_image`.
--   2. Bước lineage `ai_plan_sheet`.
--
-- ── Vì sao là migration XUÔI, không phải sửa hay xoá 0125 ────────────────────────────────────
-- Cùng lý lẽ 0125 đã ghi khi nó không xoá 0124: cả hai đã COMMIT và đã nằm trong `_journal.json`.
-- Sửa một migration đã chạy là cách chắc nhất để journal lệch khỏi trạng thái thật của CSDL, và
-- Drizzle chỉ so `when` tăng dần chứ không kiểm lại nội dung đã áp.
--
-- Danh sách dưới đây = danh sách của 0125 cộng đúng một giá trị mỗi bảng. Đã kiểm: 0126 không đụng
-- tới hai constraint này, nên 0125 vẫn là bản đúng để dựng tiếp.
--
-- ⚠️ KHÔNG cần đếm dòng trước khi chạy, khác 0125. `ADD CONSTRAINT ... CHECK` ở đây NỚI RỘNG tập
-- giá trị hợp lệ, nên không dòng nào đang có có thể bị nó từ chối. 0125 phải đếm vì nó thu hẹp.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  -- Bộ giải nội bộ — sẽ xoá khi nhánh AI thay thế xong.
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  -- Nhánh AI.
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
  -- Tờ mặt bằng có nội thất do mô hình ảnh vẽ từ ảnh neo (T57). Một artifact = một tờ = một tầng.
  'ai_plan_sheet_image',
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
  -- Vẽ tờ mặt bằng có nội thất (T57). Nối từ `ai_floor_plan`, KHÔNG nối từ `ai_facade_*`: tờ mặt
  -- bằng không đi qua ý tưởng mặt đứng.
  'ai_plan_sheet',
  -- Phương án cũ — chỉ để đọc lại.
  'ai_plan_check'
));
