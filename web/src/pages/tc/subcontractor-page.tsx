/**
 * Trang một tổ đội / nhà thầu phụ (G2 — A4 + T5, migration 0246).
 *
 * Sổ theo dõi (giá trị khoán · đã xác nhận · giữ lại bảo hành · đã đề nghị · đã chi · còn lại), bảng
 * đơn giá khoán, các đợt xác nhận khối lượng và lịch sử đánh giá chất lượng / an toàn THEO ĐỢT. Không
 * có giá trị hợp đồng với khách (Thi công không xem) — chỉ giá trị khoán của tổ đội.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatCurrency, formatDate, formatNumber, toNvgDateInput } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  PERIOD_STATUS_META,
  PRICING_METHOD_LABELS,
  useCreatePeriod,
  useCreateSubcontractContract,
  useLineProgress,
  useSaveLine,
  useSiteCostLines,
  useSubcontractLedger,
  useSubcontractPeriods,
  useSubcontractor,
  useUpdateSubcontractor,
  type LedgerRow,
  type SubcontractorDetail,
} from '@/hooks/use-subcontracts';
import { useCan } from '@/lib/auth';
import { parseDecimal } from './subcontract-selection-page';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function SubcontractorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useSubcontractor(id);
  const { data: ledger } = useSubcontractLedger(data?.construction_site_id);
  const canEdit = useCan('TC', 'edit');

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data)
    return (
      <RecordNotFound
        entity="tổ đội"
        listPath="/tc/cong-trinh"
        listLabel="Quay lại danh sách công trình"
      />
    );
  const row = (ledger ?? []).find((r) => r.subcontractor_id === data.id) ?? null;

  return (
    <>
      <PageHeader
        title={data.name}
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          {
            label: data.site?.code ?? 'Công trình',
            to: `/tc/cong-trinh/${data.construction_site_id}?tab=to-doi`,
          },
          { label: data.name },
        ]}
        description={`${PRICING_METHOD_LABELS[data.pricing_method]} · ${data.scope_of_work}`}
      />
      <div className="space-y-4">
        <LedgerCard row={row} />
        <ContractBlock sub={data} />
        <SettingsBlock sub={data} canEdit={canEdit} />
        <LinesBlock sub={data} canEdit={canEdit} />
        <PeriodsBlock sub={data} canEdit={canEdit} openPeriodId={row?.open_period_id ?? null} />
      </div>
    </>
  );
}

function LedgerCard({ row }: { row: LedgerRow | null }) {
  if (!row) return null;
  const cells: [string, string][] = [
    ['Giá trị khoán', row.contract_value != null ? formatCurrency(row.contract_value) : 'Chưa có'],
    ['Đã xác nhận', formatCurrency(row.confirmed_gross)],
    ['Giữ lại bảo hành', formatCurrency(row.retention_held)],
    ['Đã đề nghị', formatCurrency(row.requested)],
    ['Đã chi', formatCurrency(row.paid)],
    ['Còn phải trả', formatCurrency(row.remaining_payable)],
    ['Khoán còn lại', formatCurrency(row.remaining_contract)],
  ];
  return (
    <section aria-label="Sổ theo dõi tổ đội" className="rounded-card bg-surface p-4">
      <h2 className="mb-2 font-semibold">Sổ theo dõi</h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-fg-subtle">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContractBlock({ sub }: { sub: SubcontractorDetail }) {
  const canDraft = useCan('HD', 'create');
  const create = useCreateSubcontractContract();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-card bg-surface p-4">
      <h2 className="mb-1 font-semibold">Hợp đồng khoán</h2>
      {sub.contract_id ? (
        <p>
          Đã có hợp đồng khoán.{' '}
          {canDraft && (
            <Link to={`/hd/hop-dong/${sub.contract_id}`} className="text-brand hover:underline">
              Mở hợp đồng
            </Link>
          )}
        </p>
      ) : !sub.selection_id ? (
        <p className="text-fg-subtle">
          Tổ đội thêm tay, chưa qua chọn thầu phụ. Muốn có hợp đồng khoán thì lập gói việc ở tab Tổ
          đội của công trình và gửi duyệt.
        </p>
      ) : canDraft ? (
        <>
          <Button
            variant="secondary"
            disabled={create.isPending}
            onClick={() => {
              setError(null);
              create
                .mutateAsync({ subcontractorId: sub.id })
                .then((cid) => navigate(`/hd/hop-dong/${cid}`))
                .catch((err: unknown) => setError(toUserMessage(err, 'create')));
            }}
          >
            Soạn hợp đồng khoán
          </Button>
          {error && (
            <p role="alert" className="mt-1 text-status-overdue">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-fg-subtle">
          Đã duyệt chọn — chờ Phòng Dự án / Kinh doanh soạn hợp đồng khoán từ mẫu.
        </p>
      )}
    </section>
  );
}

function SettingsBlock({ sub, canEdit }: { sub: SubcontractorDetail; canEdit: boolean }) {
  const update = useUpdateSubcontractor();
  const { data: costLines } = useSiteCostLines(sub.construction_site_id);
  const [retention, setRetention] = useState(
    sub.retention_rate != null ? formatNumber(sub.retention_rate) : '',
  );
  const [error, setError] = useState<string | null>(null);

  function save(values: Record<string, unknown>) {
    setError(null);
    update
      .mutateAsync({ id: sub.id, values })
      .catch((err: unknown) => setError(toUserMessage(err, 'edit')));
  }

  if (!canEdit) {
    return (
      <section className="rounded-card bg-surface p-4 text-fg-subtle">
        Giữ lại bảo hành:{' '}
        {sub.retention_rate != null ? `${formatNumber(sub.retention_rate)} %` : 'Không giữ'} · Dòng
        ngân sách: {sub.cost_code ?? 'Chưa gắn'}
      </section>
    );
  }
  return (
    <section className="rounded-card bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Tỷ lệ giữ lại bảo hành (%)"
          hint="Để trống nếu không giữ. Đợt đã ký giữ tỷ lệ lúc ký — đổi ở đây chỉ áp cho đợt sau."
        >
          <Input
            inputMode="decimal"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
            onBlur={() => {
              const n = parseDecimal(retention);
              if (retention.trim() && (n == null || n < 0 || n >= 100)) {
                setError('Tỷ lệ giữ lại bảo hành từ 0 đến dưới 100 %.');
                return;
              }
              if (n !== (sub.retention_rate == null ? null : Number(sub.retention_rate))) {
                save({ retention_rate: n });
              }
            }}
          />
        </Field>
        <Field label="Dòng ngân sách chi trả" hint="Đề nghị thanh toán phân bổ vào dòng này.">
          <select
            value={sub.cost_code ?? ''}
            onChange={(e) => save({ cost_code: e.target.value || null })}
            className={SELECT_CLASS}
          >
            <option value="">Chưa gắn</option>
            {(costLines ?? []).map((l) => (
              <option key={l.cost_code} value={l.cost_code}>
                {l.cost_code} — {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </section>
  );
}

function LinesBlock({ sub, canEdit }: { sub: SubcontractorDetail; canEdit: boolean }) {
  const { data: lines } = useLineProgress(sub.id);
  const save = useSaveLine();
  const [item, setItem] = useState('');
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lumpSum = sub.pricing_method === 'khoan_gon';
  const rows = lines ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = lumpSum ? 1 : parseDecimal(qty);
    if (!item.trim() || !unit.trim() || q == null || q <= 0 || !price) {
      setError('Ghi hạng mục, đơn vị, khối lượng hợp đồng và đơn giá.');
      return;
    }
    try {
      await save.mutateAsync({
        subcontractorId: sub.id,
        values: {
          position: rows.length + 1,
          item: item.trim(),
          unit: unit.trim(),
          contract_quantity: q,
          unit_price: price,
        },
      });
      setItem('');
      setUnit('');
      setQty('');
      setPrice('');
    } catch (err) {
      setError(toUserMessage(err, 'create'));
    }
  }

  return (
    <section className="rounded-card bg-surface p-4">
      <h2 className="mb-2 font-semibold">{lumpSum ? 'Giá trị khoán gọn' : 'Bảng đơn giá khoán'}</h2>
      {rows.length === 0 ? (
        <EmptyState
          message={
            lumpSum
              ? 'Chưa có dòng trọn gói. Ghi giá trị khoán gọn để lập đợt xác nhận khối lượng.'
              : 'Chưa có hạng mục nào. Ghi hạng mục, khối lượng và đơn giá khoán để lập đợt xác nhận khối lượng.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="text-xs text-fg-subtle">
              <tr>
                <th className="py-1 pr-2">Hạng mục</th>
                <th className="py-1 pr-2">Đơn vị</th>
                <th className="py-1 pr-2 text-right">Khối lượng HĐ</th>
                <th className="py-1 pr-2 text-right">Đơn giá</th>
                <th className="py-1 pr-2 text-right">Thành tiền</th>
                <th className="py-1 text-right">Đã xác nhận</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.line_id} className="border-t border-border">
                  <td className="py-1 pr-2">{l.item}</td>
                  <td className="py-1 pr-2">{l.unit}</td>
                  <td className="py-1 pr-2 text-right">{formatNumber(l.contract_quantity, 3)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(l.unit_price)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(l.amount)}</td>
                  <td className="py-1 text-right">
                    {lumpSum
                      ? `${formatNumber(Number(l.confirmed_quantity) * 100, 1)} %`
                      : formatNumber(l.confirmed_quantity, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && !(lumpSum && rows.length > 0) && (
        <form onSubmit={(e) => void add(e)} noValidate className="mt-3 grid gap-3 sm:grid-cols-4">
          <Field label="Hạng mục" required>
            <Input value={item} onChange={(e) => setItem(e.target.value)} />
          </Field>
          <Field label="Đơn vị" required>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={lumpSum ? 'gói' : 'm2'}
            />
          </Field>
          {!lumpSum && (
            <Field label="Khối lượng hợp đồng" required>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
          )}
          <Field label={lumpSum ? 'Giá trị trọn gói' : 'Đơn giá'} required>
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <div className="sm:col-span-4">
            <Button type="submit" variant="secondary" disabled={save.isPending}>
              Thêm hạng mục
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </section>
  );
}

function PeriodsBlock({
  sub,
  canEdit,
  openPeriodId,
}: {
  sub: SubcontractorDetail;
  canEdit: boolean;
  openPeriodId: string | null;
}) {
  const { data: periods } = useSubcontractPeriods(sub.id);
  const create = useCreatePeriod();
  const navigate = useNavigate();
  const [end, setEnd] = useState(toNvgDateInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const rows = periods ?? [];
  const rated = rows.filter((p) => p.quality_rating != null);

  return (
    <section className="rounded-card bg-surface p-4">
      <h2 className="mb-2 font-semibold">Đợt xác nhận khối lượng</h2>
      {canEdit && !openPeriodId && (
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Tính tới ngày" className="w-48">
            <DateInput value={end} onChange={setEnd} />
          </Field>
          <Button
            variant="primary"
            disabled={create.isPending || !end}
            onClick={() => {
              setError(null);
              create
                .mutateAsync({
                  subcontractorId: sub.id,
                  siteId: sub.construction_site_id,
                  periodStart: null,
                  periodEnd: end,
                })
                .then((pid) => navigate(`/tc/dot-khoi-luong/${pid}`))
                .catch((err: unknown) => setError(toUserMessage(err, 'create')));
            }}
          >
            Lập đợt xác nhận khối lượng
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-2 text-status-overdue">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState message="Chưa có đợt nào. Chỉ phần đã nghiệm thu mới được tính vào đợt." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
              <Link
                to={`/tc/dot-khoi-luong/${p.id}`}
                className="font-medium text-brand hover:underline"
              >
                Đợt {p.period_no} · {p.code}
              </Link>
              <span className="text-fg-subtle">tới {formatDate(p.period_end)}</span>
              <StatusWithLabel
                status={PERIOD_STATUS_META[p.status].statusGroup}
                label={PERIOD_STATUS_META[p.status].label}
              />
              {p.net_amount != null && <span>{formatCurrency(p.net_amount)}</span>}
            </li>
          ))}
        </ul>
      )}
      {rated.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 font-semibold">Đánh giá theo đợt</h3>
          <ul className="space-y-1">
            {rated.map((p) => (
              <li key={p.id}>
                Đợt {p.period_no}: chất lượng {p.quality_rating}/5
                {p.safety_rating != null && ` · an toàn ${p.safety_rating}/5`}
                {p.evaluation_notes && (
                  <span className="text-fg-subtle"> — {p.evaluation_notes}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
