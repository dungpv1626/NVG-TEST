-- ============================================================================
-- Đợt 2 — 2B: nhật ký công trường bằng giọng nói (doc/KE_HOACH_LAM_HO.md).
--
-- Chỉ huy trưởng nói 1–2 phút → máy chép chữ (Whisper) → máy xếp vào các ô của nhật ký đang có
-- (việc đã làm, vật tư, vướng mắc, an toàn, quân số, thời tiết) → người ghi đọc lại, sửa, Lưu.
-- Máy chỉ điền NHÁP lên biểu mẫu; mục nhật ký vẫn do người ghi lưu, người ghi vẫn ký tên
-- (`site_logs_stamp_author`). Không thêm bảng nhật ký thứ hai — `site_logs` (TC-02, TC-08) giữ
-- nguyên quy tắc 24 giờ.
--
--   · kho `site-log-audio`: tệp ghi âm, thư mục đầu = id công trình, quyền theo công trình
--     (rls_site_readable / rls_site_writable — Mẫu A + E như ảnh công trường 0135); không có chính
--     sách xoá: đoạn ghi âm là bằng chứng gốc của mục nhật ký khi tranh chấp.
--   · `site_logs.voice_path`, `voice_transcript`, `ai_drafted`: giữ lời nói gốc cạnh nội dung đã
--     sửa — nội dung là của người ghi, bản chép chữ là thứ máy nghe được.
--   · công tắc `ai.site_log_enabled` (trống = tắt): máy xếp mục bằng Gemini trả phí. Tắt thì vẫn
--     chép chữ (nếu công tắc chép chữ bật) và đưa nguyên bản chép chữ vào ô Nội dung.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-log-audio', 'site-log-audio', false, 52428800,
        ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS site_log_audio_select ON storage.objects;
CREATE POLICY site_log_audio_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'site-log-audio'
         AND public.rls_site_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS site_log_audio_insert ON storage.objects;
CREATE POLICY site_log_audio_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-log-audio'
              AND public.rls_site_writable(public.try_uuid((storage.foldername(name))[1])));

ALTER TABLE public.site_logs
  ADD COLUMN IF NOT EXISTS voice_path text,
  ADD COLUMN IF NOT EXISTS voice_transcript text,
  ADD COLUMN IF NOT EXISTS ai_drafted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.site_logs.voice_path IS
  'Đoạn ghi âm gốc trong kho site-log-audio (`<công trình>/<uuid>.<đuôi>`), nếu mục được nói thay gõ (2B).';
COMMENT ON COLUMN public.site_logs.voice_transcript IS
  'Bản chép chữ máy nghe được từ đoạn ghi âm — giữ nguyên, khác với Nội dung người ghi đã sửa.';
COMMENT ON COLUMN public.site_logs.ai_drafted IS
  'Máy đã xếp mục làm nháp cho mục này (người ghi vẫn đọc lại và tự lưu).';

-- Đoạn ghi âm phải nằm trong thư mục của đúng công trình của mục nhật ký — như ảnh (0135):
-- lệch thì quyền đọc tệp và quyền đọc nhật ký nói hai điều khác nhau.
CREATE OR REPLACE FUNCTION public.site_logs_voice_path_match_site()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.voice_path IS NOT NULL
     AND left(NEW.voice_path, length(NEW.construction_site_id::text) + 1)
         <> NEW.construction_site_id::text || '/' THEN
    RAISE EXCEPTION 'Đoạn ghi âm không thuộc công trình của mục nhật ký này. Ghi âm lại từ đúng công trình.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_logs_voice_path_match_site ON public.site_logs;
CREATE TRIGGER site_logs_voice_path_match_site
  BEFORE INSERT OR UPDATE OF voice_path ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.site_logs_voice_path_match_site();

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'ai.site_log_enabled', 'global', NULL, 'Bật máy xếp mục nhật ký công trường',
       'Gemini Flash gói trả phí, từ bản chép chữ lời chỉ huy trưởng nói. 1 = bật; để trống = tắt (đưa nguyên bản chép chữ vào ô Nội dung).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'ai.site_log_enabled' AND p.scope_type = 'global'
);
