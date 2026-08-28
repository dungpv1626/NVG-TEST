-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `create_contract_from_source`
-- (0027_hd_rls.sql) làm rỗng giá trị hợp đồng một cách âm thầm khi tạo từ gói thầu chưa có
-- dự toán đã duyệt.
--
-- Nhánh `bidding_projects`: câu SELECT đầu gán `v_value := b.estimated_value` (giá trị ước
-- tính, dùng làm phương án dự phòng theo đúng comment của hàm). Câu SELECT thứ hai
-- `SELECT e.id, e.bid_price INTO v_estimate, v_value ...` khi KHÔNG có dự toán hiện hành đã
-- duyệt (0 dòng) sẽ theo đúng ngữ nghĩa PL/pgSQL của SELECT INTO không STRICT: đặt LẠI TẤT
-- CẢ biến đích về NULL — kể cả `v_value` vừa gán ở câu trên. Hợp đồng được tạo với
-- `value = NULL` mà không báo lỗi gì, làm sai `profit_loss_report` và mọi kiểm tra hạn mức
-- phê duyệt theo giá trị hợp đồng.
--
-- Vá: gán bid_price của dự toán vào một biến riêng (`v_estimate_price`), chỉ ghi đè `v_value`
-- khi thật sự tìm thấy dự toán (`v_estimate IS NOT NULL`) — không còn để câu SELECT không
-- tìm thấy dòng nào xoá mất giá trị đã có từ câu trước. Áp dụng cùng cách cho nhánh
-- `design_projects` để nhất quán, dù nhánh đó chưa có giá trị dự phòng nào bị mất trước đó.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_contract_from_source(
  p_source_type contract_source_type,
  p_source_id uuid,
  p_type contract_type,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.auth_user_id();
  v_company     uuid;
  v_customer    uuid;
  v_name        text;
  v_value       bigint;
  v_estimate    uuid;
  v_estimate_price bigint;
  v_company_code text;
  v_code        text;
  v_contract    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- Lấy dữ liệu nguồn. Giá trị ưu tiên bản dự toán ĐÃ DUYỆT đang hiệu lực; không có thì
  -- mới dùng con số ước tính, và khi đó `estimate_id` để rỗng chứ không trỏ bừa.
  IF p_source_type = 'opportunities' THEN
    SELECT o.company_id, o.customer_id, o.name INTO v_company, v_customer, v_name
      FROM public.opportunities o WHERE o.id = p_source_id AND o.deleted_at IS NULL;

    -- Với cơ hội, giá trị đến từ báo giá đang hiệu lực đã được duyệt (CRM-04).
    SELECT q.total_value INTO v_value
      FROM public.quotes q
     WHERE q.opportunity_id = p_source_id
       AND q.is_current_version AND q.deleted_at IS NULL AND q.status = 'completed';

  ELSIF p_source_type = 'bidding_projects' THEN
    SELECT b.company_id, b.customer_id, b.name, b.estimated_value
      INTO v_company, v_customer, v_name, v_value
      FROM public.bidding_projects b WHERE b.id = p_source_id AND b.deleted_at IS NULL;

    -- Không dùng "INTO v_estimate, v_value" trực tiếp: khi không có dòng nào khớp, SELECT
    -- INTO không STRICT đặt lại TẤT CẢ biến đích về NULL — kể cả v_value vừa gán ở trên (0087).
    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.bidding_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;

  ELSE
    SELECT d.company_id, d.customer_id, d.name INTO v_company, v_customer, v_name
      FROM public.design_projects d WHERE d.id = p_source_id AND d.deleted_at IS NULL;

    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.design_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn, hoặc hồ sơ đã bị xóa.';
  END IF;

  IF NOT public.auth_can_create_in('HD', v_company) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được soạn hợp đồng trong pháp nhân này.';
  END IF;

  -- Một hồ sơ nguồn chỉ sinh MỘT hợp đồng còn hiệu lực. Hai hợp đồng cho cùng một gói thầu
  -- nghĩa là doanh thu bị đếm hai lần ở báo cáo, mà không có dấu hiệu nào để nhận ra.
  IF EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.source_type = p_source_type AND c.source_id = p_source_id
       AND c.deleted_at IS NULL AND c.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Hồ sơ này đã có hợp đồng. Mở hợp đồng hiện có thay vì soạn bản mới.';
  END IF;

  SELECT code INTO v_company_code FROM public.companies WHERE id = v_company;
  v_code := public.next_record_code(v_company_code, 'HD');

  INSERT INTO public.contracts (
    company_id, code, title, type, source_type, source_id, estimate_id,
    customer_id, responsible_user_id, value
  )
  VALUES (
    v_company, v_code, COALESCE(NULLIF(btrim(p_title), ''), v_name), p_type,
    p_source_type, p_source_id, v_estimate, v_customer, v_user, v_value
  )
  RETURNING id INTO v_contract;

  RETURN v_contract;
END;
$$;

COMMENT ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text) IS
  'Soạn hợp đồng từ cơ hội / gói thầu / dự án thiết kế, lấy sẵn khách hàng và giá đã duyệt — không nhập lại (HD-01). Chưa có dự toán đã duyệt thì giữ giá ước tính, không bị SELECT INTO ghi đè thành NULL (0087).';
