-- 0122 — Tuyến AI mặc định trỏ vào nhà cung cấp có khoá riêng cho gói trả phí.
--
-- 0121 seed mặc định là hai tuyến Gemini. Rà soát 08/09/2026: hai tuyến đó từng dùng chung khoá
-- gói miễn phí với các tuyến hạng 3 — nay tách sang nhà cung cấp `gemini_paid` cần secret riêng,
-- và cho tới khi có secret đó chúng không bấm được. Mặc định đổi sang OpenAI (có cả văn bản lẫn
-- ảnh); ô chọn vẫn tự rơi về tuyến bật đầu tiên khi mặc định chưa dùng được.
UPDATE public.design_setting
SET value = '"ai_text_openai"'::jsonb, updated_at = now()
WHERE key = 'ai_text_route_default' AND value = '"ai_text_gemini"'::jsonb;
--> statement-breakpoint
UPDATE public.design_setting
SET value = '"ai_image_openai"'::jsonb, updated_at = now()
WHERE key = 'ai_image_route_default' AND value = '"ai_image_gemini"'::jsonb;
