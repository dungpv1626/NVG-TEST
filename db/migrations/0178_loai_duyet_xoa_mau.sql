-- ============================================================================
-- Đợt 1 — 1H: loại phê duyệt «Xoá mẫu công trình» (chủ dự án chốt: Phòng Thiết kế muốn xoá mẫu
-- phải được Giám đốc đồng ý). Migration riêng vì `ALTER TYPE ... ADD VALUE` không dùng được trong
-- cùng giao dịch (0040, 0048, 0174). Hạn mức (TGĐ, Ban Giám đốc) do `db:seed` ghi.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'showcase_delete';
