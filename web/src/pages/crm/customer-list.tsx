/**
 * Danh sách Khách hàng (CRM-01).
 *
 * Toàn bộ màn hình dựng bằng primitive `EntityTable` — đây là phép thử của Phase 1:
 * nếu một màn hình Danh sách còn phải viết bảng, bộ lọc, trạng thái rỗng/tải/lỗi bằng tay
 * thì primitive chưa đạt.
 */

import { BUTTONS, EMPTY_STATES, formatPhone } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CrmNav } from './crm-nav';
import { CreateButton, EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useEntityList } from '@/hooks/use-entity';
import { useCan } from '@/lib/auth';

interface CustomerRecord {
  id: string;
  code: string;
  name: string;
  source: string | null;
  phone: string | null;
  contact_person: string | null;
  created_at: string;
  responsible: { full_name: string } | null;
}

/** Hàng hiển thị, mở rộng từ `EntityRow` để giữ ba cột cố định của Webapp Flow 1.3. */
interface CustomerRow extends EntityRow {
  source: string | null;
  contactPerson: string | null;
  phone: string | null;
}

export function CustomerListPage() {
  // Webapp Flow 6.5: nút không hiển thị nếu không có quyền — KHÔNG hiển thị rồi báo lỗi khi bấm.
  const canCreate = useCan('CRM', 'create');

  const { data, isLoading, error, refetch } = useEntityList<CustomerRecord>({
    table: 'customers',
    // Bảng DÙNG CHUNG giữa các pháp nhân — không lọc theo company_id (Backend Schema 2.2).
    scopedByCompany: false,
    select: 'id, code, name, source, phone, contact_person, created_at, responsible:users!customers_responsible_user_id_users_id_fk(full_name)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const rows: CustomerRow[] = (data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    title: c.name,
    responsiblePerson: c.responsible?.full_name ?? null,
    // Hồ sơ khách hàng không có luồng phê duyệt nên luôn ở trạng thái đang xử lý.
    status: 'in_progress',
    deadline: null,
    source: c.source,
    contactPerson: c.contact_person,
    phone: c.phone,
  }));

  const createLabel = BUTTONS.create('khách hàng');
  const createButton = canCreate ? (
    <CreateButton label={createLabel} to="/crm/khach-hang/tao-moi" />
  ) : undefined;
  const emptyStateButton = canCreate ? (
    <CreateButton label={createLabel} to="/crm/khach-hang/tao-moi" variant="secondary" />
  ) : undefined;
  const isEmpty = !isLoading && !error && rows.length === 0;

  return (
    <>
      <CrmNav />
      <PageHeader
        title="Khách hàng"
        breadcrumbs={[{ label: 'Khách hàng & Cơ hội' }, { label: 'Khách hàng' }]}
        // Trạng thái rỗng đã có nút tạo mới; không lặp lại ở header để giữ đúng
        // "DUY NHẤT một hành động chính trên mỗi màn hình" (Content Guidelines 6.3).
        actions={isEmpty ? undefined : createButton}
      />

      <EntityTable<CustomerRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/crm/khach-hang/${row.id}`}
        searchPlaceholder="Tìm theo tên, mã hoặc người chịu trách nhiệm…"
        emptyMessage={
          canCreate
            ? EMPTY_STATES.list('khách hàng', createLabel)
            : 'Chưa có khách hàng nào. Vai trò hiện tại không có quyền tạo hồ sơ khách hàng.'
        }
        emptyAction={emptyStateButton}
        columns={[
          {
            key: 'contact',
            header: 'Người liên hệ',
            render: (r) => r.contactPerson ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'phone',
            header: 'Điện thoại',
            // Cùng một cách định dạng ở mọi nơi (Content Guidelines 2.1 và 4.3).
            render: (r) => formatPhone(r.phone) || <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'source',
            header: 'Nguồn khách',
            render: (r) => r.source ?? <span className="text-fg-subtle">—</span>,
          },
        ]}
      />
    </>
  );
}
