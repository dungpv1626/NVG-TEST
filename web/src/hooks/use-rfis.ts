/**
 * Yêu cầu làm rõ (RFI) — TK-08 / TC-15, bảng `rfis` (migration 0154).
 *
 * Gửi = ghi thẳng bảng (RLS: người ghi được công trình, Mẫu E); mã, pháp nhân, hồ sơ thiết kế và
 * trạng thái do CSDL đặt. Trả lời CHỈ qua `answer_rfi` — bảng không mở UPDATE. Ai đọc được và ai trả
 * lời được do CSDL quyết theo tuyến; giao diện chỉ ẩn nút cho đỡ bấm vào lỗi.
 *
 * Kèm `useSiteDesignDrawings`: bản vẽ thiết kế đã phát hành nhìn từ công trường (TK-05 ↔ TC-03).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RfiRoute, RfiStatus } from '@nvg/shared';
import { supabase } from '@/lib/supabase';
import { uploadConstructionPhotos } from './use-site-photos';

export interface RfiRecord {
  id: string;
  code: string;
  title: string;
  question: string;
  location: string | null;
  measurements: string | null;
  photo_urls: string[] | null;
  route: RfiRoute;
  due_date: string;
  status: RfiStatus;
  answer: string | null;
  answered_at: string | null;
  answerer_name: string | null;
  created_at: string;
  construction_site_id: string;
  design_project_id: string | null;
  design_version_id: string | null;
  company_id: string;
  site: { code: string; name: string } | null;
  requester: { full_name: string } | null;
  answerer: { full_name: string } | null;
  drawing: { title: string; version: number } | null;
}

const RFI_COLUMNS =
  'id, code, title, question, location, measurements, photo_urls, route, due_date, status, ' +
  'answer, answered_at, answerer_name, created_at, construction_site_id, design_project_id, ' +
  'design_version_id, company_id, ' +
  'site:construction_sites!rfis_construction_site_id_fkey(code, name), ' +
  'requester:users!rfis_created_by_fkey(full_name), ' +
  'answerer:users!rfis_answered_by_fkey(full_name), ' +
  'drawing:design_versions!rfis_design_version_id_fkey(title, version)';

const KEY = ['rfis'] as const;

/** RFI của một công trình, hoặc của các công trình gắn một hồ sơ thiết kế. Chờ trả lời lên trước. */
export function useRfis(filter: { siteId?: string; designProjectId?: string }) {
  return useQuery<RfiRecord[], Error>({
    queryKey: [...KEY, filter.siteId ?? null, filter.designProjectId ?? null],
    queryFn: async () => {
      let query = supabase.from('rfis').select(RFI_COLUMNS).is('deleted_at', null);
      if (filter.siteId) query = query.eq('construction_site_id', filter.siteId);
      if (filter.designProjectId) query = query.eq('design_project_id', filter.designProjectId);
      const { data, error } = await query
        .order('status', { ascending: true })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RfiRecord[];
    },
    enabled: Boolean(filter.siteId || filter.designProjectId),
  });
}

export function useRfi(id: string | undefined) {
  return useQuery<RfiRecord | null, Error>({
    queryKey: [...KEY, 'one', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rfis')
        .select(RFI_COLUMNS)
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as RfiRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewRfiInput {
  siteId: string;
  title: string;
  question: string;
  location: string | null;
  measurements: string | null;
  route: RfiRoute;
  dueDate: string;
  designVersionId: string | null;
  photos: File[];
}

export function useCreateRfi() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; code: string }, Error, NewRfiInput>({
    mutationFn: async (input) => {
      // Tải ảnh TRƯỚC, ghi dòng SAU (quy ước của ảnh công trường): dòng hỏng thì còn tệp mồ côi,
      // ngược lại là dòng trỏ vào tệp không có.
      const photoUrls =
        input.photos.length > 0
          ? await uploadConstructionPhotos(input.siteId, 'lam-ro', input.photos)
          : null;
      const { data, error } = await supabase
        .from('rfis')
        .insert({
          construction_site_id: input.siteId,
          title: input.title,
          question: input.question,
          location: input.location,
          measurements: input.measurements,
          route: input.route,
          due_date: input.dueDate,
          design_version_id: input.designVersionId,
          photo_urls: photoUrls,
        })
        .select('id, code')
        .single();
      if (error) throw error;
      return data as { id: string; code: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['site-requests'] });
    },
  });
}

export function useAnswerRfi() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; answer: string; answererName?: string }>({
    mutationFn: async ({ id, answer, answererName }) => {
      const { error } = await supabase.rpc('answer_rfi', {
        p_rfi_id: id,
        p_answer: answer,
        p_answerer_name: answererName ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['site-requests'] });
    },
  });
}

export interface SiteDesignDrawing {
  version_id: string;
  discipline: string;
  discipline_label: string;
  version: number;
  title: string;
  file_name: string | null;
  published_at: string;
  is_current: boolean;
  change_reason: string | null;
  design_project_id: string;
  design_code: string;
}

/** Bản vẽ thi công đã phát hành của hồ sơ thiết kế gắn công trình — đang hiệu lực và đã hết hiệu lực. */
export function useSiteDesignDrawings(siteId: string | undefined) {
  return useQuery<SiteDesignDrawing[], Error>({
    queryKey: ['site-design-drawings', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_design_drawings', { p_site_id: siteId! });
      if (error) throw error;
      return (data ?? []) as SiteDesignDrawing[];
    },
    enabled: Boolean(siteId),
  });
}
