/**
 * Chi tiết Đề nghị mua — "Hồ sơ 360°" (Webapp Flow 4.3 và 3.5).
 *
 * Hành trình của nhân viên Mua hàng ở Webapp Flow 3.5: mở đề nghị đã duyệt → hỏi và so sánh
 * báo giá → chọn nhà cung cấp → tạo đơn hàng. Thứ tự tab bám đúng chuỗi đó.
 *
 * Nút hành động chính đổi theo bước, mỗi lúc MỘT nút chính (Content Guidelines 6.3):
 * Nháp → "Gửi phê duyệt" · Đã duyệt và đã chọn nhà cung cấp → "Lập đơn đặt hàng".
 * Ở bước "Chờ phê duyệt" không có nút chính nào — việc đang nằm ở Hộp thư của người duyệt.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PURCHASE_ORDER_STAGE_META,
  PURCHASE_REQUEST_STAGE_META,
  PURCHASE_URGENCY_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  purchaseRequestDisplayStatus,
} from '@nvg/shared';
import {
  DetailFields,
  EntityDetail,
  type RelatedGroup,
  RecordNotFound,
} from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useCancelPurchaseRequest,
  useCreatePurchaseOrder,
  useOrdersOfRequest,
  usePurchaseRequest,
  usePurchaseRequestItems,
  useQuotations,
  useSubmitPurchaseRequest,
} from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useRequestReminders } from '@/hooks/use-site-requests';
import { QuotationPanel } from './quotation-panel';
import { RequestItemPanel } from './request-item-panel';

const EM_DASH = '—';

export function PurchaseRequestDetailPage() {
  const promptDialog = usePromptDialog();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canWork = useCan('MH', 'edit');

  const { data, isLoading, error } = usePurchaseRequest(id);
  const { data: items } = usePurchaseRequestItems(id);
  const { data: quotations } = useQuotations(id);
  const { data: orders } = useOrdersOfRequest(id);

  const submit = useSubmitPurchaseRequest();
  const cancel = useCancelPurchaseRequest();
  const createOrder = useCreatePurchaseOrder();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="đề nghị mua"
        listPath="/mh/de-nghi-mua"
        listLabel="Quay lại danh sách đề nghị mua"
      />
    );
  }

  const request = data;
  const isDraft = request.stage === 'nhap' || request.stage === 'tu_choi';
  const isOpenForQuotes = request.stage === 'da_duyet' || request.stage === 'dang_mua';
  const isClosed = request.stage === 'hoan_thanh' || request.stage === 'huy';
  const selectedQuote = (quotations ?? []).find((q) => q.status === 'duoc_chon');
  const activeOrder = (orders ?? []).find((o) => o.stage !== 'huy');

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  async function cancelRequest() {
    const reason = await promptDialog.ask({
      title: 'Hủy đề nghị mua?',
      label: 'Lý do hủy',
      detail: 'Đề nghị chuyển sang Đã hủy và không lập đơn đặt hàng được nữa.',
      confirmLabel: 'Hủy đề nghị',
      danger: true,
    });
    if (reason === null) return;
    void run(() => cancel.mutateAsync({ requestId: request.id, reason }));
  }

  async function order() {
    if (!selectedQuote) return;
    await run(async () => {
      const orderId = await createOrder.mutateAsync({
        quotationId: selectedQuote.id,
        requestId: request.id,
      });
      void navigate(`/mh/don-hang/${orderId}`);
    });
  }

  const actions = isClosed ? undefined : (
    <>
      {isDraft && (
        <Button
          variant="primary"
          disabled={submit.isPending}
          onClick={() => void run(() => submit.mutateAsync({ requestId: request.id }))}
        >
          Gửi phê duyệt
        </Button>
      )}
      {canWork && isOpenForQuotes && selectedQuote && !activeOrder && (
        <Button variant="primary" disabled={createOrder.isPending} onClick={() => void order()}>
          Lập đơn đặt hàng
        </Button>
      )}
      {!activeOrder && (
        <Button variant="secondary" onClick={cancelRequest}>
          Hủy đề nghị
        </Button>
      )}
    </>
  );

  const related: RelatedGroup[] = [];
  if (request.site) {
    related.push({
      title: 'Thi công',
      records: [
        {
          label: 'Công trình',
          value: `${request.site.code} — ${request.site.name}`,
          to: `/tc/cong-trinh/${request.site.id}`,
        },
      ],
    });
  }
  if ((orders ?? []).length > 0) {
    related.push({
      title: 'Mua hàng',
      records: (orders ?? []).map((o) => ({
        label: PURCHASE_ORDER_STAGE_META[o.stage].label,
        value: o.code ?? 'Đơn đặt hàng',
        to: `/mh/don-hang/${o.id}`,
      })),
    });
  }

  return (
    <>
      {promptDialog.dialog}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      {request.stage === 'tu_choi' && request.closed_reason && (
        <p className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          Đề nghị bị từ chối: {request.closed_reason} Sửa lại nội dung rồi gửi phê duyệt lần nữa.
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Mua hàng – Vật tư' },
          { label: 'Đề nghị mua', to: '/mh/de-nghi-mua' },
          { label: request.title },
        ]}
        title={request.title}
        code={request.code ?? EM_DASH}
        status={purchaseRequestDisplayStatus(request.stage, request.needed_date)}
        responsiblePerson={request.requester?.full_name ?? null}
        deadline={request.needed_date}
        actions={actions}
        related={related}
        tabs={[
          {
            id: 'mat-hang',
            label: 'Mặt hàng',
            badge: items?.length || undefined,
            content: <RequestItemPanel requestId={request.id} readOnly={!isDraft} />,
          },
          {
            id: 'bao-gia',
            label: 'Báo giá',
            badge: quotations?.length || undefined,
            content: (
              <QuotationPanel
                requestId={request.id}
                companyId={request.company_id}
                canWork={canWork}
                isOpenForQuotes={isOpenForQuotes}
              />
            ),
          },
          {
            id: 'don-hang',
            label: 'Đơn hàng',
            badge: orders?.length || undefined,
            content:
              (orders ?? []).length === 0 ? (
                <EmptyState message="Chưa có đơn đặt hàng. Đơn hàng được lập sau khi đề nghị được phê duyệt và đã chọn nhà cung cấp trong bảng so sánh báo giá." />
              ) : (
                <ul className="space-y-2">
                  {(orders ?? []).map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{o.code ?? 'Đơn đặt hàng'}</p>
                        <p className="text-fg-muted">
                          {o.supplier?.name ?? EM_DASH} · {PURCHASE_ORDER_STAGE_META[o.stage].label}
                          {o.promised_date ? ` · Hẹn giao ${formatDate(o.promised_date)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums">{formatCurrency(o.total_value)}</span>
                        <Button variant="secondary" asChild>
                          <Link to={`/mh/don-hang/${o.id}`}>Mở đơn hàng</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <DetailFields
                fields={[
                  {
                    label: 'Bước hiện tại',
                    value: PURCHASE_REQUEST_STAGE_META[request.stage].label,
                  },
                  { label: 'Mức cần', value: PURCHASE_URGENCY_LABELS[request.urgency] },
                  {
                    label: 'Thời điểm cần hàng',
                    value: request.needed_date ? formatDate(request.needed_date) : EM_DASH,
                  },
                  { label: 'Địa điểm giao', value: request.delivery_location ?? EM_DASH },
                  {
                    label: 'Công trình',
                    value: request.site ? (
                      <Link
                        to={`/tc/cong-trinh/${request.site.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {request.site.code} — {request.site.name}
                      </Link>
                    ) : (
                      'Không gắn công trình'
                    ),
                  },
                  { label: 'Mã chi phí', value: request.cost_code ?? EM_DASH },
                  // TC-10: văn phòng thấy công trường đã nhắc bao nhiêu lần — áp lực phải
                  // hiện ở nơi xử lý, không chỉ ở nơi gửi.
                  ...(request.site
                    ? [
                        {
                          label: 'Công trường đã thúc',
                          value: <NudgeSummary requestId={request.id} />,
                        },
                      ]
                    : []),
                  {
                    label: 'Giá trị ước tính',
                    value:
                      request.estimated_value && request.estimated_value !== '0'
                        ? formatCurrency(request.estimated_value)
                        : 'Chốt khi gửi phê duyệt',
                  },
                  {
                    label: 'Gửi phê duyệt lúc',
                    value: request.submitted_at ? formatDateTime(request.submitted_at) : EM_DASH,
                  },
                  {
                    label: 'Được duyệt lúc',
                    value: request.approved_at ? formatDateTime(request.approved_at) : EM_DASH,
                  },
                  { label: 'Ghi chú', value: request.notes ?? EM_DASH },
                  { label: 'Lý do đóng hồ sơ', value: request.closed_reason ?? EM_DASH },
                ]}
              />
            ),
          },
        ]}
      />
    </>
  );
}

function NudgeSummary({ requestId }: { requestId: string }) {
  const { data } = useRequestReminders(requestId);
  if (!data || data.length === 0) return <>Chưa lần nào</>;
  const last = data[0]!;
  return (
    <>
      {data.length} lần — gần nhất {formatDateTime(last.nudged_at)}
      {last.nudger ? ` (${last.nudger.full_name})` : ''}
    </>
  );
}
