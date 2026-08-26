/**
 * Tab Bảo hành của Chi tiết Công trình (TC-07).
 *
 * Một dòng cho mỗi HẠNG MỤC, không phải một mốc bảo hành duy nhất cho cả công trình: thời
 * hạn khác nhau thật (chống thấm 5 năm, thiết bị điện 12 tháng, sơn 1 năm), và một mốc chung
 * là cách chắc chắn nhất để cãi nhau với chủ đầu tư về việc hạng mục này còn hạn hay không.
 *
 * Ngày hết hạn do CSDL tính từ ngày bàn giao + thời hạn hợp đồng, nên hai màn hình không bao
 * giờ ra hai ngày khác nhau.
 */

import { useState, type FormEvent } from 'react';
import {
  BUTTONS,
  WARRANTY_CLAIM_STATUSES,
  WARRANTY_CLAIM_STATUS_META,
  WARRANTY_STATUS_META,
  formatCurrency,
  formatDate,
  warrantyDaysLeft,
  type WarrantyClaimStatus,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useSaveWarranty,
  useSaveWarrantyClaim,
  useWarranties,
  useWarrantyClaims,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

const TODAY = () => new Date().toISOString().slice(0, 10);

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
  const saveClaim = useSaveWarrantyClaim();

  const [addingItem, setAddingItem] = useState(false);
  const [claimFor, setClaimFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ item: '', durationMonths: '', startDate: '' });
  const [claimForm, setClaimForm] = useState({
    description: '',
    reportedDate: TODAY(),
    reportedBy: '',
  });

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

  async function addClaim(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!claimForm.description.trim()) {
      setError('Vui lòng ghi nội dung khách hàng phản ánh.');
      return;
    }
    try {
      await saveClaim.mutateAsync({
        siteId,
        companyId,
        values: {
          warranty_id: claimFor,
          description: claimForm.description.trim(),
          reported_date: claimForm.reportedDate,
          reported_by: claimForm.reportedBy.trim() || null,
        },
      });
      setClaimForm({ description: '', reportedDate: TODAY(), reportedBy: '' });
      setClaimFor(null);
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  async function updateClaim(id: string, values: Record<string, unknown>) {
    setError(null);
    try {
      await saveClaim.mutateAsync({ id, siteId, companyId, values });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}

      {!handedOverAt && (
        <p className="rounded-sm bg-surface-sunken px-3 py-2 text-fg-subtle">
          Công trình chưa bàn giao cho chủ đầu tư. Hạng mục khai ở đây sẽ tính hạn bảo hành từ
          ngày bàn giao, trừ khi nhập ngày bắt đầu riêng theo thỏa thuận.
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
              <Input
                type="date"
                value={itemForm.startDate}
                onChange={(e) => setItemForm((f) => ({ ...f, startDate: e.target.value }))}
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
                  <ul className="mt-3 space-y-2">
                    {itemClaims.map((c) => (
                      <li key={c.id} className="border-l-2 border-border pl-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusLozenge
                            status={WARRANTY_CLAIM_STATUS_META[c.status].statusGroup}
                          />
                          <span className="text-xs text-fg-subtle">
                            {WARRANTY_CLAIM_STATUS_META[c.status].label} ·{' '}
                            {formatDate(c.reported_date)}
                            {c.reported_by && ` · ${c.reported_by} phản ánh`}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{c.description}</p>
                        {c.root_cause && (
                          <p className="mt-1 text-fg-subtle">Nguyên nhân: {c.root_cause}</p>
                        )}
                        {c.resolution && (
                          <p className="text-fg-subtle">
                            Kết quả: {c.resolution}
                            {c.cost != null && ` · chi phí ${formatCurrency(c.cost)}`}
                          </p>
                        )}

                        {!readOnly && (
                          <Field label="Trạng thái xử lý" className="mt-2 w-56">
                            <select
                              value={c.status}
                              onChange={(e) => {
                                const status = e.target.value as WarrantyClaimStatus;
                                void updateClaim(c.id, {
                                  status,
                                  resolved_at:
                                    status === 'da_xu_ly' || status === 'tu_choi'
                                      ? new Date().toISOString()
                                      : null,
                                });
                              }}
                              className="h-10 w-full rounded-sm border border-border bg-surface px-3"
                            >
                              {WARRANTY_CLAIM_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {WARRANTY_CLAIM_STATUS_META[s].label}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!readOnly &&
                  (claimFor === w.id ? (
                    <form onSubmit={addClaim} noValidate className="mt-3 border-t border-border pt-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Khách hàng phản ánh" required className="sm:col-span-2">
                          <textarea
                            value={claimForm.description}
                            onChange={(e) =>
                              setClaimForm((f) => ({ ...f, description: e.target.value }))
                            }
                            rows={2}
                            className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                            autoFocus
                          />
                        </Field>

                        <Field label="Ngày tiếp nhận">
                          <Input
                            type="date"
                            value={claimForm.reportedDate}
                            onChange={(e) =>
                              setClaimForm((f) => ({ ...f, reportedDate: e.target.value }))
                            }
                          />
                        </Field>

                        <Field label="Người phản ánh">
                          <Input
                            value={claimForm.reportedBy}
                            onChange={(e) =>
                              setClaimForm((f) => ({ ...f, reportedBy: e.target.value }))
                            }
                          />
                        </Field>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button type="submit" variant="primary" disabled={saveClaim.isPending}>
                          Ghi nhận phản ánh
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setClaimFor(null)}
                        >
                          {BUTTONS.cancel}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 text-brand underline"
                      onClick={() => setClaimFor(w.id)}
                    >
                      Ghi nhận phản ánh bảo hành
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
