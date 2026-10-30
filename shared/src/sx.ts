/**
 * Hằng số và kiểu dữ liệu dùng chung cho Module SX — Sản xuất và Cho thuê giàn giáo (NVS).
 *
 * Nguồn: PRD SX-01 → SX-03 (số CŨ — KHÔNG trùng SX-01 → SX-22 của PRD v1.4), Backend
 * Schema 4.12.
 *
 * ⚠️ SX-01 (lệnh sản xuất) và SX-02 (giá thành) theo số cũ mới ở mức khung tối thiểu (lệnh
 * sản xuất + tiêu hao nguyên liệu), KHÔNG có công thức giá thành hay năng suất tổ sản xuất.
 * Phiếu khảo sát Xưởng đã có (02/09/2026) nhưng để trống đúng các ô cần cho phần này, kèm
 * câu "không nên ước lượng một con số để điền" — xem câu hỏi #28 của `BUILD_PLAN.md`.
 *
 * SX-03 (tài sản cho thuê) đã đủ thông tin nên triển khai đầy đủ, liên kết chặt với Module
 * KHO (KHO-06 vòng đời giàn giáo) và Module CRM (CRM-11 khách thuê).
 */

import { toNvgDateInput } from './format';
import type { StatusGroup } from './status';

/* ========================================================================== *
 * Lệnh sản xuất — SX-01 (cần xác nhận thêm)
 * ========================================================================== */

export const PRODUCTION_ORDER_STATUSES = ['nhap', 'dang_san_xuat', 'hoan_thanh', 'huy'] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

export const PRODUCTION_ORDER_STATUS_META: Readonly<
  Record<ProductionOrderStatus, { label: string; statusGroup: StatusGroup }>
> = {
  nhap: { label: 'Nháp', statusGroup: 'draft' },
  dang_san_xuat: { label: 'Đang sản xuất', statusGroup: 'in_progress' },
  hoan_thanh: { label: 'Hoàn thành', statusGroup: 'completed' },
  huy: { label: 'Đã hủy', statusGroup: 'completed' },
};

export function productionOrderDisplayStatus(status: ProductionOrderStatus): StatusGroup {
  return PRODUCTION_ORDER_STATUS_META[status].statusGroup;
}

/* ========================================================================== *
 * Cho thuê giàn giáo — SX-03
 * ========================================================================== */

/**
 * KHÔNG có trạng thái "nháp": lập hợp đồng thuê là xuất giáo ngay (CRM-11 "chu kỳ giao dịch
 * ngắn"), không có bước soạn trước rồi mới xuất sau như hợp đồng thi công.
 */
export const RENTAL_AGREEMENT_STATUSES = ['dang_thue', 'da_thu_hoi', 'huy'] as const;
export type RentalAgreementStatus = (typeof RENTAL_AGREEMENT_STATUSES)[number];

export const RENTAL_AGREEMENT_STATUS_META: Readonly<
  Record<RentalAgreementStatus, { label: string; statusGroup: StatusGroup }>
> = {
  dang_thue: { label: 'Đang cho thuê', statusGroup: 'in_progress' },
  da_thu_hoi: { label: 'Đã thu hồi', statusGroup: 'completed' },
  huy: { label: 'Đã hủy', statusGroup: 'completed' },
};

/**
 * Trạng thái hiển thị — quá hạn tính theo ngày dự kiến trả và chỉ có nghĩa khi còn đang cho
 * thuê, giống cách `siteDisplayStatus` (Module TC) và `contractDisplayStatus` (Module HD) đã
 * làm, để không có màn hình thứ ba tự định nghĩa lại "quá hạn" theo kiểu khác.
 */
export function rentalAgreementDisplayStatus(
  status: RentalAgreementStatus,
  expectedEndDate: string | null,
  today: Date = new Date(),
): StatusGroup {
  // So theo NGÀY giờ Việt Nam (như `contractDisplayStatus`): `new Date('yyyy-mm-dd')` là 07:00 sáng nên
  // trước đây chính ngày hẹn trả đã «Quá hạn» từ 7 giờ sáng (chạy thử NVS 30/10/2026).
  if (status === 'dang_thue' && expectedEndDate) {
    const due = expectedEndDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due) && due < toNvgDateInput(today)) return 'overdue';
  }
  return RENTAL_AGREEMENT_STATUS_META[status].statusGroup;
}

/**
 * Số ngày đã/đang thuê, tính từ ngày bắt đầu tới ngày trả thực tế (đã thu hồi) hoặc tới hôm
 * nay (còn đang thuê) — dùng để hiện "đang thuê X ngày" trên Chi tiết, không phải để tính
 * tiền chính thức (số đó CSDL tính và lưu lại lúc thu hồi, xem `return_rental_agreement`).
 */
export function rentalDaysSoFar(
  startDate: string,
  actualReturnDate: string | null,
  today: Date = new Date(),
): number {
  // Đếm theo NGÀY lịch (giờ Việt Nam). Chưa tới ngày bắt đầu thì 0 — trước đây đơn hẹn giao
  // tuần sau đã hiện «1 ngày» (chạy thử NVS 30/10/2026).
  const start = startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 0;
  const end = actualReturnDate ? actualReturnDate.slice(0, 10) : toNvgDateInput(today);
  if (end < start) return 0;
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

/** Một dòng của bảng giá bồi thường (`compensation_price_table`): đồng / đơn vị. */
export interface CompensationPrice {
  /** Mất hẳn. */
  mat: number;
  /** Hư hỏng. */
  hong: number;
}

/**
 * Đọc bảng giá bồi thường (tham số `compensation_price_table`, JSON theo MÃ vật tư) — bỏ dòng sai
 * dạng thay vì đoán số. Bảng rỗng / chưa cấu hình thì `{}`: người thu hồi tự nhập mức bồi thường.
 */
export function parseCompensationTable(value: unknown): Record<string, CompensationPrice> {
  const out: Record<string, CompensationPrice> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const mat = Number((raw as Record<string, unknown>).mat);
    const hong = Number((raw as Record<string, unknown>).hong);
    if (Number.isFinite(mat) && Number.isFinite(hong) && mat >= 0 && hong >= 0) {
      out[code] = { mat, hong };
    }
  }
  return out;
}

/**
 * Mức bồi thường gợi ý theo bảng giá: hỏng × giá hỏng + mất × giá mất (đồng, làm tròn). Mã chưa
 * có trong bảng thì `null` — không tự dựng giá (CLAUDE.md 5.2). Người thu hồi vẫn sửa được.
 */
export function compensationFromTable(
  price: CompensationPrice | undefined,
  damaged: number,
  lost: number,
): number | null {
  if (!price) return null;
  const d = Number.isFinite(damaged) && damaged > 0 ? damaged : 0;
  const l = Number.isFinite(lost) && lost > 0 ? lost : 0;
  return Math.round(d * price.hong + l * price.mat);
}

/* ========================================================================== *
 * Đối soát và tất toán hợp đồng thuê với Kế toán — migration 0145
 * ========================================================================== */

export interface RentalSettlementInput {
  /** Tiền đặt cọc ghi trên hợp đồng thuê. */
  deposit: number | string;
  /** Tiền thuê + bồi thường của TỪNG biên bản thu hồi đã chốt. */
  returns: { amount: number | string; signed: boolean }[];
  /** Các khoản công nợ phải thu đã sinh từ biên bản đã ký. */
  receivables: {
    direction: 'phai_thu' | 'phai_tra';
    amount: number | string;
    settled: number | string;
  }[];
}

export interface RentalSettlementPreview {
  /** Tổng tiền của mọi biên bản (đã ký lẫn chưa ký). */
  billed: number;
  /** Phần đã thành khoản phải thu bên Kế toán (biên bản đã ký). */
  receivable: number;
  collected: number;
  /** Còn phải thu trước khi cấn trừ cọc. */
  outstanding: number;
  unsignedCount: number;
  /** Tổng biên bản đã ký ≠ tổng phải thu đã sinh — dòng tổng không cân (Webapp Flow 4.9). */
  mismatch: boolean;
  /** Tất toán sẽ cấn trừ bao nhiêu tiền cọc. */
  depositOffset: number;
  /** Còn phải thu sau khi cấn trừ cọc. */
  remainingDue: number;
  /** Cọc thừa phải hoàn cho khách. */
  refund: number;
}

/**
 * Bản soi của `settle_rental_agreement`: cọc cấn trừ vào phần còn phải thu, cọc thừa hoàn khách.
 * Chỉ để hiện trước cho Kế toán thấy tất toán sẽ ghi gì — con số thật do CSDL tính.
 */
export function rentalSettlementPreview(input: RentalSettlementInput): RentalSettlementPreview {
  const deposit = Math.max(Number(input.deposit) || 0, 0);
  const billed = input.returns.reduce((s, r) => s + Number(r.amount), 0);
  const signedTotal = input.returns
    .filter((r) => r.signed)
    .reduce((s, r) => s + Number(r.amount), 0);
  const due = input.receivables.filter((r) => r.direction === 'phai_thu');
  const receivable = due.reduce((s, r) => s + Number(r.amount), 0);
  const collected = due.reduce((s, r) => s + Number(r.settled), 0);
  const outstanding = receivable - collected;
  const depositOffset = Math.min(deposit, Math.max(outstanding, 0));
  return {
    billed,
    receivable,
    collected,
    outstanding,
    unsignedCount: input.returns.filter((r) => !r.signed).length,
    mismatch: signedTotal !== receivable,
    depositOffset,
    remainingDue: outstanding - depositOffset,
    refund: deposit - depositOffset,
  };
}
