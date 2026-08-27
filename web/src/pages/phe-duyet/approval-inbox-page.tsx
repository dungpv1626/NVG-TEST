/**
 * Hộp thư Phê duyệt — mẫu bố cục 6 (Webapp Flow 4.6).
 *
 * Một màn hình duy nhất cho MỌI loại phê duyệt ở MỌI module: báo giá (CRM-04, CRM-05), dự
 * toán (DA-07), hợp đồng và phát sinh (HD-05, HD-04), đề nghị mua (MH-02), điều chỉnh kiểm kê
 * (KHO-07), đề nghị chi và tạm ứng (KT-01, KT-03), nghỉ phép và yêu cầu tuyển dụng (NS-05, NS-02). Module mới KHÔNG phải sửa màn hình này —
 * chỉ ghi thêm dòng vào bảng `approvals` với `subject` tương ứng, và thêm một dòng vào bảng
 * đường dẫn bên dưới nếu hồ sơ có trang riêng.
 *
 * Danh sách hiển thị đã được RLS Mẫu C lọc theo hạn mức, không lọc lại ở đây.
 */

import { PageHeader } from '@/components/layout/app-shell';
import { ApprovalInbox, type ApprovalItem } from '@/components/entity/approval-inbox';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import {
  useDecideApproval,
  usePendingApprovals,
  type PendingApproval,
} from '@/hooks/use-approvals';
import { APPROVAL_SUBJECT_LABELS, formatCurrency, formatDateTime } from '@nvg/shared';

/**
 * Đường dẫn tới hồ sơ đầy đủ theo loại hồ sơ nguồn.
 * Module mới thêm một dòng ở đây, không phải sửa Hộp thư.
 */
function fullRecordPath(item: PendingApproval): string {
  switch (item.entity_type) {
    case 'quotes':
      // Báo giá không có trang riêng — nó là một tab của Chi tiết Cơ hội (Webapp Flow 4.3:
      // "mỗi tab là một khía cạnh của CÙNG MỘT hồ sơ, không phải các trang riêng biệt").
      return item.parent_id ? `/crm/co-hoi/${item.parent_id}?tab=bao-gia` : '/crm/co-hoi';
    case 'estimates':
      // Dự toán cũng vậy: nó là tab Dự toán của Chi tiết Gói thầu (DA-07).
      return item.parent_id ? `/da/goi-thau/${item.parent_id}?tab=du-toan` : '/da/goi-thau';
    case 'contracts':
      return `/hd/hop-dong/${item.entity_id}`;
    case 'contract_amendments':
      // Phát sinh không có trang riêng: nó là một tab của Chi tiết Hợp đồng (HD-04).
      return item.parent_id ? `/hd/hop-dong/${item.parent_id}?tab=phat-sinh` : '/hd/hop-dong';
    case 'purchase_requests':
      return `/mh/de-nghi-mua/${item.entity_id}`;
    case 'payment_requests':
      return `/kt/de-nghi-thanh-toan/${item.entity_id}`;
    case 'leave_requests':
      // Đơn nghỉ phép không có trang theo id — màn hình Nghỉ phép liệt kê đơn kèm trạng thái.
      return '/ns/nghi-phep';
    case 'recruitment_positions':
      return '/ns/tuyen-dung';
    case 'stocktakes':
      // Kiểm kê không có trang theo id — màn hình Kiểm kê liệt kê các đợt đang mở.
      return '/kho/kiem-ke';
    default:
      return '/dashboard';
  }
}

export function ApprovalInboxPage() {
  const { data, isLoading, error, refetch } = usePendingApprovals();
  const decide = useDecideApproval();

  const items: ApprovalItem[] | undefined = data?.map((row) => ({
    id: row.id,
    subject: row.subject,
    code: row.entity_code ?? '—',
    title: row.title,
    requestedBy: row.requested_by_name ?? 'Không rõ',
    requestedAt: row.requested_at,
    amount: row.amount,
    fullRecordPath: fullRecordPath(row),
    preview: <ApprovalPreview row={row} />,
  }));

  return (
    <>
      <PageHeader
        title="Việc cần làm"
        description="Mọi hồ sơ đang chờ phê duyệt, gộp chung từ tất cả module."
        breadcrumbs={[{ label: 'Việc cần làm' }]}
      />

      <ApprovalInbox
        items={items}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        onDecision={async (item, decision, note) => {
          await decide.mutateAsync({ approvalId: item.id, decision, note });
        }}
      />
    </>
  );
}

/**
 * Xem nhanh — Webapp Flow 4.6: "đủ thông tin để QUYẾT ĐỊNH mà KHÔNG cần rời khỏi Hộp thư".
 * Với giảm giá đặc biệt, thứ người duyệt cần là mức giảm và LÝ DO, không phải mã hồ sơ.
 */
function ApprovalPreview({ row }: { row: PendingApproval }) {
  return (
    <dl className="space-y-3">
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Row label="Loại nghiệp vụ" value={APPROVAL_SUBJECT_LABELS[row.subject]} />
        <Row
          label="Pháp nhân"
          value={row.company_name ? `${row.company_name} (${row.company_code})` : '—'}
        />
        <Row
          label={row.subject === 'special_discount' ? 'Mức giảm giá đề nghị' : 'Giá trị hồ sơ'}
          value={row.amount ? formatCurrency(row.amount) : 'Không gắn giá trị tiền'}
          strong
        />
        <Row label="Người đề nghị" value={row.requested_by_name ?? 'Không rõ'} />
        <Row label="Thời điểm gửi" value={formatDateTime(row.requested_at)} />
        <div>
          <dt className="text-xs text-fg-subtle">Trạng thái</dt>
          <dd className="mt-0.5">
            <StatusLozenge status="pending_approval" />
          </dd>
        </div>
      </div>

      {row.reason && (
        <div className="rounded-sm bg-surface-sunken px-3 py-2">
          <dt className="text-xs text-fg-subtle">
            {row.subject === 'special_discount' ? 'Lý do giảm giá' : 'Lý do đề nghị'}
          </dt>
          <dd className="mt-0.5">{row.reason}</dd>
        </div>
      )}
    </dl>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : undefined}>{value}</dd>
    </div>
  );
}
