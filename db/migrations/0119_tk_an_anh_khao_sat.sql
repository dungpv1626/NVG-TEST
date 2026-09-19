/**
 * Ẩn (xoá mềm) một ảnh hiện trạng — đi qua HÀM, không qua UPDATE thẳng từ trình duyệt.
 *
 * Vì sao cần hàm: policy SELECT của `design_survey_photos` loại dòng đã xoá (đúng), còn
 * PostgREST luôn đọc lại dòng sau khi UPDATE để đếm kết quả — nên một câu UPDATE đặt
 * `deleted_at` bị chính policy SELECT từ chối ("new row violates row-level security policy").
 * Đây là hành vi của Postgres, không phải lỗi cấu hình; và đây cũng là lần đầu một module cho
 * xoá mềm từ trình duyệt (các module khác không xoá gì từ giao diện).
 *
 * Hàm kiểm đúng quyền mà policy UPDATE kiểm (`rls_design_project_writable`), rồi mới ghi.
 * Không có đường xoá cứng: ảnh hiện trạng là chứng cứ.
 */

CREATE OR REPLACE FUNCTION public.hide_design_survey_photo(p_photo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project uuid;
BEGIN
  SELECT design_project_id INTO v_project
  FROM public.design_survey_photos
  WHERE id = p_photo_id AND deleted_at IS NULL;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy ảnh, hoặc ảnh đã được ẩn trước đó.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.rls_design_project_writable(v_project) THEN
    RAISE EXCEPTION 'Không ẩn được ảnh: tài khoản không được sửa hồ sơ thiết kế này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.design_survey_photos
  SET deleted_at = now(), updated_by = public.auth_user_id()
  WHERE id = p_photo_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.hide_design_survey_photo(uuid) FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.hide_design_survey_photo(uuid) TO authenticated;
--> statement-breakpoint
COMMENT ON FUNCTION public.hide_design_survey_photo(uuid) IS
  'Xoá mềm một ảnh hiện trạng khảo sát sau khi kiểm rls_design_project_writable. Không có đường xoá cứng từ trình duyệt.';
