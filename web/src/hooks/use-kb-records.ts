/**
 * Kho hồ sơ cũ đã số hoá (Knowledge Base — Mốc 3).
 *
 * Đọc gọi THẲNG Supabase: đó là CRUD thường và RLS đã đủ sức giới hạn phạm vi (CLAUDE.md 3.1).
 * Chỉ việc ghi chú giải đi qua Worker, vì nó phải tính lại vector nhúng bằng khoá mà trình
 * duyệt không được cầm.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnnotationOutcome, AnnotationRationale } from '@nvg/shared/design';
import { designApi } from '@/lib/design-api';
import { supabase } from '@/lib/supabase';

export interface KbRecordRow {
  id: string;
  company_id: string;
  project_code: string;
  building_type: string;
  floors: number | null;
  quality_score: number | null;
  site_width_m: number | null;
  site_depth_m: number | null;
  has_rationale: boolean;
  has_slicing_tree: boolean;
  created_at: string;
}

const LIST_SELECT =
  'id, company_id, project_code, building_type, floors, quality_score, ' +
  'site_width_m, site_depth_m, has_rationale, has_slicing_tree, created_at';

export function useKbRecords() {
  return useQuery({
    queryKey: ['kb-records'],
    queryFn: async (): Promise<KbRecordRow[]> => {
      const { data, error } = await supabase
        .from('kb_record')
        .select(LIST_SELECT)
        .is('deleted_at', null)
        // Chưa chú giải lên trước, rồi tới bản ghi chất lượng cao: công của kiến trúc sư nên
        // đổ vào hồ sơ trích được sạch nhất trước.
        .order('has_rationale', { ascending: true })
        .order('quality_score', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as KbRecordRow[];
    },
  });
}

export interface KbRecordDetail extends KbRecordRow {
  payload: KbRecordPayload;
  checks: { code: string; outcome: string; detail: string }[];
  source_files: { name?: string; uri?: string }[];
}

export interface KbRecordPayload {
  project_code: string;
  building_type: string;
  floors: number;
  site: { width_m: number; depth_m: number };
  floor_plans: {
    level: number;
    rooms: {
      type?: string | null;
      label_raw?: string | null;
      polygon: number[][];
      area_m2: number;
    }[];
  }[];
  slicing_tree: unknown;
  rationale?: AnnotationRationale | null;
  outcome?: AnnotationOutcome | null;
  extraction_warnings?: { code: string; detail: string }[];
  /** Danh mục tờ của bộ hồ sơ gốc, đọc từ khung tên (bậc 1 của số hoá). */
  sheets?: {
    source_file?: string | null;
    code: string;
    name?: string | null;
    scale?: string | null;
    discipline?: string | null;
    date?: string | null;
  }[];
}

export function useKbRecord(id: string | undefined) {
  return useQuery({
    queryKey: ['kb-record', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<KbRecordDetail> => {
      const { data, error } = await supabase
        .from('kb_record')
        .select(`${LIST_SELECT}, payload, checks, source_files`)
        .eq('id', id!)
        .is('deleted_at', null)
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as KbRecordDetail;
    },
  });
}

export interface AnnotateResult {
  id: string;
  /** `false` = chú giải đã lưu nhưng chưa tính được vector; chú giải lại là tính lại. */
  embedded: boolean;
  /** Ô chữ tự do bị giữ lại, không gửi ra dịch vụ ngoài. */
  withheld: string[];
}

export function useAnnotateKbRecord(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rationale: AnnotationRationale; outcome: AnnotationOutcome }) =>
      designApi<AnnotateResult>('/design/kb/annotate', { id, ...input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['kb-record', id] });
      void queryClient.invalidateQueries({ queryKey: ['kb-records'] });
    },
  });
}
