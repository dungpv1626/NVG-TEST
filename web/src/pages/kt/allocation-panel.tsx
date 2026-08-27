/**
 * Tab Phân bổ chi phí của Chi tiết Đề nghị chi — KT-05.
 *
 * PRD KT-05: "gắn chi phí vào đúng mã công trình/hạng mục/nhóm chi phí NGAY TỪ KHI PHÁT
 * SINH, không hạch toán lại thủ công". Bảng này là nơi việc đó xảy ra, và nó phải xảy ra
 * TRƯỚC khi hồ sơ đi vào luồng duyệt — sau đó không sửa được nữa.
 *
 * Tổng các dòng phải bằng số tiền đề nghị. Màn hình nói ngay phần còn lệch thay vì để người
 * dùng gửi đi rồi mới nhận thông báo từ chối: cùng một quy tắc, nhưng biết sớm hơn một vòng.
 *
 * ⚠️ KHÔNG có nút "tự phân bổ". KT-05 liệt kê bốn tiêu thức (doanh thu, nhân sự, diện tích,
 * thời gian sử dụng), nhưng chọn tiêu thức nào cho khoản nào là quyết định theo quy chế của
 * NVG, mà quy chế đó chưa có (PRD Mục 10). Máy chia hộ lúc này là máy quyết định thay người.
 */

import { useState } from 'react';
import { COST_GROUP_LABELS, COST_GROUPS, formatCurrency, toMoney } from '@nvg/shared';
import type { CostGroup } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useDeleteAllocation,
  usePaymentAllocations,
  useSaveAllocation,
} from '@/hooks/use-accounting';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useSiteCostCodes } from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';

const EM_DASH = '—';
const SELECT_CLASS = 'h-9 w-full rounded-sm border border-border-strong bg-surface px-3';

export function AllocationPanel({
  requestId,
  totalAmount,
  readOnly,
}: {
  requestId: string;
  totalAmount: string;
  readOnly: boolean;
}) {
  const { data, isLoading, error } = usePaymentAllocations(requestId);
  const { data: sites } = useConstructionSites();
  const save = useSaveAllocation();
  const remove = useDeleteAllocation();

  const [isFormOpen, setFormOpen] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [amount, setAmount] = useState('');
  const [panelError, setPanelError] = useState<string | null>(null);

  const { data: costCodes } = useSiteCostCodes(siteId || undefined);

  if (isLoading) return <TableSkeleton rows={3} columns={5} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const rows = data ?? [];
  const allocated = rows.reduce((sum, row) => sum + toMoney(row.amount), 0n);
  const target = toMoney(totalAmount);
  const gap = target - allocated;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPanelError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await save.mutateAsync({
        requestId,
        values: {
          construction_site_id: siteId || null,
          cost_code: String(values.get('cost_code') ?? '').trim() || null,
          cost_group: (values.get('cost_group') as CostGroup) ?? 'chi_phi_chung',
          amount: amount || '0',
          basis: String(values.get('basis') ?? '').trim() || null,
        },
      });
      form.reset();
      setSiteId('');
      setAmount('');
    } catch (e) {
      setPanelError(toUserMessage(e, 'create'));
    }
  }

  async function removeRow(id: string) {
    setPanelError(null);
    try {
      await remove.mutateAsync({ id, requestId });
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

      {rows.length === 0 ? (
        <EmptyState message="Chưa phân bổ khoản chi vào mã chi phí nào. Thêm ít nhất một dòng — không có dòng nào thì không gửi đi được, và khoản chi này sẽ không thuộc về công trình nào trong báo cáo lãi/lỗ." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="border-b border-border text-fg-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Công trình
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Mã chi phí
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Nhóm chi phí
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Căn cứ phân bổ
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Số tiền
                </th>
                {!readOnly && (
                  <th scope="col" className="py-2 pl-4 font-medium">
                    Thao tác
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    {row.site ? `${row.site.code} — ${row.site.name}` : 'Chi phí văn phòng'}
                  </td>
                  <td className="py-2 pr-4">{row.cost_code ?? EM_DASH}</td>
                  <td className="py-2 pr-4 text-fg-muted">{COST_GROUP_LABELS[row.cost_group]}</td>
                  <td className="py-2 pr-4 text-fg-muted">{row.basis ?? EM_DASH}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(row.amount)}</td>
                  {!readOnly && (
                    <td className="py-2 pl-4">
                      <Button variant="subtle" onClick={() => void removeRow(row.id)}>
                        Xóa dòng
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong font-semibold">
                <td className="py-2 pr-4" colSpan={4}>
                  Tổng phân bổ
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(allocated)}</td>
                {!readOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {gap !== 0n && (
        <p
          className={
            gap > 0n
              ? 'rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending'
              : 'rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue'
          }
        >
          {gap > 0n
            ? `Còn ${formatCurrency(gap)} chưa phân bổ. Tổng các dòng phải bằng số tiền đề nghị mới gửi đi được.`
            : `Đã phân bổ vượt ${formatCurrency(-gap)} so với số tiền đề nghị. Sửa lại cho khớp.`}
        </p>
      )}

      {!readOnly && (
        <>
          <Button variant="secondary" onClick={() => setFormOpen((open) => !open)}>
            {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm dòng phân bổ'}
          </Button>

          {isFormOpen && (
            <form
              onSubmit={(e) => void submit(e)}
              className="space-y-4 rounded-lg border border-border bg-surface-sunken p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Công trình"
                  hint="Để trống nếu là chi phí văn phòng, không thuộc công trình nào."
                >
                  <select
                    value={siteId}
                    onChange={(e) => setSiteId(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    <option value="">Chi phí văn phòng</option>
                    {(sites ?? []).map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.code} — {site.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Mã chi phí trong ngân sách"
                  required={Boolean(siteId)}
                  hint={
                    siteId
                      ? 'Số tiền dòng này sẽ cộng vào đúng dòng ngân sách đã chọn khi khoản chi được thực hiện.'
                      : 'Chỉ chọn được sau khi chọn công trình.'
                  }
                >
                  <select
                    name="cost_code"
                    required={Boolean(siteId)}
                    disabled={!siteId}
                    className={`${SELECT_CLASS} disabled:bg-surface-sunken disabled:opacity-60`}
                  >
                    <option value="">Chọn mã chi phí</option>
                    {(costCodes ?? []).map((line) => (
                      <option key={line.cost_code} value={line.cost_code}>
                        {line.cost_code} — {line.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Nhóm chi phí" required>
                  <select name="cost_group" defaultValue="chi_phi_chung" className={SELECT_CLASS}>
                    {COST_GROUPS.map((group) => (
                      <option key={group} value={group}>
                        {COST_GROUP_LABELS[group]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Số tiền (đồng)" required>
                  <MoneyInput value={amount} onChange={setAmount} required />
                </Field>

                <Field
                  label="Căn cứ phân bổ"
                  className="lg:col-span-2"
                  hint="Bắt buộc khi khoản chi chia cho nhiều mã chi phí — ví dụ: theo diện tích sàn thi công."
                >
                  <Input name="basis" maxLength={200} />
                </Field>
              </div>
              <Button type="submit" variant="primary" disabled={save.isPending}>
                Thêm dòng phân bổ
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
