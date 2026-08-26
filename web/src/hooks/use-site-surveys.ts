/**
 * Biên bản khảo sát khách hàng (PRD CRM-03).
 *
 * CRUD thuần trên một bảng, quyền diễn đạt hết bằng RLS (thừa hưởng từ cơ hội mẹ) — nên gọi
 * THẲNG Supabase, KHÔNG viết endpoint riêng (Tech Stack 3.2).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  surveyor: { full_name: string } | null;
}

const SURVEY_SELECT =
  'id, scheduled_at, surveyed_at, surveyed_by, needs, decision_maker, budget_note, schedule_note, ' +
  'commercial_terms, notes, created_at, ' +
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
    },
  });
}
