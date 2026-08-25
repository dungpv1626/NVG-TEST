/**
 * Chi tiết Khách hàng — dựng bằng primitive `EntityDetail` ("Hồ sơ 360°").
 *
 * Tab Lịch sử được primitive tự thêm vào cuối; panel bên phải hiển thị hồ sơ liên quan
 * ở module khác (Webapp Flow 5.1) — hiện mới có khung, sẽ đầy dần khi Phase 2A dựng
 * `opportunities` và Phase 2D dựng `contracts`.
 */

import { useParams } from 'react-router-dom';
import { formatDateTime, formatPhone } from '@nvg/shared';
import { DetailFields, EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, CardGridSkeleton } from '@/components/ui/states';
import { useEntityDetail } from '@/hooks/use-entity';
import { toUserMessage } from '@/hooks/use-error-message';

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
  created_at: string;
  updated_at: string;
  responsible: { full_name: string } | null;
}

const EM_DASH = '—';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useEntityDetail<CustomerDetail>({
    table: 'customers',
    id,
    select:
      'id, code, name, source, contact_person, phone, email, address, tax_code, needs, notes, created_at, updated_at, responsible:users!customers_responsible_user_id_users_id_fk(full_name)',
  });

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <EmptyState message="Không tìm thấy hồ sơ khách hàng này. Có thể hồ sơ đã được xóa hoặc bạn chưa có quyền xem." />
    );
  }

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
      actions={<Button variant="secondary">Chỉnh sửa</Button>}
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
          content: (
            <EmptyState message="Chưa có cơ hội kinh doanh nào gắn với khách hàng này." />
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
