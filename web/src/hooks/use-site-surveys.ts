/**
 * Biên bản khảo sát khách hàng (PRD CRM-03).
 *
 * CRUD thuần trên một bảng, quyền diễn đạt hết bằng RLS (thừa hưởng từ cơ hội mẹ) — nên gọi
 * THẲNG Supabase, KHÔNG viết endpoint riêng (Tech Stack 3.2).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SurveyReportStatus } from '@nvg/shared';
import { aiStatus, summarizeSurvey, transcribeRecording, type SurveyAiDraft } from '@/lib/ai-api';
import { supabase } from '@/lib/supabase';

export interface SiteSurveyRecord {
  id: string;
  scheduled_at: string | null;
  surveyed_at: string | null;
  surveyed_by: string | null;
  /** Nội dung theo CRM-03. */
  needs: string | null;
  decision_maker: string | null;
  budget_note: string | null;
  schedule_note: string | null;
  commercial_terms: string | null;
  notes: string | null;
  created_at: string;
  /** Máy ghi khi bấm Bắt đầu / Kết thúc khảo sát (0175). */
  started_at: string | null;
  finished_at: string | null;
  /** Báo cáo khảo sát — Ban Giám đốc duyệt (0175). */
  report_status: SurveyReportStatus;
  report_feedback: string | null;
  report_submitted_at: string | null;
  report_decided_at: string | null;
  report_approval_id: string | null;
  ai_draft: (SurveyAiDraft & { fake?: boolean }) | null;
  ai_draft_at: string | null;
  surveyor: { full_name: string } | null;
}

const SURVEY_SELECT =
  'id, scheduled_at, surveyed_at, surveyed_by, needs, decision_maker, budget_note, schedule_note, ' +
  'commercial_terms, notes, created_at, started_at, finished_at, report_status, report_feedback, ' +
  'report_submitted_at, report_decided_at, report_approval_id, ai_draft, ai_draft_at, ' +
  'surveyor:users!site_surveys_surveyed_by_users_id_fk(full_name)';

/**
 * Lịch khảo sát và biên bản của một cơ hội.
 *
 * Sắp xếp theo lịch hẹn giảm dần và đẩy buổi CHƯA có lịch xuống cuối: một cơ hội có thể
 * khảo sát nhiều lần (khảo sát sơ bộ rồi khảo sát chi tiết), lần gần nhất là lần đáng xem
 * trước.
 */
export function useSiteSurveys(opportunityId: string | undefined) {
  return useQuery<SiteSurveyRecord[], Error>({
    queryKey: ['site_surveys', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_surveys')
        .select(SURVEY_SELECT)
        .eq('opportunity_id', opportunityId!)
        .is('deleted_at', null)
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteSurveyRecord[];
    },
    enabled: Boolean(opportunityId),
  });
}

export interface SurveyInput {
  scheduledAt: string | null;
  surveyedAt: string | null;
  surveyedBy: string | null;
  needs: string | null;
  decisionMaker: string | null;
  budgetNote: string | null;
  scheduleNote: string | null;
  commercialTerms: string | null;
  notes: string | null;
}

/** Chuyển dữ liệu biểu mẫu sang đúng tên cột — một chỗ duy nhất cho cả tạo và sửa. */
function toRow(input: SurveyInput) {
  return {
    scheduled_at: input.scheduledAt,
    surveyed_at: input.surveyedAt,
    surveyed_by: input.surveyedBy,
    needs: input.needs,
    decision_maker: input.decisionMaker,
    budget_note: input.budgetNote,
    schedule_note: input.scheduleNote,
    commercial_terms: input.commercialTerms,
    notes: input.notes,
  };
}

export function useScheduleSurvey() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, SurveyInput & { opportunityId: string }>({
    mutationFn: async ({ opportunityId, ...input }) => {
      const { data, error } = await supabase
        .from('site_surveys')
        .insert({ opportunity_id: opportunityId, ...toRow(input) })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['site_surveys'] });
      // Điều kiện bước của cơ hội («Đã khảo sát») nằm dưới khoá `opportunities` — thiếu dòng
      // này thì lưu biên bản xong dải tiến trình vẫn báo «Cần» (phản hồi chủ dự án).
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

/**
 * Cập nhật một dòng và KHẲNG ĐỊNH có đúng một dòng bị thay đổi.
 *
 * PostgREST KHÔNG báo lỗi khi RLS lọc mất dòng khỏi lệnh UPDATE — nó trả về 0 dòng kèm
 * `error === null`. Không có `.select()`, giao diện đọc ra "lưu thành công", đóng biểu mẫu,
 * rồi hiển thị lại dữ liệu cũ: người dùng gõ xong cả biên bản khảo sát và mất trắng mà
 * tưởng đã lưu. `.select().single()` biến trường hợp đó thành lỗi PGRST116 nhìn thấy được.
 */
export function useUpdateSurvey() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SurveyInput & { id: string }>({
    mutationFn: async ({ id, ...input }) => {
      const { error } = await supabase
        .from('site_surveys')
        .update(toRow(input))
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['site_surveys'] });
      // Điều kiện bước của cơ hội («Đã khảo sát») nằm dưới khoá `opportunities` — thiếu dòng
      // này thì lưu biên bản xong dải tiến trình vẫn báo «Cần» (phản hồi chủ dự án).
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    },
  });
}

function invalidateSurvey(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['site_surveys'] });
  void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
  void queryClient.invalidateQueries({ queryKey: ['survey-recordings'] });
  void queryClient.invalidateQueries({ queryKey: ['approvals'] });
}

/** Bắt đầu / kết thúc khảo sát — máy ghi giờ (0175, vấn đề 8: không gõ giờ tay). */
export function useSurveyClock() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { surveyId: string; action: 'start' | 'finish' }>({
    mutationFn: async ({ surveyId, action }) => {
      const { error } = await supabase.rpc(
        action === 'start' ? 'start_site_survey' : 'finish_site_survey',
        { p_survey_id: surveyId },
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateSurvey(queryClient),
  });
}

/** Gửi báo cáo khảo sát cho Ban Giám đốc (Hộp thư Phê duyệt dùng chung). */
export function useSubmitSurveyReport() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (surveyId) => {
      const { error } = await supabase.rpc('submit_survey_report', { p_survey_id: surveyId });
      if (error) throw error;
    },
    onSuccess: () => invalidateSurvey(queryClient),
  });
}

export interface SurveyRecording {
  id: string;
  survey_id: string;
  storage_path: string;
  mime_type: string;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_status: 'chua' | 'xong' | 'loi';
  transcript_note: string | null;
  created_at: string;
  author: { full_name: string } | null;
}

export function useSurveyRecordings(surveyId: string | undefined) {
  return useQuery<SurveyRecording[], Error>({
    queryKey: ['survey-recordings', surveyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_survey_recordings')
        .select(
          'id, survey_id, storage_path, mime_type, duration_seconds, transcript, transcript_status, ' +
            'transcript_note, created_at, author:users!site_survey_recordings_created_by_fkey(full_name)',
        )
        .eq('survey_id', surveyId!)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SurveyRecording[];
    },
    enabled: Boolean(surveyId),
  });
}

/** Tải đoạn ghi âm lên kho riêng (thư mục đầu = id biên bản) rồi ghi một dòng. */
export function useAddRecording() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string },
    Error,
    { surveyId: string; blob: Blob; seconds: number | null }
  >({
    mutationFn: async ({ surveyId, blob, seconds }) => {
      const type = (blob.type || 'audio/webm').split(';')[0]!;
      const ext =
        type.includes('mp4') || type.includes('m4a') ? 'm4a' : (type.split('/')[1] ?? 'webm');
      const path = `${surveyId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from('survey-audio')
        .upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      const { data, error } = await supabase
        .from('site_survey_recordings')
        .insert({
          survey_id: surveyId,
          storage_path: path,
          mime_type: type,
          duration_seconds: seconds,
          size_bytes: blob.size,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['survey-recordings'] }),
  });
}

export function useSaveTranscript() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; transcript: string }>({
    mutationFn: async ({ id, transcript }) => {
      const { error } = await supabase
        .from('site_survey_recordings')
        .update({ transcript, transcript_status: 'xong', transcript_note: 'Người dùng sửa tay.' })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['survey-recordings'] }),
  });
}

/** Đường dẫn ký ngắn hạn để nghe lại — kho riêng tư, quyền theo biên bản. */
export async function recordingUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('survey-audio').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export function useAiStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: aiStatus, staleTime: 300_000, retry: false });
}

export function useTranscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recordingId: string) => transcribeRecording(recordingId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['survey-recordings'] }),
  });
}

export function useSummarizeSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (surveyId: string) => summarizeSurvey(surveyId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['site_surveys'] }),
  });
}
