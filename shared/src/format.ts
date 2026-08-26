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
 * Hình dạng một giá trị tiền khi đi qua các tầng.
 *
 * Cùng một cột `bigint` về tới nơi sử dụng dưới ba dạng khác nhau: Drizzle trả `bigint`,
 * PostgREST trả SỐ JSON, biểu mẫu giữ chuỗi người dùng gõ. Khai báo một kiểu duy nhất ở đây
 * để mỗi hook không tự đoán một kiểu rồi lệch nhau — đúng thứ đã làm hỏng lượt build đầu.
 *
 * Giá trị tiền của NVG (đơn vị đồng, lớn nhất cỡ trăm tỷ) còn rất xa `Number.MAX_SAFE_INTEGER`
 * nên dạng số không mất chính xác.
 */
export type MoneyValue = bigint | string | number;

/**
 * Đưa mọi dạng `MoneyValue` về `bigint` đồng để CỘNG TRỪ được.
 *
 * Tồn tại vì tiền đến từ ba nguồn có ba kiểu khác nhau (xem `MoneyValue`), mà cộng một chuỗi
 * với một số trong JavaScript thì ra chuỗi nối chứ không ra tổng — sai lặng lẽ, không báo lỗi.
 * Mọi phép cộng tiền trong hệ thống phải đi qua đây, không tự `Number(...)` tại chỗ.
 *
 * `null`/rỗng quy về `0n`: hồ sơ chưa điền giá trị thì đóng góp 0 vào tổng, không phải lỗi.
 */
export function toMoney(value: MoneyValue | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') return value;
  // Chuỗi từ PostgREST và số từ biểu mẫu đều có thể tới đây; `BigInt()` từ chối số thập
  // phân, mà tiền VNĐ thì không có số thập phân nên cắt phần đó là đúng chứ không mất mát.
  return BigInt(String(value).split('.')[0] || '0');
}

/** Tổng một dãy giá trị tiền, bỏ qua ô trống. */
export function sumMoney(values: readonly (MoneyValue | null | undefined)[]): bigint {
  return values.reduce<bigint>((total, v) => total + toMoney(v), 0n);
}

/**
 * Tiền tệ VNĐ — Content Guidelines 4.3 + Backend Schema 1.4.
 *
 * Giá trị lưu trong CSDL là `bigint`, đơn vị ĐỒNG, KHÔNG có phần thập phân
 * (VNĐ không có đơn vị nhỏ hơn đồng trong thực tế). Nhận mọi dạng của `MoneyValue`.
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
 * Diễn đạt THỜI GIAN ĐÃ CHỜ kể từ một mốc trong quá khứ.
 *
 * Khác hẳn `formatDeadline`, vốn nói về một mốc TƯƠNG LAI. Dùng nhầm hàm kia cho thời điểm
 * gửi phê duyệt sẽ đọc ra "Đến hạn hôm nay" cho một hồ sơ vừa gửi xong — sai nghĩa hoàn
 * toàn. Hộp thư Phê duyệt xếp theo thời gian chờ (Webapp Flow 4.6) nên cần đúng hàm này.
 */
export function formatWaiting(since: DateInput | null | undefined, now: DateInput = new Date()): string {
  if (!since) return '';
  const days = daysUntil(since, now);
  if (days === null) return '';
  const waited = -days;
  if (waited <= 0) return 'Gửi hôm nay';
  if (waited === 1) return 'Chờ 1 ngày';
  return `Chờ ${waited} ngày`;
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

/**
 * Ngày cho ô `<input type="date">` (`yyyy-MM-dd`), quy về MÚI GIỜ NGHIỆP VỤ.
 *
 * Không dùng `toISOString().slice(0, 10)`: hàm đó cho ra ngày theo UTC, nên mọi thời điểm
 * trước 07:00 giờ Việt Nam sẽ hiện lùi một ngày.
 */
export function toNvgDateInput(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  // `en-CA` cho ra đúng dạng `yyyy-MM-dd` mà thẻ input yêu cầu.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NVG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Giờ cho ô `<input type="time">` / phần giờ của `datetime-local` (`HH:mm`), giờ Việt Nam. */
export function toNvgTimeInput(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: NVG_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Chiều ngược lại: chuỗi `datetime-local` (`yyyy-MM-ddTHH:mm`) người dùng nhập → ISO.
 *
 * `new Date('2026-08-25T14:30')` diễn giải theo múi giờ CỦA MÁY, không phải giờ Việt Nam.
 * Trên máy đặt múi giờ khác, lịch hẹn lưu xuống sẽ lệch đúng bằng chênh lệch múi giờ — sai
 * âm thầm, chỉ lộ ra khi người khác mở lên xem.
 *
 * Cách tính: dựng mốc thời gian giả định là UTC, rồi trừ đi độ lệch thật của múi giờ nghiệp
 * vụ TẠI CHÍNH thời điểm đó (không hằng số hoá +07:00 — cách này vẫn đúng nếu quy định múi
 * giờ thay đổi).
 */
export function fromNvgInput(localValue: string | null | undefined): string | null {
  if (!localValue) return null;

  // Kiểm tra dạng TRƯỚC khi dựng Date: bộ phân tích của JavaScript rất dễ dãi và trả về
  // một mốc thời gian có thật cho chuỗi rác (`new Date('rác:00Z')` ra 31/12/1999), thay vì
  // Invalid Date — nghĩa là dữ liệu hỏng vẫn lưu xuống được mà không ai biết.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) return null;

  const asUtc = new Date(`${localValue}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;

  const offsetMs = asUtc.getTime() - Date.parse(`${nvgWallClock(asUtc)}Z`);
  return new Date(asUtc.getTime() + offsetMs).toISOString();
}

/** Giờ treo tường ở múi giờ nghiệp vụ, dạng `yyyy-MM-ddTHH:mm:ss` — dùng để đo độ lệch. */
function nvgWallClock(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NVG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';

  // `hour` có thể ra "24" ở đúng nửa đêm với hourCycle mặc định của một số môi trường.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}
