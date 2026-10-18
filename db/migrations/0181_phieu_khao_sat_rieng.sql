-- ============================================================================
-- 0181 — Phiếu khảo sát riêng từng pháp nhân (chủ dự án 18/10/2026)
--
-- Sáu mục báo cáo chung giữ nguyên. Mỗi pháp nhân thêm nhóm «Thông tin hiện trường» (NVO: khu đất
-- và nhà ở; NVC: nhà xưởng và điều kiện thi công; NVS: giàn giáo) — danh sách ô là DỮ LIỆU ở
-- `shared/src/survey-forms.ts`, cột này chỉ giữ giá trị theo khoá. Không tách cột từng ô: danh
-- sách ô còn chờ Kinh doanh từng công ty sửa, đổi ô không được kéo theo migration.
--
-- Khoá cùng sáu mục khi báo cáo đang chờ / đã duyệt: hàm canh của 0175 chép NGUYÊN, chỉ thêm
-- một dòng so `site_details`.
-- ============================================================================

ALTER TABLE public.site_surveys
  ADD COLUMN IF NOT EXISTS site_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.site_surveys DROP CONSTRAINT IF EXISTS site_surveys_site_details_object;
ALTER TABLE public.site_surveys
  ADD CONSTRAINT site_surveys_site_details_object CHECK (jsonb_typeof(site_details) = 'object');

COMMENT ON COLUMN public.site_surveys.site_details IS
  'Thông tin hiện trường theo phiếu riêng của pháp nhân (0181) — khoá = SURVEY_SITE_FORMS[company].fields[].key.';

-- Chép nguyên từ 0175, thêm so `site_details`.
CREATE OR REPLACE FUNCTION public.site_surveys_report_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Hàm hệ thống đang ghi, hoặc tiến trình không có phiên đăng nhập (nạp dữ liệu, kiểm thử chạy
  -- thẳng trên CSDL) — cùng quy tắc với cấp mã (0132).
  IF COALESCE(current_setting('nvg.survey_report', true), '') = 'on'
     OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cột do hệ thống ghi: người dùng gửi lên thì bỏ qua.
  NEW.started_at := OLD.started_at;
  NEW.finished_at := OLD.finished_at;
  NEW.report_status := OLD.report_status;
  NEW.report_feedback := OLD.report_feedback;
  NEW.report_submitted_at := OLD.report_submitted_at;
  NEW.report_decided_at := OLD.report_decided_at;
  NEW.report_approval_id := OLD.report_approval_id;

  IF OLD.report_status IN ('cho_duyet', 'da_duyet') AND (
       NEW.needs IS DISTINCT FROM OLD.needs
       OR NEW.decision_maker IS DISTINCT FROM OLD.decision_maker
       OR NEW.budget_note IS DISTINCT FROM OLD.budget_note
       OR NEW.schedule_note IS DISTINCT FROM OLD.schedule_note
       OR NEW.commercial_terms IS DISTINCT FROM OLD.commercial_terms
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.surveyed_at IS DISTINCT FROM OLD.surveyed_at
       OR NEW.ai_draft IS DISTINCT FROM OLD.ai_draft
       OR NEW.site_details IS DISTINCT FROM OLD.site_details
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     ) THEN
    RAISE EXCEPTION 'Báo cáo khảo sát đang chờ duyệt hoặc đã duyệt — không sửa được. Ban Giám đốc trả về thì mới sửa tiếp.';
  END IF;

  -- Máy đã ghi giờ kết thúc thì giờ khảo sát không sửa tay được nữa.
  IF OLD.finished_at IS NOT NULL THEN
    NEW.surveyed_at := OLD.surveyed_at;
  END IF;
  RETURN NEW;
END;
$$;
