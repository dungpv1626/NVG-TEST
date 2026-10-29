/**
 * Dữ liệu dựng văn bản báo giá gửi khách (0239): báo giá + hạng mục + pháp nhân + khách + người lập + câu chữ đã
 * sửa trên văn bản + bản Word đã sửa tay, và mẫu Word `bao_gia` đang dùng của pháp nhân. Mọi thứ đọc qua RLS người
 * gọi; văn bản dựng ngay trên trình duyệt (dữ liệu khách không rời máy trước khi người dùng tự gửi — CLAUDE.md 5.1).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteDocumentSource, QuoteTextKey, QuoteTexts } from '@nvg/shared';
import { DOCX_MIME } from '@/lib/docx-template';
import { supabase } from '@/lib/supabase';
import type { QuoteRecord } from './use-quotes';

export const QUOTE_DOCUMENT_BUCKET = 'quote-documents';

/** Bản Word «đã sửa trong Word» tải lên (bất biến) — bản mới nhất là bản gửi khách. */
export interface QuoteUploadedDocument {
  id: string;
  version: number;
  storage_path: string;
  file_name: string;
  reason: string;
  created_at: string;
  creator: { full_name: string } | null;
}

export interface QuoteDocumentBundle {
  source: QuoteDocumentSource;
  /** Mẫu Word báo giá đang dùng của pháp nhân — không có thì chỉ dựng PDF. */
  template: { id: string; title: string; storage_path: string } | null;
  /** Mới nhất trước. */
  uploads: QuoteUploadedDocument[];
  customerEmail: string | null;
  customerPhone: string | null;
  senderPhone: string | null;
  senderName: string | null;
}

export function useQuoteDocument(quote: QuoteRecord | null, opportunityId: string) {
  return useQuery<QuoteDocumentBundle, Error>({
    queryKey: ['quotes', 'document', quote?.id],
    enabled: Boolean(quote),
    queryFn: async () => {
      const q = quote!;
      const me = await supabase.rpc('auth_user_id');
      const [items, company, opp, creator, sender, template, texts, uploads] = await Promise.all([
        supabase
          .from('quote_items')
          .select('position, description, unit, quantity, unit_price, amount')
          .eq('quote_id', q.id)
          .order('position', { ascending: true }),
        supabase
          .from('companies')
          .select(
            'code, legal_name, short_name, address, tax_code, phone, email, legal_representative, representative_title',
          )
          .eq('id', q.company_id)
          .maybeSingle(),
        supabase
          .from('opportunities')
          .select(
            'name, customer:customers!opportunities_customer_id_customers_id_fk(name, address, phone, email)',
          )
          .eq('id', opportunityId)
          .maybeSingle(),
        q.created_by
          ? supabase.from('users').select('full_name, phone').eq('id', q.created_by).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        me.data
          ? supabase
              .from('users')
              .select('full_name, phone')
              .eq('id', me.data as string)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Mẫu nào dựng văn bản do CSDL quyết (0240): đã gửi khách = mẫu lúc gửi; chưa gửi = mẫu NVG tải lên
        // trước mẫu DEMO.
        supabase.rpc('quote_template_for', { p_quote_id: q.id }).then(async (pick) => {
          if (pick.error || !pick.data) return { data: null, error: pick.error };
          return supabase
            .from('contract_templates')
            .select('id, title, storage_path')
            .eq('id', pick.data as string)
            .maybeSingle();
        }),
        supabase.from('quote_texts').select('texts').eq('quote_id', q.id).maybeSingle(),
        supabase
          .from('quote_documents')
          .select(
            'id, version, storage_path, file_name, reason, created_at, ' +
              'creator:users!quote_documents_created_by_fkey(full_name)',
          )
          .eq('quote_id', q.id)
          .order('version', { ascending: false }),
      ]);
      for (const r of [items, company, opp, template, texts, uploads]) {
        if (r.error) throw new Error(r.error.message);
      }
      const o = opp.data as {
        name: string;
        customer: {
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
        } | null;
      } | null;
      const senderRow = sender.data as { full_name: string; phone: string | null } | null;
      return {
        source: {
          quote: {
            code: q.code,
            version: q.version,
            status: q.status,
            created_at: q.created_at,
            valid_until: q.valid_until,
            notes: q.notes,
            total_value: q.total_value,
            discount_amount: q.discount_amount,
            vat_rate: q.vat_rate,
            vat_included: q.vat_included,
            line_items_based: q.line_items_based,
          },
          items: (items.data ?? []) as QuoteDocumentSource['items'],
          company: (company.data ?? null) as QuoteDocumentSource['company'],
          customer: o?.customer ?? null,
          opportunityName: o?.name ?? null,
          preparedBy: (creator.data ?? null) as QuoteDocumentSource['preparedBy'],
          texts: ((texts.data as { texts: QuoteTexts } | null)?.texts ?? {}) as QuoteTexts,
        },
        template: (template.data ?? null) as QuoteDocumentBundle['template'],
        uploads: (uploads.data ?? []) as unknown as QuoteUploadedDocument[],
        customerEmail: o?.customer?.email ?? null,
        customerPhone: o?.customer?.phone ?? null,
        senderName: senderRow?.full_name ?? null,
        senderPhone: senderRow?.phone ?? null,
      };
    },
  });
}

/** Lưu một ô câu chữ (rỗng = quay về câu mặc định). CSDL ghi lịch sử từng lần đổi (`quote_text_changes`). */
export function useSaveQuoteText() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { quoteId: string; current: QuoteTexts; key: QuoteTextKey; value: string }
  >({
    mutationFn: async ({ quoteId, current, key, value }) => {
      const texts: QuoteTexts = { ...current, [key]: value.trim() };
      if (!texts[key]) delete texts[key];
      // `company_id` do trigger đặt từ báo giá; gửi kèm cho đúng cột NOT NULL.
      const { error } = await supabase
        .from('quote_texts')
        .upsert({ quote_id: quoteId, company_id: null, texts }, { onConflict: 'quote_id' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      void queryClient.invalidateQueries({ queryKey: ['quotes', 'document', v.quoteId] });
      void queryClient.invalidateQueries({ queryKey: ['quotes', 'text-changes', v.quoteId] });
    },
  });
}

export interface QuoteTextChange {
  id: string;
  field: QuoteTextKey;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changer: { full_name: string } | null;
}

export function useQuoteTextChanges(quoteId: string | undefined) {
  return useQuery<QuoteTextChange[], Error>({
    queryKey: ['quotes', 'text-changes', quoteId],
    enabled: Boolean(quoteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_text_changes')
        .select(
          'id, field, old_value, new_value, changed_at, ' +
            'changer:users!quote_text_changes_changed_by_fkey(full_name)',
        )
        .eq('quote_id', quoteId!)
        .order('changed_at', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as QuoteTextChange[];
    },
  });
}

/** Tải lên bản đã sửa trong Word: tệp TRƯỚC, dòng SAU (dòng hỏng thì còn tệp mồ côi — chấp nhận được). */
export function useUploadQuoteDocument() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { quoteId: string; file: File; reason: string }>({
    mutationFn: async ({ quoteId, file, reason }) => {
      const me = await supabase.rpc('auth_user_id');
      const path = `${quoteId}/${crypto.randomUUID()}.docx`;
      const up = await supabase.storage
        .from(QUOTE_DOCUMENT_BUCKET)
        .upload(path, file, { contentType: DOCX_MIME, upsert: false });
      if (up.error) {
        throw new Error(
          'Không tải được tệp lên. Kiểm tra mạng và dung lượng (tối đa 20 MB), rồi thử lại.',
        );
      }
      const { error } = await supabase.from('quote_documents').insert({
        quote_id: quoteId,
        company_id: null,
        version: 0,
        storage_path: path,
        file_name: file.name,
        reason: reason.trim(),
        created_by: me.data as string,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      void queryClient.invalidateQueries({ queryKey: ['quotes', 'document', v.quoteId] }),
  });
}

/** Tên tệp gửi khách: «Bao gia NVC-BG-2026-0012 v2». */
export function quoteFileBase(quote: Pick<QuoteRecord, 'code' | 'version'>): string {
  return `Bao gia ${quote.code} v${quote.version}`;
}
