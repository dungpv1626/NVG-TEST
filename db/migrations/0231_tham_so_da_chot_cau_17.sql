-- 0231 — Các con số câu 17 đã chốt (anh Dũng 27/10/2026: «theo bạn đề xuất»).
--
-- Trước đây cố ý để TRỐNG (CLAUDE.md 5.2 — không bịa số NVG chưa quyết); bản demo có số DEMO ở kịch bản `mac-dinh`.
-- Nay chủ dự án chấp nhận đề xuất, nên ghi thành mặc định thật — vẫn sửa được ở màn hình Tham số hệ thống, đổi không
-- hồi tố. Chỉ điền ô còn TRỐNG: số người dùng đã đặt không bị đè.
--
-- - Kiểm soát nội bộ: duyệt sát hạn mức = từ 90 % hạn mức người duyệt; biên bản nghiệm thu lập quá 7 ngày chưa ký.
-- - Bảng giá bồi thường giàn giáo (mất / hỏng, đồng một cái) cho ba mã giàn giáo chuẩn — mã khác NVS thêm ở màn hình.
-- Mức tồn tối thiểu KHÔNG đặt ở đây: đó là số của từng vật tư, Kho đặt khi có vật tư thật (bản demo vẫn dùng quy tắc 15 %).

UPDATE public.system_parameters
   SET value = '90'::jsonb,
       description = concat_ws(' ', description, 'Đã chốt 27/10/2026 (câu 17).')
 WHERE param_key = 'ksnb.near_limit_percent' AND scope_type = 'global' AND value IS NULL;

UPDATE public.system_parameters
   SET value = '7'::jsonb,
       description = concat_ws(' ', description, 'Đã chốt 27/10/2026 (câu 17).')
 WHERE param_key = 'ksnb.acceptance_unsigned_days' AND scope_type = 'global' AND value IS NULL;

UPDATE public.system_parameters
   SET value = '{
         "GIANGIAO-NEM-150":     {"mat": 450000, "hong": 150000},
         "GIANGIAO-MAMSAN-1200": {"mat": 600000, "hong": 200000},
         "GIANGIAO-KICH-U600":   {"mat": 250000, "hong": 80000}
       }'::jsonb,
       description = concat_ws(' ', description, 'Đã chốt 27/10/2026 (câu 17) — mã khác NVS thêm ở màn hình.')
 WHERE param_key = 'compensation_price_table' AND scope_type = 'global' AND value IS NULL;
