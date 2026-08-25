/**
 * Tab Báo giá của Chi tiết Cơ hội (PRD CRM-04, CRM-05).
 *
 * Hiển thị TOÀN BỘ các phiên bản, không chỉ bản đang hiệu lực: CRM-04 yêu cầu "theo dõi CÁC
 * PHIÊN BẢN báo giá/phương án ĐÃ GỬI khách hàng và phản hồi" — biết đã chào khách mức nào,
 * khách trả lời ra sao, mới hiểu vì sao chốt ở mức hiện tại.
 *
 * Các nút hành động ở đây đều là `secondary`: hành động chính duy nhất của màn hình Chi tiết
 * Cơ hội là nút chuyển giai đoạn trên header (Content Guidelines 6.3).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  APPROVAL_SUBJECT_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useApprovalHistory, type ApprovalHistoryEntry } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useQuotes,
  useRecordQuoteResponse,
  useRequestQuoteApproval,
  useSendQuote,
  type QuoteRecord,
} from '@/hooks/use-quotes';
import { cn } from '@/lib/utils';

const EM_DASH = '—';

export function QuotePanel({
  opportunityId,
  canEdit,
  isHandedOver,
}: {
  opportunityId: string;
  canEdit: boolean;
  isHandedOver: boolean;
}) {
  const { data: quotes, isLoading, error, refetch } = useQuotes(opportunityId);
  const approvals = useApprovalHistory('quotes', (quotes ?? []).map((q) => q.id));

  const requestApproval = useRequestQuoteApproval();
  const sendQuote = useSendQuote();
  const recordResponse = useRecordQuoteResponse();

  const [actionError, setActionError] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const editable = canEdit && !isHandedOver;

  async function run(action: () => Promise<unknown>, context: 'edit' | 'approve' = 'edit') {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, context));
    }
  }

  if (error) {
    return (
      <ErrorState
        message="Không tải được danh sách báo giá. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={() => void refetch()}
        technicalDetail={error.message}
      />
    );
  }

  if (isLoading) return <TableSkeleton rows={3} columns={4} />;

  const list = quotes ?? [];

  return (
    <div className="space-y-4">
      {actionError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {actionError}
        </p>
      )}

      {editable && (
        <div className="flex justify-end">
          <Button variant="secondary" asChild>
            <Link to={`/crm/co-hoi/${opportunityId}/bao-gia/lap-moi`}>
              {list.length === 0 ? 'Lập báo giá' : 'Lập phiên bản mới'}
            </Link>
          </Button>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState message="Chưa có báo giá nào. Báo giá phải được phê duyệt nội bộ trước khi gửi khách hàng." />
      ) : (
        <ol className="space-y-3">
          {list.map((quote) => (
            <QuoteVersionCard
              key={quote.id}
              quote={quote}
              approvals={approvals.data?.get(quote.id) ?? []}
              editable={editable}
              busy={requestApproval.isPending || sendQuote.isPending || recordResponse.isPending}
              isResponding={respondingTo === quote.id}
              responseText={responseText}
              onResponseTextChange={setResponseText}
              onRequestApproval={() => void run(() => requestApproval.mutateAsync(quote.id))}
              onSend={() => void run(() => sendQuote.mutateAsync(quote.id))}
              onStartResponse={() => {
                setRespondingTo(quote.id);
                setResponseText(quote.customer_response ?? '');
              }}
              onCancelResponse={() => setRespondingTo(null)}
              onSaveResponse={() =>
                void run(async () => {
                  await recordResponse.mutateAsync({ quoteId: quote.id, response: responseText });
                  setRespondingTo(null);
                  setResponseText('');
                })
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}

interface QuoteVersionCardProps {
  quote: QuoteRecord;
  approvals: ApprovalHistoryEntry[];
  editable: boolean;
  busy: boolean;
  isResponding: boolean;
  responseText: string;
  onResponseTextChange: (v: string) => void;
  onRequestApproval: () => void;
  onSend: () => void;
  onStartResponse: () => void;
  onCancelResponse: () => void;
  onSaveResponse: () => void;
}

function QuoteVersionCard({
  quote,
  approvals,
  editable,
  busy,
  isResponding,
  responseText,
  onResponseTextChange,
  onRequestApproval,
  onSend,
  onStartResponse,
  onCancelResponse,
  onSaveResponse,
}: QuoteVersionCardProps) {
  const sent = quote.sent_to_customer_at !== null;
  const hasDiscount = quote.discount_amount !== null && BigInt(quote.discount_amount) > 0n;

  /**
   * Chỉ ĐÚNG MỘT hành động khả dụng tại mỗi trạng thái — người dùng không phải đoán bước tiếp
   * theo là gì. Thứ tự: nháp → gửi duyệt → (được duyệt) gửi khách → ghi nhận phản hồi.
   */
  const action = (() => {
    if (!editable || !quote.is_current_version) return null;
    if (quote.status === 'draft') {
      return { label: 'Gửi phê duyệt', onClick: onRequestApproval };
    }
    if (quote.status === 'completed' && !sent) {
      return { label: 'Gửi cho khách hàng', onClick: onSend };
    }
    if (sent && !isResponding) {
      return {
        label: quote.customer_response ? 'Cập nhật phản hồi' : 'Ghi nhận phản hồi',
        onClick: onStartResponse,
      };
    }
    return null;
  })();

  return (
    <li
      className={cn(
        'rounded-lg border bg-surface p-4',
        // Bản đang hiệu lực nổi lên so với các bản cũ (NEN-05: "xác định rõ bản đang có hiệu lực").
        quote.is_current_version ? 'border-brand shadow-card' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Phiên bản {quote.version}</span>
            <StatusLozenge status={quote.status} />
            {quote.is_current_version && (
              <span className="rounded-sm bg-brand-subtle px-1.5 py-0.5 text-xs font-medium text-brand">
                Đang hiệu lực
              </span>
            )}
            {sent && (
              <span className="text-xs text-fg-subtle">
                Đã gửi khách {formatDateTime(quote.sent_to_customer_at)}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-xs text-fg-subtle">{quote.code}</div>
        </div>

        {action && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={action.onClick}>
            {busy ? 'Đang xử lý…' : action.label}
          </Button>
        )}
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <Cell label="Giá trị báo giá" value={quote.total_value ? formatCurrency(quote.total_value) : EM_DASH} strong />
        <Cell
          label="Mức giảm giá"
          value={hasDiscount ? formatCurrency(quote.discount_amount!) : 'Không giảm giá'}
        />
        <Cell label="Hiệu lực đến" value={formatDate(quote.valid_until) || EM_DASH} />
      </dl>

      {hasDiscount && quote.discount_reason && (
        <p className="mt-2 rounded-sm bg-surface-sunken px-3 py-2">
          <span className="font-medium">Lý do giảm giá: </span>
          {quote.discount_reason}
        </p>
      )}

      {quote.notes && <p className="mt-2 text-fg-subtle">{quote.notes}</p>}

      {/* Lịch sử phê duyệt — CRM-05 yêu cầu lưu lại, DA-07 gọi đây là "căn cứ phê duyệt". */}
      {approvals.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-subtle">{APPROVAL_SUBJECT_LABELS[approval.subject]}</span>
                {approval.final_decision === null && <StatusLozenge status="pending_approval" />}
              </div>
              {approval.decisions.map((d) => (
                <div key={d.id} className="mt-1 flex gap-2">
                  {d.decision === 'approved' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-completed" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-status-overdue" />
                  )}
                  <div className="min-w-0">
                    <span className="font-medium">
                      {d.decision === 'approved' ? 'Đã phê duyệt' : 'Đã từ chối'}
                    </span>
                    <span className="text-fg-subtle">
                      {' · '}
                      {d.decided_by_user?.full_name ?? 'Không rõ'} · {formatDateTime(d.decided_at)}
                    </span>
                    {d.note && <p>{d.note}</p>}
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {/* Phản hồi của khách hàng — CRM-04. */}
      {isResponding ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <label className="block space-y-1.5">
            <span className="block font-medium">Phản hồi của khách hàng</span>
            <textarea
              value={responseText}
              onChange={(e) => onResponseTextChange(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Khách chấp thuận, đề nghị giảm thêm, yêu cầu điều chỉnh phạm vi…"
              className="w-full rounded-sm border border-border bg-surface px-3 py-2 placeholder:text-fg-subtle"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onSaveResponse}>
              Lưu phản hồi
            </Button>
            <Button variant="subtle" size="sm" onClick={onCancelResponse}>
              Hủy
            </Button>
          </div>
        </div>
      ) : (
        quote.customer_response && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="font-medium">Phản hồi của khách hàng</div>
            <p>{quote.customer_response}</p>
            <div className="text-xs text-fg-subtle">{formatDateTime(quote.responded_at)}</div>
          </div>
        )
      )}
    </li>
  );
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cn('tabular-nums', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
}
