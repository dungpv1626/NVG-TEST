/**
 * «Tổng quan điều hành» — trang riêng cho Ban Giám đốc và Kiểm soát nội bộ (Giai đoạn 2,
 * doc/MOC_CAI_TIEN_UX.md vấn đề 1: «lãnh đạo / kiểm soát không thấy vấn đề ngay»).
 *
 * Mẫu bố cục 1 (Dashboard, AFD 4.1): lưới ô, bấm dẫn tới danh sách đã lọc. Khác Dashboard chung
 * ở chỗ: (1) mọi ô tính ở CSDL, xuyên mọi pháp nhân, theo đúng quy tắc «quá hạn» của các danh
 * sách (`exec_overview`, 0169); (2) xếp theo MỨC — việc có vấn đề lên trước, việc ổn gom xuống
 * cuối thành một dòng — để mở ra là thấy ngay chỗ cần xử lý, không phải đọc hết các ô; (3) mỗi ô
 * kể tối đa 5 hồ sơ cụ thể, không chỉ một con số.
 *
 * Mức luôn nói bằng CHỮ («Có vấn đề», «Cần chú ý», «Ổn»), màu chỉ là phụ (CGD 6.8).
 */

import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { EMPTY_STATES, formatCurrency } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { useExecOverview, type ExecLevel, type ExecTile } from '@/hooks/use-exec-overview';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { FinanceOverviewSection } from '@/pages/bc/finance-overview';

const LEVEL: Record<ExecLevel, { text: string; className: string; order: number }> = {
  red: { text: 'Có vấn đề', className: 'border-status-overdue text-status-overdue', order: 0 },
  amber: { text: 'Cần chú ý', className: 'border-status-pending text-status-pending', order: 1 },
  ok: { text: 'Ổn', className: 'border-border text-status-completed', order: 2 },
  no_data: { text: 'Chưa đủ dữ liệu', className: 'border-border text-fg-subtle', order: 3 },
};

export function ExecOverviewPage() {
  const { profile } = useAuth();
  const { data, isLoading, error, refetch } = useExecOverview();

  const tiles = [...(data ?? [])].sort((a, b) => LEVEL[a.level].order - LEVEL[b.level].order);
  const attention = tiles.filter((t) => t.level === 'red' || t.level === 'amber');
  const calm = tiles.filter((t) => t.level === 'ok' || t.level === 'no_data');
  const redCount = tiles.filter((t) => t.level === 'red').length;

  return (
    <>
      <PageHeader
        title="Tổng quan điều hành"
        description={
          profile
            ? `Chào ${profile.fullName}, ${
                isLoading
                  ? 'đang tổng hợp tình hình toàn hệ thống.'
                  : redCount > 0
                    ? `có ${redCount} mảng cần xử lý ngay.`
                    : 'chưa có mảng nào quá hạn.'
              }`
            : undefined
        }
      />

      {error ? (
        <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <CardGridSkeleton count={6} />
      ) : (
        <div className="space-y-6">
          {attention.length > 0 && (
            <section aria-label="Cần xử lý" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {attention.map((t) => (
                <Tile key={t.key} tile={t} />
              ))}
            </section>
          )}

          {calm.length > 0 && (
            <section
              aria-label="Đang ổn"
              className="rounded-md border border-border bg-surface p-4"
            >
              <h2 className="text-sm font-semibold">Đang ổn</h2>
              <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {calm.map((t) => (
                  <li key={t.key} className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="text-fg-subtle">{t.area} · </span>
                      {t.label}
                    </span>
                    <span className={cn('shrink-0 text-xs font-medium', LEVEL[t.level].className)}>
                      {LEVEL[t.level].text}
                    </span>
                  </li>
                ))}
              </ul>
              {calm.some((t) => t.level === 'no_data') && (
                <p className="mt-2 text-xs text-fg-subtle">{EMPTY_STATES.notEnoughData}</p>
              )}
            </section>
          )}

          <FinanceOverviewSection period="thang-nay" canSeeProfit />
        </div>
      )}
    </>
  );
}

function Tile({ tile }: { tile: ExecTile }) {
  const level = LEVEL[tile.level];
  return (
    <article
      className={cn('flex flex-col rounded-md border-l-4 border bg-surface p-4', level.className)}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-fg-subtle">{tile.area}</span>
        <span className="text-xs font-semibold">{level.text}</span>
      </div>
      <h2 className="mt-1 font-semibold text-fg">{tile.label}</h2>
      <p className="mt-2 text-fg">
        <span className="text-2xl font-bold">{tile.total ?? '—'}</span>
        <span className="text-sm text-fg-subtle"> hồ sơ</span>
        {tile.amount !== null && Number(tile.amount) > 0 && (
          <span className="ml-2 text-sm font-medium">{formatCurrency(tile.amount)}</span>
        )}
      </p>
      {tile.note && <p className="mt-1 text-sm text-fg-subtle">{tile.note}</p>}

      {tile.items.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm text-fg">
          {tile.items.map((it, i) => {
            const body = (
              <>
                <span className="font-mono text-xs text-fg-subtle">{it.code}</span>{' '}
                <span className="line-clamp-1">{it.title}</span>
                {it.detail && <span className="block text-xs text-fg-subtle">{it.detail}</span>}
              </>
            );
            return (
              <li key={`${it.code}-${i}`}>
                {it.link ? (
                  <Link to={it.link} className="block rounded-sm hover:bg-surface-hover">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tile.link && (
        <Link
          to={tile.link}
          className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-brand hover:underline"
        >
          Xem danh sách <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </article>
  );
}
