/**
 * Dòng tiền 4–8 tuần (Đợt 3 — 3C): chia các khoản tiền dự kiến theo tuần.
 *
 * Đầu vào là từng khoản do `cash_flow_forecast_items` (0197) trả — số có thật, kèm ngày. Hàm này
 * chỉ cộng; không đoán khoản nào, không tự dựng số dư:
 *   · Số dư đầu kỳ chỉ có khi Tài chính đã nhập (`opening`). Thiếu số dư của dù một pháp nhân
 *     trong phạm vi đang xem thì KHÔNG tính số dư cuối tuần — chỉ còn thu, chi, chênh lệch.
 *   · Số dư hôm nay = số dư đầu kỳ + đã thu − đã chi từ ngày nhập số dư.
 *   · Khoản đã quá hạn (ngày trước tuần này) dồn vào tuần này: tiền chưa thu / chưa chi vẫn còn đó.
 *   · Khoản chưa có ngày không vào tuần nào — đếm riêng để người xem biết còn thiếu ngày.
 *   · Tuần «thiếu tiền» = số dư cuối tuần âm. Chưa có số dư thì báo tuần chi vượt thu.
 */

export type CashForecastKind =
  'opening' | 'da_thu' | 'da_chi' | 'thu_cong_no' | 'thu_dot' | 'chi_de_nghi' | 'chi_cong_no';

export interface CashForecastItem {
  kind: CashForecastKind;
  company_id: string;
  item_date: string | null;
  label: string;
  amount: number | string | bigint;
  ref_type?: string | null;
  ref_id?: string | null;
}

export interface CashForecastWeek {
  index: number;
  start: string;
  end: string;
  inflow: bigint;
  outflow: bigint;
  net: bigint;
  /** Số dư cuối tuần; `null` khi chưa có số dư đầu kỳ của mọi pháp nhân đang xem. */
  closing: bigint | null;
  /** Số dư cuối tuần âm (có số dư), hoặc chi vượt thu (chưa có số dư). */
  shortage: boolean;
  items: CashForecastItem[];
}

export interface CashForecast {
  /** Số dư hôm nay (đầu kỳ + đã thu − đã chi); `null` khi thiếu số dư đầu kỳ. */
  openingToday: bigint | null;
  /** Pháp nhân có khoản trong phạm vi nhưng chưa nhập số dư đầu kỳ. */
  companiesWithoutOpening: string[];
  openingDates: string[];
  weeks: CashForecastWeek[];
  undatedInflow: bigint;
  undatedOutflow: bigint;
  undatedCount: number;
}

const INFLOW: ReadonlySet<CashForecastKind> = new Set(['thu_cong_no', 'thu_dot']);
const OUTFLOW: ReadonlySet<CashForecastKind> = new Set(['chi_de_nghi', 'chi_cong_no']);

function toBig(v: number | string | bigint): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.round(v));
  return BigInt(v.trim() === '' ? '0' : v.split('.')[0]!);
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Thứ Hai của tuần chứa `today` (`yyyy-mm-dd`). */
export function weekStartOf(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Chủ nhật
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return iso(d);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

export function buildCashForecast(
  items: readonly CashForecastItem[],
  options: { today: string; weeks: number },
): CashForecast {
  const first = weekStartOf(options.today);
  const weeks: CashForecastWeek[] = Array.from({ length: options.weeks }, (_, i) => ({
    index: i,
    start: addDays(first, i * 7),
    end: addDays(first, i * 7 + 6),
    inflow: 0n,
    outflow: 0n,
    net: 0n,
    closing: null,
    shortage: false,
    items: [],
  }));
  const horizonEnd = weeks[weeks.length - 1]?.end ?? first;

  const openings = items.filter((i) => i.kind === 'opening');
  const openingCompanies = new Set(openings.map((i) => i.company_id));
  const allCompanies = new Set(items.map((i) => i.company_id));
  const companiesWithoutOpening = [...allCompanies].filter((c) => !openingCompanies.has(c)).sort();

  let openingToday: bigint | null = null;
  if (openings.length > 0 && companiesWithoutOpening.length === 0) {
    openingToday = 0n;
    for (const i of items) {
      if (i.kind === 'opening' || i.kind === 'da_thu') openingToday += toBig(i.amount);
      else if (i.kind === 'da_chi') openingToday -= toBig(i.amount);
    }
  }

  let undatedInflow = 0n;
  let undatedOutflow = 0n;
  let undatedCount = 0;
  for (const item of items) {
    const isIn = INFLOW.has(item.kind);
    const isOut = OUTFLOW.has(item.kind);
    if (!isIn && !isOut) continue;
    const amount = toBig(item.amount);
    if (!item.item_date) {
      undatedCount += 1;
      if (isIn) undatedInflow += amount;
      else undatedOutflow += amount;
      continue;
    }
    if (item.item_date > horizonEnd) continue;
    const week =
      item.item_date < first
        ? weeks[0]
        : weeks.find((w) => item.item_date! >= w.start && item.item_date! <= w.end);
    if (!week) continue;
    if (isIn) week.inflow += amount;
    else week.outflow += amount;
    week.items.push(item);
  }

  let running = openingToday;
  for (const w of weeks) {
    w.net = w.inflow - w.outflow;
    if (running !== null) {
      running += w.net;
      w.closing = running;
      w.shortage = running < 0n;
    } else {
      w.shortage = w.net < 0n;
    }
  }

  return {
    openingToday,
    companiesWithoutOpening,
    openingDates: openings.map((o) => o.item_date ?? '').filter(Boolean),
    weeks,
    undatedInflow,
    undatedOutflow,
    undatedCount,
  };
}
