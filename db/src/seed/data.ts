/**
 * Dữ liệu khởi tạo.
 *
 * ⚠️ TRẠNG THÁI DỮ LIỆU
 *  - `companies`: mã và mảng hoạt động lấy từ PRD Mục 1.1 (chính xác).
 *    Tên pháp lý đầy đủ theo PRD; mã số thuế / địa chỉ / người đại diện là GIẢ ĐỊNH.
 *  - `roles` + `permissions`: suy ra từ Webapp Flow 2.3 (menu theo vai trò) và PRD Mục 3.
 *  - `users`: bốn người có tên thật trong PRD Mục 3 và Phụ lục C; còn lại là GIẢ ĐỊNH
 *    để đủ mỗi vai trò một người dùng thử.
 *  - `approval_limits`: GIẢ ĐỊNH — PRD Mục 8.2/10 ghi NVG chưa ban hành quy chế chính thức.
 *
 * Thay bằng dữ liệu thật: sửa file này rồi chạy lại `npm run db:seed` (seed idempotent).
 */

import type { ModuleCode, RoleCode } from '@nvg/shared';

export interface CompanySeed {
  code: string;
  legalName: string;
  shortName: string;
  taxCode: string | null;
  address: string | null;
  legalRepresentative: string | null;
  isTransactional: boolean;
  displayOrder: number;
}

export const COMPANY_SEED: CompanySeed[] = [
  {
    code: 'NVC',
    legalName: 'Công ty TNHH Tư vấn xây dựng và Phát triển Nhà Việt',
    shortName: 'Nhà Việt Cons',
    taxCode: null,
    address: null,
    legalRepresentative: 'Bùi Văn Thi',
    isTransactional: true,
    displayOrder: 1,
  },
  {
    code: 'NVS',
    legalName: 'Công ty TNHH Sản xuất và Thương mại Kết cấu thép Nhà Việt',
    shortName: 'Nhà Việt Steel',
    taxCode: null,
    address: null,
    legalRepresentative: 'Bùi Văn Thi',
    isTransactional: true,
    displayOrder: 2,
  },
  {
    code: 'NVO',
    legalName: 'Công ty TNHH Tư vấn và Xây dựng Nhà Việt One',
    shortName: 'Nhà Việt One',
    taxCode: null,
    address: null,
    legalRepresentative: 'Bùi Văn Thi',
    isTransactional: true,
    displayOrder: 3,
  },
  {
    code: 'NVG',
    legalName: 'Nhà Việt Group',
    shortName: 'Toàn NVG',
    taxCode: null,
    address: null,
    legalRepresentative: null,
    // Mã tổng hợp toàn tập đoàn — chỉ dùng cho báo cáo, KHÔNG phát sinh giao dịch
    // (Backend Schema 2.2).
    isTransactional: false,
    displayOrder: 0,
  },
];

/** Quyền của một vai trò trên một module. */
export type Perm = 'view' | 'create' | 'edit' | 'delete' | 'approve';

export interface RoleSeed {
  code: RoleCode;
  label: string;
  description: string;
  seesAllCompanies: boolean;
  defaultRoute: string;
  /** Module → quyền. Module không liệt kê = KHÔNG hiện trên menu (Webapp Flow 6.5). */
  permissions: Partial<Record<ModuleCode, Perm[]>>;
}

const ALL: Perm[] = ['view', 'create', 'edit', 'delete', 'approve'];
const VIEW: Perm[] = ['view'];
const VIEW_APPROVE: Perm[] = ['view', 'approve'];
const WORK: Perm[] = ['view', 'create', 'edit'];

/**
 * Ban Giám đốc: "tất cả module ở chế độ chỉ xem + phê duyệt" (Webapp Flow 2.3).
 * Cố tình KHÔNG cấp quyền tạo/sửa — PRD 2.3 phân tách rõ người thực hiện và người phê duyệt.
 */
const BGD_PERMISSIONS: Partial<Record<ModuleCode, Perm[]>> = {
  BC: VIEW,
  CRM: VIEW_APPROVE,
  DA: VIEW_APPROVE,
  TK: VIEW_APPROVE,
  HD: VIEW_APPROVE,
  TC: VIEW_APPROVE,
  MH: VIEW_APPROVE,
  KHO: VIEW_APPROVE,
  KT: VIEW_APPROVE,
  NS: VIEW_APPROVE,
  SX: VIEW_APPROVE,
};

export const ROLE_SEED: RoleSeed[] = [
  {
    code: 'TGD',
    label: 'Tổng Giám đốc',
    description: 'Chủ trì triển khai, phê duyệt cấp cao nhất, không giới hạn hạn mức.',
    seesAllCompanies: true,
    defaultRoute: '/dashboard',
    permissions: BGD_PERMISSIONS,
  },
  {
    code: 'CFO',
    label: 'Giám đốc Tài chính',
    description: 'Kiểm soát dòng tiền, công nợ, phê duyệt chi theo hạn mức.',
    seesAllCompanies: true,
    defaultRoute: '/dashboard',
    permissions: { ...BGD_PERMISSIONS, KT: ALL },
  },
  {
    code: 'BGD',
    label: 'Ban Giám đốc',
    description: 'Giám sát toàn hệ thống, xem và phê duyệt.',
    seesAllCompanies: true,
    defaultRoute: '/dashboard',
    permissions: BGD_PERMISSIONS,
  },
  {
    code: 'KD',
    label: 'Kinh doanh',
    description: 'Tìm kiếm, chăm sóc khách hàng, báo giá, bàn giao cơ hội đã chốt.',
    seesAllCompanies: false,
    defaultRoute: '/crm/co-hoi',
    permissions: { BC: VIEW, CRM: WORK, HD: VIEW },
  },
  {
    code: 'DA_DT',
    label: 'Dự án – Đấu thầu',
    description: 'Khảo sát, bóc tách khối lượng, dự toán, hồ sơ thầu, ngân sách thi công.',
    seesAllCompanies: false,
    defaultRoute: '/da/goi-thau',
    permissions: { BC: VIEW, DA: WORK, CRM: VIEW, HD: VIEW },
  },
  {
    code: 'TKE',
    label: 'Thiết kế',
    description: 'Thiết kế kiến trúc – kết cấu – điện nước, phiên bản bản vẽ, dự toán NVO.',
    seesAllCompanies: false,
    defaultRoute: '/tk/du-an',
    permissions: { BC: VIEW, TK: WORK, CRM: VIEW, HD: VIEW },
  },
  {
    code: 'TC',
    label: 'Thi công / Ban công trường',
    description: 'Tiến độ, nhật ký công trường, nghiệm thu, đề nghị vật tư.',
    seesAllCompanies: false,
    defaultRoute: '/tc/cong-trinh',
    permissions: { BC: VIEW, TC: WORK, MH: ['view', 'create'], KHO: VIEW },
  },
  {
    code: 'MH',
    label: 'Mua hàng – Vật tư',
    description: 'Xử lý đề nghị mua, so sánh nhà cung cấp, đơn hàng, giao nhận.',
    seesAllCompanies: false,
    defaultRoute: '/mh/de-nghi-mua',
    permissions: { BC: VIEW, MH: WORK, KHO: VIEW },
  },
  {
    code: 'KHO',
    label: 'Kho',
    description: 'Nhập – xuất – điều chuyển – kiểm kê vật tư và giàn giáo.',
    seesAllCompanies: false,
    defaultRoute: '/kho/quet-ma',
    permissions: { KHO: WORK, MH: VIEW },
  },
  {
    code: 'KT',
    label: 'Kế toán – Tài chính',
    description: 'Đề nghị thanh toán, tạm ứng, công nợ, hạch toán, đối chiếu.',
    seesAllCompanies: false,
    defaultRoute: '/kt/de-nghi-thanh-toan',
    permissions: { BC: VIEW, KT: WORK, HD: VIEW, MH: VIEW },
  },
  {
    code: 'NS',
    label: 'Hành chính – Nhân sự',
    description: 'Tuyển dụng, hồ sơ nhân sự, chấm công 3 khối, tài sản cấp phát.',
    seesAllCompanies: false,
    defaultRoute: '/ns/viec-can-xu-ly',
    permissions: { NS: WORK },
  },
  {
    code: 'ADMIN',
    label: 'Quản trị hệ thống',
    description: 'Phân quyền, hạn mức, danh mục dùng chung, nhật ký truy cập.',
    seesAllCompanies: true,
    defaultRoute: '/nen/quan-tri',
    permissions: {
      NEN: ALL, BC: ALL, CRM: ALL, DA: ALL, TK: ALL, HD: ALL,
      TC: ALL, MH: ALL, KHO: ALL, KT: ALL, NS: ALL, SX: ALL,
    },
  },
];

export interface UserSeed {
  email: string;
  fullName: string;
  jobTitle: string;
  department: string;
  /** Vai trò tại từng pháp nhân. Một người có thể thuộc nhiều pháp nhân (Backend Schema 2.2). */
  assignments: { company: string; role: RoleCode; isPrimary?: boolean }[];
  /** `true` nếu tên lấy từ PRD; `false` nếu là nhân vật giả định để thử vai trò. */
  fromDocs: boolean;
}

export const USER_SEED: UserSeed[] = [
  {
    email: 'tgd@nhavietgroup.test',
    fullName: 'Bùi Văn Thi',
    jobTitle: 'Tổng Giám đốc',
    department: 'Ban Giám đốc',
    fromDocs: true,
    assignments: [
      { company: 'NVG', role: 'TGD', isPrimary: true },
      { company: 'NVC', role: 'TGD' },
      { company: 'NVS', role: 'TGD' },
      { company: 'NVO', role: 'TGD' },
    ],
  },
  {
    email: 'cfo@nhavietgroup.test',
    fullName: 'Lương Thị Vân',
    jobTitle: 'Giám đốc Tài chính',
    department: 'Ban Giám đốc',
    fromDocs: true,
    assignments: [{ company: 'NVG', role: 'CFO', isPrimary: true }],
  },
  {
    email: 'pgd.nvs@nhavietgroup.test',
    fullName: 'Phượng',
    jobTitle: 'Phó Giám đốc điều hành NVS',
    department: 'NVS — Điều hành',
    fromDocs: true,
    assignments: [{ company: 'NVS', role: 'BGD', isPrimary: true }],
  },
  {
    email: 'sanxuat.nvs@nhavietgroup.test',
    fullName: 'Toản',
    jobTitle: 'Trưởng sản xuất',
    department: 'NVS — Phòng Sản xuất',
    fromDocs: true,
    assignments: [{ company: 'NVS', role: 'TC', isPrimary: true }],
  },
  {
    email: 'admin@nhavietgroup.test',
    fullName: 'Quản trị hệ thống',
    jobTitle: 'Quản trị viên',
    department: 'Back Office',
    fromDocs: false,
    assignments: [{ company: 'NVG', role: 'ADMIN', isPrimary: true }],
  },
  {
    email: 'kinhdoanh.nvc@nhavietgroup.test',
    fullName: 'Nguyễn Văn A',
    jobTitle: 'Nhân viên Kinh doanh',
    department: 'NVC — Phòng Kinh doanh',
    fromDocs: false,
    assignments: [{ company: 'NVC', role: 'KD', isPrimary: true }],
  },
  {
    email: 'kinhdoanh.nvo@nhavietgroup.test',
    fullName: 'Trần Thị B',
    jobTitle: 'Nhân viên Kinh doanh',
    department: 'NVO — Phòng Kinh doanh',
    fromDocs: false,
    assignments: [{ company: 'NVO', role: 'KD', isPrimary: true }],
  },
  {
    email: 'dauthau.nvc@nhavietgroup.test',
    fullName: 'Lê Văn C',
    jobTitle: 'Trưởng nhóm Dự toán',
    department: 'NVC — Phòng Dự án – Đấu thầu',
    fromDocs: false,
    assignments: [{ company: 'NVC', role: 'DA_DT', isPrimary: true }],
  },
  {
    email: 'thietke.nvo@nhavietgroup.test',
    fullName: 'Phạm Thị D',
    jobTitle: 'Kiến trúc sư',
    department: 'NVO — Phòng Thiết kế – Đấu thầu',
    fromDocs: false,
    assignments: [{ company: 'NVO', role: 'TKE', isPrimary: true }],
  },
  {
    // Bộ môn thứ hai của Phòng Thiết kế. PRD TK-04 nói rõ hồ sơ triển khai SONG SONG bởi
    // kiến trúc, kết cấu và điện nước — một tài khoản Thiết kế duy nhất thì không dựng được
    // tình huống thật, và cũng không kiểm chứng được Mẫu B (đồng nghiệp xem được, không sửa
    // được phần của nhau).
    email: 'ketcau.nvo@nhavietgroup.test',
    fullName: 'Đỗ Văn K',
    jobTitle: 'Kỹ sư Kết cấu',
    department: 'NVO — Phòng Thiết kế – Đấu thầu',
    fromDocs: false,
    assignments: [{ company: 'NVO', role: 'TKE', isPrimary: true }],
  },
  {
    email: 'congtruong.nvc@nhavietgroup.test',
    fullName: 'Hoàng Văn E',
    jobTitle: 'Chỉ huy trưởng',
    department: 'NVC — Ban công trường 01',
    fromDocs: false,
    assignments: [{ company: 'NVC', role: 'TC', isPrimary: true }],
  },
  {
    email: 'muahang@nhavietgroup.test',
    fullName: 'Vũ Thị F',
    jobTitle: 'Trưởng phòng Mua hàng – Vật tư',
    department: 'Back Office — Cung ứng – Vật tư',
    fromDocs: false,
    // Mua hàng phục vụ cả ba pháp nhân (PRD Mục 1.1: cung ứng dùng chung).
    assignments: [
      { company: 'NVC', role: 'MH', isPrimary: true },
      { company: 'NVS', role: 'MH' },
      { company: 'NVO', role: 'MH' },
    ],
  },
  {
    email: 'kho@nhavietgroup.test',
    fullName: 'Đặng Văn G',
    jobTitle: 'Thủ kho',
    department: 'Bộ phận Kho',
    fromDocs: false,
    assignments: [
      { company: 'NVC', role: 'KHO', isPrimary: true },
      { company: 'NVS', role: 'KHO' },
    ],
  },
  {
    email: 'ketoan@nhavietgroup.test',
    fullName: 'Bùi Thị H',
    jobTitle: 'Kế toán nội bộ',
    department: 'Back Office — Kế toán',
    fromDocs: false,
    assignments: [
      { company: 'NVC', role: 'KT', isPrimary: true },
      { company: 'NVS', role: 'KT' },
      { company: 'NVO', role: 'KT' },
    ],
  },
  {
    email: 'nhansu@nhavietgroup.test',
    fullName: 'Ngô Thị I',
    jobTitle: 'Trưởng phòng Hành chính – Nhân sự',
    department: 'Back Office — Hành chính – Nhân sự',
    fromDocs: false,
    assignments: [
      { company: 'NVC', role: 'NS', isPrimary: true },
      { company: 'NVS', role: 'NS' },
      { company: 'NVO', role: 'NS' },
    ],
  },
];

/**
 * Mật khẩu dùng chung cho tài khoản seed ở môi trường DEV.
 * Backend Schema 3.1: tối thiểu 8 ký tự, có chữ và số.
 * ⚠️ CHỈ dùng cho dev/staging. Seed KHÔNG được chạy trên production với mật khẩu này.
 */
export const SEED_PASSWORD = 'NhaViet2026';
