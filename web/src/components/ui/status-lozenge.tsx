/**
 * Nhãn trạng thái dạng Lozenge — Content Guidelines Mục 6.2 và 5.1.
 *
 * Hai quy tắc bất biến:
 *  1. NGOẠI LỆ DUY NHẤT về bo góc: bo tròn hoàn toàn, để nhãn trạng thái luôn dễ nhận ra
 *     giữa các thành phần khác (6.5).
 *  2. LUÔN hiển thị chữ kèm màu — không bao giờ dùng màu làm cách duy nhất truyền đạt
 *     thông tin (6.8, Webapp Flow 6.4). Người khiếm thị màu vẫn phải đọc được.
 */

import { STATUS_META, type StatusGroup } from '@nvg/shared';
import { cn } from '@/lib/utils';

const STYLES: Record<StatusGroup, string> = {
  draft: 'bg-status-draft-bg text-status-draft',
  pending_approval: 'bg-status-pending-bg text-status-pending',
  in_progress: 'bg-status-progress-bg text-status-progress',
  completed: 'bg-status-completed-bg text-status-completed',
  overdue: 'bg-status-overdue-bg text-status-overdue',
};

export function StatusLozenge({
  status,
  className,
}: {
  status: StatusGroup;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        STYLES[status],
        className,
      )}
      title={meta.meaning}
    >
      {meta.label}
    </span>
  );
}
