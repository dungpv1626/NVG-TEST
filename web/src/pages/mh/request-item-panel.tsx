/**
 * Tab Mặt hàng của Chi tiết Đề nghị mua (MH-01).
 *
 * Bốn cột PRD MH-01 gọi tên: tên hàng, quy cách, số lượng, đơn vị. Cột "đơn giá ước tính"
 * thêm vào vì hạn mức phê duyệt MH-02 đối chiếu theo GIÁ TRỊ — không có con số nào thì không
 * biết hồ sơ này thuộc thẩm quyền ai.
 *
 * Chỉ sửa được khi hồ sơ còn Nháp hoặc vừa bị từ chối. Đó là ràng buộc của CSDL, không phải
 * của màn hình: sửa số lượng sau khi đã duyệt là vô hiệu hoá hạn mức mà không để lại dấu vết.
 */

import { useState } from 'react';
import { formatCurrency, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useDeletePurchaseRequestItem,
  usePurchaseRequestItems,
  useSavePurchaseRequestItem,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';

export function RequestItemPanel({
  requestId,
  readOnly,
}: {
  requestId: string;
  readOnly: boolean;
}) {
  const { data, isLoading, error } = usePurchaseRequestItems(requestId);
  const saveItem = useSavePurchaseRequestItem();
  const removeItem = useDeletePurchaseRequestItem();
  const [isFormOpen, setFormOpen] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={3} columns={6} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const items = data ?? [];
  const total = items.reduce(
    (sum, item) =>
      sum + BigInt(Math.round(Number(item.quantity) * Number(item.estimated_unit_price))),
    0n,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPanelError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await saveItem.mutateAsync({
        requestId,
        values: {
          position: items.length + 1,
          item_code: String(values.get('item_code') ?? '').trim() || null,
          name: String(values.get('name') ?? '').trim(),
          specification: String(values.get('specification') ?? '').trim() || null,
          unit: String(values.get('unit') ?? '').trim(),
          quantity: Number(values.get('quantity') ?? 0),
          estimated_unit_price: Number(values.get('estimated_unit_price') ?? 0),
        },
      });
      form.reset();
    } catch (e) {
      setPanelError(toUserMessage(e, 'create'));
    }
  }

  async function remove(id: string) {
    setPanelError(null);
    try {
      await removeItem.mutateAsync({ id, requestId });
    } catch (e) {
      setPanelError(toUserMessage(e, 'delete'));
    }
  }

  return (
    <div className="space-y-4">
      {panelError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {panelError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState message="Chưa có mặt hàng nào trong đề nghị. Thêm ít nhất một dòng — không có dòng nào thì không gửi phê duyệt được." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left">
            <thead className="border-b border-border text-fg-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Mã vật tư
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Tên hàng
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Quy cách
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Số lượng
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Đơn vị
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">
                  Đơn giá ước tính
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Thành tiền
                </th>
                {!readOnly && (
                  <th scope="col" className="py-2 pl-4 font-medium">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">{item.item_code ?? EM_DASH}</td>
                  <td className="py-2 pr-4">{item.name}</td>
                  <td className="py-2 pr-4 text-fg-muted">{item.specification ?? EM_DASH}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatNumber(Number(item.quantity))}
                  </td>
                  <td className="py-2 pr-4">{item.unit}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatCurrency(item.estimated_unit_price)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCurrency(
                      BigInt(Math.round(Number(item.quantity) * Number(item.estimated_unit_price))),
                    )}
                  </td>
                  {!readOnly && (
                    <td className="py-2 pl-4">
                      <Button variant="subtle" onClick={() => void remove(item.id)}>
                        Xóa dòng
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <td className="py-2 pr-4" colSpan={6}>
                  Giá trị ước tính — con số đối chiếu hạn mức phê duyệt
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(total)}</td>
                {!readOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!readOnly && (
        <>
          <Button variant="secondary" onClick={() => setFormOpen((open) => !open)}>
            {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm mặt hàng'}
          </Button>

          {isFormOpen && (
            <form
              onSubmit={(e) => void submit(e)}
              className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Mã vật tư" hint="Dùng chung bộ mã với đơn giá dự toán và kho.">
                  <Input name="item_code" maxLength={64} />
                </Field>
                <Field label="Tên hàng" required className="lg:col-span-2">
                  <Input name="name" required />
                </Field>
                <Field
                  label="Quy cách, tiêu chuẩn"
                  className="lg:col-span-3"
                  hint="Ghi càng rõ, báo giá của các nhà cung cấp càng so sánh được với nhau."
                >
                  <Input name="specification" />
                </Field>
                <Field label="Số lượng" required>
                  <Input name="quantity" type="number" step="0.001" min="0.001" required />
                </Field>
                <Field label="Đơn vị" required>
                  <Input name="unit" required maxLength={32} placeholder="kg, m, cái…" />
                </Field>
                <Field label="Đơn giá ước tính (đồng)" required>
                  <MoneyInput name="estimated_unit_price" required />
                </Field>
              </div>
              <Button type="submit" variant="primary" disabled={saveItem.isPending}>
                Thêm vào đề nghị
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
