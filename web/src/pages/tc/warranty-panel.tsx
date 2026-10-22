/**
 * Tab Bảo hành của Chi tiết Công trình (TC-07).
 *
 * Một dòng cho mỗi HẠNG MỤC, không phải một mốc bảo hành duy nhất cho cả công trình: thời
 * hạn khác nhau thật (chống thấm 5 năm, thiết bị điện 12 tháng, sơn 1 năm), và một mốc chung
 * là cách chắc chắn nhất để cãi nhau với chủ đầu tư về việc hạng mục này còn hạn hay không.
 *
 * Ngày hết hạn do CSDL tính từ ngày bàn giao + thời hạn hợp đồng, nên hai màn hình không bao
 * giờ ra hai ngày khác nhau.
 *
 * Phiếu bảo hành của từng hạng mục (lập, giao, hạn, ảnh, đóng phiếu) ở `warranty-claims.tsx` (2F).
 */

import { useState, type FormEvent } from 'react';
import { BUTTONS, WARRANTY_STATUS_META, formatDate, warrantyDaysLeft } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useSaveWarranty, useWarranties, useWarrantyClaims } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { WarrantyClaimForm, WarrantyClaimItem, claimOverdue } from './warranty-claims';

export function WarrantyPanel({
  siteId,
  companyId,
  handedOverAt,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  handedOverAt: string | null;
  readOnly: boolean;
}) {
  const { data: warranties } = useWarranties(siteId);
  const warrantyIds = (warranties ?? []).map((w) => w.id);
  const { data: claims } = useWarrantyClaims(warrantyIds);
  const saveWarranty = useSaveWarranty();

  const openClaims = (claims ?? []).filter(
    (c) => c.status === 'tiep_nhan' || c.status === 'dang_xu_ly',
  ).length;
  const overdueClaims = (claims ?? []).filter(claimOverdue).length;

  const [addingItem, setAddingItem] = useState(false);
  const [claimFor, setClaimFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ item: '', durationMonths: '', startDate: '' });

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!itemForm.item.trim()) {
      setError('Vui lòng nhập tên hạng mục được bảo hành.');
      return;
    }
    try {
      await saveWarranty.mutateAsync({
        siteId,
        companyId,
        values: {
          item: itemForm.item.trim(),
          duration_months: itemForm.durationMonths ? Number(itemForm.durationMonths) : null,
          start_date: itemForm.startDate || null,
        },
      });
      setItemForm({ item: '', durationMonths: '', startDate: '' });
      setAddingItem(false);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {openClaims > 0 && (
        <p
          className={
            overdueClaims > 0
              ? 'rounded-sm bg-status-overdue-bg px-3 py-2 font-medium text-status-overdue'
              : 'rounded-sm bg-surface-sunken px-3 py-2'
          }
        >
          {openClaims} phiếu bảo hành đang mở
          {overdueClaims > 0 && ` — ${overdueClaims} phiếu quá hạn xử lý`}
        </p>
      )}

      {!handedOverAt && (
        <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
          Công trình chưa bàn giao cho chủ đầu tư. Hạng mục khai ở đây sẽ tính hạn bảo hành từ ngày
          bàn giao, trừ khi nhập ngày bắt đầu riêng theo thỏa thuận.
        </p>
      )}

      {!readOnly && !addingItem && (
        <Button variant="primary" onClick={() => setAddingItem(true)}>
          Thêm hạng mục bảo hành
        </Button>
      )}

      {addingItem && (
        <form
          onSubmit={addItem}
          noValidate
          className="rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Hạng mục" required>
              <Input
                value={itemForm.item}
                onChange={(e) => setItemForm((f) => ({ ...f, item: e.target.value }))}
                placeholder="Chống thấm mái"
                autoFocus
              />
            </Field>

            <Field label="Thời hạn (tháng)" hint="Hệ thống tự tính ngày hết hạn.">
              <Input
                value={itemForm.durationMonths}
                inputMode="numeric"
                onChange={(e) =>
                  setItemForm((f) => ({
                    ...f,
                    durationMonths: e.target.value.replace(/[^\d]/g, ''),
                  }))
                }
              />
            </Field>

            <Field label="Bắt đầu" hint="Để trống thì tính từ ngày bàn giao công trình.">
              <DateInput
                value={itemForm.startDate}
                onChange={(v) => setItemForm((f) => ({ ...f, startDate: v }))}
              />
            </Field>
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saveWarranty.isPending}>
              {BUTTONS.save}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddingItem(false)}>
              {BUTTONS.cancel}
            </Button>
          </div>
        </form>
      )}

      {(warranties ?? []).length === 0 ? (
        <EmptyState message="Chưa khai hạng mục bảo hành nào. Khai từng hạng mục kèm thời hạn riêng để trả lời được hạng mục nào còn hạn khi khách phản ánh." />
      ) : (
        <ul className="space-y-3">
          {(warranties ?? []).map((w) => {
            const daysLeft = warrantyDaysLeft(w.warranty_until);
            const itemClaims = (claims ?? []).filter((c) => c.warranty_id === w.id);

            return (
              <li key={w.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-medium">{w.item}</p>
                  <StatusLozenge status={WARRANTY_STATUS_META[w.status].statusGroup} />
                  <span className="text-xs text-fg-subtle">
                    {WARRANTY_STATUS_META[w.status].label}
                  </span>
                </div>

                <p className="text-fg-subtle">
                  {w.start_date ? formatDate(w.start_date) : '?'} —{' '}
                  {w.warranty_until ? formatDate(w.warranty_until) : 'chưa đặt hạn'}
                  {w.duration_months != null && <span> · {w.duration_months} tháng</span>}
                  {daysLeft !== null && (
                    <span>
                      {' · '}
                      {daysLeft >= 0 ? `còn ${daysLeft} ngày` : `hết hạn ${-daysLeft} ngày trước`}
                    </span>
                  )}
                </p>

                {itemClaims.length > 0 && (
                  <ul className="mt-3 space-y-3">
                    {itemClaims.map((c) => (
                      <WarrantyClaimItem
                        key={c.id}
                        claim={c}
                        siteId={siteId}
                        companyId={companyId}
                        readOnly={readOnly}
                      />
                    ))}
                  </ul>
                )}

                {!readOnly &&
                  (claimFor === w.id ? (
                    <WarrantyClaimForm
                      siteId={siteId}
                      companyId={companyId}
                      warrantyId={w.id}
                      onDone={() => setClaimFor(null)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => setClaimFor(w.id)}
                    >
                      Lập phiếu bảo hành
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
