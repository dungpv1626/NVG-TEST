/**
 * Đợt 5 — 5A: khảo sát thiết kế ghi âm + vòng ý kiến khách (migration 0205).
 *
 * Tệp ghi âm ở kho `design-audio`, thư mục đầu = dự án thiết kế:
 *   · `<dự án>/khao-sat/<biên bản>/<uuid>.<đuôi>` — lời chủ nhà lúc khảo sát
 *   · `<dự án>/y-kien/<uuid>.<đuôi>` — ý kiến khách một vòng
 * Không có đường xoá tệp (lời nói gốc là bằng chứng). Giờ khảo sát do máy ghi qua hai hàm
 * `start_design_survey` / `finish_design_survey`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesignReviewDecision } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export const DESIGN_AUDIO_BUCKET = 'design-audio';

function extOf(blob: Blob): { type: string; ext: string } {
  const type = (blob.type || 'audio/webm').split(';')[0]!;
  const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a' : (type.split('/')[1] ?? 'webm');
  return { type, ext };
}

/** Tải đoạn ghi âm lên kho; trả đường dẫn trong kho. */
export async function uploadDesignAudio(folder: string, blob: Blob): Promise<string> {
  const { type, ext } = extOf(blob);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(DESIGN_AUDIO_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) {
    throw new Error('Không tải được đoạn ghi âm lên. Kiểm tra mạng rồi ghi lại, hoặc gõ tay.');
  }
  return path;
}

/** URL ký một giờ để nghe lại. */
export async function designAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DESIGN_AUDIO_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) throw new Error('Không mở được đoạn ghi âm.');
  return data.signedUrl;
}

export function useSurveyClock() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    { action: 'start'; projectId: string } | { action: 'finish'; surveyId: string }
  >({
    mutationFn: async (input) => {
      const { data, error } =
        input.action === 'start'
          ? await supabase.rpc('start_design_survey', { p_project_id: input.projectId })
          : await supabase.rpc('finish_design_survey', { p_survey_id: input.surveyId });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['design_surveys'] }),
  });
}

export interface DesignSurveyRecording {
  id: string;
  design_survey_id: string;
  storage_path: string;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_status: 'chua' | 'xong' | 'loi';
  created_at: string;
}

export function useDesignSurveyRecordings(projectId: string | undefined) {
  return useQuery<DesignSurveyRecording[], Error>({
    queryKey: ['design_survey_recordings', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_survey_recordings')
        .select(
          'id, design_survey_id, storage_path, duration_seconds, transcript, transcript_status, created_at',
        )
        .eq('design_project_id', projectId!)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as DesignSurveyRecording[];
    },
    enabled: Boolean(projectId),
  });
}

export function useAddSurveyRecording() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    { projectId: string; companyId: string; surveyId: string; path: string; seconds: number | null }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('design_survey_recordings')
        .insert({
          design_survey_id: input.surveyId,
          design_project_id: input.projectId,
          company_id: input.companyId,
          storage_path: input.path,
          duration_seconds: input.seconds,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['design_survey_recordings'] }),
  });
}

export function useSaveRecordingTranscript() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { recordingId: string; transcript: string | null; status: 'xong' | 'loi' }
  >({
    mutationFn: async ({ recordingId, transcript, status }) => {
      const { error } = await supabase
        .from('design_survey_recordings')
        .update({ transcript, transcript_status: status })
        .eq('id', recordingId);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['design_survey_recordings'] }),
  });
}

/** Ghi một vòng ý kiến khách (gõ hoặc nói) — trả số vòng máy đã đánh. */
export function useRecordDesignFeedback() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    {
      versionId: string;
      decision: DesignReviewDecision;
      comments: string;
      reviewerName: string;
      voicePath: string | null;
      voiceTranscript: string | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_design_feedback', {
        p_version_id: input.versionId,
        p_decision: input.decision,
        p_comments: input.comments,
        p_reviewer_name: input.reviewerName,
        p_voice_path: input.voicePath,
        p_voice_transcript: input.voiceTranscript,
      });
      if (error) throw error;
      return ((data as { round_no: number }[] | null)?.[0]?.round_no ?? 0) as number;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['design_versions'] });
      void queryClient.invalidateQueries({ queryKey: ['design_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['design_sync'] });
    },
  });
}
