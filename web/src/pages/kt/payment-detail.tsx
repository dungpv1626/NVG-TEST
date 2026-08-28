/**
 * Chi tiết Đề nghị chi — "Hồ sơ 360°" (Webapp Flow 4.3), phục vụ KT-01 và KT-02.
 *
 * Đây là màn hình trả lời câu hỏi mà vướng mắc #6 trong khảo sát nêu ra: hồ sơ đang ở bước
 * nào, ai đang giữ, đã nằm đó bao lâu. Vì vậy dải bước nằm NGAY ĐẦU trang, trước cả tab —
 * người mở hồ sơ này gần như luôn mở vì câu hỏi đó.
 *
 * Nút hành động chính đổi theo bước, mỗi lúc MỘT nút chính (Content Guidelines 6.3):
 *   Nháp / bị trả lại  → "Gửi đi"
 *   Đang ở bước kiểm và người xem là người phải xử lý → "Xác nhận" (kèm "Trả lại")
 *   Chờ phê duyệt      → không có nút nào: việc đang nằm ở Hộp thư của người duyệt
 *   Đã duyệt           → "Ghi nhận đã chi"
 *   Đã chi             → "Đánh dấu đã hạch toán"
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  PAYMENT_CHECK_STEP_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_REQUEST_STAGE_META,
  PAYMENT_REQUEST_TYPE_LABELS,
  checkStepOfStage,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import type { PaymentMethod } from '@nvg/shared';
import {
  DetailFields,
  EntityDetail,
  RecordNotFound,
  type RelatedGroup,
} from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useAdvancePaymentStep,
  useCancelPaymentRequest,
  usePaymentAllocations,
  usePaymentRequest,
  usePaymentSteps,
  usePostPayment,
  useRecordPayment,
  useSubmitPaymentRequest,
} from '@/hooks/use-accounting';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAuth, useCan } from '@/lib/auth';
import { AllocationPanel } from './allocation-panel';
import { KtNav } from './kt-nav';
import { paymentDisplayStatus } from './payment-list';

const EM_DASH = '—';

/** Bốn bước của KT-01 hiển thị thành một dải, kèm dấu bước đang chờ. */
const FLOW: { stage: string; label: string }[] = [
  { stage: 'cho_don_vi', label: 'Đơn vị xác nhận' },
  { stage: 'cho_ke_toan', label: 'Kế toán kiểm tra' },
  { stage: 'cho_tai_chinh', label: 'Kiểm tra dòng tiền' },
  { stage: 'cho_phe_duyet', label: 'Phê duyệt theo hạn mức' },
];

export function PaymentRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canWorkKt = useCan('KT', 'edit');

  const { data, isLoading, error } = usePaymentRequest(id);
  const { data: allocations } = usePaymentAllocations(id);
  const { data: steps } = usePaymentSteps(id);

  const submit = useSubmitPaymentRequest();
  const advance = useAdvancePaymentStep();
  const cancel = useCancelPaymentRequest();
  const record = useRecordPayment();
  const post = usePostPayment();

  const [actionError, setActionError] = useState<string | null>(null);
  const [isPayFormOpen, setPayFormOpen] = useState(false);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="đề nghị chi"
        listPath="/kt/de-nghi-thanh-toan"
        listLabel="Quay lại danh sách đề nghị chi"
      />
    );
  }

  const request = data;
  const meta = PAYMENT_REQUEST_STAGE_META[request.stage];
  const isDraft = request.stage === 'nhap' || request.stage === 'tu_choi';
  const currentStep = checkStepOfStage(request.stage);
  const isRequester = profile?.id === request.requested_by;

  /*
   * Hồ sơ đang chờ CHÍNH người này xử lý hay không do CSDL quyết định, không do màn hình.
   * Ở đây chỉ ẩn nút cho người rõ ràng không liên quan: người đề nghị không tự ký duyệt hồ
   * sơ của mình. Nếu ẩn/hiện sai, hàm CSDL vẫn từ chối kèm câu nói rõ ai xử lý được.
   */
  const canActOnStep = Boolean(currentStep) && !isRequester;

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function rejectStep() {
    const note = window.prompt('Lý do trả lại hồ sơ cho người đề nghị:');
    if (note === null || note.trim() === '') return;
    void run(() =>
      advance.mutateAsync({ requestId: request.id, decision: 'rejected', note: note.trim() }),
    );
  }

  function cancelRequest() {
    const reason = window.prompt('Lý do hủy đề nghị chi:');
    if (reason === null || reason.trim() === '') return;
    void run(() => cancel.mutateAsync({ requestId: request.id, reason: reason.trim() }));
  }

  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await run(async () => {
      await record.mutateAsync({
        requestId: request.id,
        paidDate: String(values.get('paid_date') ?? ''),
        method: (values.get('method') as PaymentMethod) ?? 'chuyen_khoan',
        reference: String(values.get('reference') ?? ''),
      });
      setPayFormOpen(false);
    });
  }

  function markPosted() {
    const reference = window.prompt('Số chứng từ bên phần mềm kế toán (bỏ trống nếu chưa có):');
    if (reference === null) return;
    void run(() => post.mutateAsync({ requestId: request.id, reference: reference.trim() }));
  }

  const actions = meta.isTerminal ? undefined : (
    <>
      {isDraft && (
        <Button
          variant="primary"
          disabled={submit.isPending}
          onClick={() => void run(() => submit.mutateAsync({ requestId: request.id }))}
        >
          Gửi đi
        </Button>
      )}
      {canActOnStep && (
        <>
          <Button
            variant="primary"
            disabled={advance.isPending}
            onClick={() =>
              void run(() => advance.mutateAsync({ requestId: request.id, decision: 'approved' }))
            }
          >
            Xác nhận
          </Button>
          <Button variant="secondary" onClick={rejectStep}>
            Trả lại
          </Button>
        </>
      )}
      {canWorkKt && request.stage === 'da_duyet' && (
        <Button variant="primary" onClick={() => setPayFormOpen((open) => !open)}>
          {isPayFormOpen ? 'Đóng biểu mẫu chi' : 'Ghi nhận đã chi'}
        </Button>
      )}
      {canWorkKt && request.stage === 'da_chi' && (
        <Button variant="primary" disabled={post.isPending} onClick={markPosted}>
          Đánh dấu đã hạch toán
        </Button>
      )}
      {request.stage !== 'da_chi' && (
        <Button variant="secondary" onClick={cancelRequest}>
          Hủy đề nghị
        </Button>
      )}
    </>
  );

  const related: RelatedGroup[] = [];
  if (request.supplier) {
    related.push({
      title: 'Mua hàng – Vật tư',
      records: [
        {
          label: 'Nhà cung cấp',
          value: `${request.supplier.code} — ${request.supplier.name}`,
          to: `/mh/nha-cung-cap/${request.supplier.id}`,
        },
      ],
    });
  }
  if (request.purchase_order_id) {
    related.push({
      title: 'Bộ chứng từ',
      records: [
        {
          label: 'Đơn đặt hàng',
          value: 'Mở đơn hàng nguồn',
          to: `/mh/don-hang/${request.purchase_order_id}`,
        },
      ],
    });
  }
  if (request.contract_id) {
    related.push({
      title: 'Hợp đồng',
      records: [
        {
          label: 'Hợp đồng liên quan',
          value: 'Mở hợp đồng',
          to: `/hd/hop-dong/${request.contract_id}`,
        },
      ],
    });
  }

  return (
    <>
      <KtNav />

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
          Hồ sơ bị trả lại: {request.closed_reason} Sửa lại nội dung rồi gửi đi lần nữa.
        </p>
      )}

      {request.advance_override_reason && (
        <p className="mb-3 rounded-sm bg-status-pending-bg px-3 py-2 text-status-pending">
          Người nhận còn khoản tạm ứng chưa hoàn. Lý do xin ứng tiếp:{' '}
          {request.advance_override_reason}
        </p>
      )}

      {/* Dải bước — trả lời "đang ở đâu, chờ ai" mà không phải mở tab nào (KT-02). */}
      <ol className="mb-4 flex flex-wrap gap-2" aria-label="Các bước xử lý">
        {FLOW.map((step) => {
          const isCurrent = request.stage === step.stage;
          const isDone =
            FLOW.findIndex((s) => s.stage === request.stage) > FLOW.indexOf(step) ||
            request.stage === 'da_duyet' ||
            request.stage === 'da_chi' ||
            request.stage === 'da_hach_toan';
          return (
            <li
              key={step.stage}
              className={
                isCurrent
                  ? 'rounded-full bg-status-pending-bg px-3 py-1 font-semibold text-status-pending'
                  : isDone
                    ? 'rounded-full bg-status-completed-bg px-3 py-1 text-status-completed'
                    : 'rounded-full bg-surface-sunken px-3 py-1 text-fg-subtle'
              }
            >
              {step.label}
              {isCurrent ? ' · đang chờ' : isDone ? ' · xong' : ''}
            </li>
          );
        })}
      </ol>

      {isPayFormOpen && (
        <form
          onSubmit={(e) => void pay(e)}
          className="mb-4 grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3"
        >
          <Field label="Ngày chi" required>
            <DateInput name="paid_date" required />
          </Field>
          <Field label="Hình thức chi" required>
            <select
              name="method"
              defaultValue="chuyen_khoan"
              className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
            >
              <option value="chuyen_khoan">{PAYMENT_METHOD_LABELS.chuyen_khoan}</option>
              <option value="tien_mat">{PAYMENT_METHOD_LABELS.tien_mat}</option>
            </select>
          </Field>
          <Field
            label="Số chứng từ"
            hint="Số phiếu chi hoặc số ủy nhiệm chi. Không nhập số tài khoản cá nhân."
          >
            <Input name="reference" maxLength={64} />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" variant="primary" disabled={record.isPending}>
              Ghi nhận đã chi {formatCurrency(request.amount)}
            </Button>
          </div>
        </form>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Kế toán – Tài chính' },
          { label: 'Đề nghị chi', to: '/kt/de-nghi-thanh-toan' },
          { label: request.title },
        ]}
        title={request.title}
        code={request.code ?? EM_DASH}
        status={paymentDisplayStatus(request.stage, request.due_date)}
        responsiblePerson={request.requester?.full_name ?? null}
        deadline={request.due_date}
        actions={actions}
        related={related}
        historyContent={
          (steps ?? []).length === 0 ? (
            <EmptyState message="Chưa có bước kiểm nào được xử lý. Lịch sử xuất hiện ngay khi hồ sơ được gửi đi và người đầu tiên xác nhận." />
          ) : (
            <ul className="space-y-2">
              {(steps ?? []).map((step) => (
                <li key={step.id} className="rounded-lg border border-border bg-surface px-4 py-3">
                  <p className="font-medium">
                    {PAYMENT_CHECK_STEP_LABELS[step.step]} ·{' '}
                    {step.decision === 'approved' ? 'Đã xác nhận' : 'Trả lại'}
                  </p>
                  <p className="text-fg-muted">
                    {step.decided_by_user?.full_name ?? 'Không rõ'} ·{' '}
                    {formatDateTime(step.decided_at)}
                    {step.entered_at ? ` · nhận hồ sơ lúc ${formatDateTime(step.entered_at)}` : ''}
                  </p>
                  {step.note && <p className="mt-1">{step.note}</p>}
                </li>
              ))}
            </ul>
          )
        }
        tabs={[
          {
            id: 'phan-bo',
            label: 'Phân bổ chi phí',
            badge: allocations?.length || undefined,
            content: (
              <AllocationPanel
                requestId={request.id}
                totalAmount={request.amount}
                readOnly={!isDraft}
              />
            ),
          },
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <DetailFields
                fields={[
                  {
                    label: 'Loại đề nghị',
                    value: PAYMENT_REQUEST_TYPE_LABELS[request.request_type],
                  },
                  { label: 'Bước hiện tại', value: meta.label },
                  { label: 'Đang chờ', value: meta.waitingOn },
                  { label: 'Số tiền', value: formatCurrency(request.amount) },
                  {
                    label: 'Bên nhận',
                    value: request.supplier ? (
                      <Link
                        to={`/mh/nha-cung-cap/${request.supplier.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {request.supplier.name}
                      </Link>
                    ) : (
                      (request.payee_name ?? request.advance_user?.full_name ?? EM_DASH)
                    ),
                  },
                  { label: 'Bộ phận đề nghị', value: request.department ?? EM_DASH },
                  {
                    label: 'Đề nghị thanh toán trước',
                    value: request.due_date ? formatDate(request.due_date) : EM_DASH,
                  },
                  {
                    label: 'Hạn hoàn ứng',
                    value: request.advance_due_date
                      ? formatDate(request.advance_due_date)
                      : EM_DASH,
                  },
                  { label: 'Kỳ kế toán', value: request.accounting_period ?? EM_DASH },
                  {
                    label: 'Gửi đi lúc',
                    value: request.submitted_at ? formatDateTime(request.submitted_at) : EM_DASH,
                  },
                  {
                    label: 'Được duyệt lúc',
                    value: request.approved_at ? formatDateTime(request.approved_at) : EM_DASH,
                  },
                  {
                    label: 'Đã chi',
                    value: request.paid_date
                      ? `${formatCurrency(request.paid_amount)} ngày ${formatDate(request.paid_date)}`
                      : 'Chưa chi',
                  },
                  {
                    label: 'Hình thức chi',
                    value: request.payment_method
                      ? PAYMENT_METHOD_LABELS[request.payment_method]
                      : EM_DASH,
                  },
                  { label: 'Số chứng từ chi', value: request.payment_reference ?? EM_DASH },
                  {
                    label: 'Đã hạch toán',
                    value: request.posted_at
                      ? `${formatDateTime(request.posted_at)}${
                          request.posted_reference ? ` · ${request.posted_reference}` : ''
                        }`
                      : 'Chưa chuyển sang phần mềm kế toán',
                  },
                  { label: 'Ghi chú', value: request.notes ?? EM_DASH },
                  { label: 'Lý do đóng hồ sơ', value: request.closed_reason ?? EM_DASH },
                ]}
              />
            ),
          },
          {
            id: 'chung-tu',
            label: 'Bộ chứng từ',
            content:
              related.length === 0 ? (
                <EmptyState message="Khoản chi này không đi qua mua hàng hay hợp đồng nào. Chứng từ gốc lưu bản giấy theo quy định; hệ thống chỉ giữ phần quy trình." />
              ) : (
                <ul className="space-y-2">
                  {related.flatMap((group) =>
                    group.records.map((record) => (
                      <li
                        key={`${group.title}-${record.label}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
                      >
                        <div>
                          <p className="font-medium">{record.label}</p>
                          <p className="text-fg-muted">{record.value}</p>
                        </div>
                        {record.to && (
                          <Button variant="secondary" asChild>
                            <Link to={record.to}>Mở hồ sơ</Link>
                          </Button>
                        )}
                      </li>
                    )),
                  )}
                </ul>
              ),
          },
        ]}
      />
    </>
  );
}
