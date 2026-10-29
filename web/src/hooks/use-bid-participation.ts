/**
 * G6 (0247): quyết định tham gia gói thầu và ý kiến Cung ứng / Thi công / Kế toán.
 *
 * Mọi bước đổi trạng thái đi qua hàm CSDL (`submit_bid_participation`, `request_bid_reviews`,
 * `submit_bid_review`); đọc ý kiến qua `bid_reviews()` — người của phòng không xem được Module DA
 * nên hàm trả kèm tóm tắt gói thầu (không giá dự thầu, không dự toán).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BidAssessment,
  BidReviewDepartment,
  BidReviewRecommendation,
  BidReviewStatus,
  BidWorkType,
  MoneyValue,
  ProcurementForm,
} from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface BidReviewRow {
  id: string;
  bidding_project_id: string;
  company_id: string;
  company_code: string;
  department: BidReviewDepartment;
  status: BidReviewStatus;
  request_note: string | null;
  requested_by_name: string | null;
  requested_at: string;
  recommendation: BidReviewRecommendation | null;
  summary: string | null;
  supplier_quotes: string | null;
  method_opinion: string | null;
  capacity_opinion: string | null;
  cash_flow_opinion: string | null;
  guarantee_opinion: string | null;
  payment_terms_opinion: string | null;
  responded_by_name: string | null;
  responded_at: string | null;
  can_respond: boolean;
  bid_code: string;
  bid_name: string;
  bid_stage: string;
  customer_name: string | null;
  site_address: string | null;
  submission_deadline: string | null;
  estimated_value: MoneyValue | null;
  procurement_form: ProcurementForm | null;
  work_type: BidWorkType | null;
  survey_notes: string | null;
  responsible_name: string | null;
  file_count: number;
}

/** Ý kiến các phòng của một gói thầu, hoặc mọi yêu cầu ý kiến của phòng mình (không truyền gì). */
export function useBidReviews(filter: { projectId?: string; reviewId?: string } = {}) {
  return useQuery<BidReviewRow[], Error>({
    queryKey: ['bidding_projects', 'reviews', filter.projectId ?? null, filter.reviewId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_reviews', {
        p_bidding_project_id: filter.projectId ?? null,
        p_review_id: filter.reviewId ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as BidReviewRow[];
    },
  });
}

export function useSaveBidAssessment() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        procurement_form: ProcurementForm | null;
        work_type: BidWorkType | null;
        participation_assessment: BidAssessment;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('bidding_projects')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] }),
  });
}

export function useSubmitBidParticipation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { error } = await supabase.rpc('submit_bid_participation', {
        p_bidding_project_id: projectId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useRequestBidReviews() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    { projectId: string; departments: BidReviewDepartment[]; note: string | null }
  >({
    mutationFn: async ({ projectId, departments, note }) => {
      const { data, error } = await supabase.rpc('request_bid_reviews', {
        p_bidding_project_id: projectId,
        p_departments: departments,
        p_note: note,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] }),
  });
}

export interface BidReviewAnswer {
  reviewId: string;
  recommendation: BidReviewRecommendation;
  summary: string | null;
  supplier_quotes?: string | null;
  method_opinion?: string | null;
  capacity_opinion?: string | null;
  cash_flow_opinion?: string | null;
  guarantee_opinion?: string | null;
  payment_terms_opinion?: string | null;
}

export function useSubmitBidReview() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, BidReviewAnswer>({
    mutationFn: async (a) => {
      const { error } = await supabase.rpc('submit_bid_review', {
        p_review_id: a.reviewId,
        p_recommendation: a.recommendation,
        p_summary: a.summary,
        p_supplier_quotes: a.supplier_quotes ?? null,
        p_method_opinion: a.method_opinion ?? null,
        p_capacity_opinion: a.capacity_opinion ?? null,
        p_cash_flow_opinion: a.cash_flow_opinion ?? null,
        p_guarantee_opinion: a.guarantee_opinion ?? null,
        p_payment_terms_opinion: a.payment_terms_opinion ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] }),
  });
}

// --- Tệp kèm ý kiến (kho `bid-review-files/{yêu cầu}/…`) ---------------------------------------

export const BID_REVIEW_FILES_BUCKET = 'bid-review-files';
export const BID_REVIEW_FILE_ACCEPT = 'image/*,application/pdf,.xls,.xlsx,.doc,.docx';
const MAX_BYTES = 25 * 1024 * 1024;

export interface BidReviewFile {
  id: string;
  file_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

export function useBidReviewFiles(reviewId: string | undefined, enabled = true) {
  return useQuery<BidReviewFile[], Error>({
    queryKey: ['bidding_projects', 'review-files', reviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_department_review_files')
        .select('id, file_path, file_name, size_bytes, created_at')
        .eq('review_id', reviewId!)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as BidReviewFile[];
    },
    enabled: Boolean(reviewId) && enabled,
  });
}

/** Tên trong kho: chỉ chữ không dấu, số, gạch — tên tiếng Việt có dấu hỏng đường dẫn. */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext =
    dot > 0
      ? name
          .slice(dot)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, '')
      : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'tep'}${ext}`;
}

export function useUploadBidReviewFiles() {
  const queryClient = useQueryClient();
  return useMutation<
    { uploaded: number; skipped: string[] },
    Error,
    { reviewId: string; files: File[] }
  >({
    mutationFn: async ({ reviewId, files }) => {
      const skipped: string[] = [];
      let uploaded = 0;
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          skipped.push(file.name);
          continue;
        }
        const path = `${reviewId}/${Date.now()}-${safeName(file.name)}`;
        const mime = file.type || 'application/octet-stream';
        const up = await supabase.storage
          .from(BID_REVIEW_FILES_BUCKET)
          .upload(path, file, { contentType: mime });
        if (up.error) throw up.error;
        const { error } = await supabase.from('bid_department_review_files').insert({
          review_id: reviewId,
          file_path: path,
          file_name: file.name.slice(0, 255),
          mime_type: mime,
          size_bytes: file.size,
        });
        if (error) throw error;
        uploaded++;
      }
      return { uploaded, skipped };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] }),
  });
}

export async function bidReviewFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BID_REVIEW_FILES_BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data) throw new Error('Không mở được tệp. Tải lại trang rồi thử lại.');
  return data.signedUrl;
}
