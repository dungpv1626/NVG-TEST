-- ============================================================================
-- Bước trạng thái chỉ đổi được qua hàm nghiệp vụ, không đổi thẳng từ trình duyệt
--
-- LỖ HỔNG PHÁT HIỆN KHI VIẾT TEST MODULE HD — có ở CẢ ba module DA, TK, HD.
--
-- Mẫu policy đang dùng khắp nơi:
--
--     CREATE POLICY x_update ON t FOR UPDATE
--       USING (... AND stage = 'nhap')          -- dòng ĐANG ở bước nào
--       WITH CHECK (rls_company_access(...));   -- dòng SẼ thành cái gì  ← không kiểm bước
--
-- `USING` chỉ nói "được đụng vào dòng đang ở bước Nháp"; `WITH CHECK` mới nói "sau khi sửa
-- dòng được phép trông như thế nào". Không kiểm bước ở `WITH CHECK` nghĩa là một câu
-- PostgREST duy nhất làm được điều này:
--
--     PATCH /rest/v1/contracts?id=eq.… {"stage": "da_ky"}
--
-- Dòng đang ở 'nhap' nên qua `USING`; kết quả chỉ cần đúng pháp nhân nên qua `WITH CHECK`.
-- Toàn bộ hạn mức phê duyệt HD-05 bị bỏ qua mà không để lại dấu vết nào — không có hồ sơ
-- trong `approvals`, không có dòng nào trong `approval_decisions`.
--
-- Tương tự: `bidding_projects.stage = 'trung_thau'` bỏ qua kiểm tra của `submit_bid`
-- (DA-08), và `design_projects.stage = 'ban_giao'` bỏ qua kiểm tra đồng bộ đa bộ môn của
-- `handover_design_to_construction` (TK-08).
--
-- CÁCH CHẶN: một trigger chung, chỉ chặn khi lệnh đến TỪ TRÌNH DUYỆT.
--
-- Phân biệt bằng `current_user`: PostgREST đặt vai trò `authenticated` cho request của người
-- dùng, còn hàm `SECURITY DEFINER` chạy dưới quyền chủ sở hữu (`postgres`). Nên trigger chặn
-- khi `current_user = 'authenticated'` và cho qua khi hàm nghiệp vụ gọi — không cần cờ phiên
-- hay biến cấu hình nào, và không có đường vòng: PostgREST không đổi được vai trò của mình.
--
-- Vì sao là trigger chứ không phải sửa `WITH CHECK`: `WITH CHECK` không nhìn được giá trị
-- CŨ của dòng, nên nó chỉ diễn đạt được "bước phải bằng hằng số X", không diễn đạt được
-- "bước phải giữ nguyên". Với `design_projects` — nơi bước đổi qua `move_design_stage` mà
-- các cột khác vẫn sửa thẳng được — hằng số đó không tồn tại.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stage_changes_via_functions_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  guarded text;
BEGIN
  -- Hàm nghiệp vụ (SECURITY DEFINER, chủ sở hữu `postgres`) đi qua tự do: chính chúng là
  -- nơi đặt các điều kiện của bước, nên chặn chúng là chặn nhầm.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  FOREACH guarded IN ARRAY TG_ARGV LOOP
    IF new_row ->> guarded IS DISTINCT FROM old_row ->> guarded THEN
      RAISE EXCEPTION
        'Không đổi trực tiếp được trạng thái hồ sơ. Dùng đúng nút thao tác trên màn hình để hệ thống kiểm tra các điều kiện kèm theo.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stage_changes_via_functions_only() IS
  'Chặn đổi cột trạng thái bằng UPDATE thẳng từ trình duyệt; hàm nghiệp vụ SECURITY DEFINER vẫn đổi được.';


-- --- Module DA (DA-08) ------------------------------------------------------
-- `submitted_at` và `budget_generated_at` cũng nằm trong danh sách: đặt tay `submitted_at`
-- là tự khoá hồ sơ mà chưa nộp gì, còn đặt tay `budget_generated_at` là chặn vĩnh viễn việc
-- sinh ngân sách thi công thật (DA-09).
CREATE TRIGGER bidding_projects_stage_guard
  BEFORE UPDATE ON public.bidding_projects
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'submitted_at', 'budget_generated_at'
  );

-- Dự toán: `status` đổi qua `request_estimate_approval`/`decide_approval`, `approved_at` là
-- dấu của chữ ký phê duyệt, `is_current_version` do trigger cấp phiên bản quản lý.
CREATE TRIGGER estimates_stage_guard
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'approved_at', 'is_current_version'
  );

-- --- Module TK (TK-03, TK-05, TK-08) ----------------------------------------
CREATE TRIGGER design_projects_stage_guard
  BEFORE UPDATE ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'handed_over_at', 'construction_site_id'
  );

-- Phiên bản bản vẽ: phát hành và xác nhận của khách là hai thứ tuyệt đối không tự khai được.
-- `is_current_version` quyết định bản nào công trường đang cầm — chính là vướng mắc #9.
CREATE TRIGGER design_versions_stage_guard
  BEFORE UPDATE ON public.design_versions
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'is_current_version', 'published_at', 'published_by', 'customer_approved_at'
  );

CREATE TRIGGER design_briefs_stage_guard
  BEFORE UPDATE ON public.design_briefs
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only('is_current_version');

-- --- Module HD (HD-04, HD-05) -----------------------------------------------
CREATE TRIGGER contracts_stage_guard
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'approved_at', 'signed_at', 'settled_at', 'contract_number'
  );

-- Phát sinh: `customer_confirmed_at` nằm trong danh sách vì đó chính là thứ HD-04 dựng lên
-- để chặn "làm trước, hợp thức hóa sau" — tự khai được thì cả điều khoản đó vô nghĩa.
CREATE TRIGGER contract_amendments_stage_guard
  BEFORE UPDATE ON public.contract_amendments
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'approved_at', 'executed_at', 'customer_confirmed_at', 'customer_confirmed_by'
  );

-- --- Module CRM (CRM-04, CRM-05) --------------------------------------------
-- Báo giá đã có cơ chế riêng từ 0012/0013, nhưng cùng lỗ hổng: `status` và
-- `sent_to_customer_at` đặt tay được là gửi báo giá ra ngoài mà chưa qua duyệt nội bộ.
CREATE TRIGGER quotes_stage_guard
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'sent_to_customer_at', 'is_current_version'
  );
