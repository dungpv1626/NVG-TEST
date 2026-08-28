/**
 * Chi tiết Hợp đồng cho thuê giàn giáo — "Hồ sơ 360°" (Webapp Flow 4.3), SX-03.
 *
 * Nút hành động chính duy nhất là "Thu hồi" khi hợp đồng đang cho thuê — đúng Backend Schema
 * 4.12 (`POST /rental-agreements/:id/return`): một lần thu hồi phải khai đủ tình trạng trả
 * của MỌI loại giàn giáo trong hợp đồng, `return_rental_agreement` từ chối thẳng nếu thiếu.
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  rentalAgreementDisplayStatus,
  rentalDaysSoFar,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useRentalAgreement,
  useRentalAgreementItems,
  useReturnRentalAgreement,
  useUpdateRentalAgreement,
  type RentalReturnItemInput,
} from '@/hooks/use-sx';
import { useCan } from '@/lib/auth';

const EM_DASH = '—';

interface ReturnDraft {
  materialId: string;
  label: string;
  unit: string;
  remaining: number;
  quantityOk: string;
  quantityDamaged: string;
  quantityLost: string;
  compensationAmount: string;
  note: string;
}

export function RentalAgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('SX', 'edit');

  const { data: agreement, isLoading, error } = useRentalAgreement(id);
  const { data: items } = useRentalAgreementItems(id);
  const updateAgreement = useUpdateRentalAgreement();
  const returnAgreement = useReturnRentalAgreement();

  const [isReturnFormOpen, setReturnFormOpen] = useState(false);
  const [actualReturnDate, setActualReturnDate] = useState('');
  const [returnDrafts, setReturnDrafts] = useState<ReturnDraft[]>([]);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const outstandingItems = useMemo(
    () =>
      (items ?? [])
        .map((it) => ({
          ...it,
          remaining:
            Number(it.quantity_out) -
            Number(it.quantity_returned_ok) -
            Number(it.quantity_damaged) -
            Number(it.quantity_lost),
        }))
        .filter((it) => it.remaining > 0),
    [items],
  );

  function openReturnForm() {
    setReturnDrafts(
      outstandingItems.map((it) => ({
        materialId: it.material_id,
        label: `${it.material?.code ?? ''} — ${it.material?.name ?? ''}`,
        unit: it.material?.unit ?? '',
        remaining: it.remaining,
        quantityOk: String(it.remaining),
        quantityDamaged: '0',
        quantityLost: '0',
        compensationAmount: '0',
        note: '',
      })),
    );
    setActualReturnDate('');
    setReturnError(null);
    setReturnFormOpen(true);
  }

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!agreement) {
    return (
      <RecordNotFound
        entity="hợp đồng thuê giàn giáo"
        listPath="/sx/tai-san-cho-thue"
        listLabel="Quay lại danh sách cho thuê"
      />
    );
  }

  // Đã qua kiểm tra `!agreement` ở trên — chụp lại vào một hằng để hai closure dưới đây giữ
  // được kiểu ĐÃ THU HẸP (TypeScript không tự giữ việc thu hẹp `const` khi đọc lại bên trong
  // một hàm khai báo sau đó trong cùng scope).
  const current = agreement;

  async function submitReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReturnError(null);

    if (!actualReturnDate) {
      setReturnError('Chọn ngày trả thực tế.');
      return;
    }

    const preparedItems: RentalReturnItemInput[] = returnDrafts.map((d) => ({
      material_id: d.materialId,
      quantity_ok: Number(d.quantityOk) || 0,
      quantity_damaged: Number(d.quantityDamaged) || 0,
      quantity_lost: Number(d.quantityLost) || 0,
      compensation_amount: Number(d.compensationAmount) || 0,
      note: d.note.trim() || undefined,
    }));

    try {
      await returnAgreement.mutateAsync({
        rentalAgreementId: current.id,
        actualReturnDate,
        items: preparedItems,
      });
      setReturnFormOpen(false);
    } catch (e) {
      setReturnError(toUserMessage(e, 'edit'));
    }
  }

  async function saveNotes() {
    if (notes === null || notes === current.notes) return;
    try {
      await updateAgreement.mutateAsync({ id: current.id, changes: { notes: notes || null } });
    } catch {
      // Lỗi lưu ghi chú không chặn xem hồ sơ — người dùng thử lại bằng cách gõ lại.
    }
  }

  const isActive = agreement.status === 'dang_thue';
  const daysSoFar = rentalDaysSoFar(agreement.start_date, agreement.actual_return_date);

  return (
    <EntityDetail
      breadcrumbs={[
        { label: 'Sản xuất & Cho thuê' },
        { label: 'Cho thuê giàn giáo', to: '/sx/tai-san-cho-thue' },
        { label: agreement.code },
      ]}
      title={agreement.customer?.name ?? agreement.code}
      code={agreement.code}
      status={rentalAgreementDisplayStatus(agreement.status, agreement.expected_end_date)}
      responsiblePerson={agreement.creator?.full_name ?? null}
      deadline={agreement.expected_end_date}
      actions={
        canEdit && isActive ? (
          <Button
            variant="primary"
            onClick={() => (isReturnFormOpen ? setReturnFormOpen(false) : openReturnForm())}
          >
            {isReturnFormOpen ? 'Đóng biểu mẫu' : 'Thu hồi giàn giáo'}
          </Button>
        ) : undefined
      }
      tabs={[
        {
          id: 'tong-quan',
          label: 'Tổng quan',
          content: (
            <div className="space-y-6">
              <DetailFields
                fields={[
                  {
                    label: 'Khách thuê',
                    value: (
                      <Link
                        to={`/crm/khach-hang/${agreement.customer_id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {agreement.customer?.code ?? ''} — {agreement.customer?.name ?? EM_DASH}
                      </Link>
                    ),
                  },
                  {
                    label: 'Công trình nhận',
                    value: agreement.site ? (
                      <Link
                        to={`/tc/cong-trinh/${agreement.construction_site_id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {agreement.site.code} — {agreement.site.name}
                      </Link>
                    ) : (
                      (agreement.site_address ?? EM_DASH)
                    ),
                  },
                  { label: 'Ngày bắt đầu thuê', value: formatDate(agreement.start_date) },
                  {
                    label: 'Ngày dự kiến trả',
                    value: agreement.expected_end_date
                      ? formatDate(agreement.expected_end_date)
                      : EM_DASH,
                  },
                  {
                    label: 'Ngày trả thực tế',
                    value: agreement.actual_return_date
                      ? formatDate(agreement.actual_return_date)
                      : EM_DASH,
                  },
                  { label: 'Số ngày đã thuê', value: `${daysSoFar} ngày` },
                  { label: 'Tiền đặt cọc', value: formatCurrency(agreement.deposit_amount) },
                  {
                    label: 'Tổng tiền thuê',
                    value:
                      agreement.total_revenue !== null
                        ? formatCurrency(agreement.total_revenue)
                        : 'Chưa chốt — tính khi thu hồi',
                  },
                  {
                    label: 'Tổng bồi thường',
                    value:
                      agreement.total_compensation !== null
                        ? formatCurrency(agreement.total_compensation)
                        : EM_DASH,
                  },
                ]}
              />

              <div>
                <h2 className="mb-2 text-sm font-semibold">Giàn giáo trong hợp đồng</h2>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-surface-sunken">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Loại giàn giáo</th>
                        <th className="px-3 py-2 text-right font-medium">Đã xuất</th>
                        <th className="px-3 py-2 text-right font-medium">Đơn giá/ngày</th>
                        <th className="px-3 py-2 text-right font-medium">Đã trả (đạt)</th>
                        <th className="px-3 py-2 text-right font-medium">Hư hỏng</th>
                        <th className="px-3 py-2 text-right font-medium">Mất</th>
                        <th className="px-3 py-2 text-right font-medium">Bồi thường</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(items ?? []).map((it) => (
                        <tr key={it.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            {it.material?.code} — {it.material?.name}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {it.quantity_out} {it.material?.unit}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(it.daily_rate)}</td>
                          <td className="px-3 py-2 text-right">{it.quantity_returned_ok}</td>
                          <td className="px-3 py-2 text-right">{it.quantity_damaged}</td>
                          <td className="px-3 py-2 text-right">{it.quantity_lost}</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(it.compensation_amount)}
                          </td>
                        </tr>
                      ))}
                      {(items ?? []).length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-center text-fg-subtle">
                            Đang tải…
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {isReturnFormOpen && (
                <form
                  onSubmit={(e) => void submitReturn(e)}
                  className="space-y-4 rounded-lg border border-border bg-surface p-4"
                >
                  <h2 className="text-sm font-semibold">Thu hồi giàn giáo</h2>
                  {returnError && (
                    <p
                      role="alert"
                      className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
                    >
                      {returnError}
                    </p>
                  )}

                  <Field label="Ngày trả thực tế" required>
                    <DateInput
                      value={actualReturnDate}
                      onChange={(v) => setActualReturnDate(v)}
                      required
                    />
                  </Field>

                  {returnDrafts.map((draft, index) => (
                    <div
                      key={draft.materialId}
                      className="space-y-2 rounded-sm border border-border p-3"
                    >
                      <p className="font-medium">
                        {draft.label} — còn {draft.remaining} {draft.unit} chưa khai tình trạng trả
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Trả đạt">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={draft.quantityOk}
                            onChange={(e) =>
                              setReturnDrafts((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, quantityOk: e.target.value } : d,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Hư hỏng">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={draft.quantityDamaged}
                            onChange={(e) =>
                              setReturnDrafts((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, quantityDamaged: e.target.value } : d,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Mất">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            value={draft.quantityLost}
                            onChange={(e) =>
                              setReturnDrafts((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, quantityLost: e.target.value } : d,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Bồi thường (đồng)">
                          <MoneyInput
                            value={draft.compensationAmount}
                            onChange={(v) =>
                              setReturnDrafts((prev) =>
                                prev.map((d, i) =>
                                  i === index ? { ...d, compensationAmount: v } : d,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Ghi chú hư hỏng/mất">
                        <Input
                          value={draft.note}
                          onChange={(e) =>
                            setReturnDrafts((prev) =>
                              prev.map((d, i) =>
                                i === index ? { ...d, note: e.target.value } : d,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  ))}

                  <Button type="submit" variant="primary" disabled={returnAgreement.isPending}>
                    Xác nhận thu hồi
                  </Button>
                </form>
              )}

              <Field label="Ghi chú">
                <textarea
                  defaultValue={agreement.notes ?? ''}
                  disabled={!canEdit}
                  rows={3}
                  className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 disabled:bg-surface-sunken"
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => void saveNotes()}
                />
              </Field>
            </div>
          ),
        },
      ]}
      historyContent={
        <DetailFields
          fields={[
            { label: 'Lập hợp đồng', value: formatDateTime(agreement.created_at) },
            { label: 'Cập nhật gần nhất', value: formatDateTime(agreement.updated_at) },
            {
              label: 'Thu hồi',
              value: agreement.actual_return_date
                ? formatDate(agreement.actual_return_date)
                : EM_DASH,
            },
          ]}
        />
      }
      related={[
        {
          title: 'Hồ sơ liên quan',
          records: [
            {
              label: 'Khách hàng',
              value: agreement.customer?.name ?? EM_DASH,
              to: `/crm/khach-hang/${agreement.customer_id}`,
            },
            ...(agreement.site
              ? [
                  {
                    label: 'Công trình',
                    value: agreement.site.name,
                    to: `/tc/cong-trinh/${agreement.construction_site_id}`,
                  },
                ]
              : []),
          ],
        },
      ]}
    />
  );
}
