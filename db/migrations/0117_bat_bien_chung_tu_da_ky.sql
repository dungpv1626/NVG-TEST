/**
 * Quy tắc bất biến của chứng từ đã phát hành — Backend Schema v1.1 Mục 3.5 (MỚI ở v1.1).
 *
 * Ba nhóm dữ liệu không được sửa trực tiếp sau khi phát hành; mọi thay đổi phải là một chứng
 * từ điều chỉnh MỚI có người duyệt:
 *
 *   1. Chứng từ giao nhận và thu hồi giàn giáo có chữ ký hai bên  → bảng chưa tồn tại (đợt SX)
 *   2. Biên bản nghiệm thu ĐÃ KÝ với Chủ đầu tư / Tư vấn giám sát → làm ở migration này
 *   3. Chứng từ kế toán thuộc kỳ đã khoá                          → đã có `close_accounting_period()`
 *
 * ## Vì sao đây không phải chuyện thừa
 *
 * `acceptance_records` đã được bảo vệ một phần: `freeze_record_identity` khoá mã, pháp nhân,
 * công trình và loại nghiệm thu; `stage_changes_via_functions_only` bắt `status`/`accepted_at`
 * đi qua hàm nghiệp vụ. Nhưng NỘI DUNG của biên bản — khối lượng, giá trị, ghi chú, kết luận —
 * vẫn sửa được sau khi đã ký.
 *
 * Đó chính là chỗ khảo sát Chỉ huy – Giám sát công trường chỉ ra là nguồn tranh chấp: biên bản
 * đã ký với Chủ đầu tư là căn cứ thanh toán, và một biên bản còn sửa được sau khi ký thì bên
 * kia chỉ cần hỏi "sửa lần cuối khi nào" là mất giá trị chứng cứ — cùng lý lẽ đã dùng cho cửa
 * sổ sửa nhật ký ở 0035.
 *
 * ## Chặn ở CSDL, không chặn ở giao diện
 *
 * Ẩn nút Sửa trên màn hình là đủ cho người dùng bình thường, nhưng `acceptance_records` mở
 * UPDATE cho vai trò TC qua PostgREST — một câu PATCH thẳng vào REST là đi vòng qua giao diện.
 * Cưỡng chế phải nằm cùng chỗ với dữ liệu.
 */

CREATE OR REPLACE FUNCTION public.frozen_after_signed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_row jsonb := to_jsonb(OLD);
  new_row jsonb := to_jsonb(NEW);
  signed_col text := TG_ARGV[0];
  col text;
  i int;
BEGIN
  /*
   * KHÔNG cho hàm nghiệp vụ SECURITY DEFINER đi qua tự do — khác `site_logs_edit_window`
   * (0035) và `stage_changes_via_functions_only` (0028).
   *
   * Hai guard đó mở đường cho SECURITY DEFINER vì có RPC hợp lệ cần đi xuyên qua (chuyển
   * bước công trình, v.v.). Guard này thì KHÔNG: đã rà toàn bộ hàm ghi `acceptance_records`
   * sau khi ký — `record_acceptance` chỉ INSERT (bản ghi sinh ra đã ký ngay, không có bước
   * "nháp rồi ký" cần UPDATE); `cancel_acceptance` chỉ đổi `status`/`cancel_reason`, không
   * đụng cột nào bị khoá ở đây. Không có lối đi hợp lệ nào cần mở, nên mở sẵn một lối chỉ
   * để lại một lỗ hổng chờ hàm SECURITY DEFINER tương lai vô tình chui qua mà không ai biết
   * — đúng thứ Backend Schema v1.1 3.5 yêu cầu chặn ("mọi thay đổi phải là chứng từ điều
   * chỉnh mới có người duyệt", không có ngoại lệ ngầm). Khi có RPC "chứng từ điều chỉnh"
   * thật, nó tạo bản ghi MỚI (đúng nguyên văn 3.5) chứ không mở khoá bản ghi cũ — nên
   * guard này không cần biết tới nó.
   */

  -- Chưa ký thì còn sửa thoải mái: bản nháp biên bản là thứ người ta soạn nhiều lần.
  IF old_row ->> signed_col IS NULL THEN
    RETURN NEW;
  END IF;

  FOR i IN 1 .. array_length(TG_ARGV, 1) - 1 LOOP
    col := TG_ARGV[i];
    IF new_row ->> col IS DISTINCT FROM old_row ->> col THEN
      RAISE EXCEPTION
        'Không sửa được nội dung biên bản đã ký. Lập biên bản điều chỉnh mới và gửi phê duyệt — biên bản đã ký là căn cứ thanh toán, sửa được thì không còn giá trị đối chứng.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.frozen_after_signed() IS
  'Khoá nội dung chứng từ sau khi đã ký (Backend Schema v1.1 3.5). Tham số đầu = cột mốc ký, các tham số sau = cột bị khoá.';


/**
 * Cột nào bị khoá sau khi ký.
 *
 * Chọn theo nguyên tắc: khoá thứ ĐỐI TÁC ĐÃ NHÌN VÀ KÝ VÀO, để nguyên thứ chỉ phục vụ nội bộ.
 * Ghi chú nội bộ và tệp đính kèm bổ sung không nằm trong danh sách — đính kèm thêm ảnh chụp
 * biên bản giấy sau khi ký là việc hợp lệ và thường xuyên, chặn nó chỉ đẩy người dùng sang
 * kênh khác (đúng vướng mắc "thông tin chỉ nằm trong Zalo rồi trôi mất").
 */
CREATE TRIGGER acceptance_records_frozen_after_signed
  BEFORE UPDATE ON public.acceptance_records
  FOR EACH ROW EXECUTE FUNCTION public.frozen_after_signed(
    'accepted_at',
    'stage_name', 'scope', 'value', 'accepted_date', 'accepted_by',
    'counterpart_signed_by', 'subcontractor_id'
  );
