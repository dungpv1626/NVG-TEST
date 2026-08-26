/**
 * Tab Giao nhận của Chi tiết Đơn đặt hàng (MH-07).
 *
 * PRD MH-07: "kiểm đếm số lượng, kiểm tra quy cách/chất lượng (yêu cầu CO/CQ…); biên bản
 * giao nhận có chữ ký các bên; xử lý và ghi nhận trường hợp hàng thiếu/sai/hỏng".
 *
 * Hai cột số lượng tách bạch và đó là điểm mấu chốt: chỉ phần ĐẠT mới cộng vào số đã nhận và
 * vào chi phí thực tế của công trình. Hàng thiếu/sai/hỏng vẫn ghi lại để có căn cứ làm việc
 * với nhà cung cấp, nhưng không tính là đã mua được — gộp hai con số lại thì ngân sách công
 * trình sẽ ghi nhận một khoản chi cho số hàng chưa hề dùng được.
 *
 * Người nhận hàng do CSDL đóng dấu từ phiên đăng nhập, không có ô chọn: đây là chữ ký bên
 * nhận của biên bản.
 */

import { useState } from 'react';
import { DELIVERY_ISSUE_LABELS, deliveryProgress, formatDate, formatNumber } from '@nvg/shared';
import type { DeliveryIssueType } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useDeliveries,
  usePurchaseOrderItems,
  useRecordDelivery,
  type PurchaseOrderItemRecord,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';

function remaining(item: PurchaseOrderItemRecord): number {
  return Number(item.quantity) - Number(item.delivered_quantity);
}

export function DeliveryPanel({
  orderId,
  canRecord,
  isOpenForDelivery,
}: {
  orderId: string;
  canRecord: boolean;
  isOpenForDelivery: boolean;
}) {
  const { data: items, isLoading, error } = usePurchaseOrderItems(orderId);
  const { data: deliveries } = useDeliveries(orderId);
  const record = useRecordDelivery();
  const [isFormOpen, setFormOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={3} columns={6} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const lines = items ?? [];
  const progress = deliveryProgress(
    lines.map((l) => ({ orderedQuantity: l.quantity, deliveredQuantity: l.delivered_quantity })),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPanelError(null);
    const form = event.currentTarget;
    const values = new FormData(form);

    const payload = lines
      .map((line) => ({
        purchase_order_item_id: line.id,
        quantity_ok: Number(values.get(`ok_${line.id}`) ?? 0),
        quantity_issue: Number(values.get(`issue_${line.id}`) ?? 0),
        issue_type: (String(values.get(`issue_type_${line.id}`) ?? '') || null) as
          | DeliveryIssueType
          | null,
        issue_note: String(values.get(`issue_note_${line.id}`) ?? '').trim() || null,
      }))
      .filter((line) => line.quantity_ok > 0 || line.quantity_issue > 0);

    if (payload.length === 0) {
      setPanelError('Chưa nhập số lượng thực nhận cho mặt hàng nào.');
      return;
    }

    try {
      await record.mutateAsync({
        orderId,
        deliveredDate: String(values.get('delivered_date') ?? ''),
        items: payload,
        deliveredByName: String(values.get('delivered_by_name') ?? ''),
        deliveryNoteNumber: String(values.get('delivery_note_number') ?? ''),
        invoiceNumber: String(values.get('invoice_number') ?? ''),
        hasQualityCertificate: values.get('has_quality_certificate') === 'on',
        notes: String(values.get('notes') ?? ''),
      });
      form.reset();
      setFormOpen(false);
    } catch (e) {
      setPanelError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {panelError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {panelError}
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface-sunken p-4">
        <p className="font-medium">
          Đã nhận đủ {progress.completeLines} / {progress.lines} mặt hàng
        </p>
        <p className="mt-1 text-fg-muted">
          Đếm theo mặt hàng chứ không cộng số lượng lại: một đơn có cả thép tính bằng kg lẫn
          bulông tính bằng cái thì phép cộng đó không có nghĩa. Số lượng còn thiếu của từng mặt
          hàng xem ở cột "Còn lại". Chỉ phần ĐẠT được tính vào chi phí thực tế của công trình —
          hàng thiếu, sai quy cách hoặc hư hỏng ghi riêng để làm việc với nhà cung cấp.
        </p>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Mặt hàng</th>
              <th scope="col" className="py-2 pr-4 font-medium">Đơn vị</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Đã đặt</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Đã nhận</th>
              <th scope="col" className="py-2 text-right font-medium">Còn lại</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-4">
                  <span>{line.name}</span>
                  {line.specification && (
                    <span className="block text-xs text-fg-subtle">{line.specification}</span>
                  )}
                </td>
                <td className="py-2 pr-4">{line.unit}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(Number(line.quantity))}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(Number(line.delivered_quantity))}
                </td>
                <td className="py-2 text-right tabular-nums">{formatNumber(remaining(line))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 font-medium">Các đợt đã giao</h3>
        {(deliveries ?? []).length === 0 ? (
          <EmptyState message="Chưa nhận đợt hàng nào. Ghi nhận giao nhận ngay khi hàng về để chi phí thực tế của công trình luôn đúng." />
        ) : (
          <ul className="space-y-2">
            {(deliveries ?? []).map((delivery) => {
              const okTotal = delivery.items.reduce((sum, i) => sum + Number(i.quantity_ok), 0);
              const issueTotal = delivery.items.reduce(
                (sum, i) => sum + Number(i.quantity_issue),
                0,
              );
              return (
                <li key={delivery.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {delivery.code ?? 'Phiếu giao nhận'} · {formatDate(delivery.delivered_date)}
                    </p>
                    <p className="tabular-nums">
                      Đạt {formatNumber(okTotal)}
                      {issueTotal > 0 && ` · Không đạt ${formatNumber(issueTotal)}`}
                    </p>
                  </div>
                  <p className="mt-1 text-fg-muted">
                    Người nhận: {delivery.receiver?.full_name ?? EM_DASH}
                    {delivery.delivered_by_name ? ` · Người giao: ${delivery.delivered_by_name}` : ''}
                    {delivery.delivery_note_number ? ` · Phiếu giao ${delivery.delivery_note_number}` : ''}
                    {delivery.invoice_number ? ` · Hóa đơn ${delivery.invoice_number}` : ''}
                    {delivery.has_quality_certificate ? ' · Có CO/CQ' : ''}
                  </p>
                  {delivery.items
                    .filter((i) => Number(i.quantity_issue) > 0)
                    .map((i) => (
                      <p key={i.id} className="mt-1 text-status-overdue">
                        {i.issue_type ? DELIVERY_ISSUE_LABELS[i.issue_type] : 'Không đạt'}:{' '}
                        {formatNumber(Number(i.quantity_issue))}
                        {i.issue_note ? ` — ${i.issue_note}` : ''}
                      </p>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canRecord && isOpenForDelivery && (
        <>
          <Button variant="secondary" onClick={() => setFormOpen((open) => !open)}>
            {isFormOpen ? 'Đóng biểu mẫu' : 'Ghi nhận đợt giao hàng'}
          </Button>

          {isFormOpen && (
            <form
              onSubmit={(e) => void submit(e)}
              className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Ngày nhận" required>
                  <Input
                    name="delivered_date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                </Field>
                <Field label="Người giao">
                  <Input name="delivered_by_name" maxLength={128} />
                </Field>
                <Field label="Số phiếu giao hàng">
                  <Input name="delivery_note_number" maxLength={64} />
                </Field>
                <Field label="Số hóa đơn">
                  <Input name="invoice_number" maxLength={64} />
                </Field>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" name="has_quality_certificate" className="size-4" />
                <span>Có chứng từ chất lượng CO/CQ kèm theo</span>
              </label>

              <div className="space-y-4">
                {lines.map((line) => (
                  <fieldset
                    key={line.id}
                    className="rounded-lg border border-border bg-surface p-3"
                    disabled={remaining(line) <= 0}
                  >
                    <legend className="px-1 font-medium">
                      {line.name} — còn lại {formatNumber(remaining(line))} {line.unit}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Số lượng đạt">
                        <Input
                          name={`ok_${line.id}`}
                          type="number"
                          min="0"
                          max={remaining(line)}
                          step="0.001"
                        />
                      </Field>
                      <Field label="Số lượng không đạt">
                        <Input name={`issue_${line.id}`} type="number" min="0" step="0.001" />
                      </Field>
                      <Field label="Không đạt kiểu gì">
                        <select
                          name={`issue_type_${line.id}`}
                          defaultValue=""
                          className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                        >
                          <option value="">Không có</option>
                          <option value="thieu">{DELIVERY_ISSUE_LABELS.thieu}</option>
                          <option value="sai_quy_cach">{DELIVERY_ISSUE_LABELS.sai_quy_cach}</option>
                          <option value="hu_hong">{DELIVERY_ISSUE_LABELS.hu_hong}</option>
                        </select>
                      </Field>
                      <Field label="Ghi chú xử lý">
                        <Input name={`issue_note_${line.id}`} />
                      </Field>
                    </div>
                  </fieldset>
                ))}
              </div>

              <Field label="Ghi chú biên bản">
                <textarea
                  name="notes"
                  rows={2}
                  className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
                />
              </Field>

              <Button type="submit" variant="primary" disabled={record.isPending}>
                Lưu biên bản giao nhận
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
