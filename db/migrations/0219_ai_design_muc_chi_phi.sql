-- 0219 — Mức chi phí tối đa của MỘT lượt AI Design (T164 điểm 1, anh Dũng 23/10/2026).
--
-- Khoá `design_setting.ai_run_cost_cap_usd` (USD, theo tenant). Workflow đọc nó lúc bấm «Xếp mặt
-- bằng» / «Chạy lại» / sửa theo yêu cầu (`workers/src/design/ai/cost-cap.ts`): trước MỖI lời gọi sửa
-- kế tiếp, tiền đã tiêu của lượt + ước tính một lời gọi nữa vượt mức thì dừng.
--
-- Giá trị để TRỐNG (`null`) = không giới hạn: NVG chưa quyết con số (CLAUDE.md 5.2). Bản demo đặt
-- 0,5 USD qua kịch bản `mac-dinh` (`db/src/demo/scenario-defaults.ts`), ghi rõ DEMO. Chỉ thêm khoá khi
-- chưa có — chạy lại không đè số đã đặt.

INSERT INTO public.design_setting (tenant_id, key, value, description)
SELECT t.id, 'ai_run_cost_cap_usd', 'null'::jsonb,
       'Mức chi phí tối đa (USD, giá niêm yết) của MỘT lượt AI Design. Trước mỗi lời gọi sửa kế tiếp, tiền đã tiêu + ước tính một lời gọi nữa vượt mức thì lượt dừng. Trống = không giới hạn.'
FROM public.tenants t
WHERE t.code = 'nvg'
ON CONFLICT (tenant_id, key) DO NOTHING;
