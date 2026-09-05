/**
 * Nhãn trạng thái dạng Lozenge — Content Guidelines Mục 6.2 và 5.1.
 *
 * Ba quy tắc bất biến:
 *  1. NGOẠI LỆ DUY NHẤT về bo góc: bo tròn hoàn toàn, để nhãn trạng thái luôn dễ nhận ra
 *     giữa các thành phần khác (6.5).
 *  2. LUÔN hiển thị chữ kèm màu — không bao giờ dùng màu làm cách duy nhất truyền đạt
 *     thông tin (6.8, Webapp Flow 6.4). Người khiếm thị màu vẫn phải đọc được.
 *  3. LUÔN nằm trên MỘT dòng và không bị co lại.
 *
 *     Quy tắc thứ ba nhìn như chuyện trang trí nhưng không phải: đặt lozenge cạnh một tiêu
 *     đề dài trong khối `flex` thì nó bị bóp cho vừa, chữ xuống hai dòng và tràn khỏi nền bo
 *     tròn — nhãn trạng thái mất luôn hình dạng vốn là thứ để nhận ra nó. Đã xảy ra thật ở
 *     thẻ khối trên màn hình Chấm công. Chốt tại đây thay vì nhắc từng nơi dùng, vì nơi dùng
 *     thì còn thêm mãi.
 */

import { STATUS_META, type StatusGroup } from '@nvg/shared';
import { cn } from '@/lib/utils';

const STYLES: Record<StatusGroup, string> = {
  draft: 'bg-status-draft-bg text-status-draft',
  pending_approval: 'bg-status-pending-bg text-status-pending',
  in_progress: 'bg-status-progress-bg text-status-progress',
  completed: 'bg-status-completed-bg text-status-completed',
  overdue: 'bg-status-overdue-bg text-status-overdue',
  disputed: 'bg-status-disputed-bg text-status-disputed',
};

export function StatusLozenge({ status, className }: { status: StatusGroup; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        STYLES[status],
        className,
      )}
      title={meta.meaning}
    >
      {meta.label}
    </span>
  );
}

/**
 * Nhãn riêng của module đặt cạnh nhãn trạng thái chuẩn.
 *
 * Module nào cũng có trạng thái con riêng ("Đã duyệt", "Đang tuyển", "Chờ trưởng đơn vị xác
 * nhận") và tất cả đều quy về 6 nhóm chuẩn (CLAUDE.md 5.4). Hiện cả hai là đúng — nhóm chuẩn
 * cho người quét nhanh cả bảng, nhãn riêng cho người cần biết chính xác đang ở bước nào.
 *
 * Nhưng khi hai nhãn TRÙNG NHAU thì hiện cả hai thành ra "Chờ duyệt  Chờ duyệt" — người đọc
 * dừng lại một nhịp để hiểu vì sao chữ lặp, rồi kết luận là màn hình lỗi. Đã xảy ra thật ở
 * bảng Nghỉ phép. Bỏ chữ lặp ở đây, không bỏ ở từng màn hình: nơi dùng thì còn thêm mãi.
 */
export function StatusWithLabel({
  status,
  label,
  className,
}: {
  status: StatusGroup;
  label: string;
  className?: string;
}) {
  const standard = STATUS_META[status].label;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {label !== standard && <span className="text-fg-subtle">{label}</span>}
      <StatusLozenge status={status} />
    </span>
  );
}
