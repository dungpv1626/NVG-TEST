/**
 * Quy tắc mã hoá hồ sơ.
 *
 * ⚠️ GIẢ ĐỊNH — PRD Mục 10 ghi rõ: "NVG hiện chưa có bộ mã thống nhất, sẽ tự tạo mẫu
 * trước khi go-live từng giai đoạn và điều chỉnh sau". Bộ mã dưới đây là ĐỀ XUẤT của đội
 * triển khai để bắt đầu; NVG xác nhận hoặc thay thế sau. Đổi bộ mã chỉ cần sửa file này.
 *
 * Dạng chuẩn: {PHÁP NHÂN}-{LOẠI}-{NĂM}-{SỐ THỨ TỰ 4 CHỮ SỐ}
 *   NVC-DA-2026-0001   Gói thầu số 1 năm 2026 của NVC
 *   NVO-HD-2026-0042   Hợp đồng số 42 năm 2026 của NVO
 *
 * Vì sao có pháp nhân trong mã: NEN-01 yêu cầu tách bạch dữ liệu theo pháp nhân — nhìn mã
 * là biết ngay hồ sơ thuộc công ty nào mà không cần mở hồ sơ.
 */

import type { CompanyCode } from './modules';

/** Loại hồ sơ có mã riêng. Mỗi loại một tiền tố ngắn, không trùng nhau. */
export const RECORD_TYPES = {
  KH: 'Khách hàng',
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
  NCC: 'Nhà cung cấp',
  PN: 'Phiếu nhập kho',
  PX: 'Phiếu xuất kho',
  DC: 'Phiếu điều chuyển',
  KK: 'Phiếu kiểm kê',
  DNTT: 'Đề nghị thanh toán',
  TU: 'Tạm ứng',
  NS: 'Hồ sơ nhân sự',
  LSX: 'Lệnh sản xuất',
  HDT: 'Hợp đồng cho thuê',
} as const;

export type RecordType = keyof typeof RECORD_TYPES;

/** Số chữ số của phần thứ tự trong mã. */
export const SEQUENCE_PADDING = 4;

/**
 * Sinh mã hồ sơ.
 *
 * Lưu ý: `sequence` phải do CSDL cấp (sequence/counter theo pháp nhân + loại + năm) để
 * không trùng khi nhiều người tạo cùng lúc — KHÔNG tự đếm ở phía trình duyệt.
 */
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
 * Nhóm vật tư gợi ý ban đầu.
 * ⚠️ GIẢ ĐỊNH — chờ danh mục vật tư thật của NVG (PRD Mục 10).
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
