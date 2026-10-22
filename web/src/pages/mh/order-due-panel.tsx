/**
 * Đơn đặt hàng sắp trễ / trễ hẹn giao — Đợt 4, 4C. Khối đầu trang Đơn đặt hàng.
 *
 * Quá hẹn và đến hạn hôm nay luôn hiện; «sắp tới hạn» chỉ hiện khi NVG đã đặt số ngày báo trước
 * (`mh.order_due_soon_days` — để trống thì nói rõ, không tự đặt). Chỉ huy trưởng chỉ thấy đơn về
 * công trình được giao (CSDL lọc — `purchase_order_due_list`). Cùng danh sách này đi vào thông báo
 * đêm cho Mua hàng và chỉ huy trưởng.
 */

import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '@nvg/shared';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { Skeleton } from '@/components/ui/states';
import { useOrderDueList, type OrderDueRow } from '@/hooks/use-purchase-pool';
import { useCompanyScope } from '@/lib/company-scope';

function dueText(r: OrderDueRow): string {
  if (r.due_state === 'qua_han') return `Quá hẹn giao ${-r.days_left} ngày`;
  if (r.due_state === 'hom_nay') return 'Đến hạn giao hôm nay';
  return `Còn ${r.days_left} ngày tới hẹn giao`;
}

export function OrderDuePanel() {
  const { data, isLoading, error } = useOrderDueList();
  const scope = useCompanyScope();

  if (isLoading) return <Skeleton className="mb-4 h-20 w-full" />;
  if (error) return null;

  const rows = (data ?? []).filter(
    (r) => scope.isAggregate || !scope.companyId || r.company_id === scope.companyId,
  );
  const soonSetting = data?.[0]?.soon_days_setting ?? null;

  return (
    <section
      aria-labelledby="don-sap-tre"
      className={`mb-4 rounded-lg border bg-surface p-4 ${
        rows.some((r) => r.due_state === 'qua_han') ? 'border-status-overdue' : 'border-border'
      }`}
    >
      <h2 id="don-sap-tre" className="font-semibold">
        Đơn hàng đến hạn giao
        {rows.length > 0 ? ` (${rows.length})` : ''}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-fg-subtle">
          Không có đơn hàng nào quá hẹn hoặc đến hạn giao hôm nay.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.order_id}>
              <Link
                to={`/mh/don-hang/${r.order_id}`}
                className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-sunken px-3 py-2 hover:bg-surface-hover"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-brand">
                    {r.order_code ?? 'Đơn đặt hàng'}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    {r.supplier_name}
                    {r.site_code ? ` · ${r.site_code} — ${r.site_name}` : ' · Không gắn công trình'}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-right">
                  <span className="text-xs text-fg-subtle tabular-nums">
                    Hẹn {formatDate(r.promised_date)} · {formatCurrency(r.total_value)}
                  </span>
                  {r.due_state === 'qua_han' ? <StatusLozenge status="overdue" /> : null}
                  <span
                    className={
                      r.due_state === 'qua_han'
                        ? 'text-sm font-semibold text-status-overdue'
                        : 'text-sm font-semibold'
                    }
                  >
                    {dueText(r)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* Tham số đi kèm từng dòng của hàm — danh sách rỗng thì không biết, nên không nói. */}
      {rows.length > 0 && (
        <p className="mt-2 text-xs text-fg-subtle">
          {soonSetting == null
            ? 'Chưa cấu hình số ngày báo trước hẹn giao — hệ thống chỉ báo khi đến hạn hôm nay hoặc đã quá hẹn.'
            : `Báo trước ${soonSetting} ngày tới hẹn giao.`}
        </p>
      )}
    </section>
  );
}
