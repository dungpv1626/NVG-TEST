/**
 * Vai trò và hạn mức phê duyệt.
 *
 * Vai trò: Webapp Flow 2.3 (9 nhóm menu) + PRD Mục 3 (đối tượng sử dụng) + PRD Phụ lục C (sơ đồ tổ chức).
 * Hạn mức: PRD NEN-02 — "Hạn mức phải cấu hình được, KHÔNG hard-code".
 *
 * ⚠️ Các con số dưới đây là GIÁ TRỊ MẶC ĐỊNH BAN ĐẦU dùng để seed bảng `approval_limits`.
 * PRD Mục 8.2 và Mục 10 ghi rõ NVG chưa ban hành quy chế phân quyền chính thức; khi có,
 * NVG chỉnh trực tiếp trong Quản trị hệ thống — KHÔNG sửa file này và KHÔNG đọc file này
 * lúc chạy để quyết định quyền. Đây chỉ là dữ liệu khởi tạo.
 */

/** Mã vai trò. Một người có thể giữ nhiều vai trò, khác nhau theo từng pháp nhân (`user_companies`). */
export const ROLE_CODES = [
  'TGD',
  'CFO',
  'BGD',
  'KD',
  'DA_DT',
  'TKE',
  'TC',
  'MH',
  'KHO',
  'KT',
  'NS',
  'ADMIN',
  // Thêm sau, nên nằm CUỐI danh sách: giá trị enum trong Postgres chỉ thêm được vào cuối
  // bằng `ALTER TYPE ... ADD VALUE`, chèn giữa sẽ làm lệch thứ tự giữa các môi trường.
  'SX',
  'CHT',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export interface RoleMeta {
  readonly code: RoleCode;
  readonly label: string;
  /** Trang mặc định khi đăng nhập — Webapp Flow 2.3. */
  readonly defaultRoute: string;
  /** Xem được dữ liệu của mọi pháp nhân (mẫu RLS A cho phép BGĐ/Admin vượt phạm vi pháp nhân). */
  readonly seesAllCompanies: boolean;
  /**
   * Vai trò làm việc tại MỘT công trình/xưởng cụ thể — mẫu RLS E (Backend Schema v1.1 3.3).
   *
   * Chỉ thấy nơi mình được phân công (`user_site_assignments`). Đây là PHẠM VI, không phải
   * mức quyền: chỉ huy trưởng vẫn ký xác nhận bảng công khối công trường như trước, chỉ là
   * không đọc được công trình của người khác. Vai trò không đánh dấu thì nhìn toàn đơn vị.
   */
  readonly siteScoped?: boolean;
}

export const ROLES: Readonly<Record<RoleCode, RoleMeta>> = {
  TGD: {
    code: 'TGD',
    label: 'Tổng Giám đốc',
    defaultRoute: '/dashboard',
    seesAllCompanies: true,
  },
  CFO: {
    code: 'CFO',
    label: 'Giám đốc Tài chính',
    defaultRoute: '/dashboard',
    seesAllCompanies: true,
  },
  BGD: {
    code: 'BGD',
    label: 'Ban Giám đốc',
    defaultRoute: '/dashboard',
    seesAllCompanies: true,
  },
  KD: {
    code: 'KD',
    label: 'Kinh doanh',
    defaultRoute: '/crm/co-hoi',
    seesAllCompanies: false,
  },
  DA_DT: {
    code: 'DA_DT',
    label: 'Dự án – Đấu thầu',
    defaultRoute: '/da/goi-thau',
    seesAllCompanies: false,
  },
  TKE: {
    code: 'TKE',
    label: 'Thiết kế',
    defaultRoute: '/tk/du-an',
    seesAllCompanies: false,
  },
  TC: {
    code: 'TC',
    label: 'Trưởng phòng Thi công',
    defaultRoute: '/tc/cong-trinh',
    seesAllCompanies: false,
  },
  MH: {
    code: 'MH',
    label: 'Mua hàng – Vật tư',
    defaultRoute: '/mh/de-nghi-mua',
    seesAllCompanies: false,
  },
  KHO: {
    code: 'KHO',
    label: 'Kho',
    defaultRoute: '/kho/quet-ma',
    seesAllCompanies: false,
  },
  KT: {
    code: 'KT',
    label: 'Kế toán – Tài chính',
    defaultRoute: '/kt/de-nghi-thanh-toan',
    seesAllCompanies: false,
  },
  NS: {
    code: 'NS',
    label: 'Hành chính – Nhân sự',
    defaultRoute: '/ns/viec-can-xu-ly',
    seesAllCompanies: false,
  },
  ADMIN: {
    code: 'ADMIN',
    label: 'Quản trị hệ thống',
    defaultRoute: '/nen/quan-tri',
    seesAllCompanies: true,
  },
  /*
   * Xưởng sản xuất giàn giáo (NVS) — thêm 02/09/2026 sau khi có phiếu khảo sát.
   *
   * Xưởng là một đơn vị có bộ máy riêng ("1 Phó giám đốc, 1 admin, 4 nhân viên kinh doanh,
   * 1 nhân viên kho, 1 tổ trưởng sản xuất, 10 công nhân cơ khí") vận hành cả sản xuất lẫn
   * cho thuê. Trước khi có khảo sát, quyền Module SX được tạm gán cho vai trò Kho vì họ đã
   * quản lý vòng đời vật lý giàn giáo — nay Kho giữ đúng phần chứng từ nhập – xuất – tồn,
   * còn điều hành sản xuất và hợp đồng thuê thuộc về vai trò này.
   *
   * KHÔNG có quyền `approve`: mọi biểu mẫu xưởng liệt kê trong phiếu khảo sát (lệnh sản
   * xuất, đề nghị cấp vật tư, bảng chấm công, sổ máy móc) đều ghi người duyệt là "Phó Giám
   * đốc/Ban Giám đốc" — vai trò BGĐ đã có sẵn quyền phê duyệt trên Module SX.
   */
  SX: {
    code: 'SX',
    label: 'Xưởng sản xuất – Cho thuê',
    defaultRoute: '/sx/lenh-san-xuat',
    seesAllCompanies: false,
  },
  /*
   * Chỉ huy trưởng / Kỹ thuật hiện trường — thêm 05/09/2026 theo Webapp Flow v1.1 Mục 2.3.
   *
   * Vì sao tách khỏi vai trò `TC`:
   *
   *   Trước đây một vai trò `TC` gánh cả Trưởng phòng Thi công lẫn Ban chỉ huy công trường,
   *   nên CSDL không phân biệt được ai nhìn toàn đơn vị với ai làm việc tại một công trình.
   *   Mẫu phân quyền E (Backend Schema v1.1 3.3 — "người dùng hiện trường chỉ xem/ghi được
   *   dữ liệu thuộc công trình mình được phân công") vì thế không có đối tượng nào để áp.
   *
   *   Khảo sát Chỉ huy – Giám sát công trường mô tả hai lớp rõ ràng: 1 trưởng phòng, 2 nhân
   *   viên phòng, và 3 chỉ huy trưởng + 3 kỹ thuật hiện trường ở các công trình khác nhau.
   *   Một chỉ huy trưởng không có lý do nghiệp vụ nào để đọc nhật ký của công trình khác.
   *
   * Quyền hạn GIỮ NGUYÊN như `TC`, kể cả `approve`: khảo sát giao chính chỉ huy trưởng ký
   * xác nhận bảng chấm công khối công trường (migration 0106). Khác biệt duy nhất là PHẠM VI
   * (`siteScoped`) — đúng cách Webapp Flow v1.1 Mục 2.3 phân biệt hai vai trò: "Công trình
   * CỦA TÔI" so với "TẤT CẢ công trình". Nếu lấy `approve` làm dấu hiệu cấp quản lý thì chỉ
   * huy trưởng cũng được miễn trừ và mẫu E không áp lên ai.
   */
  CHT: {
    code: 'CHT',
    label: 'Chỉ huy trưởng / Kỹ thuật hiện trường',
    defaultRoute: '/tc/cong-trinh',
    seesAllCompanies: false,
    siteScoped: true,
  },
} as const;

/** Loại nghiệp vụ có luồng phê duyệt theo hạn mức. */
export const APPROVAL_SUBJECTS = [
  'purchase_request',
  'payment_request',
  'advance',
  'estimate_price',
  'contract',
  'contract_amendment',
  'special_discount',
  'stocktake_adjustment',
  'leave_request',
  // Thêm sau, nên nằm CUỐI danh sách: giá trị enum trong Postgres chỉ thêm được vào cuối
  // bằng `ALTER TYPE ... ADD VALUE`, chèn giữa sẽ làm lệch thứ tự giữa các môi trường.
  'quote_price',
  'recruitment_position',
] as const;

export type ApprovalSubject = (typeof APPROVAL_SUBJECTS)[number];

export const APPROVAL_SUBJECT_LABELS: Readonly<Record<ApprovalSubject, string>> = {
  purchase_request: 'Đề nghị mua',
  payment_request: 'Đề nghị thanh toán',
  advance: 'Tạm ứng',
  estimate_price: 'Giá dự thầu / dự toán',
  contract: 'Hợp đồng',
  contract_amendment: 'Phát sinh ngoài hợp đồng',
  special_discount: 'Giảm giá đặc biệt',
  stocktake_adjustment: 'Điều chỉnh chênh lệch kiểm kê',
  leave_request: 'Nghỉ phép',
  quote_price: 'Báo giá gửi khách hàng',
  recruitment_position: 'Yêu cầu tuyển dụng',
};

export interface ApprovalLimitSeed {
  readonly role: RoleCode;
  readonly subject: ApprovalSubject;
  /** Giới hạn trên, đơn vị ĐỒNG. `null` = không giới hạn. */
  readonly maxAmount: bigint | null;
  /** Thứ tự trong chuỗi duyệt (1 = duyệt trước). Dùng cho luồng nhiều cấp như KT-01. */
  readonly step: number;
}

const TRIEU = 1_000_000n;

/**
 * Hạn mức mặc định — GIẢ ĐỊNH, chờ NVG ban hành quy chế chính thức.
 *
 * Căn cứ đã có trong tài liệu:
 *  - PRD NEN-02: "mức tạm thời 10 triệu / 50 triệu đồng".
 *  - PRD DA-07: Trưởng nhóm kiểm tra → Trưởng phòng hoặc Tổng Giám đốc duyệt giá cuối cùng.
 *  - PRD CRM-05: giảm giá đặc biệt mặc định do Tổng Giám đốc duyệt.
 *  - PRD KT-01: đề nghị → trưởng đơn vị → Kế toán → Trưởng Tài chính (dòng tiền) → duyệt theo hạn mức.
 */
export const DEFAULT_APPROVAL_LIMITS: readonly ApprovalLimitSeed[] = [
  // Đề nghị mua (MH-02)
  { role: 'MH', subject: 'purchase_request', maxAmount: 10n * TRIEU, step: 1 },
  { role: 'CFO', subject: 'purchase_request', maxAmount: 200n * TRIEU, step: 2 },
  { role: 'TGD', subject: 'purchase_request', maxAmount: null, step: 3 },

  // Đề nghị thanh toán — luồng nhiều cấp (KT-01)
  { role: 'KT', subject: 'payment_request', maxAmount: 10n * TRIEU, step: 1 },
  { role: 'CFO', subject: 'payment_request', maxAmount: 200n * TRIEU, step: 2 },
  { role: 'TGD', subject: 'payment_request', maxAmount: null, step: 3 },

  // Tạm ứng (KT-03)
  { role: 'KT', subject: 'advance', maxAmount: 10n * TRIEU, step: 1 },
  { role: 'CFO', subject: 'advance', maxAmount: 50n * TRIEU, step: 2 },
  { role: 'TGD', subject: 'advance', maxAmount: null, step: 3 },

  // Giá dự thầu / dự toán (DA-07)
  { role: 'DA_DT', subject: 'estimate_price', maxAmount: 500n * TRIEU, step: 1 },
  { role: 'TGD', subject: 'estimate_price', maxAmount: null, step: 2 },

  // Hợp đồng (HD-05)
  { role: 'DA_DT', subject: 'contract', maxAmount: 200n * TRIEU, step: 1 },
  { role: 'TGD', subject: 'contract', maxAmount: null, step: 2 },

  // Phát sinh ngoài hợp đồng (HD-04)
  { role: 'TC', subject: 'contract_amendment', maxAmount: 50n * TRIEU, step: 1 },
  { role: 'TGD', subject: 'contract_amendment', maxAmount: null, step: 2 },

  // Báo giá gửi khách hàng (CRM-04) — "báo giá phải qua phê duyệt nội bộ trước khi gửi".
  //
  // ⚠️ GIẢ ĐỊNH CẦN NVG XÁC NHẬN: tài liệu KHÔNG nói ai duyệt báo giá thường (không giảm
  // giá). Tạm đặt Kinh doanh duyệt tới 500 triệu, trên mức đó chuyển Tổng Giám đốc — suy
  // ra từ DA-07 (Trưởng nhóm kiểm tra → Trưởng phòng/TGĐ duyệt giá cuối cùng). Khi NVG ban
  // hành quy chế, sửa trong Quản trị hệ thống, KHÔNG sửa file này.
  { role: 'KD', subject: 'quote_price', maxAmount: 500n * TRIEU, step: 1 },
  { role: 'TGD', subject: 'quote_price', maxAmount: null, step: 2 },

  // Giảm giá đặc biệt — chỉ Tổng Giám đốc (CRM-05)
  { role: 'TGD', subject: 'special_discount', maxAmount: null, step: 1 },

  // Điều chỉnh chênh lệch kiểm kê (KHO-07) — duyệt theo giá trị chênh lệch
  { role: 'KHO', subject: 'stocktake_adjustment', maxAmount: 10n * TRIEU, step: 1 },
  { role: 'CFO', subject: 'stocktake_adjustment', maxAmount: null, step: 2 },

  // Nghỉ phép (NS-05) — không gắn giá trị tiền
  { role: 'NS', subject: 'leave_request', maxAmount: null, step: 1 },

  // Yêu cầu tuyển dụng (NS-02) — không gắn giá trị tiền.
  //
  // ĐÃ CHỐT 20/09/2026 (Haan): **Hành chính – Nhân sự** duyệt, không phải Tổng Giám đốc như
  // giả định trước đó. Trưởng đơn vị gửi yêu cầu, HCNS là nơi duyệt và triển khai tuyển.
  //
  // ⚠️ Hệ quả kiểm soát cần biết: hệ thống KHÔNG chặn người tự duyệt yêu cầu của chính mình,
  // nên nếu chính HCNS là người gửi thì HCNS duyệt được. Muốn Tổng Giám đốc giữ bước cuối thì
  // thêm một dòng bước 2 trong Quản trị hệ thống — KHÔNG sửa file này.
  { role: 'NS', subject: 'recruitment_position', maxAmount: null, step: 1 },
] as const;
