/**
 * Mẫu lời nhắn gửi khách theo pháp nhân (0239). Ai trong pháp nhân cũng đọc; chỉ Ban Giám đốc / Quản trị
 * ghi được — CSDL quyết (`auth_can_manage_message_templates`). Chưa có dòng = mẫu mặc định của hệ thống.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { effectiveMessageTemplate, type MessageChannel, type MessageTemplate } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface MessageTemplateRow {
  id: string;
  company_id: string;
  channel: MessageChannel;
  email_subject: string | null;
  body: string;
  updated_at: string;
  updater: { full_name: string } | null;
}

export function useMessageTemplateRows(companyIds: string[]) {
  return useQuery<MessageTemplateRow[], Error>({
    queryKey: ['message-templates', [...companyIds].sort()],
    enabled: companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select(
          'id, company_id, channel, email_subject, body, updated_at, ' +
            'updater:users!message_templates_updated_by_fkey(full_name)',
        )
        .eq('subject_kind', 'bao_gia')
        .in('company_id', companyIds);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MessageTemplateRow[];
    },
  });
}

/** Mẫu đang hiệu lực của một pháp nhân cho một kênh. */
export function useQuoteMessageTemplate(
  companyId: string | undefined,
  channel: MessageChannel,
): { template: MessageTemplate; isLoading: boolean } {
  const rows = useMessageTemplateRows(companyId ? [companyId] : []);
  const saved = rows.data?.find((r) => r.company_id === companyId && r.channel === channel);
  return { template: effectiveMessageTemplate(channel, saved), isLoading: rows.isLoading };
}

export function useSaveMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { companyId: string; channel: MessageChannel; subject: string | null; body: string }
  >({
    mutationFn: async ({ companyId, channel, subject, body }) => {
      const { error } = await supabase.from('message_templates').upsert(
        {
          company_id: companyId,
          subject_kind: 'bao_gia',
          channel,
          email_subject: channel === 'email' ? subject : null,
          body,
        },
        { onConflict: 'company_id,subject_kind,channel' },
      );
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}
