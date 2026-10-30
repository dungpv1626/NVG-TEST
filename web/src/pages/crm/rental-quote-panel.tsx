/**
 * Tab Báo giá của cơ hội pháp nhân cho thuê (NVS) — báo giá thuê / bán giàn giáo (gói C, 0256, câu 14).
 *
 * Kinh doanh nhập MỘT lần: dòng mua / thuê, số ngày, kiểm tồn ba nhóm, kiểm giá dưới bảng giá, công nợ
 * khách. Khách lấy từ cơ hội. Báo giá đã duyệt ghi «đã gửi khách» kèm kênh thì cơ hội tự sang Đàm phán;
 * hợp đồng cho thuê soạn từ cơ hội lấy giá trị báo giá thuê đã duyệt. Xưởng xem ở «Báo giá thuê».
 *
 * Quyền lập / sửa / gửi khớp `rls_rental_quote_row_writable`: người chịu trách nhiệm cơ hội hoặc quản lý,
 * khi cơ hội chưa bàn giao — cùng điều kiện với báo giá CRM. Chỉ lập ở Báo giá / Đàm phán (0184).
 */

import { useState } from 'react';
import { formatCurrency, formatDateTime, QUOTE_STAGES } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { RENTAL_QUOTE_STATUS_LABELS, useRentalQuotes } from '@/hooks/use-sx-rental';
import { cn } from '@/lib/utils';
import { RENTAL_QUOTE_CHANNEL_LABELS, RentalQuoteEditor } from '../sx/rental-quote-editor';

export function RentalQuotePanel({
  opportunityId,
  companyId,
  customerId,
  customerName,
  customerPhone,
  canEdit,
  isHandedOver,
  stage,
  missingForQuote = [],
}: {
  opportunityId: string;
  companyId: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  canEdit: boolean;
  isHandedOver: boolean;
  stage: string;
  missingForQuote?: string[];
}) {
  const { data: quotes, isLoading, error, refetch } = useRentalQuotes(companyId, opportunityId);
  // `undefined` = chưa chọn (mở bản mới nhất), `null` = đang lập báo giá mới.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);

  const editable = canEdit && !isHandedOver;
  const stageOk = QUOTE_STAGES.includes(stage);

  if (error) {
    return (
      <ErrorState
        message="Không tải được báo giá thuê. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={() => void refetch()}
        technicalDetail={error.message}
      />
    );
  }
  if (isLoading) return <TableSkeleton rows={3} columns={4} />;

  const list = quotes ?? [];
  const selected =
    selectedId === undefined
      ? (list[0] ?? null)
      : selectedId === null
        ? null
        : (list.find((q) => q.id === selectedId) ?? null);
  const creating = selected === null;
  const blockedNotice =
    creating && !stageOk
      ? `Chưa lập báo giá được — cơ hội chưa sang bước Báo giá.${
          missingForQuote.length > 0 ? ` Cần: ${missingForQuote.join('; ')}.` : ''
        }`
      : null;

  return (
    <div className="space-y-4">
      {list.length > 0 && (
        <section aria-label="Các báo giá thuê của cơ hội" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Báo giá thuê giàn giáo</h3>
            {editable && stageOk && !creating && (
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                Lập báo giá mới
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border rounded-card bg-surface">
            {list.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  className={cn(
                    'flex min-h-11 w-full flex-wrap items-center justify-between gap-2 p-3 text-left',
                    selected?.id === q.id && 'bg-surface-sunken',
                  )}
                >
                  <span className="font-medium">{q.code}</span>
                  <span className="text-sm text-fg-subtle">
                    {RENTAL_QUOTE_STATUS_LABELS[q.status]}
                    {q.estimated_total !== null ? ` · ${formatCurrency(q.estimated_total)}` : ''}
                    {q.sent_to_customer_at
                      ? ` · đã gửi khách ${formatDateTime(q.sent_to_customer_at)}${
                          q.sent_channel
                            ? ` qua ${RENTAL_QUOTE_CHANNEL_LABELS[q.sent_channel]}`
                            : ''
                        }`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {creating && !editable ? (
        <EmptyState message="Chưa có báo giá thuê. Người chịu trách nhiệm cơ hội lập báo giá ở đây." />
      ) : (
        <>
          {creating && <h3 className="font-semibold">Lập báo giá thuê giàn giáo</h3>}
          {blockedNotice && (
            <p
              role="status"
              className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2"
            >
              {blockedNotice}
            </p>
          )}
          <RentalQuoteEditor
            companyId={companyId}
            quote={selected}
            opportunityId={opportunityId}
            customerId={customerId}
            customerName={customerName}
            customerPhone={customerPhone}
            canEdit={editable}
            blockedNotice={blockedNotice}
            onSaved={(id) => setSelectedId(id)}
          />
        </>
      )}
    </div>
  );
}
