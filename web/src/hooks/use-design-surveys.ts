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
