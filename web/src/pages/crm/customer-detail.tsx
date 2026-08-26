/**
 * Chi tiết Khách hàng — dựng bằng primitive `EntityDetail` ("Hồ sơ 360°").
 *
 * Tab Lịch sử được primitive tự thêm vào cuối; panel bên phải hiển thị hồ sơ liên quan
 * ở module KHÁC (Webapp Flow 5.1) — hiện còn trống vì hợp đồng thuộc Phase 2D. Cơ hội kinh
 * doanh và khiếu nại cùng thuộc CRM nên nằm ở tab, không nằm ở panel.
 *
 * Nút "Chỉnh sửa" chỉ hiện khi người dùng thật sự sửa được — điều kiện khớp đúng policy
 * `customers_update` (Webapp Flow 6.5).
 */

import { Link, useParams } from 'react-router-dom';
import {
  BUTTONS,
  COMPLAINT_SEVERITY_LABELS,
  OPPORTUNITY_STAGE_META,
  complaintDisplayStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
} from '@nvg/shared';
import { DetailFields, EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { EmptyState, ErrorState, CardGridSkeleton } from '@/components/ui/states';
import { useComplaints } from '@/hooks/use-complaints';
import { useEntityDetail } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';
import { useOpportunities } from '@/hooks/use-opportunities';
import { useCan, useIsResponsible } from '@/lib/auth';

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  source: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  needs: string | null;
  notes: string | null;
  responsible_user_id: string | null;
  created_at: string;
  updated_at: string;
  responsible: { full_name: string } | null;
}

const EM_DASH = '—';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEditModule = useCan('CRM', 'edit');

  // Cả hai truy vấn đều lọc theo pháp nhân đang chọn, còn khách hàng là bảng DÙNG CHUNG
  // (Backend Schema 2.2): một khách của NVC có thể có cơ hội ở NVO mà người này không thấy.
  // Đó là hành vi đúng — đổi pháp nhân ở thanh bên là thấy phần còn lại.
  const { data: opportunities } = useOpportunities();
  const { data: complaints } = useComplaints({ customerId: id });

  const { data, isLoading, error } = useEntityDetail<CustomerDetail>({
    table: 'customers',
    id,
    select:
      'id, code, name, source, contact_person, phone, email, address, tax_code, needs, notes, responsible_user_id, created_at, updated_at, responsible:users!customers_responsible_user_id_users_id_fk(full_name)',
  });

  // Hồ sơ chưa có người chịu trách nhiệm thì ai sửa được module CRM cũng nhận được —
  // giống `customers_update`, để hồ sơ vô chủ không nằm đó không ai đụng vào được.
  const isResponsible = useIsResponsible(data?.responsible_user_id);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <EmptyState message="Không tìm thấy hồ sơ khách hàng này. Có thể hồ sơ đã được xóa hoặc vai trò hiện tại chưa được cấp quyền xem." />
    );
  }

  const customerOpportunities = (opportunities ?? []).filter((o) => o.customer?.id === data.id);
  const canEdit = canEditModule && (isResponsible || data.responsible_user_id === null);

  return (
    <EntityDetail
      breadcrumbs={[
        { label: 'Khách hàng & Cơ hội' },
        { label: 'Khách hàng', to: '/crm/khach-hang' },
        { label: data.name },
      ]}
      title={data.name}
      code={data.code}
      status="in_progress"
      responsiblePerson={data.responsible?.full_name ?? null}
      actions={
        canEdit ? (
          <Button variant="secondary" asChild>
            <Link to={`/crm/khach-hang/${data.id}/chinh-sua`}>{BUTTONS.edit}</Link>
          </Button>
        ) : undefined
      }
      tabs={[
        {
          id: 'tong-quan',
          label: 'Tổng quan',
          content: (
            <DetailFields
              fields={[
                { label: 'Người liên hệ', value: data.contact_person ?? EM_DASH },
                { label: 'Điện thoại', value: formatPhone(data.phone) || EM_DASH },
                { label: 'Email', value: data.email ?? EM_DASH },
                { label: 'Nguồn khách', value: data.source ?? EM_DASH },
                { label: 'Mã số thuế', value: data.tax_code ?? EM_DASH },
                { label: 'Địa chỉ', value: data.address ?? EM_DASH },
                { label: 'Nhu cầu', value: data.needs ?? EM_DASH },
                { label: 'Ghi chú', value: data.notes ?? EM_DASH },
              ]}
            />
          ),
        },
        {
          id: 'co-hoi',
          label: 'Cơ hội kinh doanh',
          badge: customerOpportunities.length,
          content:
            customerOpportunities.length === 0 ? (
              <EmptyState message="Chưa có cơ hội kinh doanh nào gắn với khách hàng này ở pháp nhân đang chọn." />
            ) : (
              <ul className="space-y-2">
                {customerOpportunities.map((o) => {
                  const meta = OPPORTUNITY_STAGE_META[o.stage];
                  return (
                    <li key={o.id} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link to={`/crm/co-hoi/${o.id}`} className="font-medium text-brand hover:underline">
                          {o.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="text-fg-subtle">{meta.label}</span>
                          <StatusLozenge status={meta.statusGroup} />
                        </div>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                        <span className="font-mono">{o.code}</span>
                        {o.estimated_value != null && <span>{formatCurrency(o.estimated_value)}</span>}
                        {o.owner?.full_name && <span>{o.owner.full_name}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ),
        },
        {
          id: 'khieu-nai',
          label: 'Khiếu nại',
          badge: (complaints ?? []).length,
          content:
            (complaints ?? []).length === 0 ? (
              <EmptyState
                message="Chưa ghi nhận khiếu nại nào từ khách hàng này."
                action={
                  <Button variant="secondary" asChild>
                    <Link to={`/crm/khieu-nai/tao-moi?khach-hang=${data.id}`}>Ghi nhận khiếu nại</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {(complaints ?? []).map((c) => (
                  <li key={c.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/crm/khieu-nai/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.title}
                      </Link>
                      <StatusLozenge
                        status={complaintDisplayStatus(c.status, c.response_due_date)}
                      />
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
                      <span className="font-mono">{c.code}</span>
                      <span>Mức độ {COMPLAINT_SEVERITY_LABELS[c.severity].toLowerCase()}</span>
                      {c.response_due_date && <span>Hạn {formatDate(c.response_due_date)}</span>}
                      {c.assignee?.full_name && <span>{c.assignee.full_name}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            ),
        },
      ]}
      historyContent={
        <DetailFields
          fields={[
            { label: 'Tạo lúc', value: formatDateTime(data.created_at) },
            { label: 'Cập nhật gần nhất', value: formatDateTime(data.updated_at) },
          ]}
        />
      }
      related={[
        {
          title: 'Hồ sơ liên quan',
          records: [],
        },
      ]}
    />
  );
}
