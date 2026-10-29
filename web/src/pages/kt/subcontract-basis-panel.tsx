/**
 * Căn cứ của một khoản trả tổ đội / thầu phụ (G2, 0246) — Kế toán đọc ngay trên đề nghị thanh toán,
 * không cần quyền xem phân hệ Thi công: đợt xác nhận khối lượng, từng hạng mục đã nghiệm thu (và phần
 * bị loại kèm lý do), người ký, người xác nhận, số trước / sau giữ lại bảo hành, số đã đề nghị.
 */

import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@nvg/shared';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import { toUserMessage } from '@/hooks/use-error-message';
import { PERIOD_STATUS_META, usePeriodDocument } from '@/hooks/use-subcontracts';

export function SubcontractBasisPanel({ periodId }: { periodId: string }) {
  const { data, isLoading, error } = usePeriodDocument(periodId);
  if (isLoading) return <CardGridSkeleton count={1} />;
  if (error || !data) return <ErrorState message={toUserMessage(error)} />;
  const lumpSum = data.subcontractor.pricing_method === 'khoan_gon';
  const meta = PERIOD_STATUS_META[data.status];

  return (
    <div className="space-y-3">
      <div className="rounded-card bg-surface p-4">
        <p className="font-semibold">
          {data.subcontractor.name} · đợt {data.period_no} ({data.code}) · {data.site.code} —{' '}
          {data.site.name}
        </p>
        <StatusWithLabel status={meta.statusGroup} label={meta.label} className="mt-1" />
        <p className="mt-1 text-fg-subtle">
          Tính tới {formatDate(data.period_end)} · lập: {data.prepared_by_name ?? 'Không rõ'} · tổ
          trưởng ký: {data.crew_signer_name ?? 'chưa'}
          {data.signed_at ? ` (${formatDateTime(data.signed_at)})` : ''} · xác nhận:{' '}
          {data.confirmed_by_name ?? 'chưa'}
          {data.confirmed_at ? ` (${formatDateTime(data.confirmed_at)})` : ''}
        </p>
        <p className="mt-1">
          Giá trị khối lượng {formatCurrency(data.gross_amount ?? 0)} − giữ lại bảo hành{' '}
          {formatCurrency(data.retention_amount ?? 0)}
          {data.retention_rate_applied != null
            ? ` (${formatNumber(data.retention_rate_applied)} %)`
            : ''}{' '}
          = <strong>{formatCurrency(data.net_amount ?? 0)}</strong> · đã đề nghị{' '}
          {formatCurrency(data.requested_amount)}
        </p>
      </div>
      <ul className="space-y-2">
        {data.lines.map((l) => (
          <li key={l.id} className="rounded-card bg-surface px-4 py-2">
            <p className="font-medium">
              {l.item} —{' '}
              {lumpSum
                ? `${formatNumber(Number(l.quantity) * 100, 1)} %`
                : `${formatNumber(l.quantity, 3)} ${l.unit}`}{' '}
              × {formatCurrency(l.unit_price_applied ?? 0)} = {formatCurrency(l.amount ?? 0)}
            </p>
            <p className={l.excluded ? 'text-status-overdue' : 'text-fg-subtle'}>
              {l.excluded
                ? `Không tính: ${l.exclusion_reason}`
                : l.acceptance_code
                  ? `Biên bản nghiệm thu ${l.acceptance_code} — ${l.acceptance_stage}`
                  : `Mốc «${l.milestone_label}» đã đạt`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
