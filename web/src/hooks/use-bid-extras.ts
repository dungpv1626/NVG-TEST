/**
 * Đấu thầu NVC — phần Đợt 5 (5C-1, 5C-5, 5C-9; migration 0208): hồ sơ năng lực gắn vào gói, vòng
 * làm rõ + lịch sử gia hạn, bảo lãnh dự thầu, chi tiết kết quả. Đọc / ghi thẳng Supabase, RLS quyết.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CapabilityStatusRow {
  link_id: string;
  document_id: string;
  category: string;
  title: string;
  expiry_date: string | null;
  fiscal_year: number | null;
  has_file: boolean;
  submission_deadline: string | null;
  expires_before_submission: boolean;
}

export function useBidCapabilityStatus(bidId: string) {
  return useQuery<CapabilityStatusRow[], Error>({
    queryKey: ['bid_capability_status', bidId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_capability_status', {
        p_bidding_project_id: bidId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CapabilityStatusRow[];
    },
  });
}

export function useLinkCapability() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { bidId: string; companyId: string; documentId: string; unlinkId?: string }
  >({
    mutationFn: async ({ bidId, companyId, documentId, unlinkId }) => {
      const { error } = unlinkId
        ? await supabase.from('bid_capability_links').delete().eq('id', unlinkId)
        : await supabase.from('bid_capability_links').insert({
            bidding_project_id: bidId,
            company_document_id: documentId,
            company_id: companyId,
          });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bid_capability_status'] }),
  });
}

export interface ExperienceRow {
  source: 'hop_dong' | 'mau_cong_trinh';
  source_id: string;
  title: string;
  customer_name: string | null;
  contract_type: string | null;
  value: number | null;
  year: number | null;
  location: string | null;
}

export function useBidExperience(companyId: string | null) {
  return useQuery<ExperienceRow[], Error>({
    queryKey: ['bid_experience', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_experience_candidates', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ExperienceRow[];
    },
    enabled: Boolean(companyId),
  });
}

export interface KeyPersonRow {
  employee_id: string;
  full_name: string;
  job_title: string;
  hire_date: string | null;
  certificate: string;
  certificate_no: string | null;
  certificate_expiry: string | null;
}

export function useBidKeyPersonnel(companyId: string | null) {
  return useQuery<KeyPersonRow[], Error>({
    queryKey: ['bid_key_personnel', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_key_personnel', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as KeyPersonRow[];
    },
    enabled: Boolean(companyId),
  });
}

export interface ClarificationRow {
  id: string;
  round_no: number;
  direction: 'nvg_hoi' | 'cdt_hoi';
  question: string;
  asked_date: string;
  due_date: string | null;
  answer: string | null;
  answered_date: string | null;
}

export function useBidClarifications(bidId: string) {
  return useQuery<ClarificationRow[], Error>({
    queryKey: ['bid_clarifications', bidId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_clarifications')
        .select('id, round_no, direction, question, asked_date, due_date, answer, answered_date')
        .eq('bidding_project_id', bidId)
        .order('round_no');
      if (error) throw new Error(error.message);
      return (data ?? []) as ClarificationRow[];
    },
  });
}

export function useSaveClarification() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    | {
        kind: 'new';
        bidId: string;
        companyId: string;
        direction: 'nvg_hoi' | 'cdt_hoi';
        question: string;
        dueDate: string | null;
      }
    | { kind: 'answer'; id: string; answer: string }
  >({
    mutationFn: async (input) => {
      const { error } =
        input.kind === 'new'
          ? await supabase.from('bid_clarifications').insert({
              bidding_project_id: input.bidId,
              company_id: input.companyId,
              direction: input.direction,
              question: input.question,
              due_date: input.dueDate,
              round_no: 0, // máy đánh lại số vòng
            })
          : await supabase
              .from('bid_clarifications')
              .update({ answer: input.answer })
              .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bid_clarifications'] }),
  });
}

export interface DeadlineExtensionRow {
  id: string;
  old_deadline: string | null;
  new_deadline: string | null;
  reason: string | null;
  created_at: string;
  creator: { full_name: string } | null;
}

export function useBidDeadlineHistory(bidId: string) {
  return useQuery<DeadlineExtensionRow[], Error>({
    queryKey: ['bid_deadline_extensions', bidId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_deadline_extensions')
        .select(
          'id, old_deadline, new_deadline, reason, created_at, creator:users!bid_deadline_extensions_created_by_fkey(full_name)',
        )
        .eq('bidding_project_id', bidId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DeadlineExtensionRow[];
    },
  });
}

export function useExtendBidDeadline() {
  const qc = useQueryClient();
  return useMutation<void, Error, { bidId: string; newDeadline: string; reason: string }>({
    mutationFn: async ({ bidId, newDeadline, reason }) => {
      const { error } = await supabase.rpc('extend_bid_deadline', {
        p_bidding_project_id: bidId,
        p_new_deadline: newDeadline,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bid_deadline_extensions'] });
      void qc.invalidateQueries({ queryKey: ['bidding_projects'] });
      void qc.invalidateQueries({ queryKey: ['bidding_project'] });
      void qc.invalidateQueries({ queryKey: ['bid_capability_status'] });
    },
  });
}

export interface GuaranteeRow {
  id: string;
  amount: number;
  bank_name: string;
  guarantee_number: string | null;
  issued_date: string | null;
  expiry_date: string;
  released_at: string | null;
  release_note: string | null;
}

export function useBidGuarantees(bidId: string) {
  return useQuery<GuaranteeRow[], Error>({
    queryKey: ['bid_guarantees', bidId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_guarantees')
        .select(
          'id, amount, bank_name, guarantee_number, issued_date, expiry_date, released_at, release_note',
        )
        .eq('bidding_project_id', bidId)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as GuaranteeRow[];
    },
  });
}

export function useSaveGuarantee() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    | {
        kind: 'new';
        bidId: string;
        companyId: string;
        amount: number;
        bankName: string;
        guaranteeNumber: string | null;
        issuedDate: string | null;
        expiryDate: string;
      }
    | { kind: 'release'; id: string; releasedAt: string; note: string | null }
  >({
    mutationFn: async (input) => {
      const { error } =
        input.kind === 'new'
          ? await supabase.from('bid_guarantees').insert({
              bidding_project_id: input.bidId,
              company_id: input.companyId,
              amount: input.amount,
              bank_name: input.bankName,
              guarantee_number: input.guaranteeNumber,
              issued_date: input.issuedDate,
              expiry_date: input.expiryDate,
            })
          : await supabase
              .from('bid_guarantees')
              .update({ released_at: input.releasedAt, release_note: input.note })
              .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bid_guarantees'] }),
  });
}

export interface BidOutcome {
  winner_name: string | null;
  winning_price: number | null;
  outcome_reason: string | null;
  outcome_recorded_at: string | null;
}

export function useBidOutcome(bidId: string) {
  return useQuery<BidOutcome | null, Error>({
    queryKey: ['bid_outcome', bidId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_projects')
        .select('winner_name, winning_price, outcome_reason, outcome_recorded_at')
        .eq('id', bidId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BidOutcome | null) ?? null;
    },
  });
}

export function useRecordBidOutcomeDetails() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { bidId: string; winner: string; price: number | null; reason: string }
  >({
    mutationFn: async ({ bidId, winner, price, reason }) => {
      const { error } = await supabase.rpc('record_bid_outcome_details', {
        p_bidding_project_id: bidId,
        p_winner_name: winner,
        p_winning_price: price,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bid_outcome'] }),
  });
}
