/**
 * Luồng của hồ sơ — đang ở đâu, bước tiếp theo, bước sau nữa, bước cuối, ai đang giữ.
 *
 * Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 4): người dùng không biết tiến độ đến đâu và bước kế
 * tiếp là gì — mỗi module tự làm dải bước riêng (KT, TK), số còn lại không có. Tệp này là MỘT
 * định nghĩa cho dải tiến trình dùng chung (`web/src/components/entity/step-track.tsx`).
 *
 * `next` là bước ĐI TỚI được phép bằng tay, PHẢI khớp hàm chuyển bước của CSDL
 * (`opportunity_next_stages` 0155; quy tắc hợp đồng 0157; `SITE_STAGE_TRANSITIONS`). Bước có
 * `auto` không bấm tay được — hồ sơ liên kết đẩy sang (0158). Điều kiện từng bước KHÔNG khai ở
 * đây: giao diện đọc thẳng `stage_readiness` của CSDL, để màn hình và hàm chặn không thể lệch.
 */

import { BIDDING_STAGE_META, type BiddingStage } from './da';
import { CONTRACT_STAGE_META, type ContractStage } from './hd';
import { OPPORTUNITY_STAGE_META, type OpportunityStage } from './crm';
import { SITE_STAGE_META, SITE_STAGE_TRANSITIONS, type SiteStage } from './tc';

export interface FlowStep<S extends string> {
  readonly label: string;
  /** Ai giữ hồ sơ ở bước này và họ phải làm gì — câu ngắn, hiện dưới dải tiến trình. */
  readonly owner: string;
  /** Bước đi tới được phép bằng tay. */
  readonly next: readonly S[];
  /** Bước này do hồ sơ liên kết đẩy sang, không bấm tay được. */
  readonly auto?: string;
}

export interface Flow<S extends string> {
  /** Đường chính, theo thứ tự — bước cuối là kết quả mong muốn. */
  readonly main: readonly S[];
  /** Nhánh rẽ kết thúc sớm (mất cơ hội, hủy, tạm dừng) — không nằm trên đường chính. */
  readonly exits: readonly S[];
  readonly steps: Readonly<Record<S, FlowStep<S>>>;
}

export const OPPORTUNITY_FLOW: Flow<OpportunityStage> = {
  main: ['tiep_nhan', 'xac_minh', 'khao_sat', 'bao_gia', 'dam_phan', 'ky_hop_dong'],
  exits: ['mat_co_hoi'],
  steps: {
    tiep_nhan: {
      label: OPPORTUNITY_STAGE_META.tiep_nhan.label,
      owner: 'Kinh doanh xác minh nhu cầu và phân loại khách hàng',
      next: ['xac_minh'],
    },
    xac_minh: {
      label: OPPORTUNITY_STAGE_META.xac_minh.label,
      owner: 'Kinh doanh xác minh khách có nhu cầu thật hay chưa và loại công trình',
      next: ['khao_sat', 'bao_gia'],
    },
    khao_sat: {
      label: OPPORTUNITY_STAGE_META.khao_sat.label,
      owner:
        'Kinh doanh khảo sát hiện trạng (hoặc ghi lý do không khảo sát), rồi lập báo giá hoặc chuyển Đấu thầu / Thiết kế',
      next: ['bao_gia'],
    },
    bao_gia: {
      label: OPPORTUNITY_STAGE_META.bao_gia.label,
      owner: 'Kinh doanh lập báo giá, gửi phê duyệt rồi gửi khách (hoặc gói thầu được nộp)',
      next: ['dam_phan'],
    },
    dam_phan: {
      label: OPPORTUNITY_STAGE_META.dam_phan.label,
      owner: 'Kinh doanh đàm phán và soạn hợp đồng; Ban Giám đốc ký',
      next: [],
    },
    ky_hop_dong: {
      label: OPPORTUNITY_STAGE_META.ky_hop_dong.label,
      owner: 'Đã chốt — hồ sơ tiếp tục ở Hợp đồng và Công trình',
      next: [],
      auto: 'Tự chuyển khi hợp đồng liên kết được ghi nhận đã ký',
    },
    mat_co_hoi: {
      label: OPPORTUNITY_STAGE_META.mat_co_hoi.label,
      owner: 'Đã đóng kèm nguyên nhân',
      next: [],
    },
  },
};

export const CONTRACT_FLOW: Flow<ContractStage> = {
  main: ['nhap', 'cho_duyet', 'da_duyet', 'da_ky', 'hoan_thanh'],
  exits: ['huy'],
  steps: {
    nhap: {
      label: CONTRACT_STAGE_META.nhap.label,
      owner: 'Người chịu trách nhiệm soạn điều khoản rồi gửi phê duyệt',
      next: ['cho_duyet'],
    },
    cho_duyet: {
      label: CONTRACT_STAGE_META.cho_duyet.label,
      owner: 'Người có hạn mức phê duyệt hợp đồng xem xét',
      next: [],
      auto: 'Tự chuyển khi được phê duyệt trong Hộp thư Phê duyệt',
    },
    da_duyet: {
      label: CONTRACT_STAGE_META.da_duyet.label,
      owner: 'Ban Giám đốc ký với khách và ghi nhận đã ký',
      next: ['da_ky'],
      auto: 'Tự chuyển khi được phê duyệt trong Hộp thư Phê duyệt',
    },
    da_ky: {
      label: CONTRACT_STAGE_META.da_ky.label,
      owner: 'Thi công mở công trình và thực hiện; Ban Giám đốc quyết toán khi đã bàn giao',
      next: ['hoan_thanh'],
    },
    hoan_thanh: {
      label: CONTRACT_STAGE_META.hoan_thanh.label,
      owner: 'Đã quyết toán',
      next: [],
    },
    huy: {
      label: CONTRACT_STAGE_META.huy.label,
      owner: 'Đã hủy kèm nguyên nhân',
      next: [],
    },
  },
};

const siteNext = (stage: SiteStage): readonly SiteStage[] =>
  SITE_STAGE_TRANSITIONS[stage].filter((s) => s !== 'tam_dung');

export const SITE_FLOW: Flow<SiteStage> = {
  main: ['chuan_bi', 'dang_thi_cong', 'nghiem_thu', 'bao_hanh', 'hoan_thanh'],
  exits: ['tam_dung'],
  steps: {
    chuan_bi: {
      label: SITE_STAGE_META.chuan_bi.label,
      owner: 'Trưởng phòng Thi công phân công và khởi công',
      next: siteNext('chuan_bi'),
    },
    dang_thi_cong: {
      label: SITE_STAGE_META.dang_thi_cong.label,
      owner: 'Chỉ huy trưởng ghi nhật ký, đề nghị vật tư, nghiệm thu từng đợt',
      next: siteNext('dang_thi_cong'),
    },
    nghiem_thu: {
      label: SITE_STAGE_META.nghiem_thu.label,
      owner: 'Lập biên bản nghiệm thu bàn giao có chữ ký khách hàng',
      next: siteNext('nghiem_thu'),
    },
    bao_hanh: {
      label: SITE_STAGE_META.bao_hanh.label,
      owner: 'Theo dõi bảo hành tới hết hạn',
      next: siteNext('bao_hanh'),
    },
    hoan_thanh: {
      label: SITE_STAGE_META.hoan_thanh.label,
      owner: 'Đã bàn giao và hết bảo hành',
      next: [],
    },
    tam_dung: {
      label: SITE_STAGE_META.tam_dung.label,
      owner: 'Đang tạm dừng — mở lại khi có quyết định tiếp tục',
      next: siteNext('tam_dung'),
    },
  },
};

/**
 * Gói thầu — không bước nào bấm tay được: bước chỉ đổi qua hàm (0028). Bốn bước đầu đi theo việc thật (0226: ghi khảo
 * sát, dòng khối lượng đầu tiên, dự toán); khảo sát bỏ qua được khi đã có BOQ của chủ đầu tư.
 */
export const BIDDING_FLOW: Flow<BiddingStage> = {
  main: [
    'tiep_nhan_ho_so',
    'khao_sat',
    'boc_tach',
    'du_toan',
    'cho_duyet_gia',
    'da_duyet_gia',
    'nop_thau',
    'trung_thau',
  ],
  exits: ['truot_thau'],
  steps: {
    tiep_nhan_ho_so: {
      label: BIDDING_STAGE_META.tiep_nhan_ho_so.label,
      owner: 'Đấu thầu kiểm hồ sơ mời thầu, ghi nội dung cần làm rõ',
      next: [],
    },
    khao_sat: {
      label: BIDDING_STAGE_META.khao_sat.label,
      owner: 'Đấu thầu khảo sát hiện trạng, ghi biện pháp và rủi ro',
      next: [],
      auto: 'Tự chuyển khi ghi kết quả khảo sát ở tab Khảo sát; đã có BOQ của chủ đầu tư thì bỏ qua được',
    },
    boc_tach: {
      label: BIDDING_STAGE_META.boc_tach.label,
      owner: 'Đấu thầu bóc tách khối lượng từ bản vẽ / BOQ',
      next: [],
      auto: 'Tự chuyển khi có dòng khối lượng đầu tiên ở tab Khối lượng',
    },
    du_toan: {
      label: BIDDING_STAGE_META.du_toan.label,
      owner: 'Đấu thầu lập dự toán và giá dự thầu, rồi gửi phê duyệt giá',
      next: [],
      auto: 'Tự chuyển khi lập dự toán ở tab Dự toán',
    },
    cho_duyet_gia: {
      label: BIDDING_STAGE_META.cho_duyet_gia.label,
      owner: 'Người có hạn mức phê duyệt giá dự thầu xem xét',
      next: [],
      auto: 'Tự chuyển khi gửi dự toán phê duyệt giá',
    },
    da_duyet_gia: {
      label: BIDDING_STAGE_META.da_duyet_gia.label,
      owner: 'Đấu thầu hoàn thiện hồ sơ thầu và nộp cho chủ đầu tư',
      next: [],
      auto: 'Tự chuyển khi giá được phê duyệt trong Hộp thư Phê duyệt',
    },
    nop_thau: {
      label: BIDDING_STAGE_META.nop_thau.label,
      owner: 'Đấu thầu theo dõi kết quả và ghi nhận trúng / trượt thầu',
      next: [],
      auto: 'Tự chuyển khi xác nhận đã nộp hồ sơ thầu',
    },
    trung_thau: {
      label: BIDDING_STAGE_META.trung_thau.label,
      owner: 'Lập hợp đồng và bàn giao ngân sách thi công',
      next: [],
      auto: 'Ghi nhận khi chủ đầu tư công bố kết quả',
    },
    truot_thau: {
      label: BIDDING_STAGE_META.truot_thau.label,
      owner: 'Đã ghi nhận trượt thầu kèm nguyên nhân',
      next: [],
    },
  },
};

export interface StepWindow<S extends string> {
  /** Các bước trên đường chính đã đi qua. */
  readonly done: readonly S[];
  readonly current: S;
  /** Bước kế tiếp trên đường chính (không có nếu đang ở bước cuối hoặc nhánh rẽ). */
  readonly next: S | null;
  /** Bước sau bước kế tiếp. */
  readonly after: S | null;
  /** Bước cuối của đường chính — kết quả mong muốn. */
  readonly last: S;
  /** Đang ở nhánh rẽ (mất cơ hội, hủy, tạm dừng). */
  readonly isExit: boolean;
}

/** Cắt đường chính quanh bước hiện tại: đã xong · hiện tại · tiếp theo · sau đó · cuối. */
export function stepWindow<S extends string>(flow: Flow<S>, current: S): StepWindow<S> {
  const last = flow.main[flow.main.length - 1]!;
  const i = flow.main.indexOf(current);
  if (i < 0) {
    return { done: [], current, next: null, after: null, last, isExit: true };
  }
  return {
    done: flow.main.slice(0, i),
    current,
    next: flow.main[i + 1] ?? null,
    after: flow.main[i + 2] ?? null,
    last,
    isExit: false,
  };
}
