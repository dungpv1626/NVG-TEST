/**
 * Danh sách Đầu mối (Đợt 1 — 1A) — mẫu bố cục 2 «Danh sách».
 *
 * Mặc định chỉ hiện đầu mối ĐANG THEO DÕI (Mới, Đã liên hệ, M1 Lưu trữ), sắp theo ngày hẹn —
 * mở ra là biết hôm nay gọi ai. Quá ngày hẹn thì nhãn Quá hạn (`leadDisplayStatus`).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BUTTONS,
  LEAD_STATUSES,
  LEAD_STATUS_META,
  formatPhone,
  isLeadOpen,
  leadDisplayStatus,
  type LeadStatus,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EntityTable, useCreateActions, type EntityRow } from '@/components/entity/entity-table';
import { useLeads } from '@/hooks/use-leads';
import { useCan, useIsOrgManager } from '@/lib/auth';
import { CrmNav } from './crm-nav';

interface LeadRow extends EntityRow {
  phone: string;
  source: string;
  nextAction: string;
  statusLabel: string;
}

type StatusFilter = 'dang-theo-doi' | 'tat-ca' | LeadStatus;

export function LeadListPage() {
  const canCreate = useCan('CRM', 'create');
  // Lãnh đạo cũng tạo được đầu mối (policy `leads_insert`).
  const isLeader = useIsOrgManager();
  const [filter, setFilter] = useState<StatusFilter>('dang-theo-doi');
  const { data, isLoading, error, refetch } = useLeads();

  const rows: LeadRow[] = (data ?? [])
    .filter((l) =>
      filter === 'tat-ca'
        ? true
        : filter === 'dang-theo-doi'
          ? isLeadOpen(l.status)
          : l.status === filter,
    )
    .map((l) => ({
      id: l.id,
      code: l.code,
      title: l.full_name,
      responsiblePerson: l.owner?.full_name ?? null,
      status: leadDisplayStatus(l),
      deadline: isLeadOpen(l.status)
        ? l.status === 'luu_tru'
          ? l.recontact_at
          : l.next_action_at
        : null,
      companyId: l.company_id,
      createdAt: l.created_at,
      phone: formatPhone(l.phone) || l.email || '—',
      source: l.source,
      nextAction:
        l.status === 'luu_tru'
          ? 'Liên hệ lại'
          : l.status === 'moi' && !l.next_action
            ? 'Liên hệ lần đầu'
            : (l.next_action ?? '—'),
      statusLabel: LEAD_STATUS_META[l.status].label,
    }));

  const { headerAction, emptyAction } = useCreateActions({
    canCreate: canCreate || isLeader,
    label: BUTTONS.create('đầu mối'),
    to: '/crm/dau-moi/tao-moi',
    isEmpty: !isLoading && !error && rows.length === 0,
  });

  return (
    <>
      <PageHeader
        title="Đầu mối"
        breadcrumbs={[{ label: 'Khách hàng & Cơ hội' }, { label: 'Đầu mối' }]}
        actions={
          canCreate || isLeader ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" asChild>
                <Link to="/crm/dau-moi/nhap-excel">Nhập từ Excel</Link>
              </Button>
              {headerAction}
            </div>
          ) : undefined
        }
      />
      <CrmNav />

      <EntityTable
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/crm/dau-moi/${row.id}`}
        searchPlaceholder="Tìm theo mã, tên hoặc người phụ trách…"
        emptyMessage={
          filter === 'dang-theo-doi'
            ? 'Không có đầu mối nào đang theo dõi. Ghi người vừa gọi tới, data Marketing hay khách được giới thiệu vào đây để không trôi mất.'
            : 'Không có đầu mối nào ở trạng thái này.'
        }
        emptyAction={emptyAction}
        filters={
          <label className="flex items-center gap-2">
            <span className="text-fg-subtle">Tình trạng</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="h-9 rounded-sm border border-border bg-surface px-2"
            >
              <option value="dang-theo-doi">Đang theo dõi</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_META[s].label}
                </option>
              ))}
              <option value="tat-ca">Tất cả</option>
            </select>
          </label>
        }
        columns={[
          { key: 'phone', header: 'Liên hệ', render: (row) => row.phone },
          { key: 'source', header: 'Nguồn', render: (row) => row.source },
          { key: 'next', header: 'Bước tiếp theo', render: (row) => row.nextAction },
          { key: 'stage', header: 'Tình trạng', render: (row) => row.statusLabel },
        ]}
      />
    </>
  );
}
