/**
 * Hằng số nghiệp vụ Module HD — Hợp đồng.
 *
 * Nguồn: PRD HD-01 → HD-05, Backend Schema 4.5, Webapp Flow 3.1 bước 5.
 *
 * Đây là module KHÉP LẠI Giai đoạn 1: mọi đường đi của CRM, DA và TK đều đổ về đây, và từ
 * hợp đồng phải truy ngược được về đúng cơ hội gốc, đúng bản dự toán đã duyệt, ai duyệt và
 * khi nào (PRD Mục 7, tiêu chí nghiệm thu Giai đoạn 1).
 */

import { toMoney, toNvgDateInput } from './format';
import type { StatusGroup } from './status';

/**
 * Loại hợp đồng — PRD HD-01 ("thiết kế, thi công, mua bán, khoán tổ đội/thầu phụ") cộng ba loại
 * bộ mẫu hợp đồng của NVG có mà PRD chưa tách (0185, 21/10/2026): NVG mua vật tư, NVG thuê máy
 * móc thiết bị, NVS cho thuê giàn giáo.
 *
 * Hướng tiền quyết định công nợ phải thu / phải trả ở Module KT không lẫn nhau:
 *   · NVG NHẬN tiền: thiết kế, thi công, mua bán (NVG bán), cho thuê;
 *   · NVG CHI tiền: khoán tổ đội / thầu phụ, mua vật tư, thuê thiết bị.
 */
export const CONTRACT_TYPES = [
  'thiet_ke',
  'thi_cong',
  'mua_ban',
  'cho_thue',
  'khoan_thau_phu',
  'mua_vat_tu',
  'thue_thiet_bi',
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Readonly<Record<ContractType, string>> = {
  thiet_ke: 'Hợp đồng thiết kế',
  thi_cong: 'Hợp đồng thi công',
  mua_ban: 'Hợp đồng mua bán (NVG bán)',
  cho_thue: 'Hợp đồng cho thuê (giàn giáo)',
  khoan_thau_phu: 'Hợp đồng khoán tổ đội / thầu phụ',
  mua_vat_tu: 'Hợp đồng mua vật tư (NVG mua)',
  thue_thiet_bi: 'Hợp đồng thuê máy móc thiết bị',
};

/** Loại hợp đồng NVG CHI tiền ra — văn bản đặt NVG làm bên A, công nợ là phải trả. */
const PAYABLE_TYPES: ReadonlySet<ContractType> = new Set([
  'khoan_thau_phu',
  'mua_vat_tu',
  'thue_thiet_bi',
]);

/** Hợp đồng NVG đi thuê / đi mua thì tiền chảy RA, không phải doanh thu phải thu. */
export function isPayableContract(type: ContractType): boolean {
  return PAYABLE_TYPES.has(type);
}

/** Loại hợp đồng mở ra công trình mới (`open_site_from_contract` + trigger 0185). */
export function contractOpensSite(type: ContractType): boolean {
  return type === 'thiet_ke' || type === 'thi_cong' || type === 'mua_ban';
}

/**
 * Phạm vi của hợp đồng so với cơ hội (0243, `contracts.scope_kind`).
 *
 * Quy trình NVO (hồ sơ khảo sát, anh Bùi Văn Thi): ký hợp đồng THIẾT KẾ trước, thiết kế được
 * duyệt mới dự toán và ký hợp đồng THI CÔNG riêng. Một cơ hội vì vậy có tối đa một hợp đồng
 * thiết kế + một hợp đồng thi công, HOẶC một hợp đồng thiết kế – thi công trọn gói thay cho cả
 * hai. Trọn gói vẫn mang loại `thi_cong` (mẫu NVO-HĐ-02, NVC-HĐ-02) nên không thêm loại hợp đồng.
 */
export const CONTRACT_SCOPE_KINDS = ['thiet_ke', 'thi_cong', 'tron_goi'] as const;

export type ContractScopeKind = (typeof CONTRACT_SCOPE_KINDS)[number];

export const CONTRACT_SCOPE_KIND_LABELS: Readonly<Record<ContractScopeKind, string>> = {
  thiet_ke: 'Hợp đồng thiết kế',
  thi_cong: 'Hợp đồng thi công',
  tron_goi: 'Hợp đồng thiết kế – thi công trọn gói',
};

/** Loại hợp đồng + phạm vi ghi xuống CSDL khi soạn theo một phạm vi. */
export const CONTRACT_SCOPE_KIND_TYPE: Readonly<Record<ContractScopeKind, ContractType>> = {
  thiet_ke: 'thiet_ke',
  thi_cong: 'thi_cong',
  tron_goi: 'thi_cong',
};

/** Nhãn loại hợp đồng có tính trọn gói — bản sao của `contract_scope_kind_for` (0243). */
export function contractKindLabel(type: ContractType, scopeKind?: string | null): string {
  if (type === 'thi_cong' && scopeKind === 'tron_goi') return CONTRACT_SCOPE_KIND_LABELS.tron_goi;
  return CONTRACT_TYPE_LABELS[type];
}

/** Một hợp đồng đã có của cơ hội (hủy thì không tính). */
export interface GroupContract {
  scope_kind: string | null;
  stage: string;
}

/**
 * Còn soạn được hợp đồng phạm vi nào cho cơ hội — gương của trigger `contracts_one_per_kind`
 * (0243): chỉ cặp thiết kế + thi công được cùng tồn tại; trọn gói hay loại khác đứng một mình.
 * «Chỉ thiết kế» thì không còn hợp đồng thi công / trọn gói.
 */
export function remainingContractKinds(
  existing: readonly GroupContract[],
  designOnly = false,
): ContractScopeKind[] {
  const active = existing.filter((c) => c.stage !== 'huy');
  if (active.some((c) => c.scope_kind !== 'thiet_ke' && c.scope_kind !== 'thi_cong')) return [];
  const hasDesign = active.some((c) => c.scope_kind === 'thiet_ke');
  const hasBuild = active.some((c) => c.scope_kind === 'thi_cong');
  const out: ContractScopeKind[] = [];
  if (!hasDesign) out.push('thiet_ke');
  if (!hasBuild && !designOnly) out.push('thi_cong');
  if (!hasDesign && !hasBuild && !designOnly) out.push('tron_goi');
  return out;
}

/**
 * Hồ sơ nguồn sinh ra hợp đồng (Backend Schema 4.5: `source_type/id`).
 *
 * Ba loại vì ba con đường vào Giai đoạn 1 — cơ hội của Kinh doanh, gói thầu của Dự án –
 * Đấu thầu, dự án thiết kế của NVO. Hợp đồng KHÔNG chép dữ liệu từ nguồn mà LIÊN KẾT
 * (PRD Mục 2.3), nên đường truy ngược không bao giờ đứt.
 */
export const CONTRACT_SOURCE_TYPES = [
  'opportunities',
  'bidding_projects',
  'design_projects',
] as const;

export type ContractSourceType = (typeof CONTRACT_SOURCE_TYPES)[number];

export const CONTRACT_SOURCE_LABELS: Readonly<Record<ContractSourceType, string>> = {
  opportunities: 'Cơ hội kinh doanh',
  bidding_projects: 'Gói thầu',
  design_projects: 'Dự án thiết kế',
};

/** Đường dẫn tới hồ sơ nguồn — dùng cho panel ngữ cảnh của mẫu Chi tiết (AFD 5.1). */
export const CONTRACT_SOURCE_ROUTES: Readonly<Record<ContractSourceType, string>> = {
  opportunities: '/crm/co-hoi',
  bidding_projects: '/da/goi-thau',
  design_projects: '/tk/du-an',
};

/**
 * Vòng đời một hợp đồng.
 *
 * `da_duyet` và `da_ky` là HAI bước khác nhau, cố ý: phê duyệt nội bộ theo hạn mức (HD-05)
 * xong không có nghĩa khách đã ký. Gộp một bước thì không trả lời được câu hỏi thường gặp
 * nhất của Kế toán — "hợp đồng này ký chưa, xuất hoá đơn được chưa".
 */
export const CONTRACT_STAGES = [
  'nhap',
  'cho_duyet',
  'da_duyet',
  'da_ky',
  'hoan_thanh',
  'huy',
] as const;

export type ContractStage = (typeof CONTRACT_STAGES)[number];

export interface ContractStageMeta {
  readonly label: string;
  /** Quy về 1 trong 6 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  readonly isTerminal: boolean;
}

export const CONTRACT_STAGE_META: Readonly<Record<ContractStage, ContractStageMeta>> = {
  nhap: {
    label: 'Nháp',
    statusGroup: 'draft',
    description: 'Đang soạn thảo, chưa trình ký.',
    isTerminal: false,
  },
  cho_duyet: {
    label: 'Chờ phê duyệt',
    statusGroup: 'pending_approval',
    description: 'Đã trình ký, đang chờ người có hạn mức phê duyệt.',
    isTerminal: false,
  },
  da_duyet: {
    label: 'Đã phê duyệt',
    statusGroup: 'in_progress',
    description: 'Đã được phê duyệt nội bộ. Bước tiếp theo là ký với khách hàng.',
    isTerminal: false,
  },
  da_ky: {
    label: 'Đã ký',
    statusGroup: 'in_progress',
    description: 'Hai bên đã ký. Hợp đồng đang trong quá trình thực hiện.',
    isTerminal: false,
  },
  hoan_thanh: {
    label: 'Đã quyết toán',
    statusGroup: 'completed',
    description: 'Đã nghiệm thu, quyết toán và thanh lý xong.',
    isTerminal: true,
  },
  huy: {
    label: 'Đã hủy',
    statusGroup: 'draft',
    description: 'Hợp đồng không thực hiện. Nguyên nhân được ghi lại.',
    isTerminal: true,
  },
};

/**
 * Tám nhóm điều khoản phải theo dõi — lấy nguyên văn PRD HD-02: "phạm vi, giá trị, tiến độ
 * thanh toán, tạm ứng, bảo lãnh, phạt, bảo hành và điều kiện quyết toán".
 *
 * Dùng làm checklist: nhìn là biết hợp đồng còn thiếu nhóm điều khoản nào chưa ghi — đúng
 * chỗ hay bị bỏ sót vì "để sau đọc lại bản Word".
 */
/**
 * Hình thức giá hợp đồng — Luật Xây dựng 2025 (135/2025/QH15) Điều 82 khoản 2, Nghị định
 * 210/2026/NĐ-CP Điều 6. Quyết định điều khoản điều chỉnh giá và cách thanh toán trong văn bản
 * hợp đồng (trọn gói thanh toán theo đợt, đơn giá theo khối lượng nghiệm thu), nên mẫu hợp
 * đồng chọn theo cặp loại hợp đồng × hình thức giá. Để trống được: hợp đồng cũ chưa khai.
 */
export const CONTRACT_PRICE_FORMS = [
  'tron_goi',
  'don_gia_co_dinh',
  'don_gia_dieu_chinh',
  'theo_thoi_gian',
  'chi_phi_cong_phi',
  'theo_ket_qua_dau_ra',
  'theo_ty_le_phan_tram',
  'hon_hop',
  'khac',
] as const;

export type ContractPriceForm = (typeof CONTRACT_PRICE_FORMS)[number];

export const CONTRACT_PRICE_FORM_LABELS: Readonly<Record<ContractPriceForm, string>> = {
  tron_goi: 'Trọn gói',
  don_gia_co_dinh: 'Theo đơn giá cố định',
  don_gia_dieu_chinh: 'Theo đơn giá điều chỉnh',
  theo_thoi_gian: 'Theo thời gian',
  chi_phi_cong_phi: 'Theo chi phí cộng phí',
  theo_ket_qua_dau_ra: 'Theo kết quả đầu ra',
  theo_ty_le_phan_tram: 'Theo tỷ lệ phần trăm',
  hon_hop: 'Hỗn hợp',
  khac: 'Hình thức khác',
};

export const CONTRACT_TERM_TYPES = [
  'pham_vi',
  'gia_tri',
  'tien_do_thanh_toan',
  'tam_ung',
  'bao_lanh',
  'phat',
  'bao_hanh',
  'quyet_toan',
] as const;

export type ContractTermType = (typeof CONTRACT_TERM_TYPES)[number];

/**
 * Nhóm điều khoản còn ghi được trên tab Điều khoản. `gia_tri` bỏ ra từ 0234: giá trị hợp đồng chỉ nhập một nơi
 * (`contracts.value`, bước «1. Thông tin»); dòng `gia_tri` cũ vẫn đọc được, không hiện ở cột sửa.
 */
export const EDITABLE_CONTRACT_TERM_TYPES: readonly ContractTermType[] = CONTRACT_TERM_TYPES.filter(
  (t) => t !== 'gia_tri',
);

/** Điều khoản là một ĐỢT THU TIỀN của khách — khớp danh sách trong `cash_flow_forecast_items` (0197) và 0227. */
export const COLLECTION_TERM_TYPES: readonly ContractTermType[] = [
  'tam_ung',
  'tien_do_thanh_toan',
  'quyet_toan',
];

export const CONTRACT_TERM_TYPE_LABELS: Readonly<Record<ContractTermType, string>> = {
  pham_vi: 'Phạm vi công việc',
  gia_tri: 'Giá trị hợp đồng',
  tien_do_thanh_toan: 'Tiến độ thanh toán',
  tam_ung: 'Tạm ứng',
  bao_lanh: 'Bảo lãnh',
  phat: 'Phạt vi phạm',
  bao_hanh: 'Bảo hành',
  quyet_toan: 'Điều kiện quyết toán',
};

/** Trạng thái xử lý một phát sinh ngoài hợp đồng (HD-04). */
export const AMENDMENT_STAGES = [
  'de_xuat',
  'cho_duyet',
  'da_duyet',
  'tu_choi',
  'da_thuc_hien',
] as const;

export type AmendmentStage = (typeof AMENDMENT_STAGES)[number];

export const AMENDMENT_STAGE_META: Readonly<
  Record<AmendmentStage, { label: string; statusGroup: StatusGroup }>
> = {
  de_xuat: { label: 'Đề xuất', statusGroup: 'draft' },
  cho_duyet: { label: 'Chờ phê duyệt', statusGroup: 'pending_approval' },
  da_duyet: { label: 'Đã phê duyệt', statusGroup: 'in_progress' },
  tu_choi: { label: 'Không thực hiện', statusGroup: 'draft' },
  da_thuc_hien: { label: 'Đã thực hiện', statusGroup: 'completed' },
};

/**
 * Giá trị hợp đồng sau khi cộng phát sinh, và phần còn phải thu (HD-03).
 *
 * Tính ở đây thay vì ở từng màn hình: cùng một công thức dùng cho danh sách hợp đồng, chi
 * tiết hợp đồng và dashboard — ba nơi tự cộng lấy là ba con số lệch nhau.
 *
 * Toàn bộ tính bằng `bigint` đơn vị đồng: giá trị hợp đồng vài trăm tỷ đã vượt
 * `Number.MAX_SAFE_INTEGER`, cộng bằng `number` sẽ sai ở hàng đơn vị mà không báo lỗi.
 */
export interface ContractValueSummary {
  /** Giá trị gốc theo hợp đồng đã ký. */
  readonly baseValue: bigint;
  /** Tổng phát sinh ĐÃ PHÊ DUYỆT — phát sinh chưa duyệt không được cộng vào giá trị. */
  readonly approvedAmendments: bigint;
  /** Giá trị hiện hành = gốc + phát sinh đã duyệt. */
  readonly currentValue: bigint;
  readonly collected: bigint;
  /** Còn phải thu. Không bao giờ âm: thu thừa là chuyện của Kế toán, không phải công nợ. */
  readonly outstanding: bigint;
}

export function summarizeContractValue(
  baseValue: bigint | number | string | null,
  approvedAmendments: bigint | number | string | null,
  collected: bigint | number | string | null,
): ContractValueSummary {
  const base = toMoney(baseValue);
  const amendments = toMoney(approvedAmendments);
  const paid = toMoney(collected);
  const current = base + amendments;
  const outstanding = current - paid;

  return {
    baseValue: base,
    approvedAmendments: amendments,
    currentValue: current,
    collected: paid,
    outstanding: outstanding > 0n ? outstanding : 0n,
  };
}

/**
 * Trạng thái hiển thị của một hợp đồng.
 *
 * Quá hạn tính theo mốc gần nhất còn phải làm, và chỉ có nghĩa khi hợp đồng chưa kết thúc:
 * đã quyết toán hoặc đã hủy rồi thì hạn cũ không còn là việc phải làm.
 */
export function contractDisplayStatus(
  stage: ContractStage,
  nextDueDate: string | null,
): StatusGroup {
  const meta = CONTRACT_STAGE_META[stage];

  // So theo NGÀY (giờ Việt Nam), không theo thời điểm: `new Date('2026-10-22')` là 07:00 sáng
  // giờ Việt Nam nên trước đây tới 7 giờ sáng ngày hạn đã «Quá hạn», cạnh dòng «Đến hạn hôm nay»
  // (anh Dũng 22/10/2026). Quá hạn = hạn đã qua, không tính chính ngày hạn.
  if (!meta.isTerminal && nextDueDate) {
    const due = nextDueDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < toNvgDateInput(new Date())) return 'overdue';
  }

  return meta.statusGroup;
}

/**
 * Một phát sinh có được phép thực hiện chưa (HD-04).
 *
 * PRD HD-04 nguyên văn: "mọi phát sinh phải có đề xuất, báo giá và xác nhận của khách hàng
 * TRƯỚC KHI thực hiện, TRỪ trường hợp khẩn cấp được cấp có thẩm quyền cho phép — ghi nhận
 * rõ trường hợp khẩn cấp và người phê duyệt".
 *
 * Hai đường hợp lệ, không có đường thứ ba:
 *  1. Đã phê duyệt nội bộ VÀ khách hàng đã xác nhận.
 *  2. Trường hợp khẩn cấp CÓ người có thẩm quyền cho phép — và danh tính người đó được ghi
 *     lại, vì đó chính là thứ HD-04 bắt buộc "ghi nhận rõ".
 */
export function canExecuteAmendment(input: {
  stage: AmendmentStage;
  customerConfirmedAt: string | null;
  isEmergency: boolean;
  emergencyAuthorizedBy: string | null;
}): boolean {
  if (input.isEmergency) return input.emergencyAuthorizedBy !== null;
  return input.stage === 'da_duyet' && input.customerConfirmedAt !== null;
}
