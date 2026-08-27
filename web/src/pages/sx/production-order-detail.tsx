/**
 * Chi tiết Lệnh sản xuất — "Hồ sơ 360°" (Webapp Flow 4.3), SX-01.
 *
 * ⚠️ Cần xác nhận thêm (xem `production-order-list.tsx`). Trạng thái đổi bằng một ô chọn
 * trực tiếp — chưa có luồng chuyển bước ràng buộc vì chưa biết quy trình thật của Xưởng.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  PRODUCTION_ORDER_STATUSES,
  PRODUCTION_ORDER_STATUS_META,
  formatDate,
  formatDateTime,
  productionOrderDisplayStatus,
  type ProductionOrderStatus,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useMaterials } from '@/hooks/use-warehouse';
import {
  useAddMaterialConsumption,
  useMaterialConsumption,
  useProductionOrder,
  useUpdateProductionOrder,
} from '@/hooks/use-sx';
import { useCan } from '@/lib/auth';

const EM_DASH = '—';

export function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('SX', 'edit');

  const { data: order, isLoading, error } = useProductionOrder(id);
  const { data: consumption } = useMaterialConsumption(id);
  const { data: materials } = useMaterials();
  const updateOrder = useUpdateProductionOrder();
  const addConsumption = useAddMaterialConsumption();

  const [materialId, setMaterialId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [consumptionError, setConsumptionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!order) {
    return (
      <RecordNotFound
        entity="lệnh sản xuất"
        listPath="/sx/lenh-san-xuat"
        listLabel="Quay lại danh sách lệnh sản xuất"
      />
    );
  }

  async function submitConsumption(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsumptionError(null);

    if (!materialId || Number(quantity) <= 0) {
      setConsumptionError('Chọn nguyên liệu và số lượng lớn hơn 0.');
      return;
    }

    try {
      await addConsumption.mutateAsync({
        productionOrderId: order!.id,
        materialId,
        quantity: Number(quantity),
        note,
      });
      setMaterialId('');
      setQuantity('');
      setNote('');
    } catch (e) {
      setConsumptionError(toUserMessage(e, 'create'));
    }
  }

  return (
    <EntityDetail
      breadcrumbs={[
        { label: 'Sản xuất & Cho thuê' },
        { label: 'Lệnh sản xuất', to: '/sx/lenh-san-xuat' },
        { label: order.code },
      ]}
      title={order.product}
      code={order.code}
      status={productionOrderDisplayStatus(order.status)}
      responsiblePerson={null}
      deadline={order.planned_end_date}
      tabs={[
        {
          id: 'tong-quan',
          label: 'Tổng quan',
          content: (
            <div className="space-y-6">
              <DetailFields
                fields={[
                  {
                    label: 'Số lượng',
                    value: `${order.quantity}${order.unit ? ` ${order.unit}` : ''}`,
                  },
                  {
                    label: 'Ngày dự kiến bắt đầu',
                    value: order.planned_start_date
                      ? formatDate(order.planned_start_date)
                      : EM_DASH,
                  },
                  {
                    label: 'Ngày dự kiến hoàn thành',
                    value: order.planned_end_date ? formatDate(order.planned_end_date) : EM_DASH,
                  },
                  { label: 'Ghi chú', value: order.notes ?? EM_DASH },
                ]}
              />

              {canEdit && (
                <Field label="Trạng thái">
                  <select
                    value={order.status}
                    onChange={(e) =>
                      void updateOrder.mutateAsync({
                        id: order.id,
                        changes: { status: e.target.value as ProductionOrderStatus },
                      })
                    }
                    className="h-9 w-full max-w-xs rounded-sm border border-border-strong bg-surface px-3"
                  >
                    {PRODUCTION_ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PRODUCTION_ORDER_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div>
                <h2 className="mb-2 text-sm font-semibold">Tiêu hao nguyên liệu</h2>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="bg-surface-sunken">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Nguyên liệu</th>
                        <th className="px-3 py-2 text-right font-medium">Số lượng</th>
                        <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(consumption ?? []).map((c) => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            {c.material?.code} — {c.material?.name}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {c.quantity} {c.material?.unit}
                          </td>
                          <td className="px-3 py-2">{c.note ?? EM_DASH}</td>
                        </tr>
                      ))}
                      {(consumption ?? []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-fg-subtle">
                            Chưa ghi tiêu hao nguyên liệu nào.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {canEdit && (
                  <form
                    onSubmit={(e) => void submitConsumption(e)}
                    className="mt-3 grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    {consumptionError && (
                      <p
                        role="alert"
                        className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue sm:col-span-2 lg:col-span-4"
                      >
                        {consumptionError}
                      </p>
                    )}
                    <Field label="Nguyên liệu" className="lg:col-span-2">
                      <select
                        value={materialId}
                        onChange={(e) => setMaterialId(e.target.value)}
                        className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                      >
                        <option value="">Chọn nguyên liệu</option>
                        {(materials ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} — {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Số lượng">
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </Field>
                    <Field label="Ghi chú">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} />
                    </Field>
                    <div className="flex items-end lg:col-span-4">
                      <Button type="submit" variant="secondary" disabled={addConsumption.isPending}>
                        Ghi tiêu hao
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ),
        },
      ]}
      historyContent={
        <DetailFields fields={[{ label: 'Lập lệnh', value: formatDateTime(order.created_at) }]} />
      }
    />
  );
}
