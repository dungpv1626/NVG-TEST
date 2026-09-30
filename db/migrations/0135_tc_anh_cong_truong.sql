-- ============================================================================
-- TC-05 — ảnh hiện trường gắn vào nhật ký công trường.
--
-- `site_logs.photo_urls` có từ 0034 nhưng chưa từng có chỗ tải ảnh lên. Khảo sát công trường:
-- ảnh là bằng chứng chỉ huy trưởng gửi qua Zalo mỗi ngày — không có trên hệ thống thì nhật ký
-- vẫn phải đi kèm một luồng Zalo song song, đúng thứ phần mềm sinh ra để thay.
--
-- Cùng khuôn với ảnh khảo sát của Module Thiết kế (0118):
--   · bucket RIÊNG, riêng tư; quy ước đường dẫn `<construction_site_id>/<loại>/<uuid>.<đuôi>`;
--   · quyền đọc/ghi tệp đi theo công trình ở thư mục đầu — Mẫu A + E qua rls_site_readable /
--     rls_site_writable, cùng hàm mà chính sách của `site_logs` dùng;
--   · không có chính sách xoá: ảnh là bằng chứng.
--
-- `photo_urls` giữ tên cũ nhưng chứa ĐƯỜNG DẪN trong bucket, không phải URL — URL ký có hạn và
-- được tạo lúc xem. Trigger bắt mọi đường dẫn phải nằm dưới thư mục của đúng công trình của mục
-- nhật ký: nếu không, chính sách đọc tệp và chính sách đọc nhật ký sẽ nói hai điều khác nhau.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'construction-photos',
  'construction-photos',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS construction_photos_select ON storage.objects;
CREATE POLICY construction_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'construction-photos'
    AND public.rls_site_readable(public.try_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS construction_photos_insert ON storage.objects;
CREATE POLICY construction_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'construction-photos'
    AND public.rls_site_writable(public.try_uuid((storage.foldername(name))[1]))
  );


CREATE OR REPLACE FUNCTION public.site_logs_photo_paths_match_site()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  p text;
BEGIN
  IF NEW.photo_urls IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH p IN ARRAY NEW.photo_urls LOOP
    IF p IS NULL OR left(p, length(NEW.construction_site_id::text) + 1) <> NEW.construction_site_id::text || '/' THEN
      RAISE EXCEPTION 'Ảnh đính kèm không thuộc công trình của mục nhật ký này. Tải lại ảnh từ đúng công trình.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_logs_photo_paths_match_site ON public.site_logs;
CREATE TRIGGER site_logs_photo_paths_match_site
  BEFORE INSERT OR UPDATE OF photo_urls ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.site_logs_photo_paths_match_site();

COMMENT ON COLUMN public.site_logs.photo_urls IS
  'Đường dẫn ảnh trong bucket construction-photos (`<công trình>/nhat-ky/<uuid>.<đuôi>`), KHÔNG phải URL — URL ký tạo lúc xem.';
