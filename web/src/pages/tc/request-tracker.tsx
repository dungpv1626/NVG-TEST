/**
 * Theo dõi đề nghị từ công trường — TC-10, mẫu bố cục 7 «Request Tracker» (AFD 4.7).
 *
 * Dành cho người GỬI đề nghị: bước hiện tại, ai đang giữ, đã chờ bao lâu, và nút «Thúc» ghi
 * lại lịch sử. Khảo sát công trường: việc tốn công nhất của chỉ huy trưởng không phải lập
 * đề nghị mà là hỏi lại qua Zalo — màn hình này thay đúng việc đó.
 *
 * Thẻ, không phải bảng, ở mọi cỡ màn hình: người dùng chính cầm điện thoại ở công trường.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import {
  PURCHASE_REQUEST_STAGE_META,
  formatDate,
  formatDateTime,
  formatDeadline,
  formatWaiting,
  purchaseRequestDisplayStatus,
  toNvgTimeInput,
  type PurchaseRequestStage,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useNudgeRequest,
  useRequestReminders,
  useSiteRequestTracker,
  type SiteRequestRow,
} from '@/hooks/use-site-requests';
import { useAuth, useCan } from '@/lib/auth';

export interface NudgeAvailability {
  /** Hiện nút «Thúc» hay không. */
  visible: boolean;
  /** Bấm được ngay, hay đang trong thời gian giãn cách. */
  allowed: boolean;
  /** Câu thay cho nút khi chưa thúc lại được. */
  reason: string | null;
}

/**
 * Nút «Thúc» chỉ có nghĩa khi có người ở văn phòng đang giữ đề nghị, và người bấm là người
 * gửi hoặc người được giao công trình. CSDL kiểm lại đúng các điều kiện này (`nudge_request`);
 * ở đây là để KHÔNG hiện nút rồi mới báo lỗi (CLAUDE.md 5.4).
 */
export function nudgeAvailability(
  row: Pick<SiteRequestRow, 'is_closed' | 'holder_kind' | 'next_nudge_at'>,
  canAct: boolean,
  now: Date = new Date(),
): NudgeAvailability {
  const officeHolds = row.holder_kind === 'approver' || row.holder_kind === 'purchasing';
  if (row.is_closed || !officeHolds || !canAct) {
    return { visible: false, allowed: false, reason: null };
  }
  if (row.next_nudge_at && new Date(row.next_nudge_at).getTime() > now.getTime()) {
    return {
      visible: true,
      allowed: false,
      reason: `Đã thúc — thúc lại được sau ${toNvgTimeInput(row.next_nudge_at)}.`,
    };
  }
  return { visible: true, allowed: true, reason: null };
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-fg-subtle">{label}:</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

function ReminderHistory({ entityId }: { entityId: string }) {
  const { data, isLoading } = useRequestReminders(entityId);
  if (isLoading) return <Skeleton className="h-10 w-full" />;
  if (!data || data.length === 0) return null;
  return (
    <ul className="space-y-1 border-t border-border pt-2 text-sm text-fg-subtle">
      {data.map((r) => (
        <li key={r.id}>
          {formatDateTime(r.nudged_at)} — {r.nudger?.full_name ?? 'Không rõ người thúc'} thúc
          {r.waited_hours !== null ? ` sau ${r.waited_hours} giờ chờ` : ''}
          {r.note ? `: «${r.note}»` : '.'}
        </li>
      ))}
    </ul>
  );
}

function RequestCard({
  row,
  showSite,
  canEditSite,
  meId,
}: {
  row: SiteRequestRow;
  showSite: boolean;
  canEditSite: boolean;
  meId: string | undefined;
}) {
  const nudge = useNudgeRequest();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const stage = row.stage as PurchaseRequestStage;
  const canAct = row.requested_by === meId || canEditSite;
  const availability = nudgeAvailability(row, canAct);
  const officeHolds = row.holder_kind === 'approver' || row.holder_kind === 'purchasing';

  async function onNudge() {
    setNotice(null);
    setError(null);
    try {
      await nudge.mutateAsync({ entityId: row.entity_id });
      setNotice('Đã thúc — người đang giữ đề nghị đã nhận thông báo.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  const holder =
    row.holder_label &&
    (row.holder_names.length > 0
      ? `${row.holder_label} — ${row.holder_names.join(', ')}`
      : row.holder_label);

  return (
    <li className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/mh/de-nghi-mua/${row.entity_id}`}
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            {row.code ?? 'Mở đề nghị'}
          </Link>
          <p className="text-fg">{row.title}</p>
          {showSite && (
            <p className="text-sm text-fg-subtle">
              {row.site_code} — {row.site_name}
            </p>
          )}
        </div>
        <StatusLozenge status={purchaseRequestDisplayStatus(stage, row.needed_date)} />
      </div>

      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <Line label="Bước hiện tại">{PURCHASE_REQUEST_STAGE_META[stage].label}</Line>
        {holder && <Line label="Đang giữ">{holder}</Line>}
        {!row.is_closed && row.waiting_since && (
          <Line label="Thời gian chờ">{formatWaiting(row.waiting_since)}</Line>
        )}
        {!row.is_closed && officeHolds && (
          <Line label="Hạn xử lý">
            {row.due_at ? (
              <strong>{formatDeadline(row.due_at)}</strong>
            ) : (
              <span className="text-fg-subtle">Chưa có thời hạn cam kết</span>
            )}
          </Line>
        )}
        {row.needed_date && <Line label="Cần tại công trường">{formatDate(row.needed_date)}</Line>}
        {row.promised_date && (
          <Line label="Nhà cung cấp hẹn giao">{formatDate(row.promised_date)}</Line>
        )}
        {row.requested_by_name && <Line label="Người gửi">{row.requested_by_name}</Line>}
      </dl>

      {(availability.visible || row.nudge_count > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {availability.visible &&
            (availability.allowed ? (
              <Button size="lg" onClick={() => void onNudge()} disabled={nudge.isPending}>
                <BellRing aria-hidden />
                Thúc
              </Button>
            ) : (
              <span className="text-sm text-fg-subtle">{availability.reason}</span>
            ))}
          {row.nudge_count > 0 && (
            <Button variant="link" size="sm" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Ẩn lịch sử thúc' : `Đã thúc ${row.nudge_count} lần`}
            </Button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm text-status-completed">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {showHistory && <ReminderHistory entityId={row.entity_id} />}
    </li>
  );
}

export function RequestTrackerList({
  siteId,
  mineOnly = false,
  emptyMessage,
}: {
  siteId?: string;
  mineOnly?: boolean;
  emptyMessage: string;
}) {
  const { profile } = useAuth();
  const canEditSite = useCan('TC', 'edit');
  const { data, isLoading, error } = useSiteRequestTracker({ siteId, mineOnly });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <RequestCard
          key={row.entity_id}
          row={row}
          showSite={!siteId}
          canEditSite={canEditSite}
          meId={profile?.id}
        />
      ))}
    </ul>
  );
}
