/**
 * Chi tiết Đơn đặt hàng — "Hồ sơ 360°" (Webapp Flow 4.3 và 3.5).
 *
 * Tab Chứng từ tồn tại vì MH-08: bộ chứng từ (đơn hàng, báo giá đã chọn, phiếu giao hàng,
 * hóa đơn, biên bản) chuyển sang Kế toán để thanh toán — KHÔNG NHẬP LẠI. Tab này là chỗ Kế
 * toán mở ra và thấy đủ, thay vì phải hỏi lại Mua hàng qua Zalo (vướng mắc khảo sát #4).
 *
 * Ở giai đoạn này việc bàn giao là một thông báo dẫn thẳng tới đây; đề nghị thanh toán sinh
 * ra từ bộ chứng từ này thuộc Module KT (KT-01), làm ở bước sau.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PURCHASE_ORDER_STAGE_META, formatCurrency, formatDate, formatDateTime } from '@nvg/shared';
import {
  DetailFields,
  EntityDetail,
  type RelatedGroup,
  RecordNotFound,
} from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { DateInput } from '@/components/ui/date-input';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import {
  useCancelPurchaseOrder,
  useDeliveries,
  usePurchaseOrder,
  usePurchaseRequest,
  useUpdatePurchaseOrder,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { DeliveryPanel } from './delivery-panel';

const EM_DASH = '—';

export function PurchaseOrderDetailPage() {
  const promptDialog = usePromptDialog();
  const { id } = useParams<{ id: string }>();
  const canWork = useCan('MH', 'edit');
  const canReceive = useCan('KHO', 'edit') || canWork;

  const { data, isLoading, error } = usePurchaseOrder(id);
  const { data: deliveries } = useDeliveries(id);
  const { data: request } = usePurchaseRequest(data?.purchase_request_id);
  const cancel = useCancelPurchaseOrder();
  const update = useUpdatePurchaseOrder();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="đơn đặt hàng"
        listPath="/mh/don-hang"
        listLabel="Quay lại danh sách đơn đặt hàng"
      />
    );
  }

  const order = data;
  const isOpenForDelivery = order.stage === 'da_dat' || order.stage === 'dang_giao';
  const isClosed = order.stage === 'da_giao_du' || order.stage === 'huy';

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  async function cancelOrder() {
    const reason = await promptDialog.ask({
      title: 'Hủy đơn đặt hàng?',
      label: 'Lý do hủy',
      confirmLabel: 'Hủy đơn đặt hàng',
      danger: true,
    });
    if (reason === null) return;
    void run(() => cancel.mutateAsync({ orderId: order.id, reason }));
  }

  const actions =
    canWork && !isClosed ? (
      <Button variant="secondary" onClick={cancelOrder}>
        Hủy đơn đặt hàng
      </Button>
    ) : undefined;

  const related: RelatedGroup[] = [
    {
      title: 'Mua hàng',
      records: [
        {
          label: 'Đề nghị mua',
          value: order.request?.code ?? 'Đề nghị mua',
          to: `/mh/de-nghi-mua/${order.purchase_request_id}`,
        },
        {
          label: 'Nhà cung cấp',
          value: order.supplier?.name ?? EM_DASH,
          to: `/mh/nha-cung-cap/${order.supplier_id}`,
        },
      ],
    },
  ];
  if (request?.site) {
    related.push({
      title: 'Thi công',
      records: [
        {
          label: 'Công trình',
          value: `${request.site.code} — ${request.site.name}`,
          to: `/tc/cong-trinh/${request.site.id}`,
        },
      ],
    });
  }

  return (
    <>
      {promptDialog.dialog}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Mua hàng – Vật tư' },
          { label: 'Đơn đặt hàng', to: '/mh/don-hang' },
          { label: order.code ?? 'Đơn đặt hàng' },
        ]}
        title={order.request?.title ?? 'Đơn đặt hàng'}
        code={order.code ?? EM_DASH}
        status={PURCHASE_ORDER_STAGE_META[order.stage].statusGroup}
        responsiblePerson={order.supplier?.name ?? null}
        deadline={order.promised_date}
        actions={actions}
        related={related}
        tabs={[
          {
            id: 'giao-nhan',
            label: 'Giao nhận',
            badge: deliveries?.length || undefined,
            content: (
              <DeliveryPanel
                orderId={order.id}
                canRecord={canReceive}
                isOpenForDelivery={isOpenForDelivery}
              />
            ),
          },
          {
            id: 'chung-tu',
            label: 'Chứng từ',
            content: (
              <div className="space-y-4">
                <p className="text-fg-muted">
                  Bộ chứng từ để Kế toán lập đề nghị thanh toán (MH-08). Kế toán mở thẳng từ đây,
                  không nhập lại số liệu đã có.
                </p>
                <ul className="space-y-2">
                  <li className="rounded-lg border border-border bg-surface px-4 py-3">
                    <p className="font-medium">Đơn đặt hàng {order.code ?? EM_DASH}</p>
                    <p className="text-fg-muted">
                      Giá trị {formatCurrency(order.total_value)}
                      {order.contract_number ? ` · Hợp đồng mua bán ${order.contract_number}` : ''}
                    </p>
                  </li>
                  <li className="rounded-lg border border-border bg-surface px-4 py-3">
                    <p className="font-medium">Báo giá đã chọn</p>
                    <p className="text-fg-muted">
                      {order.quotation_id ? (
                        <Link
                          className="text-brand underline-offset-4 hover:underline"
                          to={`/mh/de-nghi-mua/${order.purchase_request_id}?tab=bao-gia`}
                        >
                          Mở bảng so sánh báo giá của đề nghị mua
                        </Link>
                      ) : (
                        'Không có báo giá gắn kèm.'
                      )}
                    </p>
                  </li>
                  {(deliveries ?? []).map((delivery) => (
                    <li
                      key={delivery.id}
                      className="rounded-lg border border-border bg-surface px-4 py-3"
                    >
                      <p className="font-medium">
                        Phiếu giao nhận {delivery.code ?? EM_DASH} ·{' '}
                        {formatDate(delivery.delivered_date)}
                      </p>
                      <p className="text-fg-muted">
                        {delivery.delivery_note_number
                          ? `Phiếu giao hàng ${delivery.delivery_note_number}`
                          : 'Chưa ghi số phiếu giao hàng'}
                        {delivery.invoice_number ? ` · Hóa đơn ${delivery.invoice_number}` : ''}
                        {delivery.has_quality_certificate ? ' · Có CO/CQ' : ' · Chưa có CO/CQ'}
                      </p>
                    </li>
                  ))}
                </ul>
                {order.stage === 'da_giao_du' && (
                  <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
                    Đơn hàng đã nhận đủ. Kế toán đã nhận thông báo để lập đề nghị thanh toán.
                  </p>
                )}
              </div>
            ),
          },
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <>
                <DetailFields
                  fields={[
                    { label: 'Bước hiện tại', value: PURCHASE_ORDER_STAGE_META[order.stage].label },
                    {
                      label: 'Nhà cung cấp',
                      value: order.supplier ? (
                        <Link
                          to={`/mh/nha-cung-cap/${order.supplier_id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {order.supplier.name}
                        </Link>
                      ) : (
                        EM_DASH
                      ),
                    },
                    {
                      label: 'Ngày đặt hàng',
                      value: order.order_date ? formatDate(order.order_date) : EM_DASH,
                    },
                    {
                      label: 'Ngày giao cam kết',
                      value: order.promised_date ? formatDate(order.promised_date) : EM_DASH,
                    },
                    { label: 'Giá trị đơn hàng', value: formatCurrency(order.total_value) },
                    {
                      label: 'Còn treo ở phần đã cam kết',
                      value:
                        order.committed_to_budget && order.committed_to_budget !== '0'
                          ? formatCurrency(order.committed_to_budget)
                          : 'Không còn — đã chuyển hết sang chi phí thực tế',
                    },
                    { label: 'Số hợp đồng mua bán', value: order.contract_number ?? EM_DASH },
                    { label: 'Cập nhật lần cuối', value: formatDateTime(order.updated_at) },
                    { label: 'Lý do hủy', value: order.closed_reason ?? EM_DASH },
                  ]}
                />

                {canWork && !isClosed && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="block font-medium">Ngày giao cam kết</span>
                      <DateInput
                        defaultValue={order.promised_date ?? ''}
                        className="mt-1"
                        onBlur={(iso) =>
                          void run(() =>
                            update.mutateAsync({
                              id: order.id,
                              changes: { promised_date: iso || null },
                            }),
                          )
                        }
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        Nhà cung cấp dời ngày giao thì sửa ở đây — cột thời hạn ở danh sách đọc đúng
                        con số này.
                      </span>
                    </label>

                    <label className="block">
                      <span className="block font-medium">Số hợp đồng mua bán</span>
                      <input
                        defaultValue={order.contract_number ?? ''}
                        maxLength={64}
                        className="mt-1 h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                        onBlur={(e) =>
                          void run(() =>
                            update.mutateAsync({
                              id: order.id,
                              changes: { contract_number: e.target.value.trim() || null },
                            }),
                          )
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            ),
          },
        ]}
      />
    </>
  );
}
