-- Đảo T21: tờ mặt bằng công năng KHÔNG do mô hình ảnh vẽ nữa (T22, 12/09/2026 — Haan quyết).
--
-- Bối cảnh: T21 (migration 0124) chuyển phần VẼ tờ mặt bằng sang mô hình ảnh, và chấp nhận một
-- đánh đổi đã ghi rõ lúc đó — «hình trên giấy KHÔNG khớp chính xác bảng diện tích, và vẽ lại cùng
-- một tầng ra một tấm khác». Haan đặt lại hai mục tiêu cho luồng này: giảm chi phí token và
-- NÂNG CAO ĐỘ CHÍNH XÁC bản vẽ. Mục tiêu thứ hai không thể đạt được cùng lúc với một tờ ảnh: một
-- tấm ảnh không bao giờ đo được. Nên tờ SVG tất định (`ai/draw/`) trở lại làm tờ CHÍNH.
--
-- Migration này ĐÓNG đúng hai thứ 0124 đã mở:
--   1. Loại artifact `ai_plan_sheet_image`.
--   2. Bước lineage `ai_plan_sheet`.
--
-- ── Vì sao là migration XUÔI, không phải xoá tệp 0124 ────────────────────────────────────────
-- 0124 đã COMMIT (272e679) và đã nằm trong `_journal.json`. Xoá một migration đã commit là cách
-- chắc nhất để journal lệch khỏi trạng thái thật của CSDL: máy nào đã chạy 0124 thì vẫn còn giá
-- trị cũ trong constraint, còn máy mới thì không — và không có gì báo. Drizzle chỉ so `when` tăng
-- dần, nó không kiểm lại nội dung đã áp.
--
-- Vì `kind` và `step` là **CHECK constraint**, không phải enum, nên việc đóng lại chỉ là dựng lại
-- constraint. Không cần phẫu thuật kiểu `ALTER TYPE`, và không có giá trị enum mồ côi nào còn lại.
--
-- ⚠️ KHÔNG xoá dòng `design_artifact` nào. Artifact là BẤT BIẾN (CLAUDE.md 8.8 điểm 1) và bảng
-- không có policy DELETE. Nếu từng có tờ ảnh nào được đúc, dòng ấy ở lại và đọc lại được — đúng
-- cách `ai_plan_proposal` của phương án T14 cũ đang ở lại. Constraint mới chỉ chặn GHI THÊM.
-- Kiểm trước khi chạy — HAI bảng, không phải một, vì migration này dựng lại constraint trên cả hai
-- và `ADD CONSTRAINT ... CHECK` kiểm luôn các dòng ĐANG CÓ:
--   SELECT count(*) FROM design_artifact      WHERE kind = 'ai_plan_sheet_image';
--   SELECT count(*) FROM design_artifact_edge WHERE step = 'ai_plan_sheet';
-- Khác 0 thì phải giữ giá trị ấy trong danh sách (thêm lại vào nhóm «phương án cũ»); bỏ sót vế thứ
-- hai thì `npm run db:migrate` hỏng giữa đường, trên chính CSDL mà bản chạy thử công khai đang đọc
-- (CLAUDE.md 6.3). Đo ngày 12/09/2026: cả hai đều bằng 0 — chưa tờ ảnh nào được đúc, nên cũng không
-- cạnh lineage nào trỏ tới.

ALTER TABLE public.design_artifact DROP CONSTRAINT design_artifact_kind_known;
--> statement-breakpoint
ALTER TABLE public.design_artifact ADD CONSTRAINT design_artifact_kind_known CHECK (kind IN (
  -- Bộ giải nội bộ — sẽ xoá khi nhánh AI thay thế xong.
  'design_brief', 'space_program', 'layout_intent', 'floor_plan',
  'infeasibility_report', 'arch_model', 'schedules', 'render_result',
  -- Nhánh AI.
  'ai_space_program', 'ai_floor_plan', 'ai_facade_concept', 'ai_image_set',
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
  -- Phương án cũ — chỉ để đọc lại.
  'ai_plan_check'
));
