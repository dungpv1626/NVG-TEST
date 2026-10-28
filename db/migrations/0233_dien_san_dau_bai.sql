-- ============================================================================
-- 0233 — Điền sẵn đầu bài thiết kế từ khảo sát (anh Dũng 27/10/2026)
--
-- Máy đọc khảo sát thiết kế (số đo, ghi chú, lời chủ nhà đã chép chữ) và báo cáo khảo sát CRM đã duyệt
-- của cơ hội gắn với hồ sơ, rồi ĐỀ XUẤT câu trả lời cho đầu bài (Worker `POST /ai/brief-prefill`). Kiến trúc
-- sư chọn câu nào dùng; không gì được ghi thẳng vào đầu bài. Chỉ thêm công tắc riêng — trống = tắt, điền
-- tay như thường. Chi phí ghi ở `ai_calls` (feature `brief_prefill`).
-- ============================================================================

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ai.brief_prefill_enabled', 'global', NULL, 'Bật điền sẵn đầu bài thiết kế từ khảo sát',
       'Gemini Flash gói trả phí đọc khảo sát thiết kế + báo cáo khảo sát của Kinh doanh, đề xuất câu trả lời đầu bài để kiến trúc sư chọn. 1 = bật; để trống = tắt (điền tay).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'ai.brief_prefill_enabled' AND p.scope_type = 'global'
);
