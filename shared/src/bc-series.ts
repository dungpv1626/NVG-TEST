/**
 * Chuỗi số liệu tài chính cho biểu đồ Dashboard / Tổng quan tài chính (BC).
 *
 * CSDL trả tổng theo NGÀY nghiệp vụ (`finance_daily`, migration 0140); mọi cách chia kỳ (tháng,
 * quý, năm) và mọi phép so kỳ trước nằm ở đây — MỘT chỗ, để Dashboard, tab Tổng quan tài chính
 * và tệp xuất ra cùng một con số.
 *
 * Ngày là chuỗi `yyyy-MM-dd` theo giờ Việt Nam (cùng quy ước `periodStartDate`), cộng trừ bằng
 * `Date.UTC` để không lệch múi giờ.
 *
 * Hai quy tắc chống số giả (CLAUDE.md 5.2):
 *  - Chuỗi thời gian BẮT ĐẦU từ kỳ có phát sinh đầu tiên — các tháng trước khi dùng hệ thống không
 *    vẽ thành cột 0.
 *  - So kỳ trước chỉ khi kỳ trước CÓ dữ liệu; không có thì trả `null` (giao diện nói «Chưa có kỳ
 *    trước để so sánh»), không trả +100 % hay +∞.
 */

import { periodStartDate, type DashboardPeriod } from './bc';
import { toMoney, type MoneyValue } from './format';

export const SERIES_BUCKETS = ['thang', 'quy', 'nam'] as const;
export type SeriesBucket = (typeof SERIES_BUCKETS)[number];

export const SERIES_BUCKET_LABELS: Readonly<Record<SeriesBucket, string>> = {
  thang: 'Tháng',
  quy: 'Quý',
  nam: 'Năm',
};

/** Số kỳ gần nhất hiện trên biểu đồ — đủ thấy xu hướng, không dồn cột tới mức không đọc được. */
export const SERIES_BUCKET_COUNT: Readonly<Record<SeriesBucket, number>> = {
  thang: 12,
  quy: 8,
  nam: 5,
};

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return [y, m, d];
}

function iso(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

/** Ngày đầu kỳ chứa `day`. */
export function bucketStart(day: string, bucket: SeriesBucket): string {
  const [y, m] = parts(day);
  if (bucket === 'thang') return iso(y, m, 1);
  if (bucket === 'quy') return iso(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
  return iso(y, 1, 1);
}

/** Dời đầu kỳ đi `n` kỳ (âm = lùi). */
export function shiftBucket(start: string, bucket: SeriesBucket, n: number): string {
  const [y, m] = parts(start);
  if (bucket === 'nam') return iso(y + n, 1, 1);
  return iso(y, m + n * (bucket === 'quy' ? 3 : 1), 1);
}

/** «T9/2026» · «Q3/2026» · «2026». */
export function bucketLabel(start: string, bucket: SeriesBucket): string {
  const [y, m] = parts(start);
  if (bucket === 'thang') return `T${m}/${y}`;
  if (bucket === 'quy') return `Q${Math.floor((m - 1) / 3) + 1}/${y}`;
  return String(y);
}

/** Ngày đầu của kỳ xa nhất cần tải để vẽ đủ `SERIES_BUCKET_COUNT` kỳ tới hôm nay. */
export function seriesFrom(today: string, bucket: SeriesBucket): string {
  return shiftBucket(bucketStart(today, bucket), bucket, -(SERIES_BUCKET_COUNT[bucket] - 1));
}

/** Một dòng `finance_daily` — tiền về dưới dạng chuỗi từ PostgREST. */
export interface FinanceDay {
  day: string;
  company_id: string;
  revenue_accepted: MoneyValue;
  rental_revenue: MoneyValue;
  contracts_signed: MoneyValue;
  collected: MoneyValue;
  paid_out: MoneyValue;
}

export interface FinanceTotals {
  /** Doanh thu = nghiệm thu với chủ đầu tư + tiền thuê giàn giáo đã tất toán. */
  revenue: bigint;
  contractsSigned: bigint;
  collected: bigint;
  paidOut: bigint;
  /** Dòng tiền ròng = đã thu − đã chi. */
  netCash: bigint;
  /** Số ngày có phát sinh — 0 nghĩa là khoảng này CHƯA CÓ dữ liệu, không phải «bằng 0». */
  activeDays: number;
}

function emptyTotals(): FinanceTotals {
  return {
    revenue: 0n,
    contractsSigned: 0n,
    collected: 0n,
    paidOut: 0n,
    netCash: 0n,
    activeDays: 0,
  };
}

function addDay(t: FinanceTotals, d: FinanceDay): void {
  t.revenue += toMoney(d.revenue_accepted) + toMoney(d.rental_revenue);
  t.contractsSigned += toMoney(d.contracts_signed);
  t.collected += toMoney(d.collected);
  t.paidOut += toMoney(d.paid_out);
  t.netCash = t.collected - t.paidOut;
  t.activeDays += 1;
}

/** Cộng các ngày trong `[from, to]` (bỏ trống = không chặn đầu đó). */
export function sumFinance(days: readonly FinanceDay[], from?: string, to?: string): FinanceTotals {
  const t = emptyTotals();
  for (const d of days) {
    if (from && d.day < from) continue;
    if (to && d.day > to) continue;
    addDay(t, d);
  }
  return t;
}

export interface FinanceBucketRow extends FinanceTotals {
  start: string;
  label: string;
}

/**
 * Gom theo kỳ, `SERIES_BUCKET_COUNT` kỳ gần nhất tới kỳ chứa `today`, BỎ các kỳ đầu chưa có
 * phát sinh. Kỳ trống nằm giữa hai kỳ có số thì giữ (đó là số 0 thật: hệ thống đã dùng mà kỳ đó
 * không phát sinh). Chưa có ngày nào → mảng rỗng.
 */
export function bucketFinance(
  days: readonly FinanceDay[],
  bucket: SeriesBucket,
  today: string,
): FinanceBucketRow[] {
  const last = bucketStart(today, bucket);
  const starts = Array.from({ length: SERIES_BUCKET_COUNT[bucket] }, (_, i) =>
    shiftBucket(last, bucket, i - (SERIES_BUCKET_COUNT[bucket] - 1)),
  );
  const rows: FinanceBucketRow[] = starts.map((start) => ({
    ...emptyTotals(),
    start,
    label: bucketLabel(start, bucket),
  }));
  const index = new Map(rows.map((r, i) => [r.start, i]));
  for (const d of days) {
    if (d.day > today) continue;
    const i = index.get(bucketStart(d.day, bucket));
    if (i !== undefined) addDay(rows[i]!, d);
  }
  const first = rows.findIndex((r) => r.activeDays > 0);
  return first === -1 ? [] : rows.slice(first);
}

export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * Kỳ đang chọn (đầu kỳ → hôm nay) và kỳ trước CÙNG ĐỘ DÀI (đầu kỳ trước → cùng số ngày), để so
 * «9 ngày đầu tháng này» với «9 ngày đầu tháng trước», không phải với cả tháng trước.
 * «Tất cả» không có kỳ trước → `previous` là `null`.
 */
export function comparisonRanges(
  period: DashboardPeriod,
  today: string,
): { current: PeriodRange; previous: PeriodRange | null } {
  const start = periodStartDate(period, `${today}T12:00:00+07:00`);
  if (!start) return { current: { from: '2000-01-01', to: today }, previous: null };
  const bucket: SeriesBucket =
    period === 'thang-nay' ? 'thang' : period === 'quy-nay' ? 'quy' : 'nam';
  const prevStart = shiftBucket(start, bucket, -1);
  const elapsed = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
  const [py, pm, pd] = parts(prevStart);
  let prevTo = iso(py, pm, pd + elapsed);
  // Ngày 0 của tháng đầu kỳ = ngày cuối kỳ trước: kỳ trước không tràn sang kỳ này.
  const [sy, sm] = parts(start);
  const prevEnd = iso(sy, sm, 0);
  if (prevTo > prevEnd) prevTo = prevEnd;
  return { current: { from: start, to: today }, previous: { from: prevStart, to: prevTo } };
}

/**
 * Phần trăm thay đổi so với kỳ trước. `null` khi kỳ trước chưa có dữ liệu hoặc bằng 0 — chia
 * cho 0 hay so với «trước khi dùng hệ thống» đều cho ra con số vô nghĩa.
 */
export function percentChange(
  current: bigint,
  previous: bigint,
  previousHasData: boolean,
): number | null {
  if (!previousHasData || previous === 0n) return null;
  const diff = Number(current - previous);
  const base = Math.abs(Number(previous));
  return (diff / base) * 100;
}

const COMPACT_UNITS: readonly [bigint, string][] = [
  [1_000_000_000n, 'tỷ'],
  [1_000_000n, 'triệu'],
  [1_000n, 'nghìn'],
];

/**
 * Tiền rút gọn cho trục biểu đồ và ô chỉ số: «2,6 tỷ», «850 triệu», «12 nghìn». Một chữ số thập
 * phân khi dưới 100 đơn vị, bỏ «,0». Dưới 1.000 đồng thì ghi đủ «950 đồng».
 */
export function formatMoneyCompact(value: MoneyValue | null | undefined): string {
  const v = toMoney(value);
  const sign = v < 0n ? '-' : '';
  const abs = v < 0n ? -v : v;
  for (const [unit, name] of COMPACT_UNITS) {
    if (abs >= unit) {
      const scaled = Number(abs) / Number(unit);
      const digits = scaled < 100 ? 1 : 0;
      const text = scaled.toLocaleString('vi-VN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      });
      return `${sign}${text} ${name}`;
    }
  }
  return `${sign}${abs.toString()} đồng`;
}

/**
 * Vạch trục tiền tròn theo bước 1–2–5 × 10ⁿ («0 · 500 triệu · 1 tỷ · 1,5 tỷ»), khoảng 4 khoảng.
 * Để thư viện tự chia thì ra «350 triệu, 700 triệu, 1,05 tỷ» — rút gọn xong thành «1,1 tỷ», một
 * con số không có trên dữ liệu. Có giá trị âm (dòng tiền ròng) thì trục kéo xuống dưới 0.
 */
export function niceMoneyTicks(values: readonly number[], intervals = 4): number[] {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min;
  if (span === 0) return [0];
  const raw = span / intervals;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= raw) ?? 10 * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}
