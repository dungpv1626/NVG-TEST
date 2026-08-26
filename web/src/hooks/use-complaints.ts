/**
 * Khiếu nại / phản ánh của khách hàng (PRD CRM-08).
 *
 * CRUD thuần trên một bảng, quyền diễn đạt hết bằng RLS Mẫu B (người chủ trì + người phối
 * hợp) — gọi THẲNG Supabase, KHÔNG viết endpoint riêng (Tech Stack 3.2).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComplaintSeverity, StatusGroup } from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export interface ComplaintRecord {
  id: string;
  company_id: string;
  code: string;
  title: string;
  content: string;
  severity: ComplaintSeverity;
  status: StatusGroup;
  response_due_date: string | null;
  assignee_id: string | null;
  collaborator_ids: string[];
  resolution: string | null;
  customer_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  customer: { id: string; name: string } | null;
  assignee: { full_name: string } | null;
}

const COMPLAINT_SELECT =
  'id, company_id, code, title, content, severity, status, response_due_date, assignee_id, ' +
  'collaborator_ids, resolution, customer_confirmed_at, created_at, updated_at, ' +
  'customer:customers!complaints_customer_id_customers_id_fk(id, name), ' +
  'assignee:users!complaints_assignee_id_users_id_fk(full_name)';

/**
 * Danh sách khiếu nại của pháp nhân đang chọn.
 *
 * Sắp theo HẠN PHẢN HỒI tăng dần chứ không theo ngày tạo: khiếu nại sát hạn mới là việc cần
 * làm trước (CRM-08 "hạn phản hồi"). Hồ sơ chưa đặt hạn đẩy xuống cuối.
 */
export function useComplaints(options: { customerId?: string } = {}) {
  const scope = useCompanyScope();

  return useQuery<ComplaintRecord[], Error>({
    queryKey: ['complaints', scope.companyId, options.customerId ?? null],
    queryFn: async () => {
      let q = withCompanyScope(
        supabase.from('complaints').select(COMPLAINT_SELECT),
        scope,
      ).is('deleted_at', null);

      if (options.customerId) q = q.eq('customer_id', options.customerId);

      const { data, error } = await q
        .order('response_due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ComplaintRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useComplaint(id: string | undefined) {
  return useQuery<ComplaintRecord | null, Error>({
    queryKey: ['complaints', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaints')
        .select(COMPLAINT_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as ComplaintRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewComplaintInput {
  code: string;
  companyId: string;
  customerId: string;
  title: string;
  content: string;
  severity: ComplaintSeverity;
  assigneeId: string | null;
  collaboratorIds: string[];
  responseDueDate: string | null;
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewComplaintInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('complaints')
        .insert({
          code: input.code,
          company_id: input.companyId,
          customer_id: input.customerId,
          title: input.title,
          content: input.content,
          severity: input.severity,
          assignee_id: input.assigneeId,
          collaborator_ids: input.collaboratorIds,
          response_due_date: input.responseDueDate,
          status: 'in_progress',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}

/**
 * Cập nhật diễn biến xử lý.
 *
 * Nhận đúng các cột được phép sửa thay vì một `Record` mở: khiếu nại là hồ sơ có khách hàng
 * đứng sau, không nên để một chỗ gọi nhầm mà sửa được `customer_id` hay `company_id`.
 */
export function useUpdateComplaint() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        severity: ComplaintSeverity;
        status: StatusGroup;
        assignee_id: string | null;
        collaborator_ids: string[];
        response_due_date: string | null;
        resolution: string | null;
        customer_confirmed_at: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()` bắt buộc: không có nó, RLS chặn lệnh mà PostgREST vẫn trả
      // `error === null` với 0 dòng — người dùng thấy "đã lưu" trong khi không có gì đổi.
      const { error } = await supabase
        .from('complaints')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
  });
}
