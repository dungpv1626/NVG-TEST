/**
 * G6 (0247): quyết định tham gia và ý kiến các phòng trên gói thầu — dùng chung cho kịch bản demo
 * `dau-thau` và `nvc`. Mọi nội dung là ví dụ DEMO (NVG thay bằng đánh giá thật), ghi qua đúng hàm
 * nghiệp vụ bằng đúng tài khoản vai trò.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BidAssessment } from '@nvg/shared';
import { check, one } from './client';
import { clean } from './names';

/** Ghi hình thức, loại công trình, đánh giá rồi gửi; Tổng Giám đốc duyệt tham gia. */
export async function approveParticipationDemo(
  dauThau: SupabaseClient,
  tgd: SupabaseClient,
  projectId: string,
  input: {
    procurementForm: 'chi_dinh' | 'chao_gia_canh_tranh' | 'dau_thau';
    workType: string;
    assessment: BidAssessment;
    decisionNote: string;
  },
): Promise<void> {
  check(
    'ghi hình thức, loại công trình, đánh giá tham gia',
    await dauThau
      .from('bidding_projects')
      .update({
        procurement_form: input.procurementForm,
        work_type: input.workType,
        participation_assessment: input.assessment,
      })
      .eq('id', projectId),
  );
  check(
    'gửi quyết định tham gia',
    await dauThau.rpc('submit_bid_participation', { p_bidding_project_id: projectId }),
  );
  const approval = (await one(
    'tìm phê duyệt quyết định tham gia',
    tgd
      .from('approvals')
      .select('id')
      .eq('entity_type', 'bidding_projects')
      .eq('entity_id', projectId)
      .eq('status', 'pending_approval')
      .single(),
  )) as { id: string };
  check(
    'Ban Giám đốc duyệt tham gia',
    await tgd.rpc('decide_approval', {
      p_approval_id: approval.id,
      p_decision: 'approved',
      p_note: clean(input.decisionNote),
    }),
  );
}

export interface DemoReviews {
  MH?: { recommendation: string; summary?: string; supplier_quotes: string };
  TC?: { recommendation: string; summary?: string; method: string; capacity: string };
  KT?: {
    recommendation: string;
    summary?: string;
    cash_flow: string;
    guarantee: string;
    payment_terms: string;
  };
}

/** Đấu thầu xin ý kiến; từng phòng trả lời bằng tài khoản của phòng mình. */
export async function reviewDemo(
  dauThau: SupabaseClient,
  departments: { MH?: SupabaseClient; TC?: SupabaseClient; KT?: SupabaseClient },
  projectId: string,
  reviews: DemoReviews,
  requestNote: string,
): Promise<void> {
  const codes = (Object.keys(reviews) as (keyof DemoReviews)[]).filter((d) => departments[d]);
  check(
    'xin ý kiến các phòng',
    await dauThau.rpc('request_bid_reviews', {
      p_bidding_project_id: projectId,
      p_departments: codes,
      p_note: clean(requestNote),
    }),
  );
  for (const dept of codes) {
    const client = departments[dept]!;
    const rows = check(
      `đọc yêu cầu ý kiến — ${dept}`,
      await client.rpc('bid_reviews', { p_bidding_project_id: projectId }),
    ) as { id: string; department: string }[];
    const row = rows.find((r) => r.department === dept);
    if (!row) throw new Error(`Không thấy yêu cầu ý kiến của phòng ${dept}.`);
    const r = reviews[dept]!;
    const base = {
      p_review_id: row.id,
      p_recommendation: r.recommendation,
      p_summary: r.summary ? clean(r.summary) : null,
    };
    const fields =
      dept === 'MH'
        ? { p_supplier_quotes: clean((r as NonNullable<DemoReviews['MH']>).supplier_quotes) }
        : dept === 'TC'
          ? {
              p_method_opinion: clean((r as NonNullable<DemoReviews['TC']>).method),
              p_capacity_opinion: clean((r as NonNullable<DemoReviews['TC']>).capacity),
            }
          : {
              p_cash_flow_opinion: clean((r as NonNullable<DemoReviews['KT']>).cash_flow),
              p_guarantee_opinion: clean((r as NonNullable<DemoReviews['KT']>).guarantee),
              p_payment_terms_opinion: clean((r as NonNullable<DemoReviews['KT']>).payment_terms),
            };
    check(`góp ý — ${dept}`, await client.rpc('submit_bid_review', { ...base, ...fields }));
  }
}
