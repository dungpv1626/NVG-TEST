/**
 * Đợt thu — danh sách các đợt thanh toán khách phải trả theo hợp đồng đã ký (Đợt 3 — 3A, 0195).
 *
 * Đợt gắn vào mốc thi công / biên bản nghiệm thu: mốc đạt hoặc biên bản ký hai bên thì đợt sang
 * «Đến hạn thu» và Kế toán được báo — không phải chờ Kinh doanh nhớ ra. Đợt chưa gắn căn cứ thì
 * chỉ đến hạn theo ngày đã ghi trong hợp đồng.
 *
 * Màn hình không đánh dấu «đã thu»: số đã thu chỉ đổi qua chứng từ (Công nợ). Từ đợt đến hạn có
 * biên bản, Kế toán lập đề nghị thu tiền (3B).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONTRACT_TERM_TYPE_LABELS,
  formatCurrency,
  formatDate,
  formatDeadline,
  toNvgDateInput,
  type ContractTermType,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCollectionSchedule,
  type CollectionScheduleRow,
  type CollectionState,
} from '@/hooks/use-collections';
import { useParameterNumber } from '@/hooks/use-parameter-number';
import { useCompanyScope } from '@/lib/company-scope';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { useOpenCollectionRequest } from './collection-request-pages';
import { KtNav } from './kt-nav';

type Filter = 'den_han' | 'chua_den' | 'da_xong';

const FILTER_LABELS: Record<Filter, string> = {
  den_han: 'Đến hạn thu',
  chua_den: 'Chưa đến hạn',
  da_xong: 'Đã hoàn thành',
};

function inFilter(state: CollectionState, filter: Filter): boolean {
  if (filter === 'chua_den') return state === 'chua_den' || state === 'sap_den';
  return state === filter;
}

function stateLabel(row: CollectionScheduleRow) {
  if (row.state === 'da_xong')
    return (
      <StatusWithLabel status="completed" label={`Hoàn thành ${formatDate(row.completed_at)}`} />
    );
  if (row.state === 'den_han') {
    const late = row.due_date !== null && row.due_date < toNvgDateInput(new Date());
    return late ? (
      <StatusWithLabel status="overdue" label={formatDeadline(row.due_date)} />
    ) : (
      <StatusWithLabel status="in_progress" label="Đến hạn thu" />
    );
  }
  if (row.state === 'sap_den')
    return <StatusWithLabel status="pending_approval" label={formatDeadline(row.due_date)} />;
  return (
    <span className="text-sm text-fg-subtle">
      {row.due_date ? `Hạn ${formatDate(row.due_date)}` : 'Chưa ghi hạn'}
    </span>
  );
}

function basisText(row: CollectionScheduleRow): string {
  if (!row.basis_kind) return 'Chưa gắn mốc / biên bản — đến hạn theo ngày ghi trong hợp đồng';
  // 0253: hai căn cứ không gắn hồ sơ.
  if (row.basis_kind === 'ky') {
    return row.basis_reached_at
      ? `Khi ký hợp đồng — đã ký ${formatDate(row.basis_reached_at)}`
      : 'Khi ký hợp đồng';
  }
  if (row.basis_kind === 'bao_hanh') {
    return row.due_date
      ? `Tiền giữ lại — đến hạn khi hết bảo hành (${formatDate(row.due_date)})`
      : 'Tiền giữ lại — đến hạn khi hết bảo hành (chưa khai bảo hành công trình)';
  }
  const kind = row.basis_kind === 'moc' ? 'Mốc' : 'Biên bản';
  const where = row.site_code ? ` (công trình ${row.site_code})` : '';
  const reached = row.basis_reached_at
    ? row.basis_kind === 'moc'
      ? ` — đạt ${formatDate(row.basis_reached_at)}`
      : ` — ký ${formatDate(row.basis_reached_at)}`
    : row.basis_kind === 'moc'
      ? ' — chưa đạt'
      : ' — chưa ký';
  return `${kind} «${row.basis_label ?? ''}»${where}${reached}`;
}

export function CollectionSchedulePage() {
  const scope = useCompanyScope();
  const { data, isLoading, error, refetch } = useCollectionSchedule();
  const { data: remindDays } = useParameterNumber('kt.collection_remind_days_before');
  const [filter, setFilter] = useState<Filter>('den_han');
  const canEdit = useCan('KT', 'edit');
  const collection = useOpenCollectionRequest();
  const [message, setMessage] = useState<string | null>(null);

  const all = data ?? [];
  const rows = all.filter((r) => inFilter(r.state, filter));
  const count = (f: Filter) => all.filter((r) => inFilter(r.state, f)).length;

  return (
    <>
      <PageHeader
        title="Đợt thu"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Đợt thu' }]}
        description="Các đợt khách phải trả theo hợp đồng đã ký. Đợt gắn mốc thi công / biên bản nghiệm thu tự sang «Đến hạn thu» khi mốc đạt hoặc biên bản ký hai bên."
      />
      <KtNav />
      <SegmentedControl
        options={['den_han', 'chua_den', 'da_xong'] as const}
        value={filter}
        onChange={setFilter}
        getLabel={(f) => `${FILTER_LABELS[f]} (${count(f)})`}
        className="mb-3"
      />
      <p className="mb-4 text-sm text-fg-subtle">
        {remindDays == null
          ? 'Nhắc trước hạn: chưa cấu hình số ngày — hệ thống chỉ báo khi mốc đạt / biên bản ký hoặc khi đã tới ngày hạn.'
          : `Nhắc trước hạn ${remindDays} ngày.`}
      </p>
      {message && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {message}
        </p>
      )}
      {isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          message={
            filter === 'den_han'
              ? 'Không có đợt nào đến hạn thu. Đợt hiện ở đây khi mốc đạt, biên bản ký hai bên, hoặc tới ngày hạn.'
              : 'Không có đợt nào trong mục này.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.term_id} className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">{r.description}</p>
                <span className="text-xs text-fg-subtle">
                  {CONTRACT_TERM_TYPE_LABELS[r.term_type as ContractTermType] ?? r.term_type}
                </span>
                <span className="ms-auto">{stateLabel(r)}</span>
              </div>
              <p className="mt-1 text-fg-subtle">
                <Link to={`/hd/hop-dong/${r.contract_id}`} className="text-brand hover:underline">
                  {r.contract_number || r.contract_code}
                </Link>{' '}
                — {r.contract_title}
                {r.customer_name && <> · {r.customer_name}</>}
                {scope.isAggregate && <> · {r.contract_code.split('-')[0]}</>}
              </p>
              <p className="mt-1">
                {r.amount != null ? (
                  <strong>{formatCurrency(r.amount)}</strong>
                ) : (
                  <span className="text-fg-subtle">Chưa ghi số tiền</span>
                )}
                {r.due_date && r.state !== 'chua_den' && (
                  <span className="text-fg-subtle"> · hạn {formatDate(r.due_date)}</span>
                )}
                {r.responsible_name && (
                  <span className="text-fg-subtle"> · phụ trách {r.responsible_name}</span>
                )}
              </p>
              <p className="mt-1 text-sm">Căn cứ: {basisText(r)}</p>
              {canEdit && r.state === 'den_han' && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  disabled={collection.isPending}
                  onClick={() =>
                    void collection
                      .open({ termId: r.term_id })
                      .catch((e: unknown) => setMessage(toUserMessage(e, 'create')))
                  }
                >
                  Lập đề nghị thu
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
