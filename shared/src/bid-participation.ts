/**
 * G6 (0247, kế hoạch A10) — gói thầu có hình thức lựa chọn nhà thầu, loại công trình, đánh giá và
 * quyết định tham gia của Ban Giám đốc, ý kiến của Cung ứng / Thi công / Kế toán.
 *
 * Nguồn: phiếu khảo sát Ban Giám đốc (`doc/khao-sat/HoSo_KhaoSat_NVG_full.md` dòng 739, 743):
 * «phân loại công việc (xây mới nhà xưởng, cải tạo nhà máy, bảo trì, nhà cao tầng, hạ tầng, công
 * trình phụ trợ) và hình thức (chỉ định, chào giá cạnh tranh, đấu thầu). Ban Giám đốc quyết định có
 * tham gia hay không dựa trên năng lực, tiến độ, dòng tiền, pháp lý, cạnh tranh và khả năng sinh
 * lời» · «Cung ứng lấy báo giá nhà cung cấp; Phòng Thi công góp ý biện pháp và năng lực; Kế toán /
 * Tài chính đánh giá dòng tiền, bảo lãnh và điều kiện thanh toán».
 *
 * Danh sách ở đây là nguồn chung của giao diện và CSDL — ràng buộc CHECK và hàm
 * `bid_assessment_missing` trong 0247 chép đúng các mã này (phép thử canh hai bên).
 */

export const PROCUREMENT_FORMS = ['chi_dinh', 'chao_gia_canh_tranh', 'dau_thau'] as const;
export type ProcurementForm = (typeof PROCUREMENT_FORMS)[number];

export const PROCUREMENT_FORM_LABELS: Readonly<Record<ProcurementForm, string>> = {
  chi_dinh: 'Chỉ định thầu',
  chao_gia_canh_tranh: 'Chào giá cạnh tranh',
  dau_thau: 'Đấu thầu',
};

export const BID_WORK_TYPES = [
  'xay_moi_nha_xuong',
  'cai_tao_nha_may',
  'bao_tri',
  'nha_cao_tang',
  'ha_tang',
  'cong_trinh_phu_tro',
] as const;
export type BidWorkType = (typeof BID_WORK_TYPES)[number];

export const BID_WORK_TYPE_LABELS: Readonly<Record<BidWorkType, string>> = {
  xay_moi_nha_xuong: 'Xây mới nhà xưởng',
  cai_tao_nha_may: 'Cải tạo nhà máy',
  bao_tri: 'Bảo trì',
  nha_cao_tang: 'Nhà cao tầng',
  ha_tang: 'Hạ tầng',
  cong_trinh_phu_tro: 'Công trình phụ trợ',
};

/**
 * Trạng thái quyết định tham gia. `truoc_quy_dinh` = gói thầu đã lập dự toán trước khi có bước này
 * (0247 gán một lần cho gói cũ) — không đòi quyết định, KHÔNG phải «đã duyệt».
 */
export const BID_PARTICIPATION_STATUSES = [
  'chua_danh_gia',
  'cho_duyet',
  'da_duyet',
  'khong_tham_gia',
  'truoc_quy_dinh',
] as const;
export type BidParticipationStatus = (typeof BID_PARTICIPATION_STATUSES)[number];

export const BID_PARTICIPATION_STATUS_LABELS: Readonly<Record<BidParticipationStatus, string>> = {
  chua_danh_gia: 'Chưa gửi quyết định tham gia',
  cho_duyet: 'Chờ Ban Giám đốc quyết định',
  da_duyet: 'Ban Giám đốc đã duyệt tham gia',
  khong_tham_gia: 'Ban Giám đốc quyết định không tham gia',
  truoc_quy_dinh: 'Lập trước khi có bước quyết định tham gia',
};

/** Đã qua cửa quyết định tham gia — lập dự toán được. */
export function bidParticipationCleared(
  status: BidParticipationStatus | null | undefined,
): boolean {
  return status === 'da_duyet' || status === 'truoc_quy_dinh';
}

/** Sáu tiêu chí Ban Giám đốc dùng để quyết định (dòng 739 phiếu khảo sát). */
export const BID_ASSESSMENT_CRITERIA = [
  {
    key: 'nang_luc',
    label: 'Năng lực',
    hint: 'Kinh nghiệm công trình tương tự, nhân sự chủ chốt, thiết bị đáp ứng yêu cầu hồ sơ mời thầu.',
  },
  {
    key: 'tien_do',
    label: 'Tiến độ',
    hint: 'Thời gian thi công yêu cầu so với các công trình đang chạy cùng lúc.',
  },
  {
    key: 'dong_tien',
    label: 'Dòng tiền',
    hint: 'Tạm ứng, đợt thanh toán, vốn phải ứng trước, bảo lãnh phải mở.',
  },
  {
    key: 'phap_ly',
    label: 'Pháp lý',
    hint: 'Pháp lý dự án, giấy phép, điều kiện hợp đồng, chủ đầu tư.',
  },
  {
    key: 'canh_tranh',
    label: 'Cạnh tranh',
    hint: 'Số nhà thầu tham gia, đối thủ đã biết, lợi thế của NVC.',
  },
  {
    key: 'loi_nhuan',
    label: 'Khả năng sinh lời',
    hint: 'Mặt bằng giá, lợi nhuận kỳ vọng, rủi ro phát sinh.',
  },
] as const;
export type BidAssessmentCriterion = (typeof BID_ASSESSMENT_CRITERIA)[number]['key'];

export const BID_ASSESSMENT_RATINGS = ['thuan_loi', 'can_luu_y', 'rui_ro_cao'] as const;
export type BidAssessmentRating = (typeof BID_ASSESSMENT_RATINGS)[number];

export const BID_ASSESSMENT_RATING_LABELS: Readonly<Record<BidAssessmentRating, string>> = {
  thuan_loi: 'Thuận lợi',
  can_luu_y: 'Cần lưu ý',
  rui_ro_cao: 'Rủi ro cao',
};

export const BID_RECOMMENDATIONS = ['tham_gia', 'khong_tham_gia'] as const;
export type BidRecommendation = (typeof BID_RECOMMENDATIONS)[number];

export const BID_RECOMMENDATION_LABELS: Readonly<Record<BidRecommendation, string>> = {
  tham_gia: 'Đề xuất tham gia',
  khong_tham_gia: 'Đề xuất không tham gia',
};

export interface BidAssessmentEntry {
  rating?: BidAssessmentRating | null;
  note?: string | null;
}

/** Nội dung cột `bidding_projects.participation_assessment` (jsonb). */
export interface BidAssessment {
  criteria?: Partial<Record<BidAssessmentCriterion, BidAssessmentEntry>>;
  recommendation?: BidRecommendation | null;
  summary?: string | null;
}

/**
 * Những chỗ còn thiếu trước khi gửi quyết định tham gia — cùng quy tắc với `bid_assessment_missing`
 * của CSDL: tiêu chí nào cũng có mức; mức khác «Thuận lợi» thì phải ghi vì sao; phải có đề xuất.
 */
export function bidAssessmentMissing(a: BidAssessment | null | undefined): string[] {
  const missing: string[] = [];
  for (const c of BID_ASSESSMENT_CRITERIA) {
    const entry = a?.criteria?.[c.key];
    const rating = entry?.rating;
    if (!rating || !(BID_ASSESSMENT_RATINGS as readonly string[]).includes(rating)) {
      missing.push(`${c.label}: chọn mức`);
    } else if (rating !== 'thuan_loi' && !entry?.note?.trim()) {
      missing.push(`${c.label}: ghi rõ vì sao «${BID_ASSESSMENT_RATING_LABELS[rating]}»`);
    }
  }
  if (
    !a?.recommendation ||
    !(BID_RECOMMENDATIONS as readonly string[]).includes(a.recommendation)
  ) {
    missing.push('Đề xuất tham gia hay không');
  }
  return missing;
}

/** Ba phòng góp ý trên gói thầu (dòng 743). Mã = mã vai trò của phòng. */
export const BID_REVIEW_DEPARTMENTS = ['MH', 'TC', 'KT'] as const;
export type BidReviewDepartment = (typeof BID_REVIEW_DEPARTMENTS)[number];

export const BID_REVIEW_DEPARTMENT_LABELS: Readonly<Record<BidReviewDepartment, string>> = {
  MH: 'Cung ứng – Mua hàng',
  TC: 'Thi công',
  KT: 'Kế toán – Tài chính',
};

/** Phòng nào trả lời phần nào — mỗi ô là một cột của `bid_department_reviews`. */
export const BID_REVIEW_FIELDS: Readonly<
  Record<
    BidReviewDepartment,
    readonly { key: BidReviewFieldKey; label: string; placeholder: string }[]
  >
> = {
  MH: [
    {
      key: 'supplier_quotes',
      label: 'Báo giá nhà cung cấp đã lấy',
      placeholder:
        'Nhà cung cấp, vật tư chính, đơn giá, thời gian giao — đính kèm báo giá bên dưới nếu có.',
    },
  ],
  TC: [
    {
      key: 'method_opinion',
      label: 'Biện pháp thi công',
      placeholder: 'Biện pháp chủ đạo, điểm khó, thiết bị cần có.',
    },
    {
      key: 'capacity_opinion',
      label: 'Năng lực đáp ứng',
      placeholder: 'Chỉ huy trưởng, tổ đội, thiết bị còn trống trong thời gian thi công.',
    },
  ],
  KT: [
    {
      key: 'cash_flow_opinion',
      label: 'Dòng tiền',
      placeholder: 'Vốn phải ứng trước, tháng âm tiền dự kiến, nguồn bù.',
    },
    {
      key: 'guarantee_opinion',
      label: 'Bảo lãnh',
      placeholder: 'Bảo lãnh dự thầu / thực hiện / tạm ứng: hạn mức ngân hàng còn đủ không.',
    },
    {
      key: 'payment_terms_opinion',
      label: 'Điều kiện thanh toán',
      placeholder: 'Tạm ứng, đợt thanh toán, tỷ lệ giữ lại, thời hạn chủ đầu tư trả.',
    },
  ],
};

export type BidReviewFieldKey =
  | 'supplier_quotes'
  | 'method_opinion'
  | 'capacity_opinion'
  | 'cash_flow_opinion'
  | 'guarantee_opinion'
  | 'payment_terms_opinion';

export const BID_REVIEW_RECOMMENDATIONS = [
  'dong_y',
  'dong_y_co_dieu_kien',
  'khong_dong_y',
] as const;
export type BidReviewRecommendation = (typeof BID_REVIEW_RECOMMENDATIONS)[number];

export const BID_REVIEW_RECOMMENDATION_LABELS: Readonly<Record<BidReviewRecommendation, string>> = {
  dong_y: 'Đồng ý tham gia',
  dong_y_co_dieu_kien: 'Đồng ý có điều kiện',
  khong_dong_y: 'Không đồng ý tham gia',
};

export const BID_REVIEW_STATUSES = ['cho_y_kien', 'da_gop_y'] as const;
export type BidReviewStatus = (typeof BID_REVIEW_STATUSES)[number];
