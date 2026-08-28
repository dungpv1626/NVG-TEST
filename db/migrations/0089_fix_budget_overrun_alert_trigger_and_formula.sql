-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `budget_overrun_alert`
-- (0035_tc_rls.sql, sửa gần nhất ở 0067) có hai lỗi trong CÙNG một cơ chế:
--
-- 1. Trigger `project_budgets_overrun_alert` chỉ khai `AFTER UPDATE OF actual_amount,
--    committed_amount` — sửa thẳng `budgeted_amount` (ví dụ cắt ngân sách) KHÔNG kích hoạt
--    trigger này, dù đó chính là cách để một dòng ngân sách vượt 90% mà không ai chi thêm gì.
-- 2. Kể cả khi trigger có chạy (vì actual/committed đổi cùng lúc với budgeted_amount trong
--    MỘT câu UPDATE), `v_before` lại tính bằng `NEW.budgeted_amount` thay vì `OLD.budgeted_amount`
--    — dùng SAI mẫu số cho tỷ lệ "trước khi đổi", nên không bao giờ phát hiện đúng việc mốc
--    90% vừa bị vượt qua bởi chính lần đổi ngân sách đó.
--
-- Vá: thêm `budgeted_amount` vào danh sách cột kích hoạt trigger, và tính `v_before` bằng
-- ĐÚNG bộ số liệu CŨ (OLD.actual_amount, OLD.committed_amount, OLD.budgeted_amount) — đối
-- xứng với `v_after` đã dùng đúng bộ số liệu MỚI. Thêm nhánh `OLD.budgeted_amount <= 0` để
-- không chia cho 0 khi một dòng ngân sách vừa được đặt giá trị từ 0 lên dương lần đầu.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.budget_overrun_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          record;
  v_before   numeric;
  v_after    numeric;
  v_threshold constant numeric := 0.9;
BEGIN
  IF NEW.construction_site_id IS NULL OR NEW.budgeted_amount IS NULL OR NEW.budgeted_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_before := CASE WHEN OLD.budgeted_amount > 0
                THEN (COALESCE(OLD.actual_amount, 0) + COALESCE(OLD.committed_amount, 0))::numeric
                     / OLD.budgeted_amount
                ELSE 0
              END;
  v_after  := (COALESCE(NEW.actual_amount, 0) + COALESCE(NEW.committed_amount, 0))::numeric
              / NEW.budgeted_amount;

  IF v_before >= v_threshold OR v_after < v_threshold THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = NEW.construction_site_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    recipient.id, s.company_id, 'budget_exceeded',
    format('Công trình %s: mã chi phí %s đã dùng %s%% ngân sách (gồm cả phần đã cam kết).',
           s.code, NEW.cost_code, round(v_after * 100)),
    'construction_sites', s.id,
    format('/tc/cong-trinh/%s?tab=ngan-sach', s.id)
  )
  FROM (
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (uc.company_id = s.company_id OR r.sees_all_companies)
      AND (r.code IN ('TC', 'CFO', 'TGD') OR u.id = s.responsible_user_id)
  ) recipient;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.budget_overrun_alert() IS
  'Cảnh báo sớm khi chi phí đã phát sinh + đã cam kết vượt 90% ngân sách của một mã chi phí (TC-05, NEN-04). Người nhận gồm cả vai trò xem toàn NVG (CFO/TGD). So sánh trước/sau bằng đúng cặp OLD/NEW, kể cả khi chính budgeted_amount bị sửa (0089).';

-- Trigger cũ chỉ bắt UPDATE OF actual_amount, committed_amount — bỏ lọt trường hợp sửa thẳng
-- budgeted_amount (0089).
DROP TRIGGER IF EXISTS project_budgets_overrun_alert ON public.project_budgets;

CREATE TRIGGER project_budgets_overrun_alert
  AFTER UPDATE OF actual_amount, committed_amount, budgeted_amount ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.budget_overrun_alert();
