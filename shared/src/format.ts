/**
 * Định dạng số, ngày tháng, tiền tệ — Content Guidelines Mục 4.3.
 *
 * Mọi nơi hiển thị dữ liệu cho người dùng PHẢI dùng các hàm ở đây,
 * không tự gọi `toLocaleString` rải rác — để định dạng nhất quán toàn hệ thống
 * (Content Guidelines 2.1: "một khái niệm luôn dùng đúng một cách").
 */

/** Múi giờ nghiệp vụ của NVG. Mọi ngày/giờ hiển thị quy về múi giờ này. */
export const NVG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VI_LOCALE = 'vi-VN';

export type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Ngày: `dd/mm/yyyy` — ví dụ `23/08/2026`.
 * Trả về chuỗi rỗng nếu giá trị không hợp lệ (không hiển thị "Invalid Date" cho người dùng).
 */
export function formatDate(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat(VI_LOCALE, {
    timeZone: NVG_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Ngày kèm giờ: `dd/mm/yyyy — hh:mm` (24 giờ) — ví dụ `23/08/2026 — 14:30`.
 * Dấu phân cách là gạch ngang dài (—) đúng theo Content Guidelines 4.3.
 */
export function formatDateTime(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const d = toDate(value);
  if (!d) return '';
  const time = new Intl.DateTimeFormat(VI_LOCALE, {
    timeZone: NVG_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatDate(d)} — ${time}`;
}

/**
 * Số nguyên/thập phân: dấu chấm phân cách hàng nghìn, dấu phẩy thập phân.
 * Ví dụ `1234567.89` → `1.234.567,89`.
 */
export function formatNumber(
  value: number | bigint | string | null | undefined,
  maximumFractionDigits = 2,
): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n === 'number' && !Number.isFinite(n)) return '';
  return new Intl.NumberFormat(VI_LOCALE, {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(n as number | bigint);
}

/**
 * Tiền tệ VNĐ — Content Guidelines 4.3 + Backend Schema 1.4.
 *
 * Giá trị lưu trong CSDL là `bigint`, đơn vị ĐỒNG, KHÔNG có phần thập phân
 * (VNĐ không có đơn vị nhỏ hơn đồng trong thực tế). Drizzle trả `bigint` về dạng
 * chuỗi nên hàm này nhận cả `string`.
 *
 * @example formatCurrency(125_000_000n) // "125.000.000 đồng"
 * @example formatCurrency(125_000_000n, { symbol: true }) // "125.000.000 ₫"
 */
export function formatCurrency(
  value: number | bigint | string | null | undefined,
  options: { symbol?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = typeof value === 'string' ? BigInt(value.split('.')[0] ?? '0') : value;
  const rounded = typeof raw === 'bigint' ? raw : Math.round(raw);
  const formatted = new Intl.NumberFormat(VI_LOCALE, { maximumFractionDigits: 0 }).format(rounded);
  return options.symbol ? `${formatted} ₫` : `${formatted} đồng`;
}

/** Phần trăm: số + `%`, KHÔNG khoảng trắng trước `%`. Ví dụ `8%`. */
export function formatPercent(
  value: number | null | undefined,
  maximumFractionDigits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return `${formatNumber(value, maximumFractionDigits)}%`;
}

/**
 * Số điện thoại: nhóm 3-3-4 hoặc 4-3-3 tùy đầu số. Ví dụ `090 123 4567`.
 * Giữ nguyên đầu vào nếu không nhận dạng được — không tự bịa định dạng.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return value;
}

/**
 * Số ngày còn lại tới một mốc (âm = đã quá hạn), tính theo ngày lịch ở múi giờ NVG.
 * Dùng cho cảnh báo NEN-04 và cột "thời hạn" trên mọi màn hình Danh sách.
 */
export function daysUntil(deadline: DateInput, now: DateInput = new Date()): number | null {
  const end = toDate(deadline);
  const start = toDate(now);
  if (!end || !start) return null;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: NVG_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const endUtc = Date.parse(`${dayKey(end)}T00:00:00Z`);
  const startUtc = Date.parse(`${dayKey(start)}T00:00:00Z`);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

/**
 * Diễn đạt thời hạn bằng tiếng Việt, giọng bình tĩnh theo Content Guidelines 2.3
 * ("nêu sự việc và thời hạn, không gây hoảng").
 */
export function formatDeadline(
  deadline: DateInput | null | undefined,
  now: DateInput = new Date(),
): string {
  if (!deadline) return '';
  const days = daysUntil(deadline, now);
  if (days === null) return '';
  if (days === 0) return 'Đến hạn hôm nay';
  if (days === 1) return 'Còn 1 ngày';
  if (days > 1) return `Còn ${days} ngày`;
  if (days === -1) return 'Quá hạn 1 ngày';
  return `Quá hạn ${Math.abs(days)} ngày`;
}
