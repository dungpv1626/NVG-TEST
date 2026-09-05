/**
 * Hằng số nghiệp vụ Module MH — Mua hàng và Vật tư.
 *
 * Nguồn: PRD MH-01 → MH-10, Backend Schema 4.7, Webapp Flow 3.5 và 7.
 *
 * Khác với TC, module này CÓ phiếu khảo sát trực tiếp (Phòng Mua hàng – Vật tư, PRD Mục 3):
 * các danh sách giá trị dưới đây bám sát câu chữ của PRD, không phải suy luận. Chỗ nào vẫn
 * phải suy ra vẫn được đánh dấu `SUY LUẬN` kèm căn cứ.
 *
 * Ranh giới của PRD MH ("Ranh giới KHÔNG làm") chi phối toàn bộ file này:
 * phần mềm CHỈ tổng hợp, so sánh, cảnh báo — KHÔNG tự chọn nhà cung cấp, KHÔNG tự chấm
 * chất lượng kỹ thuật. Vì vậy `compareQuotations` xếp hạng theo tổng chi phí nhưng KHÔNG
 * trả về "nhà cung cấp nên chọn", và không có hàm nào tính điểm tổng hợp cho nhà cung cấp.
 */

import { toMoney } from './format';
import type { StatusGroup } from './status';

/* ========================================================================== *
 * Nhà cung cấp (MH-03)
 * ========================================================================== */

/** Phân loại nhà cung cấp — PRD MH-03 liệt kê đúng ba nhóm này. */
export const SUPPLIER_CLASSES = ['chinh', 'du_phong', 'ngung_giao_dich'] as const;
export type SupplierClass = (typeof SUPPLIER_CLASSES)[number];

export const SUPPLIER_CLASS_LABELS: Readonly<Record<SupplierClass, string>> = {
  chinh: 'Nhà cung cấp chính',
  du_phong: 'Dự phòng',
  ngung_giao_dich: 'Đã ngừng giao dịch',
};

/**
 * Tám tiêu chí đánh giá nhà cung cấp — PRD MH-03 liệt kê nguyên văn tám tiêu chí này.
 *
 * Mỗi tiêu chí chấm 1–5 do NGƯỜI đánh giá, và KHÔNG có điểm tổng hợp tự động: PRD cấm phần
 * mềm "đánh giá chất lượng kỹ thuật" thay người. Trung bình cộng của tám con số trông vô
 * hại nhưng chính là thứ người dùng sẽ đọc thay cho việc xem từng tiêu chí, nên không tính.
 */
export const SUPPLIER_CRITERIA = [
  { key: 'specConformity', column: 'rating_spec_conformity', label: 'Đúng quy cách, tiêu chuẩn' },
  { key: 'qualityStability', column: 'rating_quality_stability', label: 'Chất lượng ổn định' },
  { key: 'priceCompetitive', column: 'rating_price', label: 'Giá cạnh tranh' },
  { key: 'deliveryOnTime', column: 'rating_delivery', label: 'Tiến độ giao hàng' },
  { key: 'paymentTerms', column: 'rating_payment_terms', label: 'Điều kiện thanh toán' },
  { key: 'documents', column: 'rating_documents', label: 'Hóa đơn, chứng từ hợp lệ' },
  { key: 'warrantyReturn', column: 'rating_warranty', label: 'Khả năng đổi trả, bảo hành' },
  { key: 'reputation', column: 'rating_reputation', label: 'Uy tín' },
] as const;

export type SupplierCriterionKey = (typeof SUPPLIER_CRITERIA)[number]['key'];

/** Thang chấm mỗi tiêu chí. SUY LUẬN — PRD nêu tiêu chí nhưng không nêu thang điểm. */
export const SUPPLIER_RATING_SCALE = { min: 1, max: 5 } as const;

/* ========================================================================== *
 * Đề nghị mua (MH-01, MH-02)
 * ========================================================================== */

/**
 * Vòng đời một đề nghị mua.
 *
 * SUY LUẬN có căn cứ — PRD MH-01 → MH-06 mô tả trình tự: tiếp nhận đề nghị (MH-01) → duyệt
 * theo hạn mức (MH-02) → hỏi và so sánh báo giá (MH-04) → đặt hàng (MH-06). Bảy giá trị
 * dưới đây là bảy chặng của đúng trình tự đó.
 *
 * `tu_choi` tách khỏi `huy`: bị từ chối là kết quả của luồng phê duyệt và hồ sơ quay lại
 * được bước Nháp để sửa; hủy là quyết định của chính người đề nghị và đóng hồ sơ lại.
 */
export const PURCHASE_REQUEST_STAGES = [
  'nhap',
  'cho_duyet',
  'da_duyet',
  'dang_mua',
  'hoan_thanh',
  'tu_choi',
  'huy',
] as const;

export type PurchaseRequestStage = (typeof PURCHASE_REQUEST_STAGES)[number];

export interface PurchaseRequestStageMeta {
  readonly label: string;
  /** Quy về 1 trong 6 nhóm trạng thái chuẩn khi hiển thị (Content Guidelines 5.1). */
  readonly statusGroup: StatusGroup;
  readonly description: string;
  readonly isTerminal: boolean;
}

export const PURCHASE_REQUEST_STAGE_META: Readonly<
  Record<PurchaseRequestStage, PurchaseRequestStageMeta>
> = {
  nhap: {
    label: 'Nháp',
    statusGroup: 'draft',
    description: 'Đang soạn nội dung đề nghị, chưa gửi phê duyệt.',
    isTerminal: false,
  },
  cho_duyet: {
    label: 'Chờ phê duyệt',
    statusGroup: 'pending_approval',
    description: 'Đã gửi phê duyệt, chờ người có hạn mức quyết định.',
    isTerminal: false,
  },
  da_duyet: {
    label: 'Đã phê duyệt',
    statusGroup: 'in_progress',
    description: 'Đã được duyệt, chờ Mua hàng hỏi báo giá và chọn nhà cung cấp.',
    isTerminal: false,
  },
  dang_mua: {
    label: 'Đang mua',
    statusGroup: 'in_progress',
    description: 'Đã chọn nhà cung cấp và lập đơn đặt hàng, chờ giao hàng.',
    isTerminal: false,
  },
  hoan_thanh: {
    label: 'Hoàn thành',
    statusGroup: 'completed',
    description: 'Đã nhận đủ hàng theo đơn đặt hàng.',
    isTerminal: true,
  },
  tu_choi: {
    label: 'Bị từ chối',
    statusGroup: 'draft',
    description: 'Người phê duyệt từ chối; sửa lại nội dung rồi gửi phê duyệt lần nữa.',
    isTerminal: false,
  },
  huy: {
    label: 'Đã hủy',
    statusGroup: 'completed',
    description: 'Người đề nghị hủy, không mua nữa.',
    isTerminal: true,
  },
};

/** Mức cấp bách của đề nghị mua. SUY LUẬN — MH-01 yêu cầu "thời điểm cần", đây là cách đọc nhanh cột đó. */
export const PURCHASE_URGENCIES = ['thuong', 'gap'] as const;
export type PurchaseUrgency = (typeof PURCHASE_URGENCIES)[number];

export const PURCHASE_URGENCY_LABELS: Readonly<Record<PurchaseUrgency, string>> = {
  thuong: 'Bình thường',
  gap: 'Cần gấp',
};

/* ========================================================================== *
 * Báo giá và so sánh chuẩn hóa (MH-04)
 * ========================================================================== */

export const QUOTATION_STATUSES = ['cho_bao_gia', 'da_nhan', 'duoc_chon', 'khong_chon'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Readonly<Record<QuotationStatus, string>> = {
  cho_bao_gia: 'Đã gửi yêu cầu, chờ báo giá',
  da_nhan: 'Đã nhận báo giá',
  duoc_chon: 'Được chọn',
  khong_chon: 'Không được chọn',
};

/**
 * Tỷ lệ phần trăm lưu bằng ĐIỂM CƠ BẢN (basis point): 1% = 100, 10% = 1000, 2,5% = 250.
 *
 * Vì sao không dùng số thập phân: tiền trong hệ thống là `bigint` đơn vị đồng (Backend
 * Schema 1.4). Nhân một `bigint` với `0.1` phải đi qua `Number` — mất chính xác ngay khi
 * đơn hàng vượt 9.007.199.254.740.991 đồng, mà đơn thép của NVS thì tính bằng tỷ. Nhân với
 * số nguyên rồi chia 10.000 giữ nguyên `bigint` từ đầu đến cuối.
 */
export const BASIS_POINTS = 10_000n;

/** Một dòng báo giá đưa vào bảng so sánh chuẩn hóa MH-04. */
export interface QuotationCostInput {
  /** Tổng tiền hàng trước thuế và trước hao hụt — Σ (số lượng × đơn giá). */
  readonly subtotal: bigint | string | number | null | undefined;
  /** Thuế suất, điểm cơ bản (VAT 10% → 1000). */
  readonly taxRateBp?: number | null;
  /** Phí vận chuyển, đồng. */
  readonly shippingFee?: bigint | string | number | null;
  /** Tỷ lệ hao hụt dự kiến, điểm cơ bản (2,5% → 250). */
  readonly wastageRateBp?: number | null;
}

export interface StandardizedQuotationCost {
  /** Tiền hàng trước thuế, sau khi cộng phần hao hụt phải mua bù. */
  readonly goodsWithWastage: bigint;
  readonly wastageAmount: bigint;
  readonly taxAmount: bigint;
  readonly shippingFee: bigint;
  /** Tổng chi phí quy về cùng một mặt bằng — con số duy nhất được phép đem so nhau. */
  readonly landedTotal: bigint;
}

/**
 * Quy một báo giá về cùng mặt bằng so sánh — MH-04.
 *
 * PRD MH-04 nói rõ: "không chỉ so sánh giá thấp nhất mà so sánh tổng chi phí và rủi ro".
 * Hàm này lo phần TỔNG CHI PHÍ (đơn giá, thuế, vận chuyển, hao hụt). Phần RỦI RO — thời hạn
 * giao, điều kiện thanh toán, bảo hành — cố ý KHÔNG quy thành tiền: quy đổi được thì phần
 * mềm đã ngầm chọn hộ nhà cung cấp, đúng thứ ranh giới PRD cấm. Chúng được trả về nguyên
 * dạng để người mua tự cân nhắc.
 *
 * Thứ tự tính: hao hụt cộng vào tiền hàng TRƯỚC khi tính thuế, vì phần mua bù cũng chịu
 * thuế như hàng chính.
 */
export function standardizeQuotationCost(input: QuotationCostInput): StandardizedQuotationCost {
  const subtotal = toMoney(input.subtotal);
  const shippingFee = toMoney(input.shippingFee);
  const wastageBp = BigInt(Math.max(0, Math.trunc(input.wastageRateBp ?? 0)));
  const taxBp = BigInt(Math.max(0, Math.trunc(input.taxRateBp ?? 0)));

  const wastageAmount = (subtotal * wastageBp) / BASIS_POINTS;
  const goodsWithWastage = subtotal + wastageAmount;
  const taxAmount = (goodsWithWastage * taxBp) / BASIS_POINTS;

  return {
    goodsWithWastage,
    wastageAmount,
    taxAmount,
    shippingFee,
    landedTotal: goodsWithWastage + taxAmount + shippingFee,
  };
}

/** Một báo giá đầy đủ để xếp vào bảng so sánh. */
export interface QuotationComparisonInput extends QuotationCostInput {
  readonly id: string;
  readonly supplierName: string;
  /** Số ngày cam kết giao kể từ ngày đặt hàng. */
  readonly deliveryDays?: number | null;
  /** Số ngày được nợ tiền hàng — càng dài càng đỡ áp lực dòng tiền. */
  readonly paymentTermDays?: number | null;
  readonly warrantyMonths?: number | null;
}

export interface QuotationComparisonRow extends StandardizedQuotationCost {
  readonly id: string;
  readonly supplierName: string;
  readonly deliveryDays: number | null;
  readonly paymentTermDays: number | null;
  readonly warrantyMonths: number | null;
  /** Thứ hạng theo tổng chi phí, 1 là thấp nhất. Chỉ là thứ hạng — không phải đề xuất chọn. */
  readonly costRank: number;
  readonly isLowestCost: boolean;
  /** Chênh lệch so với báo giá thấp nhất, đồng. Báo giá thấp nhất là 0. */
  readonly costGapVsLowest: bigint;
  readonly isFastestDelivery: boolean;
  readonly isLongestWarranty: boolean;
}

/**
 * Bảng so sánh chuẩn hóa nhiều nhà cung cấp — MH-04.
 *
 * Trả về danh sách đã xếp theo tổng chi phí tăng dần, kèm các dấu hiệu "rẻ nhất", "giao
 * nhanh nhất", "bảo hành dài nhất". CỐ Ý không có trường `recommended`: ba dấu hiệu này
 * thường rơi vào ba nhà cung cấp khác nhau, và việc cân chúng là quyết định của người mua.
 */
export function compareQuotations(
  rows: readonly QuotationComparisonInput[],
): QuotationComparisonRow[] {
  if (rows.length === 0) return [];

  const costed = rows.map((row) => ({ row, cost: standardizeQuotationCost(row) }));
  const sorted = [...costed].sort((a, b) => {
    if (a.cost.landedTotal === b.cost.landedTotal) {
      return a.row.supplierName.localeCompare(b.row.supplierName, 'vi');
    }
    return a.cost.landedTotal < b.cost.landedTotal ? -1 : 1;
  });

  const lowest = sorted[0]!.cost.landedTotal;

  const deliveryDaysGiven = rows
    .map((r) => r.deliveryDays)
    .filter((d): d is number => typeof d === 'number');
  const fastest = deliveryDaysGiven.length > 0 ? Math.min(...deliveryDaysGiven) : null;

  const warrantyGiven = rows
    .map((r) => r.warrantyMonths)
    .filter((m): m is number => typeof m === 'number');
  const longestWarranty = warrantyGiven.length > 0 ? Math.max(...warrantyGiven) : null;

  return sorted.map(({ row, cost }, index) => ({
    ...cost,
    id: row.id,
    supplierName: row.supplierName,
    deliveryDays: row.deliveryDays ?? null,
    paymentTermDays: row.paymentTermDays ?? null,
    warrantyMonths: row.warrantyMonths ?? null,
    costRank: index + 1,
    isLowestCost: cost.landedTotal === lowest,
    costGapVsLowest: cost.landedTotal - lowest,
    isFastestDelivery: fastest !== null && row.deliveryDays === fastest,
    isLongestWarranty: longestWarranty !== null && row.warrantyMonths === longestWarranty,
  }));
}

/* ========================================================================== *
 * Đơn đặt hàng và giao nhận (MH-06, MH-07)
 * ========================================================================== */

export const PURCHASE_ORDER_STAGES = ['nhap', 'da_dat', 'dang_giao', 'da_giao_du', 'huy'] as const;

export type PurchaseOrderStage = (typeof PURCHASE_ORDER_STAGES)[number];

export const PURCHASE_ORDER_STAGE_META: Readonly<
  Record<PurchaseOrderStage, { label: string; statusGroup: StatusGroup; description: string }>
> = {
  nhap: {
    label: 'Nháp',
    statusGroup: 'draft',
    description: 'Đang soạn đơn hàng, chưa gửi nhà cung cấp.',
  },
  da_dat: {
    label: 'Đã đặt hàng',
    statusGroup: 'in_progress',
    description: 'Đã gửi nhà cung cấp, chưa nhận đợt hàng nào.',
  },
  dang_giao: {
    label: 'Đang giao',
    statusGroup: 'in_progress',
    description: 'Đã nhận một phần, còn hàng chưa về.',
  },
  da_giao_du: {
    label: 'Đã giao đủ',
    statusGroup: 'completed',
    description: 'Đã nhận đủ số lượng theo đơn hàng.',
  },
  huy: {
    label: 'Đã hủy',
    statusGroup: 'completed',
    description: 'Hủy đơn hàng, không nhận hàng nữa.',
  },
};

/**
 * Cách xử lý hàng không đạt khi giao nhận — PRD MH-07 nêu ba trường hợp
 * "hàng thiếu / sai / hỏng".
 */
export const DELIVERY_ISSUE_TYPES = ['thieu', 'sai_quy_cach', 'hu_hong'] as const;
export type DeliveryIssueType = (typeof DELIVERY_ISSUE_TYPES)[number];

export const DELIVERY_ISSUE_LABELS: Readonly<Record<DeliveryIssueType, string>> = {
  thieu: 'Giao thiếu',
  sai_quy_cach: 'Sai quy cách',
  hu_hong: 'Hư hỏng',
};

export interface DeliveryProgressLine {
  readonly orderedQuantity: number | string | null | undefined;
  readonly deliveredQuantity: number | string | null | undefined;
}

export interface DeliveryProgress {
  readonly lines: number;
  /** Số dòng đã nhận đủ số lượng đặt. */
  readonly completeLines: number;
  /** Tỷ lệ dòng đã nhận đủ, 0–1. `null` khi đơn hàng chưa có dòng nào. */
  readonly ratio: number | null;
  readonly isComplete: boolean;
}

/**
 * Tiến độ giao hàng của một đơn đặt hàng — MH-06 "theo dõi tiến độ giao hàng theo cam kết".
 *
 * Đếm theo SỐ DÒNG đã nhận đủ, KHÔNG cộng số lượng của các dòng lại với nhau: một đơn có cả
 * thép tính bằng kg lẫn bulông tính bằng cái thì phép cộng đó ra một con số không có đơn vị
 * và không có nghĩa — nhận hết 5.000 con bulông sẽ hiện thành "đã xong 90%" trong khi toàn bộ
 * thép còn chưa về.
 *
 * Muốn biết tiền đã tiêu tới đâu thì đọc phần "đã phát sinh" của ngân sách công trình: chỗ đó
 * chia theo GIÁ TRỊ, do `record_delivery` tính, và đó mới là con số so được giữa các mặt hàng.
 */
export function deliveryProgress(lines: readonly DeliveryProgressLine[]): DeliveryProgress {
  let completeLines = 0;

  for (const line of lines) {
    const ordered = Number(line.orderedQuantity ?? 0);
    const delivered = Number(line.deliveredQuantity ?? 0);
    // Số lượng là số thập phân (mét, tấn) nên so bằng dấu >= chứ không phải ===.
    if (ordered > 0 && delivered >= ordered) completeLines += 1;
  }

  return {
    lines: lines.length,
    completeLines,
    ratio: lines.length > 0 ? completeLines / lines.length : null,
    isComplete: lines.length > 0 && completeLines === lines.length,
  };
}

/**
 * Trạng thái hiển thị của đề nghị mua, có tính tới thời điểm cần hàng — MH-01.
 *
 * Quá hạn là trạng thái SUY RA, không lưu trong CSDL: một đề nghị "đã duyệt" mà quá ngày
 * cần hàng vẫn là hồ sơ đang mở, chỉ khác ở chỗ nó đã trễ. Lưu thành cột thì phải có tác vụ
 * nền quét lại mỗi ngày và mỗi lần quét sót là một hồ sơ hiển thị sai.
 */
export function purchaseRequestDisplayStatus(
  stage: PurchaseRequestStage,
  neededDate: string | null | undefined,
  today: Date = new Date(),
): StatusGroup {
  const meta = PURCHASE_REQUEST_STAGE_META[stage];
  if (meta.isTerminal || stage === 'nhap' || stage === 'tu_choi') return meta.statusGroup;
  if (!neededDate) return meta.statusGroup;

  const needed = new Date(`${neededDate}T23:59:59`);
  if (Number.isNaN(needed.getTime())) return meta.statusGroup;

  return needed.getTime() < today.getTime() ? 'overdue' : meta.statusGroup;
}
