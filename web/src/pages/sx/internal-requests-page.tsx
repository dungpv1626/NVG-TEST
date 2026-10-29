/**
 * Thuê giàn giáo nội bộ — phía Nhà Việt Steel (G5, migration 0245; QĐ-6).
 *
 * Phiếu Ban Giám đốc, mảng giàn giáo bước 11: NVC / NVO dùng giàn giáo của NVS «vẫn phải có đề nghị,
 * phê duyệt, phiếu xuất, bàn giao, điều chuyển và thu hồi như khách hàng bên ngoài», ghi nhận theo giá
 * thuê nội bộ. Màn hình này là hàng chờ của Xưởng: chuẩn bị → gửi Ban Giám đốc duyệt → xuất giàn giáo
 * thành một đơn thuê nội bộ (giá lấy từ tham số «Giá thuê giàn giáo nội bộ» lúc xuất).
 */

import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, formatNumber } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  INTERNAL_REQUEST_STATUS_LABELS,
  useCloseInternalRental,
  useInternalRentalRequests,
  useIssueInternalRental,
  usePrepareInternalRental,
  useProductPrices,
  type InternalRequest,
} from '@/hooks/use-sx-rental';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { useState } from 'react';
import { SxNav } from './sx-nav';

function estimate(r: InternalRequest, prices: Record<string, number> | undefined) {
  if (!r.expected_return_date) return null;
  const days =
    Math.round((Date.parse(r.expected_return_date) - Date.parse(r.needed_date)) / 86_400_000) + 1;
  let total = 0;
  for (const i of r.items) {
    const p = prices?.[i.material_id];
    if (p === undefined) return null;
    total += p * i.quantity * days;
  }
  return Math.round(total);
}

export function InternalRentalRequestsPage() {
  const scope = useCompanyScope();
  const canEdit = useCan('SX', 'edit');
  const companyId = scope.isAggregate ? null : scope.companyId;
  const { data, isLoading, error } = useInternalRentalRequests({ companyId });
  const { data: prices } = useProductPrices('internal_rental_price');
  const prepare = usePrepareInternalRental();
  const close = useCloseInternalRental();
  const issue = useIssueInternalRental();
  const prompt = usePromptDialog();
  const [message, setMessage] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(toUserMessage(e, 'edit'));
    }
  }

  const open = (data ?? []).filter((r) => ['cho_nvs', 'cho_duyet', 'da_duyet'].includes(r.status));
  const done = (data ?? []).filter((r) => !open.includes(r));

  function card(r: InternalRequest) {
    const est = estimate(r, prices);
    const missing = r.items.filter((i) => prices?.[i.material_id] === undefined);
    return (
      <li key={r.id} className="space-y-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">
            {r.code} — {r.site_label}
          </p>
          <span className="text-sm font-medium">{INTERNAL_REQUEST_STATUS_LABELS[r.status]}</span>
        </div>
        <p className="text-sm text-fg-subtle">
          Cần ngày {formatDate(r.needed_date)}
          {r.expected_return_date ? ` · dự kiến trả ${formatDate(r.expected_return_date)}` : ''}
          {r.requester ? ` · người đề nghị ${r.requester.full_name}` : ''}
        </p>
        <ul className="text-sm">
          {r.items.map((i) => (
            <li key={i.id}>
              {i.material?.code} — {i.material?.name}: {formatNumber(i.quantity)}{' '}
              {i.material?.unit ?? ''} · giá nội bộ{' '}
              {prices?.[i.material_id] !== undefined
                ? `${formatCurrency(prices[i.material_id]!)} / ngày`
                : 'Chưa cấu hình giá nội bộ'}
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Giá trị ước tính theo giá nội bộ hiện hành:{' '}
          {est === null ? (
            <span className="text-fg-subtle">Chưa đủ dữ liệu</span>
          ) : (
            formatCurrency(est)
          )}
        </p>
        {r.notes && <p className="text-sm text-fg-subtle">Ghi chú: {r.notes}</p>}
        {r.decision_note && <p className="text-sm">Ý kiến: {r.decision_note}</p>}
        {r.rental_agreement_id && (
          <Link to={`/sx/tai-san-cho-thue/${r.rental_agreement_id}`} className="text-sm text-brand">
            Mở đơn thuê {r.rental_agreement_code}
          </Link>
        )}
        {canEdit && r.status === 'cho_nvs' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={prepare.isPending || missing.length > 0}
              onClick={() => void run(() => prepare.mutateAsync({ id: r.id, note: null }))}
            >
              Gửi Ban Giám đốc duyệt
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void run(async () => {
                  const reason = await prompt.ask({
                    title: 'Không nhận đề nghị này?',
                    label: 'Lý do (công trình sẽ nhận được)',
                    confirmLabel: 'Từ chối đề nghị',
                  });
                  if (reason) await close.mutateAsync({ id: r.id, reason });
                })
              }
            >
              Từ chối
            </Button>
            {missing.length > 0 && (
              <p className="text-sm text-fg-subtle">
                Chưa cấu hình giá nội bộ cho {missing.map((i) => i.material?.code).join(', ')} — Ban
                Giám đốc đặt «Giá thuê giàn giáo nội bộ» ở Tham số hệ thống.
              </p>
            )}
          </div>
        )}
        {canEdit && r.status === 'da_duyet' && (
          <Button
            variant="primary"
            disabled={issue.isPending}
            onClick={() =>
              void run(async () => {
                const date = await prompt.ask({
                  title: 'Xuất giàn giáo cho công trình',
                  label: 'Ngày bắt đầu tính tiền thuê',
                  type: 'date',
                  defaultValue: r.needed_date,
                  confirmLabel: 'Xuất giàn giáo',
                  detail:
                    'Hệ thống trừ tồn kho, lập đơn thuê nội bộ với giá nội bộ hiện hành và ghi lại giá đã áp.',
                });
                if (date) await issue.mutateAsync({ id: r.id, startDate: date });
              })
            }
          >
            Xuất giàn giáo
          </Button>
        )}
      </li>
    );
  }

  return (
    <>
      {prompt.dialog}
      <PageHeader
        title="Thuê giàn giáo nội bộ"
        description="Đề nghị từ công trình NVC / NVO: chuẩn bị, gửi Ban Giám đốc duyệt, xuất giàn giáo theo giá nội bộ."
        breadcrumbs={[{ label: 'Sản xuất – Cho thuê' }, { label: 'Thuê nội bộ' }]}
      />
      <SxNav />
      {message && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {message}
        </p>
      )}
      {companyId === null ? (
        <EmptyState message="Chọn pháp nhân cho thuê (Nhà Việt Steel) ở bộ chọn góc trên bên trái." />
      ) : isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có đề nghị thuê giàn giáo nội bộ nào. Chỉ huy trưởng gửi từ tab «Giàn giáo» của công trình." />
      ) : (
        <div className="space-y-4">
          <section aria-label="Đang xử lý" className="space-y-2">
            <h2 className="text-lg font-bold">Đang xử lý ({open.length})</h2>
            {open.length === 0 ? (
              <p className="text-fg-subtle">Không còn đề nghị nào đang chờ.</p>
            ) : (
              <ul className="divide-y divide-border rounded-card bg-surface">{open.map(card)}</ul>
            )}
          </section>
          {done.length > 0 && (
            <section aria-label="Đã xong" className="space-y-2">
              <h2 className="text-lg font-bold">Đã xong ({done.length})</h2>
              <ul className="divide-y divide-border rounded-card bg-surface">{done.map(card)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
