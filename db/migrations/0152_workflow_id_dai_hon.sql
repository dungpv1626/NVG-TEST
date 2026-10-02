-- ============================================================================
-- Mã instance Workflow dài hơn 64 ký tự.
--
-- Cloudflare Workflows nay cấp mã instance dạng `cf_` + 64 ký tự hex (67 ký tự) thay cho UUID
-- (36). Cột `design_ai_run.workflow_id varchar(64)` (0123) từ chối, PostgREST trả 400, nên mọi
-- lượt «AI Design» trên Worker cloud dừng ngay ở bước gắn Workflow: màn hình báo «Không mở
-- được luồng chạy nền», trong khi instance vẫn chạy nền mà không ghi được tiến độ (02/10/2026,
-- lượt c4f5f4ee trên bản demo). `wrangler dev` vẫn cấp UUID nên ở máy không thấy.
--
-- Nới lên 255: mã do nền tảng cấp, không phải dữ liệu nghiệp vụ, và định dạng có thể đổi tiếp.
-- ============================================================================

ALTER TABLE public.design_ai_run ALTER COLUMN workflow_id TYPE varchar(255);
