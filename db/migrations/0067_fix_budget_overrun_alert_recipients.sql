-- ============================================================================
-- Vá lỗi: budget_overrun_alert() không bao giờ báo được cho CFO (TC-05, NEN-04)
--
-- Phát hiện khi viết test cho trigger `project_budgets_overrun_alert` (0035_tc_rls.sql) —
-- trigger này đứng từ Phase 3A nhưng CHƯA từng có test, nên lỗi lọt qua tới giờ.
--
-- Đúng lớp lỗi mà CLAUDE.md 3.5 đã cảnh báo: điều kiện cứng `uc.company_id = s.company_id`
-- coi mọi vai trò nhận thông báo như nhau, nhưng CFO chỉ được gán vào pháp nhân tổng hợp
-- "NVG" (`db/src/seed/data.ts`), không gán riêng vào NVC/NVS/NVO — nên với MỌI công trình
-- thật (luôn thuộc một trong ba pháp nhân giao dịch), điều kiện đó không bao giờ đúng với
-- CFO dù `role.sees_all_companies = true` và role code nằm trong danh sách nhận
-- ('TC', 'CFO', 'TGD'). TGD không lộ lỗi này vì được gán riêng vào cả 4 pháp nhân
-- (`db/src/seed/data.ts`) nên luôn có một dòng `user_companies` khớp thẳng — che mất lỗi khi
-- test thủ công chỉ đăng nhập bằng tài khoản TGD.
--
-- Sửa: dùng lại đúng mẫu `(uc.company_id = ... OR r.sees_all_companies)` đã có sẵn ở
-- `confirm_stocktake`/`decide_payment_request` (0049_ns_rls.sql). Vì sửa này khiến một người
-- có NHIỀU dòng `user_companies` cùng thoả điều kiện (TGD: 4 pháp nhân, đều
-- `sees_all_companies = true`) — phải gói UUID người nhận qua `SELECT DISTINCT` trước khi gọi
-- `create_notification`, nếu không TGD sẽ nhận 4 thông báo trùng nhau cho cùng một lần vượt
-- ngân sách.
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

  v_before := (COALESCE(OLD.actual_amount, 0) + COALESCE(OLD.committed_amount, 0))::numeric
              / NEW.budgeted_amount;
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
  'Cảnh báo sớm khi chi phí đã phát sinh + đã cam kết vượt 90% ngân sách của một mã chi phí (TC-05, NEN-04). Người nhận gồm cả vai trò xem toàn NVG (CFO/TGD), không chỉ người khớp đúng company_id.';
