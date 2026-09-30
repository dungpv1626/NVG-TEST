/**
 * Điểm danh bằng ảnh tại công trường (migration 0139).
 *
 * Tải ảnh TRƯỚC, ghi dòng SAU (cùng quy ước với nhật ký): dòng hỏng thì còn ảnh mồ côi, còn
 * ngược lại là dòng điểm danh trỏ vào ảnh không có. Người, giờ, pháp nhân do CSDL đặt — ở đây
 * không gửi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CheckInLocation } from '@/lib/check-in-stamp';
import { uploadConstructionPhotos } from './use-site-photos';

export interface SiteCheckIn {
  id: string;
  user_id: string;
  checked_in_at: string;
  client_created_at: string | null;
  photo_path: string;
  location_status: CheckInLocation['status'];
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  note: string | null;
  person: { full_name: string } | null;
}

/** Đủ cho một màn hình xem lại; cũ hơn thì xem theo ngày khi có báo cáo chấm công. */
const LIST_LIMIT = 200;

export function useSiteCheckIns(siteId: string) {
  return useQuery<SiteCheckIn[], Error>({
    queryKey: ['site-check-ins', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_check_ins')
        .select(
          'id, user_id, checked_in_at, client_created_at, photo_path, location_status, ' +
            'latitude, longitude, accuracy_m, note, ' +
            'person:users!site_check_ins_user_id_fkey(full_name)',
        )
        .eq('construction_site_id', siteId)
        .order('checked_in_at', { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteCheckIn[];
    },
  });
}

export function useCreateSiteCheckIn(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { photo: File; location: CheckInLocation; capturedAt: Date; note: string }
  >({
    mutationFn: async ({ photo, location, capturedAt, note }) => {
      const [path] = await uploadConstructionPhotos(siteId, 'diem-danh', [photo]);
      const { error } = await supabase.from('site_check_ins').insert({
        construction_site_id: siteId,
        photo_path: path,
        location_status: location.status,
        ...(location.status === 'co_vi_tri'
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy_m: location.accuracy,
            }
          : {}),
        note: note.trim() || null,
        client_created_at: capturedAt.toISOString(),
        client_generated_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['site-check-ins', siteId] });
    },
  });
}
