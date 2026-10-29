/**
 * Chọn thầu phụ / tổ đội cho một gói việc (G2 — A4, migration 0246).
 *
 * Phiếu khảo sát: chọn thầu phụ cần so sánh, nguồn ngân sách và duyệt theo hạn mức. Màn hình: nhập
 * 2–3 báo giá → bảng so cạnh nhau (giá thấp nhất được đánh dấu, kèm đánh giá các đợt trước của cùng tổ)
 * → người chọn, máy không gợi ý (PRD 2.3) → gửi phê duyệt. Một báo giá hoặc không chọn giá thấp nhất thì
 * phải ghi lý do (CSDL chặn, màn hình nói trước). Duyệt xong tổ đội tự có ở tab Tổ đội của công trình.
 */

import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatCurrency, formatDateTime, formatNumber, toMoney } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  PRICING_METHOD_LABELS,
  SELECTION_STATUS_META,
  useDeleteOffer,
  useSaveOffer,
  useSelectionBoard,
  useSiteCostLines,
  useSubmitSelection,
  useUpdateSelection,
  type PricingMethod,
  type SelectionBoard,
} from '@/hooks/use-subcontracts';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

/** Số thập phân gõ kiểu Việt Nam (dấu phẩy) → số; rỗng → null. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function SubcontractSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useSelectionBoard(id);
  const canEditTc = useCan('TC', 'edit');

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data)
    return (
      <RecordNotFound
        entity="gói việc chọn thầu phụ"
        listPath="/tc/cong-trinh"
        listLabel="Quay lại danh sách công trình"
      />
    );

  const editable = canEditTc && (data.status === 'nhap' || data.status === 'tu_choi');
  const meta = SELECTION_STATUS_META[data.status];

  return (
    <>
      <PageHeader
        title={`Chọn thầu phụ — ${data.work_package}`}
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: data.site.code, to: `/tc/cong-trinh/${data.site.id}?tab=to-doi` },
          { label: data.code ?? 'Chọn thầu phụ' },
        ]}
        description={`${data.site.name} · so 2–3 báo giá, chọn một rồi gửi phê duyệt theo hạn mức.`}
        actions={
          data.subcontractor_id ? (
            <Button variant="primary" asChild>
              <Link to={`/tc/thau-phu/${data.subcontractor_id}`}>Mở tổ đội đã chọn</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <section className="rounded-card bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusWithLabel status={meta.statusGroup} label={meta.label} />
            {data.submitted_at && (
              <span className="text-fg-subtle">Gửi lúc {formatDateTime(data.submitted_at)}</span>
            )}
          </div>
          {data.status === 'tu_choi' && data.decision_note && (
            <p className="mt-2 rounded-sm bg-status-disputed-bg px-3 py-2">
              Bị từ chối: {data.decision_note}. Sửa báo giá rồi gửi lại.
            </p>
          )}
          {data.scope_of_work && <p className="mt-2 whitespace-pre-wrap">{data.scope_of_work}</p>}
          <CostLinePicker board={data} editable={editable} />
        </section>

        <SelectionBoardView board={data} />

        {editable && <OfferForm selectionId={data.id} />}
        {editable && data.offers.length > 0 && <SubmitSelection board={data} />}
      </div>
    </>
  );
}

function CostLinePicker({ board, editable }: { board: SelectionBoard; editable: boolean }) {
  const { data: lines } = useSiteCostLines(board.site.id);
  const update = useUpdateSelection();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      {editable ? (
        <Field
          label="Nguồn ngân sách"
          hint="Dòng ngân sách công trình chi trả cho gói việc — bắt buộc trước khi gửi duyệt."
        >
          <select
            value={board.cost_code ?? ''}
            onChange={(e) => {
              setError(null);
              update
                .mutateAsync({ id: board.id, values: { cost_code: e.target.value || null } })
                .catch((err: unknown) => setError(toUserMessage(err, 'edit')));
            }}
            className={SELECT_CLASS}
          >
            <option value="">Chọn dòng ngân sách</option>
            {(lines ?? []).map((l) => (
              <option key={l.cost_code} value={l.cost_code}>
                {l.cost_code} — {l.name} (còn {formatCurrency(l.remaining)})
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-fg-subtle">
          Nguồn ngân sách:{' '}
          {board.budget ? `${board.cost_code} — ${board.budget.name}` : 'Chưa chọn'}
        </p>
      )}
      {editable && (lines ?? []).length === 0 && (
        <p className="mt-1 text-fg-subtle">
          Công trình chưa có ngân sách. Lập ngân sách ở tab Ngân sách của công trình trước.
        </p>
      )}
      {board.budget && (
        <p className="mt-1 text-fg-subtle">
          Ngân sách {formatCurrency(board.budget.budgeted)} · còn lại{' '}
          {formatCurrency(board.budget.remaining)}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-status-overdue">
          {error}
        </p>
      )}
    </div>
  );
}

/** Bảng so báo giá — dùng chung cho trang chọn thầu phụ và Hộp thư Phê duyệt. */
export function SelectionBoardView({ board }: { board: SelectionBoard }) {
  const del = useDeleteOffer();
  const canEditTc = useCan('TC', 'edit');
  const editable = canEditTc && (board.status === 'nhap' || board.status === 'tu_choi');
  const offers = board.offers;
  if (offers.length === 0) {
    return (
      <EmptyState message="Chưa có báo giá nào. Nhập 2–3 báo giá của các tổ đội để so sánh trước khi chọn." />
    );
  }
  const lowest = offers.reduce(
    (m, o) => (toMoney(o.offered_value) < m ? toMoney(o.offered_value) : m),
    toMoney(offers[0]!.offered_value),
  );
  const remaining = board.budget ? toMoney(board.budget.remaining) : null;

  return (
    <section aria-label="So sánh báo giá" className="space-y-2">
      <h2 className="font-semibold">So sánh {offers.length} báo giá</h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {offers.map((o) => {
          const value = toMoney(o.offered_value);
          const chosen = board.selected_offer_id === o.id;
          return (
            <li
              key={o.id}
              className={cn(
                'rounded-card border bg-surface p-4',
                chosen ? 'border-shell' : 'border-transparent',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{o.crew_name}</p>
                {value === lowest && (
                  <span className="rounded-full bg-pill px-2 py-0.5 text-xs">Giá thấp nhất</span>
                )}
                {chosen && (
                  <span className="rounded-full bg-shell px-2 py-0.5 text-xs text-fg-inverse">
                    Được chọn
                  </span>
                )}
              </div>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(value)}</p>
              <dl className="mt-1 space-y-0.5 text-fg-subtle">
                <div>{PRICING_METHOD_LABELS[o.pricing_method]}</div>
                <div>
                  Giữ lại bảo hành:{' '}
                  {o.retention_rate != null ? `${formatNumber(o.retention_rate)} %` : 'Không giữ'}
                </div>
                {o.duration_days != null && <div>Thời gian làm: {o.duration_days} ngày</div>}
                {(o.contact_name || o.contact_phone) && (
                  <div>
                    {o.contact_name} {o.contact_phone}
                  </div>
                )}
                <div>
                  Các đợt trước:{' '}
                  {o.past_periods > 0
                    ? `${o.past_periods} đợt, chất lượng trung bình ${formatNumber(o.past_quality)}/5`
                    : 'Chưa làm với Nhà Việt'}
                </div>
                {remaining != null && value > remaining && (
                  <div className="text-status-overdue">
                    Vượt ngân sách còn lại {formatCurrency(value - remaining)}
                  </div>
                )}
              </dl>
              {o.notes && <p className="mt-1 whitespace-pre-wrap">{o.notes}</p>}
              {editable && (
                <Button
                  variant="subtle"
                  size="sm"
                  className="mt-2"
                  disabled={del.isPending}
                  onClick={() => void del.mutateAsync({ selectionId: board.id, offerId: o.id })}
                >
                  Xoá báo giá
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {board.single_offer_reason && (
        <p className="text-fg-subtle">Chỉ một báo giá vì: {board.single_offer_reason}</p>
      )}
      {board.selection_reason && (
        <p className="text-fg-subtle">Lý do chọn: {board.selection_reason}</p>
      )}
    </section>
  );
}

const EMPTY_OFFER = {
  crewName: '',
  contactName: '',
  contactPhone: '',
  method: 'don_gia' as PricingMethod,
  value: '',
  retention: '',
  days: '',
  notes: '',
};

function OfferForm({ selectionId }: { selectionId: string }) {
  const save = useSaveOffer();
  const [f, setF] = useState(EMPTY_OFFER);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.crewName.trim() || !f.value) {
      setError('Vui lòng nhập tên tổ đội và giá trị báo giá.');
      return;
    }
    const retention = parseDecimal(f.retention);
    if (f.retention.trim() && (retention == null || retention < 0 || retention >= 100)) {
      setError('Tỷ lệ giữ lại bảo hành từ 0 đến dưới 100 %.');
      return;
    }
    try {
      await save.mutateAsync({
        selectionId,
        values: {
          crew_name: f.crewName.trim(),
          contact_name: f.contactName.trim() || null,
          contact_phone: f.contactPhone.trim() || null,
          pricing_method: f.method,
          offered_value: f.value,
          retention_rate: retention,
          duration_days: f.days ? Number(f.days) : null,
          notes: f.notes.trim() || null,
        },
      });
      setF(EMPTY_OFFER);
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Thêm báo giá</h2>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên tổ đội / nhà thầu phụ" required>
          <Input
            value={f.crewName}
            onChange={(e) => setF((v) => ({ ...v, crewName: e.target.value }))}
          />
        </Field>
        <Field label="Cách khoán">
          <select
            value={f.method}
            onChange={(e) => setF((v) => ({ ...v, method: e.target.value as PricingMethod }))}
            className={SELECT_CLASS}
          >
            {(Object.keys(PRICING_METHOD_LABELS) as PricingMethod[]).map((m) => (
              <option key={m} value={m}>
                {PRICING_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giá trị báo giá" hint="Đơn vị đồng." required>
          <MoneyInput value={f.value} onChange={(v) => setF((s) => ({ ...s, value: v }))} />
        </Field>
        <Field label="Tỷ lệ giữ lại bảo hành (%)" hint="Để trống nếu không giữ lại.">
          <Input
            inputMode="decimal"
            value={f.retention}
            onChange={(e) => setF((v) => ({ ...v, retention: e.target.value }))}
          />
        </Field>
        <Field label="Người liên hệ">
          <Input
            value={f.contactName}
            onChange={(e) => setF((v) => ({ ...v, contactName: e.target.value }))}
          />
        </Field>
        <Field label="Số điện thoại">
          <Input
            inputMode="tel"
            value={f.contactPhone}
            onChange={(e) => setF((v) => ({ ...v, contactPhone: e.target.value }))}
          />
        </Field>
        <Field label="Thời gian làm (ngày)">
          <Input
            inputMode="numeric"
            value={f.days}
            onChange={(e) => setF((v) => ({ ...v, days: e.target.value.replace(/\D/g, '') }))}
          />
        </Field>
        <Field label="Ghi chú">
          <Input value={f.notes} onChange={(e) => setF((v) => ({ ...v, notes: e.target.value }))} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" className="mt-3" disabled={save.isPending}>
        Thêm báo giá
      </Button>
    </form>
  );
}

function SubmitSelection({ board }: { board: SelectionBoard }) {
  const submit = useSubmitSelection();
  const [offerId, setOfferId] = useState(board.selected_offer_id ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const offers = board.offers;
  const lowest = offers.reduce(
    (m, o) => (toMoney(o.offered_value) < m ? toMoney(o.offered_value) : m),
    toMoney(offers[0]!.offered_value),
  );
  const chosen = offers.find((o) => o.id === offerId);
  const single = offers.length === 1;
  const needsReason = single || (chosen != null && toMoney(chosen.offered_value) > lowest);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const pick = single ? offers[0]!.id : offerId;
    if (!pick) {
      setError('Chọn một báo giá.');
      return;
    }
    if (needsReason && !reason.trim()) {
      setError(
        single
          ? 'Ghi lý do chỉ có một báo giá.'
          : 'Ghi lý do chọn báo giá không phải giá thấp nhất.',
      );
      return;
    }
    try {
      await submit.mutateAsync({
        selectionId: board.id,
        offerId: pick,
        reason: reason.trim() || null,
      });
    } catch (err) {
      setError(toUserMessage(err, 'edit'));
    }
  }

  return (
    <form onSubmit={(e) => void send(e)} noValidate className="rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Chọn và gửi phê duyệt</h2>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {error}
        </p>
      )}
      {!single && (
        <fieldset className="mb-3 space-y-2">
          <legend className="mb-1 text-fg-subtle">Báo giá được chọn</legend>
          {offers.map((o) => (
            <label key={o.id} className="flex min-h-10 items-center gap-2">
              <input
                type="radio"
                name="offer"
                value={o.id}
                checked={offerId === o.id}
                onChange={() => setOfferId(o.id)}
                className="size-5"
              />
              <span>
                {o.crew_name} — {formatCurrency(o.offered_value)}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {single && (
        <p className="mb-3 text-fg-subtle">
          Chỉ có một báo giá. Vẫn gửi duyệt được, nhưng phải ghi vì sao không so được với tổ đội
          khác.
        </p>
      )}
      {needsReason && (
        <Field
          label={
            single ? 'Lý do chỉ có một báo giá' : 'Lý do chọn báo giá không phải giá thấp nhất'
          }
          required
        >
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-field border border-border-strong bg-surface px-3 py-2"
          />
        </Field>
      )}
      <Button type="submit" variant="primary" className="mt-3" disabled={submit.isPending}>
        Gửi phê duyệt
      </Button>
      <p className="mt-2 text-xs text-fg-subtle">
        Duyệt theo hạn mức (Trưởng phòng Thi công → Ban Giám đốc → Tổng Giám đốc). Duyệt xong tổ đội
        có ở tab Tổ đội của công trình.
      </p>
    </form>
  );
}
