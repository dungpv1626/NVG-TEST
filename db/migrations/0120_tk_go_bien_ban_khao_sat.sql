/**
 * Gỡ (xoá mềm) một biên bản khảo sát hiện trạng — đi qua HÀM, không qua UPDATE thẳng.
 *
 * Cùng lý do với `hide_design_survey_photo` (migration 0119): policy SELECT của
 * `design_surveys` loại dòng đã xoá, còn PostgREST luôn đọc lại dòng sau khi UPDATE, nên
 * một câu UPDATE đặt `deleted_at` bị chính policy SELECT từ chối. Hành vi của Postgres,
 * không phải lỗi cấu hình.
 *
 * Khác ảnh ở chỗ điều kiện quyền: biên bản khảo sát là hồ sơ **Mẫu B** — policy
 * `design_surveys_update` đòi thêm `rls_owner_can_write` ngoài `rls_design_project_writable`.
 * Hàm này lặp lại ĐÚNG điều kiện đó chứ không chỉ kiểm quyền sửa dự án: nới ra thì gỡ hẳn
 * một biên bản lại dễ hơn sửa một chữ trong đó, và người không được sửa số đo của người khác
 * vẫn xoá được nó.
 *
 * Không có đường xoá cứng. Số đo đã dùng để thiết kế phải truy được về sau —
 * `design_briefs.site_source_survey_id` vẫn trỏ tới dòng này.
 */

CREATE OR REPLACE FUNCTION public.hide_design_survey(p_survey_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project     uuid;
  v_company     uuid;
  v_surveyed_by uuid;
  v_responsible uuid;
BEGIN
  SELECT s.design_project_id, s.company_id, s.surveyed_by, p.responsible_user_id
    INTO v_project, v_company, v_surveyed_by, v_responsible
  FROM public.design_surveys s
  JOIN public.design_projects p ON p.id = s.design_project_id
  WHERE s.id = p_survey_id AND s.deleted_at IS NULL;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy biên bản khảo sát, hoặc biên bản đã được gỡ trước đó.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.rls_design_project_writable(v_project) THEN
    RAISE EXCEPTION 'Không gỡ được biên bản: tài khoản không được sửa hồ sơ thiết kế này. Người chịu trách nhiệm dự án hoặc Phòng Thiết kế thực hiện được.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.rls_owner_can_write(
      v_company,
      v_surveyed_by,
      array_remove(ARRAY[v_responsible], NULL::uuid)
    )
    OR (v_surveyed_by IS NULL AND public.auth_can_create_in('TK', v_company))
  ) THEN
    RAISE EXCEPTION 'Không gỡ được biên bản: chỉ người đi đo hoặc người chịu trách nhiệm dự án mới gỡ được.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.design_surveys
  SET deleted_at = now(), updated_by = public.auth_user_id()
  WHERE id = p_survey_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.hide_design_survey(uuid) FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.hide_design_survey(uuid) TO authenticated;
--> statement-breakpoint
COMMENT ON FUNCTION public.hide_design_survey(uuid) IS
  'Xoá mềm một biên bản khảo sát hiện trạng sau khi kiểm đúng điều kiện của policy design_surveys_update (Mẫu B). Không có đường xoá cứng từ trình duyệt.';
