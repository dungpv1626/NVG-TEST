/**
 * Báo giá gửi khách hàng (PRD CRM-04, CRM-05).
 *
 * Mọi thao tác đổi trạng thái đều gọi hàm CSDL thay vì UPDATE trực tiếp. Không phải để cho
 * "đẹp kiến trúc": policy chỉ cho sửa báo giá còn NHÁP, nên gửi duyệt, gửi khách và ghi nhận
 * phản hồi buộc phải đi qua hàm có kiểm tra — quy tắc nghiệp vụ nằm cùng một chỗ với dữ liệu,
 * không thể lách bằng cách gọi thẳng API (Tech Stack 3.2, 3.3).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatCurrency,
  formatDate,
  formatQuantity,
  quotesForScope,
  type MoneyValue,
  type QuoteScopeKind,
  type StatusGroup,
} from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface QuoteRecord {
  id: string;
  code: string;
  company_id: string;
  version: number;
  is_current_version: boolean;
  /** Đơn vị đồng. */
  total_value: MoneyValue | null;
  discount_amount: MoneyValue | null;
  discount_reason: string | null;
  status: StatusGroup;
  sent_to_customer_at: string | null;
  /** Kênh gửi khách (0253); báo giá gửi trước 0253 để trống. */
  sent_channel: QuoteSentChannel | null;
  customer_response: string | null;
  responded_at: string | null;
  valid_until: string | null;
  notes: string | null;
  /** Thuế suất GTGT (%) — 0239. PostgREST trả `numeric` dạng số. */
  vat_rate: number | string | null;
  /** Đơn giá đã gồm thuế (true) / chưa gồm (false). */
  vat_included: boolean | null;
  /** Tổng các hạng mục — CSDL tính. */
  subtotal_value: MoneyValue | null;
  vat_amount: MoneyValue | null;
  /** Lập bằng bảng hạng mục (0239); false = báo giá cũ chỉ có tổng. */
  line_items_based: boolean;
  /** Thiết kế / thi công / trọn gói (0244); rỗng = báo giá chung. */
  scope_kind: QuoteScopeKind | null;
  /** Rủi ro người gửi nêu lúc gửi phê duyệt (0244). */
  risk_note: string | null;
  created_at: string;
  created_by: string | null;
  created_by_user: { full_name: string } | null;
}

const QUOTE_SELECT =
  'id, code, company_id, version, is_current_version, total_value, discount_amount, discount_reason, ' +
  'status, sent_to_customer_at, sent_channel, customer_response, responded_at, valid_until, notes, created_at, ' +
  'vat_rate, vat_included, subtotal_value, vat_amount, line_items_based, scope_kind, risk_note, created_by, ' +
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

export interface NewQuoteItemInput {
  description: string;
  unit: string | null;
  /** Khối lượng dạng CSDL («12.5») — `quantityToDb`. */
  quantity: string;
  /** Đơn giá, chuỗi chữ số đồng. */
  unitPrice: string;
}

export interface NewQuoteInput {
  opportunityId: string;
  companyId: string;
  items: NewQuoteItemInput[];
  discountAmount: string | null;
  discountReason: string | null;
  /** Thuế suất (%) dạng chuỗi; rỗng = không ghi thuế. */
  vatRate: string | null;
  vatIncluded: boolean | null;
  validUntil: string | null;
  notes: string | null;
  /** Loại báo giá (0244); rỗng = báo giá chung (NVS). */
  scopeKind: QuoteScopeKind | null;
}

/**
 * Tạo phiên bản báo giá mới kèm bảng hạng mục (`create_quote_version`, 0239 — một giao dịch).
 *
 * KHÔNG truyền `version`, `code`, `is_current_version` hay `total_value`: trigger
 * `quotes_assign_version` cấp số phiên bản, sinh mã và hạ cờ "đang hiệu lực" của bản cũ; trigger
 * `quotes_sync_totals` tính tổng từ hạng mục. Để trình duyệt tự tính sẽ trùng số / lệch tổng.
 */
export function useCreateQuoteVersion() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewQuoteInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('create_quote_version', {
        p_opportunity_id: input.opportunityId,
        p_company_id: input.companyId,
        p_items: input.items.map((i) => ({
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unitPrice,
        })),
        p_discount_amount: input.discountAmount,
        p_discount_reason: input.discountReason,
        p_vat_rate: input.vatRate,
        p_vat_included: input.vatIncluded,
        p_valid_until: input.validUntil,
        p_notes: input.notes,
        p_scope_kind: input.scopeKind,
      });
      if (error) throw error;
      return { id: data as string };
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
    // Điều kiện bước và giai đoạn của cơ hội đổi theo báo giá (gửi khách → Đàm phán, 0162).
    void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    void queryClient.invalidateQueries({ queryKey: ['opportunity_stage_history'] });
  };
}

/**
 * Gửi phê duyệt nội bộ — bắt buộc trước khi gửi khách hàng (CRM-04). Kèm ghi chú rủi ro cho người duyệt
 * (0244). CSDL chọn người duyệt: dưới mức lợi nhuận tối thiểu thì Tổng Giám đốc.
 */
export function useRequestQuoteApproval() {
  const invalidate = useQuoteFlowInvalidation();

  return useMutation<void, Error, { quoteId: string; riskNote: string | null }>({
    mutationFn: async ({ quoteId, riskNote }) => {
      const { error } = await supabase.rpc('request_quote_approval', {
        p_quote_id: quoteId,
        p_risk_note: riskNote,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Kênh gửi báo giá cho khách (0253). */
export type QuoteSentChannel = 'zalo' | 'email' | 'tan_tay' | 'khac';

export const QUOTE_SENT_CHANNEL_LABELS: Readonly<Record<QuoteSentChannel, string>> = {
  zalo: 'Zalo',
  email: 'Email',
  tan_tay: 'Gửi tận tay',
  khac: 'Khác',
};

/** Đánh dấu đã gửi khách hàng, kèm kênh gửi. Hàm CSDL chặn nếu chưa qua phê duyệt nội bộ. */
export function useSendQuote() {
  const invalidate = useQuoteFlowInvalidation();

  return useMutation<void, Error, { quoteId: string; channel: QuoteSentChannel }>({
    mutationFn: async ({ quoteId, channel }) => {
      const { error } = await supabase.rpc('send_quote_to_customer', {
        p_quote_id: quoteId,
        p_channel: channel,
      });
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

/**
 * Nguồn gợi ý điều khoản hợp đồng (`suggestContractTerms`): báo giá đang hiệu lực với khách
 * (bản mới nhất đã gửi; chưa gửi thì bản đã duyệt mới nhất) và báo cáo khảo sát đã duyệt mới nhất.
 * Hợp đồng thiết kế lấy báo giá thiết kế, hợp đồng thi công / trọn gói lấy báo giá cùng loại; không có
 * thì báo giá chung (0244, gương `create_contract_from_source`).
 */
export function useContractTermSources(opportunityId: string | null, scopeKind?: string | null) {
  return useQuery({
    queryKey: ['quotes', 'term-sources', opportunityId, scopeKind ?? null],
    enabled: Boolean(opportunityId),
    queryFn: async () => {
      const [quotes, surveys] = await Promise.all([
        supabase
          .from('quotes')
          .select(
            'code, version, status, total_value, discount_amount, discount_reason, notes, sent_to_customer_at, scope_kind',
          )
          .eq('opportunity_id', opportunityId!)
          .is('deleted_at', null)
          .order('version', { ascending: false }),
        supabase
          .from('site_surveys')
          .select('surveyed_at, needs, schedule_note')
          .eq('opportunity_id', opportunityId!)
          .eq('report_status', 'da_duyet')
          .is('deleted_at', null)
          .order('surveyed_at', { ascending: false })
          .limit(1),
      ]);
      if (quotes.error) throw new Error(quotes.error.message);
      if (surveys.error) throw new Error(surveys.error.message);
      const list = quotesForScope(quotes.data ?? [], scopeKind);
      const quote =
        list.find((q) => q.sent_to_customer_at !== null) ??
        list.find((q) => q.status === 'completed') ??
        null;
      // 0256 (câu 14): cơ hội cho thuê (NVS) báo giá bằng báo giá THUÊ — không có báo giá chung thì lấy
      // dòng hàng / giá từ báo giá thuê đã duyệt (ưu tiên bản đã gửi khách).
      return {
        quote: quote ?? (await rentalQuoteAsTermSource(opportunityId!)),
        survey: surveys.data?.[0] ?? null,
      };
    },
  });
}

/** Báo giá thuê đã duyệt của cơ hội, dựng thành nguồn gợi ý điều khoản (0256). */
async function rentalQuoteAsTermSource(opportunityId: string) {
  const { data, error } = await supabase
    .from('rental_quotes')
    .select(
      'code, estimated_total, needed_date, expected_end_date, sent_to_customer_at, decided_at, ' +
        'items:rental_quote_items(kind, quantity, unit_price, material:materials(code, name, unit))',
    )
    .eq('opportunity_id', opportunityId)
    .eq('status', 'da_duyet')
    .is('deleted_at', null)
    .order('decided_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as {
    code: string;
    estimated_total: number | string | null;
    needed_date: string | null;
    expected_end_date: string | null;
    sent_to_customer_at: string | null;
    items: {
      kind: 'thue' | 'mua';
      quantity: number | string;
      unit_price: number | string;
      material: { code: string; name: string; unit: string | null } | null;
    }[];
  }[];
  const r = rows.find((x) => x.sent_to_customer_at !== null) ?? rows[0];
  if (!r) return null;
  const lines = r.items.map(
    (i) =>
      `- ${i.kind === 'thue' ? 'Cho thuê' : 'Bán'} ${i.material?.code ?? ''} ${i.material?.name ?? ''}: ` +
      `${formatQuantity(Number(i.quantity))} ${i.material?.unit ?? ''} × ${formatCurrency(Number(i.unit_price))}` +
      `${i.kind === 'thue' ? ' / ngày' : ''}`,
  );
  const period =
    r.needed_date && r.expected_end_date
      ? `Thời gian thuê dự kiến từ ${formatDate(r.needed_date)} đến ${formatDate(r.expected_end_date)}.`
      : null;
  return {
    code: r.code,
    version: 1,
    total_value: r.estimated_total,
    discount_amount: null,
    discount_reason: null,
    notes: [`Hàng hoá theo báo giá thuê ${r.code}:`, ...lines, ...(period ? [period] : [])].join(
      '\n',
    ),
    sent_to_customer_at: r.sent_to_customer_at,
  };
}

export interface QuoteItemRecord {
  id: string;
  position: number;
  description: string;
  unit: string | null;
  quantity: number | string;
  unit_price: MoneyValue;
  amount: MoneyValue;
}

/** Hạng mục của một báo giá (0239) — RLS theo báo giá mẹ. */
export function useQuoteItems(quoteId: string | undefined) {
  return useQuery<QuoteItemRecord[], Error>({
    queryKey: ['quotes', 'items', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_items')
        .select('id, position, description, unit, quantity, unit_price, amount')
        .eq('quote_id', quoteId!)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as QuoteItemRecord[];
    },
    enabled: Boolean(quoteId),
  });
}
