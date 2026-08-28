-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện `execute_amendment`
-- (HD-04, sửa gần nhất ở 0074) áp `contract_amendments.value_change` vào `contracts.value`
-- nhưng KHÔNG hề đụng tới trường song song `schedule_impact_days` — không hàm nào khác trong
-- toàn bộ hệ thống áp trường này vào `contracts.end_date`. Một phát sinh gia hạn tiến độ
-- (`schedule_impact_days = '+30'`, `value_change = 0`) chạy hết luồng duyệt → khách xác nhận
-- → thực hiện vẫn để `contracts.end_date` đứng yên ở hạn gốc — báo cáo quá hạn tính sai vĩnh
-- viễn trên chính hợp đồng vừa được gia hạn hợp lệ.
--
-- `schedule_impact_days` là `varchar(8)` (0026_hd_schema.sql, không phải số nguyên như cột
-- cùng tên bên `design_change_requests` của 0023) — không có ràng buộc CHECK nào bảo đảm đây
-- là số. Vá tại đây kiểm định dạng tường minh trước khi ép kiểu, để dữ liệu rác không làm vỡ
-- luồng thực hiện phát sinh bằng lỗi ép kiểu khó hiểu.
--
-- Chỉ cộng khi hợp đồng ĐÃ có `end_date` — hợp đồng chưa có hạn (NULL) thì "gia hạn thêm N
-- ngày" không có mốc gốc để cộng vào, giữ nguyên NULL thay vì suy diễn một ngày không có căn cứ.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.execute_amendment(p_amendment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  v_days text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.contract_amendments
   WHERE id = p_amendment_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_contract_writable(a.contract_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên phát sinh này.';
  END IF;

  IF a.stage = 'da_thuc_hien' THEN
    RAISE EXCEPTION 'Phát sinh này đã được ghi nhận thực hiện.';
  END IF;

  IF a.stage = 'tu_choi' THEN
    RAISE EXCEPTION 'Phát sinh này đã có kết luận không thực hiện.';
  END IF;

  IF a.is_emergency THEN
    -- Ràng buộc CHECK ở 0026 đã bảo đảm có người cho phép; kiểm lại ở đây để thông báo lỗi
    -- nói đúng việc phải làm thay vì để CSDL trả về tên ràng buộc.
    IF a.emergency_authorized_by IS NULL THEN
      RAISE EXCEPTION 'Trường hợp khẩn cấp phải ghi rõ người có thẩm quyền đã cho phép (HD-04).';
    END IF;
  ELSE
    IF a.stage <> 'da_duyet' THEN
      RAISE EXCEPTION 'Phát sinh chưa được phê duyệt nội bộ. Trình duyệt trước khi thực hiện.';
    END IF;

    IF a.customer_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'Chưa có xác nhận của khách hàng. Không thực hiện phát sinh trước khi khách đồng ý (HD-04).';
    END IF;
  END IF;

  v_days := NULLIF(btrim(a.schedule_impact_days), '');
  IF v_days IS NOT NULL AND v_days !~ '^[+-]?[0-9]+$' THEN
    RAISE EXCEPTION 'Số ngày ảnh hưởng tiến độ "%": không đúng định dạng số nguyên.', v_days;
  END IF;

  UPDATE public.contract_amendments
     SET stage = 'da_thuc_hien', executed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_amendment_id;

  -- Cộng vào giá trị hợp đồng đúng một lần, đúng lúc phát sinh chuyển sang "đã thực hiện"
  -- (0074) — trước đây giá trị này không bao giờ được áp dụng, làm sai `profit_loss_report`.
  -- COALESCE(value, 0): `value` chưa NOT NULL (hợp đồng có thể còn ở bước soạn, giá trị chưa
  -- nhập, khi có phát sinh khẩn cấp thực hiện trước) — NULL + số sẽ ra NULL, mất luôn giá trị.
  UPDATE public.contracts
     SET value = COALESCE(value, 0) + a.value_change,
         end_date = CASE WHEN v_days IS NOT NULL AND end_date IS NOT NULL
                      THEN end_date + v_days::integer
                      ELSE end_date
                    END,
         updated_at = now(), updated_by = v_user
   WHERE id = a.contract_id;
END;
$$;

COMMENT ON FUNCTION public.execute_amendment(uuid) IS
  'Ghi nhận phát sinh đã thực hiện — chỉ khi đã duyệt VÀ khách xác nhận, hoặc khẩn cấp có người cho phép (HD-04). Cộng value_change vào contracts.value (0074) và schedule_impact_days vào contracts.end_date (0090), đúng một lần.';
