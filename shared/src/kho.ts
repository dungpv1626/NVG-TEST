/**
 * Hằng số nghiệp vụ Module KHO — Quản lý Kho.
 *
 * Nguồn: PRD KHO-01 → KHO-10, Backend Schema 4.8, Webapp Flow 3.6 và 4.7.
 *
 * Bộ phận Kho CÓ phiếu khảo sát trực tiếp (PRD Mục 3), và là bộ phận nêu mong muốn rõ nhất:
 * "thao tác được trên di động, hoạt động khi mạng yếu, không phải ghi sổ giấy song song"
 * (Webapp Flow 3.6). Các danh sách dưới đây bám câu chữ PRD; chỗ nào suy ra đều đánh dấu
 * `SUY LUẬN` kèm căn cứ.
 *
 * Ranh giới PRD KHO chi phối cả file: phần mềm KHÔNG thay thế việc kiểm đếm và đánh giá chất
 * lượng thực tế — nó ghi nhận kết quả, lưu bằng chứng, và cảnh báo. Vì vậy không có hàm nào
 * ở đây tự suy ra số tồn "đúng" hay tự kết luận chênh lệch do đâu.
 */

import { toMoney } from './format';
import type { StatusGroup } from './status';

/* ========================================================================== *
 * Danh mục kho — KHO-01
 * ========================================================================== */

/** Năm loại kho — PRD KHO-01 liệt kê đúng năm nhóm này. */
export const WAREHOUSE_TYPES = [
  'vat_tu_xay_dung',
  'nguyen_lieu_xuong',
  'gian_giao_thanh_pham',
  'cong_cu_dung_cu',
  'kho_cong_trinh',
] as const;

export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

export const WAREHOUSE_TYPE_LABELS: Readonly<Record<WarehouseType, string>> = {
  vat_tu_xay_dung: 'Kho vật tư xây dựng',
  nguyen_lieu_xuong: 'Kho nguyên liệu xưởng',
  gian_giao_thanh_pham: 'Kho giàn giáo thành phẩm',
  cong_cu_dung_cu: 'Kho công cụ dụng cụ',
  kho_cong_trinh: 'Kho tại công trình',
};

/* ========================================================================== *
 * Nhập – xuất – điều chuyển – kiểm kê — KHO-03 → KHO-07
 * ========================================================================== */

/**
 * Bốn loại phiếu kho.
 *
 * Điều chuyển (KHO-05) là MỘT loại phiếu chứ không phải một cặp nhập + xuất rời: "cập nhật
 * đồng thời giảm tồn nơi xuất và tăng tồn nơi nhận". Tách thành hai phiếu độc lập thì có lúc
 * hàng đã rời kho A mà chưa vào kho B, và số tổng toàn hệ thống sai trong khoảng đó.
 */
export const STOCK_MOVEMENT_TYPES = ['nhap', 'xuat', 'dieu_chuyen', 'kiem_ke'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Readonly<Record<StockMovementType, string>> = {
  nhap: 'Nhập kho',
  xuat: 'Xuất kho',
  dieu_chuyen: 'Điều chuyển',
  kiem_ke: 'Điều chỉnh kiểm kê',
};

/** Mã loại phiếu dùng khi cấp mã hồ sơ (`next_record_code`). */
export const STOCK_MOVEMENT_CODE_PREFIX: Readonly<Record<StockMovementType, string>> = {
  nhap: 'PN',
  xuat: 'PX',
  dieu_chuyen: 'PDC',
  kiem_ke: 'PKK',
};

/**
 * Lý do xuất kho.
 *
 * SUY LUẬN — KHO-04 mô tả thao tác xuất nhưng không liệt kê lý do. Bốn giá trị dưới đây suy
 * từ ba nơi tiêu vật tư mà tài liệu có nhắc: công trình (TC), lệnh sản xuất (KHO-10 → SX) và
 * hàng cho thuê (KHO-10 → CRM). `khac` giữ lại để không ép người dùng chọn sai.
 */
export const STOCK_ISSUE_REASONS = ['cong_trinh', 'san_xuat', 'cho_thue', 'khac'] as const;
export type StockIssueReason = (typeof STOCK_ISSUE_REASONS)[number];

export const STOCK_ISSUE_REASON_LABELS: Readonly<Record<StockIssueReason, string>> = {
  cong_trinh: 'Cấp cho công trình',
  san_xuat: 'Xuất cho sản xuất',
  cho_thue: 'Xuất cho thuê',
  khac: 'Lý do khác',
};

/**
 * Trạng thái một đợt kiểm kê — KHO-07.
 *
 * Bốn bước bám đúng câu chữ: "tạm dừng nhập–xuất trong lúc kiểm; đối chiếu số liệu thực tế
 * với sổ kho; xác định nguyên nhân chênh lệch; lập biên bản và TRÌNH PHÊ DUYỆT TRƯỚC KHI
 * điều chỉnh số liệu".
 */
export const STOCKTAKE_STATUSES = [
  'dang_kiem',
  'cho_duyet',
  'khop_so',
  'da_dieu_chinh',
  'huy',
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export const STOCKTAKE_STATUS_META: Readonly<
  Record<StocktakeStatus, { label: string; statusGroup: StatusGroup; description: string }>
> = {
  dang_kiem: {
    label: 'Đang kiểm đếm',
    statusGroup: 'in_progress',
    description: 'Kho đang tạm dừng nhập – xuất để đếm thực tế.',
  },
  cho_duyet: {
    label: 'Chờ phê duyệt điều chỉnh',
    statusGroup: 'pending_approval',
    description: 'Đã có biên bản chênh lệch, chờ người có thẩm quyền duyệt.',
  },
  /*
   * Đếm xong và khớp sổ — kết quả TỐT NHẤT của một đợt kiểm kê, nên phải có trạng thái riêng.
   *
   * Gộp vào `da_dieu_chinh` thì lịch sử kiểm kê đọc ra như thể sổ kho đã bị sửa, còn gộp vào
   * `huy` thì một lần kiểm đúng bị ghi thành đã hủy và lần kiểm sau mất căn cứ đối chiếu.
   */
  khop_so: {
    label: 'Đã đóng — khớp sổ',
    statusGroup: 'completed',
    description: 'Số đếm bằng số sổ ở mọi vật tư; sổ kho giữ nguyên và kho mở lại nhập xuất.',
  },
  da_dieu_chinh: {
    label: 'Đã điều chỉnh',
    statusGroup: 'completed',
    description: 'Chênh lệch đã được duyệt và ghi vào sổ kho.',
  },
  huy: {
    label: 'Đã hủy',
    statusGroup: 'completed',
    description: 'Đợt kiểm kê bị hủy, sổ kho giữ nguyên.',
  },
};

/**
 * Nhãn của một trạng thái kiểm kê, chịu được giá trị giao diện CHƯA BIẾT.
 *
 * `STOCKTAKE_STATUS_META[status]` tra thẳng sẽ trả `undefined` khi cơ sở dữ liệu có thêm một
 * giá trị enum mà bản giao diện đang chạy chưa biết — và vì mọi nơi dùng đều đọc tiếp
 * `.statusGroup`, cả trang vỡ thành màn hình trắng kèm stack trace. Đó là tình huống có thật
 * chứ không phải giả định: CSDL và giao diện deploy riêng, nên luôn có quãng một bên mới hơn.
 *
 * Trạng thái lạ quy về nhóm "Đang xử lý" và hiện chính mã đó: đọc hơi thô nhưng vẫn dùng được
 * màn hình, và không lộ chi tiết kỹ thuật ra cho người dùng (Content Guidelines 5.5).
 */
export function stocktakeStatusMeta(status: string): {
  label: string;
  statusGroup: StatusGroup;
  description: string;
} {
  return (
    STOCKTAKE_STATUS_META[status as StocktakeStatus] ?? {
      label: status,
      statusGroup: 'in_progress',
      description: '',
    }
  );
}

/* ========================================================================== *
 * Giàn giáo — KHO-06
 * ========================================================================== */

/** Bốn tình trạng giàn giáo — PRD KHO-06 liệt kê nguyên văn. */
export const SCAFFOLDING_CONDITIONS = [
  'moi',
  'con_dung_duoc',
  'hong_cho_sua',
  'cho_thanh_ly',
] as const;

export type ScaffoldingCondition = (typeof SCAFFOLDING_CONDITIONS)[number];

export const SCAFFOLDING_CONDITION_LABELS: Readonly<Record<ScaffoldingCondition, string>> = {
  moi: 'Mới',
  con_dung_duoc: 'Còn sử dụng được',
  hong_cho_sua: 'Hỏng, chờ sửa',
  cho_thanh_ly: 'Chờ thanh lý',
};

/**
 * Hai tình trạng KHÔNG được tính vào lượng hàng dùng tốt.
 *
 * PRD KHO-06: "các trường hợp sửa chữa, mất mát hoặc thanh lý phải có biên bản riêng, KHÔNG
 * NHẬP CHUNG NGAY vào lượng hàng sử dụng tốt". Gộp vào thì báo cáo tồn giàn giáo sẽ hứa với
 * Kinh doanh một lượng hàng cho thuê mà thực tế không cho thuê được.
 */
export const USABLE_SCAFFOLDING_CONDITIONS: readonly ScaffoldingCondition[] = [
  'moi',
  'con_dung_duoc',
];

export function isUsableScaffolding(condition: ScaffoldingCondition): boolean {
  return USABLE_SCAFFOLDING_CONDITIONS.includes(condition);
}

/** Ba loại biên bản riêng của giàn giáo — PRD KHO-06. */
export const SCAFFOLDING_EVENT_TYPES = ['sua_chua', 'mat_mat', 'thanh_ly'] as const;
export type ScaffoldingEventType = (typeof SCAFFOLDING_EVENT_TYPES)[number];

export const SCAFFOLDING_EVENT_LABELS: Readonly<Record<ScaffoldingEventType, string>> = {
  sua_chua: 'Sửa chữa',
  mat_mat: 'Mất mát',
  thanh_ly: 'Thanh lý',
};

/** Nơi một lô giàn giáo đang nằm — KHO-06 ("công trình đang sử dụng"). */
export const ASSET_LOCATION_TYPES = ['kho', 'cong_trinh', 'khach_thue'] as const;
export type AssetLocationType = (typeof ASSET_LOCATION_TYPES)[number];

export const ASSET_LOCATION_LABELS: Readonly<Record<AssetLocationType, string>> = {
  kho: 'Tại kho',
  cong_trinh: 'Đang ở công trình',
  khach_thue: 'Khách đang thuê',
};

/* ========================================================================== *
 * Cảnh báo chủ động — KHO-08
 * ========================================================================== */

/**
 * Số ngày không phát sinh nhập – xuất thì coi là hàng chậm luân chuyển.
 *
 * SUY LUẬN — KHO-08 yêu cầu cảnh báo "hàng tồn lâu/chậm luân chuyển" nhưng không nêu ngưỡng.
 * 90 ngày là một quý, khớp với chu kỳ kiểm kê mà KHO-07 nhắc tới. **Cần Nhà Việt Group xác nhận.**
 */
export const SLOW_MOVING_DAYS = 90;

export const STOCK_ALERTS = ['sap_het', 'het_hang', 'ton_lau'] as const;
export type StockAlert = (typeof STOCK_ALERTS)[number];

export const STOCK_ALERT_LABELS: Readonly<Record<StockAlert, string>> = {
  het_hang: 'Đã hết hàng',
  sap_het: 'Sắp hết',
  ton_lau: 'Tồn lâu, chậm luân chuyển',
};

export interface StockLevelInput {
  readonly quantityOnHand: number | string | null | undefined;
  /** Tồn tối thiểu do Kho đặt cho từng vật tư ở từng kho. Rỗng = không theo dõi mức tối thiểu. */
  readonly minQuantity?: number | string | null;
  /** Lần cuối có nhập hoặc xuất. Rỗng = chưa từng phát sinh. */
  readonly lastMovementAt?: string | null;
}

/**
 * Các cảnh báo đang áp cho một dòng tồn kho — KHO-08.
 *
 * Trả về DANH SÁCH chứ không phải một giá trị: một vật tư vừa sắp hết vừa nằm im ba tháng là
 * chuyện có thật (mua nhầm quy cách, dùng không tới), và hai cảnh báo đó dẫn tới hai việc
 * khác nhau — một cái là đi mua, một cái là xem lại có nên giữ nữa không.
 */
export function stockAlerts(item: StockLevelInput, today: Date = new Date()): StockAlert[] {
  const alerts: StockAlert[] = [];
  const onHand = Number(item.quantityOnHand ?? 0);
  const min =
    item.minQuantity === null || item.minQuantity === undefined ? null : Number(item.minQuantity);

  if (onHand <= 0) {
    alerts.push('het_hang');
  } else if (min !== null && min > 0 && onHand <= min) {
    alerts.push('sap_het');
  }

  if (onHand > 0 && item.lastMovementAt) {
    const last = new Date(item.lastMovementAt);
    if (!Number.isNaN(last.getTime())) {
      const days = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
      if (days >= SLOW_MOVING_DAYS) alerts.push('ton_lau');
    }
  }

  return alerts;
}

/* ========================================================================== *
 * Đối chiếu kiểm kê — KHO-07
 * ========================================================================== */

export interface StocktakeLineInput {
  readonly materialId: string;
  /** Số sổ kho tại thời điểm chốt đợt kiểm — chụp lại, không đọc lại lúc duyệt. */
  readonly bookQuantity: number | string | null | undefined;
  /** Số đếm thực tế. Rỗng = chưa đếm tới dòng này. */
  readonly countedQuantity: number | string | null | undefined;
}

export interface StocktakeSummary {
  readonly totalLines: number;
  readonly countedLines: number;
  readonly varianceLines: number;
  /** Tổng chênh lệch tuyệt đối — chỉ để biết đợt kiểm này lệch nhiều hay ít. */
  readonly totalAbsVariance: number;
  readonly isComplete: boolean;
}

/**
 * Tổng hợp một đợt kiểm kê — KHO-07.
 *
 * KHÔNG kết luận nguyên nhân và KHÔNG tự điều chỉnh: PRD yêu cầu "xác định nguyên nhân chênh
 * lệch; lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Hàm này chỉ đếm.
 */
export function summarizeStocktake(lines: readonly StocktakeLineInput[]): StocktakeSummary {
  let countedLines = 0;
  let varianceLines = 0;
  let totalAbsVariance = 0;

  for (const line of lines) {
    if (line.countedQuantity === null || line.countedQuantity === undefined) continue;
    countedLines += 1;
    const variance = Number(line.countedQuantity) - Number(line.bookQuantity ?? 0);
    if (variance !== 0) {
      varianceLines += 1;
      totalAbsVariance += Math.abs(variance);
    }
  }

  return {
    totalLines: lines.length,
    countedLines,
    varianceLines,
    totalAbsVariance,
    isComplete: lines.length > 0 && countedLines === lines.length,
  };
}

/* ========================================================================== *
 * Giá trị tồn kho
 * ========================================================================== */

export interface InventoryValueLine {
  readonly quantityOnHand: number | string | null | undefined;
  /** Đơn giá bình quân, đồng. */
  readonly averageCost: bigint | string | number | null | undefined;
}

/**
 * Giá trị tồn của một danh sách dòng tồn kho, đơn vị đồng.
 *
 * Nhân bằng `bigint` sau khi làm tròn số lượng về phần nghìn: số lượng là `numeric(18,3)` nên
 * một phép nhân qua `Number` sẽ trôi ở các kho lớn. Đây là con số đi vào báo cáo tài sản, và
 * lệch một đồng ở đây là lệch với sổ kế toán.
 */
export function inventoryValue(lines: readonly InventoryValueLine[]): bigint {
  let total = 0n;

  for (const line of lines) {
    const milli = BigInt(Math.round(Number(line.quantityOnHand ?? 0) * 1000));
    total += (milli * toMoney(line.averageCost)) / 1000n;
  }

  return total;
}
