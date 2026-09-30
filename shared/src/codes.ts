/**
 * Bộ mã thống nhất — `doc/BO_MA.md` (Haan chốt 30/09/2026).
 *
 * Hai họ mã, tách theo ranh giới bảng giao dịch / bảng dùng chung (CLAUDE.md 3.5):
 *
 *   Hồ sơ giao dịch  {PHÁP NHÂN}-{LOẠI}-{NĂM}-{4 số}   NVC-HD-2026-0042
 *   Danh mục chung   {LOẠI}-{5 số}                       KH-00001 · NCC-00042
 *   Vật tư           {NHÓM}-{TÊN VIẾT TẮT}-{QUY CÁCH}    THEP-ONG-D49X2.0
 *
 * Số thứ tự LUÔN do CSDL cấp (`next_record_code`, `issue_catalog_code`, migration 0007 và
 * 0132) — không đếm ở trình duyệt. Các hàm dựng mã dưới đây là bản soi của quy tắc để kiểm
 * dạng và đọc ngược, KHÔNG dùng để sinh mã ghi vào CSDL.
 *
 * Khách hàng và nhà cung cấp không mang pháp nhân vì hai bảng đó không có `company_id`: cùng
 * một nhà cung cấp của ba công ty phải là MỘT mã, nếu không công nợ bị nhìn thành ba nơi.
 */

import type { CompanyCode } from './modules';

/**
 * Loại hồ sơ giao dịch — mang pháp nhân và năm. Mỗi loại một tiền tố ngắn, không trùng nhau.
 * Phải khớp đúng những loại CSDL đang cấp; phép thử canh hai bên.
 */
export const RECORD_TYPES = {
  CH: 'Cơ hội kinh doanh',
  BG: 'Báo giá',
  KN: 'Khiếu nại',
  DA: 'Gói thầu / Dự án',
  DT: 'Dự toán',
  TK: 'Dự án thiết kế',
  BV: 'Bản vẽ',
  HD: 'Hợp đồng',
  PS: 'Phát sinh hợp đồng',
  CT: 'Công trình',
  NT: 'Biên bản nghiệm thu',
  DNM: 'Đề nghị mua',
  DH: 'Đơn đặt hàng',
  GN: 'Phiếu giao nhận',
  PN: 'Phiếu nhập kho',
  PX: 'Phiếu xuất kho',
  DC: 'Phiếu điều chuyển',
  KK: 'Phiếu kiểm kê',
  DNTT: 'Đề nghị thanh toán',
  DNTU: 'Đề nghị tạm ứng',
  NS: 'Hồ sơ nhân sự',
  TS: 'Tài sản',
  LSX: 'Lệnh sản xuất',
  HDT: 'Hợp đồng cho thuê',
} as const;

export type RecordType = keyof typeof RECORD_TYPES;

/** Số chữ số của phần thứ tự trong mã. */
export const SEQUENCE_PADDING = 4;

/** Dựng mã hồ sơ giao dịch từ các thành phần — bản soi của `issue_record_code` trong CSDL. */
export function buildRecordCode(
  company: CompanyCode,
  type: RecordType,
  year: number,
  sequence: number,
): string {
  const seq = String(sequence).padStart(SEQUENCE_PADDING, '0');
  return `${company}-${type}-${year}-${seq}`;
}

const RECORD_CODE_PATTERN = /^(NVC|NVS|NVO|NVG)-([A-Z]{2,4})-(\d{4})-(\d{4,})$/;

export interface ParsedRecordCode {
  company: CompanyCode;
  type: RecordType;
  year: number;
  sequence: number;
}

/** Tách mã hồ sơ ngược lại thành các thành phần. Trả `null` nếu mã không đúng dạng. */
export function parseRecordCode(code: string): ParsedRecordCode | null {
  const m = RECORD_CODE_PATTERN.exec(code.trim().toUpperCase());
  if (!m) return null;
  const [, company, type, year, sequence] = m;
  if (!(type! in RECORD_TYPES)) return null;
  return {
    company: company as CompanyCode,
    type: type as RecordType,
    year: Number(year),
    sequence: Number(sequence),
  };
}

/** Danh mục dùng chung — dãy số phẳng, không pháp nhân, không đặt lại theo năm. */
export const CATALOG_TYPES = {
  KH: 'Khách hàng',
  NCC: 'Nhà cung cấp',
} as const;

export type CatalogType = keyof typeof CATALOG_TYPES;

/** Số chữ số của phần thứ tự trong mã danh mục. */
export const CATALOG_PADDING = 5;

/** Dựng mã danh mục — bản soi của `issue_catalog_code` trong CSDL. */
export function buildCatalogCode(type: CatalogType, sequence: number): string {
  return `${type}-${String(sequence).padStart(CATALOG_PADDING, '0')}`;
}

const CATALOG_CODE_PATTERN = /^([A-Z]{2,4})-(\d{5,})$/;

/** Tách mã danh mục. Trả `null` nếu mã không đúng dạng. */
export function parseCatalogCode(code: string): { type: CatalogType; sequence: number } | null {
  const m = CATALOG_CODE_PATTERN.exec(code.trim().toUpperCase());
  if (!m) return null;
  const [, type, sequence] = m;
  if (!(type! in CATALOG_TYPES)) return null;
  return { type: type as CatalogType, sequence: Number(sequence) };
}

/**
 * Mã vật tư — KHO-02: "mã nhóm – tên viết tắt – quy cách/kích thước".
 * Một vật tư CHỈ DÙNG MỘT MÃ DUY NHẤT để tránh trùng tên hoặc nhầm đơn vị tính.
 *
 * @example buildMaterialCode('THEP', 'ONG', 'D49x2.0') // "THEP-ONG-D49X2.0"
 */
export function buildMaterialCode(group: string, abbreviation: string, spec: string): string {
  return [group, abbreviation, spec]
    .map((part) =>
      part
        .normalize('NFD')
        // Bỏ dấu thanh và dấu phụ. Mã vật tư được in ra tem, đọc bằng máy quét và gõ tay ở
        // công trường — để "Thép Hộp" và "THEP HOP" thành hai mã khác nhau là đúng thứ
        // KHO-02 sinh ra để chặn.
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ''),
    )
    .filter(Boolean)
    .join('-');
}

/**
 * Mười nhóm vật tư khởi tạo. Thêm nhóm là thêm một dòng ở đây, không đổi mã vật tư đã có.
 */
export const MATERIAL_GROUPS = {
  THEP: 'Thép và kết cấu thép',
  XM: 'Xi măng, vữa, phụ gia',
  CATDA: 'Cát, đá, vật liệu san lấp',
  GACH: 'Gạch, ngói, tấm ốp',
  DIEN: 'Vật tư điện',
  NUOC: 'Vật tư cấp thoát nước',
  HOANTHIEN: 'Vật tư hoàn thiện',
  GIANGIAO: 'Giàn giáo và phụ kiện',
  CCDC: 'Công cụ dụng cụ',
  KHAC: 'Vật tư khác',
} as const;

export type MaterialGroup = keyof typeof MATERIAL_GROUPS;
