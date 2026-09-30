-- Tên hiển thị của mã tổng hợp toàn tập đoàn: «Toàn NVG» → «NVG Group» (Haan 30/09/2026).
-- Chỉ đổi nhãn ở bộ chọn phạm vi; mã `NVG` và cách xử lý (bỏ điều kiện lọc, CLAUDE.md 3.5) giữ nguyên.
UPDATE public.companies SET short_name = 'NVG Group' WHERE code = 'NVG' AND short_name = 'Toàn NVG';
