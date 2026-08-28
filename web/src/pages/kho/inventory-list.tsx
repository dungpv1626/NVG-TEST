/**
 * Tồn kho (KHO-02, KHO-08) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHO-08 yêu cầu "cảnh báo CHỦ ĐỘNG: vật tư sắp hết, hàng tồn lâu/chậm luân chuyển". Vì vậy
 * các dòng có cảnh báo được đẩy lên đầu — một cảnh báo nằm ở trang thứ ba của danh sách thì
 * không còn là chủ động.
 *
 * Mức tồn tối thiểu sửa được ngay tại dòng: nó là dữ liệu mô tả chứ không phải sổ kho, và
 * người biết mức nào là hợp lý chính là người đang nhìn con số tồn.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  STOCK_ALERT_LABELS,
  formatCurrency,
  formatDate,
  formatNumber,
  inventoryValue,
  stockAlerts,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useInventory, useUpdateInventorySettings, useWarehouses } from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { KhoNav } from './kho-nav';

const EM_DASH = '—';

export function InventoryListPage() {
  const canEdit = useCan('KHO', 'edit');
  const [warehouseId, setWarehouseId] = useState('');
  const [query, setQuery] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const { data: warehouses } = useWarehouses();
  const { data, isLoading, error } = useInventory(warehouseId || undefined);
  const updateSettings = useUpdateInventorySettings();

  const rows = useMemo(() => {
    const withAlerts = (data ?? []).map((row) => ({
      row,
      alerts: stockAlerts({
        quantityOnHand: row.quantity_on_hand,
        minQuantity: row.min_quantity,
        lastMovementAt: row.last_movement_at,
      }),
    }));

    const q = query.trim().toLowerCase();
    const filtered = withAlerts.filter(({ row, alerts }) => {
      if (onlyAlerts && alerts.length === 0) return false;
      if (!q) return true;
      return (
        row.material?.code.toLowerCase().includes(q) ||
        row.material?.name.toLowerCase().includes(q) ||
        (row.material?.specification?.toLowerCase().includes(q) ?? false)
      );
    });

    // Có cảnh báo lên trước — đó là toàn bộ điểm của KHO-08.
    return filtered.sort((a, b) => {
      if (a.alerts.length !== b.alerts.length) return b.alerts.length - a.alerts.length;
      return (a.row.material?.name ?? '').localeCompare(b.row.material?.name ?? '', 'vi');
    });
  }, [data, query, onlyAlerts]);

  // `average_cost` là `null` cho vai trò không được xem giá vốn (Mẫu D) — phân biệt với "0
  // đồng thật" bằng cách không hiện thẻ tổng giá trị luôn, thay vì cộng null thành 0 và hiện
  // một con số sai (Content Guidelines: không lấy im lặng làm "0").
  const seesInventoryValue = (data ?? []).some((r) => r.average_cost !== null);
  const totalValue = inventoryValue(
    (data ?? [])
      .filter((r) => r.average_cost !== null)
      .map((r) => ({ quantityOnHand: r.quantity_on_hand, averageCost: r.average_cost })),
  );
  const alertCount = rows.filter((r) => r.alerts.length > 0).length;

  async function saveMin(id: string, value: string) {
    setRowError(null);
    try {
      await updateSettings.mutateAsync({
        id,
        changes: { min_quantity: value.trim() === '' ? null : value.trim() },
      });
    } catch (e) {
      setRowError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Tồn kho"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Tồn kho' }]}
        description="Sổ kho chỉ đổi qua phiếu nhập, xuất, điều chuyển hoặc điều chỉnh kiểm kê."
      />

      {rowError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {rowError}
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Kho">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
          >
            <option value="">Tất cả kho</option>
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tìm vật tư" className="lg:col-span-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã, tên hoặc quy cách…"
          />
        </Field>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={onlyAlerts}
            onChange={(e) => setOnlyAlerts(e.target.checked)}
            className="size-4"
          />
          <span>Chỉ hiện dòng có cảnh báo{alertCount > 0 ? ` (${alertCount})` : ''}</span>
        </label>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : rows.length === 0 ? (
        <EmptyState message="Chưa có dòng tồn nào khớp điều kiện. Tồn kho hình thành từ phiếu nhập — không nhập số tồn ban đầu bằng tay." />
      ) : (
        <>
          <p className="mb-2 text-fg-muted">
            {rows.length} dòng tồn
            {seesInventoryValue && ` · Giá trị ước tính ${formatCurrency(totalValue)}`}
            <span className="block text-xs text-fg-subtle">
              {seesInventoryValue
                ? 'Giá trị tính theo đơn giá bình quân khi nhập — con số tham khảo, chưa phải giá vốn để hạch toán.'
                : 'Giá vốn tồn kho chỉ hiện cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.'}
            </span>
          </p>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[52rem] text-left">
              <thead className="border-b border-border text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Mã vật tư
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Tên hàng
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Kho
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Tồn
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Tồn tối thiểu
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Phát sinh cuối
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Cảnh báo
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, alerts }) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.material?.code ?? EM_DASH}</td>
                    <td className="px-4 py-2">
                      {row.material?.name ?? EM_DASH}
                      {row.material?.specification && (
                        <span className="block text-xs text-fg-subtle">
                          {row.material.specification}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{row.warehouse?.name ?? EM_DASH}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatNumber(Number(row.quantity_on_hand))} {row.material?.unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit ? (
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          defaultValue={row.min_quantity ?? ''}
                          aria-label={`Tồn tối thiểu của ${row.material?.name ?? 'vật tư'}`}
                          className="h-8 w-24 rounded-sm border border-border-strong bg-surface px-2 text-right"
                          onBlur={(e) => void saveMin(row.id, e.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums">
                          {row.min_quantity ? formatNumber(Number(row.min_quantity)) : EM_DASH}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-fg-subtle">
                      {row.last_movement_at ? formatDate(row.last_movement_at) : 'Chưa có'}
                    </td>
                    <td className="px-4 py-2">
                      {alerts.length === 0 ? (
                        <span className="text-fg-subtle">{EM_DASH}</span>
                      ) : (
                        alerts.map((alert) => (
                          <span
                            key={alert}
                            className="flex items-center gap-1 whitespace-nowrap text-status-overdue"
                          >
                            <AlertTriangle className="size-4 shrink-0" aria-hidden />
                            {STOCK_ALERT_LABELS[alert]}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
