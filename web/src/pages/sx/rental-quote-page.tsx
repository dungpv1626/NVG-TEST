/**
 * Báo giá thuê / bán giàn giáo — trang của Xưởng (G5 0245; gói C 0256).
 *
 * Từ 0256 báo giá thuê do Kinh doanh lập TRONG cơ hội của pháp nhân cho thuê (tab Báo giá của cơ hội) —
 * nhập một lần, không lập thêm báo giá chung. Trang này của Xưởng CHỈ XEM: danh sách báo giá, mở xem
 * dòng hàng, kiểm tồn, in; mỗi báo giá dẫn sang cơ hội. Báo giá cũ lập ở đây trước 0256 (không gắn cơ
 * hội) vẫn xem và in được.
 */

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatCurrency, formatDateTime } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { RENTAL_QUOTE_STATUS_LABELS, useRentalQuotes } from '@/hooks/use-sx-rental';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import {
  RENTAL_QUOTE_CHANNEL_LABELS,
  RentalQuoteEditor,
  printRentalQuote,
  useCompanyHead,
} from './rental-quote-editor';
import { SxNav } from './sx-nav';

export function RentalQuotePage() {
  const scope = useCompanyScope();
  const canViewCrm = useCan('CRM', 'view');
  const companyId = scope.isAggregate ? null : scope.companyId;
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('bao-gia');
  const [selectedId, setSelectedId] = useState<string | null>(openId);

  const { data: quotes, isLoading, error } = useRentalQuotes(companyId);
  const { data: companyHead } = useCompanyHead(companyId);

  // Mở từ thông báo / hộp duyệt: `?bao-gia=<id>`.
  useEffect(() => {
    if (openId) setSelectedId(openId);
  }, [openId]);

  const selected = quotes?.find((q) => q.id === selectedId) ?? null;

  function select(id: string | null) {
    setSelectedId(id);
    if (openId) setSearchParams({}, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Báo giá thuê"
        description="Báo giá thuê / bán giàn giáo do Kinh doanh lập trong cơ hội. Xưởng xem dòng hàng, tồn và in."
        breadcrumbs={[{ label: 'Sản xuất – Cho thuê' }, { label: 'Báo giá thuê' }]}
      />
      <SxNav />
      {companyId === null ? (
        <EmptyState message="Chọn pháp nhân cho thuê (Nhà Việt Steel) ở bộ chọn góc trên bên trái." />
      ) : isLoading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={toUserMessage(error, 'view')} />
      ) : (
        <div className="space-y-4">
          <p className="rounded-sm bg-surface px-3 py-2 text-sm text-ink">
            Báo giá thuê lập trong tab Báo giá của cơ hội (Kinh doanh phụ trách cơ hội lập, gửi phê
            duyệt và gửi khách). Trang này chỉ xem.
          </p>

          {selected && (
            <section aria-label="Báo giá đang xem" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">
                  {selected.code} — {selected.customer?.name ?? '—'}
                </h2>
                <div className="flex gap-2">
                  {selected.opportunity_id && canViewCrm && (
                    <Button variant="secondary" asChild>
                      <Link to={`/crm/co-hoi/${selected.opportunity_id}?tab=bao-gia`}>
                        Mở cơ hội
                      </Link>
                    </Button>
                  )}
                  <Button variant="subtle" onClick={() => select(null)}>
                    Đóng
                  </Button>
                </div>
              </div>
              <RentalQuoteEditor
                companyId={companyId}
                quote={selected}
                opportunityId={selected.opportunity_id}
                customerId={selected.customer_id}
                customerName={selected.customer?.name ?? null}
                customerPhone={null}
                canEdit={false}
              />
            </section>
          )}

          <section aria-label="Báo giá thuê" className="space-y-2">
            <h2 className="text-lg font-bold">Báo giá thuê</h2>
            {(quotes ?? []).length === 0 ? (
              <EmptyState message="Chưa có báo giá thuê nào. Kinh doanh lập báo giá trong tab Báo giá của cơ hội." />
            ) : (
              <ul className="divide-y divide-border rounded-card bg-surface">
                {(quotes ?? []).map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div>
                      <p className="font-medium">
                        {q.code} — {q.customer?.name ?? '—'}
                      </p>
                      <p className="text-sm text-fg-subtle">
                        {RENTAL_QUOTE_STATUS_LABELS[q.status]}
                        {q.estimated_total !== null
                          ? ` · ${formatCurrency(q.estimated_total)}`
                          : ''}
                        {q.special_price ? ' · có giá đặc biệt' : ''}
                        {q.credit_exceeded ? ' · công nợ vượt hạn mức' : ''}
                        {q.sent_to_customer_at
                          ? ` · đã gửi khách ${formatDateTime(q.sent_to_customer_at)}${
                              q.sent_channel
                                ? ` qua ${RENTAL_QUOTE_CHANNEL_LABELS[q.sent_channel]}`
                                : ''
                            }`
                          : ''}
                      </p>
                      <p className="text-sm text-fg-subtle">
                        {q.opportunity ? (
                          canViewCrm ? (
                            <Link
                              to={`/crm/co-hoi/${q.opportunity_id}?tab=bao-gia`}
                              className="text-brand underline-offset-2 hover:underline"
                            >
                              Cơ hội {q.opportunity.code} — {q.opportunity.name}
                            </Link>
                          ) : (
                            `Cơ hội ${q.opportunity.code} — ${q.opportunity.name}`
                          )
                        ) : (
                          'Lập ở Xưởng trước khi báo giá thuê chuyển vào cơ hội'
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => select(q.id)}>
                        Xem
                      </Button>
                      <Button variant="subtle" onClick={() => printRentalQuote(q, companyHead)}>
                        In
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
