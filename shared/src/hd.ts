/**
 * Hằng số nghiệp vụ Module HD — Hợp đồng.
 *
 * Nguồn: PRD HD-01 → HD-05, Backend Schema 4.5, Webapp Flow 3.1 bước 5.
 *
 * Đây là module KHÉP LẠI Giai đoạn 1: mọi đường đi của CRM, DA và TK đều đổ về đây, và từ
 * hợp đồng phải truy ngược được về đúng cơ hội gốc, đúng bản dự toán đã duyệt, ai duyệt và
 * khi nào (PRD Mục 7, tiêu chí nghiệm thu Giai đoạn 1).
 */

import { toMoney } from './format';
import type { StatusGroup } from './status';

/**
 * Bốn loại hợp đồng — lấy nguyên văn PRD HD-01: "thiết kế, thi công, mua bán, khoán tổ
 * đội/thầu phụ".
 *
 * `khoan_thau_phu` là hợp đồng NVG đi THUÊ (chi ra), ba loại còn lại là hợp đồng NVG NHẬN
 * (thu vào). Phân biệt được thì công nợ phải thu và phải trả ở Module KT không lẫn nhau.
 */
export const CONTRACT_TYPES = ['thiet_ke', 'thi_cong', 'mua_ban', 'khoan_thau_phu'] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Readonly<Record<ContractType, string>> = {
  thiet_ke: 'Hợp đồng thiết kế',
  thi_cong: 'Hợp đồng thi công',
  mua_ban: 'Hợp đồng mua bán',
  khoan_thau_phu: 'Hợp đồng khoán tổ đội / thầu phụ',
};

/** Hợp đồng NVG đi thuê thì tiền chảy RA, không phải doanh thu phải thu. */
export function isPayableContract(type: ContractType): boolean {
  return type === 'khoan_thau_phu';
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
  /** Quy về 1 trong 5 nhóm trạng thái chuẩn khi hiển thị nhãn (Content Guidelines 5.1). */
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

  if (!meta.isTerminal && nextDueDate) {
    const due = new Date(nextDueDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'overdue';
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
