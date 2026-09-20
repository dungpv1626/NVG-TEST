/**
 * 12 module nghiệp vụ — mã và phạm vi.
 * Nguồn: PRD Mục 5. Thứ tự dưới đây theo ƯU TIÊN NGHIỆP VỤ (Webapp Flow 2.1),
 * KHÔNG xếp theo alphabet — sidebar hiển thị đúng thứ tự này.
 */

export const MODULE_CODES = [
  'BC',
  'CRM',
  'DA',
  'TK',
  'HD',
  'TC',
  'MH',
  'KHO',
  'KT',
  'NS',
  'SX',
  'NEN',
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

/** Giai đoạn triển khai theo PRD Mục 4. */
export type Phase = 1 | 2 | 3;

export interface ModuleMeta {
  readonly code: ModuleCode;
  /** Tên hiển thị trên sidebar — Content Guidelines 4.8 (số nhiều, không thêm "Danh sách"). */
  readonly label: string;
  /**
   * Tên rút gọn cho thanh điều hướng dưới của điện thoại (Webapp Flow 4.8).
   *
   * Không phải tên thứ hai của module: đây là cùng một khái niệm, chỉ bỏ vế bổ nghĩa cho
   * vừa bề ngang ~70px. Cắt tự động bằng dấu ba chấm thì "Kế toán – Tài chính" thành
   * "Kế toá…", đọc ra nghĩa khác hẳn.
   */
  readonly shortLabel: string;
  readonly description: string;
  readonly phase: Phase;
}

export const MODULES: Readonly<Record<ModuleCode, ModuleMeta>> = {
  BC: {
    code: 'BC',
    label: 'Báo cáo & Dashboard',
    shortLabel: 'Báo cáo',
    description: 'Dashboard điều hành, báo cáo lãi/lỗ, hiệu quả kinh doanh, cảnh báo rủi ro.',
    phase: 1,
  },
  CRM: {
    code: 'CRM',
    label: 'Khách hàng & Cơ hội',
    shortLabel: 'Khách hàng',
    description: 'Hồ sơ khách hàng, pipeline cơ hội, khảo sát, báo giá, khiếu nại.',
    phase: 1,
  },
  DA: {
    code: 'DA',
    label: 'Dự án – Đấu thầu',
    shortLabel: 'Đấu thầu',
    description:
      'Gói thầu, bóc tách khối lượng, đơn giá/định mức, dự toán, phê duyệt giá, ngân sách.',
    phase: 1,
  },
  TK: {
    code: 'TK',
    label: 'Thiết kế',
    shortLabel: 'Thiết kế',
    description:
      'Đầu bài, phương án kiến trúc, hồ sơ đa bộ môn, phiên bản bản vẽ, yêu cầu thay đổi.',
    phase: 1,
  },
  HD: {
    code: 'HD',
    label: 'Hợp đồng',
    shortLabel: 'Hợp đồng',
    description: 'Hợp đồng thiết kế/thi công/mua bán/khoán, điều khoản, phát sinh, phê duyệt.',
    phase: 1,
  },
  TC: {
    code: 'TC',
    label: 'Thi công & Ngân sách',
    shortLabel: 'Thi công',
    description: 'Công trình, nhật ký công trường, nghiệm thu, nhà thầu phụ, bảo hành.',
    phase: 2,
  },
  MH: {
    code: 'MH',
    label: 'Mua hàng – Vật tư',
    shortLabel: 'Mua hàng',
    description: 'Đề nghị mua, nhà cung cấp, so sánh báo giá, đơn hàng, giao nhận.',
    phase: 2,
  },
  KHO: {
    code: 'KHO',
    label: 'Kho',
    shortLabel: 'Kho',
    description: 'Nhập – xuất – điều chuyển – kiểm kê vật tư, công cụ dụng cụ và giàn giáo.',
    phase: 2,
  },
  KT: {
    code: 'KT',
    label: 'Kế toán – Tài chính',
    shortLabel: 'Kế toán',
    description: 'Đề nghị thanh toán, tạm ứng, công nợ, dòng tiền, khoá kỳ kế toán.',
    phase: 2,
  },
  NS: {
    code: 'NS',
    label: 'Hành chính – Nhân sự',
    shortLabel: 'Nhân sự',
    description:
      'Hồ sơ nhân sự, tuyển dụng, chấm công 3 khối, hợp đồng lao động, tài sản cấp phát.',
    phase: 2,
  },
  SX: {
    code: 'SX',
    label: 'Sản xuất & Cho thuê',
    shortLabel: 'Sản xuất',
    description: 'Lệnh sản xuất, tiêu hao nguyên liệu, tài sản giàn giáo cho thuê (NVS).',
    phase: 2,
  },
  NEN: {
    code: 'NEN',
    label: 'Quản trị hệ thống',
    shortLabel: 'Quản trị',
    description: 'Phân quyền, hạn mức, danh mục dùng chung, kho hồ sơ, nhật ký truy cập.',
    phase: 1,
  },
} as const;

/** Ba pháp nhân giao dịch + mã tổng hợp toàn tập đoàn. */
export const COMPANY_CODES = ['NVC', 'NVS', 'NVO', 'NVG'] as const;
export type CompanyCode = (typeof COMPANY_CODES)[number];

export interface CompanyMeta {
  readonly code: CompanyCode;
  readonly shortName: string;
  readonly description: string;
  /**
   * `false` với NVG — đây là mã TỔNG HỢP chỉ dùng cho báo cáo,
   * KHÔNG phải pháp nhân giao dịch thật (Backend Schema 2.2).
   */
  readonly isTransactional: boolean;
}

export const COMPANIES: Readonly<Record<CompanyCode, CompanyMeta>> = {
  NVC: {
    code: 'NVC',
    shortName: 'Nhà Việt Cons',
    description: 'Nhà xưởng công nghiệp, cải tạo nhà máy, nhà cao tầng.',
    isTransactional: true,
  },
  NVS: {
    code: 'NVS',
    shortName: 'Nhà Việt Steel',
    description: 'Sản xuất, thương mại và cho thuê giàn giáo, kết cấu thép.',
    isTransactional: true,
  },
  NVO: {
    code: 'NVO',
    shortName: 'Nhà Việt One',
    description: 'Thiết kế và thi công trọn gói nhà ở dân dụng.',
    isTransactional: true,
  },
  NVG: {
    code: 'NVG',
    shortName: 'Toàn NVG',
    description: 'Mã tổng hợp toàn tập đoàn — chỉ dùng cho báo cáo, không phát sinh giao dịch.',
    isTransactional: false,
  },
} as const;

/** Các pháp nhân giao dịch thật (loại NVG). */
export const TRANSACTIONAL_COMPANIES = COMPANY_CODES.filter((c) => COMPANIES[c].isTransactional);
