/**
 * Một phê duyệt đang chờ AI, chờ bao lâu — người GỬI không phải đi hỏi (AFD 4.7, mẫu theo dõi).
 *
 * Đọc `approval_waiting_on` (0162): vai trò có hạn mức đủ cho số tiền, tên người trong vai trò
 * (trừ người gửi — không ai tự duyệt hồ sơ của mình, 0156). Không ai đủ hạn mức thì nói rõ ai gỡ
 * được, thay vì để hồ sơ nằm im.
 */

import { formatWaiting } from '@nvg/shared';
import { useApprovalWaitingOn } from '@/hooks/use-approvals';

export function WaitingOn({ approvalId }: { approvalId: string }) {
  const { data } = useApprovalWaitingOn(approvalId);
  if (!data) return null;
  if (data.user_names.length === 0) {
    return (
      <p className="mt-1 text-sm text-status-overdue">
        Chưa có ai đủ hạn mức phê duyệt khoản này. Báo Quản trị hệ thống cấu hình hạn mức phê duyệt.
      </p>
    );
  }
  return (
    <p className="mt-1 text-sm">
      <span className="text-fg-subtle">Đang chờ: </span>
      <span className="font-medium">{data.role_labels.join(', ')}</span>
      <span className="text-fg-subtle"> — {data.user_names.join(', ')}</span>
      <span className="text-fg-subtle"> · {formatWaiting(data.waiting_since)}</span>
    </p>
  );
}
