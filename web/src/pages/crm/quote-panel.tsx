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
  formatQuantity,
  QUOTE_STAGES,
  vatNote,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { StatusLozenge, StatusWithLabel } from '@/components/ui/status-lozenge';
import { WaitingOn } from '@/components/entity/waiting-on';
import { useApprovalHistory, type ApprovalHistoryEntry } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useQuotes,
  useRecordQuoteResponse,
  useRequestQuoteApproval,
  useQuoteItems,
  useSendQuote,
  type QuoteRecord,
} from '@/hooks/use-quotes';
import { cn } from '@/lib/utils';
import { QuoteDocumentActions } from './quote-document';

const EM_DASH = '—';

export function QuotePanel({
  opportunityId,
  canEdit,
  isHandedOver,
  stage,
  missingForQuote = [],
}: {
  opportunityId: string;
  canEdit: boolean;
  isHandedOver: boolean;
  /** Bước hiện tại của cơ hội — chỉ Báo giá / Đàm phán mới lập báo giá (0184). */
  stage: string;
  /** Điều kiện còn thiếu để sang Báo giá — nói ngay tại chỗ thay vì để bấm rồi báo lỗi. */
  missingForQuote?: string[];
}) {
  const { data: quotes, isLoading, error, refetch } = useQuotes(opportunityId);
  const approvals = useApprovalHistory(
    'quotes',
    (quotes ?? []).map((q) => q.id),
  );

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
  const effectiveQuoteId = findEffectiveQuoteId(list);

  return (
    <div className="space-y-4">
      {actionError && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {actionError}
        </p>
      )}

      {editable && !QUOTE_STAGES.includes(stage) && (
        <p
          role="status"
          className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2"
        >
          Chưa lập báo giá được — cơ hội chưa sang bước Báo giá.
          {missingForQuote.length > 0 && ` Cần: ${missingForQuote.join('; ')}.`}
        </p>
      )}

      {editable && QUOTE_STAGES.includes(stage) && (
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
              isEffective={quote.id === effectiveQuoteId}
              approvals={approvals.data?.get(quote.id) ?? []}
              editable={editable}
              canSend={canEdit}
              opportunityId={opportunityId}
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

/**
 * Báo giá ĐANG HIỆU LỰC là bản mới nhất ĐÃ GỬI KHÁCH — không phải bản mới nhất trong hệ thống.
 *
 * Hai thứ đó khác nhau đúng vào lúc quan trọng nhất: khi đang soạn phiên bản kế tiếp. Lúc ấy
 * bản mới nhất là một tờ nháp chưa ai ngoài công ty nhìn thấy, còn con số khách hàng đang cầm
 * vẫn là bản gửi trước đó. Gắn nhãn "Đang hiệu lực" cho tờ nháp là nói sai giá đang cam kết
 * với khách — và Content Guidelines 4.4 ghi thẳng rằng "Đang hiệu lực" KHÔNG được dùng theo
 * nghĩa "Mới nhất".
 *
 * Trả `null` khi chưa có bản nào được gửi: khi đó chưa có giá nào có hiệu lực với khách, và
 * không thẻ nào được mang nhãn.
 */
export function findEffectiveQuoteId(
  quotes: readonly Pick<QuoteRecord, 'id' | 'version' | 'sent_to_customer_at'>[],
): string | null {
  const sent = quotes.filter((q) => q.sent_to_customer_at !== null);
  if (sent.length === 0) return null;
  return sent.reduce((newest, q) => (q.version > newest.version ? q : newest)).id;
}

interface QuoteVersionCardProps {
  quote: QuoteRecord;
  /** Bản đang có hiệu lực với KHÁCH HÀNG — xem `findEffectiveQuoteId`. */
  isEffective: boolean;
  approvals: ApprovalHistoryEntry[];
  editable: boolean;
  /** Người chịu trách nhiệm cơ hội / lãnh đạo — gửi báo giá ĐÃ DUYỆT qua Zalo (0238). */
  canSend: boolean;
  opportunityId: string;
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
  isEffective,
  approvals,
  editable,
  canSend,
  opportunityId,
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
      return { label: 'Gửi cho khách hàng', onClick: onSend, primary: true };
    }
    if (sent && !isResponding) {
      return {
        label: quote.customer_response ? 'Cập nhật phản hồi' : 'Ghi nhận phản hồi',
        onClick: onStartResponse,
        primary: false,
      };
    }
    return null;
  })();

  // Bản đang soạn nói thẳng nó đang ở đâu và bước tiếp là gì — trước đây thẻ chỉ có «Hoàn
  // thành» + «Bản đang soạn», người dùng không biết phải gửi khách thì cơ hội mới sang Đàm phán
  // (anh Dũng chạy thử 21/10/2026).
  const nextStep = (() => {
    if (!quote.is_current_version) return null;
    if (quote.status === 'draft')
      return 'Bước tiếp: bấm «Gửi phê duyệt». Ban Giám đốc duyệt xong mới gửi khách được.';
    if (quote.status === 'pending_approval')
      return 'Đang chờ phê duyệt — duyệt xong sẽ gửi khách được.';
    if (quote.status === 'completed' && !sent)
      return 'Đã duyệt. Bước tiếp: bấm «Gửi cho khách hàng» — gửi xong cơ hội tự sang bước Đàm phán.';
    if (sent && !quote.customer_response)
      return 'Đã gửi khách. Khách trả lời thì bấm «Ghi nhận phản hồi»; giá cần đổi thì lập phiên bản mới.';
    if (sent)
      return 'Khách đã phản hồi. Khách đồng ý thì bấm «Soạn hợp đồng» ở đầu trang; giá cần đổi thì lập phiên bản mới.';
    return null;
  })();

  return (
    <li
      className={cn(
        'rounded-lg border bg-surface p-4',
        // Bản đang hiệu lực nổi lên so với các bản cũ (NEN-05: "xác định rõ bản đang có hiệu lực").
        isEffective ? 'border-brand' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Phiên bản {quote.version}</span>
            {quote.status === 'completed' ? (
              <StatusWithLabel status={quote.status} label="Đã duyệt" />
            ) : (
              <StatusLozenge status={quote.status} />
            )}
            {isEffective && (
              <span className="rounded-sm bg-brand-subtle px-1.5 py-0.5 text-xs font-medium text-brand">
                Đang hiệu lực
              </span>
            )}
            {/* Bản mới nhất mà CHƯA gửi khách: nói rõ đây là bản đang soạn, để không ai đọc
                nhầm thành giá đang cam kết. Dùng màu trung tính — nhãn này không phải trạng
                thái hồ sơ, và bảng màu trạng thái chỉ có đúng 5 màu (Content Guidelines 6.3). */}
            {quote.is_current_version && !isEffective && (
              <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-fg-subtle">
                {quote.status === 'completed' ? 'Chưa gửi khách' : 'Bản đang soạn'}
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
          <Button
            variant={action.primary ? 'primary' : 'secondary'}
            size="sm"
            disabled={busy}
            onClick={action.onClick}
          >
            {busy ? 'Đang xử lý…' : action.label}
          </Button>
        )}
      </div>

      {editable && nextStep && (
        <p
          role="status"
          className="mt-3 rounded-sm border border-status-progress bg-status-progress-bg px-3 py-2"
        >
          {nextStep}
        </p>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <Cell
          label="Giá trị báo giá"
          value={quote.total_value ? formatCurrency(quote.total_value) : EM_DASH}
          strong
        />
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

      {quote.line_items_based && <QuoteItemsTable quote={quote} />}

      {quote.notes && <p className="mt-2 text-fg-subtle">{quote.notes}</p>}

      {/* Văn bản báo giá (0239): xem / tải Word, PDF; gửi Zalo theo mẫu lời nhắn, gửi email. Chỉ bản ĐÃ DUYỆT,
          đang hiện hành mới tải / gửi khách — bản khác chỉ xem, PDF in dấu «Bản nháp». */}
      <div className="mt-3">
        <QuoteDocumentActions
          quote={quote}
          opportunityId={opportunityId}
          canSend={canSend}
          canEditText={editable}
        />
      </div>

      {/* Lịch sử phê duyệt — CRM-05 yêu cầu lưu lại, DA-07 gọi đây là "căn cứ phê duyệt". */}
      {approvals.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-subtle">{APPROVAL_SUBJECT_LABELS[approval.subject]}</span>
                {approval.final_decision === null && <StatusLozenge status="pending_approval" />}
              </div>
              {approval.final_decision === null && (
                <WaitingOn approvalId={approval.id} canNudge={editable} />
              )}
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
              className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
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

/** Bảng hạng mục của một phiên bản (0239) — gấp lại, mở khi cần xem chi tiết. */
function QuoteItemsTable({ quote }: { quote: QuoteRecord }) {
  const { data: items = [], isLoading } = useQuoteItems(quote.id);
  if (isLoading) return null;
  return (
    <details className="mt-3 rounded-sm border border-border">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        {items.length} hạng mục
        {quote.subtotal_value !== null && (
          <span className="font-normal text-fg-subtle">
            {' '}
            · tổng các hạng mục {formatCurrency(quote.subtotal_value)}
          </span>
        )}
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-surface-sunken text-left text-xs text-fg-subtle">
            <tr>
              <th className="px-3 py-1.5 font-medium">STT</th>
              <th className="px-3 py-1.5 font-medium">Hạng mục</th>
              <th className="px-3 py-1.5 font-medium">Đơn vị</th>
              <th className="px-3 py-1.5 text-right font-medium">Khối lượng</th>
              <th className="px-3 py-1.5 text-right font-medium">Đơn giá</th>
              <th className="px-3 py-1.5 text-right font-medium">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-3 py-1.5">{n + 1}</td>
                <td className="px-3 py-1.5">{i.description}</td>
                <td className="px-3 py-1.5">{i.unit ?? ''}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatQuantity(i.quantity)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatCurrency(i.unit_price)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-xs text-fg-subtle">
        {vatNote(quote.vat_rate, quote.vat_included)}
        {quote.vat_amount !== null && ` Tiền thuế: ${formatCurrency(quote.vat_amount)}.`}
      </p>
    </details>
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
