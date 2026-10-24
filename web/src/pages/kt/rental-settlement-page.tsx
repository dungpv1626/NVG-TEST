/**
 * Thuê giàn giáo — đối soát và tất toán với Kế toán (migration 0145).
 *
 * Xưởng ký biên bản thu hồi với khách; mỗi biên bản đã ký thành một khoản phải thu bên Kế
 * toán. Màn hình này đặt từng hợp đồng thuê cạnh công nợ nó sinh ra để Kế toán đối soát:
 * tổng biên bản đã ký phải bằng tổng phải thu (lệch thì cảnh báo ngay trên dòng), còn biên bản
 * nào chưa ký. Khách trả hết và mọi biên bản đã ký thì «Tất toán hợp đồng»: cọc cấn trừ vào
 * phần còn phải thu, cọc thừa thành khoản phải trả hoàn cọc.
 *
 * Thu tiền từng khoản vẫn làm ở màn hình Công nợ như mọi khoản khác — ở đây không có ô nhập
 * tiền thứ hai.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, rentalSettlementPreview, type StatusGroup } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useRentalSettlements,
  useSettleRentalAgreement,
  type RentalSettlementRow,
} from '@/hooks/use-rental-returns';
import { useCan } from '@/lib/auth';
import { KtNav } from './kt-nav';

type Filter = 'cho_tat_toan' | 'dang_thue' | 'da_tat_toan' | 'tat_ca';

const FILTER_LABELS: Record<Filter, string> = {
  cho_tat_toan: 'Chờ tất toán',
  dang_thue: 'Đang cho thuê',
  da_tat_toan: 'Đã tất toán',
  tat_ca: 'Tất cả',
};

function stageOf(row: RentalSettlementRow): { filter: Filter; status: StatusGroup; label: string } {
  if (row.settled_at) return { filter: 'da_tat_toan', status: 'completed', label: 'Đã tất toán' };
  if (row.status === 'da_thu_hoi')
    return { filter: 'cho_tat_toan', status: 'pending_approval', label: 'Chờ tất toán' };
  return { filter: 'dang_thue', status: 'in_progress', label: 'Đang cho thuê' };
}

function previewOf(row: RentalSettlementRow) {
  return rentalSettlementPreview({
    deposit: row.deposit_amount,
    returns: row.returns.map((r) => ({
      amount: Number(r.revenue) + Number(r.compensation),
      signed: Boolean(r.signed_at),
    })),
    receivables: row.receivables.map((r) => ({
      direction: r.direction,
      amount: r.amount,
      settled: r.settled_amount,
    })),
  });
}

function Amount({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

function SettlementCard({
  row,
  canSettle,
  onSettle,
}: {
  row: RentalSettlementRow;
  canSettle: boolean;
  onSettle: (row: RentalSettlementRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const stage = stageOf(row);
  const p = previewOf(row);
  const receivableByReturn = new Map(
    row.receivables.filter((r) => r.rental_return_id).map((r) => [r.rental_return_id!, r]),
  );
  const refundRow = row.receivables.find((r) => r.direction === 'phai_tra');
  const returns = [...row.returns].sort((a, b) => a.return_date.localeCompare(b.return_date));

  // Hợp đồng còn đang cho thuê thì không hiện nút tất toán; đã thu hồi mà còn biên bản chưa
  // ký thì hiện nút khoá kèm lý do — không để bấm rồi mới báo lỗi.
  const blocker =
    p.unsignedCount > 0
      ? `Còn ${p.unsignedCount} biên bản chưa ký hai bên — Xưởng ký xong mới tất toán được.`
      : null;

  return (
    <li className="rounded-card bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{row.customer?.name ?? '—'}</p>
          <p className="text-fg-subtle">
            <span className="font-mono">{row.code}</span> · thuê từ {formatDate(row.start_date)}
            {row.actual_return_date ? ` · trả hết ${formatDate(row.actual_return_date)}` : ''}
          </p>
        </div>
        <StatusWithLabel status={stage.status} label={stage.label} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Amount label="Biên bản đã chốt" value={p.billed} />
        <Amount label="Đã thành phải thu" value={p.receivable} />
        <Amount label="Đã thu" value={p.collected} />
        <Amount label="Tiền đặt cọc" value={Number(row.deposit_amount)} />
        <Amount label="Còn phải thu" value={p.outstanding} strong />
      </dl>

      {p.mismatch && (
        <p
          role="alert"
          className="mt-2 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          Lệch: tổng biên bản đã ký khác tổng phải thu đã sinh ({formatCurrency(p.receivable)}).
          Kiểm tra lại khoản công nợ của hợp đồng này ở màn hình Công nợ.
        </p>
      )}

      {row.settled_at && (
        <p className="mt-2 text-fg-subtle">
          Tất toán ngày {formatDate(row.settled_at)}: cấn trừ{' '}
          {formatCurrency(row.settlement_deposit_offset ?? 0)} tiền cọc
          {Number(row.settlement_refund ?? 0) > 0
            ? `, hoàn khách ${formatCurrency(row.settlement_refund ?? 0)} (khoản phải trả${
                refundRow && Number(refundRow.settled_amount) >= Number(refundRow.amount)
                  ? ', đã chi'
                  : ', chờ chi'
              })`
            : ''}
          .
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Thu gọn' : `Đối soát ${row.returns.length} biên bản`}
        </Button>
        {canSettle && !row.settled_at && row.status === 'da_thu_hoi' && (
          <Button variant="primary" disabled={blocker !== null} onClick={() => onSettle(row)}>
            Tất toán hợp đồng
          </Button>
        )}
        <Link to="/kt/cong-no" className="self-center text-brand hover:underline">
          Thu tiền ở màn hình Công nợ
        </Link>
      </div>
      {canSettle && !row.settled_at && row.status === 'da_thu_hoi' && blocker && (
        <p className="mt-1 text-xs text-fg-subtle">{blocker}</p>
      )}

      {open && (
        <div className="mt-3 overflow-x-auto border-t border-border pt-3">
          {returns.length === 0 ? (
            <p className="text-fg-subtle">Chưa có đợt trả nào.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-fg-subtle">
                <tr>
                  <th className="py-1 pr-3 text-left font-medium">Biên bản</th>
                  <th className="py-1 pr-3 text-left font-medium">Ngày trả</th>
                  <th className="py-1 pr-3 text-right font-medium">Tiền thuê + bồi thường</th>
                  <th className="py-1 pr-3 text-left font-medium">Chữ ký</th>
                  <th className="py-1 pr-3 text-right font-medium">Phải thu</th>
                  <th className="py-1 text-right font-medium">Đã thu</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => {
                  const rec = receivableByReturn.get(r.id);
                  const total = Number(r.revenue) + Number(r.compensation);
                  const off =
                    Boolean(r.signed_at) && total > 0 && Number(rec?.amount ?? 0) !== total;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1 pr-3 font-mono">{r.code}</td>
                      <td className="py-1 pr-3">{formatDate(r.return_date)}</td>
                      <td className="whitespace-nowrap py-1 pr-3 text-right">
                        {formatCurrency(total)}
                      </td>
                      <td className="py-1 pr-3">
                        {r.signed_at ? 'Đã ký hai bên' : 'Chờ Xưởng ký'}
                      </td>
                      <td className="whitespace-nowrap py-1 pr-3 text-right">
                        {rec ? formatCurrency(rec.amount) : r.signed_at ? '—' : 'Chưa sinh'}
                        {off && (
                          <span className="ml-1 font-semibold text-status-overdue">Lệch</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1 text-right">
                        {rec ? formatCurrency(rec.settled_amount) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

export function RentalSettlementPage() {
  const canSettle = useCan('KT', 'edit');
  const { data, isLoading, error } = useRentalSettlements();
  const settle = useSettleRentalAgreement();
  const [filter, setFilter] = useState<Filter>('cho_tat_toan');
  const [pending, setPending] = useState<RentalSettlementRow | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const rows = useMemo(
    () => (data ?? []).filter((r) => filter === 'tat_ca' || stageOf(r).filter === filter),
    [data, filter],
  );

  async function confirmSettle() {
    if (!pending) return;
    setPageError(null);
    try {
      await settle.mutateAsync({ rentalAgreementId: pending.id });
      setPending(null);
    } catch (e) {
      setPending(null);
      setPageError(toUserMessage(e, 'edit'));
    }
  }

  const preview = pending ? previewOf(pending) : null;

  return (
    <>
      <PageHeader
        title="Thuê giàn giáo"
        description="Đối soát biên bản thu hồi với công nợ, và tất toán hợp đồng thuê khi khách đã trả hết."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Thuê giàn giáo' }]}
      />
      <KtNav />

      {pageError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {pageError}
        </p>
      )}

      <SegmentedControl
        className="mb-4"
        options={['cho_tat_toan', 'dang_thue', 'da_tat_toan', 'tat_ca'] as const}
        value={filter}
        onChange={setFilter}
        getLabel={(f) => FILTER_LABELS[f]}
      />

      {isLoading ? (
        <TableSkeleton rows={3} columns={5} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          message={
            filter === 'cho_tat_toan'
              ? 'Không có hợp đồng thuê nào chờ tất toán. Hợp đồng hiện ở đây khi khách đã trả hết giàn giáo.'
              : 'Không có hợp đồng thuê nào trong nhóm này.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <SettlementCard key={row.id} row={row} canSettle={canSettle} onSettle={setPending} />
          ))}
        </ul>
      )}

      {pending && preview && (
        <ConfirmDialog
          title={`Tất toán hợp đồng ${pending.code}`}
          confirmLabel="Tất toán"
          pending={settle.isPending}
          onConfirm={() => void confirmSettle()}
          onCancel={() => setPending(null)}
        >
          {`Còn phải thu ${formatCurrency(preview.outstanding)}; tiền cọc ${formatCurrency(
            Number(pending.deposit_amount),
          )}. Hệ thống ghi chứng từ cấn trừ ${formatCurrency(preview.depositOffset)} tiền cọc vào phần còn phải thu`}
          {preview.refund > 0
            ? ` và lập khoản phải trả hoàn cọc ${formatCurrency(preview.refund)} cho khách.`
            : preview.remainingDue > 0
              ? `; khách còn phải trả ${formatCurrency(preview.remainingDue)}, thu tiếp ở màn hình Công nợ.`
              : '.'}
          {' Tất toán xong không hoàn tác được.'}
        </ConfirmDialog>
      )}
    </>
  );
}
