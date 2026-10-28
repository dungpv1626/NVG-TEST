-- ============================================================================
-- 0237 — Máy đọc phiếu khảo sát giấy, điền NHÁP báo cáo khảo sát (anh Dũng 28/10/2026)
--
-- Người khảo sát quét phiếu giấy viết tay; trình duyệt tô trắng khung thông tin khách (tên, điện thoại,
-- địa chỉ, chữ ký) rồi gửi ẢNH ĐÃ CHE cho Worker `POST /ai/survey-paper-read`. Gemini Flash gói trả phí
-- chép chữ của sáu ô báo cáo + ô phiếu riêng pháp nhân thành NHÁP; người khảo sát chọn ô nào dùng, sửa
-- rồi tự Lưu. Không ghi gì vào biên bản, không lưu ảnh đã che. Chỉ thêm công tắc riêng — trống = tắt,
-- gõ tay như thường. Chi phí ghi ở `ai_calls` (feature `survey_paper_read`).
-- ============================================================================

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ai.survey_paper_read_enabled', 'global', NULL, 'Bật máy đọc phiếu khảo sát giấy',
       'Gemini Flash gói trả phí đọc ảnh phiếu khảo sát viết tay (đã che khung thông tin khách) và điền nháp sáu ô báo cáo + ô phiếu riêng để người khảo sát sửa. 1 = bật; để trống = tắt (gõ tay).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'ai.survey_paper_read_enabled' AND p.scope_type = 'global'
);
