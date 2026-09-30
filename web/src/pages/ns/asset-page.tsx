/**
 * Tài sản và công cụ dụng cụ cấp phát (NS-08) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Câu hỏi màn hình này phải trả lời được trong một cái nhìn: món này ai đang giữ, tình trạng
 * ra sao. Vì vậy cột "Người giữ" đứng ngay sau tên, không nằm ở màn hình con.
 *
 * Người giữ và tình trạng CHỈ đổi qua biên bản (NS-08) — không có ô sửa nhanh nào ở đây, và
 * CSDL cũng từ chối nếu có: mỗi lần đổi tay phải để lại một biên bản đọc được về sau.
 */

import { useState } from 'react';
import {
  ASSET_CONDITION_LABELS,
  ASSET_EVENT_TYPES,
  ASSET_EVENT_TYPE_LABELS,
  formatCurrency,
  formatDate,
} from '@nvg/shared';
import type { AssetEventType } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useAssetEvents,
  useAssets,
  useCreateAsset,
  useEmployees,
  useRecordAssetEvent,
} from '@/hooks/use-hr';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { NsNav } from './ns-nav';

export function AssetPage() {
  const scope = useCompanyScope();
  const canEdit = useCan('NS', 'edit');

  const { data, isLoading, error, refetch } = useAssets();
  const { data: employees } = useEmployees();
  const create = useCreateAsset();
  const record = useRecordAssetEvent();

  const [selected, setSelected] = useState<string | null>(null);
  const { data: events } = useAssetEvents(selected ?? undefined);

  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [value, setValue] = useState('');

  const [eventType, setEventType] = useState<AssetEventType>('cap_phat');
  const [toEmployee, setToEmployee] = useState('');
  const [eventDate, setEventDate] = useState('');

  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const needsReceiver = eventType === 'cap_phat' || eventType === 'dieu_chuyen';

  async function addAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);
    setNotice(null);
    if (!scope.companyId || scope.isAggregate) {
      setPageError('Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi thêm tài sản.');
      return;
    }
    try {
      await create.mutateAsync({
        companyId: scope.companyId,
        name,
        serialNumber: serial || null,
        value: value || null,
      });
      setName('');
      setSerial('');
      setValue('');
      setNotice('Đã thêm tài sản vào sổ.');
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  async function addEvent() {
    setPageError(null);
    setNotice(null);
    if (!selected) return;
    try {
      await record.mutateAsync({
        assetId: selected,
        type: eventType,
        eventDate: eventDate || null,
        toEmployeeId: needsReceiver ? toEmployee || null : null,
      });
      setToEmployee('');
      setEventDate('');
      setNotice(`Đã lập biên bản ${ASSET_EVENT_TYPE_LABELS[eventType].toLowerCase()}.`);
    } catch (e) {
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      <NsNav />
      <PageHeader
        title="Tài sản cấp phát"
        description="Mỗi lần cấp phát, điều chuyển, sửa chữa, thu hồi hay thanh lý đều để lại một biên bản."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Tài sản' }]}
      />

      {pageError && <ErrorState message={pageError} />}
      {notice && <p className="mb-4 rounded border border-border bg-bg-subtle p-3">{notice}</p>}

      {canEdit && (
        <form
          onSubmit={addAsset}
          className="mb-6 grid gap-4 rounded border border-border bg-bg-subtle p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Tên tài sản" required hint="Mã tài sản do hệ thống cấp khi lưu.">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Số serial">
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
          </Field>
          <Field label="Nguyên giá">
            <MoneyInput value={value} onChange={setValue} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={create.isPending}>
              Thêm tài sản
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} onRetry={() => void refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có tài sản nào trong sổ. Thêm tài sản để theo dõi ai đang giữ và tình trạng ra sao." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border text-left text-fg-subtle">
                <th className="px-3 py-2">Tài sản</th>
                <th className="px-3 py-2">Người giữ</th>
                <th className="px-3 py-2">Tình trạng</th>
                <th className="px-3 py-2 text-right">Nguyên giá</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-fg-subtle">
                      {a.code ?? 'Chưa có mã'}
                      {a.serial_number ? ` · ${a.serial_number}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-2">{a.holder?.full_name ?? 'Chưa cấp phát'}</td>
                  <td className="px-3 py-2">{ASSET_CONDITION_LABELS[a.condition]}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(a.value)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(selected === a.id ? null : a.id)}
                    >
                      {selected === a.id ? 'Đóng' : 'Biên bản'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <section className="mt-6 rounded border border-border p-4">
          <h2 className="font-semibold">Biên bản của tài sản</h2>

          {canEdit && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Loại biên bản">
                <select
                  className="h-9 w-full rounded border border-border bg-bg px-2"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as AssetEventType)}
                >
                  {ASSET_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ASSET_EVENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>

              {needsReceiver && (
                <Field label="Người nhận" required>
                  <select
                    className="h-9 w-full rounded border border-border bg-bg px-2"
                    value={toEmployee}
                    onChange={(e) => setToEmployee(e.target.value)}
                  >
                    <option value="">Chọn người nhận</option>
                    {(employees ?? [])
                      .filter((e) => e.status !== 'da_nghi')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}

              <Field label="Ngày lập">
                <DateInput value={eventDate} onChange={setEventDate} />
              </Field>

              <div className="flex items-end">
                <Button onClick={() => void addEvent()} disabled={record.isPending}>
                  Lập biên bản
                </Button>
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {(events ?? []).length === 0 ? (
              <EmptyState message="Chưa có biên bản nào cho tài sản này." />
            ) : (
              (events ?? []).map((ev) => (
                <li key={ev.id} className="rounded border border-border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{ASSET_EVENT_TYPE_LABELS[ev.type]}</span>
                    <span className="text-fg-subtle">{formatDate(ev.event_date)}</span>
                  </div>
                  <div className="mt-1 text-fg-subtle">
                    {ev.from_employee?.full_name ?? 'Kho hành chính'} →{' '}
                    {ev.to_employee?.full_name ?? 'Kho hành chính'}
                    {ev.condition ? ` · ${ASSET_CONDITION_LABELS[ev.condition]}` : ''}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </>
  );
}
