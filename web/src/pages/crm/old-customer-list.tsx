/**
 * Khách cũ (Đợt 1 — 1F, PRD CRM-07) — mẫu bố cục 2 «Danh sách».
 *
 * Khách đã ký hợp đồng là nguồn khách rẻ nhất: bảo trì, cải tạo, mở rộng, giới thiệu người mới.
 * Mỗi khách × pháp nhân một dòng, xếp khách CHƯA HẸN chăm sóc lên đầu rồi tới ngày hẹn gần nhất
 * — mở ra là biết hôm nay gọi ai. Số ngày chăm sóc định kỳ chưa quyết (câu hỏi 16) nên hệ thống
 * không tự đặt lịch: người phụ trách hẹn trong nhật ký chăm sóc của khách.
 */

import { daysUntil, formatDate, formatPhone } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useOldCustomers } from '@/hooks/use-leads';
import { CrmNav } from './crm-nav';

interface OldCustomerTableRow extends EntityRow {
  customerId: string;
  phone: string;
  lastContract: string;
  lastContact: string;
  nextCare: string;
  referrals: number;
}

export function OldCustomerListPage() {
  const { data, isLoading, error, refetch } = useOldCustomers();

  const rows: OldCustomerTableRow[] = (data ?? []).map((r) => {
    const days = r.next_care_at ? daysUntil(r.next_care_at) : null;
    return {
      // Một khách có thể là khách cũ của nhiều pháp nhân — khoá dòng gồm cả pháp nhân.
      id: `${r.customer_id}-${r.company_id}`,
      customerId: r.customer_id,
      code: r.customer_code,
      title: r.customer_name,
      responsiblePerson: r.responsible_name,
      status:
        r.next_care_at === null ? 'draft' : days !== null && days < 0 ? 'overdue' : 'in_progress',
      deadline: r.next_care_at,
      companyId: r.company_id,
      phone: formatPhone(r.phone) || '—',
      lastContract: r.last_contract_code
        ? `${r.last_contract_code}${r.last_signed_at ? ` · ký ${formatDate(r.last_signed_at)}` : ''}`
        : '—',
      lastContact: r.last_contact_at ? formatDate(r.last_contact_at) : 'Chưa liên hệ lại',
      nextCare: r.next_care_at
        ? (r.next_care_action ?? 'Liên hệ chăm sóc')
        : 'Chưa hẹn — ghi lần liên hệ và hẹn bước tiếp',
      referrals: r.referral_count,
    };
  });

  return (
    <>
      <PageHeader
        title="Khách cũ"
        description="Khách đã ký hợp đồng — chăm sóc định kỳ, bảo trì, cải tạo, xin giới thiệu khách mới."
        breadcrumbs={[{ label: 'Khách hàng & Cơ hội' }, { label: 'Khách cũ' }]}
      />
      <CrmNav />
      <EntityTable
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/crm/khach-hang/${row.customerId}?tab=cham-soc`}
        searchPlaceholder="Tìm theo mã, tên khách…"
        emptyMessage="Chưa có khách nào ký hợp đồng ở pháp nhân này."
        columns={[
          { key: 'phone', header: 'Liên hệ', render: (row) => row.phone },
          { key: 'contract', header: 'Hợp đồng gần nhất', render: (row) => row.lastContract },
          { key: 'last', header: 'Liên hệ gần nhất', render: (row) => row.lastContact },
          { key: 'next', header: 'Chăm sóc tiếp', render: (row) => row.nextCare },
          {
            key: 'ref',
            header: 'Đã giới thiệu',
            render: (row) => (row.referrals > 0 ? `${row.referrals} khách` : '—'),
          },
        ]}
      />
    </>
  );
}
