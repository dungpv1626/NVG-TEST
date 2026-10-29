/**
 * Lịch sử «đã mở Zalo để gửi khách» (0238) và thông tin liên hệ của người nhận.
 *
 * Bảng `outbound_shares` chỉ ghi lần người dùng mở Zalo / bảng chia sẻ — hệ thống không biết tin đã đi hay
 * chưa. Ai đọc / ghi được do CSDL quyết theo hồ sơ gốc (`rls_outbound_share_readable` / `_writable`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type OutboundEntityType =
  'quotes' | 'contracts' | 'contract_signed_scan' | 'showcase_shares';

export interface OutboundShare {
  id: string;
  created_at: string;
  channel: 'zalo' | 'email';
  via: 'bang_chia_se' | 'zalo_web' | 'he_thong' | null;
  /** Email giả lập — chưa có thư nào đi thật (0239). */
  simulated: boolean;
  recipient: string | null;
  file_name: string | null;
  creator: { full_name: string } | null;
}

export function useOutboundShares(entityType: OutboundEntityType, entityId: string | undefined) {
  return useQuery<OutboundShare[], Error>({
    queryKey: ['outbound-shares', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('outbound_shares')
        .select(
          'id, created_at, channel, via, recipient, file_name, simulated, ' +
            'creator:users!outbound_shares_created_by_fkey(full_name)',
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OutboundShare[];
    },
    enabled: Boolean(entityId),
  });
}

export interface RecordOutboundShareInput {
  entityType: OutboundEntityType;
  entityId: string;
  via: 'bang_chia_se' | 'zalo_web';
  recipient: string | null;
  fileName: string | null;
  shareLinkId: string | null;
}

export function useRecordOutboundShare() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RecordOutboundShareInput>({
    mutationFn: async (input) => {
      // `company_id`, `created_by`, `created_at` do trigger đặt từ hồ sơ gốc / người gọi.
      const { error } = await supabase.from('outbound_shares').insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        channel: 'zalo',
        via: input.via,
        recipient: input.recipient,
        file_name: input.fileName,
        share_link_id: input.shareLinkId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) =>
      void queryClient.invalidateQueries({
        queryKey: ['outbound-shares', input.entityType, input.entityId],
      }),
  });
}

export interface RecipientContact {
  name: string | null;
  phone: string | null;
}

/**
 * Tên và số điện thoại người nhận, đọc từ khách hàng / đầu mối / khách của cơ hội (qua RLS người gọi).
 * Không có hồ sơ nào thì trả rỗng — hộp thoại vẫn cho nhập số tại chỗ.
 */
export function useRecipientContact(subject: {
  customerId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
}) {
  const { customerId, leadId, opportunityId } = subject;
  return useQuery<RecipientContact, Error>({
    queryKey: ['recipient-contact', customerId ?? null, leadId ?? null, opportunityId ?? null],
    queryFn: async () => {
      if (customerId) {
        const { data, error } = await supabase
          .from('customers')
          .select('name, phone')
          .eq('id', customerId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return { name: data?.name ?? null, phone: data?.phone ?? null };
      }
      if (opportunityId) {
        const { data, error } = await supabase
          .from('opportunities')
          .select('customer:customers!opportunities_customer_id_customers_id_fk(name, phone)')
          .eq('id', opportunityId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const c = (data as { customer: { name: string; phone: string | null } | null } | null)
          ?.customer;
        return { name: c?.name ?? null, phone: c?.phone ?? null };
      }
      if (leadId) {
        const { data, error } = await supabase
          .from('leads')
          .select('full_name, phone')
          .eq('id', leadId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return { name: data?.full_name ?? null, phone: data?.phone ?? null };
      }
      return { name: null, phone: null };
    },
    staleTime: 60_000,
  });
}
