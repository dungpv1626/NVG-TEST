/**
 * Danh sách Đề nghị chi (KT-01, KT-02) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Hai cột riêng của phân hệ này trả lời đúng câu hỏi mà vướng mắc #6 trong khảo sát nêu ra —
 * "hồ sơ đang ở đâu, ai đang giữ": cột **Bước** nói hồ sơ đang ở bước nào, cột **Đang chờ**
 * nói ai phải xử lý tiếp. Gộp hai thứ đó thành một chữ "đang chờ duyệt" là quay lại đúng
 * tình trạng cũ, chỉ khác là hiện trên màn hình thay vì trong Zalo.
 *
 * Cột "thời hạn" là NGÀY ĐỀ NGHỊ ĐƯỢC THANH TOÁN: quá ngày đó mà hồ sơ còn đang chạy nghĩa
 * là nhà cung cấp hoặc tổ đội đã phải chờ. Quá hạn là trạng thái SUY RA, không lưu trong CSDL.
 */

import {
  MODULE_EMPTY_STATES,
  PAYMENT_REQUEST_STAGE_META,
  PAYMENT_REQUEST_TYPE_LABELS,
  formatCurrency,
} from '@nvg/shared';
import type { PaymentRequestStage, StatusGroup } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, useCreateActions, type EntityRow } from '@/components/entity/entity-table';
import { usePaymentRequests } from '@/hooks/use-accounting';
import { useCan } from '@/lib/auth';
import { KtNav } from './kt-nav';
import { APP_HELP } from '@/lib/help-texts';

interface PaymentRow extends EntityRow {
  stageLabel: string;
  waitingOn: string;
  typeLabel: string;
  amount: string;
}

/**
 * Trạng thái hiển thị có tính tới ngày cần thanh toán.
 *
 * Hồ sơ đã đóng (đã hạch toán, đã hủy) hoặc còn nháp thì giữ nguyên nhóm của bước — một bản
 * nháp chưa gửi đi không "quá hạn" với ai cả.
 */
export function paymentDisplayStatus(
  stage: PaymentRequestStage,
  dueDate: string | null,
  today: Date = new Date(),
): StatusGroup {
  const meta = PAYMENT_REQUEST_STAGE_META[stage];
  if (meta.isTerminal || stage === 'nhap' || stage === 'tu_choi') return meta.statusGroup;
  if (!dueDate) return meta.statusGroup;

  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return meta.statusGroup;
  return due.getTime() < today.getTime() ? 'overdue' : meta.statusGroup;
}

export function PaymentRequestListPage() {
  const canCreate = useCan('KT', 'create');
  const { data, isLoading, error, refetch } = usePaymentRequests();

  const rows: PaymentRow[] = (data ?? []).map((r) => ({
    id: r.id,
    code: r.code ?? '—',
    title: r.title,
    responsiblePerson: r.requester?.full_name ?? null,
    status: paymentDisplayStatus(r.stage, r.due_date),
    deadline: r.due_date,
    companyId: r.company_id,
    createdAt: r.created_at,
    stageLabel: PAYMENT_REQUEST_STAGE_META[r.stage].label,
    waitingOn: PAYMENT_REQUEST_STAGE_META[r.stage].waitingOn,
    typeLabel: PAYMENT_REQUEST_TYPE_LABELS[r.request_type],
    amount: r.amount,
  }));

  const { headerAction, emptyAction } = useCreateActions({
    canCreate,
    label: 'Lập đề nghị chi',
    to: '/kt/de-nghi-thanh-toan/tao-moi',
    isEmpty: !isLoading && !error && rows.length === 0,
  });

  return (
    <>
      <KtNav />
      <PageHeader
        help={APP_HELP.paymentRequests}
        title="Đề nghị chi"
        description="Thanh toán, tạm ứng và hoàn ứng — cùng một luồng duyệt bốn bước."
        breadcrumbs={[{ label: 'Kế toán – Tài chính' }, { label: 'Đề nghị chi' }]}
        actions={headerAction}
      />

      <EntityTable<PaymentRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/kt/de-nghi-thanh-toan/${row.id}`}
        searchPlaceholder="Tìm theo mã, nội dung hoặc người đề nghị…"
        emptyMessage={`${MODULE_EMPTY_STATES.KT} Đề nghị chi được lập từ bộ chứng từ mua hàng, từ chi phí phát sinh ở công trường, hoặc cho nhu cầu văn phòng.`}
        emptyAction={emptyAction}
        columns={[
          { key: 'type', header: 'Loại', render: (r) => r.typeLabel },
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'waiting',
            header: 'Đang chờ',
            render: (r) => <span className="text-fg-subtle">{r.waitingOn}</span>,
          },
          {
            key: 'amount',
            header: 'Số tiền',
            numeric: true,
            render: (r) =>
              r.amount && r.amount !== '0' ? (
                formatCurrency(r.amount)
              ) : (
                <span className="text-fg-subtle">Chưa nhập</span>
              ),
          },
        ]}
      />
    </>
  );
}
