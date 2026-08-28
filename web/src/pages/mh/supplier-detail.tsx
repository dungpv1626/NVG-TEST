/**
 * Chi tiết Nhà cung cấp (MH-03) — "Hồ sơ 360°" (Webapp Flow 4.3).
 *
 * Tab Đánh giá hiện đúng tám tiêu chí PRD MH-03 liệt kê, mỗi tiêu chí một ô 1–5 do NGƯỜI
 * chấm. CỐ Ý KHÔNG có ô "điểm tổng": trung bình cộng của tám con số trông vô hại nhưng
 * chính là thứ người dùng sẽ đọc thay cho việc xem từng tiêu chí, và PRD cấm phần mềm
 * "đánh giá chất lượng kỹ thuật" thay người.
 *
 * Ngừng giao dịch bắt buộc nêu lý do — kiểm ở CSDL, màn hình chỉ hỏi cho đúng lúc.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SupplierClass } from '@nvg/shared';
import {
  PURCHASE_ORDER_STAGE_META,
  SUPPLIER_CLASS_LABELS,
  SUPPLIER_CRITERIA,
  SUPPLIER_RATING_SCALE,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useOrdersOfSupplier,
  useSaveSupplier,
  useSupplier,
  type SupplierRecord,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

const EM_DASH = '—';

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('MH', 'edit');
  const { data, isLoading, error } = useSupplier(id);
  const { data: orders } = useOrdersOfSupplier(id);
  const save = useSaveSupplier();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="nhà cung cấp"
        listPath="/mh/nha-cung-cap"
        listLabel="Quay lại danh mục nhà cung cấp"
      />
    );
  }

  const supplier = data;
  const isStopped = supplier.supplier_class === 'ngung_giao_dich';

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function changeClass(next: SupplierClass) {
    if (next === 'ngung_giao_dich') {
      const reason = window.prompt('Lý do ngừng giao dịch với nhà cung cấp này:');
      if (reason === null || reason.trim() === '') return;
      void run(() =>
        save.mutateAsync({
          id: supplier.id,
          values: { supplier_class: next, suspended_reason: reason.trim() },
        }),
      );
      return;
    }
    void run(() => save.mutateAsync({ id: supplier.id, values: { supplier_class: next } }));
  }

  async function saveRatings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Partial<SupplierRecord> = { rated_at: new Date().toISOString() };
    for (const criterion of SUPPLIER_CRITERIA) {
      const raw = String(form.get(criterion.column) ?? '').trim();
      (values as Record<string, unknown>)[criterion.column] = raw === '' ? null : Number(raw);
    }
    values.rating_notes = String(form.get('rating_notes') ?? '').trim() || null;
    await run(() => save.mutateAsync({ id: supplier.id, values }));
  }

  const orderTotal = (orders ?? [])
    .filter((o) => o.stage !== 'huy')
    .reduce((sum, o) => sum + BigInt(o.total_value || '0'), 0n);

  const actions = !canEdit ? undefined : isStopped ? (
    <Button variant="primary" onClick={() => changeClass('du_phong')}>
      Mở lại giao dịch
    </Button>
  ) : (
    <>
      {supplier.supplier_class !== 'chinh' && (
        <Button variant="primary" onClick={() => changeClass('chinh')}>
          Đặt làm nhà cung cấp chính
        </Button>
      )}
      <Button variant="secondary" onClick={() => changeClass('ngung_giao_dich')}>
        Ngừng giao dịch
      </Button>
    </>
  );

  return (
    <>
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
          { label: 'Nhà cung cấp', to: '/mh/nha-cung-cap' },
          { label: supplier.name },
        ]}
        title={supplier.name}
        code={supplier.code}
        status={isStopped ? 'completed' : 'in_progress'}
        responsiblePerson={supplier.contact_person}
        tabs={[
          {
            id: 'danh-gia',
            label: 'Đánh giá',
            content: (
              <form onSubmit={(e) => void saveRatings(e)} className="space-y-4">
                <p className="text-fg-muted">
                  Tám tiêu chí theo PRD MH-03, chấm từ {SUPPLIER_RATING_SCALE.min} đến{' '}
                  {SUPPLIER_RATING_SCALE.max}. Để trống nghĩa là chưa đánh giá tiêu chí đó.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {SUPPLIER_CRITERIA.map((criterion) => (
                    <Field key={criterion.key} label={criterion.label}>
                      <Input
                        name={criterion.column}
                        type="number"
                        min={SUPPLIER_RATING_SCALE.min}
                        max={SUPPLIER_RATING_SCALE.max}
                        defaultValue={
                          (supplier[criterion.column as keyof SupplierRecord] as number | null) ??
                          ''
                        }
                        disabled={!canEdit}
                      />
                    </Field>
                  ))}
                </div>
                <Field
                  label="Căn cứ đánh giá"
                  hint="Ghi lại vì sao chấm như vậy — lần sau đọc lại còn hiểu, và người khác không phải hỏi."
                >
                  <textarea
                    name="rating_notes"
                    rows={3}
                    defaultValue={supplier.rating_notes ?? ''}
                    disabled={!canEdit}
                    className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
                  />
                </Field>
                {canEdit && (
                  <Button type="submit" variant="primary" disabled={save.isPending}>
                    Lưu đánh giá
                  </Button>
                )}
              </form>
            ),
          },
          {
            id: 'lich-su-giao-dich',
            label: 'Lịch sử giao dịch',
            badge: orders?.length || undefined,
            content:
              (orders ?? []).length === 0 ? (
                <EmptyState message="Chưa có đơn đặt hàng nào với nhà cung cấp này. Lịch sử giao dịch hình thành từ các đơn hàng đã lập, không nhập tay." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-left">
                    <thead className="border-b border-border text-fg-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Mã đơn hàng
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Nội dung
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Ngày đặt
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Bước
                        </th>
                        <th scope="col" className="py-2 text-right font-medium">
                          Giá trị
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orders ?? []).map((order) => (
                        <tr key={order.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4">
                            <Link
                              to={`/mh/don-hang/${order.id}`}
                              className="font-medium text-brand hover:underline"
                            >
                              {order.code ?? EM_DASH}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">{order.request?.title ?? EM_DASH}</td>
                          <td className="py-2 pr-4">
                            {order.order_date ? formatDate(order.order_date) : EM_DASH}
                          </td>
                          <td className="py-2 pr-4">
                            {PURCHASE_ORDER_STAGE_META[order.stage].label}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatCurrency(order.total_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
          },
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <DetailFields
                fields={[
                  { label: 'Phân loại', value: SUPPLIER_CLASS_LABELS[supplier.supplier_class] },
                  { label: 'Nhóm hàng cung cấp', value: supplier.category ?? EM_DASH },
                  { label: 'Mã số thuế', value: supplier.tax_code ?? EM_DASH },
                  { label: 'Người liên hệ', value: supplier.contact_person ?? EM_DASH },
                  { label: 'Điện thoại', value: supplier.phone ?? EM_DASH },
                  { label: 'Thư điện tử', value: supplier.email ?? EM_DASH },
                  { label: 'Địa chỉ', value: supplier.address ?? EM_DASH },
                  {
                    label: 'Điều kiện thanh toán thường lệ',
                    value:
                      supplier.default_payment_term_days != null
                        ? `${supplier.default_payment_term_days} ngày`
                        : EM_DASH,
                  },
                  {
                    label: 'Tổng giá trị đã đặt hàng',
                    value: orderTotal > 0n ? formatCurrency(orderTotal) : 'Chưa có đơn hàng nào',
                  },
                  {
                    label: 'Đánh giá gần nhất',
                    value: supplier.rated_at ? formatDateTime(supplier.rated_at) : 'Chưa đánh giá',
                  },
                  { label: 'Lý do ngừng giao dịch', value: supplier.suspended_reason ?? EM_DASH },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}
