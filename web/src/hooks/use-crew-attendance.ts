/**
 * Điểm danh tổ đội và bảng công thời vụ (0232, câu 6). Quyền ở CSDL theo công trình (đọc / ghi như nhật ký); xác nhận
 * bảng công tháng: Trưởng phòng Thi công / Ban Giám đốc (`auth_confirms_crew_month`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Cột NOT NULL mà trigger đặt lại theo công trình — gửi kèm để qua kiểm của PostgREST. */
const PLACEHOLDER_COMPANY = '00000000-0000-0000-0000-000000000000';

export type CrewAttendanceStatus = 'ca_ngay' | 'nua_ngay' | 'vang';
export type CrewLocationFlag =
  'trong_ban_kinh' | 'ngoai_ban_kinh' | 'khong_vi_tri' | 'chua_co_toa_do';
export type CrewMonthStatus = 'nhap' | 'da_gui' | 'da_xac_nhan';

export const CREW_STATUS_LABELS: Readonly<Record<CrewAttendanceStatus, string>> = {
  ca_ngay: 'Cả ngày',
  nua_ngay: 'Nửa ngày',
  vang: 'Vắng',
};

export const CREW_MONTH_STATUS_LABELS: Readonly<Record<CrewMonthStatus, string>> = {
  nhap: 'Chưa gửi',
  da_gui: 'Đã gửi — chờ Trưởng phòng Thi công xác nhận',
  da_xac_nhan: 'Đã xác nhận',
};

export interface CrewMember {
  id: string;
  subcontractor_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

export interface CrewSheet {
  id: string;
  subcontractor_id: string;
  work_date: string;
  photo_path: string;
  location_flag: CrewLocationFlag;
  distance_m: number | null;
  attendance: {
    id: string;
    crew_member_id: string;
    status: CrewAttendanceStatus;
    workday: number;
    overtime_hours: number;
  }[];
}

export interface CrewMonth {
  subcontractor_id: string;
  status: CrewMonthStatus;
  returned_reason: string | null;
  submitted_at: string | null;
  confirmed_at: string | null;
}

export interface CrewMonthSummaryRow {
  subcontractor_id: string;
  crew_member_id: string;
  full_name: string;
  days_present: number;
  workdays: number;
  overtime_hours: number;
}

export function useCrewMembers(crewIds: string[]) {
  return useQuery<CrewMember[], Error>({
    queryKey: ['crew-members', crewIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crew_members')
        .select('id, subcontractor_id, full_name, phone, is_active')
        .in('subcontractor_id', crewIds)
        .order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as CrewMember[];
    },
    enabled: crewIds.length > 0,
  });
}

export function useAddCrewMember() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { crewId: string; fullName: string; phone: string | null }>({
    mutationFn: async ({ crewId, fullName, phone }) => {
      const { error } = await supabase.from('crew_members').insert({
        company_id: PLACEHOLDER_COMPANY,
        subcontractor_id: crewId,
        full_name: fullName.trim(),
        phone: phone?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crew-members'] }),
  });
}

export function useSetCrewMemberActive() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase
        .from('crew_members')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crew-members'] }),
  });
}

export function useCrewSheets(siteId: string, day: string) {
  return useQuery<CrewSheet[], Error>({
    queryKey: ['crew-sheets', siteId, day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crew_attendance_sheets')
        .select(
          'id, subcontractor_id, work_date, photo_path, location_flag, distance_m, ' +
            'attendance:crew_attendance(id, crew_member_id, status, workday, overtime_hours)',
        )
        .eq('construction_site_id', siteId)
        .eq('work_date', day);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CrewSheet[];
    },
  });
}

export function useCreateCrewSheet() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      siteId: string;
      crewId: string;
      day: string;
      photo: File;
      location: { latitude: number; longitude: number; accuracy: number | null } | null;
    }
  >({
    mutationFn: async ({ siteId, crewId, day, photo, location }) => {
      const path = `${siteId}/diem-danh-to/${crypto.randomUUID()}.jpg`;
      const up = await supabase.storage
        .from('construction-photos')
        .upload(path, photo, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new Error('Không tải được ảnh lên. Kiểm tra mạng rồi chụp lại.');
      const { error } = await supabase.from('crew_attendance_sheets').insert({
        company_id: PLACEHOLDER_COMPANY,
        construction_site_id: siteId,
        subcontractor_id: crewId,
        work_date: day,
        photo_path: path,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        accuracy_m: location?.accuracy ?? null,
        client_created_at: new Date().toISOString(),
        client_generated_id: crypto.randomUUID(),
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crew-sheets'] }),
  });
}

export function useSaveCrewAttendance() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      sheetId: string;
      rows: { crewMemberId: string; status: CrewAttendanceStatus; overtime: number }[];
    }
  >({
    mutationFn: async ({ sheetId, rows }) => {
      const { error } = await supabase.from('crew_attendance').upsert(
        rows.map((r) => ({
          company_id: PLACEHOLDER_COMPANY,
          sheet_id: sheetId,
          crew_member_id: r.crewMemberId,
          status: r.status,
          overtime_hours: r.status === 'vang' ? 0 : r.overtime,
        })),
        { onConflict: 'sheet_id,crew_member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crew-sheets'] });
      void queryClient.invalidateQueries({ queryKey: ['crew-month'] });
    },
  });
}

/** Tháng `yyyy-mm-01`: trạng thái bảng công từng tổ + tổng hợp công từng người. */
export function useCrewMonth(siteId: string, month: string) {
  return useQuery<{ months: CrewMonth[]; summary: CrewMonthSummaryRow[] }, Error>({
    queryKey: ['crew-month', siteId, month],
    queryFn: async () => {
      const [months, summary] = await Promise.all([
        supabase
          .from('crew_timesheet_months')
          .select('subcontractor_id, status, returned_reason, submitted_at, confirmed_at')
          .eq('construction_site_id', siteId)
          .eq('month', month),
        supabase.rpc('crew_month_summary', { p_site: siteId, p_month: month }),
      ]);
      if (months.error) throw new Error(months.error.message);
      if (summary.error) throw new Error(summary.error.message);
      return {
        months: (months.data ?? []) as CrewMonth[],
        summary: (summary.data ?? []) as CrewMonthSummaryRow[],
      };
    },
  });
}

export function useCanConfirmCrewMonth(siteId: string) {
  return useQuery<boolean, Error>({
    queryKey: ['crew-month', 'can-confirm', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('auth_confirms_crew_month', { p_site: siteId });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });
}

export function useSubmitCrewMonth() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { crewId: string; month: string }>({
    mutationFn: async ({ crewId, month }) => {
      const { error } = await supabase.rpc('submit_crew_month', {
        p_subcontractor: crewId,
        p_month: month,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crew-month'] }),
  });
}

export function useDecideCrewMonth() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { crewId: string; month: string; confirm: boolean; reason?: string }
  >({
    mutationFn: async ({ crewId, month, confirm, reason }) => {
      const { error } = await supabase.rpc('decide_crew_month', {
        p_subcontractor: crewId,
        p_month: month,
        p_confirm: confirm,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crew-month'] }),
  });
}

/** Ghi tâm công trình — người sửa được công trình, đứng tại công trường bấm. */
export function useSetSiteLocation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { siteId: string; latitude: number; longitude: number }>({
    mutationFn: async ({ siteId, latitude, longitude }) => {
      const { error } = await supabase
        .from('construction_sites')
        .update({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) })
        .eq('id', siteId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['construction-sites'] }),
  });
}
