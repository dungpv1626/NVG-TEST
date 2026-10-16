/**
 * Một phê duyệt đang chờ AI, chờ bao lâu, và nút «Thúc» — người GỬI không phải đi hỏi hay gọi
 * điện (AFD 4.7, mẫu theo dõi).
 *
 * Đọc `approval_waiting_on` (0162, 0165): vai trò có hạn mức đủ cho số tiền, tên người trong vai
 * trò (trừ người gửi — không ai tự duyệt hồ sơ của mình, 0156). Không ai đủ hạn mức thì nói rõ ai
 * gỡ được, thay vì để hồ sơ nằm im. «Thúc» báo đúng những người đó và ghi lịch sử; giãn cách giữa
 * hai lần thúc là tham số hệ thống, nên nút nói rõ lúc nào thúc lại được.
 */

import { useState } from 'react';
import { formatDateTime, formatWaiting } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { useApprovalWaitingOn, useNudgeApproval } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';

export function WaitingOn({
  approvalId,
  canNudge = false,
}: {
  approvalId: string;
  /** Người đang xem là người gửi — CSDL vẫn kiểm lại. */
  canNudge?: boolean;
}) {
  const { data } = useApprovalWaitingOn(approvalId);
  const nudge = useNudgeApproval();
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return null;
  if (data.user_names.length === 0) {
    return (
      <p className="mt-1 text-sm text-status-overdue">
        Chưa có ai đủ hạn mức phê duyệt khoản này. Báo Quản trị hệ thống cấu hình hạn mức phê duyệt.
      </p>
    );
  }

  const waitUntil =
    data.next_nudge_at && new Date(data.next_nudge_at).getTime() > Date.now()
      ? data.next_nudge_at
      : null;

  async function doNudge() {
    setMessage(null);
    try {
      await nudge.mutateAsync(approvalId);
      setMessage(`Đã thúc ${data!.user_names.join(', ')}.`);
    } catch (e) {
      setMessage(toUserMessage(e, 'edit'));
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <p>
        <span className="text-fg-subtle">Đang chờ: </span>
        <span className="font-medium">{data.role_labels.join(', ')}</span>
        <span className="text-fg-subtle"> — {data.user_names.join(', ')}</span>
        <span className="text-fg-subtle"> · {formatWaiting(data.waiting_since)}</span>
        {data.nudge_count > 0 && data.last_nudged_at && (
          <span className="text-fg-subtle">
            {' '}
            · Đã thúc {data.nudge_count} lần, gần nhất {formatDateTime(data.last_nudged_at)}
          </span>
        )}
      </p>
      {canNudge && (
        <Button
          variant="secondary"
          size="sm"
          disabled={nudge.isPending || waitUntil !== null}
          title={waitUntil ? `Thúc lại được sau ${formatDateTime(waitUntil)}` : undefined}
          onClick={() => void doNudge()}
        >
          {waitUntil ? `Thúc lại sau ${formatDateTime(waitUntil).split(' — ')[1] ?? ''}` : 'Thúc'}
        </Button>
      )}
      {message && (
        <span role="status" className="text-fg-subtle">
          {message}
        </span>
      )}
    </div>
  );
}
