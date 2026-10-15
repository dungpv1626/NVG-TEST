-- ============================================================================
-- Không ai tự phê duyệt hồ sơ do chính mình gửi.
--
-- Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 3): `decide_approval` (0088) chỉ kiểm hạn mức
-- (`rls_can_approve`), không so người duyệt với `approvals.requested_by` — Kinh doanh gửi báo
-- giá rồi tự duyệt được trong hạn mức 500 triệu của chính mình, và `my_pending_approvals`
-- đưa luôn hồ sơ của mình vào hộp thư. Chỗ chặn tự duyệt duy nhất trước đây là đề nghị vật tư
-- công trường (0134, 0138).
--
-- Chặn bằng TRIGGER trên `approval_decisions` thay vì sửa từng hàm duyệt: mọi loại phê duyệt
-- (báo giá, dự toán, hợp đồng, phụ lục, mua hàng, kho, đề nghị chi, nhân sự…) đều ghi qua bảng
-- này, nên một chỗ phủ hết — và không phải chép lại thân `decide_approval` ~300 dòng (bài học
-- 0086: chép tay hàm dài là sinh lỗi).
--
-- Chỉ chặn quyết định ĐỒNG Ý. Người gửi tự HUỶ đề nghị của mình (cancel_purchase_request 0037,
-- cancel_payment_request 0043…) ghi một dòng 'rejected' đứng tên chính họ — đó là rút lại, không
-- phải tự duyệt, và phải tiếp tục chạy.
--
-- Hàm SECURITY DEFINER cũng đi qua trigger này (khác `stage_changes_via_functions_only`): đây
-- là quy tắc nghiệp vụ, không phải hàng rào chống trình duyệt.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approval_decisions_no_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  a              record;
  v_beneficiary  uuid;
BEGIN
  IF NEW.decision <> 'approved' OR NEW.decided_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requested_by, entity_type, entity_id INTO a
    FROM public.approvals WHERE id = NEW.approval_id;

  -- Hồ sơ NHẬP HỘ: người gửi không phải người hưởng.
  --   · Đơn nghỉ — Nhân sự nhập thay nhân viên (đa số không có tài khoản), và chỉ vai trò NS
  --     duyệt đơn nghỉ. Người không được tự duyệt là CHÍNH NHÂN VIÊN trong đơn.
  --   · Yêu cầu tuyển dụng — Nhân sự lập thay phòng ban đề xuất; không có người hưởng cá nhân.
  --     Câu hỏi treo cho Haan: có cần người khác Nhân sự duyệt tuyển dụng không.
  IF a.entity_type = 'leave_requests' THEN
    SELECT e.user_id INTO v_beneficiary
      FROM public.leave_requests l JOIN public.employees e ON e.id = l.employee_id
     WHERE l.id = a.entity_id;
    IF v_beneficiary IS NOT NULL AND v_beneficiary = NEW.decided_by THEN
      RAISE EXCEPTION 'Không tự phê duyệt được đơn nghỉ của chính mình. Cần một người khác có quyền duyệt xử lý.';
    END IF;
    RETURN NEW;
  ELSIF a.entity_type = 'recruitment_positions' THEN
    RETURN NEW;
  END IF;

  IF a.requested_by IS NOT NULL AND a.requested_by = NEW.decided_by THEN
    RAISE EXCEPTION 'Không tự phê duyệt được hồ sơ do chính mình gửi. Cần một người khác có hạn mức phê duyệt xử lý.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.approval_decisions_no_self_approval() IS
  'Chặn người gửi tự ĐỒNG Ý hồ sơ của chính mình, mọi loại phê duyệt (0156). Tự huỷ (rejected) vẫn được.';

DROP TRIGGER IF EXISTS approval_decisions_no_self_approval ON public.approval_decisions;
CREATE TRIGGER approval_decisions_no_self_approval
  BEFORE INSERT ON public.approval_decisions
  FOR EACH ROW EXECUTE FUNCTION public.approval_decisions_no_self_approval();

-- Hộp thư phê duyệt: bỏ hồ sơ do chính mình gửi. Thân hàm giữ NGUYÊN VĂN 0113, chỉ thêm một
-- điều kiện ở WHERE.
CREATE OR REPLACE FUNCTION public.my_pending_approvals()
RETURNS TABLE (
  id                uuid,
  subject           approval_subject,
  entity_type       varchar(64),
  entity_id         uuid,
  entity_code       varchar(40),
  title             text,
  amount            bigint,
  reason            text,
  requested_at      timestamptz,
  requested_by_name text,
  company_code      varchar(8),
  company_name      varchar(64),
  parent_id         uuid,
  parent_module     varchar(8),
  due_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending AS (
    SELECT
      a.id, a.subject, a.entity_type, a.entity_id, a.entity_code, a.title, a.amount, a.reason,
      a.requested_at, u.full_name AS requested_by_name, c.code AS company_code,
      c.short_name AS company_name,
      CASE
        WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
        WHEN a.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
        WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
      END AS parent_id,
      CASE
        WHEN a.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
        WHEN a.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
      END AS parent_module,
      a.requested_at
        + make_interval(hours => public.sla_target_hours(a.subject::text, a.company_id))
        AS due_at
    FROM public.approvals a
    LEFT JOIN public.users     u ON u.id = a.requested_by
    LEFT JOIN public.companies c ON c.id = a.company_id
    LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
    LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
    LEFT JOIN public.contract_amendments am
           ON a.entity_type = 'contract_amendments' AND am.id = a.entity_id
    WHERE a.status = 'pending_approval'
      AND a.deleted_at IS NULL
      AND public.rls_can_approve(a.subject, a.company_id, a.amount)
      -- 0156: hồ sơ do chính mình gửi không nằm trong hộp thư của mình — không ai tự duyệt.
      AND a.requested_by IS DISTINCT FROM public.auth_user_id()
  )
  SELECT id, subject, entity_type, entity_id, entity_code, title, amount, reason,
         requested_at, requested_by_name, company_code, company_name,
         parent_id, parent_module::varchar(8), due_at
  FROM pending
  ORDER BY (due_at IS NOT NULL AND due_at < now()) DESC, due_at NULLS LAST, requested_at;
$$;

COMMENT ON FUNCTION public.my_pending_approvals() IS
  'Hồ sơ người dùng hiện tại thực sự duyệt được, kèm hồ sơ CHA (báo giá, dự toán, phát sinh hợp đồng) và hạn xử lý theo sla_definitions. Hồ sơ quá hạn lên đầu; hồ sơ chưa khai thời hạn có due_at rỗng và KHÔNG hiện đồng hồ (0113).';

REVOKE ALL ON FUNCTION public.my_pending_approvals() FROM public;
GRANT EXECUTE ON FUNCTION public.my_pending_approvals() TO authenticated;

-- Các bước kiểm tra đề nghị chi (đơn vị → kế toán → tài chính, 0043) ghi vào bảng riêng
-- `payment_request_steps`, không qua `approval_decisions` — cùng quy tắc, chặn riêng.
CREATE OR REPLACE FUNCTION public.payment_request_steps_no_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_requested_by uuid;
BEGIN
  IF NEW.decision <> 'approved' OR NEW.decided_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requested_by INTO v_requested_by
    FROM public.payment_requests WHERE id = NEW.payment_request_id;

  IF v_requested_by IS NOT NULL AND v_requested_by = NEW.decided_by THEN
    RAISE EXCEPTION 'Không tự xác nhận được đề nghị chi do chính mình lập. Cần một người khác ở bước này xử lý.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_request_steps_no_self_approval ON public.payment_request_steps;
CREATE TRIGGER payment_request_steps_no_self_approval
  BEFORE INSERT ON public.payment_request_steps
  FOR EACH ROW EXECUTE FUNCTION public.payment_request_steps_no_self_approval();
