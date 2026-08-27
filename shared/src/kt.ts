/**
 * Hằng số nghiệp vụ Module KT — Kế toán và Tài chính.
 *
 * Nguồn: PRD KT-01 → KT-10, Backend Schema 4.9, Webapp Flow 4.6.
 *
 * Ranh giới của cả module (PRD KT, mục "Ranh giới KHÔNG làm") chi phối từng dòng dưới đây:
 *
 *  1. Hệ thống này KHÔNG phải sổ kế toán. Phần mềm kế toán hiện tại vẫn là nơi ghi sổ và
 *     lập báo cáo thuế chính thức (KT-08). Ở đây chỉ có QUY TRÌNH NGUỒN: ai đề nghị, ai
 *     kiểm, ai duyệt, tiền đi vào mã chi phí nào. Vì vậy không có bút toán, không có tài
 *     khoản kế toán, không có cân đối phát sinh trong file này.
 *  2. Hệ thống KHÔNG tự chi tiền và KHÔNG tự sửa số đã khóa. Mọi hàm ở đây đều tính toán
 *     để NGƯỜI đọc rồi quyết định, không có hàm nào tự kết luận "nên chi" hay "đủ tiền".
 *  3. Chứng từ bắt buộc lưu bản gốc vẫn lưu bản giấy; hệ thống chỉ giữ bản điện tử để tra.
 */

import { toMoney, type MoneyValue } from './format';
import type { StatusGroup } from './status';

/* ========================================================================== *
 * Đề nghị thanh toán — KT-01, KT-02
 * ========================================================================== */

/**
 * Ba loại đề nghị chi tiền.
 *
 * PRD KT-01 gọi tên nguyên văn "đề nghị thanh toán/tạm ứng – hoàn ứng", tức ba việc khác
 * nhau đi chung MỘT luồng duyệt. Gộp chúng vào một bảng thay vì ba bảng vì luồng duyệt,
 * hạn mức, mã chi phí và bộ chứng từ đều giống hệt — chỉ khác ở chỗ tiền đi đâu:
 *
 *   `thanh_toan` — trả cho bên ngoài (nhà cung cấp, thầu phụ) theo bộ chứng từ MH-08.
 *   `tam_ung`    — ứng trước cho một người trong công ty, sinh ra một khoản nợ phải hoàn.
 *   `hoan_ung`   — quyết toán khoản đã ứng: nộp chứng từ, trả lại phần thừa.
 */
export const PAYMENT_REQUEST_TYPES = ['thanh_toan', 'tam_ung', 'hoan_ung'] as const;
export type PaymentRequestType = (typeof PAYMENT_REQUEST_TYPES)[number];

export const PAYMENT_REQUEST_TYPE_LABELS: Readonly<Record<PaymentRequestType, string>> = {
  thanh_toan: 'Đề nghị thanh toán',
  tam_ung: 'Đề nghị tạm ứng',
  hoan_ung: 'Hoàn ứng',
};

/** Mã loại hồ sơ dùng khi cấp mã (`next_record_code`) — ví dụ `NVC-DNTT-2026-0001`. */
export const PAYMENT_REQUEST_CODE_PREFIX: Readonly<Record<PaymentRequestType, string>> = {
  thanh_toan: 'DNTT',
  tam_ung: 'DNTU',
  hoan_ung: 'HU',
};

/**
 * Vòng đời một đề nghị chi — bám ĐÚNG chuỗi tám bước của PRD KT-01:
 *
 *   đề nghị → xác nhận trưởng đơn vị → kiểm tra Kế toán → kiểm tra dòng tiền (Trưởng Tài
 *   chính) → phê duyệt theo hạn mức → lập phiếu chi/ủy nhiệm chi → thực hiện chi → hạch toán
 *
 * Ba bước giữa (`cho_don_vi`, `cho_ke_toan`, `cho_tai_chinh`) là KIỂM TRA, không phải phê
 * duyệt theo tiền: người kiểm xác nhận hồ sơ đúng bộ phận mình phụ trách, không cần hạn
 * mức. Chỉ bước `cho_phe_duyet` mới đối chiếu `approval_limits` và vào Hộp thư Phê duyệt.
 *
 * Tách rõ như vậy vì đây là chỗ vướng mắc #6 trong khảo sát: người đề nghị không biết hồ sơ
 * đang nằm ở đâu và ai đang giữ. Một cột `status` gộp chung "đang chờ" thì màn hình vẫn
 * không trả lời được câu hỏi đó.
 *
 * `da_chi` và `da_hach_toan` là hai bước KHÁC NHAU, cố ý không gộp: tiền ra khỏi tài khoản
 * là việc của Tài chính, còn hạch toán là việc chuyển số sang phần mềm kế toán chính thức
 * (KT-08). Gộp lại thì không biết khoản nào đã chuyển sổ, khoản nào chưa — đúng thứ KT-08
 * gọi là "đánh dấu trạng thái đã chuyển".
 */
export const PAYMENT_REQUEST_STAGES = [
  'nhap',
  'cho_don_vi',
  'cho_ke_toan',
  'cho_tai_chinh',
  'cho_phe_duyet',
  'da_duyet',
  'da_chi',
  'da_hach_toan',
  'tu_choi',
  'huy',
] as const;
export type PaymentRequestStage = (typeof PAYMENT_REQUEST_STAGES)[number];

export interface PaymentStageMeta {
  readonly label: string;
  readonly statusGroup: StatusGroup;
  /** Ai đang giữ hồ sơ ở bước này — KT-02 "đang chờ ai xử lý". */
  readonly waitingOn: string;
  readonly description: string;
  /** Hồ sơ đã đóng, không đi tiếp bước nào nữa. */
  readonly isTerminal: boolean;
}

export const PAYMENT_REQUEST_STAGE_META: Readonly<Record<PaymentRequestStage, PaymentStageMeta>> = {
  nhap: {
    label: 'Nháp',
    statusGroup: 'draft',
    waitingOn: 'Người đề nghị',
    description: 'Đang soạn, chưa gửi đi. Chỉ người đề nghị nhìn thấy.',
    isTerminal: false,
  },
  cho_don_vi: {
    label: 'Chờ trưởng đơn vị xác nhận',
    statusGroup: 'pending_approval',
    waitingOn: 'Trưởng đơn vị đề nghị',
    description: 'Xác nhận khoản chi này thật sự phát sinh ở đơn vị mình.',
    isTerminal: false,
  },
  cho_ke_toan: {
    label: 'Chờ Kế toán kiểm tra',
    statusGroup: 'pending_approval',
    waitingOn: 'Kế toán',
    description: 'Kiểm bộ chứng từ, mã chi phí và số tiền trước khi trình Tài chính.',
    isTerminal: false,
  },
  cho_tai_chinh: {
    label: 'Chờ kiểm tra dòng tiền',
    statusGroup: 'pending_approval',
    waitingOn: 'Trưởng Tài chính',
    description: 'Đối chiếu kế hoạch dòng tiền xem chi được vào thời điểm nào.',
    isTerminal: false,
  },
  cho_phe_duyet: {
    label: 'Chờ phê duyệt',
    statusGroup: 'pending_approval',
    waitingOn: 'Người có hạn mức phê duyệt',
    description: 'Đã kiểm đủ ba bước, đang nằm trong Hộp thư Phê duyệt theo hạn mức.',
    isTerminal: false,
  },
  da_duyet: {
    label: 'Đã duyệt, chờ chi',
    statusGroup: 'in_progress',
    waitingOn: 'Tài chính',
    description: 'Đã được duyệt; chờ lập phiếu chi hoặc ủy nhiệm chi và thực hiện chi.',
    isTerminal: false,
  },
  da_chi: {
    label: 'Đã chi',
    statusGroup: 'in_progress',
    waitingOn: 'Kế toán',
    description: 'Tiền đã ra khỏi tài khoản; chờ chuyển số sang phần mềm kế toán.',
    isTerminal: false,
  },
  da_hach_toan: {
    label: 'Đã hạch toán',
    statusGroup: 'completed',
    waitingOn: '—',
    description: 'Đã chuyển sang phần mềm kế toán chính thức, hồ sơ khép lại.',
    isTerminal: true,
  },
  tu_choi: {
    label: 'Bị từ chối',
    statusGroup: 'overdue',
    waitingOn: 'Người đề nghị',
    description: 'Bị trả lại kèm lý do; sửa xong gửi lại được.',
    isTerminal: false,
  },
  huy: {
    label: 'Đã hủy',
    statusGroup: 'completed',
    waitingOn: '—',
    description: 'Người đề nghị rút lại hồ sơ.',
    isTerminal: true,
  },
};

/**
 * Ba bước kiểm tra tuần tự trước khi vào Hộp thư Phê duyệt.
 *
 * Thứ tự trong mảng CHÍNH LÀ thứ tự chạy — hàm CSDL `advance_payment_step` đọc đúng chuỗi
 * này. Đổi thứ tự ở đây mà không sửa migration là làm lệch hai nơi, nên chuỗi được lặp lại
 * trong migration kèm chú thích trỏ ngược về file này.
 */
export const PAYMENT_CHECK_STEPS = ['don_vi', 'ke_toan', 'tai_chinh'] as const;
export type PaymentCheckStep = (typeof PAYMENT_CHECK_STEPS)[number];

export const PAYMENT_CHECK_STEP_LABELS: Readonly<Record<PaymentCheckStep, string>> = {
  don_vi: 'Trưởng đơn vị xác nhận',
  ke_toan: 'Kế toán kiểm tra',
  tai_chinh: 'Trưởng Tài chính kiểm tra dòng tiền',
};

/** Bước kiểm tra tương ứng với một trạng thái đang chờ. `null` nếu bước đó không phải kiểm tra. */
export function checkStepOfStage(stage: PaymentRequestStage): PaymentCheckStep | null {
  switch (stage) {
    case 'cho_don_vi':
      return 'don_vi';
    case 'cho_ke_toan':
      return 'ke_toan';
    case 'cho_tai_chinh':
      return 'tai_chinh';
    default:
      return null;
  }
}

/**
 * Hình thức chi — PRD KT-01 "lập phiếu chi/ủy nhiệm chi".
 *
 * ⚠️ KHÔNG lưu số tài khoản ngân hàng cá nhân của người nhận (CLAUDE.md 5.2, PRD NEN "Ranh
 * giới"). Chỉ lưu SỐ CHỨNG TỪ do ngân hàng/thủ quỹ cấp, đủ để đối chiếu sau này.
 */
export const PAYMENT_METHODS = ['chuyen_khoan', 'tien_mat'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  chuyen_khoan: 'Ủy nhiệm chi (chuyển khoản)',
  tien_mat: 'Phiếu chi (tiền mặt)',
};

/* ========================================================================== *
 * Tạm ứng — KT-03
 * ========================================================================== */

/**
 * Trạng thái một khoản đã ứng ra.
 *
 * `qua_han` KHÔNG lưu trong CSDL mà suy ra từ `due_date` — cùng lý do đã ghi ở Module MH:
 * lưu thành cột thì phải có tác vụ nền quét lại mỗi ngày, và mỗi lần quét sót là một khoản
 * hiển thị sai. Xem `advanceDisplayStatus`.
 */
export const ADVANCE_STATUSES = ['dang_no', 'da_hoan'] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const ADVANCE_STATUS_LABELS: Readonly<Record<AdvanceStatus, string>> = {
  dang_no: 'Chưa hoàn ứng',
  da_hoan: 'Đã hoàn ứng',
};

/**
 * Trạng thái hiển thị của một khoản tạm ứng — KT-03 "cảnh báo các khoản quá hạn".
 *
 * Hoàn một phần vẫn là `dang_no`: KT-03 nói "hạn hoàn ứng", không nói hoàn từng phần thì
 * được gia hạn. Người ứng 50 triệu, hoàn 10 triệu, quá hạn hai tháng vẫn phải hiện đỏ.
 */
export function advanceDisplayStatus(
  status: AdvanceStatus,
  dueDate: string | null | undefined,
  today: Date = new Date(),
): StatusGroup {
  if (status === 'da_hoan') return 'completed';
  if (!dueDate) return 'in_progress';

  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return 'in_progress';

  return due.getTime() < today.getTime() ? 'overdue' : 'in_progress';
}

/** Số tiền còn phải hoàn của một khoản tạm ứng. */
export function advanceOutstanding(
  amount: MoneyValue | null | undefined,
  settledAmount: MoneyValue | null | undefined,
): bigint {
  const remaining = toMoney(amount) - toMoney(settledAmount);
  return remaining > 0n ? remaining : 0n;
}

/* ========================================================================== *
 * Công nợ phải thu – phải trả — KT-04
 * ========================================================================== */

/** Hai chiều công nợ. Tách bằng cột thay vì hai bảng: mọi truy vấn đối chiếu đều dùng chung. */
export const RECEIVABLE_DIRECTIONS = ['phai_thu', 'phai_tra'] as const;
export type ReceivableDirection = (typeof RECEIVABLE_DIRECTIONS)[number];

export const RECEIVABLE_DIRECTION_LABELS: Readonly<Record<ReceivableDirection, string>> = {
  phai_thu: 'Phải thu',
  phai_tra: 'Phải trả',
};

/** Đối tượng công nợ — KT-04 "theo khách hàng/nhà cung cấp". */
export const PARTY_TYPES = ['khach_hang', 'nha_cung_cap'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const PARTY_TYPE_LABELS: Readonly<Record<PartyType, string>> = {
  khach_hang: 'Khách hàng',
  nha_cung_cap: 'Nhà cung cấp',
};

/**
 * Khung tuổi nợ — KT-04 "số ngày quá hạn … hỗ trợ đối chiếu định kỳ".
 *
 * ⚠️ NGƯỠNG LÀ DỮ LIỆU, KHÔNG PHẢI HẰNG SỐ TRONG MÃ. Cùng một lý do với hạn mức phê duyệt
 * (PRD NEN-02, CLAUDE.md 5.2): NVG chưa ban hành mốc chính thức, và khi ban hành thì phải sửa
 * được trong Quản trị hệ thống chứ không phải sửa mã rồi triển khai lại.
 *
 * Vì vậy các hàm dưới đây đều NHẬN danh sách khung làm tham số. Bảng `aging_buckets` trong CSDL
 * là nguồn duy nhất lúc chạy; `DEFAULT_AGING_BUCKETS` chỉ là giá trị KHỞI TẠO để seed.
 *
 * "Chưa đến hạn" KHÔNG nằm trong bảng: nó không phải một mốc do NVG chọn mà là tình trạng
 * "chưa trễ ngày nào". Đặt nó thành một dòng cấu hình thì xoá nhầm dòng đó là mất luôn chỗ
 * chứa các khoản còn trong hạn, và chúng sẽ rơi vào một khung quá hạn nào đó.
 */
export const NOT_DUE_BUCKET_CODE = 'chua_den_han';
export const NOT_DUE_BUCKET_LABEL = 'Chưa đến hạn';

export interface AgingBucketDef {
  /** Mã khung, dùng làm khoá khi cộng số — không hiển thị cho người dùng. */
  readonly code: string;
  readonly label: string;
  /** Số ngày quá hạn tối thiểu để rơi vào khung này. Nhỏ nhất là 1. */
  readonly fromDays: number;
  /** Số ngày quá hạn tối đa. `null` = khung cuối, không có giới hạn trên. */
  readonly toDays: number | null;
}

/**
 * Giá trị KHỞI TẠO cho bảng `aging_buckets` — GIẢ ĐỊNH, chờ NVG ban hành mốc chính thức.
 *
 * Căn cứ: 30/60/90 ngày là cách chia thông dụng trong đối chiếu công nợ; PRD KT-04 yêu cầu
 * theo dõi "số ngày quá hạn" nhưng không ấn định con số nào.
 *
 * KHÔNG đọc hằng số này lúc chạy để dựng báo cáo — đọc bảng. Nếu NVG đã sửa mốc trong Quản
 * trị hệ thống mà màn hình vẫn chia theo file này thì hai nơi cho ra hai bảng công nợ khác nhau.
 */
export const DEFAULT_AGING_BUCKETS: readonly AgingBucketDef[] = [
  { code: 'qua_1_30', label: 'Quá hạn 1 – 30 ngày', fromDays: 1, toDays: 30 },
  { code: 'qua_31_60', label: 'Quá hạn 31 – 60 ngày', fromDays: 31, toDays: 60 },
  { code: 'qua_61_90', label: 'Quá hạn 61 – 90 ngày', fromDays: 61, toDays: 90 },
  { code: 'qua_tren_90', label: 'Quá hạn trên 90 ngày', fromDays: 91, toDays: null },
] as const;

/**
 * Số ngày một khoản đã quá hạn. `0` hoặc số âm nghĩa là CHƯA quá hạn.
 *
 * Không có ngày đến hạn thì trả `0`: không có hạn thì chưa thể gọi là trễ. Đây là chỗ dễ sai
 * theo hướng nguy hiểm — mặc định "quá hạn" sẽ làm báo cáo công nợ phồng lên bằng những khoản
 * chưa ai chốt ngày.
 *
 * Đến hạn ĐÚNG HÔM NAY vẫn là chưa quá hạn: bên trả còn cả ngày để chuyển tiền.
 */
export function overdueDays(dueDate: string | null | undefined, today: Date = new Date()): number {
  if (!dueDate) return 0;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!match) return 0;

  /*
   * Đếm theo NGÀY LỊCH, không theo số giờ chênh lệch.
   *
   * Cách còn lại — lấy `dueDate` cộng 23:59:59 rồi trừ thời điểm hiện tại — làm một hóa đơn
   * đến hạn HÔM QUA vẫn hiện "chưa đến hạn" suốt cả ngày hôm nay, vì hai mốc mới cách nhau
   * vài giờ. Bảng tuổi nợ khi đó luôn nhẹ hơn thực tế đúng một ngày.
   *
   * Cùng phép tính với hàm `receivable_aging` trong CSDL (`current_date - due_date`), để hai
   * nơi không cho ra hai bảng công nợ khác nhau.
   */
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  const days = Math.floor((now - due) / 86_400_000);
  return days > 0 ? days : 0;
}

/**
 * Mã khung tuổi nợ của một khoản, theo bộ khung đang cấu hình.
 *
 * Rơi ra ngoài mọi khung đã cấu hình thì trả về khung CUỐI CÙNG chứ không phải "chưa đến hạn":
 * một khoản trễ 200 ngày mà cấu hình chỉ chia tới 90 ngày vẫn là nợ xấu nhất, không phải nợ
 * trong hạn. Đây là chỗ một cấu hình thiếu sót có thể làm báo cáo nói ngược.
 */
export function agingBucketCode(
  dueDate: string | null | undefined,
  buckets: readonly AgingBucketDef[] = DEFAULT_AGING_BUCKETS,
  today: Date = new Date(),
): string {
  const days = overdueDays(dueDate, today);
  if (days <= 0 || buckets.length === 0) return NOT_DUE_BUCKET_CODE;

  for (const bucket of buckets) {
    if (days >= bucket.fromDays && (bucket.toDays === null || days <= bucket.toDays)) {
      return bucket.code;
    }
  }
  return buckets[buckets.length - 1]!.code;
}

export interface ReceivableAgingLine {
  readonly amount: MoneyValue | null | undefined;
  readonly settledAmount: MoneyValue | null | undefined;
  readonly dueDate: string | null | undefined;
}

export interface AgingRow {
  readonly code: string;
  readonly label: string;
  /** Tổng phần CÒN LẠI của các khoản rơi vào khung này, đơn vị đồng. */
  readonly total: bigint;
  readonly entries: number;
}

export interface ReceivableAging {
  /** Khung "Chưa đến hạn" đứng đầu, rồi tới các khung quá hạn theo đúng thứ tự cấu hình. */
  readonly rows: readonly AgingRow[];
  /** Tổng còn phải thu/phải trả của mọi khung. */
  readonly total: bigint;
}

/**
 * Bảng tuổi nợ — cộng phần CÒN LẠI của từng khoản vào đúng khung.
 *
 * Cộng phần còn lại chứ không phải giá trị gốc: một hóa đơn 500 triệu đã thu 480 triệu mà
 * vẫn nằm nguyên trong cột "quá hạn trên 90 ngày" sẽ làm Ban Giám đốc đọc ra một khoản nợ
 * xấu không tồn tại.
 *
 * Luôn trả về ĐỦ mọi khung, kể cả khung bằng 0 — một cột biến mất khỏi bảng làm người đọc
 * tưởng mình nhìn nhầm, và làm hai lần xem cùng một báo cáo có số cột khác nhau.
 */
export function receivableAging(
  lines: readonly ReceivableAgingLine[],
  buckets: readonly AgingBucketDef[] = DEFAULT_AGING_BUCKETS,
  today: Date = new Date(),
): ReceivableAging {
  const totals = new Map<string, { total: bigint; entries: number }>();
  totals.set(NOT_DUE_BUCKET_CODE, { total: 0n, entries: 0 });
  for (const bucket of buckets) totals.set(bucket.code, { total: 0n, entries: 0 });

  let total = 0n;

  for (const line of lines) {
    const remaining = toMoney(line.amount) - toMoney(line.settledAmount);
    if (remaining <= 0n) continue;

    const code = agingBucketCode(line.dueDate, buckets, today);
    const cell = totals.get(code);
    if (!cell) continue;
    cell.total += remaining;
    cell.entries += 1;
    total += remaining;
  }

  const rows: AgingRow[] = [
    {
      code: NOT_DUE_BUCKET_CODE,
      label: NOT_DUE_BUCKET_LABEL,
      total: totals.get(NOT_DUE_BUCKET_CODE)!.total,
      entries: totals.get(NOT_DUE_BUCKET_CODE)!.entries,
    },
    ...buckets.map((bucket) => ({
      code: bucket.code,
      label: bucket.label,
      total: totals.get(bucket.code)!.total,
      entries: totals.get(bucket.code)!.entries,
    })),
  ];

  return { rows, total };
}

/** Trạng thái hiển thị của một khoản công nợ. */
export function receivableDisplayStatus(
  amount: MoneyValue | null | undefined,
  settledAmount: MoneyValue | null | undefined,
  dueDate: string | null | undefined,
  today: Date = new Date(),
): StatusGroup {
  const remaining = toMoney(amount) - toMoney(settledAmount);
  if (remaining <= 0n) return 'completed';
  // Quá hạn hay chưa KHÔNG phụ thuộc cấu hình khung: nó chỉ hỏi "đã trễ ngày nào chưa".
  return overdueDays(dueDate, today) > 0 ? 'overdue' : 'in_progress';
}

/* ========================================================================== *
 * Kế hoạch dòng tiền — KT-06
 * ========================================================================== */

/** KT-06: "kế hoạch dòng tiền theo tuần/tháng". */
export const CASH_FLOW_PERIOD_TYPES = ['tuan', 'thang'] as const;
export type CashFlowPeriodType = (typeof CASH_FLOW_PERIOD_TYPES)[number];

export const CASH_FLOW_PERIOD_TYPE_LABELS: Readonly<Record<CashFlowPeriodType, string>> = {
  tuan: 'Theo tuần',
  thang: 'Theo tháng',
};

export interface CashFlowInput {
  /** Số dư đầu kỳ do Tài chính nhập — hệ thống KHÔNG tự suy ra số dư ngân hàng. */
  readonly openingBalance: MoneyValue | null | undefined;
  readonly plannedIn: MoneyValue | null | undefined;
  readonly plannedOut: MoneyValue | null | undefined;
  /** Công nợ phải thu đến hạn trong kỳ. */
  readonly receivablesDue: MoneyValue | null | undefined;
  /** Công nợ phải trả đến hạn trong kỳ. */
  readonly payablesDue: MoneyValue | null | undefined;
  /** Đề nghị chi đã duyệt nhưng chưa chi — khoản chắc chắn sẽ ra trong kỳ. */
  readonly approvedPayments: MoneyValue | null | undefined;
}

export interface CashFlowProjection {
  readonly openingBalance: bigint;
  readonly totalIn: bigint;
  readonly totalOut: bigint;
  readonly closingBalance: bigint;
  /** Số dư cuối kỳ âm — dấu hiệu phải giãn lịch chi hoặc đẩy nhanh thu. */
  readonly isShortfall: boolean;
}

/**
 * Dự kiến dòng tiền một kỳ — KT-06.
 *
 * Cộng cả kế hoạch lẫn số thực tế đã cam kết, KHÔNG chỉ một trong hai: kế hoạch là ý định,
 * còn công nợ đến hạn và đề nghị chi đã duyệt là những khoản gần như chắc chắn xảy ra. Bỏ
 * vế thứ hai thì bảng dòng tiền luôn đẹp hơn thực tế.
 *
 * Hàm CỐ Ý không kết luận "đủ tiền" hay "nên hoãn khoản nào" — PRD 2.3 để việc đó cho
 * Trưởng Tài chính; ở đây chỉ đặt các con số cạnh nhau.
 */
export function projectCashFlow(input: CashFlowInput): CashFlowProjection {
  const openingBalance = toMoney(input.openingBalance);
  const totalIn = toMoney(input.plannedIn) + toMoney(input.receivablesDue);
  const totalOut =
    toMoney(input.plannedOut) + toMoney(input.payablesDue) + toMoney(input.approvedPayments);
  const closingBalance = openingBalance + totalIn - totalOut;

  return {
    openingBalance,
    totalIn,
    totalOut,
    closingBalance,
    isShortfall: closingBalance < 0n,
  };
}

/* ========================================================================== *
 * Kỳ kế toán — KT-09
 * ========================================================================== */

export const ACCOUNTING_PERIOD_STATUSES = ['dang_mo', 'da_khoa'] as const;
export type AccountingPeriodStatus = (typeof ACCOUNTING_PERIOD_STATUSES)[number];

export const ACCOUNTING_PERIOD_STATUS_META: Readonly<
  Record<AccountingPeriodStatus, { label: string; statusGroup: StatusGroup; description: string }>
> = {
  dang_mo: {
    label: 'Đang mở',
    statusGroup: 'in_progress',
    description: 'Còn ghi nhận và sửa được chứng từ có ngày nằm trong kỳ.',
  },
  da_khoa: {
    label: 'Đã khóa',
    statusGroup: 'completed',
    description: 'Số liệu đã chốt. Điều chỉnh phải nêu nguyên nhân và có người phê duyệt.',
  },
};

/**
 * Mã kỳ kế toán chuẩn `yyyy-MM` — dùng làm khóa đối chiếu giữa các bảng.
 *
 * Chỉ nhận kỳ THÁNG. KT-09 nói "tháng/quý/năm", nhưng quý và năm là tập hợp của các tháng
 * đã khóa: khóa quý bằng cách khóa ba tháng thì không có chuyện tháng 7 mở trong khi quý 3
 * đã đóng. Một cột kỳ nhận cả ba mức sẽ tạo đúng mâu thuẫn đó.
 */
export function accountingPeriodCode(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** Nhãn hiển thị của một mã kỳ — `2026-08` → `Tháng 08/2026`. */
export function accountingPeriodLabel(code: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(code);
  if (!match) return code;
  return `Tháng ${match[2]}/${match[1]}`;
}
