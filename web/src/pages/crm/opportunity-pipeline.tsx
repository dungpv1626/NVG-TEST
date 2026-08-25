/**
 * Pipeline Cơ hội kinh doanh (CRM-02) — mẫu Kanban và mẫu Danh sách, cùng một dữ liệu.
 *
 * Webapp Flow Mục 7 liệt kê hai chế độ xem cho cùng tập cơ hội: "Danh sách Cơ hội kinh doanh"
 * và "Pipeline Cơ hội (Kanban)" — cùng đường dẫn, đổi qua tham số `?che-do=`, để bộ lọc và
 * ngữ cảnh không bị mất khi đổi cách xem.
 */

import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BUTTONS,
  EMPTY_STATES,
  OPPORTUNITY_CLASSIFICATION_LABELS,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_META,
  formatCurrency,
  type MoneyValue,
  type OpportunityClassification,
  type OpportunityStage,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CrmNav } from './crm-nav';
import { CreateButton, EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { KanbanBoard, type KanbanCard } from '@/components/entity/kanban-board';
import { Button } from '@/components/ui/button';
import { useMoveStage, useOpportunities, type OpportunityRecord } from '@/hooks/use-opportunities';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface OpportunityRow extends EntityRow {
  customerName: string;
  stage: OpportunityStage;
  estimatedValue: MoneyValue | null;
}

export function OpportunityPipelinePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('che-do') === 'danh-sach' ? 'danh-sach' : 'kanban';

  const canCreate = useCan('CRM', 'create');
  const canEdit = useCan('CRM', 'edit');

  const { data, isLoading, error, refetch } = useOpportunities();
  const moveStage = useMoveStage();
  const [moveError, setMoveError] = useState<string | null>(null);

  const createLabel = BUTTONS.create('cơ hội');
  const createButton = canCreate ? (
    <CreateButton label={createLabel} to="/crm/co-hoi/tao-moi" />
  ) : undefined;

  function setView(next: 'kanban' | 'danh-sach') {
    const params = new URLSearchParams(searchParams);
    params.set('che-do', next);
    setSearchParams(params, { replace: true });
  }

  /**
   * Chuyển giai đoạn bằng kéo–thả.
   * Giai đoạn "Mất cơ hội" BẮT BUỘC nhập nguyên nhân (CRM-09) — hỏi ngay tại chỗ thay vì
   * để hàm CSDL báo lỗi sau khi người dùng đã thả thẻ.
   */
  async function handleMove(card: KanbanCard, toColumnId: string) {
    setMoveError(null);
    const toStage = toColumnId as OpportunityStage;

    let lostReason: string | undefined;
    if (toStage === 'mat_co_hoi') {
      const input = window.prompt('Nguyên nhân mất cơ hội (bắt buộc):');
      if (input === null || !input.trim()) return false;
      lostReason = input.trim();
    }

    try {
      await moveStage.mutateAsync({ opportunityId: card.id, toStage, lostReason });
      return true;
    } catch (e) {
      setMoveError(toUserMessage(e, 'edit'));
      return false;
    }
  }

  const cards: KanbanCard[] = (data ?? []).map((o) => ({
    id: o.id,
    columnId: o.stage,
    title: o.name,
    code: o.code,
    responsiblePerson: o.owner?.full_name ?? null,
    deadline: o.due_date,
    amount: o.estimated_value,
    detailPath: `/crm/co-hoi/${o.id}`,
    subtitle:
      o.classification && o.stage === 'xac_minh'
        ? OPPORTUNITY_CLASSIFICATION_LABELS[o.classification as OpportunityClassification]
        : (o.customer?.name ?? null),
  }));

  const rows: OpportunityRow[] = (data ?? []).map((o: OpportunityRecord) => ({
    id: o.id,
    code: o.code,
    title: o.name,
    responsiblePerson: o.owner?.full_name ?? null,
    status: OPPORTUNITY_STAGE_META[o.stage].statusGroup,
    deadline: o.due_date,
    customerName: o.customer?.name ?? '—',
    stage: o.stage,
    estimatedValue: o.estimated_value,
  }));

  return (
    <>
      <CrmNav />
      <PageHeader
        title="Cơ hội kinh doanh"
        breadcrumbs={[{ label: 'Khách hàng & Cơ hội' }, { label: 'Cơ hội kinh doanh' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-sm border border-border" role="group" aria-label="Chế độ xem">
              <ViewButton
                active={view === 'kanban'}
                onClick={() => setView('kanban')}
                label="Pipeline"
              >
                <LayoutGrid className="size-4" />
              </ViewButton>
              <ViewButton
                active={view === 'danh-sach'}
                onClick={() => setView('danh-sach')}
                label="Danh sách"
              >
                <List className="size-4" />
              </ViewButton>
            </div>
            {createButton}
          </div>
        }
      />

      {moveError && (
        <p role="alert" className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {moveError}
        </p>
      )}

      {view === 'kanban' ? (
        <KanbanBoard
          columns={OPPORTUNITY_STAGES.map((s) => ({
            id: s,
            label: OPPORTUNITY_STAGE_META[s].label,
            description: OPPORTUNITY_STAGE_META[s].description,
            isTerminal: OPPORTUNITY_STAGE_META[s].isTerminal,
          }))}
          cards={cards}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          onMove={handleMove}
          canMove={canEdit}
          emptyMessage={
            canCreate
              ? EMPTY_STATES.list('cơ hội kinh doanh', createLabel)
              : 'Chưa có cơ hội kinh doanh nào.'
          }
          emptyAction={createButton}
        />
      ) : (
        <EntityTable<OpportunityRow>
          rows={rows}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          detailPath={(row) => `/crm/co-hoi/${row.id}`}
          searchPlaceholder="Tìm theo tên, mã hoặc người chịu trách nhiệm…"
          emptyMessage={
            canCreate
              ? EMPTY_STATES.list('cơ hội kinh doanh', createLabel)
              : 'Chưa có cơ hội kinh doanh nào.'
          }
          emptyAction={createButton}
          columns={[
            { key: 'customer', header: 'Khách hàng', render: (r) => r.customerName },
            {
              key: 'stage',
              header: 'Giai đoạn',
              render: (r) => OPPORTUNITY_STAGE_META[r.stage].label,
            },
            {
              key: 'value',
              header: 'Giá trị dự kiến',
              numeric: true,
              render: (r) =>
                r.estimatedValue ? (
                  formatCurrency(r.estimatedValue)
                ) : (
                  <span className="text-fg-subtle">—</span>
                ),
            },
          ]}
        />
      )}
    </>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="subtle"
      size="sm"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn('rounded-none first:rounded-l-sm last:rounded-r-sm', active && 'bg-brand-subtle text-brand')}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
