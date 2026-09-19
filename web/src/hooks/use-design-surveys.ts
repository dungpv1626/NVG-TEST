/**
 * Khảo sát hiện trạng khu đất của Module TK (TK-02).
 *
 * Tách khỏi `use-design-projects.ts` vì đây là hồ sơ Mẫu B có người chịu trách nhiệm riêng
 * (người đi đo), không phải một thuộc tính của dự án.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface DesignSurveyRecord {
  id: string;
  surveyed_at: string | null;
  created_at: string;
  land_width: string | null;
  land_depth: string | null;
  land_area: string | null;
  orientation: string | null;
  measurement_notes: string | null;
  surrounding_notes: string | null;
  usage_notes: string | null;
  notes: string | null;
  surveyor: { full_name: string } | null;
}

export function useDesignSurveys(projectId: string | undefined) {
  return useQuery<DesignSurveyRecord[], Error>({
    queryKey: ['design_surveys', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_surveys')
        .select(
          'id, surveyed_at, created_at, land_width, land_depth, land_area, orientation, ' +
            'measurement_notes, surrounding_notes, usage_notes, notes, ' +
            'surveyor:users!design_surveys_surveyed_by_users_id_fk(full_name)',
        )
        .eq('design_project_id', projectId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DesignSurveyRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export interface NewDesignSurveyInput {
  projectId: string;
  companyId: string;
  surveyedBy: string | null;
  landWidth: string | null;
  landDepth: string | null;
  landArea: string | null;
  orientation: string | null;
  measurementNotes: string | null;
  surroundingNotes: string | null;
  usageNotes: string | null;
  notes: string | null;
}

/**
 * Sửa một biên bản đã ghi.
 *
 * KHÔNG đụng `surveyed_at`: đó là mốc ĐI ĐO, không phải mốc gõ máy. Sửa nội dung vì gõ nhầm
 * không làm buổi khảo sát xảy ra vào lúc khác. Muốn ghi một lần đo MỚI thì lập biên bản mới.
 *
 * Ai sửa được là do policy `design_surveys_update` quyết (Mẫu B — người đi đo hoặc người
 * chịu trách nhiệm dự án), không phải do màn hình này.
 */
export function useUpdateDesignSurvey() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { surveyId: string } & Omit<NewDesignSurveyInput, 'projectId' | 'companyId' | 'surveyedBy'>
  >({
    mutationFn: async (input) => {
      const { error } = await supabase
        .from('design_surveys')
        .update({
          land_width: input.landWidth,
          land_depth: input.landDepth,
          land_area: input.landArea,
          orientation: input.orientation,
          measurement_notes: input.measurementNotes,
          surrounding_notes: input.surroundingNotes,
          usage_notes: input.usageNotes,
          notes: input.notes,
        })
        .eq('id', input.surveyId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_surveys'] });
    },
  });
}

/**
 * Gỡ một biên bản khảo sát — xoá MỀM, qua HÀM chứ không UPDATE thẳng.
 *
 * UPDATE thẳng KHÔNG chạy được: policy SELECT loại dòng đã xoá, mà PostgREST luôn đọc lại
 * dòng sau khi UPDATE — nên câu lệnh đặt `deleted_at` bị chính policy SELECT từ chối và
 * người dùng nhận một câu lỗi quyền hoàn toàn sai chỗ. Cùng lý do đã dựng
 * `hide_design_survey_photo` (migration 0119); hàm cho biên bản là `hide_design_survey`
 * (migration 0120) và kiểm đúng điều kiện Mẫu B mà policy UPDATE kiểm.
 *
 * Không có đường xoá cứng. Số đo đã dùng để thiết kế vẫn truy được về sau
 * (`design_briefs.site_source_survey_id` vẫn trỏ tới dòng này), và ảnh đính kèm không bị
 * xoá — chúng chỉ thôi hiện cùng biên bản.
 */
export function useRemoveDesignSurvey() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { surveyId: string }>({
    mutationFn: async ({ surveyId }) => {
      const { error } = await supabase.rpc('hide_design_survey', { p_survey_id: surveyId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_surveys'] });
    },
  });
}

export function useCreateDesignSurvey() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, NewDesignSurveyInput>({
    mutationFn: async (input) => {
      const { error } = await supabase
        .from('design_surveys')
        .insert({
          design_project_id: input.projectId,
          company_id: input.companyId,
          surveyed_by: input.surveyedBy,
          surveyed_at: new Date().toISOString(),
          land_width: input.landWidth,
          land_depth: input.landDepth,
          land_area: input.landArea,
          orientation: input.orientation,
          measurement_notes: input.measurementNotes,
          surrounding_notes: input.surroundingNotes,
          usage_notes: input.usageNotes,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['design_surveys'] });
    },
  });
}
