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

import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WaitingOn } from '@/components/entity/waiting-on';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { BidReviewsList } from '@/pages/da/bid-reviews-panel';
import { BidParticipationPreview } from './bid-participation-preview';
import { ContractDocumentPreview } from './contract-document-preview';
import { PurchaseQuotationPreview } from './purchase-quotation-preview';
import { PriceMarginPreview } from './price-margin-preview';
import { SurveyReportPreview } from './survey-report-preview';
import { SubcontractSelectionPreview } from './subcontract-selection-preview';
import { PageHeader } from '@/components/layout/app-shell';
import { ApprovalInbox, type ApprovalItem } from '@/components/entity/approval-inbox';
import { StatusLozenge, StatusWithLabel } from '@/components/ui/status-lozenge';
import {
  useApprovalBox,
  useDecideApproval,
  usePendingApprovals,
  type ApprovalBox,
  type PendingApproval,
} from '@/hooks/use-approvals';
import {
  APPROVAL_SUBJECT_LABELS,
  formatCurrency,
  formatDateTime,
  formatDeadline,
  STATUS_GROUPS,
  type StatusGroup,
} from '@nvg/shared';
import { APP_HELP } from '@/lib/help-texts';

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
      // Dự toán cũng vậy: nó là tab Dự toán của Chi tiết Gói thầu (DA-07) hoặc Chi tiết Dự án
      // thiết kế (TK) — parent_module phân biệt hai nguồn vì parent_id cùng kiểu uuid (0094).
      if (!item.parent_id) return '/da/goi-thau';
      return item.parent_module === 'TK'
        ? `/tk/du-an/${item.parent_id}?tab=du-toan`
        : `/da/goi-thau/${item.parent_id}?tab=du-toan`;
    case 'bidding_projects':
      // G6 (0247): quyết định tham gia — khối đánh giá ở tab Tổng quan của gói thầu.
      return `/da/goi-thau/${item.entity_id}?tab=tong-quan`;
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
    case 'site_surveys':
      // Báo cáo khảo sát nằm ở tab Khảo sát của Chi tiết Cơ hội (Đợt 1 — 1D).
      return item.parent_id ? `/crm/co-hoi/${item.parent_id}?tab=khao-sat` : '/crm/co-hoi';
    case 'rental_quotes':
      // G5 (0245): báo giá thuê giàn giáo nằm ở màn hình Báo giá thuê, mở đúng báo giá.
      return `/sx/bao-gia-thue?bao-gia=${item.entity_id}`;
    case 'subcontract_selections':
      // G2 (0246): chọn thầu phụ — trang gói việc có bảng so báo giá.
      return `/tc/chon-thau-phu/${item.entity_id}`;
    case 'internal_rental_requests':
      return '/sx/thue-noi-bo';
    case 'stocktakes':
      // Kiểm kê không có trang theo id — màn hình Kiểm kê liệt kê các đợt đang mở.
      return '/kho/kiem-ke';
    default:
      return '/dashboard';
  }
}

/** Ba ô của hộp thư v2 (màn 1.5) — giữ trên đường dẫn `?o=` để quay lại không mất. */
const BOXES = [
  { id: 'cho-toi', label: 'Chờ tôi duyệt' },
  { id: 'toi-da-gui', label: 'Tôi đã gửi' },
  { id: 'da-xu-ly', label: 'Đã xử lý' },
] as const;
type BoxId = (typeof BOXES)[number]['id'];

export function ApprovalInboxPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('o');
  const box: BoxId = BOXES.some((b) => b.id === raw) ? (raw as BoxId) : 'cho-toi';

  const { data, isLoading, error, refetch } = usePendingApprovals();
  const decide = useDecideApproval();

  const items: ApprovalItem[] | undefined = data?.map((row) => ({
    id: row.id,
    subject: row.subject,
    code: row.entity_code ?? '—',
    title: row.title,
    requestedBy: row.requested_by_name ?? 'Không rõ',
    requestedAt: row.requested_at,
    dueAt: row.due_at,
    amount: row.amount,
    fullRecordPath: fullRecordPath(row),
    preview: <ApprovalPreview row={row} />,
    rejectLabel:
      row.entity_type === 'site_surveys'
        ? 'Trả về kèm ý kiến'
        : row.entity_type === 'bidding_projects'
          ? 'Không tham gia'
          : undefined,
  }));

  return (
    <>
      <PageHeader
        help={APP_HELP.approvalInbox}
        title="Phê duyệt"
        description="Hồ sơ chờ phê duyệt gộp chung từ tất cả module. Hồ sơ do chính mình gửi không nằm ở ô «Chờ tôi duyệt»."
        breadcrumbs={[{ label: 'Phê duyệt' }]}
      />

      <div role="tablist" aria-label="Ô của hộp thư" className="mb-4 flex gap-1.5 overflow-x-auto">
        {BOXES.map((b) => {
          const active = b.id === box;
          const count = b.id === 'cho-toi' ? data?.length : undefined;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (b.id === 'cho-toi') next.delete('o');
                else next.set('o', b.id);
                // Đổi ô thì rời trang của một hồ sơ cụ thể — hồ sơ đó có thể không nằm trong ô mới.
                if (routeId) void navigate({ pathname: '/viec-can-lam', search: next.toString() });
                else setSearchParams(next, { replace: true });
              }}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 whitespace-nowrap',
                active
                  ? 'bg-shell font-semibold text-fg-inverse'
                  : 'bg-surface text-ink hover:bg-pill',
              )}
            >
              {b.label}
              {count ? (
                <span className="rounded-full bg-brand-accent px-1.5 text-xs font-bold text-ink">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {box === 'cho-toi' ? (
        <ApprovalInbox
          items={items}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          initialSelectedId={routeId}
          onSelect={(id) => void navigate(`/viec-can-lam/${id}`, { replace: true })}
          onDecision={async (item, decision, note) => {
            await decide.mutateAsync({ approvalId: item.id, decision, note });
          }}
        />
      ) : (
        <BoxList box={box === 'toi-da-gui' ? 'sent' : 'decided'} />
      )}
    </>
  );
}

const DECISION_LABEL: Record<'approved' | 'rejected', string> = {
  approved: 'Đã duyệt',
  rejected: 'Từ chối / trả về',
};

/** Ô «Tôi đã gửi» / «Đã xử lý» — chỉ xem; hồ sơ đang chờ của mình có «Đang chờ ai» + «Thúc». */
function BoxList({ box }: { box: ApprovalBox }) {
  const { data, isLoading, error, refetch } = useApprovalBox(box);
  if (error) {
    return (
      <ErrorState
        message="Không tải được danh sách. Kiểm tra kết nối mạng rồi thử lại."
        onRetry={() => void refetch()}
        technicalDetail={error.message}
      />
    );
  }
  if (isLoading) return <TableSkeleton rows={5} columns={3} />;
  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-card bg-surface">
        <EmptyState
          message={
            box === 'sent'
              ? 'Chưa gửi hồ sơ nào đi phê duyệt trong 90 ngày qua.'
              : 'Chưa ra quyết định nào trong 90 ngày qua.'
          }
        />
      </div>
    );
  }
  return (
    <ul
      className="space-y-2"
      aria-label={box === 'sent' ? 'Hồ sơ tôi đã gửi' : 'Hồ sơ tôi đã xử lý'}
    >
      {rows.map((row) => {
        const pending = row.status === 'pending_approval';
        const result = box === 'decided' ? row.my_decision : row.final_decision;
        return (
          <li key={row.id} className="rounded-card bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  to={fullRecordPath(row)}
                  className="font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {row.title}
                </Link>
                <div className="mt-0.5 text-xs text-ink-subtle">
                  {APPROVAL_SUBJECT_LABELS[row.subject]} · {row.entity_code ?? '—'}
                  {row.company_code ? ` · ${row.company_code}` : ''}
                </div>
              </div>
              {pending ? (
                <StatusLozenge status="pending_approval" />
              ) : result ? (
                <StatusWithLabel
                  status={result === 'approved' ? 'completed' : 'draft'}
                  label={DECISION_LABEL[result]}
                />
              ) : (
                <StatusLozenge status={toStatusGroup(row.status)} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
              {box === 'sent' ? (
                <span>Gửi lúc {formatDateTime(row.requested_at)}</span>
              ) : (
                <span>Người gửi {row.requested_by_name ?? '—'}</span>
              )}
              {box === 'decided' && row.decided_at && (
                <span>Quyết định lúc {formatDateTime(row.decided_at)}</span>
              )}
              {row.amount !== null && (
                <span className="font-semibold text-ink tabular-nums">
                  {formatCurrency(row.amount)}
                </span>
              )}
            </div>
            {box === 'sent' && pending && (
              <div className="mt-2">
                <WaitingOn approvalId={row.id} canNudge />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function toStatusGroup(status: string): StatusGroup {
  return (STATUS_GROUPS as readonly string[]).includes(status) ? (status as StatusGroup) : 'draft';
}

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
        {/*
          Hạn xử lý chỉ hiện khi Ban Giám đốc đã ban hành cam kết thời hạn cho loại nghiệp vụ
          này (`sla_definitions`, NEN-12). Chưa có thì bỏ hẳn dòng, KHÔNG hiện "Chưa có hạn" —
          một dòng như vậy đọc như lời hứa rằng hệ thống đang theo dõi hạn, mà nó thì không.
        */}
        {row.due_at && <Row label="Hạn xử lý" value={formatDeadline(row.due_at)} strong />}
        <div>
          <dt className="text-xs text-fg-subtle">Trạng thái</dt>
          <dd className="mt-0.5">
            <StatusLozenge status="pending_approval" />
          </dd>
        </div>
      </div>

      {row.entity_type === 'contracts' && <ContractDocumentPreview contractId={row.entity_id} />}
      {/* 0244: giá bán — doanh thu, giá vốn, lợi nhuận, điều kiện thanh toán, rủi ro (Mẫu D do CSDL quyết). */}
      {(row.entity_type === 'quotes' || row.entity_type === 'estimates') && (
        <PriceMarginPreview entityType={row.entity_type} entityId={row.entity_id} />
      )}
      {/* 0247: giá dự thầu đọc cùng ý kiến Cung ứng / Thi công / Kế toán của gói thầu. */}
      {row.entity_type === 'estimates' && row.parent_module !== 'TK' && row.parent_id && (
        <div>
          <dt className="mb-1 text-xs text-fg-subtle">Ý kiến các phòng</dt>
          <dd>
            <BidReviewsList projectId={row.parent_id} showMissing={false} />
          </dd>
        </div>
      )}
      {row.entity_type === 'bidding_projects' && (
        <BidParticipationPreview projectId={row.entity_id} />
      )}
      {/* Đợt 4 — 4B: đề nghị mua kèm bảng so giá nhà cung cấp. */}
      {row.entity_type === 'purchase_requests' && (
        <PurchaseQuotationPreview requestId={row.entity_id} />
      )}
      {/* G2 (0246): chọn thầu phụ kèm bảng so báo giá và ngân sách còn lại. */}
      {row.entity_type === 'subcontract_selections' && (
        <SubcontractSelectionPreview selectionId={row.entity_id} />
      )}
      {row.entity_type === 'site_surveys' ? (
        <SurveyReportPreview surveyId={row.entity_id} />
      ) : (
        row.reason && (
          <div className="rounded-sm bg-surface-sunken px-3 py-2">
            <dt className="text-xs text-fg-subtle">
              {row.subject === 'special_discount' ? 'Lý do giảm giá' : 'Lý do đề nghị'}
            </dt>
            <dd className="mt-0.5">{row.reason}</dd>
          </div>
        )
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
