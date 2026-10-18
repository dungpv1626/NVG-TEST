/**
 * Đính kèm biên bản khảo sát Kinh doanh (0180): ảnh / video hiện trạng, ảnh phiếu giấy đã điền
 * tay, tài liệu khách gửi. Gọi thẳng Supabase — quyền ở RLS (`rls_survey_readable` / `_writable`),
 * kho `survey-files` riêng tư, xem bằng đường dẫn ký ngắn hạn.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SurveyAttachmentKind } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export const SURVEY_FILES_BUCKET = 'survey-files';

/** Khớp `allowed_mime_types` của kho — sai loại thì Storage từ chối, ở đây chỉ chặn sớm. */
export const SURVEY_ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,' +
  '.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf';

const MAX_BYTES = 50 * 1024 * 1024;
const SIGNED_URL_SECONDS = 3600;

/** Trình duyệt hay để trống loại tệp của Office cũ / bản vẽ — suy theo đuôi. */
const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  heic: 'image/heic',
  heif: 'image/heif',
  mov: 'video/quicktime',
};

function extensionOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type.split('/').pop() ?? 'bin';
}

export function contentTypeOf(file: File): string {
  return TYPE_BY_EXT[extensionOf(file)] ?? (file.type || 'application/octet-stream');
}

/** Loại mặc định theo tệp — người dùng đổi được (ví dụ ảnh chụp phiếu giấy → «phiếu»). */
export function defaultKindOf(file: File): SurveyAttachmentKind {
  const type = contentTypeOf(file);
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/') && !type.includes('dwg') && !type.includes('dxf')) return 'anh';
  return 'tai_lieu';
}

export function isPreviewableImage(mime: string): boolean {
  // HEIC chỉ Safari hiện được; nơi khác hiện ô tệp để tải về.
  return /^image\/(jpeg|png|webp)$/.test(mime);
}

export interface SurveyAttachment {
  id: string;
  survey_id: string;
  storage_path: string;
  kind: SurveyAttachmentKind;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  caption: string | null;
  created_at: string;
  /** Rỗng khi không ký được (tệp mất, hoặc không có quyền đọc). */
  url: string | null;
}

export function useSurveyAttachments(surveyId: string | undefined) {
  return useQuery<SurveyAttachment[], Error>({
    queryKey: ['survey-attachments', surveyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_survey_attachments')
        .select(
          'id, survey_id, storage_path, kind, file_name, mime_type, size_bytes, caption, created_at',
        )
        .eq('survey_id', surveyId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Omit<SurveyAttachment, 'url'>[];
      if (rows.length === 0) return [];
      const signed = await supabase.storage.from(SURVEY_FILES_BUCKET).createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_SECONDS,
      );
      const urlByPath = new Map<string, string>();
      for (const item of signed.data ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
      return rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null }));
    },
    enabled: Boolean(surveyId),
    staleTime: (SIGNED_URL_SECONDS / 2) * 1000,
  });
}

/** Tải nhiều tệp một lượt. Tệp quá 50 MB bị bỏ và nói ra tên, các tệp còn lại vẫn lên. */
export function useUploadSurveyAttachments() {
  const queryClient = useQueryClient();
  return useMutation<
    { uploaded: number; skipped: string[] },
    Error,
    { surveyId: string; files: File[]; kind?: SurveyAttachmentKind }
  >({
    mutationFn: async ({ surveyId, files, kind }) => {
      const skipped: string[] = [];
      let uploaded = 0;
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          skipped.push(file.name);
          continue;
        }
        const type = contentTypeOf(file);
        const path = `${surveyId}/${crypto.randomUUID()}.${extensionOf(file)}`;
        const up = await supabase.storage
          .from(SURVEY_FILES_BUCKET)
          .upload(path, file, { contentType: type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await supabase.from('site_survey_attachments').insert({
          survey_id: surveyId,
          storage_path: path,
          kind: kind ?? defaultKindOf(file),
          file_name: file.name.slice(0, 255),
          mime_type: type,
          size_bytes: file.size,
        });
        if (error) {
          // Dòng không ghi được thì gỡ tệp vừa tải, không để tệp mồ côi trong kho.
          await supabase.storage.from(SURVEY_FILES_BUCKET).remove([path]);
          throw error;
        }
        uploaded += 1;
      }
      return { uploaded, skipped };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['survey-attachments'] }),
  });
}

export function useUpdateSurveyAttachment() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; caption?: string | null; kind?: SurveyAttachmentKind }
  >({
    mutationFn: async ({ id, ...patch }) => {
      const { error } = await supabase
        .from('site_survey_attachments')
        .update(patch)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['survey-attachments'] }),
  });
}

export function useDeleteSurveyAttachment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SurveyAttachment>({
    mutationFn: async (item) => {
      const { error } = await supabase
        .from('site_survey_attachments')
        .delete()
        .eq('id', item.id)
        .select('id')
        .single();
      if (error) throw error;
      await supabase.storage.from(SURVEY_FILES_BUCKET).remove([item.storage_path]);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['survey-attachments'] }),
  });
}
