-- ============================================================================
-- Đợt 1 — 1D: loại phê duyệt «Báo cáo khảo sát» (Ban Giám đốc duyệt — chủ dự án chốt).
--
-- Tách thành migration RIÊNG vì `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới không nằm
-- chung một giao dịch được (cùng lý do 0040, 0048). Giá trị mới nằm CUỐI danh sách.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'survey_report';
