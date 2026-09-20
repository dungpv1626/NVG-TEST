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
  if (status === 'dang_thue' && expectedEndDate) {
    const due = new Date(expectedEndDate);
    if (!Number.isNaN(due.getTime()) && due.getTime() < today.getTime()) return 'overdue';
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
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;

  const end = actualReturnDate ? new Date(actualReturnDate) : today;
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDay(end) - startOfDay(start)) / 86_400_000) + 1;
  return Math.max(days, 1);
}
