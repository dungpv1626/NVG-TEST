-- ============================================================================
-- Rà tuần tự business logic của các hàm ghi dữ liệu (phần "Chưa làm" còn lại của 4B) lộ ra:
-- `execute_amendment` (HD-04) không bao giờ cộng `contract_amendments.value_change` vào
-- `contracts.value`. Suốt vòng đời đề xuất → phê duyệt → khách xác nhận → thực hiện, KHÔNG
-- hàm nào khác làm việc này (`decide_approval`, `close_contract` cũng không đụng tới `value`).
--
-- Hậu quả: sau khi một phát sinh chạy hết luồng, giá trị hợp đồng vẫn đứng yên ở số gốc mãi
-- mãi — không lỗi, không cảnh báo. `profit_loss_report` (0056_bc_profit_loss.sql) đọc thẳng
-- `contracts.value` để tính doanh thu/lãi-lỗ (BC-02) — comment gốc của 0056 giả định
-- "contracts.value đã có, KT/HD cập nhật khi có chứng từ", giả định đó chưa từng đúng cho
-- nhánh phát sinh. Một công trình có phát sinh đã thực hiện sẽ báo cáo lãi/lỗ sai vĩnh viễn.
--
-- Vá: cộng `value_change` vào `contracts.value` ngay khi `execute_amendment` đánh dấu phát
-- sinh đã thực hiện — đúng một lần, đúng lúc phát sinh CHUYỂN sang trạng thái này (không cộng
-- lại nếu gọi lại hàm khi đã `da_thuc_hien`, vì hàm đã chặn từ đầu bằng exception ở dòng
-- kiểm `a.stage = 'da_thuc_hien'`).
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
         updated_at = now(), updated_by = v_user
   WHERE id = a.contract_id;
END;
$$;

COMMENT ON FUNCTION public.execute_amendment(uuid) IS
  'Ghi nhận phát sinh đã thực hiện — chỉ khi đã duyệt VÀ khách xác nhận, hoặc khẩn cấp có người cho phép (HD-04). Cộng value_change vào contracts.value đúng một lần, COALESCE khi value còn NULL (0074).';
