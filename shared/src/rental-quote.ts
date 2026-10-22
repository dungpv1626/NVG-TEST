/**
 * Báo giá thuê giàn giáo (Đợt 5 — 5D, PRD CRM-11): tự kiểm tồn + tự tính tiền theo đơn giá thuê
 * đã cấu hình (`sx.rental_daily_rate` phạm vi sản phẩm).
 *
 * Hai hàng rào (CLAUDE.md 5.2): mã chưa cấu hình đơn giá thì dòng đó KHÔNG có thành tiền và tổng
 * cũng không có (không cộng thiếu rồi hiện như đủ); máy không tự đặt giá. Thiếu hàng thì báo số
 * thiếu, không tự giảm số lượng khách hỏi.
 */

export interface RentalQuoteLineInput {
  materialId: string;
  quantity: number;
  /** Tồn kho cho thuê được (mới + còn dùng được). */
  available: number;
  /** Đơn giá thuê / ngày / đơn vị, đồng; `null` = chưa cấu hình. */
  dailyRate: number | null;
}

export interface RentalQuoteLine extends RentalQuoteLineInput {
  /** Thành tiền = số lượng × đơn giá × số ngày; `null` khi chưa có đơn giá. */
  amount: number | null;
  /** Số lượng thiếu so với tồn (0 = đủ hàng). */
  shortage: number;
}

export interface RentalQuote {
  lines: RentalQuoteLine[];
  days: number;
  /** Tổng tiền thuê — `null` khi còn mã chưa cấu hình đơn giá. */
  total: number | null;
  missingRates: number;
  shortLines: number;
}

export function quoteRental(lines: readonly RentalQuoteLineInput[], days: number): RentalQuote {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  const out: RentalQuoteLine[] = lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      ...l,
      amount: l.dailyRate === null ? null : Math.round(l.quantity * l.dailyRate * safeDays),
      shortage: Math.max(0, l.quantity - Math.max(0, l.available)),
    }));
  const missingRates = out.filter((l) => l.amount === null).length;
  const total =
    out.length === 0 || missingRates > 0 || safeDays === 0
      ? null
      : out.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  return {
    lines: out,
    days: safeDays,
    total,
    missingRates,
    shortLines: out.filter((l) => l.shortage > 0).length,
  };
}
