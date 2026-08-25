/**
 * Báo giá gửi khách hàng (PRD CRM-04, CRM-05).
 *
 * Mọi thao tác đổi trạng thái đều gọi hàm CSDL thay vì UPDATE trực tiếp. Không phải để cho
 * "đẹp kiến trúc": policy chỉ cho sửa báo giá còn NHÁP, nên gửi duyệt, gửi khách và ghi nhận
 * phản hồi buộc phải đi qua hàm có kiểm tra — quy tắc nghiệp vụ nằm cùng một chỗ với dữ liệu,
 * không thể lách bằng cách gọi thẳng API (Tech Stack 3.2, 3.3).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue, StatusGroup } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface QuoteRecord {
  id: string;
  code: string;
  version: number;
  is_current_version: boolean;
  /** Đơn vị đồng. */
  total_value: MoneyValue | null;
  discount_amount: MoneyValue | null;
  discount_reason: string | null;
  status: StatusGroup;
  sent_to_customer_at: string | null;
  customer_response: string | null;
  responded_at: string | null;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  created_by_user: { full_name: string } | null;
}

const QUOTE_SELECT =
  'id, code, version, is_current_version, total_value, discount_amount, discount_reason, ' +
  'status, sent_to_customer_at, customer_response, responded_at, valid_until, notes, created_at, ' +
  'created_by_user:users!quotes_created_by_users_id_fk(full_name)';

/** Danh sách phiên bản báo giá của một cơ hội — mới nhất trước (NEN-05). */
export function useQuotes(opportunityId: string | undefined) {
  return useQuery<QuoteRecord[], Error>({
    queryKey: ['quotes', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .eq('opportunity_id', opportunityId!)
        .is('deleted_at', null)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as QuoteRecord[];
    },
    enabled: Boolean(opportunityId),
  });
}

export interface NewQuoteInput {
  opportunityId: string;
  companyId: string;
  totalValue: string;
  discountAmount: string | null;
  discountReason: string | null;
  validUntil: string | null;
  notes: string | null;
}

/**
 * Tạo phiên bản báo giá mới.
 *
 * KHÔNG truyền `version`, `code` hay `is_current_version`: trigger `quotes_assign_version`
 * cấp số phiên bản, sinh mã và hạ cờ "đang hiệu lực" của bản cũ trong cùng một thao tác.
 * Để trình duyệt tự tính sẽ trùng số khi hai người soạn cùng lúc.
 */
export function useCreateQuoteVersion() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewQuoteInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({
          opportunity_id: input.opportunityId,
          company_id: input.companyId,
          total_value: input.totalValue,
          discount_amount: input.discountAmount,
          discount_reason: input.discountReason,
          valid_until: input.validUntil,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

/**
 * Sau mỗi bước chuyển trạng thái, danh sách báo giá VÀ hộp thư phê duyệt đều đổi —
 * làm mới cả hai để badge "Việc cần làm" không đứng yên với số cũ.
 */
function useQuoteFlowInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    void queryClient.invalidateQueries({ queryKey: ['approvals'] });
  };
}

/** Gửi phê duyệt nội bộ — bắt buộc trước khi gửi khách hàng (CRM-04). */
export function useRequestQuoteApproval() {
  const invalidate = useQuoteFlowInvalidation();

  return useMutation<void, Error, string>({
    mutationFn: async (quoteId) => {
      const { error } = await supabase.rpc('request_quote_approval', { p_quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Đánh dấu đã gửi khách hàng. Hàm CSDL chặn nếu chưa qua phê duyệt nội bộ. */
export function useSendQuote() {
  const invalidate = useQuoteFlowInvalidation();

  return useMutation<void, Error, string>({
    mutationFn: async (quoteId) => {
      const { error } = await supabase.rpc('send_quote_to_customer', { p_quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Ghi nhận phản hồi của khách hàng với phiên bản đã gửi (CRM-04). */
export function useRecordQuoteResponse() {
  const invalidate = useQuoteFlowInvalidation();

  return useMutation<void, Error, { quoteId: string; response: string }>({
    mutationFn: async ({ quoteId, response }) => {
      const { error } = await supabase.rpc('record_quote_response', {
        p_quote_id: quoteId,
        p_response: response,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
