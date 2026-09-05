/**
 * Ảnh và video hiện trạng đính kèm biên bản khảo sát (TK-02).
 *
 * Gọi THẲNG Supabase — bảng `design_survey_photos` và bucket `design-site-photos` đều có RLS
 * theo dự án (migration 0118), nên không có lý do gì để đi qua Worker (CLAUDE.md 3.1).
 *
 * Bucket là RIÊNG TƯ: ảnh hiện trạng chụp nhà khách là dữ liệu của khách. Đường dẫn xem là
 * URL ký có hạn, tạo dưới phiên của chính người xem — policy đọc tệp quyết định ai lấy được.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const SITE_PHOTO_BUCKET = 'design-site-photos';

/** Khớp `allowed_mime_types` của bucket — sai loại thì Storage từ chối, ở đây chỉ chặn sớm. */
export const SITE_PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime';

/** URL ký sống một giờ — đủ cho một phiên xem, không đủ để dán vào chỗ khác dùng lâu dài. */
const SIGNED_URL_SECONDS = 3600;

export interface SurveyPhotoRecord {
  id: string;
  design_survey_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  caption: string | null;
  created_at: string;
  /** Rỗng khi không ký được (tệp đã mất, hoặc không có quyền đọc). */
  url: string | null;
}

export function useSurveyPhotos(projectId: string | undefined) {
  return useQuery<SurveyPhotoRecord[], Error>({
    queryKey: ['design_survey_photos', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_survey_photos')
        .select(
          'id, design_survey_id, storage_path, file_name, mime_type, size_bytes, caption, created_at',
        )
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Omit<SurveyPhotoRecord, 'url'>[];
      if (rows.length === 0) return [];

      const signed = await supabase.storage.from(SITE_PHOTO_BUCKET).createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_SECONDS,
      );
      const urlByPath = new Map<string, string>();
      for (const item of signed.data ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      return rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
    },
    enabled: Boolean(projectId),
    // URL ký có hạn; làm mới theo nửa thời hạn để ảnh không chết giữa lúc đang xem.
    staleTime: (SIGNED_URL_SECONDS / 2) * 1000,
  });
}

export interface UploadSurveyPhotosInput {
  projectId: string;
  companyId: string;
  surveyId: string;
  files: File[];
}

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type.split('/').pop() ?? 'bin';
}

/**
 * Tải lên từng tệp: ghi tệp TRƯỚC, dòng metadata SAU — cùng thứ tự với kho artifact. Hỏng nửa
 * chừng để lại một tệp mồ côi (tốn chỗ, không sai), không để lại một dòng trỏ tới tệp không có.
 */
export function useUploadSurveyPhotos() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, UploadSurveyPhotosInput>({
    mutationFn: async ({ projectId, companyId, surveyId, files }) => {
      let uploaded = 0;
      for (const file of files) {
        const path = `${projectId}/${surveyId}/${crypto.randomUUID()}.${extensionOf(file)}`;
        const stored = await supabase.storage
          .from(SITE_PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (stored.error) {
          throw new Error(
            `Không tải được "${file.name}": ${stored.error.message}. Kiểm tra loại tệp và dung lượng (tối đa 50 MB).`,
          );
        }
        const { error } = await supabase.from('design_survey_photos').insert({
          company_id: companyId,
          design_project_id: projectId,
          design_survey_id: surveyId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          taken_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
          client_created_at: new Date().toISOString(),
        });
        if (error) throw new Error(error.message);
        uploaded += 1;
      }
      return uploaded;
    },
    onSuccess: (_count, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['design_survey_photos', projectId] });
    },
  });
}

/**
 * Ẩn ảnh (xoá mềm) qua hàm `hide_design_survey_photo` — ảnh hiện trạng là chứng cứ, không có
 * đường xoá cứng từ trình duyệt. Qua hàm chứ không UPDATE thẳng: xem migration 0119.
 */
export function useRemoveSurveyPhoto() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { projectId: string; photoId: string }>({
    mutationFn: async ({ photoId }) => {
      const { error } = await supabase.rpc('hide_design_survey_photo', { p_photo_id: photoId });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_void, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['design_survey_photos', projectId] });
    },
  });
}
