/**
 * Tab Khối lượng — dùng CHUNG cho gói thầu (DA-04) và dự án thiết kế NVO (TK-07).
 *
 * Điểm mấu chốt của DA-04 không phải là nhập được bảng khối lượng — mà là biết bảng đó bóc
 * theo BẢN VẼ NÀO. Vì vậy mỗi dòng gắn với một phiên bản bản vẽ cụ thể, và khi bản vẽ nguồn
 * có phiên bản mới hơn thì dòng đó hiện cảnh báo ngay tại chỗ, không đợi ai nhớ ra.
 *
 * PRD TK-07 yêu cầu Thiết kế dùng chung cơ chế này, nên màn hình nhận `parent` thay vì gắn
 * cứng vào gói thầu — không có bản sao thứ hai cho NVO.
 */

import { useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BUTTONS, formatNumber } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { useBoqItems, useCreateBoqItem, type EstimateParent } from '@/hooks/use-estimates';
import { toUserMessage } from '@/hooks/use-error-message';

export function BoqPanel({
  parent,
  companyId,
  readOnly,
}: {
  parent: EstimateParent;
  companyId: string;
  readOnly: boolean;
}) {
  const { data: items } = useBoqItems(parent);
  const createItem = useCreateBoqItem();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    itemCode: '',
    name: '',
    unit: '',
    quantity: '',
    drawingRef: '',
  });

  const outdated = (items ?? []).filter(
    (i) => i.drawing_version && !i.drawing_version.is_current_version,
  );

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.unit.trim()) {
      setError('Vui lòng nhập tên hạng mục và đơn vị tính.');
      return;
    }
    try {
      await createItem.mutateAsync({
        parent,
        companyId,
        item: {
          item_code: form.itemCode.trim() || null,
          name: form.name.trim(),
          unit: form.unit.trim(),
          quantity: Number(form.quantity || 0),
          drawing_ref: form.drawingRef.trim() || null,
          position: (items?.length ?? 0) + 1,
        },
      });
      setForm({ itemCode: '', name: '', unit: '', quantity: '', drawingRef: '' });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {outdated.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-status-pending-bg px-3 py-2 text-status-pending"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {outdated.length} hạng mục đang bóc theo bản vẽ đã có phiên bản mới hơn. Đối chiếu lại
            trước khi lập dự toán để không tính theo bản cũ.
          </span>
        </div>
      )}

      {(items ?? []).length === 0 ? (
        <EmptyState
          message={
            /*
             * Trạng thái rỗng phải nói được hành động NGƯỜI ĐANG XEM làm được (CGD 5.6).
             * Từ 29/08/2026 Kinh doanh xem được Module Thiết kế (câu hỏi Q-12) nhưng không
             * bóc tách khối lượng — câu gợi ý cũ biến màn hình rỗng thành một việc họ không
             * làm được và không hiểu vì sao.
             */
            readOnly
              ? 'Chưa bóc tách hạng mục nào. Vai trò hiện tại chỉ xem, việc bóc tách do Dự toán hoặc Thiết kế thực hiện.'
              : 'Chưa bóc tách hạng mục nào. Nhập bảng khối lượng theo hồ sơ mời thầu và bản vẽ đang hiệu lực.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-fg-subtle">
                <th className="px-4 py-2.5 font-medium">Mã</th>
                <th className="px-4 py-2.5 font-medium">Hạng mục</th>
                <th className="px-4 py-2.5 font-medium">Đơn vị</th>
                <th className="px-4 py-2.5 text-right font-medium">Khối lượng</th>
                <th className="px-4 py-2.5 font-medium">Bản vẽ</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => {
                const stale = item.drawing_version && !item.drawing_version.is_current_version;
                return (
                  <tr key={item.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs">{item.item_code ?? '—'}</td>
                    <td className="px-4 py-3">{item.name}</td>
                    <td className="px-4 py-3">{item.unit}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumber(Number(item.quantity))}
                    </td>
                    <td className="px-4 py-3">
                      {item.drawing_ref ?? <span className="text-fg-subtle">—</span>}
                      {stale && (
                        <span className="ml-2 whitespace-nowrap text-xs font-medium text-status-pending">
                          Bản vẽ đã đổi
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && (
        <form
          onSubmit={addItem}
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <p className="mb-3 font-medium">Thêm hạng mục</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="Mã">
              <Input
                value={form.itemCode}
                onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
              />
            </Field>
            <Field label="Hạng mục" required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Đơn vị" required>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </Field>
            <Field label="Khối lượng">
              <Input
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                inputMode="decimal"
              />
            </Field>
            <Field label="Mã bản vẽ" className="sm:col-span-2">
              <Input
                value={form.drawingRef}
                onChange={(e) => setForm({ ...form, drawingRef: e.target.value })}
              />
            </Field>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="secondary"
            className="mt-3"
            disabled={createItem.isPending}
          >
            {createItem.isPending ? 'Đang lưu…' : BUTTONS.save}
          </Button>
        </form>
      )}
    </div>
  );
}
