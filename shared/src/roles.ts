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
  'KSNB',
  // Gói B (0254, 30/10/2026): Kinh doanh của NVS — như KD cộng XEM phân hệ SX để kiểm tồn khi báo giá.
  'KD_NVS',
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
    defaultRoute: '/tong-quan',
    seesAllCompanies: true,
  },
  CFO: {
    code: 'CFO',
    label: 'Giám đốc Tài chính',
    defaultRoute: '/tong-quan',
    seesAllCompanies: true,
  },
  BGD: {
    code: 'BGD',
    label: 'Ban Giám đốc',
    defaultRoute: '/tong-quan',
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
  /*
   * Kiểm soát nội bộ — chỉ xem mọi pháp nhân, mọi phân hệ (migration 0167, 0168). Không tạo,
   * sửa, phê duyệt; không xem lương / hồ sơ cá nhân.
   */
  KSNB: {
    code: 'KSNB',
    label: 'Kiểm soát nội bộ',
    defaultRoute: '/tong-quan',
    seesAllCompanies: true,
  },
  /*
   * Kinh doanh NVS (0254, 0255 — anh Dũng 30/10/2026). Quyền như `KD` cộng XEM phân hệ SX (tồn
   * giàn giáo, đơn thuê, báo giá thuê) để kiểm tồn khi báo giá; không sửa / duyệt SX. Tách vai vì
   * ma trận quyền không có chiều pháp nhân — mở SX cho `KD` thì Kinh doanh NVC / NVO cũng thấy.
   */
  KD_NVS: {
    code: 'KD_NVS',
    label: 'Kinh doanh NVS',
    defaultRoute: '/crm/co-hoi',
    seesAllCompanies: false,
  },
} as const;

/**
 * Vai trò QUẢN LÝ mọi hồ sơ — sửa được hồ sơ không phải của mình. Gương của
 * `rls_owner_can_write` trong CSDL (0001). KHÔNG suy từ `seesAllCompanies`: Kiểm soát nội bộ
 * xem mọi pháp nhân nhưng không sửa gì.
 */
export const ORG_MANAGER_ROLES: readonly RoleCode[] = ['TGD', 'CFO', 'BGD', 'ADMIN'];

/**
 * Vai trò xem «Tổng quan điều hành» (`/tong-quan`). Gương của cửa vào hàm `exec_overview` (0169).
 */
export const EXEC_OVERVIEW_ROLES: readonly RoleCode[] = ['TGD', 'CFO', 'BGD', 'ADMIN', 'KSNB'];

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
  'survey_report',
  'showcase_delete',
  // 0244: lợi nhuận dưới mức tối thiểu của pháp nhân (hoặc chưa đủ giá vốn để kiểm) — chỉ Tổng Giám đốc.
  'low_margin_price',
  // G5 (0245): báo giá thuê giàn giáo có giá đặc biệt / vượt hạn mức công nợ; cho thuê nội bộ.
  'rental_quote',
  'internal_rental',
  // G6 (0247): Ban Giám đốc quyết định có tham gia gói thầu hay không.
  'bid_participation',
  // G2 (0246): chọn thầu phụ / tổ đội cho một gói việc của công trình.
  'subcontractor_selection',
  // G4 (0249): điều chỉnh ngân sách công trình sau khởi công; đề nghị mua / chọn thầu phụ vượt ngân sách.
  'budget_adjustment',
  'over_budget',
  // 0253 (anh Dũng 30/10/2026): ngân sách thi công BAN ĐẦU của công trình — Tổng Giám đốc duyệt trước khởi công.
  'site_budget',
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
  survey_report: 'Báo cáo khảo sát',
  showcase_delete: 'Xoá mẫu công trình',
  low_margin_price: 'Giá dưới mức lợi nhuận tối thiểu',
  rental_quote: 'Báo giá thuê giàn giáo',
  internal_rental: 'Cho thuê giàn giáo nội bộ',
  bid_participation: 'Quyết định tham gia gói thầu',
  subcontractor_selection: 'Chọn thầu phụ / tổ đội',
  budget_adjustment: 'Điều chỉnh ngân sách',
  over_budget: 'Vượt ngân sách',
  site_budget: 'Ngân sách thi công',
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
  // Ban Giám đốc duyệt (anh Dũng 29/10/2026): Kinh doanh không xem giá vốn / lợi nhuận (0244),
  // nên không tự duyệt giá được — trước đây Kinh doanh duyệt tới 500 triệu. Khi NVG ban hành quy
  // chế, sửa trong Quản trị hệ thống, KHÔNG sửa file này.
  { role: 'BGD', subject: 'quote_price', maxAmount: null, step: 1 },
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

  // Báo cáo khảo sát (Đợt 1 — 1D, migration 0175) — không gắn giá trị tiền.
  // ĐÃ CHỐT (chủ dự án, 17/10/2026): Ban Giám đốc duyệt; chưa duyệt thì chặn Báo giá.
  { role: 'BGD', subject: 'survey_report', maxAmount: null, step: 1 },
  { role: 'TGD', subject: 'survey_report', maxAmount: null, step: 1 },

  // Xoá mẫu công trình (Đợt 1 — 1H, 0179): Thiết kế đề nghị, Giám đốc đồng ý (chủ dự án chốt).
  { role: 'BGD', subject: 'showcase_delete', maxAmount: null, step: 1 },
  { role: 'TGD', subject: 'showcase_delete', maxAmount: null, step: 1 },

  // Giá dưới mức lợi nhuận tối thiểu (0244, A1 — anh Dũng): báo giá / giá dự thầu có lợi nhuận dưới
  // `min_margin_percent` của pháp nhân chỉ Tổng Giám đốc duyệt. Tham số để trống thì không loại nào
  // mở ra hồ sơ này.
  { role: 'TGD', subject: 'low_margin_price', maxAmount: null, step: 1 },

  // G5 (0245): báo giá thuê giàn giáo có giá thấp hơn bảng giá hoặc công nợ khách vượt hạn mức,
  // và đề nghị thuê giàn giáo nội bộ của NVC / NVO — Ban Giám đốc duyệt (Xưởng `SX` không có quyền
  // duyệt). Phiếu khảo sát Ban Giám đốc, mảng giàn giáo bước 3 và 11.
  { role: 'BGD', subject: 'rental_quote', maxAmount: null, step: 1 },
  { role: 'TGD', subject: 'rental_quote', maxAmount: null, step: 1 },
  { role: 'BGD', subject: 'internal_rental', maxAmount: null, step: 1 },
  { role: 'TGD', subject: 'internal_rental', maxAmount: null, step: 1 },

  // G6 (0247, A10): quyết định tham gia gói thầu — Ban Giám đốc duyệt (đã chốt). Đấu thầu không có
  // hạn mức nên không tự duyệt gói của mình. Không gắn giá trị tiền.
  { role: 'BGD', subject: 'bid_participation', maxAmount: null, step: 1 },
  { role: 'TGD', subject: 'bid_participation', maxAmount: null, step: 1 },

  // G2 (0246): chọn thầu phụ / tổ đội — phiếu khảo sát «duyệt theo hạn mức». Trưởng phòng Thi công
  // duyệt gói nhỏ, Ban Giám đốc gói vừa, Tổng Giám đốc không giới hạn. Số là GIẢ ĐỊNH — NVG chưa
  // quyết hạn mức (câu hỏi A4); sửa trong Quản trị hệ thống, KHÔNG sửa file này.
  { role: 'TC', subject: 'subcontractor_selection', maxAmount: 50n * TRIEU, step: 1 },
  { role: 'BGD', subject: 'subcontractor_selection', maxAmount: 500n * TRIEU, step: 2 },
  { role: 'TGD', subject: 'subcontractor_selection', maxAmount: null, step: 3 },

  // G4 (0249, A3): điều chỉnh ngân sách công trình sau khởi công — hạn mức tính theo |chênh lệch|.
  // Trưởng phòng Thi công duyệt chênh lệch nhỏ, Ban Giám đốc vừa, Tổng Giám đốc không giới hạn. Chỉ
  // huy trưởng (CHT) không có dòng nào nên không tự duyệt. Số là GIẢ ĐỊNH — sửa trong Quản trị.
  { role: 'TC', subject: 'budget_adjustment', maxAmount: 50n * TRIEU, step: 1 },
  { role: 'BGD', subject: 'budget_adjustment', maxAmount: 500n * TRIEU, step: 2 },
  { role: 'TGD', subject: 'budget_adjustment', maxAmount: null, step: 3 },

  // G4 (0249, A3): đề nghị mua / chọn thầu phụ vượt phần còn lại của dòng ngân sách — không bị chặn,
  // vào hồ sơ loại này thay cho loại thường (theo TOÀN BỘ giá trị hồ sơ). Trưởng phòng Thi công trong
  // hạn mức, rồi Ban Giám đốc. Dung sai `tc.over_budget_tolerance_percent` để trống = không dung sai.
  // Câu hỏi A3 cho NVG còn mở; sửa trong Quản trị, KHÔNG sửa file này.
  { role: 'TC', subject: 'over_budget', maxAmount: 50n * TRIEU, step: 1 },
  { role: 'BGD', subject: 'over_budget', maxAmount: null, step: 2 },
  { role: 'TGD', subject: 'over_budget', maxAmount: null, step: 2 },

  // 0253 (anh Dũng 30/10/2026): ngân sách thi công ban đầu của công trình (lập từ báo giá) — CHỈ Tổng
  // Giám đốc duyệt, không giới hạn số tiền. Chưa duyệt thì không khởi công.
  { role: 'TGD', subject: 'site_budget', maxAmount: null, step: 1 },
] as const;
