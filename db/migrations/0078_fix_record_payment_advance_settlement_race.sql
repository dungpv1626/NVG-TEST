-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `record_payment` không
-- kiểm lại giới hạn hoàn ứng tại thời điểm CHI, chỉ dựa vào lượt kiểm MỘT LẦN ở
-- `submit_payment_request` (lúc GỬI đi, không khoá dòng `advances`).
--
-- Kịch bản: một khoản tạm ứng còn nợ 10 triệu. Hai đề nghị hoàn ứng (mỗi cái 8 triệu) đều
-- được TẠO và GỬI khi `adv.settled_amount` vẫn là 0 — cả hai qua được kiểm ở
-- `submit_payment_request` (8tr ≤ 10tr, đọc độc lập không FOR UPDATE, không thấy nhau). Khi
-- lần lượt được duyệt và ghi nhận đã chi qua `record_payment`: hồ sơ đầu cộng `settled_amount`
-- thành 8tr (đúng), hồ sơ thứ hai cộng tiếp thành 16tr — VƯỢT `advances.amount` (10tr) — mà
-- KHÔNG có exception nào chặn, dù hàm đã khoá dòng `adv FOR UPDATE` ngay trước đó (khoá xong
-- nhưng không dùng để kiểm lại). Hệ quả: `advances.settled_amount` vượt `amount`, khoản tạm
-- ứng bị đánh dấu `da_hoan` sai, số "còn nợ" hiển thị âm cho người dùng.
--
-- Vá: kiểm lại đúng điều kiện `submit_payment_request` đã dùng, NGAY SAU khi khoá dòng
-- `advances FOR UPDATE` trong `record_payment` — đây là nơi duy nhất thật sự chặn được race,
-- vì hai giao dịch chi cùng lúc cho cùng một khoản tạm ứng sẽ tuần tự hoá tại chính câu khoá
-- này (giống cách `advance_payment_step` khoá `payment_requests FOR UPDATE` để tránh lặp
-- bước).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_payment(
  p_request_id uuid,
  p_paid_date date,
  p_method payment_method,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  pr      record;
  adv     record;
  v_paid  date := COALESCE(p_paid_date, current_date);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(pr.company_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị chi này.';
  END IF;

  -- Người kiểm và người chi là hai vai khác nhau (PRD 2.3): ghi nhận đã chi là việc của
  -- Kế toán – Tài chính, không phải của người đề nghị.
  IF NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Ghi nhận đã chi do Kế toán – Tài chính thực hiện.';
  END IF;

  IF pr.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ ghi nhận đã chi cho đề nghị đã được phê duyệt. Hồ sơ này đang ở bước khác.';
  END IF;

  IF v_paid > current_date THEN
    RAISE EXCEPTION 'Ngày chi nằm ở tương lai. Chọn ngày đã thực hiện chi.';
  END IF;

  -- Khoá trước và kiểm lại giới hạn hoàn ứng NGAY TẠI ĐÂY (0078) — check ở
  -- submit_payment_request không khoá dòng nên hai đề nghị hoàn ứng cùng khoản tạm ứng gửi
  -- gần như đồng thời có thể cùng lọt qua đó; đây là nơi duy nhất chặn được race thật sự.
  IF pr.request_type = 'hoan_ung' AND pr.settles_advance_id IS NOT NULL THEN
    SELECT * INTO adv FROM public.advances
     WHERE id = pr.settles_advance_id FOR UPDATE;

    IF pr.amount > adv.amount - adv.settled_amount THEN
      RAISE EXCEPTION 'Số hoàn (% đồng) lớn hơn số còn nợ của khoản tạm ứng (% đồng).',
        to_char(pr.amount, 'FM999,999,999,999'),
        to_char(adv.amount - adv.settled_amount, 'FM999,999,999,999');
    END IF;
  END IF;

  UPDATE public.payment_requests
     SET stage = 'da_chi',
         paid_date = v_paid,
         paid_amount = pr.amount,
         payment_method = p_method,
         payment_reference = NULLIF(btrim(p_reference), ''),
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;

  PERFORM public.post_payment_to_budget(p_request_id);

  /* --- Tạm ứng: khoản nợ phát sinh đúng lúc tiền ra, không sớm hơn (KT-03) --- */
  IF pr.request_type = 'tam_ung' THEN
    INSERT INTO public.advances (
      company_id, payment_request_id, user_id, purpose, amount,
      advance_date, due_date, status, created_by, updated_by
    )
    VALUES (
      pr.company_id, pr.id, pr.advance_user_id, pr.title, pr.amount,
      v_paid, pr.advance_due_date, 'dang_no', v_user, v_user
    );
  END IF;

  /* --- Hoàn ứng: trừ vào khoản nợ cũ --- */
  IF pr.request_type = 'hoan_ung' AND pr.settles_advance_id IS NOT NULL THEN
    UPDATE public.advances
       SET settled_amount = settled_amount + pr.amount,
           status = CASE WHEN adv.settled_amount + pr.amount >= adv.amount
                         THEN 'da_hoan' ELSE 'dang_no' END::advance_status,
           settled_at = CASE WHEN adv.settled_amount + pr.amount >= adv.amount
                             THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = pr.settles_advance_id;
  END IF;

  /* --- Công nợ phải trả: ghi một dòng chứng từ, không sửa tổng bằng tay (KT-04) --- */
  IF pr.receivable_id IS NOT NULL THEN
    INSERT INTO public.receivable_settlements (
      receivable_id, settled_date, amount, method, reference,
      payment_request_id, notes, created_by, updated_by
    )
    VALUES (
      pr.receivable_id, v_paid, pr.amount, p_method, NULLIF(btrim(p_reference), ''),
      pr.id, format('Chi theo đề nghị %s', COALESCE(pr.code, '')), v_user, v_user
    );
  END IF;

  PERFORM public.create_notification(
    pr.requested_by, pr.company_id, 'payment_request_paid',
    format('Đề nghị chi %s đã được chi %s đồng ngày %s.',
           COALESCE(pr.code, ''), to_char(pr.amount, 'FM999,999,999,999'),
           to_char(v_paid, 'DD/MM/YYYY')),
    'payment_requests', pr.id,
    format('/kt/de-nghi-thanh-toan/%s', pr.id)
  );
END;
$$;

COMMENT ON FUNCTION public.record_payment(uuid, date, payment_method, text) IS
  'Ghi nhận đã chi cho đề nghị đã duyệt — kiểm lại giới hạn hoàn ứng SAU khi khoá dòng advances để chặn race hai đề nghị hoàn ứng cùng lúc (0078).';
