/**
 * Biên bản nghiệm thu đã ký — cửa của Kế toán (Đợt 2 — 2D, migration 0192).
 *
 * Tiêu chí xong của Đợt 2: «biên bản ký xong xuất hiện ở Kế toán». Kế toán không có quyền xem
 * phân hệ Thi công, nên danh sách và bản in đi qua hàm riêng (`kt_signed_acceptances`,
 * `acceptance_document`) chỉ trả biên bản ĐÃ KÝ là căn cứ thu tiền (khách hàng) hoặc trả tiền (tổ
 * đội). Kế toán lập công nợ / đề nghị thanh toán ở màn hình của mình rồi bấm «Đã ghi nhận» — hệ
 * thống không tự sinh khoản tiền: thuế, hạn, đợt thanh toán theo hợp đồng là việc Kế toán quyết.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, formatDateTime } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useKtSignedAcceptances,
  useMarkAcceptanceBilled,
  type KtAcceptanceRow,
} from '@/hooks/use-acceptance-sign';
import { useCan } from '@/lib/auth';
import { printAcceptance } from '@/pages/tc/acceptance-sign';
import { useOpenCollectionRequest } from './collection-request-pages';
import { KtNav } from './kt-nav';

type Filter = 'cho' | 'da';

const FILTER_LABELS: Record<Filter, string> = {
  cho: 'Chờ ghi nhận',
  da: 'Đã ghi nhận',
};

const DIRECTION: Record<KtAcceptanceRow['acceptance_type'], string> = {
  khach_hang: 'Phải thu — chủ đầu tư',
  thau_phu: 'Phải trả — tổ đội',
  noi_bo: 'Nội bộ',
};

export function AcceptanceBillingPage() {
  const { data, isLoading, error, refetch } = useKtSignedAcceptances();
  const mark = useMarkAcceptanceBilled();
  const canEdit = useCan('KT', 'edit');
  const promptDialog = usePromptDialog();
  const collection = useOpenCollectionRequest();
  const [filter, setFilter] = useState<Filter>('cho');
  const [message, setMessage] = useState<string | null>(null);

  const rows = (data ?? []).filter((r) => (filter === 'cho') === !r.billing_recorded_at);
  const waiting = (data ?? []).filter((r) => !r.billing_recorded_at).length;

  async function record(row: KtAcceptanceRow) {
    const note = await promptDialog.ask({
      title: `Đã ghi nhận biên bản ${row.code ?? ''}?`,
      label: 'Ghi chú (số chứng từ công nợ / đề nghị thanh toán)',
      confirmLabel: 'Đã ghi nhận',
      required: false,
    });
    if (note === null) return;
    setMessage(null);
    try {
      await mark.mutateAsync({ acceptanceId: row.id, note: note.trim() || null });
    } catch (e) {
      setMessage(toUserMessage(e, 'edit'));
    }
  }

  return (
    <>
      <KtNav />
      {promptDialog.dialog}
      <PageHeader
        title="Biên bản nghiệm thu đã ký"
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Biên bản nghiệm thu' }]}
        description="Biên bản công trường đã ký hai bên: với chủ đầu tư là căn cứ thu tiền, với tổ đội là căn cứ trả tiền. Lập công nợ hoặc đề nghị thanh toán rồi bấm «Đã ghi nhận»."
      />
      <SegmentedControl
        options={['cho', 'da'] as const}
        value={filter}
        onChange={setFilter}
        getLabel={(f) => (f === 'cho' ? `${FILTER_LABELS[f]} (${waiting})` : FILTER_LABELS[f])}
        className="mb-4"
      />
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
            filter === 'cho'
              ? 'Không có biên bản nào chờ ghi nhận. Biên bản hiện ở đây ngay khi công trường và chủ đầu tư / tổ đội ký xong.'
              : 'Chưa ghi nhận biên bản nào.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-card bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">{r.stage_name}</p>
                {/* Hướng tiền bằng chữ, không bằng màu trạng thái (CGD 6.8, 6 màu chỉ cho trạng thái). */}
                <span className="text-sm font-semibold">{DIRECTION[r.acceptance_type]}</span>
                <span className="ms-auto text-xs text-fg-subtle">{r.code}</span>
              </div>
              <p className="mt-1 text-fg-subtle">
                {r.site_code} — {r.site_name}
                {r.subcontractor_name && <> · Tổ đội {r.subcontractor_name}</>}
              </p>
              <p className="mt-1">
                {r.value != null ? (
                  <strong>{formatCurrency(r.value)}</strong>
                ) : (
                  <span className="text-fg-subtle">Chưa ghi giá trị</span>
                )}
                <span className="text-fg-subtle">
                  {' '}
                  · nghiệm thu {formatDate(r.accepted_date)} · ký {formatDate(r.signed_at)}
                  {r.counterpart_name && <> · {r.counterpart_name} ký</>}
                </span>
              </p>
              {r.billing_recorded_at && (
                <p className="mt-1 text-sm text-status-completed">
                  Đã ghi nhận {formatDateTime(r.billing_recorded_at)}
                  {r.billing_recorded_by_name && <> — {r.billing_recorded_by_name}</>}
                  {r.billing_note && <> · {r.billing_note}</>}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void printAcceptance(r.id).catch((e: unknown) =>
                      setMessage(toUserMessage(e, 'view')),
                    )
                  }
                >
                  Xem biên bản
                </Button>
                {canEdit && !r.billing_recorded_at && r.acceptance_type === 'khach_hang' && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={collection.isPending}
                    onClick={() =>
                      void collection
                        .open({ acceptanceId: r.id })
                        .catch((e: unknown) => setMessage(toUserMessage(e, 'create')))
                    }
                  >
                    Lập đề nghị thu
                  </Button>
                )}
                {canEdit && !r.billing_recorded_at && (
                  <>
                    <Button
                      size="sm"
                      variant={r.acceptance_type === 'khach_hang' ? 'secondary' : 'primary'}
                      onClick={() => void record(r)}
                    >
                      Đã ghi nhận
                    </Button>
                    <Link
                      to={
                        r.acceptance_type === 'khach_hang'
                          ? '/kt/cong-no'
                          : '/kt/cong-no?chieu=phai-tra'
                      }
                      className="self-center text-sm text-brand underline"
                    >
                      Mở Công nợ
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
