/**
 * Giàn giáo (KHO-06) — vòng đời riêng, khác vật tư tiêu hao.
 *
 * Con số quan trọng nhất trên màn hình này là LƯỢNG CHO THUÊ ĐƯỢC, không phải tổng số bộ:
 * PRD KHO-06 nói rõ hàng sửa chữa, mất mát, thanh lý "không nhập chung ngay vào lượng hàng
 * sử dụng tốt". 500 bộ mà 80 bộ đang hỏng thì con số đem hứa với khách là 420.
 *
 * Tình trạng chỉ đổi qua BIÊN BẢN, không có ô chọn nào đổi thẳng — cơ sở dữ liệu cũng từ
 * chối. Mỗi biên bản ghi số lượng, nguyên nhân và bên chịu trách nhiệm.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ScaffoldingCondition, ScaffoldingEventType } from '@nvg/shared';
import {
  ASSET_LOCATION_LABELS,
  SCAFFOLDING_CONDITION_LABELS,
  SCAFFOLDING_EVENT_LABELS,
  formatCurrency,
  formatDate,
  formatNumber,
  isUsableScaffolding,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  useRecordScaffoldingEvent,
  useScaffoldingAssets,
  useScaffoldingEvents,
} from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { KhoNav } from './kho-nav';
import { APP_HELP } from '@/lib/help-texts';

const EM_DASH = '—';

function EventPanel({ assetId }: { assetId: string }) {
  const { data } = useScaffoldingEvents(assetId);
  const events = data ?? [];

  if (events.length === 0) {
    return <p className="text-fg-muted">Lô này chưa có biên bản nào.</p>;
  }

  return (
    <ul className="space-y-1">
      {events.map((e) => (
        <li key={e.id} className="text-fg-muted">
          <span className="font-medium text-fg">{SCAFFOLDING_EVENT_LABELS[e.event_type]}</span>{' '}
          {formatDate(e.event_date)} · {formatNumber(Number(e.quantity))}
          {e.result_condition ? ` → ${SCAFFOLDING_CONDITION_LABELS[e.result_condition]}` : ''}
          {Number(e.amount) > 0 ? ` · ${formatCurrency(e.amount)}` : ''}
          {e.responsible_party ? ` · ${e.responsible_party}` : ''}
          <span className="block text-xs">{e.reason}</span>
        </li>
      ))}
    </ul>
  );
}

export function ScaffoldingPage() {
  const canEdit = useCan('KHO', 'edit');
  const { data, isLoading, error } = useScaffoldingAssets();
  const recordEvent = useRecordScaffoldingEvent();
  const [params] = useSearchParams();

  // `?mo=` đến từ tìm kiếm toàn hệ thống (AFD 5.3) — không có trang chi tiết riêng cho một
  // lô giàn giáo, nên kết quả tìm kiếm trỏ về đây và mở sẵn đúng dòng.
  const [openId, setOpenId] = useState<string | null>(params.get('mo'));
  const [formAssetId, setFormAssetId] = useState<string | null>(null);
  const [eventType, setEventType] = useState<ScaffoldingEventType>('sua_chua');
  const [pageError, setPageError] = useState<string | null>(null);

  // Không viết thẳng `data ?? []`: mảng rỗng mới mỗi lần dựng làm `useMemo` bên dưới tính lại
  // sau MỌI lần dựng, tức là không còn là bộ nhớ đệm nữa.
  const assets = useMemo(() => data ?? [], [data]);

  const totals = useMemo(() => {
    let usable = 0;
    let unusable = 0;
    for (const a of assets) {
      const qty = Number(a.quantity);
      if (isUsableScaffolding(a.condition)) usable += qty;
      else unusable += qty;
    }
    return { usable, unusable };
  }, [assets]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formAssetId) return;
    setPageError(null);
    const form = event.currentTarget;
    const values = new FormData(form);

    try {
      await recordEvent.mutateAsync({
        assetId: formAssetId,
        eventType,
        quantity: Number(values.get('quantity') ?? 0),
        reason: String(values.get('reason') ?? ''),
        resultCondition:
          eventType === 'sua_chua'
            ? ((values.get('result_condition') as ScaffoldingCondition) ?? null)
            : null,
        eventDate: String(values.get('event_date') ?? '') || undefined,
        amount: Number(values.get('amount') ?? 0),
        responsibleParty: String(values.get('responsible_party') ?? ''),
      });
      form.reset();
      setFormAssetId(null);
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        help={APP_HELP.scaffolding}
        title="Giàn giáo"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Giàn giáo' }]}
        description="Theo dõi theo lô và theo tình trạng. Tình trạng chỉ đổi qua biên bản."
      />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}

      <section className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <p className="text-xs text-fg-subtle">Cho thuê được</p>
          <p className="text-2xl font-semibold tabular-nums">{formatNumber(totals.usable)}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            Chỉ gồm hàng mới và còn sử dụng được — con số này mới là con số đem hứa với khách.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <p className="text-xs text-fg-subtle">Hỏng chờ sửa và chờ thanh lý</p>
          <p className="text-2xl font-semibold tabular-nums">{formatNumber(totals.unusable)}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            Vẫn nằm trong sổ tài sản, nhưng không tính vào lượng cho thuê.
          </p>
        </div>
      </section>

      {isLoading ? (
        <TableSkeleton rows={4} columns={5} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : assets.length === 0 ? (
        <EmptyState message="Chưa có lô giàn giáo nào. Giàn giáo được theo dõi theo lô — cùng chủng loại, cùng kích thước, cùng tình trạng." />
      ) : (
        <ul className="space-y-2">
          {assets.map((asset) => {
            const isOpen = openId === asset.id;
            const usable = isUsableScaffolding(asset.condition);
            return (
              <li key={asset.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {asset.material?.name ?? EM_DASH}
                      <span className="ml-2 font-mono text-xs text-fg-subtle">
                        {asset.asset_code}
                      </span>
                    </p>
                    <p className="text-fg-muted">
                      <span className={usable ? '' : 'font-semibold text-status-overdue'}>
                        {SCAFFOLDING_CONDITION_LABELS[asset.condition]}
                      </span>{' '}
                      · {ASSET_LOCATION_LABELS[asset.location_type]}
                      {asset.warehouse ? ` — ${asset.warehouse.name}` : ''}
                      {asset.site ? ` — ${asset.site.code}` : ''}
                      {asset.renter_name ? ` — ${asset.renter_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold tabular-nums">
                      {formatNumber(Number(asset.quantity))} {asset.material?.unit}
                    </p>
                    <Button variant="secondary" onClick={() => setOpenId(isOpen ? null : asset.id)}>
                      {isOpen ? 'Thu gọn' : 'Biên bản'}
                    </Button>
                    {canEdit && (
                      <Button
                        variant="subtle"
                        onClick={() => setFormAssetId(formAssetId === asset.id ? null : asset.id)}
                      >
                        Lập biên bản
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 border-t border-border pt-3">
                    <EventPanel assetId={asset.id} />
                  </div>
                )}

                {formAssetId === asset.id && canEdit && (
                  <form
                    onSubmit={(e) => void submit(e)}
                    className="mt-3 space-y-3 border-t border-border pt-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="Loại biên bản" required>
                        <select
                          value={eventType}
                          onChange={(e) => setEventType(e.target.value as ScaffoldingEventType)}
                          className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                        >
                          <option value="sua_chua">{SCAFFOLDING_EVENT_LABELS.sua_chua}</option>
                          <option value="mat_mat">{SCAFFOLDING_EVENT_LABELS.mat_mat}</option>
                          <option value="thanh_ly">{SCAFFOLDING_EVENT_LABELS.thanh_ly}</option>
                        </select>
                      </Field>
                      <Field
                        label={`Số lượng (còn ${formatNumber(Number(asset.quantity))})`}
                        required
                      >
                        <Input
                          name="quantity"
                          type="number"
                          min="0.001"
                          max={Number(asset.quantity)}
                          step="0.001"
                          required
                        />
                      </Field>
                      <Field label="Ngày lập">
                        <DateInput
                          name="event_date"
                          defaultValue={new Date().toISOString().slice(0, 10)}
                        />
                      </Field>
                      {eventType === 'sua_chua' && (
                        <Field label="Tình trạng sau biên bản" required>
                          <select
                            name="result_condition"
                            defaultValue="hong_cho_sua"
                            className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
                          >
                            <option value="hong_cho_sua">
                              {SCAFFOLDING_CONDITION_LABELS.hong_cho_sua}
                            </option>
                            <option value="con_dung_duoc">
                              {SCAFFOLDING_CONDITION_LABELS.con_dung_duoc}
                            </option>
                            <option value="cho_thanh_ly">
                              {SCAFFOLDING_CONDITION_LABELS.cho_thanh_ly}
                            </option>
                          </select>
                        </Field>
                      )}
                      <Field label="Chi phí hoặc bồi thường (đồng)">
                        <MoneyInput name="amount" defaultValue="0" />
                      </Field>
                      <Field label="Bên chịu trách nhiệm">
                        <Input name="responsible_party" maxLength={255} />
                      </Field>
                    </div>
                    <Field
                      label="Nguyên nhân"
                      required
                      hint="Biên bản không có nguyên nhân thì không truy trách nhiệm được."
                    >
                      <textarea
                        name="reason"
                        required
                        rows={2}
                        className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2"
                      />
                    </Field>
                    <Button type="submit" variant="primary" disabled={recordEvent.isPending}>
                      Lưu biên bản
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
