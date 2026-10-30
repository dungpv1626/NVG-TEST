/**
 * Duyệt ngân sách thi công ban đầu — khối trên tab Ngân sách của công trình (0253, anh Dũng 30/10/2026).
 *
 * Ngân sách lập ngay trên công trình (từ báo giá, 0235) phải được Tổng Giám đốc duyệt trước khởi công —
 * `stage_readiness('site')` chặn «Đang thi công» khi chưa duyệt. Ngân sách dựng từ dự toán ĐÃ DUYỆT của gói
 * thầu / hồ sơ thiết kế (DA-09) coi như đã duyệt. Nhãn trạng thái do CSDL đặt (`site_budget_approval`) — trước
 * 0253 màn hình ghi «Ngân sách được duyệt» dù chưa ai duyệt.
 */

import { useState } from 'react';
import { formatCurrency, formatDateTime } from '@nvg/shared';
import type { StatusGroup } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { TEXTAREA_BOX } from '@/components/ui/field-box';
import { StatusWithLabel } from '@/components/ui/status-lozenge';
import {
  useCancelSiteBudgetSubmission,
  useSubmitSiteBudget,
  type SiteBudgetApproval,
  type SiteBudgetState,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

const STATE_GROUP: Record<SiteBudgetState, StatusGroup> = {
  theo_du_toan: 'completed',
  da_duyet: 'completed',
  cho_duyet: 'pending_approval',
  tra_ve: 'draft',
  nhap: 'draft',
  chua_co: 'draft',
};

export function isBudgetApproved(a: SiteBudgetApproval | null | undefined): boolean {
  return a?.state === 'da_duyet' || a?.state === 'theo_du_toan';
}

/** Nhãn ô tổng ngân sách theo trạng thái thật. */
export function budgetTotalLabel(a: SiteBudgetApproval | null | undefined): string {
  if (!a) return 'Ngân sách';
  return isBudgetApproved(a) ? 'Ngân sách đã duyệt' : `Ngân sách (${a.state_label.toLowerCase()})`;
}

export function SiteBudgetApprovalBar({
  siteId,
  approval,
  started,
  canManage,
}: {
  siteId: string;
  approval: SiteBudgetApproval;
  started: boolean;
  canManage: boolean;
}) {
  const submit = useSubmitSiteBudget();
  const cancel = useCancelSiteBudgetSubmission();
  const [note, setNote] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Công trình đã khởi công mà chưa từng qua bước duyệt (khởi công trước 0253): không bày bước duyệt.
  if (started && !isBudgetApproved(approval)) return null;

  const pending = approval.state === 'cho_duyet';
  const canWithdraw = pending && !started && (approval.is_mine || canManage);

  return (
    <section
      aria-labelledby="duyet-ngan-sach"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="duyet-ngan-sach" className="font-semibold">
          Duyệt ngân sách thi công
        </h3>
        <StatusWithLabel status={STATE_GROUP[approval.state]} label={approval.state_label} />
      </div>
      <p className="mt-1 text-sm text-fg-subtle">
        {approval.state === 'theo_du_toan'
          ? 'Ngân sách dựng từ dự toán đã được duyệt ở gói thầu / hồ sơ thiết kế — không cần duyệt lần nữa.'
          : 'Tổng Giám đốc duyệt ngân sách thi công ban đầu trước khi công trình sang «Đang thi công».'}
      </p>

      {approval.submission_id && approval.state !== 'theo_du_toan' && (
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {approval.total_amount !== null && (
            <div>
              <dt className="inline text-fg-subtle">Tổng đã gửi duyệt: </dt>
              <dd className="inline tabular-nums">{formatCurrency(approval.total_amount)}</dd>
            </div>
          )}
          {approval.submitted_at && (
            <div>
              <dt className="inline text-fg-subtle">Gửi lúc: </dt>
              <dd className="inline">
                {formatDateTime(approval.submitted_at)}
                {approval.submitted_by && ` — ${approval.submitted_by}`}
              </dd>
            </div>
          )}
          {approval.decided_at && approval.decided_by && (
            <div>
              <dt className="inline text-fg-subtle">
                {approval.state === 'tra_ve' ? 'Trả lại lúc: ' : 'Xử lý lúc: '}
              </dt>
              <dd className="inline">
                {formatDateTime(approval.decided_at)} — {approval.decided_by}
              </dd>
            </div>
          )}
          {approval.decision_note && (
            <div className="sm:col-span-2">
              <dt className="inline text-fg-subtle">Ý kiến: </dt>
              <dd className="inline">{approval.decision_note}</dd>
            </div>
          )}
        </dl>
      )}

      {approval.superseded && approval.state === 'nhap' && (
        <p className="mt-2 rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2 text-sm">
          Ngân sách đã sửa sau lần duyệt trước nên bản duyệt hết hiệu lực — gửi duyệt lại trước khi
          khởi công.
        </p>
      )}

      {approval.can_submit && (
        <div className="mt-3 space-y-2">
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">Ghi chú cho Tổng Giám đốc (tùy chọn)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Căn cứ lập ngân sách, khoản dự phòng, rủi ro…"
              className={TEXTAREA_BOX}
            />
          </label>
          <Button
            variant="primary"
            disabled={submit.isPending}
            onClick={() => {
              setError(null);
              submit.mutate(
                { siteId, note: note.trim() || null },
                {
                  onSuccess: () => setNote(''),
                  onError: (e) => setError(toUserMessage(e, 'edit')),
                },
              );
            }}
          >
            {submit.isPending ? 'Đang gửi…' : 'Gửi Tổng Giám đốc duyệt'}
          </Button>
        </div>
      )}

      {canWithdraw && !withdrawing && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setWithdrawing(true)}>
            Rút lại để sửa
          </Button>
        </div>
      )}
      {canWithdraw && withdrawing && (
        <div className="mt-3 space-y-2">
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium">Lý do rút lại</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={2000}
              className={TEXTAREA_BOX}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={cancel.isPending || reason.trim() === ''}
              onClick={() => {
                setError(null);
                cancel.mutate(
                  { siteId, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setWithdrawing(false);
                      setReason('');
                    },
                    onError: (e) => setError(toUserMessage(e, 'edit')),
                  },
                );
              }}
            >
              Rút lại
            </Button>
            <Button variant="subtle" size="sm" onClick={() => setWithdrawing(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-status-overdue">
          {error}
        </p>
      )}
    </section>
  );
}
