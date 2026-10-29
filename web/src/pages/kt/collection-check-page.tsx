/**
 * «Kiểm hồ sơ thanh toán» — `/kiem-ho-so-thanh-toan` (G3, 0248). Thông báo «chờ bước …» dẫn tới đây.
 *
 * Hồ sơ đề nghị thanh toán gửi chủ đầu tư đi qua bốn bước: Ban công trường xác nhận khối lượng → Trưởng phòng
 * Thi công → Dự án / QS → Kế toán. Trang chỉ liệt kê hồ sơ đang chờ ĐÚNG người đăng nhập (CSDL quyết qua
 * `my_collection_checks`), nên không bọc `ModuleGuard`: Thi công, Dự án không mở được phân hệ Kế toán.
 * Người không xem được phân hệ Hợp đồng (Thi công) không thấy số tiền, số hợp đồng — kiểm khối lượng theo
 * biên bản nghiệm thu.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDateTime, formatWaiting } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useDecideCollectionCheck,
  useMyCollectionChecks,
  type MyCollectionCheck,
} from '@/hooks/use-collection-requests';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

function CheckCard({ item }: { item: MyCollectionCheck }) {
  const decide = useDecideCollectionCheck();
  const prompt = usePromptDialog();
  const canViewSite = useCan('TC', 'view');
  const [error, setError] = useState<string | null>(null);

  async function act(pass: boolean) {
    setError(null);
    const note = await prompt.ask(
      pass
        ? {
            title: `Xác nhận «${item.step_label}» đạt?`,
            label: 'Ghi chú (nếu có)',
            confirmLabel: 'Xác nhận đạt',
            required: false,
          }
        : {
            title: `Trả lại hồ sơ ${item.code}?`,
            label: 'Lý do trả lại — Kế toán sửa theo nội dung này',
            confirmLabel: 'Trả lại',
            required: true,
          },
    );
    if (note === null) return;
    try {
      await decide.mutateAsync({ id: item.id, pass, note: note.trim() || null });
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <li className="rounded-card bg-surface p-4">
      {prompt.dialog}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">{item.code}</span>
        <span>{item.title}</span>
        <span className="ms-auto text-sm text-fg-subtle">
          {item.company_code} · {formatWaiting(item.waiting_since)}
        </span>
      </div>
      <p className="mt-1 text-sm">
        Bước của mình: <strong>{item.step_label}</strong>
        {item.round_no > 1 && <> · lần kiểm thứ {item.round_no}</>}
      </p>
      <p className="mt-1 text-sm text-fg-subtle">
        {item.site_code && (
          <>
            Công trình{' '}
            {canViewSite && item.site_id ? (
              <Link to={`/tc/cong-trinh/${item.site_id}`} className="text-brand underline">
                {item.site_code}
              </Link>
            ) : (
              item.site_code
            )}{' '}
            — {item.site_name}
          </>
        )}
        {item.acceptance_code && (
          <>
            {' '}
            · Biên bản nghiệm thu {item.acceptance_code} — {item.acceptance_stage}
          </>
        )}
        {item.contract_number && <> · Hợp đồng {item.contract_number}</>}
      </p>
      {item.amount !== null && (
        <p className="mt-1">
          Giá trị đề nghị: <strong>{formatCurrency(item.amount)}</strong>
        </p>
      )}
      {item.basis && <p className="mt-1 whitespace-pre-wrap text-sm">{item.basis}</p>}
      {item.previous_checks.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-fg-subtle">
          {item.previous_checks.map((c) => (
            <li key={c.step_no}>
              ✓ {c.step_label} — {c.decided_by}, {formatDateTime(c.decided_at)}
              {c.note && <>: {c.note}</>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void act(true)} disabled={decide.isPending}>
          Xác nhận đạt
        </Button>
        <Button variant="secondary" onClick={() => void act(false)} disabled={decide.isPending}>
          Trả lại
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </li>
  );
}

export function CollectionCheckPage() {
  const { data, isLoading, error, refetch } = useMyCollectionChecks();
  const rows = data ?? [];
  return (
    <>
      <PageHeader
        title="Kiểm hồ sơ thanh toán"
        description="Hồ sơ đề nghị thanh toán gửi chủ đầu tư đang chờ bước kiểm của mình: Ban công trường, Trưởng phòng Thi công, Dự án / QS, Kế toán."
        breadcrumbs={[{ label: 'Kiểm hồ sơ thanh toán' }]}
      />
      {isLoading ? (
        <CardGridSkeleton count={2} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message="Không có hồ sơ thanh toán nào chờ bước kiểm của mình. Hồ sơ mới tới bước sẽ có thông báo." />
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => (
            <CheckCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}
