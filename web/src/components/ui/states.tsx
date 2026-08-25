/**
 * Trạng thái rỗng, đang tải, lỗi — Webapp Flow Mục 6.7 và Content Guidelines 4.7.
 *
 * Ba quy tắc bắt buộc:
 *  1. Trạng thái RỖNG: giải thích ngắn gọn tình trạng + gợi ý hành động tiếp theo.
 *     Không để khoảng trắng trơ trọi. Luôn kèm nút thao tác nếu người dùng có quyền tạo.
 *  2. Trạng thái ĐANG TẢI: dùng khung xám placeholder (skeleton) ĐÚNG HÌNH DẠNG nội dung
 *     sắp hiện — KHÔNG dùng vòng xoay toàn màn hình, vì nó gây cảm giác treo máy.
 *  3. Trạng thái LỖI: nói bằng ngôn ngữ nghiệp vụ, KHÔNG hiện mã lỗi kỹ thuật;
 *     luôn có nút thử lại hoặc lối quay lại an toàn.
 */

import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUTTONS } from '@nvg/shared';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function EmptyState({
  message,
  action,
  icon = <Inbox className="size-6" />,
}: {
  message: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="text-fg-subtle">{icon}</div>
      <p className="max-w-md text-fg-subtle">{message}</p>
      {action}
    </div>
  );
}

/**
 * Trạng thái lỗi.
 *
 * `message` phải là ngôn ngữ nghiệp vụ (dùng mẫu ở `@nvg/shared/content` ERRORS).
 * `technicalDetail` chỉ để ghi log, KHÔNG hiển thị cho người dùng (Content Guidelines 4.6).
 */
export function ErrorState({
  message,
  onRetry,
  technicalDetail,
}: {
  message: string;
  onRetry?: () => void;
  technicalDetail?: string;
}) {
  if (technicalDetail && import.meta.env.DEV) {
    console.error('[NVG]', technicalDetail);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertCircle className="size-6 text-status-overdue" />
      <p className="max-w-md text-fg">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {BUTTONS.retry}
        </Button>
      )}
    </div>
  );
}

/** Khối xám cơ bản. Không dùng trực tiếp — dùng các skeleton có hình dạng bên dưới. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-hover', className)} />;
}

/** Skeleton hình dạng BẢNG — khớp bố cục `EntityTable` để không nhảy layout khi có dữ liệu. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex gap-4 border-b border-border px-4 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', i === 0 ? 'w-40' : 'w-24')} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-40' : 'w-24')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton hình dạng LƯỚI THẺ — dùng cho màn hình Dashboard. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}
